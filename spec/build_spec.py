# -*- coding: utf-8 -*-
"""
명세: 의뢰사 매뉴얼(엑셀)을 기계 판독 명세로 만든다.

    python spec/build_spec.py

입력  : raw/매뉴얼_질환별 데이터 테이블_20261116.xlsx   표·필드·타입·PK/FK·필수·설명 (의뢰사 최종본)
        spec/constraints.yaml                            매뉴얼에 없는 값 제약(범위·형식·OMOP 대표 코드) — 손으로 관리
출력  : spec/kai_cdm_spec.yaml   테이블·필드
        spec/codelists.yaml      설명의 'N=라벨' 코드표(embedded) + OMOP 대표 코드 집합(omop)
        spec/cohort_profiles.yaml 코호트별 테이블 구성

매뉴얼에 없는 표·열은 만들지 않는다. 매뉴얼의 필드가 constraints.yaml 에 없으면 값 제약 없이 들어가고,
constraints.yaml 에 매뉴얼에 없는 필드가 있으면 멈춘다(매뉴얼이 바뀐 것을 놓치지 않기 위해).
"""
import io, os, re, sys
from collections import OrderedDict
import openpyxl
import yaml

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "raw/매뉴얼_질환별 데이터 테이블_20261116.xlsx")
CONSTRAINTS = os.path.join(ROOT, "spec/constraints.yaml")
OUT = os.path.join(ROOT, "spec")

CORE = ["PERSON", "VISIT_OCCURRENCE", "PROCEDURE_OCCURRENCE", "DRUG_EXPOSURE", "CONDITION_OCCURRENCE",
        "MEASUREMENT", "OBSERVATION", "NOTE"]
DISEASE = {"LUNG_CANCER": "폐암", "BREAST_CANCER": "유방암", "COLORECTAL_CANCER": "대장암",
           "MASLD": "대사이상지방간", "DIABETES": "당뇨병", "LYMPHOMA": "림프종"}
SACT_COHORTS = ["LUNG_CANCER", "BREAST_CANCER", "COLORECTAL_CANCER", "LYMPHOMA"]
EXTENSION = ["SACT", "ADVERSE_EVENT"]

TYPE = {"integer": "integer", "float": "float", "date": "date", "varchar": "varchar", "RBDMS dependent text": "text"}
# 매뉴얼은 FK 표시만 있고 대상이 없다. 이름으로 정한다.
FK_REF = {"person_id": "PERSON.person_id", "visit_occurrence_id": "VISIT_OCCURRENCE.visit_occurrence_id",
          "sact_id": "SACT.sact_id", "note_id": "NOTE.note_id"}
CODE_LINE = re.compile(r"^\s*\d+\s*=")
CODE_ITEM = re.compile(r"(\d+)\s*=\s*([^,\n]+)")


def table_of(title):
    m = re.search(r"\(([A-Z_]+)\)\s*$", title)
    return m.group(1) if m else None


def category(t):
    return "core" if t in CORE else "disease" if t in DISEASE else "extension"


def main():
    cons = yaml.safe_load(open(CONSTRAINTS, encoding="utf-8"))
    field_cons, omop_sets = cons["fields"], cons["codelists"]
    used_cons = set()
    wb = openpyxl.load_workbook(SRC)
    tables, embedded, omop = OrderedDict(), OrderedDict(), OrderedDict()
    for ws in wb.worksheets:
        t = table_of(ws.title)
        if t is None:
            raise SystemExit(f"시트 이름에서 테이블을 찾지 못함: {ws.title!r}")
        section = str(ws["A1"].value or "").strip()
        fields, pk = [], None
        for r in range(3, ws.max_row + 1):
            name = ws.cell(r, 1).value
            if name is None or not str(name).strip():
                continue
            name = str(name).strip()
            typ = str(ws.cell(r, 2).value or "").strip()
            if typ not in TYPE:
                raise SystemExit(f"{ws.title} {r}행 {name}: 알 수 없는 타입 {typ!r}")
            key = str(ws.cell(r, 3).value or "").strip()
            req = str(ws.cell(r, 4).value or "").strip()
            if req not in ("Y", "N"):
                raise SystemExit(f"{ws.title} {r}행 {name}: 필수 여부가 Y/N 이 아님 ({req!r})")
            desc = str(ws.cell(r, 5).value or "").strip()
            f = OrderedDict(name=name, type=TYPE[typ], required=req == "Y", desc=desc)
            if key == "PK":
                f["key"], pk = "PK", name
            elif key == "FK":
                if name not in FK_REF:
                    raise SystemExit(f"{t}.{name}: FK 대상을 모름")
                f["key"], f["ref"] = "FK", FK_REF[name]
            c = field_cons.get(f"{t}.{name}", {})
            if c:
                used_cons.add(f"{t}.{name}")
            if c.get("fk_external") and not key:
                f["key"], f["ref"] = "FK_EXTERNAL", c["fk_external"]
            if c.get("range"):
                f["range"] = list(c["range"])
            if c.get("pattern"):
                f["pattern"] = c["pattern"]
            if c.get("codelist"):
                if c["codelist"] not in omop_sets:
                    raise SystemExit(f"{t}.{name}: constraints.yaml 에 코드표 {c['codelist']} 가 없음")
                f["codelist"] = c["codelist"]
                omop[c["codelist"]] = omop_sets[c["codelist"]]
            codes = OrderedDict()
            for line in desc.splitlines():
                if CODE_LINE.match(line):
                    for code, label in CODE_ITEM.findall(line):
                        codes[code] = label.strip()
            if codes:
                f["codelist"] = f"{t}.{name}"
                embedded[f["codelist"]] = codes
            fields.append(f)
        if pk is None:
            raise SystemExit(f"{t}: PK 가 없다")
        tables[t] = OrderedDict(name=t, kor=ws.title.split("(")[0], section=section, category=category(t), pk=pk,
                                fields=fields)
    missing = [t for t in CORE + list(DISEASE) + EXTENSION if t not in tables]
    if missing:
        raise SystemExit(f"매뉴얼에 없는 테이블: {missing}")
    stale = sorted(set(field_cons) - used_cons)
    if stale:
        raise SystemExit(f"constraints.yaml 에 매뉴얼에 없는 필드: {stale}")
    profiles = OrderedDict()
    for c, kor in DISEASE.items():
        profiles[c] = OrderedDict(kor=kor, tables=CORE + [c, "ADVERSE_EVENT"] + (["SACT"] if c in SACT_COHORTS else []))

    meta = OrderedDict(name="K-AI 질환별 코호트 데이터 명세", source=os.path.relpath(SRC, ROOT),
                       manual_date="2026-11-16", generated_by="spec/build_spec.py")

    class D(yaml.SafeDumper):
        pass
    D.add_representer(OrderedDict, lambda d, data: d.represent_dict(data.items()))
    D.ignore_aliases = lambda self, data: True

    def dump(obj, name):
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as fh:
            yaml.dump(obj, fh, Dumper=D, allow_unicode=True, sort_keys=False, width=160)
    dump(OrderedDict(meta=meta, tables=tables), "kai_cdm_spec.yaml")
    dump(OrderedDict(embedded=embedded, omop=omop), "codelists.yaml")
    dump(OrderedDict(cohorts=profiles), "cohort_profiles.yaml")
    nf = sum(len(t["fields"]) for t in tables.values())
    print(f"명세: 테이블 {len(tables)}개, 필드 {nf}개, 코드표 {len(embedded)}+{len(omop)}개")


if __name__ == "__main__":
    main()
