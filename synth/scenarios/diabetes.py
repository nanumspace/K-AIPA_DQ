# -*- coding: utf-8 -*-
"""
당뇨병(제2형) 코호트 시나리오. DIABETES 특화 테이블은 환자당 1행(진단 외래 방문)이며
condition_start_date = 진단일(index), condition_end_date 는 진행 중이면 비운다(관해 요건을 만족한 일부 환자만 채움).

여정: 진단 외래(T2DM + 동반질환, 검사, 안저검사, 초기 약제) → 약 3개월 간격 추적 3~6년(HbA1c 에 따른 단계적 약제 강화,
연 1회 지질·간기능·신기능·안저검사, 합병증 CKD/IHD, SU/인슐린 저혈당 이상사례, 일부 관해, 일부 사망).
이 코호트에는 SACT 가 없으므로 DRUG_EXPOSURE.sact_id 는 항상 비어 있다.

임상 경로 (ADA Standards of Care in Diabetes 의 단순화한 예시 경로이며 임상의 검증을 받지 않았다. 아래 수치는 이 저장소에서 원문을 대조하지 않았으므로
            검증된 것으로 단정하지 않는다. 효과 크기는 예시용 근사값이며 실제 인구집단 결과가 아니고, 이 코호트는 100명 규모의 합성 분포이다)
  - 초기 요법: metformin 500 mg bid 로 시작해 첫 추적에서 eGFR>=45 이면 1000 mg bid 로 증량. 진단 HbA1c >=10% 이면 기저 인슐린 병용(10 IU 또는 0.15 IU/kg 중 큰 값에서 시작,
    공복혈당 >130 mg/dL 이면 방문마다 4 IU 씩 증량), 8.5~10% 이면 2제 병용 시작(목표 7% 보다 1.5%p 이상 높음).
    40~75세 당뇨 환자와 이상지질혈증 환자는 atorvastatin 20 mg(IHD 후 40 mg), 고혈압 환자는 lisinopril 10 mg.
  - 강화: 목표(70세 미만 <7.0%, 70세 이상 <8.0%) +0.5%p 이상이고 직전 변경 후 한 방문 이상 지났을 때 약 80% 에서 다음 약제를 추가(2제 → empagliflozin → semaglutide → 인슐린).
    CKD 진단·IHD 진단 시에는 혈당과 무관하게 empagliflozin 을 추가한다(신장·심혈관 보호 목적, ADA §9/§10/§11).
    semaglutide 는 주 1회 SC 로 0.25 → 0.5 → 1.0 mg 으로 4주마다 증량하고(Ozempic 허가사항) 증량 직후 오심이 일부에서 생긴다. 오심 2등급이면 증량을 4주 미룬다.
    용량 단계마다 DRUG_EXPOSURE 행을 따로 쓰고 단계 시작일(수령일)은 간호/약국 방문(외래)으로 기록한다.
  - 신기능: 환자별 크레아티닌 set-point → CKD-EPI 2021 eGFR. CKD 환자는 eGFR 이 서서히 내려가 진단 직전 방문과 진단 방문 두 번 모두 60 미만으로 측정된 뒤 진단(KDIGO).
    eGFR<45 이면 metformin 500 mg bid, sitagliptin 50 mg, <30 이면 metformin 중단·sitagliptin 25 mg 으로 조정한다(허가사항의 신기능별 용량).
  - 약제별 HbA1c 하강폭(ADA 표 기준 근사: metformin 1.0, SU 1.1, DPP-4 0.7, SGLT2 0.7, TZD 0.9, GLP-1 RA 1.4, 인슐린 1.6%p; 병용은 체감 0.8 배, 기저값에 비례)과
    체중 변화(SU +2.5%, TZD +3.5%, 인슐린 +3%, SGLT2 -2.5%, GLP-1 RA -6%, metformin -1%)로 방문마다 HbA1c·체중이 직전 구간 처방에 따라 이어진다.
    공복혈당은 같은 방문 HbA1c 에서 정해지고(FPG = 25 HbA1c - 45 + 변동), 지질은 환자별 기저값에 statin 효과(atorvastatin 20 mg 약 43%, 40 mg 약 49% LDL 감소)와 방문 간 변동을 더한다.
  - 관해(약 4%): 진단 HbA1c<8%, 체중 감량 반응군. 약 6~10번째 방문에서 HbA1c<6.5% 가 지속되어 혈당강하제를 모두 중단하고, 2번 방문 뒤(3개월 이상) HbA1c<6.5% 이면 condition_end_date 를
    그 방문일로 기록(약물 중단 3개월 이상 후 HbA1c<6.5% 라는 단순화한 관해 정의).

저혈당 (CTCAE v5.0 는 저혈당을 혈당 값으로 등급화: G2 <55-40, G3 <40-30, G4 <30 mg/dL; G1 은 정상하한~55 로 적용.
        확인: https://dctd.cancer.gov/research/ctep-trials/for-sites/adverse-events/ctcae-v5-5x7.pdf)
  - 등급은 최저 혈당에서 결정한다(G1 55~69, G2 40~54, G3 30~39 mg/dL). 이 혈당은 급성 값이라 공복혈당(Glucose fasting) MEASUREMENT 로 기록하지 않는다
    (concepts.yaml 에 무작위/모세혈관 혈당 개념이 없다). 값은 NOTE 에만 적는다.
  - G1: 환자가 자가 대처하고 다음 정기 방문에서 인지(AE 시작일 = 인지일 = 그 방문일, 조치 없음, 교육). G2: 구간 중 예약 외 외래 방문, 경구 당질로 회복, 약 감량(조치 2) 또는 글리메피리드
    1 mg 이면 중단·sitagliptin 전환(조치 4). G3: 응급실(ER) 방문, 정맥 포도당. SU 는 작용이 길어 일부가 입원 관찰(ER 방문 + 입원 1~2일; 중대한 이상사례=입원)이고
    나머지는 ER 에서 관찰 후 귀가(중대한 이상사례 아님). G3 SU 는 중단·sitagliptin 전환(조치 4), 인슐린은 20% 감량(조치 2). 인슐린 G2 도 20% 감량.
  - 위험은 인슐린·SU 를 쓰는 구간에서만, HbA1c<7%, 70세 이상, eGFR<45 일수록 높다. 중단 뒤 sitagliptin 은 같은 날(입원이면 퇴원일) 시작하고 eGFR 에 맞춘 용량을 쓴다.

용량은 concepts.yaml 의 dose_unit_label(mg 또는 IU) 단위 투여 1회 용량(amount_value)이고 metformin 은 하루 2회(frequency_per_day=2)다.
"""

from framework import *

T2DM = 201826
HTN, DLP, OBESITY, IHD, CKD, HYPO = 320128, 432867, 433736, 4185932, 46271022, 24609
NAUSEA = 27674
METFORMIN, GLIMEPIRIDE, SITAGLIPTIN, EMPAGLIFLOZIN = 1503297, 1597756, 1580747, 45774435
INSULIN, PIOGLITAZONE, SEMAGLUTIDE = 1502905, 1584910, 793143   # 793143 = semaglutide (RxNorm 1991302), OHDSI SemaglutideNvamd protocol concept table (1583722 is exenatide)
ATORVASTATIN, LISINOPRIL = 1545958, 1308216
GLUCOSE_LOWERING = {METFORMIN, GLIMEPIRIDE, SITAGLIPTIN, EMPAGLIFLOZIN, INSULIN, PIOGLITAZONE, SEMAGLUTIDE}
A1C, FPG, CREA, EGFR, SBP, DBP = 3004410, 3004501, 3016723, 3049187, 3004249, 3012888
HT, WT, BMI, TG, HDL, LDL, AST, ALT = 3036277, 3025315, 3038553, 3022192, 3007070, 3028437, 3013721, 3006923
FUNDOSCOPY, SMOKING = 4179908, 4275495
NOTE_OPD, CLASS_PROGRESS = 44814645, 36716177

FREQ = {METFORMIN: 2, GLIMEPIRIDE: 1, SITAGLIPTIN: 1, EMPAGLIFLOZIN: 1, PIOGLITAZONE: 1, INSULIN: 1, ATORVASTATIN: 1, LISINOPRIL: 1}
A1C_EFFECT = {METFORMIN: 1.0, GLIMEPIRIDE: 1.1, SITAGLIPTIN: 0.7, EMPAGLIFLOZIN: 0.7, PIOGLITAZONE: 0.9, INSULIN: 1.6, SEMAGLUTIDE: 1.4}
WT_EFFECT = {METFORMIN: -0.01, GLIMEPIRIDE: 0.025, SITAGLIPTIN: 0.0, EMPAGLIFLOZIN: -0.025, PIOGLITAZONE: 0.035, INSULIN: 0.03, SEMAGLUTIDE: -0.06}
LABEL = {METFORMIN: "metformin {} mg bid", GLIMEPIRIDE: "glimepiride {} mg qd", SITAGLIPTIN: "sitagliptin {} mg qd", EMPAGLIFLOZIN: "empagliflozin {} mg qd",
         PIOGLITAZONE: "pioglitazone {} mg qd", INSULIN: "insulin glargine {} IU qhs", SEMAGLUTIDE: "semaglutide {} mg weekly",
         ATORVASTATIN: "atorvastatin {} mg qhs", LISINOPRIL: "lisinopril {} mg qd"}
# CTCAE v5.0 저혈당 등급별 최저 혈당(mg/dL) 범위: (평균, 표준편차, 하한, 상한)
GLUCOSE_BY_GRADE = {1: (62, 4, 55, 69), 2: (47, 4, 40, 54), 3: (34, 3, 30, 39)}
SU_INSULIN_NAME = {GLIMEPIRIDE: "glimepiride", INSULIN: "insulin glargine"}


def generate(ctx: Ctx, n=100):
    for _ in range(n):
        gender = FEMALE if ctx.bern(0.45) else MALE
        age = int(ctx.normal(58, 11, 30, 85, 0))
        index = D(2018, 1, 1) + dt.timedelta(days=ctx.randint(0, 365 * 6 - 1))
        p = ctx.person(gender, age, index)
        _Course(ctx, p).run()
        ctx.finalize_person(p)


# ============================================================== 신기능
def _ckdepi(creatinine, age, male):
    """CKD-EPI 2021 (race 계수 없음), 반올림하지 않은 값."""
    k, a = (0.9, -0.302) if male else (0.7, -0.241)
    r = creatinine / k
    return 142 * min(r, 1.0) ** a * max(r, 1.0) ** -1.200 * 0.9938 ** age * (1.0 if male else 1.012)


def _egfr(creatinine, age, male):
    """기록하는 eGFR: 명세 plausible 범위 [1, 200] 로 제한한 정수."""
    return float(round(max(1.0, min(200.0, _ckdepi(creatinine, age, male)))))


def _cr_from_egfr(egfr, age, male):
    """CKD-EPI 2021 의 역함수(이분법). 크레아티닌이 커질수록 eGFR 은 단조 감소."""
    lo, hi = 0.2, 15.0
    for _ in range(50):
        mid = (lo + hi) / 2
        if _ckdepi(mid, age, male) > egfr:
            lo = mid
        else:
            hi = mid
    return round((lo + hi) / 2, 2)


# ============================================================== 처방 기록
def _truncate(r, end_date):
    """DRUG_EXPOSURE 행의 종료일을 앞당기고 일수/수량을 맞춘다."""
    r["drug_exposure_end_date"] = end_date
    r["days_supply"] = (end_date - r["drug_exposure_start_date"]).days + 1
    if r["dosing_number"] is not None:
        r["dosing_number"] = max(1, r["days_supply"] // 7)
        r["quantity"] = r["dosing_number"]
    elif r["quantity"] is not None:
        r["quantity"] = r["days_supply"] * (r["frequency_per_day"] or 1)


def _stop_rx(ctx, did, end_date):
    for r in ctx.rows["DRUG_EXPOSURE"]:
        if r["drug_exposure_id"] == did:
            _truncate(r, end_date)
            return


def _rx(ctx, p, date, concept, days, vid, dose):
    freq = FREQ[concept]
    did, _ = ctx.drug(p, date, concept, days, vid=vid, dose=dose, freq=freq, quantity=days * freq)
    return did


class _Course:
    """한 환자의 여정. 환자별 잠재값(기저 HbA1c, 체중, 크레아티닌/eGFR 궤적, 기저 지질·간효소, 혈압)을 한 번 정하고
    방문마다 직전 구간의 처방(약제 효과)과 방문 간 변동으로 값을 이어 간다."""

    def __init__(self, ctx, p):
        self.ctx, self.p = ctx, p
        self.index = p.index_date
        self.male = p.gender == MALE
        self.age0 = p.age_on(self.index)
        self.ht = ctx.normal(171 if self.male else 158, 6, 145, 195)
        bmi0 = ctx.normal(26.5, 3.5, 18, 42)
        self.wt0 = round(bmi0 * (self.ht / 100) ** 2, 1)
        self.wt = self.wt0
        self.a1c0 = ctx.normal(7.6, 1.4, 6.5, 13.5)                  # 신규 진단: HbA1c >= 6.5% (진단 기준)
        self.a1c = self.a1c0
        self.smoker = ctx.bern(0.45 if self.male else 0.08)
        self.cur_smok = self.smoker and ctx.bern(0.6)
        self.has_htn, self.has_dlp = ctx.bern(0.55), ctx.bern(0.6)
        self.obese = bmi0 >= 25                                      # 한국/아시아 기준 비만 BMI >= 25
        self.statin = self.has_dlp or 40 <= self.age0 <= 75          # ADA: 40~75세 당뇨는 중등도 statin
        self.remission = self.a1c0 < 8.0 and ctx.bern(0.04)
        self.rem_k = ctx.randint(6, 10) if self.remission else None
        self.ckd_at = None if self.remission else (ctx.randint(9, 20) if ctx.bern(0.15) else None)   # 방문 번호
        self.ihd_at = None if self.remission else (ctx.randint(4, 20) if ctx.bern(0.10) else None)
        self.n_visits = ctx.randint(12, 24)
        if self.remission:
            self.n_visits = max(self.n_visits, self.rem_k + 3)
        self.die = ctx.bern(0.06 if (self.ihd_at is not None or self.ckd_at is not None or p.age_on(ctx.days(self.index, 365 * 4)) >= 72) else 0.015)
        # 혈압 set-point
        self.sbp0 = ctx.normal(138 if self.has_htn else 124, 10, 100, 175, 0)
        self.dbp0 = ctx.normal(84 if self.has_htn else 76, 6, 55, self.sbp0 - 30, 0)
        # 기저 지질/간효소 (statin 시작 전 값)
        self.tg0 = ctx.lab_value(TG, shift=40 if self.has_dlp else 0, lo=40, nd=0)
        self.hdl0 = ctx.lab_value(HDL, shift=-4 if self.male else 5, lo=22, nd=0)
        self.ldl0 = ctx.lab_value(LDL, shift=30 if self.has_dlp else 0, lo=45, nd=0)
        self.ast0 = ctx.lab_value(AST, lo=ctx.LAB_FLOOR[AST], nd=0)
        self.alt0 = ctx.lab_value(ALT, lo=ctx.LAB_FLOOR[ALT], nd=0)
        # 신기능 궤적: 진행 CKD 는 진단 직전 방문(ckd_at-1)과 진단 방문(ckd_at) 모두 eGFR<60
        if self.ckd_at is not None:
            self.e0 = ctx.normal(78, 8, 65, 95, 1)
            self.e_ckd = ctx.normal(50, 5, 38, 54, 1)
        else:
            cr0 = ctx.normal(0.95 if self.male else 0.75, 0.14 if self.male else 0.11, 0.55 if self.male else 0.45, 1.4 if self.male else 1.1, 2)
            self.e0 = _ckdepi(cr0, self.age0, self.male)
        self.egfr = None
        # 처방 상태
        self.regimen = []
        self.dose = {}
        self.second = ctx.choice([SITAGLIPTIN, GLIMEPIRIDE, EMPAGLIFLOZIN, PIOGLITAZONE], p=[0.4, 0.25, 0.25, 0.1])
        self.ladder = [self.second] + [d for d in (EMPAGLIFLOZIN, SEMAGLUTIDE) if d != self.second] + [INSULIN]
        self.sema = None                                              # [(시작일, mg)]
        self.sema_events = []                                         # [(인지일, 등급)]
        self.last_change = 0
        self.no_titrate = -1
        self.pending = []                                             # 다음 정기 방문에서 인지될 G1 저혈당 [(약제, 혈당)]

    # ---------------------------------------------------------- 신기능/체중/혈당 궤적
    def egfr_true(self, k):
        base = self.e0 - 0.25 * k
        if self.ckd_at is None:
            return base
        ks, pre = max(0, self.ckd_at - 10), self.ckd_at - 1
        if k <= ks:
            return base
        if k < pre:
            b0 = self.e0 - 0.25 * ks
            return b0 + (self.e_ckd + 1.5 - b0) * (k - ks) / (pre - ks)
        if k == pre:
            return self.e_ckd + 1.5
        return max(25.0, self.e_ckd - 0.5 * (k - self.ckd_at))

    def next_a1c(self, prev, k):
        effs = sorted((A1C_EFFECT[c] for c in prev if c in A1C_EFFECT), reverse=True)
        total = sum(e * 0.8 ** i for i, e in enumerate(effs))
        scale = min(1.6, max(0.6, (self.a1c0 - 6.0) / 1.6))
        target = max(5.9, self.a1c0 - total * scale) + 0.04 * k       # 베타세포 기능 저하로 서서히 상승
        if self.remission and k >= self.rem_k - 2:
            target = 6.2
        a1c = self.a1c + 0.6 * (target - self.a1c) + float(self.ctx.rng.normal(0, 0.2))
        a1c = max(5.5, min(14.0, round(a1c, 1)))
        if self.remission and k >= self.rem_k - 1:
            a1c = min(a1c, 6.4)
        return a1c

    def next_wt(self, prev):
        frac = -0.015 + sum(WT_EFFECT.get(c, 0.0) for c in prev) - (0.08 if self.remission else 0.0)
        target = self.wt0 * (1 + frac)
        return round(max(35.0, self.wt + 0.45 * (target - self.wt) + float(self.ctx.rng.normal(0, 0.6))), 1)

    # ---------------------------------------------------------- 약제
    def start_dose(self, c, age):
        if c == METFORMIN: return 500
        if c == GLIMEPIRIDE: return 1 if (age >= 65 or self.egfr < 60) else 2
        if c == SITAGLIPTIN: return 100 if self.egfr >= 45 else (50 if self.egfr >= 30 else 25)
        if c == EMPAGLIFLOZIN: return 10
        if c == PIOGLITAZONE: return 15
        if c == INSULIN: return max(10, 2 * round(0.15 * self.wt / 2))
        if c == ATORVASTATIN: return 20
        if c == LISINOPRIL: return 10
        return None

    def add(self, c, cur, age, k):
        self.regimen.append(c)
        if c == SEMAGLUTIDE:
            self.sema, self.sema_events = self.sema_plan(cur)
            self.dose[c] = 0.25
        else:
            self.dose[c] = self.start_dose(c, age)
        self.last_change = k

    def sema_plan(self, start):
        """주 1회 semaglutide 용량 단계와 증량 직후 오심 사건. 2등급 오심이면 증량을 4주 미룬다."""
        ctx = self.ctx
        ladder = [0.25, 0.5, 1.0]
        segs, events = [], []
        d = start
        for i, dose in enumerate(ladder[:-1]):
            segs.append((d, dose))
            check = ctx.days(d, 28)                                   # 증량 여부를 정하는 방문
            nxt = check
            if ctx.bern(0.30 if i == 0 else 0.25):
                grade = 2 if ctx.bern(0.3) else 1
                events.append((check, grade))
                if grade == 2:
                    nxt = ctx.days(check, 28)
            d = nxt
        segs.append((d, ladder[-1]))
        return segs, events

    def sema_dose_on(self, date):
        dose = None
        for s, d in self.sema or []:
            if s <= date:
                dose = d
        return dose

    def renal_adjust(self, k):
        """최근 eGFR 기준 metformin/sitagliptin 용량 조정. 변경 문구 목록을 돌려준다."""
        ev = []
        if METFORMIN in self.regimen:
            if self.egfr < 30:
                self.regimen.remove(METFORMIN); ev.append("stop metformin (eGFR <30)"); self.last_change = k
            else:
                tgt = 1000 if (k >= 1 and self.egfr >= 45) else 500
                if tgt != self.dose[METFORMIN]:
                    ev.append(f"metformin {tgt} mg bid ({'titrate' if tgt > self.dose[METFORMIN] else 'reduce for eGFR <45'})")
                    self.dose[METFORMIN] = tgt; self.last_change = k
        if SITAGLIPTIN in self.regimen:
            tgt = 100 if self.egfr >= 45 else (50 if self.egfr >= 30 else 25)
            if tgt != self.dose[SITAGLIPTIN]:
                ev.append(f"sitagliptin {tgt} mg qd (renal dose)")
                self.dose[SITAGLIPTIN] = tgt; self.last_change = k
        return ev

    def rx_all(self, cur, days, vid, until):
        """현재 처방 전체를 [cur, cur+days) 구간으로 기록. 처방 행 id(비 semaglutide)를 돌려준다."""
        ctx, p = self.ctx, self.p
        days = int(min(days, (until - cur).days + 1))
        if days < 1:
            return {}
        ids = {}
        for c in self.regimen:
            if c == SEMAGLUTIDE:
                self.rx_sema(cur, days, vid)
            else:
                ids[c] = _rx(ctx, p, cur, c, days, vid, self.dose[c])
        return ids

    def rx_sema(self, start, days, vid):
        ctx, p = self.ctx, self.p
        end = ctx.days(start, days - 1)
        for i, (s, dose) in enumerate(self.sema):
            a = max(s, start)
            b = end if i + 1 == len(self.sema) else min(ctx.days(self.sema[i + 1][0], -1), end)
            if a > b:
                continue
            v = vid if a == start else ctx.visit_on(p, a)             # 단계 시작일은 간호/약국 방문
            n = (b - a).days + 1
            number = max(1, n // 7)
            ctx.drug(p, a, SEMAGLUTIDE, n, vid=v, dose=dose, quantity=number, interval=7, number=number)

    def label(self, c, date=None):
        d = self.sema_dose_on(date) if c == SEMAGLUTIDE else self.dose[c]
        return LABEL[c].format(f"{d:g}")

    # ---------------------------------------------------------- 저혈당 이상사례
    def hypoglycemia(self, k, cur, gap, rx_ids, until, age):
        """처방 구간 [cur, cur+gap) 의 저혈당. G1 은 다음 정기 방문에서 인지(pending), G2/G3 는 구간 중 사건."""
        ctx, p = self.ctx, self.p
        risk = (0.12 if INSULIN in self.regimen else 0.0) + (0.07 if GLIMEPIRIDE in self.regimen else 0.0)
        if not risk:
            return
        if self.a1c < 7.0:
            risk *= 1.8
        if age >= 70 or self.egfr < 45:
            risk *= 1.5
        if not ctx.bern(min(risk, 0.35)):
            return
        culprits = [c for c in (INSULIN, GLIMEPIRIDE) if c in self.regimen]
        culprit = culprits[0] if len(culprits) == 1 else (INSULIN if ctx.bern(0.6) else GLIMEPIRIDE)
        grade = ctx.choice([1, 2, 3], p=[0.55, 0.30, 0.15] if age >= 70 else [0.60, 0.30, 0.10])
        mean, sd, lo, hi = GLUCOSE_BY_GRADE[grade]
        glucose = int(ctx.normal(mean, sd, lo, hi, 0))
        nm = SU_INSULIN_NAME[culprit]
        if grade == 1:
            self.pending.append((culprit, glucose))
            return
        ae_day = ctx.days(cur, ctx.randint(10, max(10, gap - 10)))
        if ae_day + dt.timedelta(days=3) > until:
            return
        admitted, los = False, 0
        if grade == 2:
            avid = ctx.visit(p, ae_day, OUTPATIENT)
            rx_vid, restart = avid, ae_day
        else:
            avid = ctx.visit(p, ae_day, ER)
            admitted = ctx.bern(0.6 if culprit == GLIMEPIRIDE else 0.4)       # SU 는 작용이 길어 입원 관찰이 더 흔함
            if admitted:
                los = ctx.randint(1, 2)
                rx_vid = ctx.visit(p, ae_day, INPATIENT, los=los)
                restart = ctx.days(ae_day, los)
            else:
                rx_vid, restart = avid, ae_day
        # ---- 약 조정
        if culprit == GLIMEPIRIDE:
            withdraw = grade == 3 or self.dose[GLIMEPIRIDE] <= 1
            _stop_rx(ctx, rx_ids[GLIMEPIRIDE], ctx.days(ae_day, -1))
            if withdraw:
                self.regimen.remove(GLIMEPIRIDE)
                action = 4
                if SITAGLIPTIN not in self.regimen:
                    self.add(SITAGLIPTIN, restart, age, k)
                    self._restart(SITAGLIPTIN, restart, cur, gap, rx_vid, until)
                    change = f"glimepiride discontinued; switched to {self.label(SITAGLIPTIN)}"
                else:
                    change = "glimepiride discontinued"
            else:
                self.dose[GLIMEPIRIDE] = 1
                action = 2
                self._restart(GLIMEPIRIDE, restart, cur, gap, rx_vid, until)
                change = "glimepiride reduced to 1 mg qd"
        else:
            old = self.dose[INSULIN]
            _stop_rx(ctx, rx_ids[INSULIN], ctx.days(ae_day, -1))
            self.dose[INSULIN] = max(2, int(round(old * 0.8)))
            action = 2
            self._restart(INSULIN, restart, cur, gap, rx_vid, until)
            change = f"insulin glargine reduced from {old} to {self.dose[INSULIN]} IU qhs"
        self.last_change = k
        self.no_titrate = k + 1
        # ---- 기록
        ctx.ae(p, ae_day, HYPO, grade, vid=avid, causality=2, serious=admitted, action=action)
        ctx.condition(p, ae_day, HYPO, vid=avid)
        if grade == 2:
            txt = (f"Unscheduled outpatient visit for symptomatic hypoglycemia on {nm} (CTCAE grade 2: point-of-care capillary glucose {glucose} mg/dL). "
                   f"Alert and able to self-treat; recovered with oral carbohydrate. Plan: {change}.")
            ctx.note(p, ae_day, txt, note_type=NOTE_OPD, note_class=CLASS_PROGRESS, vid=avid)
        else:
            dispo = ("Admitted for observation because of the risk of prolonged or recurrent hypoglycemia." if admitted
                     else "Observed in the emergency department until glucose was stable, then discharged.")
            txt = (f"Emergency department visit for severe hypoglycemia on {nm} (CTCAE grade 3: capillary glucose {glucose} mg/dL, "
                   f"needed third-party assistance). Treated with IV dextrose. {dispo}")
            ctx.note(p, ae_day, txt, note_type=NOTE_OPD, note_class=CLASS_PROGRESS, vid=avid)
            if admitted:
                ctx.note(p, restart, f"Discharge note. Hospitalized {los} day(s) for severe hypoglycemia on {nm}; no recurrence. Discharge plan: {change}.",
                         note_type=NOTE_OPD, note_class=CLASS_PROGRESS, vid=rx_vid)

    def _restart(self, c, restart, cur, gap, vid, until):
        """사건 후 약을 재개/대체 시작: restart 부터 이번 구간 끝(cur+gap-1)까지."""
        ctx, p = self.ctx, self.p
        end = min(ctx.days(cur, gap - 1), until)
        n = (end - restart).days + 1
        if n >= 1:
            _rx(ctx, p, restart, c, n, vid, self.dose[c])

    # ---------------------------------------------------------- 여정
    def run(self):
        ctx, p, index, male = self.ctx, self.p, self.index, self.male
        cur, k = index, 0
        visit_dates = []
        row = None
        dd = None
        rem_done = False
        while k < self.n_visits and cur <= ctx.today:
            gap = ctx.randint(84, 98)                                 # 다음 방문까지 일수 = 처방 일수 (겹침/공백 없음)
            is_last = k + 1 >= self.n_visits or ctx.days(cur, gap) > ctx.today
            until = ctx.today
            if self.die and is_last and k >= 7:                       # 마지막 방문 후 짧은 기간 안에 사망
                cand = min(ctx.days(cur, ctx.randint(5, 50)), ctx.today)
                if cand > cur:
                    dd = cand; until = dd
            age = p.age_on(cur)
            vid = ctx.visit(p, cur, OUTPATIENT)
            visit_dates.append(cur)
            annual = (k % 4 == 0)
            new_dx, events = [], []
            prev = list(self.regimen)
            if k == 0:
                ctx.condition(p, cur, T2DM, vid=vid)
                for c, flag in ((HTN, self.has_htn), (DLP, self.has_dlp), (OBESITY, self.obese)):
                    if flag: ctx.condition(p, cur, c, vid=vid); new_dx.append(c)
                ctx.observation(p, cur, SMOKING, vid=vid, value_string="Current smoker" if self.cur_smok else ("Ex-smoker" if self.smoker else "Never smoker"))
                ctx.measure(p, cur, HT, self.ht, vid=vid)
                row = ctx.disease_row(p, vid, condition_start_date=index, condition_end_date=None)
            else:
                self.a1c = self.next_a1c(prev, k)
                self.wt = self.next_wt(prev)
            bmi = round(self.wt / (self.ht / 100) ** 2, 1)
            # 진단 방문은 FPG >= 126 도 함께 충족 (A1c 6.5 이상과 모순 없도록), 이후 정기 방문은 저혈당 범위(<70) 제외
            fpg = ctx.normal(self.a1c * 25 - 45, 15, 126 if k == 0 else 70, 400, 0)
            sbp = ctx.normal(self.sbp0 + 0.7 * (self.wt - self.wt0), 6, 90, 200, 0)
            # Stable outpatient BP: correlate systolic/diastolic variation; no shock physiology in this scenario.
            dbp = ctx.normal(self.dbp0 + 0.5 * (sbp - self.sbp0), 3, 50, sbp - 25, 0)
            ctx.measure(p, cur, A1C, self.a1c, vid=vid)
            ctx.measure(p, cur, FPG, fpg, vid=vid)
            ctx.measure(p, cur, SBP, sbp, vid=vid); ctx.measure(p, cur, DBP, dbp, vid=vid)
            ctx.measure(p, cur, WT, self.wt, vid=vid); ctx.measure(p, cur, BMI, bmi, vid=vid)
            # ---- 검사: 연 1회 지질·간기능·신기능·안저, CKD 진단 전후 두 방문은 신기능 추가
            labs = {}
            recheck = self.ckd_at is not None and k in (self.ckd_at - 1, self.ckd_at)
            if annual:
                red = 0.0
                if ATORVASTATIN in self.regimen and k > 0:
                    red = 0.49 if self.dose[ATORVASTATIN] >= 40 else 0.43
                labs[TG] = ctx.normal(self.tg0, self.tg0 * 0.18, 40, 800, 0)
                labs[HDL] = ctx.normal(self.hdl0, 3, 22, 100, 0)
                labs[LDL] = ctx.normal(self.ldl0 * (1 - red), self.ldl0 * 0.08, 30, 400, 0)
                labs[AST] = ctx.normal(self.ast0, self.ast0 * 0.15, ctx.LAB_FLOOR[AST], 400, 0)
                labs[ALT] = ctx.normal(self.alt0, self.alt0 * 0.15, ctx.LAB_FLOOR[ALT], 400, 0)
            if annual or recheck:
                e = self.egfr_true(k) + float(ctx.rng.normal(0, 1.0))
                labs[CREA] = _cr_from_egfr(e, age, male)
                labs[EGFR] = _egfr(labs[CREA], age, male)
                self.egfr = labs[EGFR]
            for c, v in labs.items():
                ctx.measure(p, cur, c, v, vid=vid)
            if annual:
                ctx.procedure(p, cur, FUNDOSCOPY, vid=vid)
            # ---- 진단/합병증과 그에 따른 약 변경
            if k == 0:
                self._initial_regimen(cur, age, events)
            else:
                events.extend(self.renal_adjust(k))
            if self.ckd_at is not None and k == self.ckd_at:
                ctx.condition(p, cur, CKD, vid=vid); new_dx.append(CKD)
                if EMPAGLIFLOZIN not in self.regimen and self.egfr >= 20:
                    self.add(EMPAGLIFLOZIN, cur, age, k); events.append("add empagliflozin 10 mg qd for CKD (renal protection)")
            if self.ihd_at is not None and k == self.ihd_at:
                ctx.condition(p, cur, IHD, vid=vid); new_dx.append(IHD)
                if ATORVASTATIN not in self.regimen:
                    self.regimen.append(ATORVASTATIN)
                self.dose[ATORVASTATIN] = 40; events.append("atorvastatin 40 mg qhs (high intensity for IHD)")
                if EMPAGLIFLOZIN not in self.regimen and self.egfr >= 20:
                    self.add(EMPAGLIFLOZIN, cur, age, k); events.append("add empagliflozin 10 mg qd (cardiovascular benefit)")
                self.last_change = k
            # ---- 직전 구간에 환자가 자가 대처한 G1 저혈당 인지
            hypo_txt = ""
            for culprit, g in self.pending:
                ctx.ae(p, cur, HYPO, 1, vid=vid, causality=2, serious=False, action=1)
                ctx.condition(p, cur, HYPO, vid=vid)
                hypo_txt += (f"Reports self-treated symptomatic hypoglycemia on {SU_INSULIN_NAME[culprit]} (CTCAE grade 1, home glucose {g} mg/dL); "
                             "hypoglycemia education reinforced, regimen unchanged. ")
            self.pending = []
            # ---- 관해: 혈당강하제 중단 / 3개월 이상 뒤 확인
            if self.remission and k == self.rem_k:
                self.regimen = [c for c in self.regimen if c not in GLUCOSE_LOWERING]
                events.append("stop all glucose-lowering drugs (HbA1c <6.5% sustained with weight loss)")
                self.last_change = k
                self.ladder = []
            elif self.remission and k == self.rem_k + 2 and not rem_done:
                rem_done = True
                row["condition_end_date"] = cur
                hypo_txt += f"Diabetes remission: HbA1c {self.a1c}% at least 3 months off glucose-lowering drugs. "
            # ---- 혈당 관리: 인슐린 증량, 약제 강화
            if INSULIN in self.regimen and k > 0 and k > self.no_titrate and fpg > 130 and self.dose[INSULIN] < 60 and INSULIN in prev:
                self.dose[INSULIN] += 4
                events.append(f"titrate insulin glargine to {self.dose[INSULIN]} IU")
            goal = 8.0 if age >= 70 else 7.0
            while self.ladder and self.ladder[0] in self.regimen:
                self.ladder.pop(0)
            if (k > 0 and not self.remission and self.a1c >= goal + 0.5 and k - self.last_change >= 1 and self.ladder and ctx.bern(0.8)):
                c = self.ladder.pop(0)
                self.add(c, cur, age, k)
                events.append(f"add {self.label(c, cur)}")
            # ---- 처방 + 노트
            rx_ids = self.rx_all(cur, gap, vid, until)
            ctx.note(p, cur, self._note_text(k, fpg, sbp, dbp, bmi, new_dx, events, labs, hypo_txt, annual, cur), note_type=NOTE_OPD,
                     note_class=CLASS_PROGRESS, vid=vid)
            if rx_ids:
                self.hypoglycemia(k, cur, gap, rx_ids, until, age)
            if dd is not None:
                break
            cur = ctx.days(cur, gap); k += 1
        # ---- 사망 (추적이 충분한 환자 중 일부, 사망 직전 입원)
        if dd is not None:
            last = visit_dates[-1]
            adm = ctx.days(dd, -2) if ctx.days(dd, -2) > last else dd
            ctx.set_death(p, dd)
            ctx.visit(p, adm, INPATIENT, los=(dd - adm).days)
        # ---- semaglutide 오심: 증량 결정 방문에서 인지 (사망 후/기준일 이후는 제외)
        for ae_day, grade in self.sema_events:
            if ae_day <= ctx.today and (p.death_date is None or ae_day <= p.death_date):
                avid = ctx.visit_on(p, ae_day)
                ctx.ae(p, ae_day, NAUSEA, grade, vid=avid, causality=2, action=1)
                ctx.condition(p, ae_day, NAUSEA, vid=avid)

    def _initial_regimen(self, cur, age, events):
        """진단 방문 초기 요법 (ADA §9): metformin 기본, HbA1c>=10% 이면 기저 인슐린, 8.5~10% 이면 2제."""
        self.add(METFORMIN, cur, age, 0)
        events.append(f"start {self.label(METFORMIN)}")
        if self.a1c >= 10.0:
            self.add(INSULIN, cur, age, 0)
            self.ladder.remove(INSULIN)
            events.append(f"start {self.label(INSULIN)} (HbA1c >=10%)")
        elif self.a1c >= 8.5:
            c = self.ladder.pop(0)
            self.add(c, cur, age, 0)
            events.append(f"start {self.label(c)} (dual therapy, HbA1c >=8.5%)")
        if self.statin:
            self.add(ATORVASTATIN, cur, age, 0)
            events.append(f"start {self.label(ATORVASTATIN)} ({'dyslipidemia' if self.has_dlp else 'diabetes, age 40-75'})")
        if self.has_htn:
            self.add(LISINOPRIL, cur, age, 0)
            events.append(f"start {self.label(LISINOPRIL)}")
        self.last_change = 0

    def _note_text(self, k, fpg, sbp, dbp, bmi, new_dx, events, labs, hypo_txt, annual, cur):
        names = {T2DM: "type 2 diabetes mellitus", HTN: "hypertension", DLP: "dyslipidemia", OBESITY: "obesity", CKD: "chronic kidney disease", IHD: "ischemic heart disease"}
        a1c = self.a1c
        if k == 0:
            smk = "current smoker" if self.cur_smok else ("ex-smoker" if self.smoker else "never smoker")
            s = (f"Endocrinology initial visit. Newly diagnosed type 2 diabetes mellitus. HbA1c {a1c}%, FBS {fpg} mg/dL, BP {sbp}/{dbp} mmHg, BMI {bmi} kg/m2, {smk}. "
                 + (f"Comorbidity: {', '.join(names[c] for c in new_dx)}. " if new_dx else ""))
        else:
            goal = 8.0 if self.p.age_on(cur) >= 70 else 7.0
            ctrl = "at goal" if a1c < goal else ("suboptimal" if a1c <= goal + 1.0 else "poor")
            s = f"Endocrinology follow-up (visit {k + 1}). T2DM, glycemic control {ctrl}: HbA1c {a1c}%, FBS {fpg} mg/dL. BP {sbp}/{dbp} mmHg, BMI {bmi} kg/m2. "
            if new_dx:
                s += f"New diagnosis: {', '.join(names[c] for c in new_dx)}. "
        if CKD in new_dx:
            s += "Persistent eGFR <60 mL/min/1.73m2 on repeat testing. "
        if labs:
            parts = []
            if LDL in labs:
                parts.append(f"LDL {labs[LDL]}, HDL {labs[HDL]}, TG {labs[TG]} mg/dL; AST/ALT {labs[AST]}/{labs[ALT]} U/L")
            parts.append(f"Cr {labs[CREA]} mg/dL, eGFR {labs[EGFR]}")
            s += "Labs: " + "; ".join(parts) + ". " + ("Fundoscopy done. " if annual else "")
        s += hypo_txt
        meds = ", ".join(self.label(c, cur) for c in self.regimen)
        s += f"Regimen: {meds}. "
        if events:
            s += f"{'Started' if k == 0 else 'Changes today'}: {'; '.join(events)}. "
        return s + "Lifestyle counseling, f/u 3 months."
