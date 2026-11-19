# -*- coding: utf-8 -*-
"""가상데이터 개념 ID 를 기준 어휘(OHDSI v20260829)와 대조한다.

  python synth/check_vocab.py [--vocab raw/vocab/v20260829]

검사 대상
  1. spec/concepts.yaml 의 진단·이상사례·검사·약물·시술 개념: 존재, 표준, 유효, 영역·어휘
  2. spec/codelists.yaml 의 OMOP 코드 목록 중 표준 용어 대응이 있는 필드의 것: 존재, 표준, 유효, 영역·어휘
  3. synth/output/{clean,good}/<COHORT> 의 개념 필드 값: 명세의 표준 용어 대응(spec 의 concept, constraints.yaml 에서 관리)

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


def bindings():
    """명세의 표준 용어 대응: (TABLE, field) -> (허용 vocabulary_id 집합 또는 None, 요구 domain_id 또는 None, 표준 여부, 코드표)"""
    spec = yaml.safe_load((ROOT / "spec" / "kai_cdm_spec.yaml").read_text(encoding="utf-8"))["tables"]
    out = {}
    for t, d in spec.items():
        for f in d["fields"]:
            c = f.get("concept")
            if c:
                out[(t, f["name"])] = (set(c["vocabularies"]) if c.get("vocabularies") else None, c.get("domain"),
                                       c["standard"], f.get("codelist"))
    return out


CATALOG = {"conditions": ({"SNOMED"}, "Condition"), "adverse_events": ({"SNOMED"}, "Condition"),
           "measurements": ({"LOINC"}, "Measurement"), "drugs": ({"RxNorm", "RxNorm Extension"}, "Drug"),
           "procedures": ({"SNOMED"}, "Procedure")}


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

    def check(where, cid, vocabs, domain, standard=True):
        x = info(cid)
        if x is None:
            problems.append(f"{where}: {cid} 어휘에 없음")
            return
        name, dom, voc, std, inv = x
        if standard and (std != "S" or inv):
            problems.append(f"{where}: {cid} '{name}' 표준·유효 개념 아님 (standard={std}, invalid={inv})")
        if vocabs and voc not in vocabs:
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
    for name, cid in (cat.get("regimens") or {}).items():
        if cid is not None:
            check(f"concepts.yaml regimens '{name}'", str(cid), {"HemOnc"}, "Regimen")
            n_cat += 1

    bind = bindings()
    lists = yaml.safe_load((ROOT / "spec" / "codelists.yaml").read_text(encoding="utf-8"))["omop"]
    n_list, done = 0, set()
    for (table, field), (vocabs, domain, standard, codelist) in bind.items():
        if not codelist or codelist in done:
            continue
        done.add(codelist)
        for cid in lists[codelist]:
            if cid != "0":
                check(f"codelists.yaml {codelist}", str(cid), vocabs, domain, standard)
                n_list += 1

    n_val = 0
    for kind in ("clean", "good"):
        for f in sorted((ROOT / "synth" / "output" / kind).glob("*/*.csv")):
            table = f.stem
            with f.open(encoding="utf-8-sig", newline="") as h:
                r = csv.DictReader(h)
                fields = [c for c in (r.fieldnames or []) if (table, c) in bind]
                seen = set()
                for row in r:
                    for fld in fields:
                        v = row[fld]
                        if v in ("", "0") or (fld, v) in seen:
                            continue
                        seen.add((fld, v))
                        vocabs, domain, standard, _ = bind[(table, fld)]
                        check(f"{kind}/{f.parent.name}/{table}.{fld}", v, vocabs, domain, standard)
                        n_val += 1

    print(f"카탈로그 {n_cat}개, 코드 목록 {n_list}개, 가상데이터 개념 값 {n_val}건(필드·값 쌍) 대조")
    if problems:
        for p in sorted(set(problems)):
            print("  ✗", p)
        sys.exit(f"어휘와 어긋나는 항목 {len(set(problems))}건")
    print("모두 기준 어휘와 일치")


if __name__ == "__main__":
    main()
