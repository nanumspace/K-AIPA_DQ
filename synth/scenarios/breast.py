# -*- coding: utf-8 -*-
"""
유방암 코호트 시나리오. 특화 테이블 BREAST_CANCER 는 환자당 1행(진단 방문)이며
진단정보 등록일(diag_rgst_ymd), 폐경 상태, 임신/분만/출산 후 1년/가임력 보존 치료 여부를 담는다 (남성은 해당 항목이 모두 4=Not Applicable).

여정: 진단 외래(유방촬영·침생검) → 병리/IHC → 병기(III·IV기만 전신 영상) → 선행항암 → 수술 → 보조치료 → 방사선 → 내분비치료 → 추적,
      재발 시 전이성 요법. 호르몬제(category 3)도 모두 SACT 로 묶는다.

아형별 치료(근거: NCCN Breast Cancer / ESMO Early Breast Cancer 가이드라인 현행판)
  선행항암 대상 = HER2+ · TNBC 의 cT2 이상 또는 cN+, HR+/HER2- 의 T3/T4·N2 일부. cT1 N0 의 HER2+ 는 수술 후 APT, TNBC(T1b/c)는 수술 후 TC.
  HER2+  선행 TCHP(docetaxel+carboplatin AUC 6+trastuzumab+pertuzumab ×6) → 수술 → trastuzumab+pertuzumab 으로 1년 완료.
         [시나리오 선택 편향 — 반응률이 아님] 잔존병변 표준인 T-DM1 이 약물 목록에 없어, 선행 요법을 한 HER2+ 는 병리학적 완전관해(pCR)가
         확인된 경우만 만든다. 생성된 pCR 100% 는 이 코호트의 치료 효과·실제 pCR 비율을 뜻하지 않으며, T-DM1 없이 잔존병변에
         trastuzumab 만 이어가는 사례를 만들지 않으려는 선택이다. 보조 APT: paclitaxel 80 mg/m2 주 1회 ×12
         + trastuzumab(첫 주 4 mg/kg, 이후 주 2 mg/kg) → trastuzumab 6 mg/kg q3w ×13. 3주 간격 trastuzumab 8 mg/kg 부하는 프레임워크가 자동 적용.
  TNBC   cT2 이상/cN+ 선행: carboplatin(AUC 5 q3w) + paclitaxel 80 mg/m2 주 1회 ×12 → AC ×4 → 수술. 면역항암(pembrolizumab, KEYNOTE-522; 2020 발표,
         2021-07 FDA 승인)은 시작일이 2021-07-01 이후인 사례에만 병용·보조(×9, pCR 무관)하고 그 전에는 쓰지 않는다. 잔존병변 시 capecitabine 병용은
         시험 근거가 부족해 만들지 않는다.
  HR+    HER2- 는 보조 화학요법(Oncotype·림프절) 후 내분비치료 5년(폐경 후 AI, 그 외 tamoxifen). HER2+ 도 내분비치료를 이어간다.
  심장 감시: trastuzumab 투여 전 기저 심초음파, 투여 중 12주마다 심초음파, anthracycline 전 기저 심초음파를 NOTE 로 남긴다
         (심초음파 시술·LVEF 측정 concept 가 목록에 없어 PROCEDURE/MEASUREMENT 행은 만들지 않는다).
  전이성  HER2+: THP ×6 → trastuzumab+pertuzumab 유지(HR+ 면 내분비 병용) → 진행 시 capecitabine+trastuzumab (T-DM1/T-DXd 는 목록에 없음).
         HR+/HER2-: 폐경 후 palbociclib+letrozole(난소기능억제제가 목록에 없어 폐경 전은 tamoxifen 단독) → capecitabine/paclitaxel.
         TNBC: carboplatin+paclitaxel → capecitabine.
  뇌전이는 흉부/복부 CT·PET-CT 가 아니라 뇌 MRI 판독 NOTE 로 확인한다(뇌 MRI 시술 concept 없음).
  carboplatin 용량은 Calvert 식(AUC × (CrCl+25), CrCl 은 직전 기록된 크레아티닌·체중·나이·성별로 Cockcroft-Gault, 크레아티닌 하한 0.7, GFR 상한 125)으로 산출한다.
  주 1회 paclitaxel 은 80 mg/m2, 주 1회 carboplatin 은 AUC 2.
"""
from framework import *

BC_INV, BC_DCIS = 4112853, 81250
CT_CHEST, CT_ABD, PET_CT, LIVER_BX, CORE_BX, MMG, RT = 4058335, 4304092, 42872445, 4314001, 4195312, 4324693, 1242725
DOXO, CYCLO, DOCETAXEL, PACLITAXEL, CARBO, CAPE = 1338512, 1310317, 1315942, 1378382, 1344905, 1337620
TRAST, PERTU, PEMBRO = 1387104, 42801287, 45775965
PALBO, LETROZOLE, ANASTROZOLE = 45892075, 1315946, 1348265
DEX, ONDAN, FILGRASTIM = 1518254, 1000560, 1304850
IO_DATE = D(2021, 7, 1)                  # KEYNOTE-522 FDA 승인: 이 날 이후 시작한 TNBC 선행요법에만 pembrolizumab
HIST = {"IDC": "Invasive ductal carcinoma, NOS", "ILC": "Invasive lobular carcinoma", "MUC": "Mucinous carcinoma",
        "DCIS": "Ductal carcinoma in situ"}
LOC = [("UOQ", "Upper outer quadrant"), ("UIQ", "Upper inner quadrant"), ("LOQ", "Lower outer quadrant"),
       ("LIQ", "Lower inner quadrant"), ("CEN", "Central portion")]
LOC_P = [0.5, 0.15, 0.13, 0.1, 0.12]
TSIZE = {"Tis": (0.5, 4.0), "T1a": (0.2, 0.5), "T1b": (0.6, 1.0), "T1c": (1.1, 2.0), "T2": (2.1, 5.0), "T3": (5.1, 8.0),
         "T4b": (3.0, 9.0)}
STAGE_TNM = {"I": ([("T1a", "N0"), ("T1b", "N0"), ("T1c", "N0")], [0.1, 0.25, 0.65]),
             "II": ([("T1c", "N1"), ("T2", "N0"), ("T2", "N1")], [0.2, 0.4, 0.4]),
             "III": ([("T3", "N1"), ("T2", "N2"), ("T4b", "N1")], [0.4, 0.35, 0.25]),
             "IV": ([("T2", "N1"), ("T3", "N2"), ("T4b", "N2"), ("T2", "N0")], [0.35, 0.3, 0.2, 0.15])}
SUBTYPES = ["HR+/HER2-", "HR+/HER2+", "HR-/HER2+", "TNBC"]
# 진단 시 병기 영상(CT·PET-CT)으로 확인 가능한 전이 부위. 뇌는 MRI 로만 확인하므로 진행/재발 때만 쓴다.
DX_MET_SITES = [("Bone",), ("Liver",), ("Lung",), ("Distant lymph node",)]
DX_MET_P = [0.45, 0.22, 0.22, 0.11]
MET_SITES = [("Bone",), ("Liver",), ("Lung",), ("Brain",), ("Distant lymph node",)]
MET_P = [0.4, 0.2, 0.2, 0.08, 0.12]
REC_SITES = [("Ipsilateral breast / chest wall", False), ("Regional axillary lymph node", False)] + \
            [(s[0], True) for s in MET_SITES]
REC_P = [0.2, 0.1, 0.28, 0.14, 0.14, 0.06, 0.08]
AE_CHEMO = ((31967, 0.18), (441408, 0.08), (320073, 0.2), (4250734, 0.06), (439777, 0.12), (4117779, 0.12),
            (4223659, 0.12), (138455, 0.04), (196523, 0.05), (432870, 0.03))
AE_CAPE = ((196523, 0.3), (138455, 0.2), (140214, 0.25), (4223659, 0.15), (31967, 0.1))
AE_HORM = ((4223659, 0.6), (140214, 0.2), (31967, 0.2))
AE_CDK = ((320073, 0.5), (4223659, 0.2), (31967, 0.15), (196523, 0.15))
LAB_FEW = (3000963, 3016723)

MMG_REPORT = ("Bilateral digital mammography with tomosynthesis. {lat} breast: {size} cm {shape} at the {loc}. Axilla: {ax}. "
              "Contralateral breast: no suspicious finding. Impression: BI-RADS {birads}. Recommend ultrasound-guided core needle biopsy.")
BX_REPORT = ("Breast, {lat}, {loc}, ultrasound-guided core needle biopsy: {hist}. Nottingham histologic grade {grade}. "
             "Immunohistochemistry: ER {er}% ({erp}), PR {pr}% ({prp}), HER2 IHC {her2}{fish}, Ki-67 labeling index {ki}%. "
             "Molecular subtype: {sub}.")
CT_REPORT = ("CT chest, abdomen and pelvis with contrast. {lat} breast mass {size} cm. {node}. {met} "
             "Impression: breast cancer, c{t}{n}{m}.")
SP_REPORT = ("Breast, {lat}, {op}{slnb}: {hist}. Tumor size {size} cm. Lymphovascular invasion: {lvi}. "
             "Resection margins: {margin}. Lymph nodes: {psln}/{tsln} positive. Pathologic stage {t}{n}M0.{resp}")


def _room(ctx, p):
    return min(ctx.today, p.death_date) if p.death_date is not None else ctx.today


def _plan(ctx, age, gender):
    """환자 수준 임상 특성(조직형/병기/아형/폐경/동반질환)."""
    st = {}
    st["hist"] = "IDC" if gender == MALE else ctx.choice(["IDC", "ILC", "MUC", "DCIS"], p=[0.74, 0.09, 0.04, 0.13])
    dcis = st["hist"] == "DCIS"
    st["loc"] = ctx.choice(LOC, p=LOC_P)
    st["lat"] = ctx.choice(["R", "L"])
    if dcis:
        st["stage"], T, N, M = "0", "Tis", "N0", "M0"
    else:
        st["stage"] = ctx.choice(["I", "II", "III", "IV"], p=[0.40, 0.35, 0.15, 0.10])
        opts, pr = STAGE_TNM[st["stage"]]
        i = ctx.choice(list(range(len(opts))), p=pr)
        T, N = opts[i]
        M = "M1" if st["stage"] == "IV" else "M0"
    st.update(T=T, N=N, M=M, size=round(ctx.rand(*TSIZE[T]), 1))
    if dcis:
        sub = "HR+/HER2-" if ctx.bern(0.8) else "TNBC"
    elif gender == MALE:
        sub = "HR+/HER2-"
    else:
        sub = ctx.choice(SUBTYPES, p=[0.65, 0.10, 0.08, 0.17])
    st["sub"], st["hr"], st["her2"] = sub, sub.startswith("HR+"), "HER2+" in sub
    st["er"] = ctx.randint(60, 100) if st["hr"] else 0
    st["pr"] = (0 if ctx.bern(0.2) else ctx.randint(5, 100)) if st["hr"] else 0
    if st["her2"]:
        st["her2_ihc"] = 3 if ctx.bern(0.8) else 2
        st["fish"] = round(ctx.rand(2.2, 8.0), 2) if st["her2_ihc"] == 2 else None
    else:
        st["her2_ihc"] = ctx.choice([0, 1, 2], p=[0.5, 0.35, 0.15])
        st["fish"] = round(ctx.rand(1.0, 1.7), 2) if st["her2_ihc"] == 2 else None
    st["ki67"] = ctx.randint(40, 90) if sub == "TNBC" and not dcis else (ctx.randint(20, 70) if st["her2"] else ctx.randint(5, 35))
    if dcis:
        st["grade"] = ctx.choice([1, 2, 3], p=[0.3, 0.45, 0.25])
    elif sub == "TNBC" or st["her2"]:
        st["grade"] = ctx.choice([2, 3], p=[0.3, 0.7])
    else:
        st["grade"] = ctx.choice([1, 2, 3], p=[0.25, 0.55, 0.2])
    if gender == MALE:
        st["meno"] = 4
    elif age < 45:
        st["meno"] = 1 if ctx.bern(0.97) else 3
    elif age < 55:
        st["meno"] = ctx.choice([1, 2, 3], p=[0.48, 0.48, 0.04])
    else:
        st["meno"] = 2 if ctx.bern(0.97) else 3
    st["ecog"] = ctx.choice([0, 1, 2], p=[0.3, 0.5, 0.2]) if st["stage"] == "IV" else ctx.choice([0, 1, 2], p=[0.6, 0.35, 0.05])
    st["htn"] = ctx.bern(0.2 + (0.2 if age > 60 else 0))
    st["dm"] = ctx.bern(0.08 + (0.1 if age > 60 else 0))
    st["hl"] = ctx.bern(0.2)
    return st


def _breast_row(ctx, p, st, vid, index, age, plan_chemo):
    """BREAST_CANCER 환자당 1행: 진단정보 등록일 + 폐경/임신/분만/출산 후/가임력 보존."""
    meno = st["meno"]
    if p.gender == MALE:
        return ctx.disease_row(p, vid, diag_rgst_ymd=index, menopause_status=4, pregnant_at_diagnosis=4,
                               history_of_live_birth=4, postpartum_at_diagnosis=4, fertility_history=4,
                               fertility_treatment_type=None)
    live = age >= 23 and ctx.bern(0.78)
    unknown_hx = ctx.bern(0.02)
    pregnant = 1 if (meno == 1 and 18 <= age <= 45 and ctx.bern(0.03)) else 2
    post = 1 if (live and age <= 42 and meno == 1 and ctx.bern(0.05)) else 2
    fert = meno == 1 and age <= 40 and plan_chemo and ctx.bern(0.55)
    f = dict(diag_rgst_ymd=index, menopause_status=meno, pregnant_at_diagnosis=pregnant,
             history_of_live_birth=3 if unknown_hx else (1 if live else 2),
             postpartum_at_diagnosis=post, fertility_history=1 if fert else 2,
             fertility_treatment_type=ctx.choice([1, 2, 3, 4, 5], p=[0.45, 0.2, 0.1, 0.1, 0.15]) if fert else None)
    if unknown_hx:
        f["postpartum_at_diagnosis"] = 3 if post == 2 else post
    return ctx.disease_row(p, vid, **f)


def _sact(ctx, p, name, drugs, start, cycles, intent, ecog, resp, cycle_days=None, oral=False, limit=None, **kw):
    """SACT 래퍼: 마지막 사이클 투여가 오늘/사망/limit 을 넘지 않도록 주기 수를 줄인다. 1주기도 못 넣으면 None.
    kw 는 ctx.sact 로 그대로 전달(drug_days, dose_overrides)."""
    cd = cycle_days or max(CONCEPTS["drugs"][c]["cycle_days"] or 21 for c in drugs)
    hi = min(x for x in (ctx.today, p.death_date, limit) if x is not None)
    span = cd if (oral or any(CONCEPTS["drugs"][c]["route"] == "PO" for c in drugs)) else 1
    room = (hi - start).days - span + 1
    if room < 0:
        return None
    cycles = min(cycles, room // cd + 1)
    sid, end, cyc = ctx.sact(p, name, drugs, start, cycles, intent, ecog=ecog, response=resp, cycle_days=cd, oral=oral, **kw)
    return sid, end, cyc


def _mon(ctx, p, cyc, drugs, pool=AE_CHEMO, ae_p=0.45, labs=True):
    return ctx.monitor(p, cyc, drugs, ae_p=ae_p, ae_pool=pool, labs=(3000963, 3010813, 3017732, 3024929, 3016723, 3013721, 3006923) if labs else LAB_FEW)


def _premed(ctx, p, cyc, drugs, weekly=False):
    """항암 전처치/지지요법. AC·cisplatin = 고위험 구토(ondansetron+dexamethasone 3일), carboplatin(3주 간격) = 중등도(2일),
    docetaxel = dexamethasone 3일, paclitaxel = dexamethasone 1일. TC 는 filgrastim 1차 예방."""
    last = _room(ctx, p)
    high = DOXO in drugs
    mod = CARBO in drugs and not weekly
    dex = 3 if (high or DOCETAXEL in drugs) else 2 if mod else 1 if PACLITAXEL in drugs else 0
    ond = 3 if high else 2 if mod else 0
    for d in cyc:
        vid = ctx.visit_on(p, d)
        for c, n in ((ONDAN, ond), (DEX, dex)):
            if n:
                ctx.drug(p, d, c, min(n, (last - d).days + 1), vid=vid, freq=1)
        if DOCETAXEL in drugs and CYCLO in drugs:
            g = ctx.days(d, 2)
            if g <= last:
                ctx.drug(p, g, FILGRASTIM, min(3, (last - g).days + 1), vid=ctx.visit_on(p, g), freq=1)


def _weekly_in_cycles(ctx, p, sid, cyc, concept, dose, per_cycle=3):
    """3주 주기 요법 안의 주 1회 투여(예: KEYNOTE-522 의 paclitaxel). 마지막 투여일 반환."""
    last, end = _room(ctx, p), None
    for d in cyc:
        for k in range(per_cycle):
            dd = ctx.days(d, 7 * k)
            if dd > last:
                return end
            ctx.drug(p, dd, concept, 1, vid=ctx.visit_on(p, dd), sact_id=sid, dose=dose, interval=7)
            end = dd
    return end


def _echo(ctx, p, day, why):
    if day > _room(ctx, p):
        return
    ctx.note(p, day, f"Transthoracic echocardiography ({why}): LVEF {ctx.randint(56, 68)}%. No regional wall motion abnormality.",
             vid=ctx.visit_on(p, day))


def _echo_series(ctx, p, start, end, why):
    """심장 감시: 첫 투여 7일 전 기저 검사, 이후 12주마다."""
    _echo(ctx, p, ctx.days(start, -7), f"baseline before {why}")
    d = ctx.days(start, 84)
    while d <= end:
        _echo(ctx, p, d, "surveillance during trastuzumab")
        d = ctx.days(d, 84)


def _pd_imaging(ctx, p, day, site, tail):
    """진행/재발 부위에 맞는 영상. 뇌=MRI 판독 NOTE, 뼈=PET-CT, 간=복부 CT(+조직), 폐/림프절=흉부·복부 CT."""
    vid = ctx.visit_on(p, day)
    if site == "Brain":
        ctx.note(p, day, f"MRI brain with contrast (neurologic symptoms): new enhancing intracranial lesion(s). {tail}", vid=vid)
    elif site == "Bone":
        ctx.procedure(p, day, PET_CT, vid=vid)
        ctx.note(p, day, f"FDG PET-CT: new hypermetabolic osseous lesion(s). {tail}", vid=vid)
    else:
        ctx.procedure(p, day, CT_ABD, vid=vid)
        if site == "Lung":
            ctx.procedure(p, day, CT_CHEST, vid=vid)
        ctx.note(p, day, f"CT chest/abdomen/pelvis: interval increase of known lesions and new {site.lower()} metastases. {tail}", vid=vid)
    return vid


def _surgery(ctx, p, st, day, nact, salvage=False):
    """수술 입원. 반환 (svid, bcs, los)."""
    T = st["T"]
    if salvage or p.gender == MALE:
        bcs = False
    elif st["hist"] == "DCIS":
        bcs = ctx.bern(0.7)
    elif nact:
        bcs = ctx.bern(0.5)
    else:
        bcs = T in ("T1a", "T1b", "T1c", "T2") and st["size"] <= 3.0 and ctx.bern(0.7)
    los = 3 if bcs else 6
    svid = ctx.visit(p, day, INPATIENT, los=los)
    ctx.procedure(p, day, 4275911 if bcs else 37164749, vid=svid)
    slnb = not (st["hist"] == "DCIS" and bcs) and not salvage
    if slnb:
        ctx.procedure(p, day, 4263386, vid=svid)
    st["slnb"] = slnb
    ctx.labs(p, ctx.days(day, 1), [3000963, 3010813, 3016723], vid=svid)
    if ctx.bern(0.15):
        ctx.ae(p, ctx.days(day, 2), 437663, 1, vid=svid)
    return svid, bcs, los


def _surg_path(ctx, p, st, op_day, nact, bcs, salvage=False):
    """외과병리 노트. 반환 (path_day, pN, pcr)."""
    T, N = st["T"], st["N"]
    path_day = ctx.days(op_day, ctx.randint(4, 9))
    pvid = ctx.visit_on(p, path_day)
    pcr = False
    if salvage:
        pT, pN, psize = "T2", "NX", round(ctx.rand(1.0, 4.0), 1)
    elif nact:
        # HER2+ 선행요법은 pCR 만 만든다(잔존병변 표준 T-DM1 이 약물 목록에 없음)
        pcr = True if st["her2"] else ctx.bern({"TNBC": 0.45}.get(st["sub"], 0.12))
        if pcr:
            pT, pN, psize = "yT0", "yN0", 0.0
        else:
            t = ctx.choice(["T1a", "T1b", "T1c", "T2"], p=[0.15, 0.25, 0.35, 0.25])
            pT, psize = "y" + t, round(ctx.rand(*TSIZE[t]), 1)
            pN = "y" + ("N0" if (N == "N0" or ctx.bern(0.5)) else ctx.choice(["N1", "N2"], p=[0.7, 0.3]))
    else:
        t = "Tis" if st["hist"] == "DCIS" else (T if ctx.bern(0.8) else ctx.choice(["T1b", "T1c", "T2"]))
        pT, psize = t, round(ctx.rand(*TSIZE[t]), 1)
        if st["hist"] == "DCIS":
            pN = "N0" if st["slnb"] else "NX"
        else:
            pN = N if ctx.bern(0.75) else ctx.choice(["N0", "N1", "N2"], p=[0.5, 0.35, 0.15])
    nn = pN.lstrip("y")
    if nn == "N2":                      # pN2 = 양성 림프절 4~9개 → 전액와 림프절 수 기준
        tot = ctx.randint(6, 14)
        pos = ctx.randint(4, min(9, tot))
    elif st["slnb"]:
        tot = ctx.randint(1, 5)
        pos = 0 if nn == "N0" else ctx.randint(1, min(3, tot))
    else:
        tot = pos = "-"
    lvi = (not pcr) and ctx.bern(0.3 if nn != "N0" else 0.12)
    resp = ""
    if nact:
        resp = " Miller-Payne grade 5 (no residual invasive tumor)." if pcr else f" Miller-Payne grade {ctx.randint(2, 4)} (partial response)."
    ctx.note(p, path_day, SP_REPORT.format(
        lat="right" if st["lat"] == "R" else "left", op="partial mastectomy" if bcs else "total mastectomy",
        slnb=" with sentinel lymph node biopsy" if st["slnb"] else "",
        hist="No residual invasive carcinoma (pathologic complete response)" if pcr else HIST[st["hist"]], size=psize,
        lvi="present" if lvi else "absent", margin=ctx.choice(["negative margin (>= 2 mm)", "close margin (< 2 mm)"], p=[0.85, 0.15]),
        psln=pos, tsln=tot, t=pT, n=pN, resp=resp), note_type=32835, note_class=3031451, vid=pvid)
    return path_day, pN, pcr


def _rt(ctx, p, day, kind):
    rvid = ctx.visit_on(p, day)
    ctx.procedure(p, day, RT, vid=rvid)
    fx = ctx.choice([16, 25], p=[0.6, 0.4]) if kind == "WBI" else 25
    return ctx.days(day, int(fx * 1.4) + 3)


def _endocrine(ctx, p, st, start, ecog, limit=None):
    """보조 내분비치료 (84일 처방 단위, 최대 5년)."""
    if st["meno"] == 2 and ctx.bern(0.9):
        drug, name = (LETROZOLE, "Letrozole") if ctx.bern(0.6) else (ANASTROZOLE, "Anastrozole")
    else:
        drug, name = 1436678, "Tamoxifen"
    cycles = ctx.randint(2, 12) if ctx.bern(0.1) else 22
    r = _sact(ctx, p, name, [drug], start, cycles, 2, ecog, "NE", cycle_days=84, oral=True, limit=limit)
    if r is not None:
        _mon(ctx, p, r[2], [drug], AE_HORM, ae_p=0.08, labs=False)
    return r


def _palliative(ctx, p, st, start, ecog, first_intent=3):
    """전이/재발 후 전신치료 순차 라인. 반환 (last_end, last_sid).
    plan 항목: (이름, 약물, 주기일, 주기수, 호르몬/경구 구분, 목적, AE풀, AE확률, 경구여부, ctx.sact 추가 인자)"""
    ai = LETROZOLE if st["meno"] == 2 else None
    if st["her2"]:
        endo = [ai if ai else 1436678] if st["hr"] else []
        plan = [("Docetaxel + Trastuzumab + Pertuzumab (THP)", [DOCETAXEL, TRAST, PERTU], 21, 6, 2, first_intent, AE_CHEMO, 0.45, False, {}),
                ("Trastuzumab + Pertuzumab maintenance" + (" + endocrine" if endo else ""), [TRAST, PERTU] + endo, 21,
                 ctx.randint(6, 24), 2, 4, AE_HORM, 0.1, False, {}),
                ("Capecitabine + Trastuzumab", [CAPE, TRAST], 21, ctx.randint(4, 8), 1, 3, AE_CAPE, 0.4, False, {})]
    elif st["hr"]:
        if ai:      # 폐경 후: CDK4/6 억제제(21일 투여/7일 휴약) + letrozole
            cdk, cdk_nm = PALBO, "Palbociclib"
            first = (f"{cdk_nm} + Letrozole", [cdk, ai], 28, ctx.randint(6, 24), 3, first_intent, AE_CDK, 0.3, True, {"drug_days": {cdk: 21}})
        else:       # 난소기능억제제가 목록에 없어 폐경 전/남성은 tamoxifen 단독
            first = ("Tamoxifen", [1436678], 28, ctx.randint(6, 24), 3, first_intent, AE_HORM, 0.08, True, {})
        plan = [first,
                ("Capecitabine", [CAPE], 21, ctx.randint(4, 8), 1, 3, AE_CAPE, 0.4, True, {}),
                ("Weekly Paclitaxel", [PACLITAXEL], 7, ctx.randint(8, 18), 1, 3, AE_CHEMO, 0.45, False, {"dose_overrides": {PACLITAXEL: 80}})]
    else:
        plan = [("Weekly Paclitaxel + Carboplatin", [PACLITAXEL, CARBO], 7, 12, 1, first_intent, AE_CHEMO, 0.45, False,
                 {"dose_overrides": {PACLITAXEL: 80, CARBO: lambda d, v: ctx.calvert_dose(p, d, 2, v)}}),
                ("Capecitabine", [CAPE], 21, ctx.randint(4, 8), 1, 3, AE_CAPE, 0.4, True, {})]
    last_end, last_sid, cur, cur_ecog = start, None, start, ecog
    for i, (name, drugs, cd, cycles, cat, intent, aes, ae_p, oral, kw) in enumerate(plan):
        r = _sact(ctx, p, name, drugs, cur, cycles, intent, cur_ecog, "NE", cycle_days=cd, oral=oral, **kw)
        if r is None:
            break
        sid, e, cyc = r
        e = _mon(ctx, p, cyc, drugs, aes, ae_p=ae_p, labs=cat != 3) or ctx.regimen_end(sid)
        last_end, last_sid = e, sid
        _premed(ctx, p, cyc, drugs, weekly=cd == 7)
        if TRAST in drugs:
            _echo_series(ctx, p, cyc[0], e, "trastuzumab-containing regimen")
        if i + 1 < len(plan) and plan[i + 1][5] == 4:          # 유지요법으로 이어짐
            ctx.sact_update(sid, best_overall_response=ctx.choice(["PR", "SD", "CR"], p=[0.6, 0.3, 0.1]))
            cur = ctx.days(e, 21)
            continue
        progressed = ctx.bern(0.65) and ctx.days(e, 60) <= ctx.today
        if progressed:
            pd_day = ctx.days(e, ctx.randint(0, 45))
            site = ctx.choice(MET_SITES, p=MET_P)[0]
            _pd_imaging(ctx, p, pd_day, site, "Progressive disease by RECIST 1.1.")
            ctx.sact_update(sid, date_of_progression=pd_day, recurrence_anatomic_site=site,
                            best_overall_response=ctx.choice(["PR", "SD", "PD"], p=[0.35, 0.4, 0.25]))
            last_end = pd_day
            cur_ecog = min(cur_ecog + 1, 3)
            if cur_ecog <= 2 and ctx.bern(0.75) and i + 1 < len(plan):
                cur = ctx.days(pd_day, ctx.randint(7, 21))
                continue
            break
        ctx.sact_update(sid, best_overall_response=ctx.choice(["PR", "SD", "CR"], p=[0.55, 0.35, 0.1]))
        break
    return last_end, last_sid


def _die(ctx, p, last_end):
    dd = ctx.days(last_end, ctx.randint(30, 300))
    if dd > ctx.today:
        return False
    ctx.set_death(p, dd)
    ctx.visit(p, ctx.days(dd, -2), INPATIENT, los=2)
    return True


def generate(ctx: Ctx, n=100):
    for i in range(n):
        gender = MALE if i % 100 == 50 else FEMALE          # 약 1% 남성
        age = int(ctx.normal(66 if gender == MALE else 52, 11, 26, 88, 0))
        index = D(2019, 1, 1) + dt.timedelta(days=ctx.randint(0, 2190))
        p = ctx.person(gender, age, index)
        st = _plan(ctx, age, gender)
        dcis = st["hist"] == "DCIS"
        T, N, M, sub, lat = st["T"], st["N"], st["M"], st["sub"], st["lat"]
        loc_nm = st["loc"][1]
        ecog = st["ecog"]
        lat_en = "Right" if lat == "R" else "Left"
        size = st["size"]

        # 치료 계획 플래그 (가임력 보존 결정에 필요하므로 미리 결정)
        nact_ind = T in ("T2", "T3", "T4b") or N != "N0"          # 선행항암 적응: cT2 이상 또는 cN+
        if M == "M1" or dcis:
            plan_nact, plan_adj_chemo = False, False
        elif st["her2"]:
            plan_nact = nact_ind
            plan_adj_chemo = (not nact_ind) and T in ("T1b", "T1c")      # cT1a N0 는 보조 항암 없이 내분비(해당 시)
        elif sub == "TNBC":
            plan_nact = nact_ind
            plan_adj_chemo = (not nact_ind) and T in ("T1b", "T1c")
        else:   # HR+/HER2-
            plan_nact = (T in ("T3", "T4b") or N in ("N2", "N3")) and ctx.bern(0.5)
            st["rs"] = ctx.choice([ctx.randint(0, 15), ctx.randint(16, 25), ctx.randint(26, 60)], p=[0.5, 0.35, 0.15])
            st["odx"] = (not plan_nact) and N in ("N0", "N1") and ctx.bern(0.6)
            plan_adj_chemo = (not plan_nact) and ((st["odx"] and st["rs"] >= 26) or (N != "N0" and ctx.bern(0.6)) or (T in ("T3", "T4b")))
        plan_chemo = plan_nact or plan_adj_chemo or M == "M1"

        # ---- 1) 진단 외래: 유방촬영 + 침생검
        dx_vid = ctx.visit(p, index, OUTPATIENT)
        ctx.condition(p, index, BC_DCIS if dcis else BC_INV, vid=dx_vid)
        if st["htn"]: ctx.condition(p, index, 320128, vid=dx_vid)
        if st["dm"]: ctx.condition(p, index, 201826, vid=dx_vid)
        if st["hl"]: ctx.condition(p, index, 432867, vid=dx_vid)
        ctx.procedure(p, index, MMG, vid=dx_vid)
        ctx.procedure(p, index, CORE_BX, vid=dx_vid)
        birads = ctx.choice(["4B", "4C", "5"], p=[0.3, 0.4, 0.3]) if dcis else ctx.choice(["4A", "4B", "4C", "5"], p=[0.08, 0.17, 0.3, 0.45])
        ctx.note(p, index, MMG_REPORT.format(
            lat=lat_en, size=size, loc=loc_nm.lower(),
            shape="segmental pleomorphic microcalcifications" if dcis else ctx.choice(["spiculated high-density mass", "irregular mass with indistinct margins"], p=[0.7, 0.3]),
            ax="enlarged dense lymph node in the axillary tail" if N != "N0" else "no abnormal lymph node", birads=birads), vid=dx_vid)
        _breast_row(ctx, p, st, dx_vid, index, age, plan_chemo)

        # ---- 병리/IHC 외래 (3~6일 후)
        path_day = ctx.days(index, ctx.randint(3, 6))
        pv = ctx.visit_on(p, path_day)
        her2_txt = {0: "0", 1: "1+", 2: "2+", 3: "3+"}[st["her2_ihc"]]
        fish_txt = f" (FISH HER2/CEP17 ratio {st['fish']}, {'amplified' if st['her2'] else 'not amplified'})" if st["fish"] else ""
        ctx.note(p, path_day, BX_REPORT.format(lat=lat_en.lower(), loc=loc_nm.lower(), hist=HIST[st["hist"]], grade=st["grade"],
                                                er=st["er"], erp="positive" if st["hr"] else "negative", pr=st["pr"],
                                                prp="positive" if st["pr"] > 0 else "negative", her2=her2_txt, fish=fish_txt,
                                                ki=st["ki67"], sub=sub if not dcis else ("ER-positive DCIS" if st["hr"] else "ER-negative DCIS")),
                 note_type=32835, note_class=3031451, vid=pv)
        ctx.result(p, path_day, ER_TEST, POSITIVE if st["hr"] else NEGATIVE, f"ER {st['er']}%", vid=pv, number=st["er"], unit=PERCENT)
        ctx.result(p, path_day, PR_TEST, POSITIVE if st["pr"] > 0 else NEGATIVE, f"PR {st['pr']}%", vid=pv, number=st["pr"], unit=PERCENT)
        ctx.result(p, path_day, HER2_TEST, POSITIVE if st["her2"] else NEGATIVE, f"HER2 IHC {her2_txt}{fish_txt}", vid=pv)
        ctx.observation(p, path_day, 36303470, vid=pv, value_number=ecog, value_string=f"ECOG {ecog}")
        ht = ctx.normal(170 if gender == MALE else 158, 5.5, 140, 190)
        wt = ctx.normal(70 if gender == MALE else 58, 9, 38, 110)
        bmi = round(wt / (ht / 100) ** 2, 1)
        ctx.measure(p, path_day, 3036277, ht, vid=pv); ctx.measure(p, path_day, 3025315, wt, vid=pv); ctx.measure(p, path_day, 3038553, bmi, vid=pv)
        if bmi >= 30: ctx.condition(p, path_day, 433736, vid=pv)
        ctx.labs(p, path_day, [3000963, 3010813, 3017732, 3024929, 3016723, 3013721, 3006923, 3024561, 3024128, 3003785], vid=pv)

        # ---- 병기 결정: 전신 영상은 III·IV기에서만(I·II기는 증상이 없으면 시행하지 않는다)
        if st["stage"] in ("0", "I", "II"):
            stage_day = path_day
        else:
            stage_day = ctx.days(index, ctx.randint(7, 14))
            svid_stage = ctx.visit_on(p, stage_day)
            ctx.procedure(p, stage_day, CT_CHEST, vid=svid_stage)
            ctx.procedure(p, stage_day, CT_ABD, vid=svid_stage)
            ctx.procedure(p, stage_day, PET_CT, vid=svid_stage)
            met = ctx.choice(DX_MET_SITES, p=DX_MET_P)[0] if M == "M1" else None
            node = "Enlarged axillary lymph nodes" if N != "N0" else "No significant lymphadenopathy"
            met_txt = f"Multiple metastatic lesions in {met.lower()}." if met else "No distant metastasis."
            ctx.note(p, stage_day, CT_REPORT.format(lat=lat_en, size=size, node=node, met=met_txt, t=T, n=N, m=M), vid=svid_stage)
            ctx.note(p, stage_day, f"Whole body FDG PET-CT. Hypermetabolic {lat_en.lower()} breast mass (SUVmax {round(ctx.rand(3.0, 15.0), 1)}). {node}. {met_txt} "
                                   "Brain not evaluable on FDG PET.", vid=svid_stage)
        ctx.result(p, stage_day, STAGE_TEST, STAGE_ANSWER[st["stage"]], f"c{T}{N}{M} stage {st['stage']}")

        # ---- 2) 치료
        surgery_day = None
        last_adj_end = stage_day          # 내분비치료를 제외한 마지막 국소/전신 치료 종료일
        chemo_end = None
        prior_bcs = False
        recur_day = None
        if M == "M1":
            start = ctx.days(stage_day, ctx.randint(7, 21))
            last_end, last_sid = _palliative(ctx, p, st, start, ecog)
            last_adj_end = last_end
            if last_sid is not None and ctx.bern(0.6):
                _die(ctx, p, last_end)
        else:
            nact = plan_nact
            tz_start = None                                     # trastuzumab 첫 투여일(심장 감시 구간 시작)
            use_io = False                                      # TNBC 선행요법에 pembrolizumab 을 쓴 경우만 보조 pembrolizumab
            if nact:
                s = ctx.days(index, ctx.randint(14, 28))
                if st["her2"]:
                    drugs = [DOCETAXEL, CARBO, TRAST, PERTU]
                    r = _sact(ctx, p, "Docetaxel + Carboplatin + Trastuzumab + Pertuzumab (TCHP)", drugs, s, 6, 1, ecog,
                              ctx.choice(["PR", "CR"], p=[0.4, 0.6]), dose_overrides={CARBO: lambda d, v: ctx.calvert_dose(p, d, 6, v)})
                    if r:
                        _mon(ctx, p, r[2], drugs); _premed(ctx, p, r[2], drugs)
                        tz_start = r[2][0]
                elif sub == "TNBC":
                    # KEYNOTE-522: pembrolizumab + carboplatin + paclitaxel(주 1회) → pembrolizumab + AC
                    _echo(ctx, p, ctx.days(s, -7), "baseline before anthracycline")
                    use_io = s >= IO_DATE
                    io = [PEMBRO] if use_io else []
                    r = _sact(ctx, p, ("Pembrolizumab + " if use_io else "") + "Carboplatin + Weekly Paclitaxel", io + [CARBO], s, 4, 1, ecog,
                              ctx.choice(["PR", "CR", "SD"], p=[0.5, 0.35, 0.15]), cycle_days=21,
                              dose_overrides={CARBO: lambda d, v: ctx.calvert_dose(p, d, 5, v)})
                    if r:
                        pe = _weekly_in_cycles(ctx, p, r[0], r[2], PACLITAXEL, 80)       # monitor 전에 더해야 감량·휴약이 함께 적용된다
                        _mon(ctx, p, r[2], io + [CARBO, PACLITAXEL]); _premed(ctx, p, r[2], [CARBO, PACLITAXEL])
                        r1_end = ctx.regimen_end(r[0])
                        r2 = _sact(ctx, p, ("Pembrolizumab + " if use_io else "") + "Doxorubicin + Cyclophosphamide (AC)", io + [DOXO, CYCLO],
                                   ctx.days(r1_end, 7), 4, 1, ecog, ctx.choice(["PR", "CR", "SD"], p=[0.5, 0.35, 0.15]))
                        if r2:
                            _mon(ctx, p, r2[2], io + [DOXO, CYCLO]); _premed(ctx, p, r2[2], [DOXO, CYCLO]); r = r2
                else:
                    _echo(ctx, p, ctx.days(s, -7), "baseline before anthracycline")
                    r = _sact(ctx, p, "Doxorubicin + Cyclophosphamide (AC)", [DOXO, CYCLO], s, 4, 1, ecog, ctx.choice(["PR", "SD"], p=[0.7, 0.3]))
                    if r:
                        _mon(ctx, p, r[2], [DOXO, CYCLO]); _premed(ctx, p, r[2], [DOXO, CYCLO])
                        r2 = _sact(ctx, p, "Weekly Paclitaxel", [PACLITAXEL], ctx.days(ctx.regimen_end(r[0]), 21), 12, 1, ecog,
                                   ctx.choice(["PR", "CR", "SD"], p=[0.5, 0.35, 0.15]), cycle_days=7, dose_overrides={PACLITAXEL: 80})
                        if r2: _mon(ctx, p, r2[2], [PACLITAXEL]); _premed(ctx, p, r2[2], [PACLITAXEL], weekly=True); r = r2
                if r is None:
                    nact = False
                    surgery_day = ctx.days(index, ctx.randint(21, 45))
                else:
                    chemo_end = ctx.regimen_end(r[0])
                    surgery_day = ctx.days(chemo_end, ctx.randint(21, 42))
            else:
                surgery_day = ctx.days(index, ctx.randint(21, 45))
            if surgery_day <= ctx.today:
                svid, bcs, los = _surgery(ctx, p, st, surgery_day, nact)
                prior_bcs = bcs
                spath_day, pN, pcr = _surg_path(ctx, p, st, surgery_day, nact, bcs)
                nn = pN.lstrip("y")
                last_adj_end = ctx.days(surgery_day, los)
                if st.get("odx"):
                    g_day = ctx.days(spath_day, ctx.randint(7, 21))
                    if g_day <= ctx.today:
                        rs = st["rs"]
                        risk = "low" if rs <= 15 else ("intermediate" if rs <= 25 else "high")
                        ctx.note(p, g_day, f"Oncotype DX Breast Recurrence Score assay (surgical specimen): Recurrence Score {rs} ({risk} risk).",
                                 note_type=32835, note_class=3031451, vid=ctx.visit_on(p, g_day))
                        last_adj_end = max(last_adj_end, g_day)
                # 보조항암 (수술 선행군)
                if plan_adj_chemo and not nact:
                    s = ctx.days(last_adj_end, ctx.randint(21, 35))
                    if st["her2"]:
                        # APT: paclitaxel 80 mg/m2 주 1회 ×12 + trastuzumab 주 1회(첫 주 4 → 2 mg/kg), 이어서 q3w 6 mg/kg ×13
                        r = _sact(ctx, p, "Weekly Paclitaxel + Trastuzumab (APT)", [PACLITAXEL, TRAST], s, 12, 2, ecog, "NE",
                                  cycle_days=7, dose_overrides={PACLITAXEL: 80, TRAST: [4, 2]})
                        if r:
                            _mon(ctx, p, r[2], [PACLITAXEL, TRAST]); _premed(ctx, p, r[2], [PACLITAXEL], weekly=True)
                            chemo_end = last_adj_end = ctx.regimen_end(r[0])
                            tz_start = r[2][0]
                            r2 = _sact(ctx, p, "Trastuzumab", [TRAST], ctx.days(chemo_end, 21), 13, 2, ecog, "NE")
                            if r2: _mon(ctx, p, r2[2], [TRAST], AE_HORM, ae_p=0.08, labs=False); last_adj_end = ctx.regimen_end(r2[0])
                        if tz_start: _echo_series(ctx, p, tz_start, last_adj_end, "trastuzumab")
                    else:
                        r = _sact(ctx, p, "Docetaxel + Cyclophosphamide (TC)", [DOCETAXEL, CYCLO], s, 4, 2, ecog, "NE")
                        if r: _mon(ctx, p, r[2], [DOCETAXEL, CYCLO]); _premed(ctx, p, r[2], [DOCETAXEL, CYCLO]); chemo_end = last_adj_end = ctx.regimen_end(r[0])
                # 선행항암 후 보조치료
                if nact:
                    s = ctx.days(surgery_day, ctx.randint(28, 42))
                    if st["her2"]:        # pCR 만 만든다 → trastuzumab + pertuzumab 으로 1년 완료
                        r = _sact(ctx, p, "Trastuzumab + Pertuzumab", [TRAST, PERTU], s, 12, 2, ecog, "NE")
                        if r:
                            _mon(ctx, p, r[2], [TRAST, PERTU], AE_HORM, ae_p=0.08, labs=False); last_adj_end = ctx.regimen_end(r[0])
                        if tz_start: _echo_series(ctx, p, tz_start, last_adj_end, "trastuzumab")
                    elif sub == "TNBC" and use_io:       # KEYNOTE-522: pCR 여부와 무관하게 pembrolizumab ×9
                        r = _sact(ctx, p, "Pembrolizumab", [PEMBRO], s, 9, 2, ecog, "NE")
                        if r: _mon(ctx, p, r[2], [PEMBRO], AE_HORM, ae_p=0.1, labs=False); last_adj_end = ctx.regimen_end(r[0])
                # 방사선치료
                pmrt = (not bcs) and (T in ("T3", "T4b") or nn in ("N2", "N3") or (nn == "N1" and ctx.bern(0.5)))
                if bcs or pmrt:
                    rt_day = ctx.days(last_adj_end, ctx.randint(21, 42)) if (chemo_end and chemo_end > surgery_day) else ctx.days(surgery_day, ctx.randint(28, 50))
                    if rt_day <= ctx.today:
                        last_adj_end = max(last_adj_end, _rt(ctx, p, rt_day, "WBI" if bcs else "PMRT"))
                if nact and sub == "TNBC" and not use_io and not pcr:
                    # CREATE-X: residual HER2-negative disease after neoadjuvant chemotherapy.
                    # Complete indicated radiotherapy first; this branch does not combine with pembrolizumab.
                    s = ctx.days(last_adj_end, 14)
                    r = _sact(ctx, p, "Adjuvant Capecitabine (residual TNBC)", [CAPE], s, 6, 2, ecog, "NE",
                              cycle_days=21, dose_overrides={CAPE: 1250}, drug_days={CAPE: 14})
                    if r:
                        _mon(ctx, p, r[2], [CAPE], AE_CAPE)
                        last_adj_end = ctx.regimen_end(r[0])
                p_rec = {"0": 0.03, "I": 0.06, "II": 0.13, "III": 0.28}[st["stage"]] + (0.08 if sub == "TNBC" and not dcis else 0)
                recur_day = ctx.days(last_adj_end, ctx.randint(200, 1500)) if ctx.bern(p_rec) else None
                if recur_day is not None and recur_day > ctx.days(ctx.today, -45):
                    recur_day = None
                # 내분비치료
                if st["hr"] and (not dcis or ctx.bern(0.7)):
                    s = ctx.days(last_adj_end, ctx.randint(14, 30))
                    _endocrine(ctx, p, st, s, ecog, limit=ctx.days(recur_day, -1) if recur_day else None)

        # ---- 3) 추적 및 재발 (병력·진찰 6개월 간격, 유방촬영은 연 1회)
        fu = ctx.days(last_adj_end, ctx.randint(170, 200))
        recurred = M == "M1"
        last_mmg = index
        k = 0
        while p.death_date is None and fu <= ctx.today and k < 14:
            fvid = ctx.visit_on(p, fu)
            hit = recur_day is not None and not recurred and fu >= recur_day
            if recurred:
                ctx.procedure(p, fu, CT_ABD, vid=fvid)
            elif (fu - last_mmg).days >= 330:
                ctx.procedure(p, fu, MMG, vid=fvid)
                last_mmg = fu
            ctx.labs(p, fu, [3000963, 3003785, 3013721] if recurred else [3000963, 3003785], vid=fvid)
            if hit:
                recurred = True
                site_nm, distant = ctx.choice(REC_SITES, p=REC_P)
                if distant:
                    _pd_imaging(ctx, p, fu, site_nm, f"Consistent with distant recurrence of breast cancer in {site_nm.lower()}.")
                    if site_nm == "Liver":
                        ctx.procedure(p, fu, LIVER_BX, vid=fvid)
                        ctx.note(p, fu, "Liver, percutaneous core needle biopsy: metastatic carcinoma consistent with breast primary; "
                                        "receptor status re-tested.", note_type=32835, note_class=3031451, vid=fvid)
                else:
                    ctx.procedure(p, fu, PET_CT, vid=fvid)
                    ctx.procedure(p, fu, CORE_BX, vid=fvid)
                    ctx.note(p, fu, f"PET-CT: new hypermetabolic lesion(s) in {site_nm.lower()}; core needle biopsy confirms locoregional recurrence of breast cancer.",
                             vid=fvid)
                start = ctx.days(fu, ctx.randint(7, 21))
                if not distant and site_nm.startswith("Ipsilateral"):
                    sd = ctx.days(fu, ctx.randint(14, 28))
                    if sd <= ctx.today and prior_bcs:       # 이전 전절제술 후 흉벽 재발에는 전절제술을 반복하지 않음
                        _surgery(ctx, p, st, sd, False, salvage=True)
                        _surg_path(ctx, p, st, sd, False, False, salvage=True)
                        start = ctx.days(sd, ctx.randint(30, 45))
                last_end, last_sid = _palliative(ctx, p, st, start, ecog, first_intent=3 if distant else 6)
                if last_sid is not None and ctx.bern(0.5 if distant else 0.25) and _die(ctx, p, last_end):
                    break
                fu = max(fu, last_end)
            fu = ctx.days(fu, ctx.randint(100, 130) if recurred else ctx.randint(170, 200)); k += 1
        ctx.finalize_person(p)
