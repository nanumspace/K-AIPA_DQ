# -*- coding: utf-8 -*-
"""
전체 파이프라인 실행: 생성(clean) -> 검증(clean, 오류 0) -> 오류 주입(dirty) -> 검증(dirty) -> 검출 성능 평가
                      -> Good Sample 추출 -> 검증(good, 오류 0) -> 임상 불변식 점검

    python dq/run_all.py            # 6개 코호트 전부 (Good Sample·불변식 점검 포함)
    python dq/run_all.py --cohort LUNG_CANCER

코호트마다 시드는 20260907 + 코호트 번호, 검증 실행일은 2026-09-07 이다.
"""
import argparse, os, subprocess, sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COHORTS = ["LUNG_CANCER", "BREAST_CANCER", "COLORECTAL_CANCER", "MASLD", "DIABETES", "LYMPHOMA"]
ENV = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONWARNINGS="ignore")


def sh(*args):
    r = subprocess.run([sys.executable] + list(args), cwd=ROOT, env=ENV, capture_output=True, text=True, encoding="utf-8")
    out = (r.stdout or "").strip()
    if out: print(out)
    if r.returncode != 0:
        print(r.stderr[-2000:]); raise SystemExit(f"failed: {args}")


def summary(path):
    return json.load(open(os.path.join(ROOT, path, "summary.json"), encoding="utf-8"))


def must_be_clean(path, label):
    s = summary(path)
    # Clinical lines do not increment for maintenance or count prior adjuvant rows.
    # Preserve these real line values and the visible heuristic warnings in reports.
    unexpected = [r for r in s["rules"] if r["violations"] and
                  not (r["rule_id"] == "SEM-SACT-006" and r["severity"] == "warning")]
    if unexpected or s["rules_error"] or s["violations_error"]:
        raise SystemExit(f"{path}: {label} has unexpected findings ({unexpected}, {s['rules_error']} rule errors)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--cohort"); ap.add_argument("--n", type=int, default=100); ap.add_argument("--today", default="2026-09-07")
    a = ap.parse_args()
    cohorts = [a.cohort] if a.cohort else COHORTS
    for c in cohorts:
        sh("synth/generate.py", "--cohort", c, "--n", str(a.n), "--seed", str(20260907 + COHORTS.index(c)))
        sh("dq/engine.py", "--cohort", c, "--data", f"synth/output/clean/{c}", "--out", f"dq/reports/clean_{c}", "--today", a.today)
        must_be_clean(f"dq/reports/clean_{c}", "clean")
        sh("synth/inject_faults.py", "--cohort", c)
        sh("dq/engine.py", "--cohort", c, "--data", f"synth/output/dirty/{c}", "--out", f"dq/reports/dirty_{c}", "--today", a.today)
        sh("dq/verify.py", "--cohort", c)
        v = json.load(open(os.path.join(ROOT, f"dq/reports/verification_{c}.json"), encoding="utf-8"))
        if v["recall"] != 1.0:
            raise SystemExit(f"{c}: dirty recall {v['recall']} (미검출 {len(v['missed'])}건)")
    if not a.cohort:
        sh("dq/verify.py", "--all")
        counts = {c: summary(f"dq/reports/clean_{c}")["tables"] for c in COHORTS}
        json.dump(counts, open(os.path.join(ROOT, "synth/output/clean/_counts.json"), "w", encoding="utf-8"), indent=1)
        sh("synth/build_good_samples.py")
        for c in COHORTS:
            sh("dq/engine.py", "--cohort", c, "--data", f"synth/output/good/{c}", "--out", f"dq/reports/good_{c}", "--today", a.today)
            must_be_clean(f"dq/reports/good_{c}", "Good Sample")
        sh("synth/check_samples.py")
        if os.path.exists(os.path.join(ROOT, "raw/vocab/v20260829/CONCEPT.csv")):
            sh("synth/check_vocab.py")
        else:   # 어휘는 라이선스 때문에 저장소에 없다. 받아 둔 개발 환경에서만 대조한다.
            print("어휘 대조 생략: raw/vocab/v20260829 없음 (docs/vocabulary.md)")
        print(open(os.path.join(ROOT, "dq/reports/verification_summary.md"), encoding="utf-8").read())
