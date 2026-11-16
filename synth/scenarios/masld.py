# -*- coding: utf-8 -*-
"""
대사이상지방간(MASLD) 코호트 시나리오. MASLD 특화 테이블은 환자당 1행(진단 외래 방문)이고
섬유화 지표만 담는다(fib4/apri/bard). 점수는 진단일 같은 날 기록한 AST/ALT/혈소판/BMI/당뇨 여부와
진단 시점 나이로 산출한 값이며, 입력값(MEASUREMENT)을 그대로 쓴 순수 산술이라 DB 의 측정값으로 재계산하면 같은 값이 나온다.
어떤 점수도 명세 범위로 잘라(clamp) 만들지 않는다. 대신 검사값 자체를 임상적으로 가능한 범위(AST<=150, ALT>=12, PLT>=70)로 제한해
FIB-4<=50, APRI<=30 이 산술적으로 보장되게 했다.

점수 산식 (명세 4.4)
  FIB-4 = age x AST / (PLT x sqrt(ALT))                APRI = (AST/40) / PLT x 100     (AST 정상 상한 40 U/L = concepts.yaml AST normal)
  BARD  = 2 (AST/ALT >= 0.8) + 1 (BMI >= 28) + 1 (당뇨)
  SAFE        : 산식에 글로불린(g/dL)이 필요한데 MEASUREMENT 개념(concepts.yaml)에 글로불린/총단백이 없다. 측정되지 않은 값을 독립 난수로 만들어
                넣으면 DB 에서 재현할 수 없는 가짜 임상 점수가 되므로 safe_score 는 비워 둔다(선택 컬럼). 채우려면 concepts.yaml 에
                Globulin(g/dL) 측정 개념을 추가하고 환자별 글로불린 값을 기록한 뒤 위 명세 산식으로 계산해야 한다.
  LiverRisk   : 명세가 지정한 외부 계산기(https://www.liverriskscore.com/multicalc)로 산출하는 값이고 계수를 이 저장소에서 확인·검증할 수 없어
                liverrisk_score 도 비워 둔다. 근사식이나 난수로 채우지 않는다.

임상 경로 (단순화한 예시 경로이며 임상의 검증을 받지 않았다. 정성적 참고: AASLD MASLD 비침습 평가 요약
            https://www.aasld.org/liver-fellow-network/core-series/clinical-pearls/spare-me-jab-noninvasive-assessment-patients-masld
            문헌의 쪽수·세부 서지와 아래 수치 기준값은 이 저장소에서 원문을 대조하지 않았으므로 검증된 것으로 단정하지 않는다.
            모든 효과 크기는 예시용 근사값이고 실제 인구집단 결과가 아니다. 이 코호트는 100명 규모의 합성 분포이다.)
  - 명칭: 2023년 중반 이후(경계일 2023-06-24) 기록은 MASLD/MASH, 그 이전 기록은 당시 용어인 NAFLD/NASH 로 쓴다(경계일은 단순화한 가정).
    concepts.yaml 에 MASLD 전용 개념이 없어 진단 코드는 Fatty liver / NAFLD 중 하나다.
  - 진단 외래: 초음파, 동반질환, 신체계측, 혈액검사, 생활습관(체중 7~10% 감량, 지중해식 식단, 주 150분 운동), FIB-4.
    FIB-4 가 저위험 기준(65세 미만 1.3, 65세 이상 2.0 으로 가정) 이상이거나 간경변 소견이면 1개월 뒤 FibroScan 으로 섬유화를 평가한다.
    FibroScan LSM 기준은 F>=2 8.2, F>=3 9.7, F4 13.6 kPa, CAP 지방증 기준은 S>=1 248, S>=2 268, S3 280 dB/m 로 가정한 예시값(원문 미검증)이다.
    평가 후 F2~F3 일부만 진단 불확실로 간생검. FibroScan 대상은 약 12개월마다 재측정, 저위험군은 FIB-4 추적.
  - 간경변(F4): 6개월마다 간세포암 감시 초음파(예시 가정). 일부는 진행(F3→F4)·비대상성 악화 후 간이식.
  - 약물: 만성 동반질환 약(metformin/empagliflozin/pioglitazone, atorvastatin, lisinopril)은 진단 전부터 쓰던 것을 이어 처방한다
    (statin 은 임상 판단으로 유지하는 가정). pioglitazone 은 간경변 환자에게 쓰지 않는다(예시 가정). semaglutide 는 진단 시점이 아니라
    1개월 외래(FibroScan·검사 확인 후)에 적응증이 있는 일부(T2DM 이면서 BMI>=27, 비당뇨 BMI>=30 또는 BMI>=27+고혈압/이상지질혈증)에게 시작하고
    주 1회 SC 로 4주마다 증량한다: 당뇨 0.25→0.5→1.0 mg, 비당뇨 비만 0.25→0.5→1.0→1.7→2.4 mg (허가사항 방식의 단순화).
    비당뇨 비만 적응은 Wegovy 미국 FDA 허가일(2021-06-04) 이후 1개월 외래부터만 시작한다(그 이전 날짜는 시작하지 않음).
    FDA 허가 확인: https://www.fda.gov/news-events/press-announcements/fda-approves-new-drug-treatment-chronic-weight-management-first-2014
    MASH 적응 근거는 따로 가정하지 않는다. 증량 후 오심은 흔한 이상반응이라 증량 직후 일부에 생기고,
    2등급이면 다음 증량을 4주 미룬다(약 감량·중단 아님). 용량 단계마다 DRUG_EXPOSURE 행을 따로 쓰고(amount_value = mg),
    각 단계의 약 수령일은 간호/약국 방문(외래)으로 기록한다.
  - 환자별 잠재값(set-point)을 한 번 뽑아 방문마다 같은 환자의 값으로 쓴다: AST/ALT/혈소판/지질/크레아티닌/알부민/빌리루빈은 방문 간 변동(CV 5~20%)만 더하고,
    체중은 생활습관(반응군 3~8% 감량 후 일부 재증가)과 semaglutide(비당뇨 7~15%, 당뇨 4~8% 감량의 예시용 범위)로 시간에 따라 변하며,
    ALT/AST/TG 는 체중 감량에 비례해 낮아지고 당뇨 환자의 HbA1c 는 semaglutide 시작 후 약 1%p 낮아진다. 혈압도 환자 set-point + 체중 변화이다.
    간경변 진행 시 혈소판 감소·AST 상승, 비대상성 악화(이식 계획) 시 알부민 저하·빌리루빈 상승, 이식 후에는 정상에 가까운 AST/ALT 와 부분 회복된 혈소판이다.
이 코호트에는 SACT 가 없으므로 DRUG_EXPOSURE.sact_id 는 항상 비어 있다. 이상사례는 semaglutide 오심만 만든다.
statin 간독성은 만들지 않는다(statin 은 진단 전부터 쓰던 약이고 MASLD 자체가 ALT 변동을 설명할 수 있다).
저혈당은 이 코호트의 당뇨약(metformin/empagliflozin/pioglitazone/semaglutide)만으로는 근거가 없고 인슐린·SU 를 쓰지 않으므로 만들지 않는다.
사망은 사망 직전 입원 3일과 처방 종료(사망일 이후 처방 없음)로 반영한다.
"""
import math

from framework import *

# ---- concepts
FATTY, NAFLD = 4058680, 46273476
T2DM, HTN, HLD, OBESITY, CIRRHOSIS = 201826, 320128, 432867, 433736, 4112343
METFORMIN, EMPA, PIO, SEMA, STATIN, ACEI = 1503297, 45774435, 1584910, 793143, 1545958, 1308216   # SEMA 793143 = semaglutide (RxNorm 1991302), OHDSI SemaglutideNvamd protocol concept table
AST, ALT, PLT, HBA1C, GLU, TG, HDL, LDL = 3013721, 3006923, 3024929, 3004410, 3004501, 3022192, 3007070, 3028437
BMI_C, HT_C, WT_C, SBP, DBP, ALB, BILI, CR = 3038553, 3036277, 3025315, 3004249, 3012888, 3020491, 3024128, 3016723
US, TE, BIOPSY, LT = 4180938, 4260906, 4287806, 4321806
NAUSEA = 27674
OBS_LIFESTYLE, OBS_SMOKING = 4083515, 4275495
NOTE_RAD, CLASS_RAD = 44814637, 36716164
NOTE_PATH, CLASS_PATH = 44814640, 36716165
NOTE_DSCH, CLASS_DSCH = 44814641, 36716213
NOTE_OPD, CLASS_PROG = 44814645, 36716177

NOMENCLATURE_DATE = D(2023, 6, 24)       # NAFLD → MASLD 명칭 변경 합의 발표일 (이전 기록은 NAFLD/NASH)
OBESITY_SEMA_DATE = D(2021, 6, 4)        # 비당뇨 비만용 semaglutide 2.4 mg(Wegovy) 미국 허가일: 이전에는 비당뇨 비만 시작 없음
AST_ULN = CONCEPTS["measurements"][AST]["normal"][1]     # APRI 의 AST 정상 상한: MEASUREMENT.range_high 와 동일(40)

# 섬유화 단계별 검사 프로파일 (AST, ALT, 혈소판 평균, 환자 간 평균) 과 FibroScan LSM(kPa) 범위 (Eddowes 2019 M probe: 8.2/9.7/13.6)
LAB_PROFILE = {0: (30, 45, 240), 1: (36, 55, 225), 2: (45, 60, 200), 3: (58, 62, 160), 4: (75, 55, 105)}
KPA = {0: (3.5, 6.0), 1: (6.1, 8.1), 2: (8.2, 9.6), 3: (9.7, 13.5), 4: (13.6, 35.0)}
CAP_BAND = [(248.0, 267.0), (268.0, 279.0), (280.0, 360.0)]       # S1, S2, S3 (Karlas 2017)
STEATOSIS = [("mild", "경도"), ("moderate", "중등도"), ("severe", "고도")]
LSM_TEXT = {0: "below the F2 threshold of 8.2 kPa (F0-F1)", 1: "below the F2 threshold of 8.2 kPa (F0-F1)",
            2: "compatible with significant fibrosis (F2 range)", 3: "compatible with advanced fibrosis (F3 range)",
            4: "compatible with cirrhosis (F4 range)"}
PORTAL = {0: "no portal or perisinusoidal fibrosis", 1: "perisinusoidal (zone 3) fibrosis", 2: "perisinusoidal and periportal fibrosis",
          3: "bridging fibrosis", 4: "cirrhosis with regenerative nodules"}

US_REPORT = ("Abdomen ultrasonography. Liver: diffusely increased parenchymal echogenicity with {atten}, "
             "compatible with {grade} hepatic steatosis. Liver contour {contour}. Spleen {spleen}. No focal hepatic lesion. "
             "Gallbladder and bile ducts unremarkable. Impression: {grade_ko} 지방간{cirr}.")
SURV_REPORT = ("Abdomen ultrasonography (hepatocellular carcinoma surveillance, cirrhosis). Liver: coarse echotexture with nodular contour. "
               "No focal hepatic lesion. Spleen enlarged ({spleen} cm). {ascites}")
TE_REPORT = ("Transient elastography (FibroScan). Liver stiffness measurement {kpa} kPa (IQR/median {iqr}%, {n} valid measurements), "
             "CAP {cap} dB/m. Interpretation: LSM {lsm}; CAP in the S{sgrade} steatosis range.")
PATH_REPORT = ("Liver, percutaneous needle biopsy: {dx}. Steatosis grade {sg} ({pct}%), lobular inflammation {li}, "
               "hepatocellular ballooning {bal}; NAS {nas}/8. Fibrosis stage F{stage} (Kleiner). Portal tracts and parenchyma: {portal}. Iron stain negative.")
DSCH_REPORT = ("Discharge summary. Admitted for {kind} liver transplantation for MASLD-related cirrhosis with hepatic decompensation. "
               "Procedure {date}. Postoperative course: {course}. Discharged on POD 14 with immunosuppression and outpatient follow-up.")


# ============================================================== helpers
def _ok(ctx, p, d):
    return d <= ctx.today and (p.death_date is None or d <= p.death_date)


def _names(d):
    """기록일 기준 용어: (지방간질환 전체 이름, 지방간염 이름)."""
    if d >= NOMENCLATURE_DATE:
        return "metabolic dysfunction-associated steatotic liver disease (MASLD)", "Metabolic dysfunction-associated steatohepatitis (MASH)"
    return "nonalcoholic fatty liver disease (NAFLD)", "Nonalcoholic steatohepatitis (NASH)"


def _new_state(ctx, gender, stage, dm, htn, hld, wt0, chronic, responder):
    """환자별 잠재 set-point. 방문마다 이 값에 방문 간 변동만 더해 쓴다."""
    a, l, t = LAB_PROFILE[stage]
    male = gender == MALE
    cirr = stage == 4
    return dict(
        ast=ctx.normal(a, a * 0.25, 15, 130, 0), alt=ctx.normal(l, l * 0.3, 14, 200, 0), plt=ctx.normal(t, t * 0.15, 80, 420, 0),
        a1c=ctx.normal(7.1, 0.9, 5.9, 10.5, 1) if dm else ctx.normal(5.5, 0.25, 4.9, 6.2, 1),
        fpg=ctx.normal(93, 8, 76, 118, 0),
        tg=ctx.normal(175, 60, 60, 600, 0), hdl=ctx.normal(41 if male else 48, 8, 25, 90, 0),
        ldl=ctx.normal(92 if hld else 122, 25, 45, 250, 0),
        cr=ctx.normal(0.95 if male else 0.75, 0.14 if male else 0.11, 0.55 if male else 0.45, 1.4 if male else 1.1, 2),
        alb=ctx.normal(3.7 if cirr else 4.3, 0.3, 2.8 if cirr else 3.6, 5.0, 1),
        bili=ctx.normal(1.1 if cirr else 0.7, 0.35 if cirr else 0.2, 0.3, 3.0, 1),
        sbp=ctx.normal(134 if htn else 122, 8, 105 if htn else 100, 170 if htn else 145, 0),
        dbp=ctx.normal(84 if htn else 76, 5, 60, 100, 0),
        wt0=wt0, chronic=chronic, sema=None, sema_start=None, te_followup=False,
        # (시작일, 최종 체중 변화율, 시정수 일, 재증가 시정수 일|None)
        wt_effects=[(None, -ctx.rand(0.03, 0.08) if responder else ctx.rand(-0.01, 0.015), 150.0, 900.0)])


def _wt_frac(st, date):
    """기준 체중 대비 누적 체중 변화율(감량은 음수). 생활습관은 1년 뒤부터 일부 재증가."""
    tot = 0.0
    for start, final, tau, regain in st["wt_effects"]:
        t = (date - start).days
        if t <= 0:
            continue
        f = final * (1 - math.exp(-t / tau))
        if regain and t > 365:
            f *= math.exp(-(t - 365) / regain)
        tot += f
    return tot


def _weight(ctx, st, date):
    return round(max(35.0, ctx.normal(st["wt0"] * (1 + _wt_frac(st, date)), 0.5)), 1)


def _anthro(ctx, p, date, vid, st, ht, wt, with_height=False):
    bmi = round(wt / (ht / 100) ** 2, 1)
    if with_height:
        ctx.measure(p, date, HT_C, ht, vid=vid)
    ctx.measure(p, date, WT_C, wt, vid=vid); ctx.measure(p, date, BMI_C, bmi, vid=vid)
    d_wt = wt - st["wt0"]
    sbp = ctx.normal(st["sbp"] + 0.7 * d_wt, 6, 90, 200, 0); dbp = ctx.normal(st["dbp"] + 0.4 * d_wt, 4, 50, 120, 0)
    ctx.measure(p, date, SBP, sbp, vid=vid); ctx.measure(p, date, DBP, dbp, vid=vid)
    return bmi, sbp


def _visit_labs(ctx, st, dm, loss_pct, a1c_delta, full):
    """한 방문의 검사값 = 환자 set-point x 치료/체중 효과 + 방문 간 변동. 입력 범위는 FIB-4/APRI 가 명세 범위를 넘지 않도록 제한."""
    f_alt = max(0.55, 1 - 0.045 * loss_pct)
    f_ast = max(0.65, 1 - 0.03 * loss_pct)
    f_tg = max(0.7, 1 - 0.025 * loss_pct)
    if dm:
        a1c = ctx.normal(st["a1c"] + a1c_delta, 0.2, 5.6, 12, 1)
        fpg = ctx.normal(20 * a1c - 5, 12, 90, 300, 0)
    else:                                                   # 비당뇨: 진단 기준(HbA1c 6.5, FPG 126) 미만 유지
        a1c = ctx.normal(st["a1c"], 0.1, 4.8, 6.4, 1)
        fpg = ctx.normal(st["fpg"], 5, 72, 125, 0)
    v = {AST: ctx.normal(st["ast"] * f_ast, st["ast"] * 0.12, 12, 150, 0), ALT: ctx.normal(st["alt"] * f_alt, st["alt"] * 0.12, 12, 250, 0),
         PLT: ctx.normal(st["plt"], st["plt"] * 0.06, 70, 450, 0), HBA1C: a1c, GLU: fpg,
         TG: ctx.normal(st["tg"] * f_tg, st["tg"] * 0.2, 50, 800, 0), HDL: ctx.normal(st["hdl"], 3, 22, 100, 0),
         LDL: ctx.normal(st["ldl"], st["ldl"] * 0.08, 40, 300, 0), CR: ctx.normal(st["cr"], 0.05, 0.4, 3.0, 2)}
    if full:
        v[ALB] = ctx.normal(st["alb"], 0.12, 2.0, 5.5, 1)
        v[BILI] = ctx.normal(st["bili"], st["bili"] * 0.15, 0.2, 12, 1)
    return v


def _record(ctx, p, date, vid, vals):
    for c, v in vals.items():
        ctx.measure(p, date, c, v, vid=vid)


def _fib4(age, ast, alt, plt):
    return age * ast / (plt * math.sqrt(alt))


def _scores(age, vals, bmi, dm):
    """FIB-4 / APRI / BARD. 기록된 측정값에서 산식 그대로 계산하고 소수 둘째 자리로만 반올림한다(범위 보정 없음)."""
    ast, alt, plt = vals[AST], vals[ALT], vals[PLT]
    fib4 = round(_fib4(age, ast, alt, plt), 2)
    apri = round((ast / AST_ULN) / plt * 100.0, 2)
    bard = (2 if ast / alt >= 0.8 else 0) + (1 if bmi >= 28 else 0) + (1 if dm else 0)
    return fib4, apri, bard


def _fib4_class(fib4, age):
    low = 2.0 if age >= 65 else 1.3
    return "below the low-risk cut-off" if fib4 < low else ("indeterminate" if fib4 <= 2.67 else "high-risk range")


# ---- 처방
def _rx_block(ctx, p, st, start, days, vid):
    """한 처방 구간. 만성 약은 한 행씩, semaglutide 는 용량 단계별로 구간을 나눠 행을 쓴다(단계 시작일은 외래 방문)."""
    for c, dose in st["chronic"]:
        f = 2 if c == METFORMIN else 1
        ctx.drug(p, start, c, days, vid=vid, dose=dose, freq=f, quantity=days * f)
    segs = st["sema"]
    if segs:
        end = ctx.days(start, days - 1)
        for i, (s, dose) in enumerate(segs):
            a = max(s, start)
            b = end if i + 1 == len(segs) else min(ctx.days(segs[i + 1][0], -1), end)
            if a > b:
                continue
            v = vid if a == start else ctx.visit_on(p, a)
            n = (b - a).days + 1
            number = max(1, n // 7)
            ctx.drug(p, a, SEMA, n, vid=v, dose=dose, quantity=number, interval=7, number=number)


def _prescribe(ctx, p, st, start, end, vid, until):
    """[start, end) 를 90일 이하 처방으로 나눠 빈틈·겹침 없이 처방한다. until(기준일/사망일)을 넘는 날은 처방하지 않는다."""
    total = (end - start).days
    if total <= 0 or start > until:
        return
    parts = -(-total // 90)
    cur = start
    for i in range(parts):
        n = total // parts + (1 if i < total % parts else 0)
        n = min(n, (until - cur).days + 1)
        if n < 1:
            break
        _rx_block(ctx, p, st, cur, n, vid if i == 0 else ctx.visit_on(p, cur))
        cur = ctx.days(cur, n)


def _sema_plan(ctx, start, dm):
    """주 1회 semaglutide 용량 단계 [(시작일, mg)] 와 증량 직후 오심 사건 [(인지일, 등급)]. 2등급 오심이면 증량을 4주 미룬다."""
    ladder = [0.25, 0.5, 1.0] if dm else [0.25, 0.5, 1.0, 1.7, 2.4]
    segs, events = [], []
    d = start
    for i, dose in enumerate(ladder[:-1]):
        segs.append((d, dose))
        check = ctx.days(d, 28)                              # 증량 여부를 정하는 방문
        nxt = check
        if ctx.bern(0.30 if i == 0 else 0.25):
            grade = 2 if ctx.bern(0.3) else 1
            events.append((check, grade))
            if grade == 2:
                nxt = ctx.days(check, 28)                    # 같은 용량으로 4주 더 유지
        d = nxt
    segs.append((d, ladder[-1]))
    return segs, events


def _sema_dose_on(st, date):
    dose = None
    for s, d in st["sema"] or []:
        if s <= date:
            dose = d
    return dose


# ---- 검사/시술 기록
def _ultrasound(ctx, p, date, vid, stage, steat):
    ctx.procedure(p, date, US, vid=vid)
    en, ko = STEATOSIS[steat]
    cirr = stage == 4
    txt = US_REPORT.format(atten=["mild posterior attenuation", "moderate posterior attenuation", "marked posterior attenuation and poor visualization of the diaphragm"][steat],
                           grade=en, grade_ko=ko, contour="nodular and irregular" if cirr else "smooth",
                           spleen=f"enlarged ({ctx.randint(13, 17)} cm)" if cirr else "normal in size",
                           cirr=", 간경변 형태" if cirr else "")
    ctx.note(p, date, txt, note_type=NOTE_RAD, note_class=CLASS_RAD, vid=vid)


def _surveillance_us(ctx, p, date, vid, decomp):
    ctx.procedure(p, date, US, vid=vid)
    txt = SURV_REPORT.format(spleen=ctx.randint(13, 17), ascites="Small-volume ascites." if decomp else "No ascites.")
    ctx.note(p, date, txt, note_type=NOTE_RAD, note_class=CLASS_RAD, vid=vid)


def _elastography(ctx, p, date, vid, stage, steat):
    ctx.procedure(p, date, TE, vid=vid)
    kpa = round(ctx.rand(*KPA[stage]), 1)
    cap = int(ctx.rand(*CAP_BAND[steat]))
    txt = TE_REPORT.format(kpa=kpa, iqr=ctx.randint(5, 25), n=10, cap=cap, lsm=LSM_TEXT[stage], sgrade=steat + 1)
    ctx.note(p, date, txt, note_type=NOTE_RAD, note_class=CLASS_RAD, vid=vid)
    return kpa, cap


def _biopsy(ctx, p, date, vid, stage, steat):
    ctx.procedure(p, date, BIOPSY, vid=vid)
    li, bal = (ctx.randint(1, 3), ctx.randint(1, 2)) if stage >= 2 else (ctx.randint(0, 3), ctx.randint(0, 2))
    path_day = ctx.days(date, ctx.randint(2, 5))
    if not _ok(ctx, p, path_day):
        return
    disease, mash = _names(path_day)
    dx = mash if (li >= 1 and bal >= 1) else f"Hepatic steatosis without steatohepatitis ({disease.split('(')[-1].rstrip(')')})"
    txt = PATH_REPORT.format(dx=dx, sg=steat + 1, pct=[ctx.randint(5, 33), ctx.randint(34, 66), ctx.randint(67, 90)][steat], li=li, bal=bal,
                             nas=steat + 1 + li + bal, stage=stage, portal=PORTAL[stage])
    ctx.note(p, path_day, txt, note_type=NOTE_PATH, note_class=CLASS_PATH, vid=ctx.visit_on(p, path_day))


def _decompensate(ctx, st):
    """이식 계획 시점의 비대상성 악화: 알부민 저하, 빌리루빈 상승, 혈소판 추가 감소."""
    st["alb"] = ctx.normal(2.9, 0.3, 2.0, 3.4, 1)
    st["bili"] = ctx.normal(2.8, 0.9, 1.5, 8.0, 1)
    st["plt"] = max(70.0, round(st["plt"] * 0.9))


def _transplant(ctx, p, st, tx):
    tvid = ctx.visit(p, tx, INPATIENT, los=14)
    ctx.procedure(p, tx, LT, vid=tvid)
    living = ctx.bern(0.6)
    # 이식 후 7일: 이식편 기능 회복 중 (AST/ALT 아직 높고 혈소판은 낮고 알부민은 낮음)
    _record(ctx, p, ctx.days(tx, 7), tvid, {AST: ctx.normal(45, 12, 15, 120, 0), ALT: ctx.normal(60, 18, 15, 150, 0), PLT: ctx.normal(90, 20, 70, 160, 0),
                                              ALB: ctx.normal(3.1, 0.25, 2.5, 3.8, 1), BILI: ctx.normal(1.5, 0.5, 0.5, 3.5, 1), CR: ctx.normal(1.1, 0.2, 0.6, 2.0, 2)})
    txt = DSCH_REPORT.format(kind="living donor" if living else "deceased donor", date=tx.isoformat(),
                             course=ctx.choice(["uneventful", "transient acute kidney injury, recovered", "biliary leak managed conservatively"]))
    ctx.note(p, ctx.days(tx, 14), txt, note_type=NOTE_DSCH, note_class=CLASS_DSCH, vid=tvid)
    # 이식 후 set-point: 이식편 간기능 정상, 혈소판 부분 회복, 면역억제제(칼시뉴린 억제제)로 크레아티닌 약간 높음
    st.update(ast=ctx.normal(24, 6, 12, 60, 0), alt=ctx.normal(26, 8, 12, 70, 0), plt=ctx.normal(150, 35, 80, 300, 0),
              alb=ctx.normal(4.2, 0.25, 3.5, 5.0, 1), bili=ctx.normal(0.7, 0.2, 0.3, 1.5, 1), cr=ctx.normal(1.1, 0.2, 0.7, 2.0, 2))


def _death(ctx, p, dd):
    ctx.set_death(p, dd)
    ctx.visit(p, ctx.days(dd, -3), INPATIENT, los=3)


def _fu_note(ctx, p, st, fu, index, wt, bmi, vals, age, stage, transplanted, decomp):
    fib4 = round(_fib4(age, vals[AST], vals[ALT], vals[PLT]), 2)
    chg = (wt - st["wt0"]) / st["wt0"] * 100
    dose = _sema_dose_on(st, fu)
    parts = [f"Follow-up visit, {round((fu - index).days / 30.4)} months after diagnosis. Weight {wt} kg (BMI {bmi}; {chg:+.1f}% from baseline). "
             f"AST/ALT {int(vals[AST])}/{int(vals[ALT])} U/L, platelets {int(vals[PLT])} x10^3/uL, FIB-4 {fib4}."]
    if dose is not None:
        parts.append(f"Semaglutide {dose} mg SC weekly continued.")
    if transplanted:
        parts.append("Post-transplant follow-up; liver tests stable on immunosuppression.")
    elif decomp:
        parts.append("Hepatic decompensation; referred for liver transplantation.")
    elif stage == 4:
        parts.append("Compensated cirrhosis: hepatocellular carcinoma surveillance ultrasound every 6 months.")
    else:
        parts.append("Lifestyle therapy continued (target weight loss 7-10%).")
    return " ".join(parts)


# ============================================================== main
def generate(ctx: Ctx, n=100):
    for _ in range(n):
        gender = FEMALE if ctx.bern(0.45) else MALE
        age = int(ctx.normal(52, 11, 20, 80, 0))
        index = D(2019, 1, 1) + dt.timedelta(days=ctx.randint(0, 365 * 5 + 240))
        p = ctx.person(gender, age, index)

        stage = ctx.choice([0, 1, 2, 3, 4], p=[0.25, 0.30, 0.20, 0.15, 0.10])
        steat = ctx.choice([0, 1, 2], p=[0.45, 0.4, 0.15])
        dm, htn, hld = ctx.bern(0.38), ctx.bern(0.45), ctx.bern(0.5)
        ht = ctx.normal(171 if gender == MALE else 158, 6, 145, 195)
        bmi0 = ctx.normal(27.5, 3.5, 19, 42)
        wt0 = round(bmi0 * (ht / 100) ** 2, 1)
        obese = bmi0 >= 25                                  # 한국/아시아 기준 비만 BMI >= 25
        responder = ctx.bern(0.4)                           # 생활습관 중재 반응군 (체중 감소)
        smoker = ctx.bern(0.45 if gender == MALE else 0.08)

        # 진단 전부터 쓰던 만성 약 (pioglitazone 은 간경변 환자 제외)
        chronic = []
        if dm:
            chronic.append((METFORMIN, 500 if ctx.bern(0.5) else 1000))
            if ctx.bern(0.4): chronic.append((EMPA, 10))
            elif stage < 4 and ctx.bern(0.4): chronic.append((PIO, 15))
        if hld: chronic.append((STATIN, 20))
        if htn: chronic.append((ACEI, 10))
        # semaglutide 적응: T2DM 이면서 BMI>=27, 비당뇨 BMI>=30 또는 BMI>=27+고혈압/이상지질혈증. 간경변 환자는 제외.
        sema_eligible = stage < 4 and ((dm and bmi0 >= 27) or (not dm and (bmi0 >= 30 or (bmi0 >= 27 and (htn or hld)))))
        use_sema = sema_eligible and ctx.bern(0.35)
        st = _new_state(ctx, gender, stage, dm, htn, hld, wt0, chronic, responder)
        st["wt_effects"][0] = (index,) + st["wt_effects"][0][1:]

        # ---- 1) 진단 외래 (index)
        vid = ctx.visit(p, index)
        post = index >= NOMENCLATURE_DATE
        ctx.condition(p, index, FATTY if ctx.bern(0.6) else NAFLD, vid=vid)
        for c, flag in ((T2DM, dm), (HTN, htn), (HLD, hld), (OBESITY, obese)):
            if flag: ctx.condition(p, index, c, vid=vid)
        cirr_date = None
        if stage == 4:
            ctx.condition(p, index, CIRRHOSIS, vid=vid); cirr_date = index
        _ultrasound(ctx, p, index, vid, stage, steat)
        bmi, sbp = _anthro(ctx, p, index, vid, st, ht, wt0, with_height=True)
        if not (dm or htn or hld or obese or bmi >= 23 or st["a1c"] >= 5.7 or sbp >= 130 or st["tg"] >= 150):
            st["tg"] = float(ctx.randint(155, 260))         # MASLD 정의: 심장대사 기준 1개 보장
        vals = _visit_labs(ctx, st, dm, 0.0, 0.0, True)
        _record(ctx, p, index, vid, vals)
        fib4, apri, bard = _scores(p.age_on(index), vals, bmi, dm)
        ctx.disease_row(p, vid, fib4_score=fib4, apri_score=apri, bard_score=bard)      # safe/liverrisk: 모듈 docstring 참고
        ctx.observation(p, index, OBS_SMOKING, vid=vid, value_string="Current smoker" if smoker else "Never smoker")
        ctx.observation(p, index, OBS_LIFESTYLE, vid=vid, value_string="Lifestyle counselling: weight loss 7-10%, Mediterranean diet, exercise 150 min/wk")
        te_plan = stage == 4 or fib4 >= (2.0 if p.age_on(index) >= 65 else 1.3)
        disease_full = _names(index)[0]
        txt = (f"Outpatient note. Hepatic steatosis on ultrasound ({STEATOSIS[steat][0]}); diagnosed as {disease_full}"
               + (" (formerly NAFLD)" if post else "") + f". BMI {bmi}. Alcohol intake by history below the threshold for the diagnosis. Cardiometabolic risk: "
               + ", ".join([n_ for n_, f in (("T2DM", dm), ("HTN", htn), ("dyslipidemia", hld), ("obesity", obese)) if f] or ["BMI/lab criteria"])
               + f". FIB-4 {fib4} ({_fib4_class(fib4, p.age_on(index))}), APRI {apri}. "
               + ("Lifestyle modification counselled; FibroScan scheduled." if te_plan else "Lifestyle modification counselled; FIB-4 low risk, no elastography now."))
        ctx.note(p, index, txt, note_type=NOTE_OPD, note_class=CLASS_PROG, vid=vid)
        m1 = ctx.days(index, ctx.randint(28, 35))
        fu0 = ctx.days(index, ctx.randint(170, 200))
        _prescribe(ctx, p, st, index, m1, vid, ctx.today)       # 다음 처방(1개월 외래) 전날까지 이어 처방

        # ---- 2) 1개월 외래: FibroScan(위험도 높은 경우), semaglutide 시작, 일부 간생검
        sema_events = []
        if _ok(ctx, p, m1):
            mvid = ctx.visit_on(p, m1)
            plan = []
            kpa = None
            if te_plan:
                kpa, cap = _elastography(ctx, p, m1, mvid, stage, steat)
                st["te_followup"] = stage < 4
                plan.append(f"FibroScan LSM {kpa} kPa, CAP {cap} dB/m reviewed.")
            ctx.observation(p, m1, OBS_LIFESTYLE, vid=mvid, value_string="Lifestyle counselling reinforced")
            if use_sema and (dm or m1 >= OBESITY_SEMA_DATE):
                wt1 = _weight(ctx, st, m1)
                bmi1, _s = _anthro(ctx, p, m1, mvid, st, ht, wt1)
                st["sema"], sema_events = _sema_plan(ctx, m1, dm)
                st["sema_start"] = m1
                st["wt_effects"].append((m1, -ctx.rand(0.04, 0.08) if dm else -ctx.rand(0.07, 0.15), 190.0, None))
                target = st["sema"][-1][1]
                plan.append(f"Start semaglutide 0.25 mg SC weekly for {'T2DM with BMI ' + str(bmi1) if dm else 'obesity/overweight with BMI ' + str(bmi1)}; "
                            f"escalate every 4 weeks to {target} mg.")
            if plan:
                ctx.note(p, m1, "Outpatient follow-up. " + " ".join(plan), note_type=NOTE_OPD, note_class=CLASS_PROG, vid=mvid)
            _prescribe(ctx, p, st, m1, fu0, mvid, ctx.today)
            if kpa is not None and stage in (2, 3) and ctx.bern(0.30):     # F2~F3: 진단 불확실 시 간생검
                bx = ctx.days(m1, ctx.randint(10, 55))
                if _ok(ctx, p, bx):
                    _biopsy(ctx, p, bx, ctx.visit_on(p, bx), stage, steat)

        # ---- 3) 6개월 간격 추적
        n_fu = ctx.randint(4, 10)
        fu = fu0
        k, transplanted, decomp = 0, None, False
        while k < n_fu and fu <= ctx.today:
            # 이번 추적에서 결정되는 사망일 (이후 이벤트는 이 날짜 이전으로 제한)
            dd = None
            if cirr_date and transplanted is None and ctx.bern(0.07):
                dd = ctx.days(fu, ctx.randint(30, 150))
            elif transplanted and ctx.bern(0.06):
                dd = ctx.days(fu, ctx.randint(30, 150))
            elif ctx.bern(0.004):
                dd = ctx.days(fu, ctx.randint(10, 120))
            if dd is not None and dd > ctx.today:
                dd = None
            until = ctx.today if dd is None else min(dd, ctx.today)
            fvid = ctx.visit_on(p, fu)
            # 간이식 (간경변 진단 1년 이후, 비대상성 악화): 방문 검사값에 반영되도록 먼저 결정
            tx = None
            if cirr_date and transplanted is None and dd is None and (fu - cirr_date).days >= 365 and ctx.bern(0.09):
                tx_c = ctx.days(fu, ctx.randint(45, 120))
                if ctx.days(tx_c, 14) <= ctx.today:
                    tx = tx_c
                    decomp = True
                    _decompensate(ctx, st)
            wt = _weight(ctx, st, fu)
            bmi, _b = _anthro(ctx, p, fu, fvid, st, ht, wt)
            # 진행: F3 -> F4 (혈소판 감소, AST 상승, pioglitazone 중단)
            if stage == 3 and cirr_date is None and k >= 2 and ctx.bern(0.15):
                stage = 4; cirr_date = fu
                st["plt"] = max(70.0, round(st["plt"] * 0.78)); st["ast"] = min(130.0, round(st["ast"] * 1.15))
                st["alb"] = ctx.normal(3.7, 0.3, 2.8, 4.4, 1); st["bili"] = ctx.normal(1.1, 0.35, 0.4, 3.0, 1)
                st["chronic"] = [(c, d) for c, d in st["chronic"] if c != PIO]
                st["te_followup"] = False
                ctx.condition(p, fu, CIRRHOSIS, vid=fvid)
                _elastography(ctx, p, fu, fvid, stage, steat)
            elif st["te_followup"] and k % 2 == 1 and transplanted is None:    # 약 12개월마다 FibroScan 재측정
                _elastography(ctx, p, fu, fvid, stage, steat)
            if stage == 4 and transplanted is None:
                _surveillance_us(ctx, p, fu, fvid, decomp)
            loss = max(0.0, -_wt_frac(st, fu) * 100)
            a1c_delta = -1.0 * min(1.0, (fu - st["sema_start"]).days / 120) if (dm and st["sema_start"] and fu > st["sema_start"]) else 0.0
            vals = _visit_labs(ctx, st, dm, loss, a1c_delta, stage >= 3 or transplanted is not None or k % 2 == 0)
            _record(ctx, p, fu, fvid, vals)
            ctx.observation(p, fu, OBS_LIFESTYLE, vid=fvid, value_string=f"Lifestyle counselling; weight {wt} kg")
            ctx.note(p, fu, _fu_note(ctx, p, st, fu, index, wt, bmi, vals, p.age_on(fu), stage, transplanted, decomp), note_type=NOTE_OPD,
                     note_class=CLASS_PROG, vid=fvid)
            next_fu = ctx.days(fu, ctx.randint(170, 200))
            if tx is not None:
                next_fu = ctx.days(tx, ctx.randint(170, 200))
            _prescribe(ctx, p, st, fu, next_fu, fvid, until)        # 다음 추적 전날까지
            if tx is not None:
                _transplant(ctx, p, st, tx)
                transplanted = tx
                decomp = False
                fu = next_fu; k += 1
                continue
            if dd is not None:
                _death(ctx, p, dd)
                break
            fu = next_fu; k += 1

        # ---- semaglutide 오심: 증량 결정 방문에서 인지 (사망 후/기준일 이후는 제외)
        for ae_day, grade in sema_events:
            if _ok(ctx, p, ae_day):
                avid = ctx.visit_on(p, ae_day)
                ctx.ae(p, ae_day, NAUSEA, grade, vid=avid, causality=2, action=1)
                ctx.condition(p, ae_day, NAUSEA, vid=avid)
        ctx.finalize_person(p)
