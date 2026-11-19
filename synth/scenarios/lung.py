# -*- coding: utf-8 -*-
"""
폐암 코호트 시나리오. 특화 테이블 LUNG_CANCER 는 환자당 1행(진단 입원 방문에 매단다).

여정: 진단 입원(3일: 흉부 CT·기관지경 생검·PET-CT·뇌 MRI 판독) → 분자병리 → 병기별 치료 → 추적
  I~II / IIIA(T3N1) 수술 가능  폐엽절제술. 보조항암은 IB(내장흉막 침습)·II·IIIA 에서만(선암·대세포 cisplatin/pemetrexed,
         그 외 cisplatin/gemcitabine), EGFR 양성 IB~IIIA 는 이어서 보조 osimertinib(ADAURA 는 2020-12 승인 → 시작일 2021-01-01 이후만).
         병기 I~IIA 이지만 수술 불가(ECOG 3)는 SBRT 단독, IIB 는 방사선 단독. IIIA(cN2)·IIIB 비소세포는 동시항암방사선(주간 carboplatin/paclitaxel) 후
         EGFR 음성은 durvalumab 공고(PACIFIC, 2018), EGFR 양성은 공고요법 없이 관찰(LAURA 는 2024 근거라 쓰지 않는다).
         소세포는 제한기로 보고 etoposide/cisplatin 동시방사선 후 PCI. (소세포 durvalumab 은 1500 mg 고정용량·4주 간격이라
         약물 목록의 mg/kg·2주 기준으로 표현할 수 없어 쓰지 않는다. 소세포 IV 는 etoposide/cisplatin 단독 4주기.)
  IV     EGFR 양성 osimertinib(진행 시 carboplatin/pemetrexed → pemetrexed 유지),
         선암·대세포 pembrolizumab+carboplatin+pemetrexed 후 pembrolizumab+pemetrexed 유지, 편평·기타 pembrolizumab+carboplatin+paclitaxel
         후 pembrolizumab 유지 → 진행 시 docetaxel (소세포는 2차 요법 목록에 없어 만들지 않는다)
  뇌전이는 뇌 MRI 판독 NOTE 로 진단·추적하고(흉부 CT/PET-CT 로는 평가하지 않는다; 뇌 MRI 는 시술 목록에 검증된 concept 가 없어
         PROCEDURE 행은 만들지 않는다) 비 EGFR 에서는 방사선(SRS/WBRT)을 전신치료에 앞서 한다.
  전이 부위별 확인: 뇌=조영 MRI, 간=간 조직검사, 단독 골/부신 전이는 만들지 않는다(조직 확인 방법이 없어서). 다발성(IVB)은 영상으로 확정.
  골전이 골보호제(zoledronic acid)는 약물 목록에 없어 만들지 않는다.
  ALK 양성은 ALK 표적약이 약물 목록에 없어 만들지 않는다(양성인데 면역항암만 쓰면 비현실적).
특화 값:
  diag_rgst_ymd 는 진단정보 등록일(진단 입원 첫날로 둔다),
  clinical_stage 는 AJCC 병기군(IA1~IVB; SEM-LC-001)만 쓴다. 소세포폐암도 제한기/확장기(LD/ED)가 아니라 TNM 병기로 적는다.
  TNM 은 병기 표기와 같은 병기가 되도록 맞춘다,
  stage_iv_diagnosis_date 는 처음부터 IV기이면 진단일과 같고, 수술 후 재발이면 재발일이다.

근거: NCCN Guidelines NSCLC / SCLC (현행판), ESMO NSCLC·SCLC 가이드라인, AJCC 8판.
  PACIFIC(durvalumab 공고, NEJM 2017), CASPIAN/ADRIATIC 는 위 사유로 미반영,
  KEYNOTE-189/407(pembrolizumab 병용 1차 및 유지, NEJM 2018 / 2018), FLAURA(osimertinib 1차, NEJM 2018),
  ADAURA(보조 osimertinib 3년, NEJM 2020; 2021 이후 시작 사례만).
  carboplatin 용량은 Calvert 식(AUC × (CrCl+25); 기록된 크레아티닌·체중·나이·성별의 Cockcroft-Gault, 크레아티닌 하한 0.7, GFR 상한 125):
  1차 백금 병용 AUC 5, 동시방사선 주간 AUC 2. 주간 paclitaxel 45 mg/m2(동시방사선).
  주간 carboplatin AUC 2 + paclitaxel 45~50 mg/m2 동시방사선(NCCN), 용량은 각 시험/NCCN 표준 용량.
"""
from framework import *


LC = 258369
CISPLATIN, CARBOPLATIN, PEMETREXED, PACLITAXEL, DOCETAXEL, GEMCITABINE = 1397599, 1344905, 1304919, 1378382, 1315942, 1314924
OSIMERTINIB, PEMBROLIZUMAB, ETOPOSIDE = 35605522, 45775965, 1350504
DEXAMETHASONE, ONDANSETRON = 1518254, 1000560
DURVALUMAB = 1594034
ADAURA_DATE = D(2021, 1, 1)             # 보조 osimertinib 은 2020-12 승인 → 이 날 이후 시작한 사례에만
CT_CHEST, PET_CT, CT_ABD, RT, LIVER_BX = 4058335, 42872445, 4304092, 1242725, 4314001

HIST = {1: "Adenocarcinoma", 2: "Squamous cell carcinoma", 3: "Large cell carcinoma", 4: "Small cell carcinoma",
        5: "Carcinoma tumor 계열", 6: "NSCLC NOS", 7: "기타"}
HIST_TXT = {1: ["Adenocarcinoma, NOS", "Adenocarcinoma, NOS", "Adenocarcinoma, NOS", "Adenocarcinoma, lepidic pattern", "Adenocarcinoma with mixed subtypes"],
            2: ["Squamous cell carcinoma, NOS", "Squamous cell carcinoma, NOS", "Squamous cell carcinoma, keratinizing"],
            3: ["Large cell carcinoma"], 4: ["Small cell carcinoma"], 5: ["Carcinoma, NOS"], 6: ["Non-small cell carcinoma, NOS"],
            7: ["Adenosquamous carcinoma"]}
# 큰 병기군. 세부 표기(IA1~IA3, IIIC, IVA/IVB)는 stage_label 이 정한다.
BASE = ["IA", "IB", "IIA", "IIB", "IIIA", "IIIB", "IV"]
BASE_P = [0.16, 0.10, 0.07, 0.07, 0.12, 0.08, 0.40]
TNM = {"IA": ("T1b", "N0", "M0"), "IB": ("T2a", "N0", "M0"), "IIA": ("T2b", "N0", "M0"), "IIB": ("T3", "N0", "M0"),
       "IIIA": ("T3", "N1", "M0"), "IIIB": ("T2a", "N3", "M0"), "IV": ("T2a", "N2", "M1b")}
NONSQ = (1, 3)                          # 선암·대세포: pemetrexed 사용 가능한 조직형
LOBE = ["right upper lobe", "right middle lobe", "right lower lobe", "left upper lobe", "left lower lobe"]
# 단독 전이(IVA): 조직 확인이 가능한 부위만(뇌는 조영 MRI, 간은 조직검사). 다발성(IVB)은 영상으로 확정한다.
SOLITARY_SITES = ["Brain", "Liver"]
MULTI_SITES = ["Brain", "Bone", "Liver", "Adrenal gland"]
AE_IO_TKI = ((140214, 0.3), (196523, 0.3), (4223659, 0.25), (4055224, 0.15))

CT_REPORT = ("Chest CT (contrast). {lobe}: spiculated mass. {node}. {thorax} "
             "Impression: Lung cancer, {lobe}, c{t}{n} by chest CT. Distant staging by FDG PET-CT{mri}. Recommend tissue confirmation.")
BX_REPORT = ("Lung, {lobe}, bronchoscopic biopsy: {hist}. Differentiation: {diff}. "
             "Pathologic TNM is not assigned on a biopsy specimen.")
PET_REPORT = ("FDG PET-CT (skull base to mid-thigh). Hypermetabolic {lobe} mass{nodes}. {extra} "
              "The brain is not evaluable on FDG PET (physiologic cortical uptake).")
MRI_REPORT = "MRI brain with and without contrast. {finding}"
STAGE_NOTE = ("Clinical staging summary (AJCC 8th): c{t}{n}{m}, stage {stage}. Basis: chest CT, FDG PET-CT{mri}"
              "{bx}. Tissue diagnosis: {hist}.")
PATH_REPORT = ("Lung, {lobe}, lobectomy: {hist}. Differentiation: {diff}. Visceral pleural invasion: {vpi}. "
               "Lymph nodes: {ln}. Pathologic stage p{t}{n}{m}.")
LIVER_BX_REPORT = "Liver, percutaneous core needle biopsy: metastatic carcinoma, consistent with lung primary ({hist})."
RESP_TXT = {"CR": "Complete response by RECIST 1.1", "PR": "Partial response by RECIST 1.1", "SD": "Stable disease by RECIST 1.1",
            "PD": "Progressive disease by RECIST 1.1"}


def stage_label(ctx, base):
    """큰 병기군을 AJCC 8판 표기로. IA→IA1/2/3, IV→IVA/IVB, IIIB 일부→IIIC."""
    if base == "IA":
        return ctx.choice(["IA1", "IA2", "IA3"], p=[0.25, 0.45, 0.30])
    if base == "IIIB" and ctx.bern(0.3):
        return "IIIC"
    if base == "IV":
        return ctx.choice(["IVA", "IVB"], p=[0.55, 0.45])
    return base


def _room(ctx, p):
    return min(ctx.today, p.death_date) if p.death_date is not None else ctx.today


def _sact(ctx, p, name, drugs, start, cycles, intent, ecog, resp, **kw):
    """SACT 래퍼: 시작일이 오늘/사망일을 넘으면 None."""
    if start > _room(ctx, p):
        return None
    return ctx.sact(p, name, drugs, start, cycles, intent, ecog=ecog, response=resp, **kw)


def _supportive(ctx, p, cycle_dates, high):
    """항구토 예방(ondansetron + dexamethasone). cisplatin 은 고위험(3일), carboplatin 단독 계열은 중등도(2일)."""
    last = _room(ctx, p)
    for d in cycle_dates:
        for c, n in ((ONDANSETRON, 3 if high else 2), (DEXAMETHASONE, 3 if high else 2)):
            ctx.drug(p, d, c, min(n, (last - d).days + 1), vid=ctx.visit_on(p, d), freq=1)


def _rt(ctx, p, day, text):
    if day > _room(ctx, p):
        return False
    vid = ctx.visit_on(p, day)
    ctx.procedure(p, day, RT, vid=vid)
    ctx.note(p, day, text, vid=vid)
    return True


def _imaging(ctx, p, day, site, text, procedure=True):
    """전이/진행 부위에 맞는 영상. 뇌=MRI(판독 NOTE 만), 폐=흉부 CT, 간=복부 CT, 뼈=PET-CT."""
    vid = ctx.visit_on(p, day)
    proc = {"Brain": None, "Lung": CT_CHEST, "Contralateral lung": CT_CHEST, "Liver": CT_ABD}.get(site, PET_CT)
    if proc is not None and procedure:
        ctx.procedure(p, day, proc, vid=vid)
    modality = {None: "MRI brain with contrast", CT_CHEST: "Chest CT", CT_ABD: "CT abdomen/pelvis with contrast",
                PET_CT: "FDG PET-CT"}[proc]
    ctx.note(p, day, f"{modality}: {text}", vid=vid)
    return vid


def _restage(ctx, p, day, lobe, resp, mets=(), resected=False):
    """Assess each involved compartment with the appropriate modality, including postoperative recurrence."""
    if day > _room(ctx, p):
        return
    vid = ctx.visit_on(p, day)
    ctx.procedure(p, day, CT_CHEST, vid=vid)
    thorax = (f"Postoperative changes after {lobe} lobectomy. No locoregional recurrence."
              if resected else f"{lobe} primary and nodal disease reassessed. {RESP_TXT[resp]}.")
    ctx.note(p, day, f"Chest CT: {thorax}", vid=vid)
    for site in dict.fromkeys(mets):
        if site != "Lung":
            _imaging(ctx, p, day, site, f"Previously documented {site.lower()} metastases reassessed. {RESP_TXT[resp]}.")


def _first_line(ctx, p, st, start, mets, prior_osi, intent_first, inpatient_first):
    """IV기(또는 재발) 1차 요법 + 유지요법. 반환 리스트 [(sact_id, end_date, cycle_dates, drugs, response)], 마지막은 현재 진행 중인 요법.
    진행 시 2차는 호출자가 한다."""
    hist, egfr, ecog = st["hist"], st["egfr"], st["ecog"]
    out = []
    resp = (ctx.choice(["PR", "CR", "SD", "PD"], p=[0.55, 0.1, 0.2, 0.15]) if hist == 4
            else ctx.choice(["PR", "SD", "CR"], p=[0.7, 0.2, 0.1]) if (egfr and not prior_osi)
            else ctx.choice(["PR", "SD", "PD"], p=[0.5, 0.35, 0.15]))
    ind_cycles = 2 if resp == "PD" else 4                      # 유도요법 중 진행하면 일찍 중단
    if hist == 4:       # 확장기 SCLC: etoposide(1~3일) + cisplatin 4주기. 면역항암 병용·유지는 약물 목록 한계로 제외
        drugs = [ETOPOSIDE, CISPLATIN]
        r = _sact(ctx, p, "Etoposide + Cisplatin", drugs, start, ind_cycles, intent_first, ecog, resp, inpatient_first=inpatient_first,
                  drug_days={ETOPOSIDE: 3})
        maint, high = None, True
    elif egfr and not prior_osi:
        drugs = [OSIMERTINIB]
        r = _sact(ctx, p, "Osimertinib", drugs, start, ctx.randint(6, 30), intent_first, ecog, resp, cycle_days=28, oral=True)
        maint, high = None, False
    elif egfr:        # 보조 osimertinib 중/후 재발·진행: 백금 + pemetrexed, 이후 pemetrexed 유지
        drugs = [CARBOPLATIN, PEMETREXED]
        r = _sact(ctx, p, "Carboplatin + Pemetrexed", drugs, start, ind_cycles, intent_first, ecog, resp, inpatient_first=inpatient_first,
                  dose_overrides={CARBOPLATIN: lambda d, v: ctx.calvert_dose(p, d, 5, v)})
        maint, high = ("Pemetrexed maintenance", [PEMETREXED], 21, ctx.randint(4, 16), False), False
    elif hist in NONSQ:
        drugs = [PEMBROLIZUMAB, CARBOPLATIN, PEMETREXED]
        r = _sact(ctx, p, "Pembrolizumab + Carboplatin + Pemetrexed", drugs, start, ind_cycles, intent_first, ecog, resp,
                  inpatient_first=inpatient_first, dose_overrides={CARBOPLATIN: lambda d, v: ctx.calvert_dose(p, d, 5, v)})
        maint, high = ("Pembrolizumab + Pemetrexed maintenance", [PEMBROLIZUMAB, PEMETREXED], 21, ctx.randint(4, 28), False), False
    else:
        drugs = [PEMBROLIZUMAB, CARBOPLATIN, PACLITAXEL]
        r = _sact(ctx, p, "Pembrolizumab + Carboplatin + Paclitaxel", drugs, start, ind_cycles, intent_first, ecog, resp,
                  inpatient_first=inpatient_first, dose_overrides={CARBOPLATIN: lambda d, v: ctx.calvert_dose(p, d, 5, v)})
        maint, high = ("Pembrolizumab maintenance", [PEMBROLIZUMAB], 21, ctx.randint(4, 28), False), False
    sid, e, cyc = r
    e = (ctx.monitor(p, cyc, drugs, ae_pool=AE_IO_TKI) if drugs == [OSIMERTINIB] else ctx.monitor(p, cyc, drugs)) or ctx.regimen_end(sid)
    if CISPLATIN in drugs or CARBOPLATIN in drugs:
        _supportive(ctx, p, cyc, high=CISPLATIN in drugs)
    out.append((sid, e, cyc, drugs, resp))
    if resp in ("CR", "PR", "SD") and maint is not None:
        name_m, drugs_m, cd_m, cycles_m, _ = maint
        s_m = ctx.days(e, 21 if cd_m != 28 else 28)
        rm = _sact(ctx, p, name_m, drugs_m, s_m, cycles_m, 4, ecog, ctx.choice(["PR", "SD", "CR"], p=[0.5, 0.4, 0.1]), cycle_days=cd_m)
        if rm is not None:
            em = ctx.monitor(p, rm[2], drugs_m, ae_pool=AE_IO_TKI, ae_p=0.15) or ctx.regimen_end(rm[0])
            out.append((rm[0], em, rm[2], drugs_m, "maintenance"))
    return out


def _metastatic_course(ctx, p, st, start, mets, prior_osi, intent_first, inpatient_first, lobe):
    """전이성(IV기 또는 재발) 전신치료 경로: 뇌전이 방사선·지지요법 → 1차(+유지) → 진행 영상 → 2차.
    반환 (last_date, sacts, progressed)."""
    hist, egfr, ecog = st["hist"], st["egfr"], st["ecog"]
    sacts = []
    brain = "Brain" in mets
    if brain and (not egfr or prior_osi or ctx.bern(0.3)):
        rt_day = ctx.days(start, -ctx.randint(2, 6))
        if _rt(ctx, p, rt_day, "Radiotherapy for brain metastases: " + ("whole-brain radiotherapy (multiple lesions)."
                                                                       if hist == 4 or ctx.bern(0.3) else "stereotactic radiosurgery to the metastatic lesion(s).")):
            ctx.drug(p, rt_day, DEXAMETHASONE, min(7, (_room(ctx, p) - rt_day).days + 1), vid=ctx.visit_on(p, rt_day), freq=1)   # 부종 조절
    course = _first_line(ctx, p, st, start, mets, prior_osi, intent_first, inpatient_first)
    for sid, e, cyc, drugs, resp in course:
        sacts.append(sid)
    last_sid, last_end, _, _, last_resp = course[-1]
    prog_sid = last_sid
    ind_sid, ind_end, _, _, ind_resp = course[0]
    _restage(ctx, p, ctx.days(ind_end, 14), lobe, ind_resp, mets=mets, resected=st.get("resected", False))
    last = last_end
    progressed = False
    pd_day = ctx.days(last_end, ctx.randint(0, 14) if (last_resp == "PD" or ind_resp == "PD") else ctx.randint(20, 120))
    if (last_resp == "PD" or ind_resp == "PD" or ctx.bern(0.55)) and pd_day <= _room(ctx, p):
        progressed = True
        site = ctx.choice(["Lung", "Liver", "Bone", "Brain"] if "Brain" not in mets else ["Lung", "Liver", "Bone", "Brain"])
        text = {"Lung": f"interval increase of the {lobe} mass with new pulmonary nodules.",
                "Liver": "new hypodense hepatic lesions.", "Bone": "new hypermetabolic osseous lesions.",
                "Brain": "new enhancing intracranial lesions."}[site] + " Progressive disease by RECIST 1.1."
        _imaging(ctx, p, pd_day, site, text)
        ctx.sact_update(prog_sid, date_of_progression=pd_day, recurrence_anatomic_site=site)
        last = pd_day
        if hist != 4 and ecog <= 2 and ctx.bern(0.7):      # 소세포는 목록에 2차 약제가 없어 만들지 않는다
            s2 = ctx.days(pd_day, ctx.randint(7, 21))
            # EGFR 진행: 백금+pemetrexed, 그 외 docetaxel
            if egfr and not prior_osi:
                name2, drugs2 = "Carboplatin + Pemetrexed", [CARBOPLATIN, PEMETREXED]
            else:
                name2, drugs2 = "Docetaxel", [DOCETAXEL]
            r2 = _sact(ctx, p, name2, drugs2, s2, ctx.randint(2, 6), 3, min(ecog + 1, 3), ctx.choice(["SD", "PD", "PR"]),
                       **({"dose_overrides": {CARBOPLATIN: lambda d, v: ctx.calvert_dose(p, d, 5, v)}} if CARBOPLATIN in drugs2 else {}))
            if r2 is not None:
                sacts.append(r2[0])
                last = ctx.monitor(p, r2[2], drugs2) or ctx.regimen_end(r2[0])
                if CARBOPLATIN in drugs2:
                    _supportive(ctx, p, r2[2], high=False)
    return last, sacts, progressed


def generate(ctx: Ctx, n=100):
    for _ in range(n):
        gender = FEMALE if ctx.bern(0.38) else MALE
        age = int(ctx.normal(67, 9, 35, 90, 0))
        index = D(2019, 1, 1) + dt.timedelta(days=ctx.randint(0, 365 * 5))
        p = ctx.person(gender, age, index)
        hist = ctx.choice([1, 2, 4, 3, 6, 5, 7], p=[0.52, 0.22, 0.12, 0.04, 0.05, 0.03, 0.02])
        base = ctx.choice(BASE, p=BASE_P)
        if hist == 4 and base not in ("IIIB", "IV"):     # 소세포는 수술 대상 조기 병기로 만들지 않는다
            base = ctx.choice(["IIIB", "IV"])
        stage = stage_label(ctx, base)
        t, nn, m = TNM[base]
        if base == "IIIA" and ctx.bern(0.5):             # IIIA 의 절반은 cN2(수술 불가, 동시항암방사선)
            t, nn = "T2a", "N2"
        if stage in ("IA1", "IA2", "IA3"):
            t = {"IA1": "T1a", "IA2": "T1b", "IA3": "T1c"}[stage]
        elif stage == "IIIC":
            t, nn = "T4", "N3"
        elif stage == "IVB":
            m = "M1c"
        stage_iv = base == "IV"
        lobe_nm = ctx.choice(LOBE)
        smoker = ctx.bern(0.75 if gender == MALE else 0.15)
        cur_smok = smoker and ctx.bern(0.5)
        egfr = (hist == 1) and ctx.bern(0.45 if gender == FEMALE else 0.3)
        hist_txt = ctx.choice(HIST_TXT[hist])
        ecog = ctx.choice([0, 1, 2, 3], p=[0.3, 0.45, 0.2, 0.05])
        if base in ("IIIA", "IIIB", "IV") and not egfr:        # 화학(방사선)요법 대상은 PS 0~2
            ecog = min(ecog, 2)
        st = dict(hist=hist, egfr=egfr, ecog=ecog)

        # ---- 전이 부위 (단독 IVA: 뇌/간, IVB 다발: 2~3개 장기, M1a: 반대쪽 폐)
        if stage_iv:
            if stage == "IVB":
                k = ctx.randint(2, 3)
                mets = [MULTI_SITES[i] for i in sorted(ctx.rng.choice(len(MULTI_SITES), size=k, replace=False))]
            elif ctx.bern(0.15):
                mets = ["Contralateral lung"]
                m = "M1a"
            else:
                mets = [ctx.choice(SOLITARY_SITES)]
        else:
            mets = []
        brain_met = "Brain" in mets
        extrathoracic = [s for s in mets if s != "Contralateral lung"]

        # ---- 1) 진단 입원 (3일)
        dx_vid = ctx.visit(p, index, INPATIENT, los=3)
        ctx.condition(p, index, LC, vid=dx_vid)
        ctx.condition(p, index, 4110591 if hist == 4 else 4115276, vid=dx_vid)
        if smoker and ctx.bern(0.4): ctx.condition(p, index, 255573, vid=dx_vid)     # COPD
        if ctx.bern(0.35): ctx.condition(p, index, 320128, vid=dx_vid)               # HTN
        if ctx.bern(0.2): ctx.condition(p, index, 201826, vid=dx_vid)                # T2DM
        ctx.procedure(p, index, CT_CHEST, vid=dx_vid)                                 # chest CT
        bx_day = ctx.days(index, 1)
        ctx.procedure(p, bx_day, 4206027, vid=dx_vid)                                 # bronchoscopy biopsy
        pet_day = ctx.days(index, 2)
        ctx.procedure(p, pet_day, PET_CT, vid=dx_vid)                                 # PET-CT
        need_mri = hist == 4 or base in ("IIA", "IIB", "IIIA", "IIIB", "IV")          # 뇌 MRI: II~IV기와 소세포 전부
        mri_day = ctx.days(index, 2)
        ctx.labs(p, index, [3000963, 3010813, 3017732, 3024929, 3016723, 3013721, 3006923, 3024561, 3022250], vid=dx_vid)
        ht = ctx.normal(170 if gender == MALE else 157, 6, 145, 190); wt = ctx.normal(66 if gender == MALE else 56, 9, 38, 110)
        ctx.measure(p, index, 3036277, ht, vid=dx_vid); ctx.measure(p, index, 3025315, wt, vid=dx_vid)
        ctx.measure(p, index, 3038553, round(wt / (ht / 100) ** 2, 1), vid=dx_vid)
        ctx.observation(p, index, 36303470, vid=dx_vid, value_number=ecog, value_string=f"ECOG {ecog}")
        ctx.observation(p, index, 43054909, vid=dx_vid, value_string="Current smoker" if cur_smok else ("Ex-smoker" if smoker else "Never smoker"))

        node_txt = ("Mediastinal lymphadenopathy" if nn in ("N2", "N3") else
                    "Ipsilateral hilar lymphadenopathy" if nn == "N1" else "No significant lymphadenopathy")
        thorax = "Contralateral lung nodule(s) suspicious for metastasis." if "Contralateral lung" in mets else "No contralateral lung nodule or pleural effusion."
        mri_phrase = " and brain MRI" if need_mri else ""
        ctx.note(p, index, CT_REPORT.format(lobe=lobe_nm, node=node_txt, thorax=thorax, t=t, n=nn, mri=mri_phrase), vid=dx_vid)
        if extrathoracic:
            extra = ("Hypermetabolic lesions in " + ", ".join(s.lower() for s in extrathoracic if s != "Brain") + "." if
                     [s for s in extrathoracic if s != "Brain"] else "No extracranial distant metastasis.")
        else:
            extra = "No distant metastasis."
        nodes_pet = " and mediastinal/hilar nodes" if nn in ("N1", "N2", "N3") else ""
        ctx.note(p, pet_day, PET_REPORT.format(lobe=lobe_nm, nodes=nodes_pet, extra=extra), vid=dx_vid)
        if need_mri:
            if brain_met:
                finding = ("Multiple enhancing intracranial metastases." if stage == "IVB" else "Solitary enhancing intracranial metastasis with vasogenic edema.")
            else:
                finding = "No intracranial metastasis."
            ctx.note(p, mri_day, MRI_REPORT.format(finding=finding), vid=dx_vid)
        if hist == 4:
            diff = "not graded (high-grade neuroendocrine carcinoma)"
        elif hist == 3:
            diff = "poorly differentiated"
        else:
            diff = ctx.choice(["well", "moderately", "poorly"]) + " differentiated"
        bx_note_day = ctx.days(index, 3)
        ctx.note(p, bx_note_day, BX_REPORT.format(lobe=lobe_nm, hist=hist_txt, diff=diff),
                 note_type=32835, note_class=3031451, vid=dx_vid)
        liver_bx = "Liver" in mets and stage == "IVA"               # 단독 간전이는 조직으로 확인
        if liver_bx:
            ctx.procedure(p, bx_day, LIVER_BX, vid=dx_vid)
            ctx.note(p, bx_note_day, LIVER_BX_REPORT.format(hist=hist_txt), note_type=32835, note_class=3031451, vid=dx_vid)
        ctx.note(p, bx_note_day, STAGE_NOTE.format(t=t, n=nn, m=m, stage=stage, mri=mri_phrase,
                                                    bx=", liver core biopsy" if liver_bx else "", hist=hist_txt), vid=dx_vid)
        row = ctx.disease_row(p, dx_vid, diag_rgst_ymd=index, histologic_diagnosis=hist, histologic_diagnosis_source_value=HIST[hist],
                              clinical_stage=stage, stage_iv_diagnosis_date=index if stage_iv else None)
        gmt_day = None
        if hist != 4:
            gmt_day = ctx.days(index, ctx.randint(5, 12))
            gvid = ctx.visit_on(p, gmt_day)
            pdl1 = ctx.choice([0, 1, 5, 25, 50, 80])
            kras = (not egfr) and ctx.bern(0.2)
            ctx.note(p, gmt_day, f"Molecular pathology (NGS panel): EGFR {ctx.choice(['exon 19 deletion', 'L858R']) if egfr else 'wild type'}; ALK IHC "
                                 f"negative; KRAS {'G12C' if kras else 'wild type'}; PD-L1 TPS {pdl1}%.",
                     note_type=32835, note_class=3031451, vid=gvid)

        # ---- 2) 치료
        last = ctx.days(index, 3)
        surgery_day = None
        sacts = []
        prior_osi = False
        resectable = base in ("IA", "IB", "IIA", "IIB", "IIIA") and not (base == "IIIA" and nn == "N2") and hist != 4
        if resectable and ecog <= 2:
            surgery_day = ctx.days(index, ctx.randint(21, 45))
            svid = ctx.visit(p, surgery_day, INPATIENT, los=7)
            ctx.procedure(p, surgery_day, 4070879, vid=svid)
            path_day = ctx.days(surgery_day, ctx.randint(3, 7))
            pn = nn if ctx.bern(0.75) else ctx.choice(["N0", "N1", "N2"])
            tot_ln = ctx.randint(8, 30); pos_ln = 0 if pn == "N0" else ctx.randint(1, min(6, tot_ln))
            vpi = ctx.bern(0.3)
            ctx.note(p, path_day, PATH_REPORT.format(lobe=lobe_nm, hist=hist_txt, diff=diff,
                                                     vpi="present" if vpi else "absent", ln=f"{pos_ln}/{tot_ln} positive", t=t, n=pn, m="M0"),
                     note_type=32835, note_class=3031451, vid=svid)
            ctx.labs(p, ctx.days(surgery_day, 1), [3000963, 3010813, 3016723], vid=svid)
            last = ctx.days(surgery_day, 7)
            st["resected"] = True
            if ctx.bern(0.2):
                ctx.ae(p, ctx.days(surgery_day, 2), 437663, 1, vid=svid)   # postoperative fever
            # 보조항암: IB 는 내장흉막 침습 등 고위험일 때만, II·IIIA 는 ECOG 0~1 에서 권고
            chemo = (base == "IB" and vpi and ecog <= 1 and ctx.bern(0.5)) or (base in ("IIA", "IIB", "IIIA") and ecog <= 1 and ctx.bern(0.8)) \
                or (pn != "N0" and base == "IB" and ecog <= 1)
            s = ctx.days(surgery_day, ctx.randint(35, 60))
            if chemo and s <= _room(ctx, p):
                adj_name, adj_drugs = (("Cisplatin + Pemetrexed", [CISPLATIN, PEMETREXED]) if hist in NONSQ
                                       else ("Cisplatin + Gemcitabine", [CISPLATIN, GEMCITABINE]))
                r = _sact(ctx, p, adj_name, adj_drugs, s, 4, 2, ecog, "NE")
                sacts.append(r[0])
                last = ctx.monitor(p, r[2], adj_drugs) or ctx.regimen_end(r[0])
                _supportive(ctx, p, r[2], high=True)
            # EGFR 양성 IB~IIIA: 보조 osimertinib (ADAURA, 최대 3년; 보조항암을 했으면 그 뒤)
            if egfr and base in ("IB", "IIA", "IIB", "IIIA") and ecog <= 2:
                s_o = ctx.days(last, ctx.randint(21, 42)) if sacts else ctx.days(surgery_day, ctx.randint(35, 60))
                r = (_sact(ctx, p, "Adjuvant Osimertinib", [OSIMERTINIB], s_o, 39, 2, ecog, "NE", cycle_days=28, oral=True)
                     if s_o >= ADAURA_DATE else None)
                if r is not None:
                    prior_osi = True
                    sacts.append(r[0])
                    last = ctx.monitor(p, r[2], [OSIMERTINIB], ae_pool=AE_IO_TKI, ae_p=0.1) or ctx.regimen_end(r[0])
        elif base != "IV":
            s = ctx.days(index, ctx.randint(14, 30))
            if gmt_day is not None:
                s = max(s, ctx.days(gmt_day, 2))
            if base in ("IA", "IB", "IIA") and hist != 4:
                # 수술 불가 조기 병기: 정위체부방사선치료(SBRT) 단독, 전신요법 없음
                _rt(ctx, p, s, "Stereotactic body radiotherapy (medically inoperable early-stage NSCLC).")
                last = ctx.days(s, 14)
            elif base == "IIB" and hist != 4:
                _rt(ctx, p, s, "Definitive thoracic radiotherapy alone (not fit for concurrent chemoradiation).")
                last = ctx.days(s, 49)
            elif hist == 4:   # 소세포 제한기(LD): 흉부방사선과 동시 etoposide/cisplatin 후 PCI
                drugs = [ETOPOSIDE, CISPLATIN]
                resp = ctx.choice(["PR", "SD", "CR"], p=[0.6, 0.15, 0.25])
                r = _sact(ctx, p, "Etoposide + Cisplatin (concurrent chemoradiation)", drugs, s, 4, 5, ecog, resp,
                          cycle_days=21, inpatient_first=True, drug_days={ETOPOSIDE: 3})
                sacts.append(r[0])
                last = ctx.monitor(p, r[2], drugs) or ctx.regimen_end(r[0])
                _supportive(ctx, p, r[2], high=True)
                _rt(ctx, p, s, "Thoracic radiotherapy concurrent with etoposide/cisplatin (limited-stage SCLC).")
                _restage(ctx, p, ctx.days(last, 21), lobe_nm, resp)
                if resp in ("CR", "PR"):       # 반응 시 예방적 전뇌조사(PCI); 이후 뇌 MRI 추적
                    _rt(ctx, p, ctx.days(last, ctx.randint(28, 45)), "Prophylactic cranial irradiation.")
            else:
                drugs = [CARBOPLATIN, PACLITAXEL]
                resp = ctx.choice(["PR", "SD", "CR"])
                r = _sact(ctx, p, "Weekly Carboplatin + Paclitaxel (CCRT)", drugs, s, 6, 5, ecog, resp, cycle_days=7,
                          dose_overrides={CARBOPLATIN: lambda d, v: ctx.calvert_dose(p, d, 2, v), PACLITAXEL: 45})          # 주간 carboplatin AUC 2, paclitaxel 45 mg/m2
                sacts.append(r[0])
                last = ctx.monitor(p, r[2], drugs) or ctx.regimen_end(r[0])
                _rt(ctx, p, s, "Definitive thoracic radiotherapy concurrent with weekly carboplatin/paclitaxel.")
                _restage(ctx, p, ctx.days(last, 21), lobe_nm, resp)
                if resp in ("CR", "PR", "SD") and not egfr:       # PACIFIC: durvalumab 공고. EGFR 양성은 공고요법 없이 관찰
                    rm = _sact(ctx, p, "Durvalumab consolidation", [DURVALUMAB], ctx.days(last, 28), ctx.randint(6, 26), 4, ecog, "NE", cycle_days=14)
                    if rm is not None:
                        sacts.append(rm[0])
                        last = ctx.monitor(p, rm[2], [DURVALUMAB], ae_pool=AE_IO_TKI, ae_p=0.15) or ctx.regimen_end(rm[0])
        else:  # IV 또는 소세포 IV
            s = ctx.days(index, ctx.randint(10, 25))
            if gmt_day is not None:
                s = max(s, ctx.days(gmt_day, 3))
            last, sacts, progressed = _metastatic_course(ctx, p, st, s, mets, False, 3, True, lobe_nm)
            if progressed and ctx.bern(0.5):
                dd = min(ctx.days(last, ctx.randint(15, 180)), ctx.today)
                if dd >= last:
                    ctx.set_death(p, dd)
                    ctx.visit(p, ctx.days(dd, -2), INPATIENT, los=2)

        # ---- 3) 추적 및 재발
        # 절제/근치적 치료 후: 6개월 간격 흉부 CT(3년 후 연 1회), 전이성 치료 후: 약 3개월 간격. 뇌전이·소세포는 2년간 뇌 MRI 추적.
        if p.death_date is None:
            curative = base != "IV"
            fu = ctx.days(last, 90 if not curative else ctx.randint(170, 200))
            recurred = False
            k = 0
            brain_surv = hist == 4 or brain_met
            while fu <= ctx.today and k < 8:
                fvid = ctx.visit_on(p, fu)
                ctx.procedure(p, fu, CT_CHEST, vid=fvid)
                ctx.labs(p, fu, [3000963, 3003785], vid=fvid)
                if brain_surv and (fu - index).days <= 730:
                    ctx.note(p, fu, "MRI brain with contrast (surveillance): no new intracranial metastasis.", vid=fvid)
                p_rec = {"IA": 0.03, "IB": 0.05, "IIA": 0.08, "IIB": 0.09, "IIIA": 0.12}.get(base, 0.08)
                if surgery_day and not recurred and ctx.bern(p_rec):
                    recurred = True
                    site = ctx.choice(MULTI_SITES + ["Contralateral lung"])
                    note_site = "Lung" if site == "Contralateral lung" else site
                    _imaging(ctx, p, fu, note_site, f"new {site.lower()} lesion(s) suspicious for recurrence of lung cancer.", procedure=note_site != "Lung")
                    if site == "Liver":
                        ctx.procedure(p, fu, LIVER_BX, vid=fvid)
                        ctx.note(p, fu, LIVER_BX_REPORT.format(hist=hist_txt), note_type=32835, note_class=3031451, vid=fvid)
                    row["stage_iv_diagnosis_date"] = fu
                    if sacts:    # 보조요법 후 재발이면 직전 요법에 진행일을 남긴다
                        ctx.sact_update(sacts[-1], date_of_progression=fu, recurrence_anatomic_site=site)
                    if ecog <= 2:
                        s3 = ctx.days(fu, ctx.randint(10, 30))
                        if s3 <= ctx.today:
                            mets_r = [site] if site != "Contralateral lung" else []
                            last3, sacts3, prog3 = _metastatic_course(ctx, p, st, s3, mets_r, prior_osi, 3, False, lobe_nm)
                            fu = last3
                fu = ctx.days(fu, ctx.randint(170, 200) if (curative and (fu - index).days < 1095 and not recurred)
                              else 365 if (curative and not recurred) else ctx.randint(80, 100)); k += 1
        ctx.finalize_person(p)
