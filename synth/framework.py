# -*- coding: utf-8 -*-
"""
단계 2: 가상데이터 생성 프레임워크 (의뢰사 매뉴얼 2026-11-16 판)

- 명세(spec/kai_cdm_spec.yaml)에서 테이블/컬럼을 읽어, 코호트별로 <TABLE>.csv 를 쓴다(명세에 있는 컬럼만).
- 시드 기반(numpy Generator)이라 같은 시드면 같은 데이터가 나온다.
- 질환별 시나리오 모듈(synth/scenarios/<disease>.py)은 여기의 Ctx 헬퍼만 사용해 환자 여정을 기술한다.
- 규칙 카탈로그(rules/)의 규칙을 "구성상" 만족하도록 헬퍼가 강제한다:
    * 모든 이벤트는 방문(visit) 안에서 발생하고 사망 이후 이벤트는 없다 (SEM-COM-002/003)
    * 약물 종료일 = 시작일 + days_supply - 1 (SEM-COM-005)
    * 항암요법(SACT) 시작/종료일 = 연결 약물의 MIN/MAX (SEM-SACT-001/002)
    * 항종양제 투여는 항상 sact_id 로 항암요법에 연결 (SEM-SACT-005)
    * 특화 테이블은 환자당 1행(진단 방문에 매단다)
- 약물 구조식(SMILES)은 NOTE 행으로 싣고 DRUG_EXPOSURE.note_id 가 가리킨다(성분당 NOTE 1행, 환자·날짜·방문은 비움).
- 용량: drug()/sact() 의 dose 는 '정규화 용량'(concepts.yaml dose_unit_label 단위: mg/m2, unit/m2, mg/kg, 또는 이미 절대량인 mg/ug/IU).
  mg/m2·unit/m2 는 Mosteller BSA(Mosteller RD, N Engl J Med 1987;317:1098), mg/kg 는 실측 체중으로 절대량(mg, unit)으로 바꿔
  DRUG_EXPOSURE.amount_value 에 쓴다(실제 체중 기준 전량 투여: Griggs JJ et al., J Clin Oncol 2012;30:1553). 신장·체중은 MEASUREMENT 에 기록된
  값만 쓴다. 투여일에 최신 체중(7일 이내)·신장이 없으면 투여일에 '명시적으로' 새로 기록한다(가상 기준값, 조용한 가정 없음).
  같은 항암요법 안에서는 체중이 용량 기준 체중에서 10% 이상 벗어나기 전까지 같은 BSA·체중을 쓴다(기관 관행).
  계산 근거는 NOTE("DOSE-CALC v1")에 남긴다. 형식은 `_calc_line` 의 docstring 참고.
- 항암요법: 요법 시작/종료일은 환자 여정이 끝난 뒤 `finalize_person` 이 연결 약물에서 다시 계산한다. line_of_therapy 는 시나리오가
  `sact(..., line=N)` 또는 `sact_update(sid, line_of_therapy=N)` 으로 명시할 때만 채우고 비워 두면 NULL 이다(방문 시간순으로 자동 부여하지 않는다).
- regimen_concept_id: 요법 표준 코드는 이 프레임워크가 만들지 않는다. 항상 0(No matching concept)이며 요법명은 regimen_source_value 에 그대로 남는다.
"""
import bisect
import datetime as dt
import math
import os
from collections import defaultdict

import numpy as np
import pandas as pd
import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = yaml.safe_load(open(os.path.join(ROOT, "spec/kai_cdm_spec.yaml"), encoding="utf-8"))["tables"]
CONCEPTS = yaml.safe_load(open(os.path.join(ROOT, "spec/concepts.yaml"), encoding="utf-8"))
PROFILES = yaml.safe_load(open(os.path.join(ROOT, "spec/cohort_profiles.yaml"), encoding="utf-8"))["cohorts"]

D = dt.date
EHR = 32817
OUTPATIENT, INPATIENT, ER = 9202, 9201, 9203
MALE, FEMALE = 8507, 8532
SMILES_NOTE_TYPE, SMILES_NOTE_CLASS = 32817, 0      # 표준 분류가 없는 노트(구조식)
HT, WT, BMI = 3036277, 3025315, 3038553             # 신장·체중·BMI (MEASUREMENT concept)
WT_FRESH_DAYS = 7                                      # 투여일 기준 이 일수 안의 체중 기록이 없으면 투여일에 새로 잰다
NOTE_OPD, NOTE_CLASS_ONC = 32834, 3032377           # 용량 계산 NOTE: Outpatient note / Oncology note (codelists 값)
REGIMENS = CONCEPTS["regimens"]                        # regimen_source_value -> HemOnc 표준 개념, null 은 0(No matching concept)

_DRUG_ID = {v["name"]: k for k, v in CONCEPTS["drugs"].items()}


def drug_id(name):
    """concepts.yaml 의 약제 이름(소문자) → concept_id. 시나리오는 concept_id 숫자를 직접 적지 말고 이것을 쓴다."""
    return _DRUG_ID[name]

# 성분 SMILES. 항체·펩타이드(pembrolizumab, durvalumab, trastuzumab, pertuzumab, panitumumab, bevacizumab, rituximab,
# insulin glargine, semaglutide, filgrastim, bleomycin)는 단일 SMILES 로 적을 수 없어 NOTE 로 싣지 않는다(note_id 비움).
SMILES = {
    1503297: "CN(C)C(=N)NC(=N)N",                                              # metformin
    1397599: "N.N.Cl[Pt]Cl",                                                   # cisplatin
    1344905: "O=C1O[Pt](N)(N)OC(=O)C12CCC2",                                   # carboplatin
    1304919: "Nc1nc2[nH]cc(CCc3ccc(cc3)C(=O)NC(CCC(=O)O)C(=O)O)c2c(=O)[nH]1",  # pemetrexed
    1378382: "CC1=C2C(C(=O)C3(C(CC4C(C3C(C(C2(C)C)(CC1OC(=O)C(C(C5=CC=CC=C5)NC(=O)C6=CC=CC=C6)O)O)OC(=O)C7=CC=CC=C7)(CO4)OC(=O)C)O)C)OC(=O)C",  # paclitaxel
    1315942: "CC1=C2C(C(=O)C3(C(CC4C(C3C(C(C2(C)C)(CC1OC(=O)C(C(C5=CC=CC=C5)NC(=O)OC(C)(C)C)O)O)OC(=O)C6=CC=CC=C6)(CO4)OC(=O)C)O)C)O",  # docetaxel
    1314924: "NC1=NC(=O)N(C=C1)C1OC(CO)C(O)C1(F)F",                             # gemcitabine
    35605522: "COc1cc(N(C)CCN(C)C)c(NC(=O)C=C)cc1Nc1nccc(-c2cn(C)c3ccccc23)n1",  # osimertinib
    1338512: "COc1cccc2C(=O)c3c(O)c4CC(O)(CC(OC5CC(N)C(O)C(C)O5)c4c(O)c3C(=O)c12)C(=O)CO",  # doxorubicin
    1310317: "ClCCN(CCCl)P1(=O)NCCCO1",                                        # cyclophosphamide
    1436678: "CC/C(=C(\\c1ccccc1)c1ccc(OCCN(C)C)cc1)c1ccccc1",                 # tamoxifen
    1315946: "N#Cc1ccc(C(c2ccc(C#N)cc2)n2cncn2)cc1",                           # letrozole
    1348265: "CC(C)(C#N)c1cc(Cn2cncn2)cc(c1)C(C)(C)C#N",                       # anastrozole
    1318011: "O=C1O[Pt]2(OC1=O)NC1CCCCC1N2",                                   # oxaliplatin
    955632: "O=C1NC(=O)NC=C1F",                                                # fluorouracil
    1337620: "CCCCCOC(=O)Nc1nc(=O)n(C2OC(C)C(O)C2O)cc1F",                       # capecitabine
    1367268: "CCC1=C2CN3C(=CC4=C(C3=O)COC(=O)C4(CC)O)C2=NC5=C1C=C(C=C5)OC(=O)N6CCC(CC6)N7CCCCC7",  # irinotecan
    1308290: "CCC1(CC2CC(C3=C(CCN(C2)C1)C4=CC=CC=C4N3)(C5=C(C=C6C(=C5)C78CCN9C7C(C=CC9)(C(C(C8N6C=O)(C(=O)OC)O)OC(=O)C)CC)OC)C(=O)OC)O",  # vincristine
    19008264: "CCC1(CC2CC(C3=C(CCN(C2)C1)C4=CC=CC=C4N3)(C5=C(C=C6C(=C5)C78CCN9C7C(C=CC9)(C(C(C8N6C)(C(=O)OC)O)OC(=O)C)CC)OC)C(=O)OC)O",  # vinblastine
    1551099: "CC12CC(=O)C3C(C1CCC2(C(=O)CO)O)CCC4=CC(=O)C=CC34C",                # prednisone
    1350504: "CC1OCC2C(O1)C(C(C(O2)OC3C4C(COC4=O)C(C5=CC6=C(C=C35)OCO6)C7=CC(=C(C(=C7)OC)O)OC)O)O",  # etoposide
    1311409: "CN(C)N=NC1=C(NC=N1)C(=O)N",                                      # dacarbazine
    1597756: "CCC1=C(C)CN(C1=O)C(=O)NCCc1ccc(cc1)S(=O)(=O)NC(=O)NC1CCC(C)CC1",  # glimepiride
    1580747: "Fc1cc(F)c(F)cc1CC(N)CC(=O)N1CCn2c(nnc2C(F)(F)F)C1",              # sitagliptin
    45774751: "OCC1OC(c2ccc(Cl)c(Cc3ccc(OC4CCOC4)cc3)c2)C(O)C(O)C1O",          # empagliflozin
    1545958: "CC(C)c1c(C(=O)Nc2ccccc2)c(-c2ccccc2)c(-c2ccc(F)cc2)n1CCC(O)CC(O)CC(=O)O",  # atorvastatin
    1308216: "NCCCCC(NC(CCc1ccccc1)C(=O)O)C(=O)N1CCCC1C(=O)O",                 # lisinopril
    1525215: "CCc1ccc(CCOc2ccc(CC3SC(=O)NC3=O)cc2)nc1",                         # pioglitazone
    1518254: "CC1CC2C3CCC4=CC(=O)C=CC4(C3(C(CC2(C1(C(=O)CO)O)C)O)F)C",          # dexamethasone
    1000560: "Cc1nccn1CC1CCc2c(C1=O)c1ccccc1n2C",                             # ondansetron
    1388796: "C1C(N(C2=C(N1)N=C(NC2=O)N)C=O)CNC3=CC=C(C=C3)C(=O)NC(CCC(=O)O)C(=O)O",  # leucovorin
    45892075: "CC(=O)C1=C(C)C2=CN=C(Nc3ccc(cn3)N3CCNCC3)N=C2N(C2CCCC2)C1=O",   # palbociclib
}


# regimen_concept_id 는 spec/concepts.yaml 의 regimens 표에서 찾는다. 표에 없는 요법 이름은 오류로 멈춘다(빠뜨린 매핑을 0 으로 숨기지 않는다).


class Person:
    def __init__(self, pid, gender, birth, index_date, care_site=1):
        self.person_id = pid
        self.gender = gender
        self.birth = birth
        self.index_date = index_date
        self.care_site = care_site
        self.death_date = None
        self.visits = []             # (vid, start, end, kind)
        self.ht = []                 # [(date, cm)] 기록된 신장(날짜순)
        self.wt = []                 # [(date, kg)] 기록된 체중(날짜순)
        self.lab_base = {}           # concept -> 환자별 기준값(첫 측정 때 뽑음)
        self.lab_state = {}          # concept -> (마지막 측정일, 기준값에서의 편차)
        self.lab_z = {}              # 상관 검사군(AST/ALT)의 공통 요인
        self.neut_frac = None        # 환자별 호중구 분획(ANC/WBC) 기준값

    @property
    def age_at_index(self):
        return self.index_date.year - self.birth.year - ((self.index_date.month, self.index_date.day) < (self.birth.month, self.birth.day))

    def age_on(self, d):
        return d.year - self.birth.year - ((d.month, d.day) < (self.birth.month, self.birth.day))


class Ctx:
    def __init__(self, cohort, seed=20260907, id_base=None):
        self.cohort = cohort
        self.profile = PROFILES[cohort]
        self.tables = list(self.profile["tables"])
        self.disease = [t for t in self.tables if SPEC[t]["category"] == "disease"][0]
        self.disease_pk = SPEC[self.disease]["pk"]
        self.has_sact = "SACT" in self.tables
        self.rng = np.random.default_rng(seed)
        base = id_base if id_base is not None else (list(PROFILES).index(cohort) + 1) * 100000
        self.ids = defaultdict(lambda: base)
        self.rows = {t: [] for t in self.tables}
        self.persons = []
        self.today = D(2026, 9, 1)
        self._sact = {}
        self._smiles_note = {}               # drug_concept_id -> NOTE.note_id
        self._sact_cycles = {}               # sact_id -> sact() 가 돌려준 cycle_dates 리스트(같은 객체)
        self._sact_dids = defaultdict(list)  # sact_id -> [drug_exposure_id]
        self._dmeta = {}                     # drug_exposure_id -> 용량 계산 메타(정규화 용량, 기준 체중, 감량 단계 ...)
        self._drow = {}                      # drug_exposure_id -> DRUG_EXPOSURE 행(dict)
        self._basis = {}                     # (person_id, sact_id) -> (신장, 체중, 신장 측정일, 체중 측정일)
        self._last_dose = {}                 # (person_id, concept) -> 마지막 투여 시작일
        self._calc_notes = {}                # (person_id, 날짜, sact_id, visit) -> 용량 계산 NOTE 기록
        self._fw_mids = set()                # 프레임워크가 기록한 체중·신장·BMI measurement_id

    # ------------------------------------------------------------ utilities
    def nid(self, table):
        self.ids[table] += 1
        return self.ids[table]

    def choice(self, seq, p=None):
        idx = self.rng.choice(len(seq), p=p)
        return seq[idx]

    def rand(self, lo, hi):
        return float(self.rng.uniform(lo, hi))

    def randint(self, lo, hi):
        return int(self.rng.integers(lo, hi + 1))

    def normal(self, mean, sd, lo=None, hi=None, nd=1):
        v = float(self.rng.normal(mean, sd))
        if lo is not None: v = max(lo, v)
        if hi is not None: v = min(hi, v)
        return round(v, nd)

    def bern(self, p):
        return bool(self.rng.random() < p)

    def days(self, d, n):
        return d + dt.timedelta(days=int(n))

    # -------------------------------------------------------------- person
    def person(self, gender, age_at_index, index_date, obs_years_before=None):
        pid = self.nid("PERSON")
        birth_year = index_date.year - age_at_index
        birth = D(birth_year, self.randint(1, 12), self.randint(1, 28))
        if (index_date.month, index_date.day) < (birth.month, birth.day):
            birth = D(birth_year - 1, birth.month, birth.day)
        p = Person(pid, gender, birth, index_date)
        oy = obs_years_before if obs_years_before is not None else self.randint(0, 3)
        p.obs_start = self.days(index_date, -365 * oy - self.randint(0, 300))
        self.persons.append(p)
        return p

    def set_death(self, p, date):
        p.death_date = date

    # --------------------------------------------------------------- visits
    def visit(self, p, start, kind=OUTPATIENT, los=0):
        """방문 생성. 입원은 los 일 만큼 (end = start + los). 입원 중첩은 호출자가 피한다."""
        assert p.death_date is None or start <= p.death_date, f"visit after death {p.person_id}"
        end = self.days(start, los) if kind == INPATIENT else start
        if p.death_date is not None and end > p.death_date:
            end = p.death_date
        vid = self.nid("VISIT_OCCURRENCE")
        self.rows["VISIT_OCCURRENCE"].append(dict(visit_occurrence_id=vid, person_id=p.person_id, visit_concept_id=kind,
                                                  visit_start_date=start, visit_end_date=end, visit_type_concept_id=EHR))
        p.visits.append((vid, start, end, kind))
        return vid

    def visit_on(self, p, date):
        """해당 날짜를 포함하는 기존 방문이 있으면 재사용, 없으면 외래 방문 생성."""
        for vid, s, e, k in p.visits:
            if s <= date <= e:
                return vid
        return self.visit(p, date, OUTPATIENT)

    # --------------------------------------------------------------- events
    def condition(self, p, date, concept, vid=None, type_concept=EHR):
        vid = vid or self.visit_on(p, date)
        cid = self.nid("CONDITION_OCCURRENCE")
        self.rows["CONDITION_OCCURRENCE"].append(dict(condition_occurrence_id=cid, visit_occurrence_id=vid, person_id=p.person_id,
                                                      condition_concept_id=concept, condition_start_date=date, condition_type_concept_id=type_concept))
        return cid

    def procedure(self, p, date, concept, vid=None):
        vid = vid or self.visit_on(p, date)
        pid = self.nid("PROCEDURE_OCCURRENCE")
        self.rows["PROCEDURE_OCCURRENCE"].append(dict(procedure_occurrence_id=pid, visit_occurrence_id=vid, person_id=p.person_id,
                                                      procedure_concept_id=concept, procedure_date=date, procedure_type_concept_id=EHR))
        return pid

    def measure(self, p, date, concept, value, vid=None, value_concept=None, unit=None):
        m = CONCEPTS["measurements"][concept]
        vid = vid or self.visit_on(p, date)
        mid = self.nid("MEASUREMENT")
        self.rows["MEASUREMENT"].append(dict(
            measurement_id=mid, visit_occurrence_id=vid, person_id=p.person_id, measurement_concept_id=concept, measurement_date=date,
            measurement_type_concept_id=32856, value_as_number=value, value_as_concept_id=value_concept,
            unit_concept_id=unit or m["unit"], range_low=m["normal"][0], range_high=m["normal"][1],
            unit_source_value=m["unit_label"], value_source_value=None if value is None else str(value)))
        if value is not None and concept in (HT, WT):
            bisect.insort(p.ht if concept == HT else p.wt, (date, float(value)))
        return mid

    def lab_value(self, concept, shift=0.0, sd_scale=1.0, lo=None, hi=None, nd=1):
        m = CONCEPTS["measurements"][concept]
        g = m["gen"]
        plo, phi = m["plausible"]
        v = self.normal(g["mean"] + shift, g["sd"] * sd_scale, plo if lo is None else lo, phi if hi is None else hi, nd)
        return v

    def observation(self, p, date, concept, vid=None, value_number=None, value_string=None, unit=None):
        vid = vid or self.visit_on(p, date)
        oid = self.nid("OBSERVATION")
        self.rows["OBSERVATION"].append(dict(observation_id=oid, visit_occurrence_id=vid, person_id=p.person_id, observation_concept_id=concept,
                                             observation_date=date, observation_type_concept_id=EHR, value_as_number=value_number,
                                             value_as_string=None if value_string is None else str(value_string)[:60], unit_concept_id=unit))
        return oid

    def note(self, p, date, text, note_type=32841, note_class=46235057, vid=None):
        vid = vid or self.visit_on(p, date)
        nid = self.nid("NOTE")
        self.rows["NOTE"].append(dict(note_id=nid, visit_occurrence_id=vid, person_id=p.person_id, note_date=date, note_text=text,
                                      note_type_concept_id=note_type, note_class_concept_id=note_class))
        return nid

    # ------------------------------------------------------------------ 약물
    def smiles_note(self, concept):
        """성분의 SMILES NOTE 의 note_id. 코호트에서 처음 쓰일 때 1행 만든다. SMILES 가 없는 성분(항체 등)은 None."""
        if concept not in SMILES:
            return None
        if concept not in self._smiles_note:
            nid = self.nid("NOTE")
            self.rows["NOTE"].append(dict(note_id=nid, visit_occurrence_id=None, person_id=None, note_date=None, note_text=SMILES[concept],
                                          note_type_concept_id=SMILES_NOTE_TYPE, note_class_concept_id=SMILES_NOTE_CLASS))
            self._smiles_note[concept] = nid
        return self._smiles_note[concept]

    # ---------------------------------------------- 신장·체중 기록과 용량 기준
    # 한국 성인 평균을 근사한 가상 기준값(Size Korea·KNHANES 공개 통계의 대략치). 개인 정보가 아니라 가상 환자의 첫 기록을 뽑는 분포이다.
    HEIGHT_KR = {MALE: (172.0, 6.5), FEMALE: (159.5, 5.8)}     # cm (평균, 표준편차)
    BMI_KR = {MALE: (24.3, 3.2), FEMALE: (23.2, 3.5)}          # kg/m2

    @staticmethod
    def _latest(series, date):
        """date 당일까지의 최신 (날짜, 값). 없으면 None."""
        out = None
        for d, v in series:
            if d > date:
                break
            out = (d, v)
        return out

    @staticmethod
    def _nearest(series, date):
        """date 당일까지의 최신 기록, 없으면 date 이후 가장 이른 기록, 둘 다 없으면 None."""
        out = None
        for d, v in series:
            if d > date:
                return out or (d, v)
            out = (d, v)
        return out

    @staticmethod
    def bsa_mosteller(cm, kg):
        return math.sqrt(cm * kg / 3600.0)

    def _limit(self, p):
        return self.today if p.death_date is None else min(self.today, p.death_date)

    def _clamp_days(self, p, start, days):
        return max(1, min(days, (self._limit(p) - start).days + 1))

    def _fw_measure(self, p, date, concept, value, vid):
        mid = self.measure(p, date, concept, value, vid=vid)
        self._fw_mids.add(mid)
        return mid

    def _drift_weight(self, p, ref, date):
        """기록된 체중 ref=(날짜, kg) 에서 date 의 체중을 만든다: 28일당 평균 -0.4%(항암 치료 중 완만한 감소) 추세 + 잡음,
        환자의 첫 기록 체중의 85~108% 안으로 제한."""
        d0, w0 = ref
        months = (date - d0).days / 28.0
        sd = 0.012 * math.sqrt(max(abs(months), 0.25))
        rel = float(self.rng.normal(-0.004 * months, sd))
        first = p.wt[0][1]
        kg = min(1.08 * first, max(0.85 * first, w0 * (1.0 + rel)))
        return round(min(250.0, max(20.0, kg)), 1)

    def anthropometry(self, p, date, vid=None):
        """date 까지 기록된 최신 신장·체중 (신장 cm, 체중 kg, 신장 측정일, 체중 측정일).
        신장 기록이 없거나 체중이 WT_FRESH_DAYS 보다 오래됐으면 date 에 MEASUREMENT 로 새로 기록한 뒤 돌려준다(첫 환자 기록은
        신장·체중·BMI 3건). 시나리오가 이미 기록한 값은 그대로 쓴다."""
        ht = self._latest(p.ht, date)
        wt = self._latest(p.wt, date)
        if ht is not None and wt is not None and (date - wt[0]).days < WT_FRESH_DAYS:
            return ht[1], wt[1], ht[0], wt[0]
        vid = vid or self.visit_on(p, date)
        ref_h = ht or self._nearest(p.ht, date)
        ref_w = wt or self._nearest(p.wt, date)
        sex = p.gender if p.gender in self.HEIGHT_KR else MALE
        bm, bs = self.BMI_KR[sex]
        if ref_h is not None:
            cm = ref_h[1]
        elif ref_w is not None:
            bmi = min(38.0, max(16.0, float(self.rng.normal(bm, bs))))
            cm = round(min(195.0, max(140.0, 100.0 * math.sqrt(ref_w[1] / bmi))), 1)
        else:
            hm, hs = self.HEIGHT_KR[sex]
            cm = round(min(195.0, max(140.0, float(self.rng.normal(hm - 0.15 * max(p.age_on(date) - 50, 0), hs)))), 1)
        if ref_w is not None:
            kg = self._drift_weight(p, ref_w, date)
        else:
            bmi = min(38.0, max(16.0, float(self.rng.normal(bm, bs))))
            kg = round(bmi * (cm / 100.0) ** 2, 1)
        height_date = ht[0] if ht is not None else date
        if ht is None:
            self._fw_measure(p, date, HT, cm, vid)
        self._fw_measure(p, date, WT, kg, vid)
        if ht is None and ref_w is None:
            self._fw_measure(p, date, BMI, round(kg / (cm / 100.0) ** 2, 1), vid)
        return cm, kg, height_date, date

    @staticmethod
    def _is_weighted(d):
        return d["dose_unit_label"] in ("mg/m2", "unit/m2", "mg/kg")

    def _dose_basis(self, p, sact_id, date, vid):
        """BSA·체중 용량 계산 기준 (신장, 체중, 신장 측정일, 체중 측정일). 같은 항암요법 안에서는 체중이 기준 체중에서
        10% 이상 벗어나기 전까지 같은 기준을 재사용한다."""
        cur = self.anthropometry(p, date, vid)
        if sact_id is None:
            return cur
        key = (p.person_id, sact_id)
        b = self._basis.get(key)
        if b is None or abs(cur[1] - b[1]) / b[1] >= 0.10:
            b = self._basis[key] = cur
        return b

    def _absolute(self, concept, norm, basis):
        """정규화 용량 → 절대량(mg 또는 unit). 상한(max_dose_mg)과 반올림 단위(dose_round, 기본 1)를 적용한다."""
        d = CONCEPTS["drugs"][concept]
        label = d["dose_unit_label"]
        if label in ("mg/m2", "unit/m2"):
            amt = norm * self.bsa_mosteller(basis[0], basis[1])
        elif label == "mg/kg":
            amt = norm * basis[1]
        else:
            return norm
        cap = d.get("max_dose_mg")
        if cap is not None:
            amt = min(amt, cap)
        step = d.get("dose_round", 1)
        return round(round(amt / step) * step, 2)

    def _initial_dose(self, p, concept, start):
        """dose 를 주지 않았을 때의 정규화 용량과 부하 여부. loading_dose 가 있는 약(trastuzumab, pertuzumab)은 첫 투여이거나
        직전 투여 후 reload_gap_days 이상이면 부하 용량."""
        d = CONCEPTS["drugs"][concept]
        ld = d.get("loading_dose")
        if ld is not None:
            last = self._last_dose.get((p.person_id, concept))
            if last is None or (start - last).days >= d.get("reload_gap_days", 10 ** 6):
                return ld, True
        return d["dose"], False

    @staticmethod
    def _reduced_norm(d, full, level):
        levels = d.get("reduce_levels")
        if levels and full == d["dose"]:
            return levels[min(level, len(levels) - 1)]
        return round(full * 0.8 ** level, 2)

    # ----------------------------------------------- 용량 계산 NOTE ("DOSE-CALC v1")
    CALC_HEADER = ("DOSE-CALC v1; BSA = Mosteller sqrt(height_cm * weight_kg / 3600); amount_value = normalized_dose * (bsa_m2 for mg/m2 and unit/m2, "
                   "weight_kg for mg/kg), capped and rounded per drug")

    def _calc_line(self, did):
        """용량 계산 한 줄(약물 1건). 키=값 공백 구분, 순서 고정:
        drug_exposure_id=ID drug=이름 drug_concept_id=ID normalized_dose=값 단위 height_cm=값 (measured 날짜) weight_kg=값 (measured 날짜)
        [bsa_m2=값] amount_value=값 mg|unit [loading_dose] [reduced_level=N] [capped_at=상한 mg]
        체중 기반(mg/kg)에는 bsa_m2 가 없다. height/weight 는 용량 기준에 쓴 값이고 같은 값이 MEASUREMENT 에 있다."""
        m, row = self._dmeta[did], self._drow[did]
        d = CONCEPTS["drugs"][m["concept"]]
        b = m["basis"]
        parts = [f"drug_exposure_id={did}", f"drug={d['name']}", f"drug_concept_id={m['concept']}",
                 f"normalized_dose={m['norm']:g} {d['dose_unit_label']}",
                 f"height_cm={b[0]:g} (measured {b[2].isoformat()})", f"weight_kg={b[1]:g} (measured {b[3].isoformat()})"]
        if d["dose_unit_label"] in ("mg/m2", "unit/m2"):
            parts.append(f"bsa_m2={self.bsa_mosteller(b[0], b[1]):.2f}")
        parts.append(f"amount_value={row['amount_value']:g} {'unit' if d['unit'] == 8510 else 'mg'}")
        if m["loading"]:
            parts.append("loading_dose")
        if m["level"]:
            parts.append(f"reduced_level={m['level']}")
        if d.get("max_dose_mg") is not None and row["amount_value"] >= d["max_dose_mg"]:
            parts.append(f"capped_at={d['max_dose_mg']:g} mg")
        return " ".join(parts)

    def _calc_render(self, rec):
        rec["row"]["note_text"] = self.CALC_HEADER + "\n" + "\n".join(rec["lines"].values())

    def _calc_note_attach(self, p, did):
        m, row = self._dmeta[did], self._drow[did]
        key = (p.person_id, row["drug_exposure_start_date"], m["sact"], row["visit_occurrence_id"])
        rec = self._calc_notes.get(key)
        if rec is None:
            self.note(p, row["drug_exposure_start_date"], "", note_type=NOTE_OPD, note_class=NOTE_CLASS_ONC, vid=row["visit_occurrence_id"])
            rec = dict(row=self.rows["NOTE"][-1], lines={})
            self._calc_notes[key] = rec
        rec["lines"][did] = self._calc_line(did)
        m["note_key"] = key
        self._calc_render(rec)

    def _calc_note_detach(self, did):
        key = self._dmeta[did].pop("note_key", None)
        if key is None:
            return
        rec = self._calc_notes[key]
        rec["lines"].pop(did, None)
        if rec["lines"]:
            self._calc_render(rec)
            return
        rows = self.rows["NOTE"]
        for k in range(len(rows) - 1, -1, -1):
            if rows[k] is rec["row"]:
                del rows[k]
                break
        del self._calc_notes[key]

    def _latest_measure(self, p, concept, date):
        """이 환자의 concept 측정 중 date 까지의 최신 (날짜, 값). 환자 행은 테이블 끝에 연속해 있으므로 뒤에서부터 본다."""
        best = None
        for r in reversed(self.rows["MEASUREMENT"]):
            if r["person_id"] != p.person_id:
                break
            if r["measurement_concept_id"] == concept and r["value_as_number"] is not None and r["measurement_date"] <= date:
                if best is None or r["measurement_date"] > best[0]:
                    best = (r["measurement_date"], r["value_as_number"])
        return best

    def calvert_dose(self, p, date, auc, vid=None):
        """carboplatin 절대량(mg) = AUC x (GFR + 25)  (Calvert AH et al., J Clin Oncol 1989;7:1748).
        GFR = Cockcroft-Gault CrCl (mL/min) = (140 - 나이) x 체중(kg) / (72 x SCr), 여성 x 0.85 (Cockcroft DW, Gault MH, Nephron 1976;16:31).
        SCr 하한 0.7 mg/dL (IDMS 보정 크레아티닌에서 GFR 과대추정을 막는 흔한 기관 관행), GFR 상한 125 mL/min (FDA 2010 권고).
        체중은 date 까지의 최신 기록(없으면 anthropometry 가 date 에 기록), 크레아티닌은 date 이전 14일 안의 최신 측정(없으면 date 에
        새로 측정해 기록). 계산 근거를 NOTE 1건("DOSE-CALC v1; method=Calvert")으로 남기고 10 mg 단위로 반올림한 절대량을 돌려준다.
        concepts.yaml 의 carboplatin 은 단위가 mg 라 이 값을 dose_overrides 로(또는 callable 로) 그대로 준다."""
        vid = vid or self.visit_on(p, date)
        cm, kg, hd, wd = self.anthropometry(p, date, vid)
        scr = self._latest_measure(p, 3016723, date)
        if scr is None or (date - scr[0]).days > 14:
            self.labs(p, date, [3016723], vid=vid)
            scr = self._latest_measure(p, 3016723, date)
        scr_used = max(scr[1], 0.7)
        age = p.age_on(date)
        female = p.gender == FEMALE
        crcl = (140 - age) * kg / (72.0 * scr_used) * (0.85 if female else 1.0)
        gfr = min(max(crcl, 0.0), 125.0)
        dose = float(round(auc * (gfr + 25.0) / 10.0) * 10)
        self.note(p, date, f"DOSE-CALC v1; method=Calvert carboplatin: auc={auc:g} scr_mg_dl={scr[1]:g} (measured {scr[0].isoformat()}) "
                           f"scr_used={scr_used:g} (floor 0.7) weight_kg={kg:g} (measured {wd.isoformat()}) age={age} sex={'F' if female else 'M'} "
                           f"crcl_ml_min={crcl:.1f} (Cockcroft-Gault) gfr_used={gfr:.1f} (cap 125) carboplatin_amount_value={dose:g} mg "
                           f"= AUC x (GFR + 25), rounded to 10 mg", note_type=NOTE_OPD, note_class=NOTE_CLASS_ONC, vid=vid)
        return dose

    def drug(self, p, start, concept, days, vid=None, sact_id=None, dose=None, freq=None, quantity=None,
             interval=None, number=None, cycle=None):
        """DRUG_EXPOSURE 1건. dose 는 정규화 용량(concepts.yaml dose_unit_label 단위); 비우면 concepts.yaml 기본값(trastuzumab·pertuzumab 은
        첫 투여·재개 시 부하 용량 자동). mg/m2·unit/m2·mg/kg 약물은 신장·체중 기록(없으면 투여일에 기록)으로 절대량을 계산해
        amount_value 에 쓰고 근거를 NOTE 에 남긴다. 그 밖의 단위는 dose 가 곧 amount_value 이다."""
        d = CONCEPTS["drugs"][concept]
        vid = vid or self.visit_on(p, start)
        end = self.days(start, days - 1)
        did = self.nid("DRUG_EXPOSURE")
        loading = False
        if dose is None:
            dose, loading = self._initial_dose(p, concept, start)
        basis, amount = None, dose
        if self._is_weighted(d):
            basis = self._dose_basis(p, sact_id, start, vid)
            amount = self._absolute(concept, dose, basis)
        if freq is None:
            freq = d.get("freq_per_day")
        if interval is not None and interval > 1 and number is None:
            number = 1                       # SEM-COM-007: 간격 > 1일이면 횟수 필수
        row = dict(
            drug_exposure_id=did, visit_occurrence_id=vid, person_id=p.person_id, sact_id=sact_id, note_id=self.smiles_note(concept),
            drug_concept_id=concept,
            drug_exposure_start_date=start, drug_exposure_end_date=end, days_supply=days,
            amount_unit_concept_id=d["unit"], amount_value=amount, quantity=quantity,
            numerator_value=None, numerator_unit_concept_id=None, denominator_value=None, denominator_unit_concept_id=None,
            frequency_per_day=freq, dosing_interval_day=interval, dosing_number=number)
        self.rows["DRUG_EXPOSURE"].append(row)
        self._drow[did] = row
        self._dmeta[did] = dict(concept=concept, sact=sact_id, cycle=cycle, full=dose, norm=dose, level=0, basis=basis, loading=loading, vid0=vid)
        if sact_id is not None:
            self._sact_dids[sact_id].append(did)
        key = (p.person_id, concept)
        self._last_dose[key] = max(self._last_dose.get(key, start), start)
        if basis is not None:
            self._calc_note_attach(p, did)
        return did, end

    # ------------------------------------------------------------ 항암요법
    def sact(self, p, regimen, drug_concepts, start, cycles, intent, ecog=None, response=None,
             cycle_days=None, oral=False, inpatient_first=False, drug_days=None, dose_overrides=None, line=None):
        """항암요법 1건 + 사이클별 DRUG_EXPOSURE. 반환 (sact_id, end_date, cycle_dates).

        요법 시작/종료일은 `finalize_person` 이 연결 약물에서 다시 계산한다(`monitor` 가 이상사례로 일정을 바꾸면 달라질 수 있다).
        drug_days: {concept: 일수} 로 약물별 투여일수를 직접 정할 수 있다(기본: 정맥 1일, 경구는 concepts.yaml course_days 또는 사이클 길이).
        dose_overrides: {concept: 정규화 용량} — concepts.yaml 의 dose_unit_label 단위. 값은 숫자(모든 사이클), 리스트/튜플(사이클 순서,
          마지막 값 반복), 또는 callable(date, visit_id) -> 용량(사이클마다 호출, 예: carboplatin 은 lambda d, v: ctx.calvert_dose(p, d, 5, v)).
          요법마다 다른 용량은 기본값이 아니라 이것으로 지정한다.
        line: 임상적으로 명시된 치료 line(1~20). 비우면 line_of_therapy 는 NULL (시간순 자동 부여 없음).
        regimen_concept_id 는 항상 0(표준 코드 없음)이고 요법명은 regimen_source_value 이다.
        """
        assert self.has_sact
        if line is not None:
            assert isinstance(line, int) and 1 <= line <= 20, f"line_of_therapy 는 1~20 정수여야 한다: {line}"
        dose_overrides = dose_overrides or {}
        assert set(dose_overrides) <= set(drug_concepts), "dose_overrides 의 키는 drug_concepts 에 있는 concept 이어야 한다"
        sid = self.nid("SACT")
        cycle_dates, ends = [], []
        cd = cycle_days or max(CONCEPTS["drugs"][c]["cycle_days"] or 21 for c in drug_concepts)
        cur = start
        for cyc in range(cycles):
            if (p.death_date is not None and cur > p.death_date) or cur > self.today:
                break
            vid = self.visit(p, cur, INPATIENT, los=min(2, (self.today - cur).days)) if (inpatient_first and cyc == 0) else self.visit_on(p, cur)
            cycle_dates.append(cur)
            for c in drug_concepts:
                dc = CONCEPTS["drugs"][c]
                po = dc["route"] == "PO"
                if drug_days and c in drug_days:
                    days = drug_days[c]
                elif oral or po:
                    days = min(dc.get("course_days") or cd, cd) if po else 1
                else:
                    days = 1
                days = min(days, (self._limit(p) - cur).days + 1)
                ov = dose_overrides.get(c)
                if isinstance(ov, (list, tuple)):
                    ov = ov[min(cyc, len(ov) - 1)]
                elif callable(ov):
                    ov = ov(cur, vid)
                _, e = self.drug(p, cur, c, days, vid=vid, sact_id=sid, dose=ov, freq=dc.get("freq_per_day", 1) if po else None,
                                 interval=None if po else cd, number=None if po else 1, cycle=len(cycle_dates) - 1)
                ends.append(e)
            cur = self.days(cur, cd)
        assert ends, "SACT 에는 약물이 하나 이상 있어야 한다"
        if regimen not in REGIMENS:
            raise KeyError(f"spec/concepts.yaml regimens 에 없는 요법: {regimen!r}")
        row = dict(sact_id=sid, person_id=p.person_id, regimen_concept_id=REGIMENS[regimen] or 0, regimen_source_value=regimen,
                   regimen_start_date=start, regimen_end_date=max(ends), line_of_therapy=line, number_of_cycles=len(cycle_dates),
                   therapy_intent=intent, ecog_performance_status=ecog, best_overall_response=response,
                   date_of_progression=None, recurrence_anatomic_site=None)
        self.rows["SACT"].append(row)
        self._sact[sid] = row
        self._sact_cycles[sid] = cycle_dates
        return sid, max(ends), cycle_dates

    def sact_update(self, sid, **kw):
        self._sact[sid].update(kw)

    def regimen_end(self, sid):
        """연결된 약물 노출의 실제 마지막 종료일(monitor 가 휴약·중단으로 일정을 바꾼 뒤의 값)."""
        return max(self._drow[d]["drug_exposure_end_date"] for d in self._sact_dids[sid])

    def finalize_person(self, p):
        """요법 시작/종료일을 연결 약물에서 다시 계산하고 PERSON 행을 쓴다. line_of_therapy 는 시나리오가 명시한 값만 검증한다
        (1~20, 시작일 순서에서 거꾸로 되지 않을 것)."""
        if self.has_sact:
            mine = [r for r in self.rows["SACT"] if r["person_id"] == p.person_id]
            by_sact = defaultdict(list)
            for r in self.rows["DRUG_EXPOSURE"]:
                if r["person_id"] == p.person_id and r["sact_id"] is not None:
                    by_sact[r["sact_id"]].append(r)
            for r in mine:
                drugs = by_sact[r["sact_id"]]
                r["regimen_start_date"] = min(x["drug_exposure_start_date"] for x in drugs)
                r["regimen_end_date"] = max(x["drug_exposure_end_date"] for x in drugs)
                if r["number_of_cycles"] is not None:
                    r["number_of_cycles"] = min(r["number_of_cycles"], 100)
            prev = 0
            for r in sorted(mine, key=lambda r: (r["regimen_start_date"], r["sact_id"])):
                ln = r["line_of_therapy"]
                if ln is not None:
                    if not (isinstance(ln, int) and 1 <= ln <= 20):
                        raise ValueError(f"line_of_therapy 는 1~20 정수여야 한다: sact_id={r['sact_id']} line={ln}")
                    if ln < prev:
                        raise ValueError(f"line_of_therapy 가 시작일 순서와 거꾸로다: person_id={p.person_id} sact_id={r['sact_id']} "
                                         f"line={ln} (앞선 요법의 line={prev})")
                    prev = ln
                if r["date_of_progression"] is not None and r["date_of_progression"] < r["regimen_start_date"]:
                    r["date_of_progression"] = r["regimen_start_date"]
        self.rows["PERSON"].append(dict(
            person_id=p.person_id, gender_concept_id=p.gender, year_of_birth=p.birth.year, month_of_birth=p.birth.month,
            day_of_birth=p.birth.day, age_at_index=p.age_at_index, care_site_id=p.care_site,
            observation_period_start_date=p.obs_start, death_date=p.death_date))

    # ------------------------------------------------------------ 이상사례
    LIFE_THREATENING = {4250734, 46271778, 4329847}      # 발열성 호중구감소증·CRS·심근경색: 4등급이면 생명을 위협

    @staticmethod
    def _visit_kind(p, vid):
        for v in p.visits:
            if v[0] == vid:
                return v[3]
        return None

    def ae(self, p, date, concept, grade, vid=None, causality=3, serious=None, outcome=None, action=1, seriousness=None):
        """이상사례 1건. grade(CTCAE 중증도)와 seriousness(중대성)는 별개다.
        seriousness_concept_id: 5등급=사망(1); seriousness 를 주면 그 값; 그 방문이 입원이면 입원(3)(응급실만 다녀온 것은 입원이 아님);
        4등급 생명 위협 사례(LIFE_THREATENING)는 생명 위협(2); serious=True 만 주면 기타 의학적으로 중요(6); 그 밖에는 중대하지 않음(NULL).
        serious=False 는 중대하지 않음으로 고정. outcome 을 비우면 5등급=사망(5), 14일 이내면 회복 중(2), 그 밖에는 회복(1)."""
        vid = vid or self.visit_on(p, date)
        kind = self._visit_kind(p, vid)
        lt = grade == 4 and concept in self.LIFE_THREATENING
        if grade == 5:
            code = 1
        elif seriousness is not None:
            code = seriousness
        elif serious is False:
            code = None
        elif lt:
            code = 2
        elif kind == INPATIENT:
            code = 3
        elif serious is True:
            code = 6
        else:
            code = None
        if grade == 5:
            outcome = 5
        elif outcome is None:
            outcome = 2 if (self.today - date).days < 14 else 1
        aid = self.nid("ADVERSE_EVENT")
        self.rows["ADVERSE_EVENT"].append(dict(
            adverse_event_id=aid, person_id=p.person_id, visit_occurrence_id=vid, adverse_event_concept_id=concept,
            adverse_event_start_date=date, severity_concept_id=grade, causality_concept_id=causality,
            is_serious_yn=1 if code is not None else 0, seriousness_concept_id=code,
            outcome_concept_id=outcome, action_taken_concept_id=action))
        return aid

    # ------------------------------------------------------------ 검사(종단)
    # 하한: AST/ALT 정확히 0, 크레아티닌 0.1 같은 비현실 값을 막는다.
    LAB_FLOOR = {3013721: 8.0, 3006923: 6.0, 3016723: 0.5}
    WBC, ANC, PLT, HB, CREA, EGFR = 3010813, 3017732, 3024929, 3000963, 3016723, 3049187
    TG, HDL, LDL, TC = 3022192, 3007070, 3028437, 3027114
    LAB_GROUP = {3013721: "hepatic", 3006923: "hepatic"}     # AST·ALT 는 환자 안에서 함께 움직인다(공통 요인, 상관 0.7)
    LAB_TAU_DAYS = 90.0                                      # 환자 안 변동의 자기상관 시간상수(일)

    def _draw_base(self, p, concept):
        """환자의 기준값: gen 분포(+성별 보정, 상관군 공통 요인)에서 한 번 뽑는다."""
        m = CONCEPTS["measurements"][concept]
        g = m["gen"]
        mean = g["mean"]
        off = m.get("sex_offset", 0.0)
        if p.gender == MALE:
            mean += off
        elif p.gender == FEMALE:
            mean -= off
        z = float(self.rng.normal())
        grp = self.LAB_GROUP.get(concept)
        if grp is not None:
            zg = p.lab_z.get(grp)
            if zg is None:
                zg = p.lab_z[grp] = float(self.rng.normal())
            z = 0.7 * zg + math.sqrt(1.0 - 0.49) * z
        plo, phi = m["plausible"]
        return min(phi, max(self.LAB_FLOOR.get(concept, plo), mean + g["sd"] * z))

    def lab_baseline(self, p, concept, value=None):
        """환자의 concept 기준값을 돌려준다. value 를 주면 그 값으로 고정(예: 진단 시점의 HbA1c)하고 이전 변동 상태는 지운다."""
        if value is not None:
            p.lab_base[concept] = float(value)
            p.lab_state.pop(concept, None)
        elif concept not in p.lab_base:
            p.lab_base[concept] = self._draw_base(p, concept)
        return p.lab_base[concept]

    def lab_next(self, p, date, concept, shift=0.0, lo=None, hi=None, nd=1):
        """환자의 기준값 + 시점 간 자기상관 변동(AR(1), 시간상수 LAB_TAU_DAYS, 표준편차 within_sd) + shift 의 측정값(기록은 하지 않는다).
        첫 측정은 기준값 그대로, 같은 날 다시 부르면 같은 편차(같은 값)이다. shift 는 그 시점에만 더하는 값(급성 병리·치료 효과)이라
        환자의 기준값·변동 상태에 남지 않는다."""
        m = CONCEPTS["measurements"][concept]
        g = m["gen"]
        plo, phi = m["plausible"]
        base = p.lab_base.get(concept)
        if base is None:
            base = p.lab_base[concept] = self._draw_base(p, concept)
        st = p.lab_state.get(concept)
        if st is None:
            dev = 0.0
        else:
            w = m.get("within_sd", 0.4 * g["sd"])
            rho = math.exp(-abs((date - st[0]).days) / self.LAB_TAU_DAYS)
            dev = rho * st[1] + math.sqrt(max(0.0, 1.0 - rho * rho)) * float(self.rng.normal(0.0, w))
        p.lab_state[concept] = (date, dev)
        lo = self.LAB_FLOOR.get(concept, plo) if lo is None else lo
        hi = phi if hi is None else hi
        return round(max(lo, min(hi, base + dev + shift)), nd)

    @staticmethod
    def egfr_ckdepi2021(scr, age, female):
        """CKD-EPI 2021 크레아티닌 식 (Inker LA et al., N Engl J Med 2021;385:1737), mL/min/1.73m2."""
        k = 0.7 if female else 0.9
        a = -0.241 if female else -0.302
        return (142.0 * min(scr / k, 1.0) ** a * max(scr / k, 1.0) ** -1.200 * 0.9938 ** max(age, 18)
                * (1.012 if female else 1.0))

    def labs(self, p, date, concepts, vid=None, shifts=None, floors=None):
        """여러 검사를 한 번에(환자별 기준값을 따르는 종단 값, lab_next). shifts: {concept: 그 시점의 가산 병리·치료 효과},
        floors: {concept: 하한}(예: 투여일 호중구 >= 1.0 같은 투여 기준).
        같은 날 WBC/ANC 는 종속: ANC = WBC x 호중구 분획(환자별 기준 분획, ANC shift 는 단위당 분획 0.05 변화), 항상 0.1 <= ANC <= WBC.
        eGFR 은 같은 시점의 크레아티닌에서 CKD-EPI 2021 로 계산(shifts[eGFR] 가산), 총콜레스테롤은 LDL·HDL·TG 가 함께 요청되고 TG < 400 이면
        Friedewald(LDL + HDL + TG/5)."""
        shifts = shifts or {}
        floors = floors or {}
        want = list(concepts)
        out = {}

        def nd(c):
            return 2 if c in (self.CREA, 3004410, 3024128, 3024561) else 1

        def lo(c):
            f = floors.get(c)
            base = self.LAB_FLOOR.get(c, CONCEPTS["measurements"][c]["plausible"][0])
            return base if f is None else max(base, f)

        wbc = None
        if self.WBC in want or self.ANC in want:
            wbc = self.lab_next(p, date, self.WBC, shifts.get(self.WBC, 0.0), lo=max(0.3, floors.get(self.WBC, 0.3)), nd=1)
        if self.ANC in want:
            if p.neut_frac is None:
                p.neut_frac = min(0.78, max(0.40, float(self.rng.normal(0.60, 0.07))))
            frac = min(0.90, max(0.05, p.neut_frac + 0.05 * shifts.get(self.ANC, 0.0) + float(self.rng.normal(0.0, 0.04))))
            anc = round(min(wbc, max(0.1, wbc * frac)), 1)
            if floors.get(self.ANC) is not None and anc < floors[self.ANC]:
                anc = floors[self.ANC]
                wbc = max(wbc, math.ceil(anc / 0.65 * 10) / 10)
            out[self.ANC] = anc
        if self.WBC in want:
            out[self.WBC] = wbc
        for c in want:
            if c in (self.WBC, self.ANC, self.EGFR):
                continue
            if c == self.TC and all(x in want for x in (self.TG, self.HDL, self.LDL)):
                continue
            out[c] = self.lab_next(p, date, c, shifts.get(c, 0.0), lo=lo(c), nd=nd(c))
        if self.TC in want and self.TC not in out:
            if out[self.TG] < 400:
                tc = out[self.LDL] + out[self.HDL] + out[self.TG] / 5.0 + shifts.get(self.TC, 0.0)
                out[self.TC] = round(max(lo(self.TC), tc), 1)
            else:
                out[self.TC] = self.lab_next(p, date, self.TC, shifts.get(self.TC, 0.0), lo=lo(self.TC), nd=1)
        if self.EGFR in want:
            scr = out.get(self.CREA)
            if scr is None:
                scr = self.lab_next(p, date, self.CREA, shifts.get(self.CREA, 0.0), lo=lo(self.CREA), nd=2)
            ev = self.egfr_ckdepi2021(scr, p.age_on(date), p.gender == FEMALE) + shifts.get(self.EGFR, 0.0)
            plo, phi = CONCEPTS["measurements"][self.EGFR]["plausible"]
            out[self.EGFR] = round(min(phi, max(plo, floors.get(self.EGFR, plo), ev)), 1)
        for c in want:                                             # 요청 순서대로 기록
            self.measure(p, date, c, out[c], vid=vid)
        return {c: out[c] for c in want}

    # -------------------------------------------------- 항암 치료 중 모니터링과 이상사례
    TOX = {320073: "myelo", 4250734: "myelo", 439777: "myelo", 432870: "myelo", 31967: "emesis", 441408: "emesis",
           196523: "diarrhea", 4117779: "neuropathy", 140214: "rash", 4055224: "hepatic", 138455: "mucositis"}
    # CTCAE v5.0 검사 기준(단위: ANC·혈소판 10^3/uL, Hb g/dL, ALT 는 ULN(40 U/L) 배수): 이상사례 날 근거 검사값의 범위
    EV_ANC = {1: (1.5, 1.99), 2: (1.0, 1.49), 3: (0.5, 0.99), 4: (0.1, 0.49)}
    EV_HB = {1: (10.0, 11.9), 2: (8.0, 9.9), 3: (6.5, 7.9), 4: (5.0, 6.4)}
    EV_PLT = {1: (75.0, 149.0), 2: (50.0, 74.0), 3: (25.0, 49.0), 4: (5.0, 24.0)}
    EV_ALT = {1: (1.1, 3.0), 2: (3.1, 5.0), 3: (5.1, 20.0), 4: (20.5, 40.0)}

    def _sact_of(self, cycle_dates):
        for sid, lst in self._sact_cycles.items():
            if lst is cycle_dates:
                return sid
        return None

    def _regimen_concepts(self, sid, drugs):
        out = list(dict.fromkeys(drugs))
        for did in self._sact_dids.get(sid, []):
            c = self._dmeta[did]["concept"]
            if c not in out:
                out.append(c)
        return out

    def _index_cycles(self, sid, cycle_dates):
        """사이클 번호가 없는 노출(시나리오가 sact 뒤에 ctx.drug(..., sact_id=sid) 로 더한 행)에 시작일로 사이클 번호를 매긴다."""
        for did in self._sact_dids.get(sid, []):
            m = self._dmeta[did]
            if m["cycle"] is None:
                m["cycle"] = max(bisect.bisect_right(cycle_dates, self._drow[did]["drug_exposure_start_date"]) - 1, 0)

    def _later_ids(self, sid, i):
        return [d for d in self._sact_dids.get(sid, []) if self._dmeta[d]["cycle"] > i]

    def _visit_refs(self, p, vid):
        """vid 를 가리키는 이 환자의 행이 있는가. 환자 행은 각 테이블 끝에 연속해 있다(SMILES NOTE 는 person_id 가 없어 건너뛴다)."""
        for t, rows in self.rows.items():
            if t in ("PERSON", "VISIT_OCCURRENCE"):
                continue
            for r in reversed(rows):
                pid = r.get("person_id")
                if pid is None:
                    continue
                if pid != p.person_id:
                    break
                if r.get("visit_occurrence_id") == vid:
                    return True
        return False

    def _prune_visit(self, p, vid):
        """아무 행도 가리키지 않는 외래 방문을 지운다."""
        for k, v in enumerate(p.visits):
            if v[0] == vid:
                if v[3] != OUTPATIENT or self._visit_refs(p, vid):
                    return False
                del p.visits[k]
                break
        else:
            return False
        rows = self.rows["VISIT_OCCURRENCE"]
        for k in range(len(rows) - 1, -1, -1):
            if rows[k]["visit_occurrence_id"] == vid:
                del rows[k]
                break
        return True

    def _drop_fw_anthro(self, p, vid):
        """vid 에 프레임워크가 기록한 체중을 지운다(그 방문의 투여가 모두 취소됐을 때)."""
        rows = self.rows["MEASUREMENT"]
        for k in range(len(rows) - 1, -1, -1):
            r = rows[k]
            if r["person_id"] != p.person_id:
                break
            if r["visit_occurrence_id"] == vid and r["measurement_id"] in self._fw_mids and r["measurement_concept_id"] == WT:
                p.wt.remove((r["measurement_date"], float(r["value_as_number"])))
                del rows[k]

    def _remove_drugs(self, p, sid, dids):
        """이후 투여를 취소한다(중단·기간 초과). DRUG_EXPOSURE·용량 NOTE 행과, 더 이상 쓰이지 않는 방문·체중 기록을 함께 정리."""
        if not dids:
            return
        gone = set(dids)
        vids = set()
        for d in dids:
            self._calc_note_detach(d)
            vids.add(self._drow[d]["visit_occurrence_id"])
            vids.add(self._dmeta[d]["vid0"])
        rows = self.rows["DRUG_EXPOSURE"]
        rows[:] = [r for r in rows if r["drug_exposure_id"] not in gone]
        vid0s = {self._dmeta[d]["vid0"] for d in dids}
        for d in dids:
            del self._drow[d]
            del self._dmeta[d]
        self._sact_dids[sid] = [d for d in self._sact_dids[sid] if d not in gone]
        for v in vid0s:
            if not any(m["vid0"] == v for m in self._dmeta.values()):
                self._drop_fw_anthro(p, v)
        for v in vids:
            self._prune_visit(p, v)

    def _trim_cycles(self, p, sid, cycle_dates):
        """약물이 하나도 남지 않은 마지막 사이클들을 cycle_dates(호출자와 공유하는 같은 리스트)에서 뺀다."""
        alive = [self._dmeta[d]["cycle"] for d in self._sact_dids[sid]]
        last = max(alive) if alive else 0
        if last + 1 < len(cycle_dates):
            del cycle_dates[last + 1:]
        self._sact[sid]["number_of_cycles"] = len(cycle_dates)

    def _delay_cycles(self, p, sid, cycle_dates, i, alive, delay):
        """i 번째 이후 사이클을 delay 일 미룬다(투여·방문·날짜). 오늘/사망일을 넘는 투여는 취소, 걸치는 투여는 일수를 줄인다."""
        limit = self._limit(p)
        for j in range(i + 1, len(cycle_dates)):
            cycle_dates[j] = self.days(cycle_dates[j], delay)
        drop, old_vids = [], set()
        for did in alive:
            row = self._drow[did]
            new_start = self.days(row["drug_exposure_start_date"], delay)
            if new_start > limit:
                drop.append(did)
                continue
            m = self._dmeta[did]
            self._calc_note_detach(did)
            span = min(row["days_supply"], (limit - new_start).days + 1)
            row["drug_exposure_start_date"] = new_start
            row["days_supply"] = span
            row["drug_exposure_end_date"] = self.days(new_start, span - 1)
            old_vids.add(row["visit_occurrence_id"])
            row["visit_occurrence_id"] = self.visit_on(p, new_start)
            if m["basis"] is not None:
                self._calc_note_attach(p, did)
        self._remove_drugs(p, sid, drop)
        for v in old_vids:
            self._prune_visit(p, v)

    def _apply_plan(self, p, sid, cycle_dates, i, later_ids, reduce_set, withdraw_set, delay):
        """이상사례 대응을 이후 사이클의 실제 DRUG_EXPOSURE(감량·중단·휴약)와 cycle_dates 에 반영한다.
        감량은 약마다 2단계까지, 더 줄일 수 없으면 중단. 반환: 더 줄일 수 없어 중단한 concept 집합."""
        capped = {c for c in reduce_set
                  if any(self._dmeta[d]["level"] >= 2 for d in later_ids if self._dmeta[d]["concept"] == c)}
        reduce_set = set(reduce_set) - capped
        withdraw_set = set(withdraw_set) | capped
        gone = [d for d in later_ids if self._dmeta[d]["concept"] in withdraw_set]
        self._remove_drugs(p, sid, gone)
        gone_set = set(gone)
        alive = [d for d in later_ids if d not in gone_set]
        for did in alive:
            m = self._dmeta[did]
            if m["concept"] in reduce_set:
                d = CONCEPTS["drugs"][m["concept"]]
                m["level"] += 1
                m["norm"] = self._reduced_norm(d, m["full"], m["level"])
                self._drow[did]["amount_value"] = self._absolute(m["concept"], m["norm"], m["basis"]) if m["basis"] is not None else m["norm"]
                if m["basis"] is not None:
                    self._calc_note_attach(p, did)
        if delay:
            self._delay_cycles(p, sid, cycle_dates, i, alive, delay)
        self._trim_cycles(p, sid, cycle_dates)
        return capped

    def _plan_action(self, concept, grade, tox, culprits, later_ids, later_c):
        """이상사례에 대한 약물 조치 계획 (action_taken, 휴약일, 감량 concept, 중단 concept, G-CSF 2차 예방 여부).
        남은 투여가 없으면 해당 없음(5). 1~2등급, 원인 약 없음, 남은 원인 약 없음 → 변화 없음(1).
        3등급 이상: 골수억제는 감량(+4등급·발열성은 1주 휴약) 또는 용량 유지+G-CSF 2차 예방, 빈혈은 지지요법(1), 감량 불가 약은 1주 휴약(3);
        4등급 비혈액 독성은 원인 약 중단(4); 말초신경병증 3등급은 oxaliplatin 중단·그 밖은 감량; 나머지 3등급은 1주 휴약 후 감량(2) 또는 휴약만(3)."""
        none = (set(), set())
        if not later_ids:
            return (5, 0, *none, False)
        if grade < 3 or not culprits or not later_c:
            return (1, 0, *none, False)
        reducible = {c for c in later_c if CONCEPTS["drugs"][c].get("reducible", True)}
        if tox == "myelo":
            if concept == 439777:
                return (1, 0, *none, False)
            if concept in (320073, 4250734) and reducible and self.bern(0.4):
                return (1, 0, *none, True)
            if reducible:
                return (2, 7 if (grade >= 4 or concept == 4250734) else 0, reducible, set(), False)
            return (3, 7, *none, False)
        if grade >= 4:
            return (4, 0, set(), set(later_c), False)
        if tox == "neuropathy":
            ox = {c for c in later_c if CONCEPTS["drugs"][c]["name"] == "oxaliplatin"}
            if ox:
                return (4, 0, set(), ox, False)
            if reducible:
                return (2, 0, reducible, set(), False)
            return (3, 7, *none, False)
        if reducible and self.bern(0.6):
            return (2, 7, reducible, set(), False)
        return (3, 7, *none, False)

    def _ae_visit(self, p, day, concept, grade, tox):
        """이상사례 방문: 3등급 이상은 발열성 호중구감소증·4등급=입원, 구토·설사·점막염=입원 또는 응급실, 골수억제·간독성=외래(검사 이상),
        그 밖=응급실 또는 외래. 이미 입원 중이면 그 입원 방문, 입원은 오늘·기존 입원과 겹치면 응급실로 바꾼다."""
        for vid, s, e, k in p.visits:
            if k == INPATIENT and s <= day <= e:
                return vid
        kind, los = OUTPATIENT, 0
        if grade >= 3:
            if concept == 4250734 or grade >= 4:
                kind, los = INPATIENT, self.randint(4, 8)
            elif tox in ("emesis", "diarrhea", "mucositis"):
                kind, los = (INPATIENT, self.randint(2, 5)) if self.bern(0.5) else (ER, 0)
            elif tox in ("myelo", "hepatic"):
                kind = OUTPATIENT
            elif self.bern(0.4):
                kind = ER
        if kind == INPATIENT:
            los = min(los, (self.today - day).days)
            end = self.days(day, los)
            clash = any(k == INPATIENT and s <= end and day <= e for _, s, e, k in p.visits)
            if los < 1 or clash:
                kind, los = ER, 0
        return self.visit(p, day, kind, los=los)

    def _ae_evidence(self, p, day, vid, concept, grade):
        """이상사례 등급과 맞는 근거 검사(CTCAE v5.0 기준 범위): 호중구감소·발열성 호중구감소=ANC(WBC 는 ANC 이상), 빈혈=Hb, 혈소판감소=혈소판,
        간독성=ALT·AST."""
        if concept in (320073, 4250734):
            lo, hi = self.EV_ANC[grade]
            anc = round(self.rand(lo, hi), 2)
            wbc = max(round(anc / self.rand(0.40, 0.70), 1), math.ceil(anc * 10) / 10, 0.3)
            self.measure(p, day, self.WBC, wbc, vid=vid)
            self.measure(p, day, self.ANC, anc, vid=vid)
        elif concept == 439777:
            lo, hi = self.EV_HB[grade]
            self.measure(p, day, self.HB, round(self.rand(lo, hi), 1), vid=vid)
        elif concept == 432870:
            lo, hi = self.EV_PLT[grade]
            self.measure(p, day, self.PLT, round(self.rand(lo, hi)), vid=vid)
        elif concept == 4055224:
            lo, hi = self.EV_ALT[grade]
            alt = round(self.rand(lo, hi) * 40)
            self.measure(p, day, 3006923, alt, vid=vid)
            self.measure(p, day, 3013721, round(alt * self.rand(0.6, 1.0)), vid=vid)

    def _gcsf(self, p, day, vid, days):
        """filgrastim 5 ug/kg/일 을 300/480 ug 주사기 중 가까운 것으로(Neupogen 라벨), 기록된 최신 체중 기준."""
        w = self._latest(p.wt, day)
        kg = w[1] if w is not None else self.anthropometry(p, day, vid)[1]
        dose = min((300, 480), key=lambda v: abs(v - 5.0 * kg))
        self.drug(p, day, drug_id("filgrastim"), self._clamp_days(p, day, days), vid=vid, freq=1, dose=float(dose))

    def _chemo_ae(self, p, sid, cycle_dates, i, ae_day, pool, regimen):
        concepts = [c for c, _ in pool]
        probs = np.array([w for _, w in pool], dtype=float)
        probs = probs / probs.sum()
        concept = self.choice(concepts, p=probs)
        lo, hi = CONCEPTS["adverse_events"][concept]["typical_grade"]
        gw = np.array([0.55 ** k for k in range(hi - lo + 1)])        # 낮은 등급이 더 흔하다
        gw = gw / gw.sum()
        grade = lo + int(self.rng.choice(len(gw), p=gw))
        tox = self.TOX.get(concept)
        culprits = [c for c in regimen if tox and tox in CONCEPTS["drugs"][c].get("tox", [])]
        later_ids = self._later_ids(sid, i) if sid is not None else []
        later_c = {self._dmeta[d]["concept"] for d in later_ids if self._dmeta[d]["concept"] in culprits}
        action, delay, reduce_set, withdraw_set, gcsf = self._plan_action(concept, grade, tox, culprits, later_ids, later_c)
        if sid is not None and (reduce_set or withdraw_set or delay):
            if self._apply_plan(p, sid, cycle_dates, i, later_ids, reduce_set, withdraw_set, delay):
                action = 4
        avid = self._ae_visit(p, ae_day, concept, grade, tox)
        causality = 2 if culprits else (4 if tox else 3)
        self.ae(p, ae_day, concept, grade, vid=avid, causality=causality, action=action,
                outcome=3 if (tox == "neuropathy" and grade >= 2) else None)
        self.condition(p, ae_day, concept, vid=avid)
        self._ae_evidence(p, ae_day, avid, concept, grade)
        if concept == 4250734 or (concept == 320073 and grade >= 4):
            self._gcsf(p, ae_day, avid, self.randint(3, 5))                 # 치료적 G-CSF: 발열성·4등급 호중구감소
        if tox == "emesis" and grade >= 2:
            self.drug(p, ae_day, drug_id("ondansetron"), self._clamp_days(p, ae_day, 3), vid=avid, freq=2)
            if self.bern(0.7 if grade >= 3 else 0.4):
                self.drug(p, ae_day, drug_id("dexamethasone"), self._clamp_days(p, ae_day, 3), vid=avid, freq=1)
        if gcsf:                                                            # 용량을 유지하는 대신 다음 사이클들에 G-CSF 2차 예방
            for j in range(i + 1, min(len(cycle_dates), i + 5)):
                start = self.days(cycle_dates[j], 2)
                if start > self._limit(p):
                    break
                self._gcsf(p, start, self.visit_on(p, start), 5)

    def monitor(self, p, cycle_dates, drugs, ae_p=0.45, labs=(3000963, 3010813, 3017732, 3024929, 3016723, 3013721, 3006923),
                ae_pool=((31967, 0.2), (320073, 0.2), (439777, 0.15), (4223659, 0.15), (196523, 0.1), (4117779, 0.1), (140214, 0.05), (4250734, 0.05)),
                sact_id=None):
        """사이클마다 혈액·신장·간기능(환자 기준값을 따르는 종단 값, 골수억제 약이 있으면 사이클이 쌓일수록 Hb·혈소판·WBC 가 완만히 감소하되
        투여일에는 호중구 >= 1.0, 혈소판 >= 75, Hb >= 8 투여 기준을 만족), 일부 사이클 뒤 이상사례(+ 같은 날 CONDITION).
        이상사례의 원인 약(concepts.yaml tox)이 요법에 없으면 후보에서 뺀다. 조치(action_taken)는 실제 이후 투여에 반영한다: 감량=이후 노출의
        amount_value 감소, 휴약=이후 사이클 7일 지연, 중단=이후 노출 삭제(cycle_dates 도 같은 리스트에서 줄어든다). 지지요법·근거 검사 포함.
        sact() 가 돌려준 cycle_dates 를 그대로 넘기면 요법을 알아낸다(아니면 sact_id). 반환: 요법의 실제 마지막 노출 종료일.
        시나리오가 sact 뒤에 ctx.drug(..., sact_id=sid) 로 더한 투여도 시작일 기준 사이클에 묶여 같이 조정된다."""
        sid = sact_id if sact_id is not None else self._sact_of(cycle_dates)
        if sid is not None:
            self._index_cycles(sid, cycle_dates)
        regimen = self._regimen_concepts(sid, drugs)
        pool = []
        for c, w in ae_pool:
            tox = self.TOX.get(c)
            if tox is None or any(tox in CONCEPTS["drugs"][r].get("tox", []) for r in regimen):
                pool.append((c, w))
        n_myelo = min(2, sum("myelo" in CONCEPTS["drugs"][r].get("tox", []) for r in regimen))
        i = 0
        while i < len(cycle_dates):
            d = cycle_dates[i]
            vid = self.visit_on(p, d)
            cum = min(i, 6) * n_myelo * 0.5
            shifts = {self.ANC: -0.4 * cum, self.HB: -0.35 * cum, self.PLT: -9.0 * cum, self.WBC: -0.35 * cum}
            floors = {self.ANC: 1.0, self.PLT: 75.0, self.HB: 8.0} if i > 0 else None
            self.labs(p, d, list(labs), vid=vid, shifts=shifts, floors=floors)
            if pool and self.bern(ae_p):
                nxt = cycle_dates[i + 1] if i + 1 < len(cycle_dates) else None
                hi = 12 if nxt is None else max(3, min(12, (nxt - d).days - 1))
                ae_day = self.days(d, self.randint(min(3, hi), hi))
                if not ((p.death_date is not None and ae_day > p.death_date) or ae_day > self.today):
                    self._chemo_ae(p, sid, cycle_dates, i, ae_day, pool, regimen)
            i += 1
        if sid is None:
            return None
        end = self.regimen_end(sid)
        self._sact[sid]["regimen_end_date"] = end
        return end

    # ------------------------------------------------------- 특화 테이블 행
    def disease_row(self, p, vid, **fields):
        """환자당 1행. 만들어진 행(dict)을 돌려주므로 여정 후반에 값을 고칠 수 있다."""
        row = dict(person_id=p.person_id, visit_occurrence_id=vid)
        row.update(fields)
        row[self.disease_pk] = self.nid(self.disease)
        self.rows[self.disease].append(row)
        return row

    # ---------------------------------------------------------------- write
    def write(self, out_dir):
        os.makedirs(out_dir, exist_ok=True)
        for t in self.tables:
            cols = [f["name"] for f in SPEC[t]["fields"] if not f.get("optional")]   # 선택 컬럼은 견본에 넣지 않는다
            rows = self.rows[t]
            df = pd.DataFrame(rows, columns=cols) if rows else pd.DataFrame(columns=cols)
            for c in cols:
                df[c] = df[c].apply(fmt)
            df.to_csv(os.path.join(out_dir, f"{t}.csv"), index=False, encoding="utf-8")
        return {t: len(self.rows[t]) for t in self.tables}


def fmt(v):
    if v is None or v is pd.NaT:
        return ""
    try:
        if not isinstance(v, (str, list, dict, tuple)) and pd.isna(v):
            return ""
    except (TypeError, ValueError):
        pass
    if isinstance(v, float):
        if math.isnan(v):
            return ""
        return f"{v:.4g}" if abs(v) < 1e-3 and v != 0 else (str(int(v)) if v.is_integer() and abs(v) < 1e15 else f"{v:.6g}")
    if isinstance(v, (np.integer,)):
        return str(int(v))
    if isinstance(v, (np.floating,)):
        return fmt(float(v))
    if isinstance(v, (dt.date, dt.datetime)):
        return v.isoformat() if isinstance(v, dt.date) and not isinstance(v, dt.datetime) else v.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(v, bool):
        return "1" if v else "0"
    return str(v)
