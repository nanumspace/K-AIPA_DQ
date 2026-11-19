# -*- coding: utf-8 -*-
"""
대장암 코호트 시나리오. 특화 테이블 COLORECTAL_CANCER 는 환자당 1행
(진단 방문에 매달고 diag_rgst_ymd = 진단정보 등록일)이며, 자유기재(varchar) 열은 해당되는 일부 환자만 채운다.

여정: 진단 외래(대장내시경 생검 + MMR IHC, 흉부·복부·골반 CT, 직장은 MRI, CEA) → 병기별 치료 → 추적(CT + CEA)
  결장 I~III      결장절제술 → 병리(LVI, MMR) → 위험도에 따른 보조 mFOLFOX6 / CAPOX / capecitabine
  직장 II~III     수술 전 장기 동시항암방사선(50.4 Gy/28회, capecitabine 825 mg/m2 BID 는 방사선 시행일 월~금) → LAR → 보조항암
  IV              (일부 고식적 절제) 1차 mFOLFOX6 + bevacizumab → 8주 CT 반응평가 → 진행 시 2차 FOLFIRI + bevacizumab →
                  2차 진행 또는 수행도 불량이면 완화의료(+ 일부 사망)
  추적            6개월 간격 CT + CEA, 대장내시경 1·3년, 일부 재발 → 조직/PET 확인 → RAS/BRAF → 전이성 요법

임상 근거(용량·일정은 아래 표준 프로토콜에 맞췄다. 임상 자문 검수를 받았다는 뜻이 아니다):
  * mFOLFOX6   oxaliplatin 85 mg/m2 + leucovorin 400 mg/m2 + 5-FU bolus 400 mg/m2, 이어 5-FU 2,400 mg/m2 46시간 지속주입, 14일 주기
               (eviQ 637 보조 mFOLFOX6, eviQ 986 전이성 mFOLFOX6 + bevacizumab; NCCN Colon Cancer). 5-FU 는 같은 사이클에
               bolus 행(1일)과 지속주입 행(2일, 2,400)의 두 DRUG_EXPOSURE 로 기록한다.
  * FOLFIRI    irinotecan 180 mg/m2 + leucovorin 400 + 5-FU 400 bolus + 2,400 지속주입, 14일 주기; bevacizumab 5 mg/kg q14d
               (BC Cancer GIFOLFIRI/GIFFIRB; Saltz JCO 2008 NO16966 의 FOLFOX + bevacizumab 5 mg/kg q2w).
  * 2차 FOLFIRI + bevacizumab: 1차 진행 후 bevacizumab 지속 (Bennouna, Lancet Oncol 2013, ML18147).
  * CAPOX      oxaliplatin 130 mg/m2 d1 + capecitabine 1,000 mg/m2 BID d1-14, 21일 주기 (NCCN Colon Cancer).
  * capecitabine 단독 보조 1,250 mg/m2 BID d1-14 q21d x 8 (Twelves, NEJM 2005, X-ACT) - 70세 이상·PS 2.
  * 보조 기간 3 vs 6개월: IDEA (Grothey, NEJM 2018). 저위험(T1-3 N1)은 CAPOX 4 / FOLFOX 6사이클, 고위험(T4 또는 N2)은
    CAPOX 8 / FOLFOX 12사이클. 선행 CRT 후 보조는 FOLFOX 8 / CAPOX 6 (NCCN Rectal Cancer, 총 6개월 주위 치료).
  * II기 보조: dMMR 은 관찰, pMMR 고위험(T4, 폐색·천공, LVI, 저분화) 위주 (NCCN Colon Cancer).
  * 직장 CCRT 50.4 Gy/28회(월~금) + capecitabine 825 mg/m2 BID 를 방사선 시행일(주 5일)에만 투여 (NCCN Rectal Cancer).
    주 단위 투여 블록 5일 x 5주 + 마지막 주 3일 = 28일 = 분할 수. 방사선은 월요일에 시작한다.
  * 반응평가는 RECIST 1.1 로 8주(4사이클)에 한 번, 이후 3개월 간격 CT + CEA.
단순화: 전이성 1차는 RAS/BRAF 상태와 무관하게 bevacizumab 병용만 쓴다(RAS/BRAF 야생형 좌측 결장은 anti-EGFR 도 선호되지만
  concepts.yaml 에 없다). MSI-H(dMMR) 전이성은 면역항암제 대상이라 병기 IV 는 pMMR 로만 생성하고, dMMR 환자의 재발도 만들지 않는다.
  APR 용 procedure concept 이 없어 직장암 수술은 LAR(초저위 전방절제 + 일시적 회장루)로만 기록한다.
"""
from framework import *

COLON, RECTOSIG, RECTUM = 197500, 438699, 74582
SITES = [  # (kcd, site name, cohort concept, side)
    ("C18.0", "Cecum", COLON, "R"), ("C18.2", "Ascending colon", COLON, "R"), ("C18.4", "Transverse colon", COLON, "R"),
    ("C18.6", "Descending colon", COLON, "L"), ("C18.7", "Sigmoid colon", COLON, "L"),
    ("C19", "Rectosigmoid junction", RECTOSIG, "L"), ("C20", "Rectum", RECTUM, "L"),
]
SITE_P = [0.08, 0.17, 0.08, 0.07, 0.25, 0.05, 0.30]
STAGES = ["I", "II", "III", "IV"]
STAGE_P = [0.20, 0.25, 0.33, 0.22]
TSIZE = {"T1": (0.8, 2.0), "T2": (2.0, 4.0), "T3": (3.0, 6.0), "T4a": (4.5, 8.0), "T4b": (5.0, 9.0)}
HIST = {"8140/3": "Adenocarcinoma, NOS", "8480/3": "Mucinous adenocarcinoma", "8490/3": "Signet ring cell carcinoma"}
GRADE = {"G1": "Well differentiated", "G2": "Moderately differentiated", "G3": "Poorly differentiated"}
GROSS = ["ulcerofungating", "ulceroinfiltrative", "polypoid", "infiltrative"]
MET_SITES = ["Liver", "Lung", "Peritoneum", "Distant lymph node", "Bone"]
MET_P = [0.5, 0.2, 0.15, 0.1, 0.05]
MET_TXT = {"Liver": "Multiple hypodense lesions in both hepatic lobes, compatible with liver metastases.",
           "Peritoneum": "Peritoneal nodularity with small-volume ascites, suspicious for peritoneal carcinomatosis.",
           "Distant lymph node": "Enlarged para-aortic lymph nodes (short axis > 1 cm), suspicious for nodal metastases.",
           "Bone": "Osteolytic lesion in a lumbar vertebral body, suspicious for bone metastasis."}
CC_TEXT = {"R": ["Iron deficiency anemia found on health check-up", "Vague right lower quadrant abdominal pain for 3 months"],
           "L": ["Hematochezia for 2 months", "Change of bowel habit (constipation) for 3 months"],
           "REC": ["Hematochezia and tenesmus for 2 months", "Blood-tinged stool with mucus for 6 weeks"]}
TRG_TXT = {"1": "complete radiological response", "2": "good response, predominantly fibrosis",
           "3": "moderate response, more than 50% fibrosis", "4": "poor response, predominantly tumor"}

COLONO_REPORT = ("Colonoscopy: {desc} mass at {site}, {size} cm in size, occupying about {circ}% of the lumen. "
                 "Multiple biopsies taken. Impression: {site} cancer, r/o adenocarcinoma. Biopsy pending.")
BX_REPORT = "{bx_site}, endoscopic biopsy: {hist}, {grade}. Mismatch repair protein IHC: {mmr}."
CT_REPORT = ("CT abdomen and pelvis (contrast). Wall thickening of the {site} ({size} cm) with {node}. {met} "
             "Impression: {site} cancer, {tnm}.")
CT_CHEST_REPORT = "CT chest (contrast). {chest}"
SGPT_REPORT = ("{organ}, resection: {hist}, {grade}. Tumor size {size} cm, gross type {gross}. Depth of invasion: {depth}. "
               "Lymphovascular invasion: {lvi}. Lymph nodes: {pos}/{tot} positive. Mismatch repair protein IHC: {mmr}. "
               "Pathologic stage {tnm}.")

AE_BASE = {31967: 0.15, 196523: 0.10, 320073: 0.15, 439777: 0.10, 4223659: 0.12, 4117779: 0.05, 140214: 0.02, 4250734: 0.03,
           432870: 0.08, 138455: 0.06, 441408: 0.08}

# 약물 concept 은 이름으로 찾는다(concepts.yaml 의 id 교정에 영향받지 않게).
_DRUG_ID = {v["name"]: k for k, v in CONCEPTS["drugs"].items()}
OXALI, FU, LV, CAPE, IRI, BEV = (_DRUG_ID[n] for n in ("oxaliplatin", "fluorouracil", "leucovorin", "capecitabine",
                                                       "irinotecan", "bevacizumab"))
FU_INFUSION_MG_M2 = 2400            # 46시간 지속주입 총량


# --------------------------------------------------------------------------------------------- regimens
def _reg(backbone, bio=None):
    """표준 요법 정의. 용량은 concepts.yaml 의 dose_unit_label 단위(mg/m2 또는 mg/kg, capecitabine 은 1회량)."""
    if backbone == "FOLFOX":
        name, cd, drugs, dose, infusion = "mFOLFOX6", 14, [OXALI, LV, FU], {OXALI: 85, LV: 400, FU: 400}, True
    elif backbone == "FOLFIRI":
        name, cd, drugs, dose, infusion = "FOLFIRI", 14, [IRI, LV, FU], {IRI: 180, LV: 400, FU: 400}, True
    elif backbone == "CAPOX":
        name, cd, drugs, dose, infusion = "CAPOX", 21, [OXALI, CAPE], {OXALI: 130, CAPE: 1000}, False
    else:                           # "CAPE" 보조 단독
        name, cd, drugs, dose, infusion = "Capecitabine", 21, [CAPE], {CAPE: 1250}, False
    if bio == BEV:
        name, drugs, dose = f"{name} + bevacizumab", drugs + [BEV], {**dose, BEV: 5}
    return dict(name=name, cd=cd, drugs=drugs, dose=dose, infusion=infusion)


def _give(ctx, p, reg, start, n, intent, ecog, line=None, response="NE"):
    """요법 1건 + 사이클별 약물. 5-FU 지속주입은 같은 사이클에 별도 DRUG_EXPOSURE(2일, 2,400 mg/m2)로 붙인다."""
    sid, e, cyc = ctx.sact(p, reg["name"], reg["drugs"], start, n, intent, ecog=ecog, response=response,
                           cycle_days=reg["cd"], dose_overrides=reg["dose"], line=line)
    if reg["infusion"]:
        last = min(ctx.today, p.death_date) if p.death_date is not None else ctx.today
        for d in cyc:
            days = min(2, (last - d).days + 1)
            ctx.drug(p, d, FU, days, vid=ctx.visit_on(p, d), sact_id=sid, dose=FU_INFUSION_MG_M2, interval=reg["cd"], number=1)
            e = max(e, ctx.days(d, days - 1))
    return sid, e, cyc


def _adjuvant(ctx, age, ecog, hi, after_crt):
    """보조요법 선택. 반환 (요법, 계획 사이클 수)."""
    if age >= 70 or ecog == 2:
        return _reg("CAPE"), 8
    if ctx.bern(0.6):
        return _reg("FOLFOX"), (8 if after_crt else 12 if hi else 6)
    return _reg("CAPOX"), (6 if after_crt else 8 if hi else 4)


def _pool(drugs):
    w = dict(AE_BASE)
    if OXALI in drugs: w[4117779] += 0.30        # oxaliplatin: 말초신경병증
    if IRI in drugs:
        w[196523] += 0.25; w[320073] += 0.15     # irinotecan: 설사, 호중구감소
    if FU in drugs or CAPE in drugs:
        w[196523] += 0.10; w[138455] += 0.08
    if CAPE in drugs: w[140214] += 0.08          # hand-foot syndrome 을 rash 로 대표
    return tuple(w.items())


# --------------------------------------------------------------------------------------------- CEA
def _cea0(ctx):
    """환자별 치료 후 안정 CEA(비흡연 정상 범위 중앙값 ~1.8)."""
    return round(min(4.5, max(0.6, float(ctx.rng.lognormal(math.log(1.8), 0.4)))), 1)


def _cea_dx(ctx, cea0, stage):
    mu, sg = {"I": (0.1, 0.3), "II": (0.35, 0.6), "III": (0.8, 0.8), "IV": (2.2, 1.0)}[stage]
    return round(min(2000.0, max(0.3, cea0 * float(ctx.rng.lognormal(mu, sg)))), 1)


def _cea_follow(ctx, cea0):
    return round(max(0.3, cea0 * float(ctx.rng.lognormal(0.0, 0.1))), 1)


def _cea_step(ctx, st, mode):
    """전이성 치료 중 CEA 는 반응을 따라가며 환자의 안정치 아래로 내려가지 않는다."""
    cea, floor = st["cea"], st["cea0"] * 1.05
    if mode == "PR":
        new = max(floor, cea * ctx.rand(0.25, 0.55))
    elif mode == "PD":
        new = cea * ctx.rand(1.5, 2.6)
    else:                           # SD / HOLD
        new = max(floor, cea * float(ctx.rng.lognormal(0.0, 0.08)))
    st["cea"] = round(new, 1)
    return st["cea"]


# --------------------------------------------------------------------------------------------- 병기·병리 서식
def _ctnm(ctx, stage):
    if stage == "I":
        return ctx.choice(["T1", "T2"], p=[0.4, 0.6]), "N0", "M0"
    if stage == "II":
        return ctx.choice(["T3", "T4a", "T4b"], p=[0.75, 0.2, 0.05]), "N0", "M0"
    if stage == "III":
        return ctx.choice(["T2", "T3", "T4a", "T4b"], p=[0.1, 0.6, 0.2, 0.1]), ctx.choice(["N1a", "N1b", "N2a", "N2b"], p=[0.3, 0.3, 0.25, 0.15]), "M0"
    return ctx.choice(["T3", "T4a", "T4b"], p=[0.6, 0.3, 0.1]), ctx.choice(["N1b", "N2a", "N2b"]), "M1a"


def _mets(ctx):
    """전이 부위 목록. M1a 단일 장기, M1b 2개 이상 장기, M1c 복막(AJCC 8)."""
    first = ctx.choice(MET_SITES, p=MET_P)
    out = [first]
    if ctx.bern(0.4):
        out.append(ctx.choice([s for s in MET_SITES if s != first]))
    return out


def _depth(pt, rectal):
    """침윤 깊이. 직장에는 장막이 없으므로 T3 은 직장주위 연조직, 결장은 장막하/결장주위 지방."""
    return {"T0": "No residual tumor", "T1": "Submucosa", "T2": "Muscularis propria",
            "T3": "Perirectal soft tissue (through muscularis propria)" if rectal else "Subserosa / pericolic fat",
            "T4a": "Serosa (visceral peritoneum)", "T4b": "Adjacent organ"}[pt]


def _mmr_text(ctx, deficient):
    if not deficient:
        return "MLH1, MSH2, MSH6 and PMS2 expression intact (pMMR / MSS)"
    return "Loss of MLH1/PMS2 expression (dMMR / MSI-H)" if ctx.bern(0.7) else "Loss of MSH2/MSH6 expression (dMMR / MSI-H)"


def _molecular_text(ctx, mmr):
    ras = ctx.bern(0.5)
    braf = (not ras) and ctx.bern(0.10)
    ras_t = (ctx.choice(["KRAS G12D mutation", "KRAS G12V mutation", "KRAS G13D mutation", "KRAS A146T mutation", "NRAS Q61K mutation"])
             if ras else "KRAS/NRAS wild-type (exons 2, 3 and 4)")
    return f"Molecular profiling of the tumor: {ras_t}; {'BRAF V600E mutation' if braf else 'BRAF V600E not detected'}; mismatch repair {mmr}."


def _cap_cycles(ctx, start, cycles, cd):
    """마지막 사이클이 검증일을 넘지 않도록 사이클 수 제한."""
    return max(0, min(cycles, (ctx.today - start).days // cd))


# --------------------------------------------------------------------------------------------- 영상·완화·사망
def _ct(ctx, p, day, text):
    vid = ctx.visit_on(p, day)
    ctx.procedure(p, day, 4304092, vid=vid)
    ctx.procedure(p, day, 4058335, vid=vid)
    ctx.note(p, day, text, note_type=32841, note_class=46235057, vid=vid)
    return vid


def _death(ctx, p, dd, cause="progressive metastatic colorectal cancer"):
    if dd > ctx.today:
        return False
    ctx.set_death(p, dd)
    vid = ctx.visit(p, ctx.days(dd, -2), INPATIENT, los=2)
    ctx.note(p, dd, f"Terminal admission for {cause}; best supportive care. Died on {dd.isoformat()}.",
             note_type=32824, note_class=3020091, vid=vid)
    return True


def _bsc_course(ctx, p, day, p_death, lo, hi):
    """완화의료 경과: 1~2개월 간격 외래(혈색소·알부민) 후 일부는 사망. 이 환자에게는 정기 감시 CT 를 만들지 않는다."""
    dd = ctx.days(day, ctx.randint(lo, hi)) if ctx.bern(p_death) else None
    stop = ctx.today if dd is None else min(ctx.today, ctx.days(dd, -3))
    t, k = ctx.days(day, ctx.randint(30, 60)), 0
    while t <= stop and k < 8:
        ctx.labs(p, t, [3000963, 3024561], vid=ctx.visit_on(p, t))
        t = ctx.days(t, ctx.randint(30, 60)); k += 1
    if dd is not None:
        _death(ctx, p, dd)


def _bsc(ctx, p, st, pd_day, reason):
    """진행 후 추가 전신치료 없이 완화의료로 전환."""
    day = ctx.days(pd_day, ctx.randint(2, 7))
    if day > ctx.today:
        return
    ecog = min(st["ecog"] + 1, 3)
    vid = ctx.visit_on(p, day)
    ctx.observation(p, day, 36303470, vid=vid, value_number=ecog, value_string=f"ECOG {ecog}, best supportive care")
    ctx.note(p, day, f"Progressive disease. {reason} Referred to palliative care; best supportive care.",
             note_type=32831, note_class=3000735, vid=vid)
    _bsc_course(ctx, p, day, 0.75, 30, 210)


def _progress(ctx, p, st, day):
    """진행 CT(RECIST 1.1) + CEA. SACT.recurrence_anatomic_site 에 쓸 부위 문자열을 돌려준다."""
    known = list(st["sites"])
    free = [s for s in MET_SITES if s not in known]
    new = ctx.choice(free) if free and ctx.bern(0.7) else None
    cea = _cea_step(ctx, st, "PD")
    where = ", ".join(s.lower() for s in known)
    vid = _ct(ctx, p, day, f"CT chest, abdomen and pelvis (RECIST 1.1): interval increase of the known lesions ({where})"
                           + (f" and new {new.lower()} lesions" if new else "") + f". Progressive disease. CEA {cea} ng/mL.")
    ctx.measure(p, day, 3003785, cea, vid=vid)
    st["sites"] = known + ([new] if new else [])
    return "; ".join(known) + (f"; {new} (new)" if new else "")


def _restage(ctx, p, st, day, label):
    cea = _cea_step(ctx, st, label)
    txt = {"PR": "Partial response: at least 30% decrease in the sum of target lesion diameters, no new lesions.",
           "SD": "Stable disease: no new lesions and no significant change in the target lesions.",
           "HOLD": "No interval progression and no new lesions."}[label]
    vid = _ct(ctx, p, day, f"CT chest, abdomen and pelvis (RECIST 1.1): {txt} CEA {cea} ng/mL.")
    ctx.measure(p, day, 3003785, cea, vid=vid)


def _run_line(ctx, p, st, backbone, line, start):
    """전이성 치료 1 line(+ bevacizumab). 4사이클(8주) 뒤 첫 반응평가, 계획 사이클 종료 후 3개월 간격 CT + CEA.
    반환 (마지막 날짜, 진행일 또는 None, 치료 시행 여부). 최선반응이 PD 이면 4사이클 후 중단하고 진행일을 SACT 에 남긴다.
    반응 분포: 1차 PR 50/SD 35/PD 15, 2차 PR 10/SD 55/PD 35 (ML18147 의 낮은 반응률을 반영)."""
    reg = _reg(backbone, BEV)
    cd, ec = reg["cd"], 4
    ecog = st["ecog"] if line == 1 else min(st["ecog"] + 1, 3)
    resp = ctx.choice(["PR", "SD", "PD"], p=[0.50, 0.35, 0.15] if line == 1 else [0.10, 0.55, 0.35])
    ev = ctx.days(start, ec * cd - ctx.randint(1, 7))
    evaluable = ev <= ctx.today
    stop_early = evaluable and resp == "PD"
    n = ec if stop_early else (max(ec, _cap_cycles(ctx, start, ctx.randint(8, 12), cd)) if evaluable
                               else _cap_cycles(ctx, start, ctx.randint(8, 12), cd))
    if n == 0:
        return start, None, False
    sid, e, cyc = _give(ctx, p, reg, start, n, 3, ecog, line=line)
    e = ctx.monitor(p, cyc, reg["drugs"], ae_pool=_pool(reg["drugs"]))      # 감량·휴약·중단이 반영된 실제 종료일
    last = e
    if stop_early and ev <= e:                 # 휴약으로 4사이클이 밀리면 반응평가는 마지막 투여 뒤로
        ev = ctx.days(e, ctx.randint(2, 7))
        evaluable = ev <= ctx.today
        stop_early = evaluable and resp == "PD"
    if not evaluable:                       # 아직 첫 반응평가 전: 진행 중인 치료
        return last, None, True
    if stop_early:
        site = _progress(ctx, p, st, ev)
        ctx.sact_update(sid, best_overall_response="PD", date_of_progression=ev, recurrence_anatomic_site=site)
        return max(last, ev), ev, True
    ctx.sact_update(sid, best_overall_response=resp)
    _restage(ctx, p, st, ev, resp)
    last = max(last, ev)
    t = ctx.days(e, ctx.randint(21, 35))
    prog_k = ctx.randint(1, 3) if ctx.bern(0.6 if line == 1 else 0.75) else None
    k = 0
    while t <= ctx.today and k < 12:
        k += 1
        if k == prog_k:
            site = _progress(ctx, p, st, t)
            ctx.sact_update(sid, date_of_progression=t, recurrence_anatomic_site=site)
            return t, t, True
        _restage(ctx, p, st, t, "HOLD")
        last = t
        t = ctx.days(t, ctx.randint(80, 95))
    return last, None, True


def _metastatic(ctx, p, st, start, backbone):
    """전이성 치료 경과: 1차 → (진행 시) 2차 → (진행 시) 완화의료. 진행 뒤에는 반드시 다음 관리 기록이 있다."""
    last, pd1, ran = _run_line(ctx, p, st, backbone, 1, start)
    if not ran:
        return start
    if pd1 is None:
        return last
    nxt = "FOLFIRI" if backbone == "FOLFOX" else "FOLFOX"
    ecog2 = min(st["ecog"] + 1, 3)
    if ecog2 <= 2 and ctx.bern(0.85):
        plan_day, s2 = ctx.days(pd1, ctx.randint(2, 6)), ctx.days(pd1, ctx.randint(7, 21))
        if plan_day <= ctx.today:
            ctx.note(p, plan_day, f"Disease progression on first-line therapy. Plan: second-line {_reg(nxt, BEV)['name']}.",
                     note_type=32831, note_class=3000735)
        if s2 <= ctx.today:
            last2, pd2, ran2 = _run_line(ctx, p, st, nxt, 2, s2)
            if ran2:
                last = max(last, last2)
                if pd2 is not None:
                    _bsc(ctx, p, st, pd2, "Progression on second-line therapy; further systemic therapy not pursued.")
        return last
    _bsc(ctx, p, st, pd1, f"Not fit for further systemic therapy (ECOG {ecog2})." if ecog2 > 2
         else "Patient declined further systemic therapy.")
    return last


# --------------------------------------------------------------------------------------------- 수술·병리
def _surgery(ctx, p, row, day, kcd, site_nm, side, rectal, low, obstruction, perforation, purpose):
    """수술 입원. 반환 (퇴원일, 장루 정보). 자유기재 열 일부를 질환 행에 채운다."""
    los = ctx.randint(6, 10) if purpose == "CUR" else ctx.randint(8, 14)
    svid = ctx.visit(p, day, INPATIENT, los=los)
    if rectal:
        ctx.procedure(p, day, 4151121, vid=svid)
        op_nm = "Low anterior resection" + (" (ultra-low, coloanal anastomosis)" if low else "")
    else:
        ctx.procedure(p, day, 4079713, vid=svid)
        op_nm = ("Anterior resection" if kcd == "C19" else "Right hemicolectomy" if side == "R"
                 else "Left hemicolectomy" if site_nm == "Descending colon" else "Anterior resection (sigmoidectomy)")
    lap = ctx.bern(0.8) and not perforation
    conv = lap and ctx.bern(0.08)
    ostomy = None
    if rectal and ctx.bern(0.8 if low else 0.4):
        ostomy = dict(temporary=True, kind="ILEO", why="Anastomosis protection (diverting ileostomy)")
    elif (obstruction or perforation) and ctx.bern(0.5):
        ostomy = dict(temporary=True, kind="COLO", why="Obstruction / perforation (Hartmann)")
    if ostomy and ctx.bern(0.6):
        row["ostm_frsn_clsf_etc_cont"] = ostomy["why"] + (", low anastomosis with poor tissue perfusion" if ostomy["kind"] == "ILEO" else "")
    if ctx.bern(0.25):
        row["anes_mthd_etc_cont"] = ctx.choice(["Double stapling technique (side-to-end)", "Stapled end-to-end with reinforcing sutures",
                                                "Colonic J-pouch anastomosis" if rectal else "Intracorporeal side-to-side stapled anastomosis"])
    if purpose == "PAL" or conv:
        row["afop_asmt_item_etc_cont"] = ("Palliative resection, R2 (macroscopic residual disease)" if purpose == "PAL"
                                          else "Converted to open surgery due to adhesion; R0 resection")
    ebl = int(ctx.normal(150 if lap and not conv else 350, 120, 20, 2000, 0))
    compl = ctx.bern(0.15)
    dsch = ctx.days(day, los)
    pod1 = ctx.days(day, 1)
    ctx.labs(p, pod1, [3000963, 3010813, 3016723], vid=svid, shifts={3000963: -1.5, 3010813: 2.5})
    # CRP 는 수술 후 1~3일에 오르고, 합병증(발열)이 있으면 더 높다 (POD3 150 mg/L 이상은 합병증 의심 수준)
    ctx.measure(p, pod1, 3020460, round(ctx.rand(35, 100), 1), vid=svid)
    ae_day = ctx.days(day, ctx.randint(2, 5))
    ctx.measure(p, ctx.days(day, 3), 3020460, round(ctx.rand(150, 260) if compl else ctx.rand(60, 140), 1), vid=svid)
    if compl:
        ctx.ae(p, ae_day, 437663, ctx.randint(1, 2), vid=svid, serious=False)   # 수술 입원 중 발열: 입원 사유가 아니다
        ctx.condition(p, ae_day, 437663, vid=svid)
    ctx.note(p, dsch, f"Discharge summary. {op_nm} ({'laparoscopic' if lap else 'open'}{', converted to open' if conv else ''}) on {day.isoformat()} "
                      f"for {site_nm.lower()} cancer. EBL {ebl} mL. Postoperative course "
                      f"{'complicated by fever, treated conservatively' if compl else 'uneventful'}. Discharged on POD {los}.",
             note_type=32824, note_class=3020091, vid=svid)
    return dsch, ostomy


def _pathology(ctx, p, row, surgery_day, rectal, kcd, hist_cd, grade, pt, pn, pm, after_ccrt, csize, mmr, lvi):
    path_day = ctx.days(surgery_day, ctx.randint(0, 2))
    read_day = ctx.days(path_day, ctx.randint(3, 7))
    svid = ctx.visit_on(p, path_day)
    psize = 0.0 if pt == "T0" else round(csize * ctx.rand(0.7, 1.15), 1)
    tot_ln = ctx.randint(12, 40)
    pos_ln = min({"N0": 0, "N1a": 1, "N1b": ctx.randint(2, 3), "N2a": ctx.randint(4, 6), "N2b": ctx.randint(7, 12)}[pn], tot_ln)
    rm_pos = pt == "T4b" and ctx.bern(0.3)
    organ = "Rectum" if rectal else ("Rectosigmoid colon" if kcd == "C19" else "Colon")
    stage_txt = ("y" if after_ccrt else "") + f"p{pt}{pn}" + ("M0" if pm == "M0" else f" c{pm}")
    ctx.note(p, read_day, SGPT_REPORT.format(organ=organ, hist=HIST[hist_cd], grade=GRADE[grade].lower(), size=psize, gross=ctx.choice(GROSS),
                                             depth=_depth(pt, rectal), lvi="present" if lvi else "not identified", pos=pos_ln, tot=tot_ln,
                                             mmr=mmr, tnm=stage_txt),
             note_type=32835, note_class=3031451, vid=svid)
    row["inva_dgre_nm"] = _depth(pt, rectal)
    row["radi_rsmg_invl_yn_spnm"] = "침범" if rm_pos else "침범 없음"
    if rectal:
        row["tme_qlt_dgre_spnm"] = ctx.choice(["Complete", "Nearly complete", "Incomplete"], p=[0.75, 0.2, 0.05])
    return pos_ln, tot_ln


# --------------------------------------------------------------------------------------------- 시나리오
def generate(ctx: Ctx, n=100):
    for _ in range(n):
        gender = FEMALE if ctx.bern(0.42) else MALE
        age = int(ctx.normal(65, 10, 30, 90, 0))
        index = D(2019, 1, 1) + dt.timedelta(days=ctx.randint(0, 365 * 5 + 150))
        p = ctx.person(gender, age, index)
        kcd, site_nm, dx_concept, side = ctx.choice(SITES, p=SITE_P)
        rectal = kcd == "C20"
        organ_bx = site_nm if kcd in ("C19", "C20") else f"Colon, {site_nm.lower()}"
        stage = ctx.choice(STAGES, p=STAGE_P)
        t, nn, m = _ctnm(ctx, stage)
        mets = _mets(ctx) if stage == "IV" else []
        if mets:
            m = "M1c" if "Peritoneum" in mets else ("M1b" if len(mets) > 1 else "M1a")
        size = round(ctx.rand(*TSIZE[t]), 1)
        hist_cd = ctx.choice(list(HIST), p=[0.85, 0.12, 0.03])
        grade = ctx.choice(list(GRADE), p=[0.15, 0.7, 0.15])
        ecog = ctx.choice([0, 1, 2, 3], p=[0.4, 0.4, 0.15, 0.05])
        obstruction = ctx.bern(0.10) if t in ("T3", "T4a", "T4b") else False
        perforation = (not obstruction) and t in ("T4a", "T4b") and ctx.bern(0.1)
        # MMR: 우측 결장에 dMMR 이 많다. 병기 IV 는 면역항암제 대상인 MSI-H 를 만들지 않는다(모듈 설명 참조).
        mmr_def = False if stage == "IV" else ctx.bern(0.17 if side == "R" else 0.05)
        mmr = _mmr_text(ctx, mmr_def)
        lvi = ctx.bern(0.05 if t == "T1" else 0.25)

        # ---- 1) 진단 외래
        dx_vid = ctx.visit(p, index, OUTPATIENT)
        ctx.condition(p, index, dx_concept, vid=dx_vid)
        for prob, cid in ((0.35, 320128), (0.2, 201826), (0.15, 432867), (0.02, 81893)):
            if ctx.bern(prob): ctx.condition(p, index, cid, vid=dx_vid)
        ctx.procedure(p, index, 40489328, vid=dx_vid)
        circ = ctx.randint(25, 95) if t != "T1" else ctx.randint(10, 30)
        ctx.note(p, index, COLONO_REPORT.format(desc=ctx.choice(["Ulcerofungating", "Ulceroinfiltrative", "Polypoid"]), site=site_nm, size=size, circ=circ),
                 note_type=32831, note_class=3000735, vid=dx_vid)
        ctx.note(p, ctx.days(index, ctx.randint(2, 4)), BX_REPORT.format(bx_site=organ_bx, hist=HIST[hist_cd], grade=GRADE[grade].lower(), mmr=mmr),
                 note_type=32835, note_class=3031451)
        ht = ctx.normal(168 if gender == MALE else 156, 6, 145, 190); wt = ctx.normal(67 if gender == MALE else 57, 9, 38, 110)
        ctx.measure(p, index, 3036277, ht, vid=dx_vid); ctx.measure(p, index, 3025315, wt, vid=dx_vid)
        ctx.measure(p, index, 3038553, round(wt / (ht / 100) ** 2, 1), vid=dx_vid)
        ctx.observation(p, index, 36303470, vid=dx_vid, value_number=ecog, value_string=f"ECOG {ecog}")
        row = ctx.disease_row(p, dx_vid, diag_rgst_ymd=index)

        # ---- 병기 결정 검사 (흉부·복부·골반 CT / MRI / CEA)
        ct_day = ctx.days(index, ctx.randint(3, 8))
        wvid = ctx.visit_on(p, ct_day)
        ctx.procedure(p, ct_day, 4304092, vid=wvid)
        ctx.procedure(p, ct_day, 4058335, vid=wvid)
        node_txt = "enlarged regional lymph nodes" if nn != "N0" else "no significant regional lymphadenopathy"
        abd_mets = [s for s in mets if s != "Lung"]
        met_txt = " ".join(MET_TXT[s] for s in abd_mets) if abd_mets else "No distant metastasis in the abdomen and pelvis."
        ctx.note(p, ct_day, CT_REPORT.format(site=site_nm.lower(), size=size, node=node_txt, met=met_txt, tnm=f"c{t}{nn}{m}"),
                 note_type=32841, note_class=46235057, vid=wvid)
        chest_txt = ("Multiple bilateral pulmonary nodules (largest 1.2 cm), compatible with lung metastases." if "Lung" in mets
                     else "No pulmonary metastasis.")
        ctx.note(p, ct_day, CT_CHEST_REPORT.format(chest=chest_txt), note_type=32841, note_class=46235057, vid=wvid)
        low = False
        if rectal or kcd == "C19":
            ctx.procedure(p, ct_day, 4097527, vid=wvid)
            anvg = round(ctx.rand(2.0, 12.0), 2) if rectal else round(ctx.rand(12.0, 16.0), 2)
            low = anvg < 5
            ctx.note(p, ct_day, f"Rectal MRI. Tumor lower margin {anvg} cm from anal verge. mrT{t[1:]}, mrN{nn[1:]}. "
                                f"Shortest distance to mesorectal fascia {round(ctx.rand(0.5, 15), 1)} mm.",
                     note_type=32841, note_class=46235057, vid=wvid)
        ctx.labs(p, ct_day, [3000963, 3010813, 3017732, 3024929, 3016723, 3013721, 3006923, 3024561, 3024128], vid=wvid)
        cea0 = _cea0(ctx)
        cea = _cea_dx(ctx, cea0, stage)
        ctx.measure(p, ct_day, 3003785, cea, vid=wvid)
        stag_day = ct_day
        if stage == "IV" and (ctx.bern(0.6) or "Bone" in mets):
            stag_day = ctx.days(ct_day, ctx.randint(2, 6)); pv = ctx.visit_on(p, stag_day)
            ctx.procedure(p, stag_day, 42872445, vid=pv)
        if "Peritoneum" in mets and ctx.bern(0.5):
            row["inap_dsnt_mtst_site_etc_cont"] = ("Peritoneal seeding with liver metastasis" if "Liver" in mets
                                                   else "Peritoneal carcinomatosis, multiple sites")
        elif "Liver" in mets and "Distant lymph node" in mets and ctx.bern(0.5):
            row["inap_dsnt_mtst_site_etc_cont"] = "Liver and para-aortic lymph node metastases"

        # ---- 2) 치료
        last = max(stag_day, ctx.days(index, 10))
        surgery_day, adj_sid, had_oxali, oxali_end = None, None, False, None
        curative = False
        ccrt = rectal and stage in ("II", "III") and ecog <= 2
        pt, pn, pm = t, nn, "M0"
        if stage in ("I", "II", "III") and ecog <= 2:
            curative = True
            if ccrt:
                s = ctx.days(last, ctx.randint(10, 21))
                s = ctx.days(s, (7 - s.weekday()) % 7)           # 방사선은 월요일 시작
                # capecitabine 은 방사선 시행일(월~금)에만: 첫 주 블록(sact) + 4개 주 블록 5일 + 마지막 주 3일 = 28일 = 분할 수
                sid, e, cyc = ctx.sact(p, "Capecitabine (preoperative CCRT)", [CAPE], s, 1, 1, ecog=ecog, response="NE", cycle_days=42,
                                       drug_days={CAPE: 5}, dose_overrides={CAPE: 825})
                for wk in range(1, 6):
                    wd = ctx.days(s, 7 * wk)
                    if wd <= ctx.today:
                        _, ee = ctx.drug(p, wd, CAPE, 5 if wk < 5 else 3, vid=ctx.visit_on(p, wd), sact_id=sid, dose=825, freq=2)
                        e = max(e, ee)
                e = ctx.monitor(p, cyc, [CAPE], ae_p=0.3, ae_pool=_pool([CAPE]))      # 일정 변경이 반영된 실제 종료일
                rvid = ctx.visit_on(p, s)
                ctx.procedure(p, s, 1242725, vid=rvid)
                ctx.note(p, s, "Preoperative long-course chemoradiotherapy: 50.4 Gy in 28 fractions (Monday-Friday) to the pelvis concurrent "
                               "with capecitabine 825 mg/m2 twice daily on radiation days only.", note_type=32831, note_class=3000735, vid=rvid)
                for wk in (14, 28):                              # 주간 혈액검사
                    ld = ctx.days(s, wk)
                    if ld <= ctx.today:
                        ctx.labs(p, ld, [3000963, 3010813, 3017732, 3024929], vid=ctx.visit_on(p, ld))
                # 방사선 치료 중 설사 등 이상사례는 ctx.monitor 가 기록한다.
                rs_day = ctx.days(e, ctx.randint(35, 50))
                ctx.procedure(p, rs_day, 4097527, vid=ctx.visit_on(p, rs_day))
                trg = ctx.choice(["1", "2", "3", "4"], p=[0.15, 0.35, 0.35, 0.15])
                ctx.note(p, rs_day, f"Rectal MRI after CCRT. mrTRG {trg} ({TRG_TXT[trg]}).", note_type=32841, note_class=46235057)
                ctx.sact_update(sid, best_overall_response={"1": "CR", "2": "PR", "3": "PR", "4": "SD"}[trg])
                surgery_day = ctx.days(rs_day, ctx.randint(7, 21))
                if trg == "1": pt, pn = "T0", "N0"
                elif trg == "2":
                    pt = {"T4b": "T3", "T4a": "T3", "T3": "T2", "T2": "T1"}.get(t, t); pn = "N0" if ctx.bern(0.7) else "N1a"
                else:
                    pt = t if ctx.bern(0.7) else {"T4b": "T4a", "T4a": "T3", "T3": "T3", "T2": "T2"}[t]
                    pn = nn if ctx.bern(0.6) else ctx.choice(["N0", "N1a", "N1b"])
            else:
                surgery_day = ctx.days(last, ctx.randint(10, 30))
                pt = t if ctx.bern(0.8) else ctx.choice(["T2", "T3", "T4a"])
                pn = nn if ctx.bern(0.75) else ctx.choice(["N0", "N1a", "N1b", "N2a"])
            dsch, ostomy = _surgery(ctx, p, row, surgery_day, kcd, site_nm, side, rectal, low, obstruction, perforation, "CUR")
            last = dsch
            _pathology(ctx, p, row, surgery_day, rectal, kcd, hist_cd, grade, pt, pn, pm, ccrt, size, mmr, lvi)
            path_stage = "III" if pn != "N0" else ("II" if pt in ("T3", "T4a", "T4b") else "I")
            hi_risk_ii = pt in ("T4a", "T4b") or obstruction or perforation or lvi or grade == "G3"
            offer = (path_stage == "III" or (path_stage == "II" and not mmr_def and ctx.bern(0.75 if hi_risk_ii else 0.1))
                     or (path_stage == "I" and ccrt and ctx.bern(0.3)))
            if offer:
                s = ctx.days(surgery_day, ctx.randint(28, 50))
                po = ctx.days(s, -2)                             # 보조 시작 전 외래: 수술 후 CEA 정상화 확인
                if po <= ctx.today:
                    ctx.measure(p, po, 3003785, _cea_follow(ctx, cea0), vid=ctx.visit_on(p, po))
                hi = pt in ("T4a", "T4b") or pn in ("N2a", "N2b")
                reg, ncy = _adjuvant(ctx, p.age_on(s), ecog, hi, ccrt)
                ncy = _cap_cycles(ctx, s, ncy, reg["cd"])
                if ncy > 0:
                    adj_sid, e, cyc = _give(ctx, p, reg, s, ncy, 2, ecog)
                    e = ctx.monitor(p, cyc, reg["drugs"], ae_pool=_pool(reg["drugs"]))   # 감량·휴약·중단이 반영된 실제 종료일
                    if OXALI in reg["drugs"]:
                        had_oxali, oxali_end = True, e
                    last = e
            if ostomy and ostomy["temporary"] and ctx.bern(0.8):
                rd = ctx.days(max(ctx.days(surgery_day, 90), ctx.days(last, 30)), ctx.randint(0, 90))
                if rd <= ctx.today:
                    rvid = ctx.visit(p, rd, INPATIENT, los=5)
                    ctx.labs(p, ctx.days(rd, 1), [3000963, 3010813, 3016723], vid=rvid)
                    last = max(last, ctx.days(rd, 5))
        elif stage == "IV":
            ctx.note(p, ctx.days(stag_day, ctx.randint(5, 9)), _molecular_text(ctx, mmr), note_type=32835, note_class=3031451)
            st = dict(ecog=ecog, cea0=cea0, cea=cea, sites=list(mets))
            if obstruction and ctx.bern(0.7):
                sd = ctx.days(last, ctx.randint(3, 14))
                surgery_day = sd
                dsch, _ = _surgery(ctx, p, row, sd, kcd, site_nm, side, rectal, low, obstruction, perforation, "PAL")
                _pathology(ctx, p, row, sd, rectal, kcd, hist_cd, grade, t, nn, m, False, size, mmr, lvi)
                last = dsch
            s = ctx.days(last, ctx.randint(10, 25))
            if surgery_day is not None:                 # bevacizumab 병용 요법은 대수술 후 최소 28일 뒤 시작
                s = max(s, ctx.days(surgery_day, 28))
            if ecog <= 2:
                _metastatic(ctx, p, st, s, "FOLFOX")
            else:
                ctx.observation(p, s, 36303470, vid=ctx.visit_on(p, s), value_number=ecog, value_string=f"ECOG {ecog}, best supportive care")
                _bsc_course(ctx, p, s, 0.6, 30, 240)
        else:
            ctx.observation(p, last, 36303470, vid=ctx.visit_on(p, last), value_number=ecog, value_string=f"ECOG {ecog}, not a surgical candidate")
            _bsc_course(ctx, p, last, 0.3, 180, 900)

        # ---- 3) 추적 및 재발 (근치 치료를 받은 환자)
        if curative and p.death_date is None:
            fu = ctx.days(last, 180)
            rec_p = {"I": 0.01, "II": 0.025, "III": 0.05}[stage]
            k = 0
            while fu <= ctx.today and k < 10 and p.death_date is None:
                # 재발은 확인·치료까지 이어지도록 검증일 45일 전까지의 추적에서만 만든다. dMMR 재발은 면역항암제 대상이라 만들지 않는다.
                recur = (not mmr_def) and ctx.days(fu, 45) <= ctx.today and ctx.bern(rec_p)
                fvid = ctx.visit_on(p, fu)
                ctx.procedure(p, fu, 4304092, vid=fvid)
                ctx.procedure(p, fu, 4058335, vid=fvid)
                cea_v = round(cea0 * ctx.rand(1.8, 6.0), 1) if recur else _cea_follow(ctx, cea0)
                ctx.measure(p, fu, 3003785, cea_v, vid=fvid)
                if k in (1, 5):                                  # 대장내시경 1·3년
                    ctx.procedure(p, fu, 40489328, vid=fvid)
                if not recur:
                    ctx.note(p, fu, "CT chest, abdomen and pelvis: no evidence of recurrence.", note_type=32841, note_class=46235057, vid=fvid)
                    fu = ctx.days(fu, ctx.randint(170, 190)); k += 1
                    continue
                site_r = "Anastomotic site (local recurrence)" if ctx.bern(0.25) else ctx.choice(MET_SITES, p=MET_P)
                ctx.note(p, fu, f"CT chest, abdomen and pelvis: new {site_r.lower()} lesion, suspicious for recurrence. CEA {cea_v} ng/mL.",
                         note_type=32841, note_class=46235057, vid=fvid)
                conf = ctx.days(fu, ctx.randint(4, 10))
                cvid = ctx.visit_on(p, conf)
                if site_r.startswith("Anastomotic"):
                    ctx.procedure(p, conf, 40489328, vid=cvid)
                    ctx.note(p, conf, "Anastomosis, endoscopic biopsy: adenocarcinoma, consistent with recurrence.",
                             note_type=32835, note_class=3031451, vid=cvid)
                elif site_r == "Liver":
                    ctx.procedure(p, conf, 4314001, vid=cvid)
                    ctx.note(p, conf, "Liver, needle biopsy: metastatic adenocarcinoma, compatible with colorectal origin (CK20+, CDX2+).",
                             note_type=32835, note_class=3031451, vid=cvid)
                else:
                    ctx.procedure(p, conf, 42872445, vid=cvid)
                    ctx.note(p, conf, f"FDG PET/CT: FDG-avid {site_r.lower()} lesion (SUVmax {round(ctx.rand(5, 14), 1)}), consistent with recurrence.",
                             note_type=32841, note_class=46235057, vid=cvid)
                mol = ctx.days(conf, ctx.randint(3, 6))
                ctx.note(p, mol, _molecular_text(ctx, mmr), note_type=32835, note_class=3031451)
                if adj_sid is not None:
                    ctx.sact_update(adj_sid, date_of_progression=fu, recurrence_anatomic_site=site_r)
                st = dict(ecog=ecog, cea0=cea0, cea=cea_v, sites=[site_r])
                # 보조 oxaliplatin 종료 12개월 이내 재발이면 oxaliplatin 을 쓰지 않는 FOLFIRI 로 시작한다.
                backbone = "FOLFIRI" if (had_oxali and (fu - oxali_end).days < 365) else "FOLFOX"
                _metastatic(ctx, p, st, ctx.days(mol, ctx.randint(3, 10)), backbone)
                break
        ctx.finalize_person(p)
