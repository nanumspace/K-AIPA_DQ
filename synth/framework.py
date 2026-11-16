# -*- coding: utf-8 -*-
"""
단계 2: 가상데이터 생성 프레임워크 (의뢰사 매뉴얼 2026-11-16 판)

- 명세(spec/kai_cdm_spec.yaml)에서 테이블/컬럼을 읽어, 코호트별로 <TABLE>.csv 를 쓴다(명세에 있는 컬럼만).
- 시드 기반(numpy Generator)이라 같은 시드면 같은 데이터가 나온다.
- 질환별 시나리오 모듈(synth/scenarios/<disease>.py)은 여기의 Ctx 헬퍼만 사용해 환자 여정을 기술한다.
- 규칙 카탈로그(rules/)의 규칙을 "구성상" 만족하도록 헬퍼가 강제한다:
    * 모든 이벤트는 방문(visit) 안에서 발생하고 사망 이후 이벤트는 없다 (SEM-COM-002/003)
    * 약물 종료일 = 시작일 + days_supply - 1 (SEM-COM-005)
    * 항암요법(SACT) 시작/종료일 = 연결 약물의 MIN/MAX, line 번호는 시작일 순서 (SEM-SACT-001/002)
    * 항종양제 투여는 항상 sact_id 로 항암요법에 연결 (SEM-SACT-005)
    * 특화 테이블은 환자당 1행(진단 방문에 매단다)
- 약물 구조식(SMILES)은 NOTE 행으로 싣고 DRUG_EXPOSURE.note_id 가 가리킨다(성분당 NOTE 1행, 환자·날짜·방문은 비움).
- 항암요법: 요법 시작/종료일과 line 번호는 환자 여정이 끝난 뒤 `finalize_person` 이 연결 약물에서 다시 계산한다.
"""
import datetime as dt
import math
import os
import zlib
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

# 성분 SMILES. 항체·펩타이드(pembrolizumab, trastuzumab, bevacizumab, rituximab, brentuximab vedotin,
# insulin glargine, semaglutide, filgrastim, bleomycin)는 단일 SMILES 로 적을 수 없어 NOTE 로 싣지 않는다(note_id 비움).
SMILES = {
    1503297: "CN(C)C(=N)NC(=N)N",                                              # metformin
    1397141: "N.N.Cl[Pt]Cl",                                                   # cisplatin
    1344905: "O=C1O[Pt](N)(N)OC(=O)C12CCC2",                                   # carboplatin
    1304919: "Nc1nc2[nH]cc(CCc3ccc(cc3)C(=O)NC(CCC(=O)O)C(=O)O)c2c(=O)[nH]1",  # pemetrexed
    1378382: "CC1=C2C(C(=O)C3(C(CC4C(C3C(C(C2(C)C)(CC1OC(=O)C(C(C5=CC=CC=C5)NC(=O)C6=CC=CC=C6)O)O)OC(=O)C7=CC=CC=C7)(CO4)OC(=O)C)O)C)OC(=O)C",  # paclitaxel
    1315942: "CC1=C2C(C(=O)C3(C(CC4C(C3C(C(C2(C)C)(CC1OC(=O)C(C(C5=CC=CC=C5)NC(=O)OC(C)(C)C)O)O)OC(=O)C6=CC=CC=C6)(CO4)OC(=O)C)O)C)O",  # docetaxel
    1314924: "NC1=NC(=O)N(C=C1)C1OC(CO)C(O)C1(F)F",                             # gemcitabine
    35604205: "COc1cc(N(C)CCN(C)C)c(NC(=O)C=C)cc1Nc1nccc(-c2cn(C)c3ccccc23)n1",  # osimertinib
    1338512: "COc1cccc2C(=O)c3c(O)c4CC(O)(CC(OC5CC(N)C(O)C(C)O5)c4c(O)c3C(=O)c12)C(=O)CO",  # doxorubicin
    1310317: "ClCCN(CCCl)P1(=O)NCCCO1",                                        # cyclophosphamide
    1436678: "CC/C(=C(\\c1ccccc1)c1ccc(OCCN(C)C)cc1)c1ccccc1",                 # tamoxifen
    1348265: "N#Cc1ccc(C(c2ccc(C#N)cc2)n2cncn2)cc1",                           # letrozole
    1319247: "CC(C)(C#N)c1cc(Cn2cncn2)cc(c1)C(C)(C)C#N",                       # anastrozole
    1320011: "O=C1O[Pt]2(OC1=O)NC1CCCCC1N2",                                   # oxaliplatin
    955632: "O=C1NC(=O)NC=C1F",                                                # fluorouracil
    1337620: "CCCCCOC(=O)Nc1nc(=O)n(C2OC(C)C(O)C2O)cc1F",                       # capecitabine
    1367268: "CCC1=C2CN3C(=CC4=C(C3=O)COC(=O)C4(CC)O)C2=NC5=C1C=C(C=C5)OC(=O)N6CCC(CC6)N7CCCCC7",  # irinotecan
    1308290: "CCC1(CC2CC(C3=C(CCN(C2)C1)C4=CC=CC=C4N3)(C5=C(C=C6C(=C5)C78CCN9C7C(C=CC9)(C(C(C8N6C=O)(C(=O)OC)O)OC(=O)C)CC)OC)C(=O)OC)O",  # vincristine
    19008264: "CCC1(CC2CC(C3=C(CCN(C2)C1)C4=CC=CC=C4N3)(C5=C(C=C6C(=C5)C78CCN9C7C(C=CC9)(C(C(C8N6C)(C(=O)OC)O)OC(=O)C)CC)OC)C(=O)OC)O",  # vinblastine
    1551099: "CC12CC(=O)C3C(C1CCC2(C(=O)CO)O)CCC4=CC(=O)C=CC34C",                # prednisone
    1350504: "CC1OCC2C(O1)C(C(C(O2)OC3C4C(COC4=O)C(C5=CC6=C(C=C35)OCO6)C7=CC(=C(C(=C7)OC)O)OC)O)O",  # etoposide
    1319193: "CN(C)N=NC1=C(NC=N1)C(=O)N",                                      # dacarbazine
    1597756: "CCC1=C(C)CN(C1=O)C(=O)NCCc1ccc(cc1)S(=O)(=O)NC(=O)NC1CCC(C)CC1",  # glimepiride
    1580747: "Fc1cc(F)c(F)cc1CC(N)CC(=O)N1CCn2c(nnc2C(F)(F)F)C1",              # sitagliptin
    45774435: "OCC1OC(c2ccc(Cl)c(Cc3ccc(OC4CCOC4)cc3)c2)C(O)C(O)C1O",          # empagliflozin
    1545958: "CC(C)c1c(C(=O)Nc2ccccc2)c(-c2ccccc2)c(-c2ccc(F)cc2)n1CCC(O)CC(O)CC(=O)O",  # atorvastatin
    1308216: "NCCCCC(NC(CCc1ccccc1)C(=O)O)C(=O)N1CCCC1C(=O)O",                 # lisinopril
    1584910: "CCc1ccc(CCOc2ccc(CC3SC(=O)NC3=O)cc2)nc1",                         # pioglitazone
    1518254: "CC1CC2C3CCC4=CC(=O)C=CC4(C3(C(CC2(C1(C(=O)CO)O)C)O)F)C",          # dexamethasone
    35201159: "Cc1nccn1CC1CCc2c(C1=O)c1ccccc1n2C",                             # ondansetron
}


def regimen_concept(name):
    """요법 이름에서 안정적으로 정해지는 regimen_concept_id (HemOnc 대역 35,8xx,xxx 모사)."""
    return 35800000 + zlib.crc32(name.encode("utf-8")) % 100000


class Person:
    def __init__(self, pid, gender, birth, index_date, care_site=1):
        self.person_id = pid
        self.gender = gender
        self.birth = birth
        self.index_date = index_date
        self.care_site = care_site
        self.death_date = None
        self.visits = []             # (vid, start, end, kind)

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

    def note(self, p, date, text, note_type=44814637, note_class=36716164, vid=None):
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

    def drug(self, p, start, concept, days, vid=None, sact_id=None, dose=None, freq=None, quantity=None,
             interval=None, number=None):
        d = CONCEPTS["drugs"][concept]
        vid = vid or self.visit_on(p, start)
        end = self.days(start, days - 1)
        did = self.nid("DRUG_EXPOSURE")
        dose = d["dose"] if dose is None else dose
        if interval is not None and interval > 1 and number is None:
            number = 1                       # SEM-COM-007: 간격 > 1일이면 횟수 필수
        self.rows["DRUG_EXPOSURE"].append(dict(
            drug_exposure_id=did, visit_occurrence_id=vid, person_id=p.person_id, sact_id=sact_id, note_id=self.smiles_note(concept),
            drug_concept_id=concept,
            drug_exposure_start_date=start, drug_exposure_end_date=end, days_supply=days,
            amount_unit_concept_id=d["unit"], amount_value=dose, quantity=quantity,
            numerator_value=None, numerator_unit_concept_id=None, denominator_value=None, denominator_unit_concept_id=None,
            frequency_per_day=freq, dosing_interval_day=interval, dosing_number=number))
        return did, end

    # ------------------------------------------------------------ 항암요법
    def sact(self, p, regimen, drug_concepts, start, cycles, intent, ecog=None, response=None,
             cycle_days=None, oral=False, inpatient_first=False, drug_days=None):
        """항암요법 1건 + 사이클별 DRUG_EXPOSURE. 반환 (sact_id, end_date, cycle_dates).

        line_of_therapy 와 요법 시작/종료일은 `finalize_person` 이 채운다.
        drug_days: {concept: 일수} 로 약물별 투여일수를 직접 정할 수 있다(기본: 정맥 1일, 경구는 사이클 길이).
        """
        assert self.has_sact
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
                if drug_days and c in drug_days:
                    days = drug_days[c]
                elif oral or dc["route"] == "PO":
                    days = cd if dc["route"] == "PO" else 1
                    days = min(days, cd)
                    if dc["name"] == "prednisone": days = 5
                    if dc["name"] == "capecitabine": days = 14
                else:
                    days = 1
                last = min(self.today, p.death_date) if p.death_date is not None else self.today
                days = min(days, (last - cur).days + 1)
                _, e = self.drug(p, cur, c, days, vid=vid, sact_id=sid, freq=1 if dc["route"] == "PO" else None,
                                 interval=None if dc["route"] == "PO" else cd, number=None if dc["route"] == "PO" else 1)
                ends.append(e)
            cur = self.days(cur, cd)
        assert ends, "SACT 에는 약물이 하나 이상 있어야 한다"
        row = dict(sact_id=sid, person_id=p.person_id, regimen_concept_id=regimen_concept(regimen), regimen_source_value=regimen,
                   regimen_start_date=start, regimen_end_date=max(ends), line_of_therapy=None, number_of_cycles=len(cycle_dates),
                   therapy_intent=intent, ecog_performance_status=ecog, best_overall_response=response,
                   date_of_progression=None, recurrence_anatomic_site=None)
        self.rows["SACT"].append(row)
        self._sact[sid] = row
        return sid, max(ends), cycle_dates

    def sact_update(self, sid, **kw):
        self._sact[sid].update(kw)

    def finalize_person(self, p):
        """요법 시작/종료일을 연결 약물에서, line 번호를 시작일 순서에서 다시 계산하고 PERSON 행을 쓴다."""
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
            for rn, r in enumerate(sorted(mine, key=lambda r: (r["regimen_start_date"], r["sact_id"])), 1):
                r["line_of_therapy"] = rn
                if r["date_of_progression"] is not None and r["date_of_progression"] < r["regimen_start_date"]:
                    r["date_of_progression"] = r["regimen_start_date"]
        self.rows["PERSON"].append(dict(
            person_id=p.person_id, gender_concept_id=p.gender, year_of_birth=p.birth.year, month_of_birth=p.birth.month,
            day_of_birth=p.birth.day, age_at_index=p.age_at_index, care_site_id=p.care_site,
            observation_period_start_date=p.obs_start, death_date=p.death_date))

    # ------------------------------------------------------------ 이상사례
    def ae(self, p, date, concept, grade, vid=None, causality=3, serious=None, outcome=1, action=1):
        vid = vid or self.visit_on(p, date)
        aid = self.nid("ADVERSE_EVENT")
        serious = (grade >= 3) if serious is None else serious
        if grade == 5:
            outcome = 5
        self.rows["ADVERSE_EVENT"].append(dict(
            adverse_event_id=aid, person_id=p.person_id, visit_occurrence_id=vid, adverse_event_concept_id=concept,
            adverse_event_start_date=date, severity_concept_id=grade, causality_concept_id=causality,
            is_serious_yn=1 if serious else 0, seriousness_concept_id=(1 if grade == 5 else 3) if serious else None,
            outcome_concept_id=outcome, action_taken_concept_id=action))
        return aid

    # 하한: AST/ALT 정확히 0, 크레아티닌 0.1 같은 비현실 값을 막는다.
    LAB_FLOOR = {3013721: 8.0, 3006923: 6.0, 3016723: 0.5}
    WBC, ANC = 3010813, 3017732

    def labs(self, p, date, concepts, vid=None, shifts=None):
        """여러 검사를 한 번에. shifts: {concept: shift}. 같은 날 WBC/ANC 는 종속 추출: WBC 를 먼저 뽑고
        ANC = WBC x 호중구 분획(분획 평균은 ANC shift 만큼 낮아짐), 따라서 항상 0.1 <= ANC <= WBC."""
        shifts = shifts or {}
        out = {}
        for c in concepts:
            nd = 2 if c in (3016723, 3004410, 3024128, 3020491) else 1
            if c == self.WBC:
                out[c] = self.lab_value(c, shifts.get(c, 0.0), lo=0.3, nd=nd)
            elif c == self.ANC and self.WBC in concepts:
                continue                                           # WBC 이후 파생
            else:
                out[c] = self.lab_value(c, shifts.get(c, 0.0), lo=self.LAB_FLOOR.get(c), nd=nd)
        if self.ANC in concepts:
            if self.WBC in out:
                frac = self.normal(0.60 + 0.05 * shifts.get(self.ANC, 0.0), 0.10, 0.05, 0.90, 3)
                out[self.ANC] = round(min(out[self.WBC], max(0.1, out[self.WBC] * frac)), 1)
            else:
                out[self.ANC] = self.lab_value(self.ANC, shifts.get(self.ANC, 0.0), lo=0.1)
        for c in concepts:                                         # 요청 순서대로 기록
            self.measure(p, date, c, out[c], vid=vid)
        return {c: out[c] for c in concepts}

    def monitor(self, p, cycle_dates, drugs, ae_p=0.45, labs=(3000963, 3010813, 3017732, 3024929, 3016723, 3013721, 3006923),
                ae_pool=((27674, 0.2), (301794, 0.2), (439777, 0.15), (4223659, 0.15), (196523, 0.1), (4166735, 0.1), (140214, 0.05), (4304213, 0.05))):
        """사이클마다 혈액·신장·간기능, 일부 사이클에 이상사례(+ 같은 날 CONDITION)."""
        concepts = [c for c, _ in ae_pool]
        probs = np.array([w for _, w in ae_pool], dtype=float)
        probs = probs / probs.sum()
        for i, d in enumerate(cycle_dates):
            vid = self.visit_on(p, d)
            shifts = {3017732: -1.5 if i > 0 else 0, 3000963: -1.0 if i > 0 else 0}
            self.labs(p, d, list(labs), vid=vid, shifts=shifts)
            if i > 0 and self.bern(ae_p):
                ae_day = self.days(d, self.randint(3, 12))
                if (p.death_date is not None and ae_day > p.death_date) or ae_day > self.today:
                    continue
                concept = self.choice(concepts, p=probs)
                lo, hi = CONCEPTS["adverse_events"][concept]["typical_grade"]
                grade = self.randint(lo, hi)
                avid = self.visit(p, ae_day, ER if grade >= 3 else OUTPATIENT)
                self.ae(p, ae_day, concept, grade, vid=avid, action=2 if grade >= 3 else 1)
                self.condition(p, ae_day, concept, vid=avid)
                if concept in (301794, 4304213):
                    self.drug(p, ae_day, 1301125, 3, vid=avid, freq=1)       # G-CSF: L03, sact_id 없음
                if concept == 27674 and self.bern(0.4):
                    self.drug(p, ae_day, 1518254, 3, vid=avid, freq=1)       # 구토 대증용 dexamethasone: 항암요법이 아니라 sact_id 없음

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
            cols = [f["name"] for f in SPEC[t]["fields"]]
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
