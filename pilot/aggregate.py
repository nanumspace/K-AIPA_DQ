# -*- coding: utf-8 -*-
"""중앙용 집계: 여러 기관의 submission.json 을 모아 규칙별로 본다.

    python pilot/aggregate.py <submission.json 또는 폴더> ... [--out <폴더>]

표준 라이브러리만 쓴다. 기관 이름은 파일이 든 폴더 이름(또는 --name 으로 준 것)이다.
같은 기관·같은 코호트의 실행이 여럿이면 가장 늦은 것(generated_at)만 쓴다 — 형식 문제를 고친 뒤의
두 번째 실행이 첫 실행을 덮는다.

규칙 설정(submission.json 의 rule_set): 앱에서 규칙을 끄거나 조정하거나 추가한 실행은 표준 규칙으로 돌린 결과와
섞어 비교하지 않는다. 규칙마다 origin 이 standard 이고 꺼지지 않은 결과만 기관 간 비교(rules_*.csv, 요약의 두 절)에
쓰고, 끈·조정한·사용자(USR-###)·관리자(ADM-###) 규칙의 결과는 nonstandard_rules.csv 로 따로 모은다.
rule_set 이 없는 제출분(이전 형식)은 표준 실행으로 본다.

산출물
  rules_by_site.csv       규칙 × 기관 표. 칸은 위반 건수(통과 0, 건너뜀 '-', 오류 '!')   (표준 출처 규칙만)
  rules_summary.csv       규칙마다 실패한 기관 수, 위반 합계, 검사 행 합계                  (표준 출처 규칙만)
  nonstandard_rules.csv   끈 · 조정한 · 사용자 · 관리자 규칙의 기관별 결과
  sites.csv               기관·코호트마다 규칙·위반·행 수, 정규화 건수, 규칙 설정 상태
  sufficiency_by_site.csv 데이터 충실도: 기관·코호트 × 기대 항목의 대상·충족 수와 충족률 (submission 스키마 3, 앱 1.0.4 이상)
  summary.md              사람이 읽는 요약: 모든 기관에서 우는 규칙(규칙·명세를 의심), 한 기관에서만 우는 규칙(그 기관의 내보내기를 의심),
                          입력 정규화, 규칙 설정이 표준이 아닌 실행, 데이터 충실도 항목별 합계

파일에는 환자 단위 정보가 없으므로 이 도구도 그런 것을 만들지 않는다.
"""
import argparse
import csv
import glob
import io
import json
import os
import sys
from collections import defaultdict


def find_files(paths):
    out = []
    for p in paths:
        if os.path.isdir(p):
            out.extend(sorted(glob.glob(os.path.join(p, "**", "submission.json"), recursive=True)))
        elif os.path.isfile(p):
            out.append(p)
        else:
            print(f"없음: {p}", file=sys.stderr)
    return out


def site_of(path, names):
    """기관 이름: --name 으로 주었으면 그것, 아니면 submission.json 이 든 폴더 이름."""
    if path in names:
        return names[path]
    d = os.path.basename(os.path.dirname(os.path.abspath(path)))
    # 실행 폴더(runs/<실행 ID>/)에 든 것이면 그 위 폴더 이름을 쓴다
    return d


def load(paths, names):
    latest = {}   # (site, cohort) -> submission
    for p in paths:
        with io.open(p, encoding="utf-8") as fh:
            s = json.load(fh)
        if not str(s.get("schema", "")).startswith("kai-dq-submission/"):
            print(f"건너뜀 (submission 아님): {p}", file=sys.stderr)
            continue
        s["_site"] = site_of(p, names)
        s["_path"] = p
        key = (s["_site"], s.get("cohort"))
        if key not in latest or s.get("generated_at", "") > latest[key].get("generated_at", ""):
            latest[key] = s
    return list(latest.values())


def ruleset_state(s):
    """제출분의 규칙 설정 상태: 'standard' | 'adjusted'(끄기·조정·사용자 규칙) | 'admin'(SQL 변경이나 ADM 규칙)"""
    rs = s.get("rule_set")
    if not isinstance(rs, dict):
        return "standard"
    if rs.get("admin_modified") or rs.get("admin"):
        return "admin"
    changed = rs.get("standard_hash") != rs.get("effective_hash") or rs.get("disabled") or rs.get("modified") or rs.get("custom")
    return "adjusted" if changed else "standard"


STATE_KOR = {"standard": "표준", "adjusted": "규칙 조정", "admin": "관리자 수정"}


def count(rs, key):
    v = (rs or {}).get(key)
    return len(v) if isinstance(v, (list, dict)) else (v or 0)


def is_standard_result(r):
    """규칙 결과가 표준 규칙의 것인가 (출처가 표준이고 꺼지지 않았다). origin 이 없으면 표준."""
    return r.get("origin", "standard") == "standard" and r.get("status") != "disabled"


def write_csv(path, header, rows):
    with io.open(path, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        w.writerows(rows)


def main():
    ap = argparse.ArgumentParser(description="여러 기관의 submission.json 을 규칙별로 집계한다")
    ap.add_argument("paths", nargs="+", help="submission.json 파일 또는 그것이 든 폴더")
    ap.add_argument("--out", default="pilot/out", help="산출물 폴더")
    ap.add_argument("--name", action="append", default=[], metavar="경로=기관",
                    help="파일 경로에 기관 이름을 붙인다 (기본은 폴더 이름)")
    a = ap.parse_args()
    names = dict(n.split("=", 1) for n in a.name)
    subs = load(find_files(a.paths), names)
    if not subs:
        print("읽을 submission.json 이 없다", file=sys.stderr)
        sys.exit(2)
    os.makedirs(a.out, exist_ok=True)

    # ---- 기관 표
    sites = sorted({(s["_site"], s["cohort"]) for s in subs})
    site_rows = []
    for s in sorted(subs, key=lambda x: (x["_site"], x["cohort"])):
        norm = s.get("normalization", {}) or {}
        norm_total = sum(sum(v.values()) for v in norm.values())
        rs = s.get("rule_set")
        site_rows.append([s["_site"], s["cohort"], s.get("cohort_kor", ""), s.get("app_version", ""), s.get("run_id", ""),
                          s.get("run_date", ""), s.get("rows_total", 0),
                          s["rules"]["total"], s["rules"]["failed"], s["rules"]["skipped"], s["rules"]["error"],
                          s["violations"]["total"], s["violations"]["error"], s["violations"]["warning"],
                          norm_total, "; ".join(f"{t}:{','.join(f'{k}={v}' for k, v in r.items() if v)}" for t, r in norm.items()),
                          STATE_KOR[ruleset_state(s)], count(rs, "disabled"), count(rs, "modified"), count(rs, "custom"), count(rs, "admin")])
    write_csv(os.path.join(a.out, "sites.csv"),
              ["기관", "코호트", "코호트(한글)", "앱버전", "실행ID", "검증일", "행수", "규칙", "실패", "건너뜀", "오류", "위반", "위반(오류)", "위반(경고)", "정규화건수", "정규화내역",
               "규칙설정", "꺼진규칙", "바꾼규칙", "사용자규칙", "관리자규칙"],
              site_rows)

    # ---- 규칙 × 기관 (표준 출처 규칙만) 과 표준이 아닌 규칙의 결과
    rules = {}        # rule_id -> meta
    cell = defaultdict(dict)   # rule_id -> (site, cohort) -> (status, violations, rows)
    nonstd_rows = []
    for s in sorted(subs, key=lambda x: (x["_site"], x["cohort"])):
        for r in s.get("by_rule", []):
            if is_standard_result(r):
                rules.setdefault(r["rule_id"], r)
                cell[r["rule_id"]][(s["_site"], s["cohort"])] = (r["status"], r.get("violations", 0), r.get("rows_checked", 0))
            else:
                nonstd_rows.append([s["_site"], s["cohort"], r["rule_id"], r.get("name", ""), r.get("origin", "standard"), r.get("status", ""),
                                    r.get("severity", ""), r.get("violations", 0), r.get("rows_checked", 0)])
    nonstd_rows.sort(key=lambda x: (x[2], x[0], x[1]))
    write_csv(os.path.join(a.out, "nonstandard_rules.csv"),
              ["기관", "코호트", "규칙ID", "이름", "출처", "상태", "심각도", "위반", "검사행"], nonstd_rows)
    site_labels = [f"{st}·{co}" for st, co in sites]

    def show(v):
        if v is None:
            return ""
        status, n, _ = v
        return {"pass": "0", "skipped": "-", "error": "!"}.get(status, str(n))

    by_site_rows = []
    summary_rows = []
    all_fail, one_fail = [], []
    for rid in sorted(rules):
        m = rules[rid]
        cells = cell[rid]
        ran = [k for k, v in cells.items() if v[0] in ("pass", "fail")]
        failed = [k for k, v in cells.items() if v[0] == "fail"]
        viol = sum(v[1] for v in cells.values() if v[0] == "fail")
        rows = sum(v[2] for v in cells.values() if v[0] in ("pass", "fail"))
        by_site_rows.append([rid, m.get("name", ""), m.get("category", ""), m.get("severity", ""), m.get("check", ""), m.get("table", "")]
                            + [show(cells.get(k)) for k in sites])
        summary_rows.append([rid, m.get("name", ""), m.get("category", ""), m.get("severity", ""), m.get("check", ""), m.get("table", ""),
                             len(ran), len(failed), viol, rows, f"{viol / rows * 100:.2f}" if rows else ""])
        if ran and len(failed) == len(ran) and len(ran) >= 2:
            all_fail.append((rid, m, len(ran), viol))
        elif len(failed) == 1 and len(ran) >= 2:
            one_fail.append((rid, m, failed[0], cells[failed[0]][1]))
    write_csv(os.path.join(a.out, "rules_by_site.csv"),
              ["규칙ID", "이름", "분류", "심각도", "검사", "테이블"] + site_labels, by_site_rows)
    write_csv(os.path.join(a.out, "rules_summary.csv"),
              ["규칙ID", "이름", "분류", "심각도", "검사", "테이블", "실행기관수", "실패기관수", "위반합계", "검사행합계", "위반율%"], summary_rows)

    # ---- 요약
    L = [f"# 파일럿 집계 — 기관·코호트 {len(sites)}개, 표준 규칙 {len(rules)}개", ""]
    L += ["| 기관 | 코호트 | 검증일 | 행 | 규칙 | 실패 | 위반 | 정규화 | 규칙 설정 |", "|---|---|---|---|---|---|---|---|---|"]
    for r in site_rows:
        L.append(f"| {r[0]} | {r[2]} | {r[5]} | {r[6]:,} | {r[7]} | {r[8]} | {r[11]:,} | {r[14]:,} | {r[16]} |")
    hashes = {(s.get("rule_set") or {}).get("standard_hash") for s in subs} - {None}
    if len(hashes) > 1:
        L += ["", f"> 주의: 제출분 사이에 표준 규칙 묶음 해시(`standard_hash`)가 {len(hashes)}가지입니다. 앱(규칙) 버전이 달라 같은 규칙 id 라도 뜻이 다를 수 있습니다."]
    L += ["", "## 실행한 모든 기관에서 우는 규칙 — 규칙이나 명세를 먼저 의심한다 (표준 출처 규칙만)", ""]
    if all_fail:
        L += ["| 규칙 | 심각도 | 기관 수 | 위반 합계 |", "|---|---|---|---|"]
        for rid, m, n, v in sorted(all_fail, key=lambda x: -x[3]):
            L.append(f"| {rid} {m.get('name', '')} | {m.get('severity', '')} | {n} | {v:,} |")
    else:
        L.append("(없음)")
    L += ["", "## 한 기관에서만 우는 규칙 — 그 기관의 내보내기나 관행을 먼저 의심한다 (표준 출처 규칙만)", ""]
    if one_fail:
        L += ["| 규칙 | 심각도 | 기관 | 위반 |", "|---|---|---|---|"]
        for rid, m, (st, co), v in sorted(one_fail, key=lambda x: -x[3])[:60]:
            L.append(f"| {rid} {m.get('name', '')} | {m.get('severity', '')} | {st}·{co} | {v:,} |")
        if len(one_fail) > 60:
            L.append(f"| … {len(one_fail) - 60}개 더 (rules_summary.csv) | | | |")
    else:
        L.append("(없음)")
    L += ["", "## 규칙 설정이 표준이 아닌 실행 — 기관 간 비교에 섞지 않는다 (nonstandard_rules.csv)", ""]
    nonstd_subs = [s for s in sorted(subs, key=lambda x: (x["_site"], x["cohort"])) if ruleset_state(s) != "standard"]
    if nonstd_subs:
        L += ["| 기관 | 코호트 | 설정 | 꺼진 규칙 | 바꾼 규칙 | 사용자 규칙 | 관리자 규칙 |", "|---|---|---|---|---|---|---|"]
        for s in nonstd_subs:
            rs = s.get("rule_set") or {}
            ids = lambda k: ", ".join(x if isinstance(x, str) else x.get("rule_id", "") for x in (rs.get(k) or [])) or "-"
            L.append(f"| {s['_site']} | {s['cohort']} | {STATE_KOR[ruleset_state(s)]} | {ids('disabled')} | {ids('modified')} | {ids('custom')} | {ids('admin')} |")
    else:
        L.append("(없음)")
    L += ["", "## 입력 정규화 (내보내기 흔적)", ""]
    norm_any = False
    for s in subs:
        for t, r in (s.get("normalization", {}) or {}).items():
            items = ", ".join(f"{k} {v:,}" for k, v in r.items() if v)
            if items:
                L.append(f"- {s['_site']}·{s['cohort']} {t}: {items}")
                norm_any = True
    if not norm_any:
        L.append("(없음)")

    # ---- 데이터 충실도 (submission 스키마 3 이상). 기관·코호트 × 항목의 대상·충족 수, 기관 사이 합계
    suff_rows, suff_total = [], defaultdict(lambda: [0, 0, 0])   # (cohort, id, title, unit) -> [기관 수, 대상, 충족]
    for s in sorted(subs, key=lambda x: (x["_site"], x["cohort"])):
        for x in s.get("sufficiency") or []:
            if x.get("status") != "ok":
                suff_rows.append([s["_site"], s["cohort"], x["id"], x.get("title", ""), x.get("unit", ""), x.get("status", ""), "", "", "", ""])
                continue
            n, m = x.get("eligible", 0), x.get("met", 0)
            suff_rows.append([s["_site"], s["cohort"], x["id"], x.get("title", ""), x.get("unit", ""), "ok", n, m,
                              f"{m / n * 100:.1f}" if n else "", x.get("per_year_median") or ""])
            t = suff_total[(s["cohort"], x["id"], x.get("title", ""), x.get("unit", ""))]
            t[0] += 1; t[1] += n; t[2] += m
    write_csv(os.path.join(a.out, "sufficiency_by_site.csv"),
              ["기관", "코호트", "항목", "이름", "단위", "상태", "대상", "충족", "충족률%", "1인·1년당 중앙값"], suff_rows)
    L += ["", "## 데이터 충실도 — 있어야 할 기록이 있는 비율 (규칙 위반과 별개, sufficiency_by_site.csv)", ""]
    if suff_total:
        L += ["| 코호트 | 항목 | 단위 | 기관 수 | 대상 | 충족 | 충족률 |", "|---|---|---|---|---|---|---|"]
        for (co, iid, title, unit), (k, n, m) in sorted(suff_total.items()):
            L.append(f"| {co} | {iid} {title} | {unit} | {k} | {n:,} | {m:,} | {f'{m / n * 100:.1f}%' if n else '-'} |")
    else:
        L.append("(없음 — 1.0.4 이전 앱의 제출분에는 데이터 충실도가 없다)")
    L.append("")
    with io.open(os.path.join(a.out, "summary.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(L))
    print(f"기관·코호트 {len(sites)}개, 표준 규칙 {len(rules)}개 → {a.out}/ (sites.csv, rules_by_site.csv, rules_summary.csv, nonstandard_rules.csv, sufficiency_by_site.csv, summary.md)")
    print(f"  모든 기관에서 우는 규칙 {len(all_fail)}개, 한 기관에서만 우는 규칙 {len(one_fail)}개, 규칙 설정이 표준이 아닌 실행 {len(nonstd_subs)}개")


if __name__ == "__main__":
    main()
