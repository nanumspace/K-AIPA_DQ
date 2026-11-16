# -*- coding: utf-8 -*-
"""
림프종 코호트 시나리오. 특화 테이블 LYMPHOMA 는 환자당 1행(진단 입원 방문에 매단다).

아형 구성: DLBCL 45%, 고전적 호지킨 15%, 외투세포 10%, 말초 T세포 NOS 10%, 여포성 10%, 변연부 10%.
  cell_of_origin(필수)은 DLBCL 이면 GCB / ABC/non-GCB / unclassifiable, DLBCL 이 아니면 문자 그대로 NA (SEM-LY-001).
  아형별 선택 항목: MIPI·MIPI-c(외투세포), IPS(호지킨 진행기), PIT(PTCL), double-expressor/double-hit(DLBCL),
  t(14;18)(DLBCL·여포성), t(11;14)(외투세포), MRD·ctDNA(일부).
  아형은 CONDITION_OCCURRENCE 의 진단 concept(DLBCL 4300704 등)과 병리 노트에 남는다(특화 테이블에는 아형 열이 없다).
여정: 진단 입원(5일, 생검·PET·골수검사·심초음파) → 아형별 1차 요법(R-CHOP / ABVD / R-CVP / CHOP) →
      중간·종료 PET → (일부) 리툭시맙 유지 → 재발·불응 시 조직 확인 → 구제요법(R-GDP / GDP) →
      자가이식 / CAR-T / 진행(완화의료)·사망 → 추적.

임상 근거(용량·일정은 아래 표준 프로토콜에 맞췄다. 임상 자문 검수를 받았다는 뜻이 아니다):
  * R-CHOP-21  rituximab 375 mg/m2, cyclophosphamide 750 mg/m2, doxorubicin 50 mg/m2, vincristine 1.4 mg/m2(상한 2 mg),
               모두 1일 + prednisone 100 mg 1~5일, 21일 주기 (Coiffier, NEJM 2002; NCCN B-Cell Lymphomas).
               제한병기 비벌키 DLBCL 은 R-CHOP 4사이클 + ISRT, 방사선 없이는 6사이클(NCCN). ISRT 는 완전관해 후 30~36 Gy.
  * CHOP-21    위에서 rituximab 제외 (말초 T세포 림프종, NCCN T-Cell Lymphomas).
  * R-CVP      rituximab 375, cyclophosphamide 750, vincristine 1.4(상한 2 mg) 1일 + prednisone 100 mg 1~5일, 21일 주기, 6사이클.
  * ABVD       doxorubicin 25, bleomycin 10 unit/m2, vinblastine 6, dacarbazine 375 mg/m2 를 28일 주기의 1일·15일에 투여.
               진행기 6사이클, 조기 불량예후(벌키) 4사이클 + ISRT 30 Gy, 조기 양호예후 2사이클 + ISRT 20 Gy (GHSG HD10/HD11; NCCN Hodgkin).
  * 리툭시맙 유지 375 mg/m2 q8주 (여포성 PRIMA 12회 한도; 외투세포는 R-CHOP 후 유지, Kluin-Nelemans NEJM 2012 - 고령).
  * R-GDP      rituximab 375 mg/m2 1일, gemcitabine 1,000 mg/m2 1일·8일, dexamethasone 40 mg 1~4일, cisplatin 75 mg/m2 1일,
               21일 주기 3사이클 (Crump, J Clin Oncol 2014, NCIC CTG LY.12; eviQ 1615 GDP). 호지킨·PTCL 은 rituximab 없는 GDP.
  * CAR-T 림프구감소 전처치는 fludarabine 30 + cyclophosphamide 500 mg/m2 를 -5~-3일(axicabtagene ciloleucel 허가 사항)에
               투여한다. fludarabine 의 drug concept 이 concepts.yaml 에 없어 DRUG_EXPOSURE 에는 cyclophosphamide 행만 있고,
               요법명(regimen_source_value)에 'RESTRICTED coverage (cyclophosphamide only; fludarabine not coded)' 를 명시한다.
               **이 CAR-T 에피소드는 제한된 coverage 기록이며 완전한 임상 표본이 아니다(대표 예시 선정에서 제외해야 한다).**
               fludarabine 과 CRS 2등급 이상 치료(tocilizumab)는 노트 본문으로만 남고 그렇다고 노트에 적는다.
  * 치료 전 평가·지지요법: HBV 선별(리툭시맙 요법), 안트라사이클린 전 심초음파, CHOP 계열 호중구감소 위험·G-CSF 일차 예방 계획은
               구조화 검사·처치·약물 행이 없어 노트 본문으로만 남기며, 노트에 '구조화 행 없음'을 명시한다(G-CSF 약물 행은 호중구감소
               이상사례 치료에만 있다).
  * line_of_therapy: 1차 1, 리툭시맙 유지 1(1차의 연속), 구제 2, CAR-T 3 을 임상적으로 명시한다. 유지요법이 1차와 같은 line 이라
               SEM-SACT-006(시작일 순서 휴리스틱) 경고가 날 수 있으나 임상 사실을 바꾸지 않는다.
단순화(검수 필요): 여포성·변연부·외투세포의 구제요법 concept 은 R-GDP 뿐이다. 여포성·변연부의 재발은 조직 확인된 대세포 전환으로
  기록하고(R-GDP 가 방어 가능한 경우), 외투세포는 다형성 변이로 기록한다. 80세를 넘는 환자와 R-mini-CHOP 은 생성하지 않는다.
  외투세포는 R-CHOP + 유지가 근거인 고령군(58세 이상)으로만 만든다.
"""
from framework import *

DLBCL, HL, MCL, PTCL, FL, MZL = "DLBCL", "HL", "MCL", "PTCL", "FL", "MZL"
SUBS = [DLBCL, HL, MCL, PTCL, FL, MZL]
SUB_P = [0.45, 0.15, 0.10, 0.10, 0.10, 0.10]
CONDITION = {DLBCL: 4300704, HL: 438090, MCL: 4038836, PTCL: 4038838, FL: 4147411,
             MZL: 4147411}          # 변연부 림프종 전용 개념이 concepts.yaml 에 없어 같은 저등급 B세포 개념(여포성)으로 대용
LABEL = {DLBCL: "Diffuse large B-cell lymphoma", HL: "Classical Hodgkin lymphoma", MCL: "Mantle cell lymphoma",
         PTCL: "Peripheral T-cell lymphoma, NOS", FL: "Follicular lymphoma", MZL: "Marginal zone lymphoma"}
NODAL_SITES = ["cervical lymph node", "axillary lymph node", "mediastinal lymph node", "inguinal lymph node",
               "retroperitoneal lymph node", "abdominal lymph node"]
EXTRANODAL = ["stomach", "bone", "liver", "lung", "skin", "bone marrow", "small intestine", "kidney"]

# 약물 concept 은 이름으로 찾는다(concepts.yaml 의 id 교정에 영향받지 않게).
_DRUG_ID = {v["name"]: k for k, v in CONCEPTS["drugs"].items()}
RTX, CY, DOX, VCR, PRED, BLEO, VBL, DTIC, GEM, DEX, CDDP, GCSF = (
    _DRUG_ID[n] for n in ("rituximab", "cyclophosphamide", "doxorubicin", "vincristine", "prednisone", "bleomycin",
                          "vinblastine", "dacarbazine", "gemcitabine", "dexamethasone", "cisplatin", "filgrastim"))
# 요법 정의: 용량은 concepts.yaml 의 dose_unit_label 단위(mg/m2, bleomycin unit/m2, prednisone·dexamethasone 은 1회 mg).
# extra=(투여일 오프셋, [약물]) 은 사이클 안의 추가 투여일(ABVD 15일, GDP 의 gemcitabine 8일).
REG = {
    "R-CHOP": dict(drugs=[RTX, CY, DOX, VCR, PRED], dose={RTX: 375, CY: 750, DOX: 50, VCR: 1.4, PRED: 100}, cd=21),
    "CHOP": dict(drugs=[CY, DOX, VCR, PRED], dose={CY: 750, DOX: 50, VCR: 1.4, PRED: 100}, cd=21),
    "R-CVP": dict(drugs=[RTX, CY, VCR, PRED], dose={RTX: 375, CY: 750, VCR: 1.4, PRED: 100}, cd=21),
    "ABVD": dict(drugs=[DOX, BLEO, VBL, DTIC], dose={DOX: 25, BLEO: 10, VBL: 6, DTIC: 375}, cd=28,
                 extra=(14, [DOX, BLEO, VBL, DTIC])),
    "R-GDP": dict(drugs=[RTX, GEM, DEX, CDDP], dose={RTX: 375, GEM: 1000, DEX: 40, CDDP: 75}, cd=21,
                  drug_days={DEX: 4}, extra=(7, [GEM])),
    "GDP": dict(drugs=[GEM, DEX, CDDP], dose={GEM: 1000, DEX: 40, CDDP: 75}, cd=21, drug_days={DEX: 4}, extra=(7, [GEM])),
}
RT_FRACTIONS = {20: 10, 30: 15, 36: 18}      # Gy -> 분할 수 (2 Gy/회)
BASE_LABS = [3000963, 3010813, 3017732, 3024929, 3016723, 3013721, 3006923, 3020491, 3024128, 3022250, 3006315]
RESP_OF_DS = {1: "CR", 2: "CR", 3: "CR", 4: "PR", 5: "PD"}

PATH_REPORT = ("Lymph node, {site}, excisional biopsy: {hist}. Immunohistochemistry: {ihc}. Ki-67 {ki67}%. "
               "Specimen adequate for ancillary studies.")
PET_REPORT = ("FDG PET/CT (baseline). Hypermetabolic lymphadenopathy in {n} nodal region{s} including {primary}{dist}, "
              "SUVmax {suv}. {extra} Impression: Lymphoma, Lugano stage {stage}.")
RESP_REPORT = "FDG PET/CT ({tp}). Deauville score {ds}. {resp}."
# DLBCL(Hans 알고리즘, 세포기원과 일치)·외투세포(cyclin D1 은 t(11;14) 결과와 일치)는 _ihc_text 가 만든다.
IHC_TXT = {HL: "CD30 positive, CD15 positive, PAX5 weak positive, CD20 negative",
           PTCL: "CD3 positive, CD4 positive, CD5 partial loss, CD20 negative",
           FL: "CD20 positive, CD10 positive, BCL2 positive, BCL6 positive",
           MZL: "CD20 positive, CD5 negative, CD10 negative, CD23 negative"}
DLBCL_VARIANT = ["Diffuse large B-cell lymphoma, immunoblastic", "T-cell/histiocyte-rich large B-cell lymphoma"]


def generate(ctx: Ctx, n=100):
    for _ in range(n):
        sub = ctx.choice(SUBS, p=SUB_P)
        gender = FEMALE if ctx.bern(0.42) else MALE
        # 80세 초과 환자(R-mini-CHOP 대상)는 만들지 않는다. 외투세포는 R-CHOP + 리툭시맙 유지가 근거인 고령군.
        age = {HL: int(ctx.normal(34, 12, 18, 80, 0)), FL: int(ctx.normal(58, 11, 25, 80, 0)),
               MCL: int(ctx.normal(68, 7, 58, 80, 0))}.get(sub) or int(ctx.normal(64, 11, 22, 80, 0))
        index = D(2019, 1, 1) + dt.timedelta(days=ctx.randint(0, 365 * 6 - 5))
        p = ctx.person(gender, age, index)
        dlbcl, hl, mcl, ptcl, fl, mzl = (sub == s for s in SUBS)
        label = LABEL[sub] if not dlbcl else ctx.choice([LABEL[DLBCL]] + DLBCL_VARIANT, p=[0.92, 0.04, 0.04])

        # ---- 1) 진단 입원 (5일)
        dx_vid = ctx.visit(p, index, INPATIENT, los=5)
        ctx.condition(p, index, CONDITION[sub], vid=dx_vid)
        if ctx.bern(0.3): ctx.condition(p, index, 320128, vid=dx_vid)      # HTN
        if ctx.bern(0.15): ctx.condition(p, index, 201826, vid=dx_vid)     # T2DM
        primary = ctx.choice(NODAL_SITES)
        stage = ctx.choice(["I", "II", "III", "IV"], p=[0.25, 0.35, 0.2, 0.2] if hl else
                           ([0.1, 0.2, 0.3, 0.4] if (fl or mcl or mzl) else [0.15, 0.3, 0.25, 0.3]))
        adv = stage in ("III", "IV")
        bulky = ctx.bern(0.25)
        ecog = ctx.choice([0, 1, 2, 3], p=[0.35, 0.45, 0.15, 0.05])
        ldh0 = ctx.normal(190, 25, 130, 240)          # 관해기 환자 고유 LDH (정상범위 안). 진단 시점 값은 여기에 shift 를 더한 것
        ctx.lab_baseline(p, 3022250, ldh0)
        labs = ctx.labs(p, index, BASE_LABS, vid=dx_vid,
                        shifts={3022250: 150 if (adv and (dlbcl or ptcl)) else (40 if adv else 0), 3006315: 1.0 if adv else 0})
        ht = ctx.normal(171 if gender == MALE else 158, 6, 145, 190); wt = ctx.normal(67 if gender == MALE else 56, 9, 38, 110)
        ctx.measure(p, index, 3036277, ht, vid=dx_vid); ctx.measure(p, index, 3025315, wt, vid=dx_vid)
        ctx.observation(p, index, 4257895, vid=dx_vid, value_number=ecog, value_string=f"ECOG {ecog}")
        ctx.procedure(p, index, 4306780, vid=dx_vid)                       # 절제 림프절 생검
        pet_day, bm_day = ctx.days(index, 1), ctx.days(index, 2)
        ctx.procedure(p, pet_day, 4305790, vid=dx_vid)
        ctx.procedure(p, bm_day, 4023083, vid=dx_vid)
        ki67 = int(ctx.normal(70 if (dlbcl or ptcl) else (25 if mcl else (12 if (fl or mzl) else 40)), 12, 3, 99, 0))
        leuk = labs[3010813]
        ldh_high = labs[3022250] > 250
        extranodal = stage == "IV"            # Lugano IV 만 비인접 결외 침범이 있다 (I~III 은 결절 영역으로만 기술)
        fields = _subtype_fields(ctx, sub, p.age_at_index, ecog, ldh_high, leuk, ki67, adv, extranodal)
        ctx.note(p, bm_day, PATH_REPORT.format(site=primary, hist=label, ki67=ki67,
                                               ihc=_ihc_text(ctx, sub, fields)),
                 note_type=44814640, note_class=36716165, vid=dx_vid)
        suv = ctx.normal(18 if (dlbcl or hl or ptcl) else 9, 5, 3, 40)
        if stage == "I":
            n_reg, dist = 1, ""
        elif stage == "II":
            n_reg, dist = ctx.randint(2, 3), ", all on the same side of the diaphragm"
        elif stage == "III":
            n_reg, dist = ctx.randint(4, 9), ", on both sides of the diaphragm"
        else:
            n_reg, dist = ctx.randint(2, 9), ""
        if extranodal:
            sites = [ctx.choice(EXTRANODAL)]
            if ctx.bern(0.4):
                other = ctx.choice(EXTRANODAL)
                if other not in sites:
                    sites.append(other)
            extra = f"Non-contiguous extranodal involvement: {', '.join(sites)}."
        else:
            extra = "No extranodal involvement."
        ctx.note(p, pet_day, PET_REPORT.format(n=n_reg, s="" if n_reg == 1 else "s", primary=primary, dist=dist, suv=suv,
                                               stage=stage, extra=extra), vid=dx_vid)
        row = ctx.disease_row(p, dx_vid, diagnosis_date=index)
        row.update(fields)

        # ---- 2) 1차 치료
        last = ctx.days(index, 5)
        outcome = ctx.choice(["cured", "relapse", "refractory"], p=([0.6, 0.35, 0.05] if fl else [0.8, 0.15, 0.05]) if (fl or hl)
                             else [0.68, 0.22, 0.10])
        watch_wait = (fl or mzl) and adv and ctx.bern(0.5)
        end1, resp_ok, regimen = None, False, None
        if watch_wait:
            ctx.note(p, bm_day, "Low tumor burden indolent lymphoma (GELF criteria not met). Plan: watch and wait with 3-monthly follow-up.",
                     note_type=32831, note_class=36716177, vid=dx_vid)
            outcome = "cured"
        else:
            s1 = ctx.days(index, ctx.randint(10, 25))
            rt = (not adv and (hl or dlbcl) and ctx.bern(0.7 if hl else 0.6)) and outcome != "refractory"
            if hl:
                regimen, cyc_n, intent, inp = "ABVD", 6 if adv else ((4 if bulky else 2) if rt else (6 if bulky else 4)), 5, False
            elif fl or mzl:
                regimen, cyc_n, intent, inp = "R-CVP", 6, 3, False
            elif ptcl:
                regimen, cyc_n, intent, inp = "CHOP", 6, 5, True
            else:
                regimen, cyc_n, intent, inp = "R-CHOP", 4 if (rt and dlbcl and not bulky) else 6, 5 if dlbcl else 3, True
            drugs = REG[regimen]["drugs"]
            # 치료 전 평가·지지요법 맥락. 구조화된 검사·처치·약물 행이 없는 항목은 노트 본문으로만 남기며 그렇다고 명시한다.
            if RTX in drugs:
                ctx.note(p, ctx.days(index, 2), "HBV screening before rituximab: HBsAg negative, anti-HBc IgG negative. Recorded in this note "
                                                "only (no structured laboratory rows in this extract).", vid=dx_vid)
            if DOX in drugs:                                                   # 안트라사이클린 전 심기능 평가
                ctx.note(p, ctx.days(index, 3), f"Echocardiography: LVEF {int(ctx.normal(62, 4, 52, 72, 0))}%, no regional wall motion "
                                                "abnormality (pre-anthracycline evaluation). Recorded in this note only (no structured "
                                                "procedure row).", vid=dx_vid)
            if CY in drugs and DOX in drugs and regimen in ("R-CHOP", "CHOP"):
                ctx.note(p, ctx.days(index, 3), (
                    f"Febrile neutropenia risk assessment ({regimen}-21, age {p.age_at_index}): "
                    + ("high; primary G-CSF prophylaxis planned. Pegfilgrastim administration is not itemized in the structured drug records "
                       "of this extract (G-CSF rows exist only for treatment of neutropenic events)."
                       if p.age_at_index >= 65 else
                       "intermediate; primary G-CSF prophylaxis not planned, G-CSF reserved for neutropenic complications.")), vid=dx_vid)
            if outcome == "refractory":
                cyc_n = 2
            sid, e1, cyc = _give(ctx, p, regimen, s1, cyc_n, intent, ecog, "PD" if outcome == "refractory" else "CR", 1, inp)
            e1 = ctx.monitor(p, cyc, drugs)                                  # 감량·휴약·중단이 반영된 실제 종료일
            end1 = e1; last = max(last, e1)
            interim = ctx.days(cyc[2], -1) if len(cyc) >= 3 else ctx.days(e1, 10)
            ds = 5 if outcome == "refractory" else ctx.choice([1, 2, 3, 4], p=[0.2, 0.35, 0.3, 0.15])
            last = max(last, _response(ctx, p, interim, "interim PET2", ds))
            first_sid = sid
            if outcome == "refractory":
                ctx.sact_update(sid, date_of_progression=interim, recurrence_anatomic_site=primary)
                last, dead = _salvage(ctx, p, sub, ecog, primary, interim, last, True)
                if dead:
                    ctx.finalize_person(p)
                    continue
                resp_ok = p.__dict__.get("_remission", False)
            else:
                eot_base = e1
                if rt:
                    rt_day = ctx.days(e1, ctx.randint(21, 35))
                    gy = (30 if bulky else 20) if hl else 36
                    ctx.procedure(p, rt_day, 4181206, vid=ctx.visit_on(p, rt_day))
                    ctx.note(p, rt_day, f"Involved-site radiotherapy to {primary}, {gy} Gy in {RT_FRACTIONS[gy]} fractions started.",
                             note_type=32831, note_class=36716177)
                    eot_base = ctx.days(rt_day, math.ceil(RT_FRACTIONS[gy] * 7 / 5))
                    last = max(last, rt_day)
                eot = ctx.days(eot_base, ctx.randint(21, 35))
                last = max(last, _response(ctx, p, eot, "end of treatment", ctx.choice([1, 2, 3], p=[0.3, 0.4, 0.3])))
                resp_ok = True
                # 리툭시맙 유지 (여포성·외투세포 일부): 375 mg/m2 q8주, 최대 12회
                ms = ctx.days(eot, ctx.randint(30, 60))
                if (fl or mcl) and ctx.bern(0.6) and ms <= ctx.days(ctx.today, -120):
                    mn = min(12, (ctx.today - ms).days // 56)
                    _, me, mcyc = _maint(ctx, p, ms, mn, ecog)
                    me = ctx.monitor(p, mcyc, [RTX], ae_p=0.1)
                    end1 = max(end1, me); last = max(last, me)

        # ---- 3) 재발·구제, 추적
        dead = False
        if outcome == "relapse" and not watch_wait:
            rel = ctx.days(end1, ctx.randint(150, 900))
            if rel <= ctx.days(ctx.today, -240):
                fu_from = _followups(ctx, p, last, rel, ldh0)
                site = ctx.choice(NODAL_SITES) + ("; " + ctx.choice(EXTRANODAL) if ctx.bern(0.4) else "")
                rvid = ctx.visit_on(p, rel)
                ctx.procedure(p, rel, 4305790, vid=rvid)
                ctx.note(p, rel, f"FDG PET/CT: new hypermetabolic lesions ({site}). Relapsed lymphoma.", vid=rvid)
                ctx.sact_update(first_sid, date_of_progression=rel, recurrence_anatomic_site=site.split(";")[0])
                last = max(last, fu_from, rel)
                last, dead = _salvage(ctx, p, sub, ecog, primary, rel, last, False)
        if dead:
            ctx.finalize_person(p)
            continue
        if not p.__dict__.get("_palliative", False):                 # 완화의료 환자에게는 근치 후 감시 CT 를 만들지 않는다
            _followups(ctx, p, last, ctx.today, ldh0)
        ctx.finalize_person(p)


# ----------------------------------------------------------------------------------------------- helpers
def _give(ctx, p, name, start, n, intent, ecog, response, line, inpatient_first=False):
    """요법 1건. REG 의 용량을 dose_overrides 로 넘기고, 사이클 안의 추가 투여일(ABVD 15일, GDP 의 gemcitabine 8일)은
    같은 SACT 에 연결된 별도 DRUG_EXPOSURE 로 붙인다. 반환 (sact_id, 종료일, 사이클 시작일 목록)."""
    reg = REG[name]
    sid, e, cyc = ctx.sact(p, name, reg["drugs"], start, n, intent, ecog=ecog, response=response, cycle_days=reg["cd"],
                           inpatient_first=inpatient_first, drug_days=reg.get("drug_days"), dose_overrides=reg["dose"], line=line)
    if "extra" in reg:
        off, concepts = reg["extra"]
        limit = min(ctx.today, p.death_date) if p.death_date is not None else ctx.today
        for d in cyc:
            day = ctx.days(d, off)
            if day > limit:
                continue
            vid = ctx.visit_on(p, day)
            for c in concepts:
                ctx.drug(p, day, c, 1, vid=vid, sact_id=sid, dose=reg["dose"][c], interval=reg["cd"], number=1)
            e = max(e, day)
    return sid, e, cyc


def _maint(ctx, p, start, n, ecog):
    """리툭시맙 유지요법(1차 요법의 연속이므로 line 1)."""
    return ctx.sact(p, "Rituximab maintenance", [RTX], start, n, 4, ecog=ecog, response="CR", cycle_days=56,
                    dose_overrides={RTX: 375}, line=1)


def _subtype_fields(ctx, sub, age, ecog, ldh_high, leuk, ki67, adv, extranodal):
    """아형별 선택 항목. 다른 아형 전용 항목은 채우지 않는다."""
    f = {"cell_of_origin": "NA"}               # DLBCL 이 아니면 NA
    if sub == DLBCL:
        f["cell_of_origin"] = ctx.choice(["GCB", "ABC/non-GCB", "unclassifiable"], p=[0.45, 0.40, 0.15])
        de = ctx.bern(0.3)
        f["double_expressor_yn"] = int(de)
        f["double_hit_triple_hit_status"] = ctx.choice(["Not detected", "Double-hit (MYC + BCL2)", "Triple-hit"],
                                                       p=[0.9, 0.07, 0.03]) if (de or ctx.bern(0.3)) else None
        f["t_14_18_result"] = ctx.choice(["Positive", "Negative"], p=[0.2, 0.8]) if ctx.bern(0.6) else None
    elif sub == FL:
        f["t_14_18_result"] = ctx.choice(["Positive", "Negative"], p=[0.85, 0.15])
    elif sub == MCL:
        f["t_11_14_result"] = ctx.choice(["Positive", "Negative"], p=[0.92, 0.08])
        pts = (0 if age < 50 else 1 if age < 60 else 2 if age < 70 else 3) + (2 if ecog >= 2 else 0) \
            + (3 if ldh_high and ctx.bern(0.4) else 2 if ldh_high else ctx.choice([0, 1])) \
            + (0 if leuk < 6.7 else 1 if leuk < 10 else 2 if leuk < 15 else 3)
        f["mipi_score"] = min(pts, 11)
        grade = (0 if pts <= 3 else 1 if pts <= 5 else 2) + (1 if ki67 >= 30 else 0)
        f["mipi_c_risk_group"] = ["Low", "Low-intermediate", "High-intermediate", "High"][min(grade, 3)]
    elif sub == HL and adv:
        f["hodgkin_ips_score"] = min(7, ctx.randint(0, 3) + int(ctx.bern(0.3)) + int(ctx.bern(0.3)) + int(ctx.bern(0.2)))
    elif sub == PTCL:
        f["pit_score"] = min(4, int(age > 60) + int(ecog >= 2) + int(ldh_high) + int(ctx.bern(0.25)))
    if sub in (DLBCL, FL, MCL) and ctx.bern(0.3):
        f["minimal_residual_disease_result"] = ctx.choice(["Negative", "Positive (1e-4)", "Not evaluable"], p=[0.7, 0.2, 0.1])
    if sub in (DLBCL, HL, PTCL) and ctx.bern(0.25):
        f["ctdna_result"] = ctx.choice(["Not detected", "Detected"], p=[0.45, 0.55])
    return f


def _ihc_text(ctx, sub, f):
    """면역염색 소견. DLBCL 은 Hans 알고리즘 결과가 cell_of_origin 과 같고, 외투세포는 cyclin D1 이 t(11;14) 와 같다."""
    if sub == DLBCL:
        coo = f["cell_of_origin"]
        if coo == "unclassifiable":
            return "CD20 positive; CD10, BCL6 and MUM1 not interpretable (limited viable tissue), Hans algorithm cannot classify"
        if coo == "GCB":      # CD10 양성, 또는 CD10 음성이면서 BCL6 양성·MUM1 음성
            cd10, bcl6, mum1 = ("positive", "positive", "negative") if ctx.bern(0.7) else ("negative", "positive", "negative")
        else:                 # CD10 음성이면서 MUM1 양성 (BCL6 무관)
            cd10, bcl6, mum1 = "negative", ctx.choice(["positive", "negative"]), "positive"
        de = "present (double-expressor)" if f.get("double_expressor_yn") else "absent"
        return (f"CD20 positive, CD10 {cd10}, BCL6 {bcl6}, MUM1 {mum1}. Cell of origin by Hans algorithm: {coo}. "
                f"MYC/BCL2 protein co-expression {de}")
    if sub == MCL:
        cyclin = "positive" if f["t_11_14_result"] == "Positive" else "negative"
        return f"CD20 positive, CD5 positive, Cyclin D1 {cyclin}, SOX11 positive"
    return IHC_TXT[sub]


def _followups(ctx, p, start, until, ldh0):
    """3~6개월 간격 추적 외래(CT + 검사). 마지막 방문일을 반환. 관해기 LDH 는 환자 기준값(ctx.lab_baseline)을 따른다."""
    fu = ctx.days(start, ctx.randint(80, 120)); last = start; k = 0
    while fu < ctx.days(until, -20) and fu <= ctx.today and k < 12:
        fvid = ctx.visit_on(p, fu)
        ctx.procedure(p, fu, 4207701, vid=fvid)
        ctx.labs(p, fu, [3000963], vid=fvid)
        ctx.measure(p, fu, 3022250, ctx.lab_next(p, fu, 3022250, hi=249.0), vid=fvid)    # 환자 기준 LDH 주변의 종단 값
        last = fu
        fu = ctx.days(fu, ctx.randint(85, 185)); k += 1
    return last


def _response(ctx, p, day, timepoint, ds):
    """PET 반응평가(처치 + 판독 노트)."""
    vid = ctx.visit_on(p, day)
    ctx.procedure(p, day, 4305790, vid=vid)
    resp = {1: "Complete metabolic response", 2: "Complete metabolic response", 3: "Complete metabolic response",
            4: "Partial metabolic response", 5: "Progressive metabolic disease"}[ds]
    ctx.note(p, day, RESP_REPORT.format(tp=timepoint, ds=ds, resp=resp), vid=vid)
    return day


def _confirm(ctx, p, sub, day, kind):
    """재발·불응 시 구제요법 전 조직 확인. 여포성·변연부의 재발은 대세포 전환(R-GDP 의 근거)으로 기록한다."""
    vid = ctx.visit_on(p, day)
    ctx.procedure(p, day, 4306780, vid=vid)
    txt = {DLBCL: f"{kind} diffuse large B-cell lymphoma, CD20 positive.",
           HL: f"{kind} classical Hodgkin lymphoma, CD30 positive.",
           PTCL: f"{kind} peripheral T-cell lymphoma, CD3 positive.",
           MCL: f"{kind} mantle cell lymphoma with pleomorphic features, Cyclin D1 positive, Ki-67 70%.",
           FL: f"Histologic transformation to diffuse large B-cell lymphoma, CD20 positive, Ki-67 80%.",
           MZL: f"Histologic transformation to diffuse large B-cell lymphoma, CD20 positive, Ki-67 80%."}[sub]
    ctx.note(p, day, f"Lymph node, excisional biopsy: {txt}", note_type=44814640, note_class=36716165, vid=vid)


def _salvage(ctx, p, sub, ecog, primary, pd_day, last, refractory):
    """조직 확인 -> 구제요법(R-GDP / GDP, 2차 line) -> 반응 PET -> 자가이식 / CAR-T / 진행 -> 일부 사망. (last, dead) 반환."""
    dlbcl = sub == DLBCL
    s2 = ctx.days(pd_day, ctx.randint(7, 21))
    p._remission = False
    bday = ctx.days(pd_day, ctx.randint(3, 6))
    if bday <= ctx.today:
        _confirm(ctx, p, sub, bday, "Persistent" if refractory else "Recurrent")
    if s2 > ctx.today or (p.death_date is not None and s2 > p.death_date):
        return last, False
    regimen = "GDP" if sub in (HL, PTCL) else "R-GDP"
    sid, e2, cyc2 = _give(ctx, p, regimen, s2, 3, 6, min(ecog + 1, 3), None, 2)
    e2 = ctx.monitor(p, cyc2, REG[regimen]["drugs"], ae_p=0.5)               # 감량·휴약·중단이 반영된 실제 종료일
    last = max(last, e2)
    resp_day = ctx.days(e2, ctx.randint(14, 28))
    if resp_day > ctx.today:
        return last, False
    sensitive = ctx.bern(0.35 if refractory else 0.7)
    ds = ctx.choice([2, 3, 4], p=[0.4, 0.4, 0.2]) if sensitive else 5
    last = max(last, _response(ctx, p, resp_day, "end of treatment", ds))
    ctx.sact_update(sid, best_overall_response=RESP_OF_DS[ds])
    if not sensitive:
        ctx.sact_update(sid, date_of_progression=resp_day, recurrence_anatomic_site=primary)
    if sensitive and p.age_at_index <= 68 and ecog <= 2 and ctx.days(resp_day, 120) <= ctx.today:
        # 자가조혈모세포이식 (입원 21일)
        coll = ctx.days(resp_day, ctx.randint(20, 30))
        ctx.procedure(p, coll, 4283893, vid=ctx.visit_on(p, coll))                    # 조혈모세포 채집
        sct = ctx.days(coll, ctx.randint(10, 20))
        svid = ctx.visit(p, sct, INPATIENT, los=21)
        ctx.procedure(p, sct, 4030027, vid=svid)
        ctx.note(p, sct, "High-dose chemotherapy (BEAM) followed by autologous peripheral blood stem cell infusion (day 0).",
                 note_type=32831, note_class=36716177, vid=svid)
        # 이식 후 호중구 최저점: 발열성 호중구감소증 3등급과 같은 날 ANC < 1.0 (WBC >= ANC), 혈소판·Hb 저하
        nadir = ctx.days(sct, 6)
        anc = round(ctx.rand(0.1, 0.9), 2)
        ctx.measure(p, nadir, 3010813, max(round(anc / ctx.rand(0.4, 0.7), 1), math.ceil(anc * 10) / 10, 0.3), vid=svid)
        ctx.measure(p, nadir, 3017732, anc, vid=svid)
        ctx.measure(p, nadir, 3024929, round(ctx.rand(8, 45)), vid=svid)
        ctx.measure(p, nadir, 3000963, round(ctx.rand(7.5, 9.5), 1), vid=svid)
        ctx.ae(p, nadir, 4304213, 3, vid=svid, action=1)
        ctx.condition(p, ctx.days(sct, 6), 4304213, vid=svid)
        ctx.drug(p, ctx.days(sct, 5), _DRUG_ID["filgrastim"], 7, vid=svid, freq=1)
        last = max(last, ctx.days(sct, 21))
        post = ctx.days(sct, ctx.randint(90, 110))
        if post <= ctx.today:
            last = max(last, _response(ctx, p, post, "follow-up", ctx.choice([1, 2, 3])))
        p._remission = True
        return last, False
    if dlbcl and not sensitive and ecog <= 1 and p.age_at_index <= 75 and ctx.days(resp_day, 120) <= ctx.today:
        # CAR-T(화학요법 불응 DLBCL, 2차 이상 치료 후): 성분채집 -> 림프구감소(입원 16일) -> 주입 -> CRS
        leuk = ctx.days(resp_day, ctx.randint(7, 14))
        ctx.procedure(p, leuk, 4283893, vid=ctx.visit_on(p, leuk))
        ld = ctx.days(leuk, ctx.randint(24, 35))
        cvid = ctx.visit(p, ld, INPATIENT, los=16)
        # 림프구감소: fludarabine 30 + cyclophosphamide 500 mg/m2 을 -5~-3일. fludarabine concept 이 없어 cyclophosphamide 행만 기록.
        sid3, e3, _ = ctx.sact(p, "CD19 CAR-T lymphodepletion - RESTRICTED coverage (cyclophosphamide only; fludarabine not coded)", [CY], ld, 1, 6,
                               ecog=min(ecog + 1, 3), cycle_days=1, dose_overrides={CY: 500}, line=3)
        for d in (1, 2):
            ctx.drug(p, ctx.days(ld, d), CY, 1, vid=cvid, sact_id=sid3, dose=500, interval=1, number=1)
        inf = ctx.days(ld, 5)
        ctx.procedure(p, inf, 4053096, vid=cvid)
        ctx.note(p, ctx.days(ld, 2), "Lymphodepleting chemotherapy on days -5 to -3: fludarabine 30 mg/m2 and cyclophosphamide 500 mg/m2. "
                                     "RESTRICTED-COVERAGE RECORD: only the cyclophosphamide component is itemized in the structured drug records "
                                     "(no fludarabine drug concept in this extract); this CAR-T episode is not a complete clinical sample.",
                 note_type=32831, note_class=36716177, vid=cvid)
        ctx.note(p, inf, "CD19-directed CAR-T infused on day 0 after fludarabine/cyclophosphamide lymphodepletion.",
                 note_type=32831, note_class=36716177, vid=cvid)
        crs_day = ctx.days(inf, ctx.randint(1, 5))
        g = ctx.choice([1, 2, 3], p=[0.55, 0.35, 0.10])
        ctx.ae(p, crs_day, 4185711, g, vid=cvid, action=5, causality=1, serious=False if g < 3 else None)
        ctx.condition(p, crs_day, 4185711, vid=cvid)
        ctx.labs(p, crs_day, [3020460, 3010813, 3017732], vid=cvid, shifts={3020460: 60 * g, 3017732: -3.0})
        if g >= 2:
            ctx.note(p, crs_day, f"Cytokine release syndrome grade {g} managed with tocilizumab 8 mg/kg and close monitoring "
                                 "(tocilizumab is not itemized in the structured drug records of this extract).",
                     note_type=32831, note_class=36716177, vid=cvid)
        last = max(last, ctx.days(ld, 16))
        d30 = ctx.days(inf, 30)
        ds30 = ctx.choice([1, 2, 3], p=[0.4, 0.35, 0.25]) if ctx.bern(0.55) else 5
        if d30 <= ctx.today:
            last = max(last, _response(ctx, p, d30, "follow-up", ds30))
            ctx.sact_update(sid3, best_overall_response=RESP_OF_DS[ds30])
            if ds30 == 5:
                ctx.sact_update(sid3, date_of_progression=d30, recurrence_anatomic_site=primary)
                return _disease_death(ctx, p, last)
        p._remission = True
        return last, False
    if not sensitive:
        return _disease_death(ctx, p, last)
    p._remission = True
    return last, False


def _disease_death(ctx, p, last):
    """진행 후 완화의료로 전환하고 30~150일 내 사망 (오늘 이후이면 생존 상태로 남김). 이후 이벤트는 만들지 않는다."""
    p._palliative = True
    day = ctx.days(last, ctx.randint(3, 10))
    dd = ctx.days(last, ctx.randint(30, 150))
    if day <= ctx.today:
        ctx.note(p, day, "Progressive lymphoma after salvage therapy; no further curative option. Referred to palliative care; "
                         "best supportive care.", note_type=32831, note_class=36716177)
    if dd > ctx.today:
        return last, False
    ctx.visit(p, ctx.days(dd, -3), INPATIENT, los=3)
    ctx.set_death(p, dd)
    return dd, True
