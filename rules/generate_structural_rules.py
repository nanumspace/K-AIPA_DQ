# -*- coding: utf-8 -*-
"""
구조 규칙을 명세에서 자동 생성한다.

    python rules/generate_structural_rules.py      # spec/kai_cdm_spec.yaml -> rules/rules_structural.yaml

규칙 분류는 Kahn 프레임워크(OHDSI DataQualityDashboard 와 동일)를 따른다.
  Conformance  : 값/관계 적합성 (타입, 코드표, 패턴, PK/FK, 컬럼 구성)
  Completeness : 필수값, 테이블 존재
  Plausibility : 범위, 미래 날짜

심각도: 매뉴얼에 적힌 것(테이블·컬럼·필수·타입·PK/FK·설명의 코드표)은 error,
매뉴얼 밖의 값 제약(spec/constraints.yaml 의 범위·형식·코드표)과 명세에 없는 추가 컬럼은 warning.

보완 항목(매뉴얼에 없는 선택 컬럼·선택 테이블, spec 의 optional: true)과 표준 용어 대조(concept)는
매뉴얼 규칙 뒤에 번호를 이어 붙인다. 매뉴얼 규칙의 ID 가 바뀌지 않아야 병원의 규칙 조정이 그대로 남는다.
보완 규칙은 모두 warning 이다.
"""
import io, os, sys
from collections import OrderedDict, Counter
import yaml

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = yaml.safe_load(open(os.path.join(ROOT, "spec/kai_cdm_spec.yaml"), encoding="utf-8"))
PROFILES = yaml.safe_load(open(os.path.join(ROOT, "spec/cohort_profiles.yaml"), encoding="utf-8"))["cohorts"]
NONCANCER = [c for c, v in PROFILES.items() if "SACT" not in v["tables"]]
OUT = os.path.join(ROOT, "rules/rules_structural.yaml")

rules = []


def add(name, category, subcategory, table, check, severity="error", fields=None, params=None, desc="", scope="all"):
    rules.append(OrderedDict(id=f"ST-{len(rules) + 1:04d}", name=name, category=category, subcategory=subcategory,
                             table=table, fields=fields or [], severity=severity, check=check, params=params or {},
                             desc=desc, scope=scope, source="auto:spec"))


def field_rules(tname, f, severity=None):
    fn = f["name"]
    sev = lambda s: severity or s
    if f.get("required") and f.get("key") != "PK":
        add(f"{tname}.{fn} 필수", "Completeness", "value", tname, "not_null", fields=[fn], severity=sev("error"),
            desc=f"필수 필드 {fn} 은 NULL 일 수 없다.")
    if f["type"] in ("integer", "float", "date"):
        add(f"{tname}.{fn} 타입({f['type']})", "Conformance", "value", tname, "type", fields=[fn], severity=sev("error"),
            params=dict(type=f["type"]), desc=f"{fn} 은 {f['type']} 형식이어야 한다 (날짜는 YYYY-MM-DD).")
    if f.get("key") == "FK" and f.get("ref"):
        rt, rc = f["ref"].split(".")
        add(f"{tname}.{fn} -> {f['ref']} 참조무결성", "Conformance", "relational", tname, "fk", severity=sev("error"),
            fields=[fn], params=dict(ref_table=rt, ref_field=rc),
            desc=f"{fn} 의 값은 {f['ref']} 에 있어야 한다 (참조 테이블이 코호트에 없으면 건너뜀).")
    if f.get("codelist"):
        manual = f["codelist"] == f"{tname}.{fn}"     # 매뉴얼 설명의 'N=라벨' 코드표
        omop = f["codelist"].startswith("OMOP.")
        add(f"{tname}.{fn} 코드표", "Conformance", "value", tname, "codelist", fields=[fn],
            params=dict(codelist=f["codelist"]), severity=sev("error" if manual else "warning"),
            desc=f"{fn} 값은 코드표 {f['codelist']} 에 있어야 한다."
                 + (" (OMOP 대표 코드 집합이라 병원 어휘에 따라 다를 수 있어 경고)" if omop else
                    " (매뉴얼 자체 코드값, OMOP 개념 아님)" if not manual else ""))
    if f.get("range"):
        add(f"{tname}.{fn} 범위", "Plausibility", "atemporal", tname, "range", fields=[fn],
            params=dict(min=f["range"][0], max=f["range"][1]), severity="warning",
            desc=f"{fn} 은 [{f['range'][0]}, {f['range'][1]}] 범위여야 한다.")
    if f.get("pattern"):
        add(f"{tname}.{fn} 패턴", "Conformance", "value", tname, "pattern", fields=[fn],
            params=dict(regex=f["pattern"]), severity="warning", desc=f"{fn} 은 정규식 {f['pattern']} 에 맞아야 한다.")
    if f["type"] == "date":
        add(f"{tname}.{fn} 미래 날짜 금지", "Plausibility", "temporal", tname, "not_future", fields=[fn], severity=sev("error"),
            desc=f"{fn} 은 검증 실행일보다 미래일 수 없다.")


def table_rules(tname, t, severity=None):
    fnames = [f["name"] for f in t["fields"]]
    if not t.get("optional"):
        add(f"{tname} 테이블 존재", "Completeness", "table", tname, "table_present",
            desc=f"코호트 구성에 포함된 {tname} 테이블이 제출되어야 한다.")
    add(f"{tname} 컬럼 구성", "Conformance", "structure", tname, "columns", severity=severity or "error",
        params=dict(expected=[f["name"] for f in t["fields"] if not f.get("optional")]),
        desc="명세의 모든 컬럼이 있어야 한다 (선택 컬럼 제외).")
    add(f"{tname} 명세 외 컬럼", "Conformance", "structure", tname, "extra_columns", severity="warning",
        params=dict(expected=fnames), desc="명세에 없는 컬럼이 있으면 알린다(검사에는 쓰지 않음).")
    add(f"{tname}.{t['pk']} PK 유일성", "Conformance", "relational", tname, "pk_unique", severity=severity or "error",
        fields=[t["pk"]], desc="PK 는 NULL 이 아니고 유일해야 한다.")


# 1) 매뉴얼 테이블·컬럼
for tname, t in SPEC["tables"].items():
    if t.get("optional"):
        continue
    table_rules(tname, t)
    for f in t["fields"]:
        if not f.get("optional"):
            field_rules(tname, f)
    if "sact_id" in [f["name"] for f in t["fields"]] and tname != "SACT":
        add(f"{tname}.sact_id 비항암 코호트 NULL", "Conformance", "relational", tname, "must_be_null",
            fields=["sact_id"], scope=NONCANCER, desc="SACT 테이블이 없는 코호트에서는 sact_id 가 항상 NULL 이어야 한다.")

# 2) 보완: 선택 컬럼, 선택 테이블 (경고)
for tname, t in SPEC["tables"].items():
    if t.get("optional"):
        table_rules(tname, t, severity="warning")
        for f in t["fields"]:
            field_rules(tname, f, severity="warning")
    else:
        for f in t["fields"]:
            if f.get("optional"):
                field_rules(tname, f, severity="warning")

# 3) 표준 용어 대조: 선택 테이블 CONCEPT 를 냈을 때만 돈다 (경고)
for tname, t in SPEC["tables"].items():
    for f in t["fields"]:
        c = f.get("concept")
        if not c:
            continue
        what = ["CONCEPT 에 있어야"] + (["표준·유효 개념"] if c["standard"] else []) \
            + ([f"영역 {c['domain']}"] if c.get("domain") else []) \
            + ([f"어휘 {'/'.join(c['vocabularies'])}"] if c.get("vocabularies") else [])
        add(f"{tname}.{f['name']} 표준 용어", "Conformance", "vocabulary", tname, "concept", fields=[f["name"]],
            params=dict(c), severity="warning",
            desc=f"{f['name']} 의 개념 ID(0 제외)는 {', '.join(what)} 한다. 선택 테이블 CONCEPT 를 내지 않으면 건너뛴다.")


class D(yaml.SafeDumper):
    pass


D.add_representer(OrderedDict, lambda d, data: d.represent_dict(data.items()))
with open(OUT, "w", encoding="utf-8") as fh:
    fh.write("# 자동 생성 파일 — 손으로 고치지 않는다. python rules/generate_structural_rules.py\n")
    yaml.dump(dict(rules=rules), fh, Dumper=D, allow_unicode=True, sort_keys=False, width=160)

print(f"구조 규칙 {len(rules)}개 -> {os.path.relpath(OUT, ROOT)}")
print(Counter(r["category"] for r in rules))
print(Counter(r["check"] for r in rules))
