# -*- coding: utf-8 -*-
"""가상데이터 개념 ID 를 기준 어휘(OHDSI v20260829)와 대조한다.

  python synth/check_vocab.py [--vocab raw/vocab/v20260829]

검사 대상
  1. spec/concepts.yaml 의 진단·이상사례·검사·약물·시술 개념: 존재, 표준, 유효, 영역·어휘
  2. spec/constraints.yaml 의 OMOP 코드 목록(이상사례 코드값 필드 제외): 존재, 표준, 유효, 어휘
  3. synth/output/{clean,good}/<COHORT> 의 모든 *_concept_id 값: 필드별 허용 용어 (docs/vocabulary.md 2절)

어휘 파일은 라이선스 때문에 저장소에 없다(raw/vocab/ 는 .gitignore). 없으면 검사하지 못했다고 알리고 실패한다.
"""
import argparse
import csv
import os
import sys
from pathlib import Path

import duckdb
import yaml

ROOT = Path(__file__).resolve().parent.parent
sys.stdout.reconfigure(encoding="utf-8")

# 필드 -> (허용 vocabulary_id, 요구 domain_id 또는 None)
BINDING = {
    "PERSON.gender_concept_id": ({"Gender"}, "Gender"),
    "VISIT_OCCURRENCE.visit_concept_id": ({"Visit"}, "Visit"),
    "CONDITION_OCCURRENCE.condition_concept_id": ({"SNOMED"}, "Condition"),
    "PROCEDURE_OCCURRENCE.procedure_concept_id": ({"SNOMED"}, "Procedure"),
    "DRUG_EXPOSURE.drug_concept_id": ({"RxNorm", "RxNorm Extension"}, "Drug"),
    "MEASUREMENT.measurement_concept_id": ({"LOINC"}, "Measurement"),
    "MEASUREMENT.value_as_concept_id": ({"LOINC", "SNOMED"}, None),
    "OBSERVATION.observation_concept_id": ({"SNOMED", "LOINC"}, "Observation"),
    "NOTE.note_class_concept_id": ({"LOINC"}, "Note"),
    "SACT.regimen_concept_id": ({"HemOnc"}, None),
    "ADVERSE_EVENT.adverse_event_concept_id": ({"SNOMED"}, "Condition"),
}
TYPE_FIELDS = {"visit_type_concept_id", "procedure_type_concept_id", "condition_type_concept_id",
               "measurement_type_concept_id", "observation_type_concept_id", "note_type_concept_id"}
UNIT_FIELDS = {"unit_concept_id", "amount_unit_concept_id", "numerator_unit_concept_id", "denominator_unit_concept_id"}
# 매뉴얼 자체 코드값(1~6)이라 개념 검사 대상이 아닌 필드
CODE_FIELDS = {"severity_concept_id", "causality_concept_id", "seriousness_concept_id", "outcome_concept_id",
               "action_taken_concept_id"}
CATALOG = {"conditions": ({"SNOMED"}, "Condition"), "adverse_events": ({"SNOMED"}, "Condition"),
           "measurements": ({"LOINC"}, "Measurement"), "drugs": ({"RxNorm", "RxNorm Extension"}, "Drug"),
           "procedures": ({"SNOMED"}, "Procedure")}


def binding(table, field):
    if field in TYPE_FIELDS:
        return {"Type Concept"}, "Type Concept"
    if field in UNIT_FIELDS:
        return {"UCUM"}, "Unit"
    return BINDING.get(f"{table}.{field}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vocab", default=str(ROOT / "raw" / "vocab" / "v20260829"))
    a = ap.parse_args()
    concept_csv = Path(a.vocab) / "CONCEPT.csv"
    if not concept_csv.exists():
        sys.exit(f"어휘 파일이 없어 검사하지 못했습니다: {concept_csv} (Athena v20260829 묶음을 풀어 두세요)")
    con = duckdb.connect()
    con.execute(f"""CREATE TABLE c AS SELECT concept_id, concept_name, domain_id, vocabulary_id, standard_concept, invalid_reason
                    FROM read_csv('{concept_csv.as_posix()}', delim='\t', quote='', header=true, all_varchar=true)""")
    version = con.execute(f"""SELECT vocabulary_version FROM read_csv('{(Path(a.vocab) / "VOCABULARY.csv").as_posix()}',
                              delim='\t', quote='', header=true, all_varchar=true) WHERE vocabulary_id = 'None'""").fetchone()
    print(f"기준 어휘: {version[0] if version else '버전 행 없음'}")

    lookup = {}

    def info(cid):
        if cid not in lookup:
            lookup[cid] = con.execute("SELECT concept_name, domain_id, vocabulary_id, standard_concept, invalid_reason "
                                      "FROM c WHERE concept_id = ?", [cid]).fetchone()
        return lookup[cid]

    problems = []

    def check(where, cid, vocabs, domain):
        x = info(cid)
        if x is None:
            problems.append(f"{where}: {cid} 어휘에 없음")
            return
        name, dom, voc, std, inv = x
        if std != "S" or inv:
            problems.append(f"{where}: {cid} '{name}' 표준·유효 개념 아님 (standard={std}, invalid={inv})")
        if voc not in vocabs:
            problems.append(f"{where}: {cid} '{name}' 어휘 {voc} (허용 {sorted(vocabs)})")
        if domain and dom != domain:
            problems.append(f"{where}: {cid} '{name}' 영역 {dom} (요구 {domain})")

    cat = yaml.safe_load((ROOT / "spec" / "concepts.yaml").read_text(encoding="utf-8"))
    n_cat = 0
    for sec, (vocabs, domain) in CATALOG.items():
        for cid in cat.get(sec) or {}:
            check(f"concepts.yaml {sec}", str(cid), vocabs, domain)
            n_cat += 1
    for cohort, d in cat["cohort_definition"].items():
        for cid in d["condition_concept_ids"]:
            check(f"concepts.yaml cohort_definition.{cohort}", str(cid), {"SNOMED"}, "Condition")

    lists = yaml.safe_load((ROOT / "spec" / "constraints.yaml").read_text(encoding="utf-8"))["codelists"]
    n_list = 0
    for name, codes in lists.items():
        field = name.split(".", 1)[1]
        if not name.startswith("OMOP.") or field in CODE_FIELDS:
            continue
        b = binding("NOTE" if field.startswith("note_class") else "", field) or (
            ({"Gender"}, "Gender") if field == "gender_concept_id" else ({"Visit"}, "Visit") if field == "visit_concept_id" else None)
        for cid in codes:
            if cid == "0":
                continue
            check(f"constraints.yaml {name}", str(cid), *b)
            n_list += 1

    n_val = 0
    for kind in ("clean", "good"):
        for f in sorted((ROOT / "synth" / "output" / kind).glob("*/*.csv")):
            table = f.stem
            with f.open(encoding="utf-8-sig", newline="") as h:
                r = csv.DictReader(h)
                fields = [c for c in (r.fieldnames or []) if c.endswith("_concept_id") and c not in CODE_FIELDS]
                seen = set()
                for row in r:
                    for fld in fields:
                        v = row[fld]
                        if v in ("", "0") or (fld, v) in seen:
                            continue
                        seen.add((fld, v))
                        b = binding(table, fld)
                        if b is None:
                            problems.append(f"{kind}/{f.parent.name}/{table}.{fld}: 허용 용어가 정해지지 않은 필드")
                            continue
                        check(f"{kind}/{f.parent.name}/{table}.{fld}", v, *b)
                        n_val += 1

    print(f"카탈로그 {n_cat}개, 코드 목록 {n_list}개, 가상데이터 개념 값 {n_val}건(필드·값 쌍) 대조")
    if problems:
        for p in sorted(set(problems)):
            print("  ✗", p)
        sys.exit(f"어휘와 어긋나는 항목 {len(set(problems))}건")
    print("모두 기준 어휘와 일치")


if __name__ == "__main__":
    main()
