# -*- coding: utf-8 -*-
"""데이터 충실도의 개념 집합을 기준 어휘(OHDSI v20260829)로 펼친다.

    python spec/build_concept_sets.py [--vocab raw/vocab/v20260829]

입력  : spec/expected_data.yaml 의 concept_sets (손으로 관리)
        raw/vocab/v20260829/ (Athena 묶음. 라이선스 때문에 저장소에 없다)
출력  : spec/concept_sets.yaml  집합마다 표준·유효 개념 ID 목록 (이름은 싣지 않는다)

집합 정의
  loinc_components  LOINC 구성요소 이름(% 와일드카드 가능). 'Has component' 로 그 구성요소를 쓰는 표준 LOINC 검사 전부
  systems           (선택) 검체 이름. 'Has system' 이 이 중 하나인 검사만
  exclude_systems   (선택) 이 검체의 검사는 뺀다
  concepts          개념 ID 그대로 (표준·유효여야 한다)
  descendants_of    CONCEPT_ANCESTOR 로 이 개념과 모든 표준 하위 개념

이름이나 ID 가 어휘에 없거나, 집합이 비면 멈춘다(정의가 어휘와 어긋난 것을 놓치지 않기 위해).
"""
import argparse
import io
import sys
from collections import OrderedDict
from pathlib import Path

import duckdb
import yaml

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
KEYS = {"name", "loinc_components", "systems", "exclude_systems", "concepts", "descendants_of"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vocab", default=str(ROOT / "raw" / "vocab" / "v20260829"))
    a = ap.parse_args()
    vocab = Path(a.vocab)
    if not (vocab / "CONCEPT.csv").exists():
        sys.exit(f"어휘 파일이 없어 개념 집합을 만들 수 없습니다: {vocab} (Athena v20260829 묶음을 풀어 두세요)")
    defs = yaml.safe_load((ROOT / "spec" / "expected_data.yaml").read_text(encoding="utf-8"))["concept_sets"]

    con = duckdb.connect()
    rd = lambda f: f"read_csv('{(vocab / f).as_posix()}', delim='\t', quote='', header=true, all_varchar=true)"
    con.execute(f"""CREATE TABLE c AS SELECT CAST(concept_id AS BIGINT) AS id, concept_name AS n, domain_id AS dom,
                    vocabulary_id AS v, concept_class_id AS cl, standard_concept AS s, invalid_reason AS inv FROM {rd('CONCEPT.csv')}""")
    con.execute(f"""CREATE TABLE r AS SELECT CAST(concept_id_1 AS BIGINT) AS a, CAST(concept_id_2 AS BIGINT) AS b, relationship_id AS rel
                    FROM {rd('CONCEPT_RELATIONSHIP.csv')} WHERE relationship_id IN ('Has component', 'Has system') AND invalid_reason IS NULL""")
    version = con.execute(f"SELECT vocabulary_version FROM {rd('VOCABULARY.csv')} WHERE vocabulary_id = 'None'").fetchone()[0]
    seeds = sorted({int(x) for d in defs.values() for x in d.get("descendants_of", [])})
    con.execute(f"""CREATE TABLE ca AS SELECT CAST(ancestor_concept_id AS BIGINT) AS a, CAST(descendant_concept_id AS BIGINT) AS d
                    FROM {rd('CONCEPT_ANCESTOR.csv')} WHERE CAST(ancestor_concept_id AS BIGINT) IN ({', '.join(map(str, seeds)) or 'NULL'})""")
    std = "c.s = 'S' AND c.inv IS NULL"

    out, problems = OrderedDict(), []
    for sid, d in defs.items():
        unknown = set(d) - KEYS
        if unknown:
            problems.append(f"{sid}: 알 수 없는 항목 {sorted(unknown)}")
            continue
        ids = set()
        comps = []
        for name in d.get("loinc_components", []):
            hit = con.execute("SELECT id FROM c WHERE v = 'LOINC' AND cl = 'LOINC Component' AND n LIKE ?", [name]).fetchall()
            if not hit:
                problems.append(f"{sid}: LOINC 구성요소 '{name}' 없음")
            comps += [h[0] for h in hit]
        for label, names in (("systems", d.get("systems")), ("exclude_systems", d.get("exclude_systems"))):
            for name in names or []:
                if not con.execute("SELECT 1 FROM c WHERE v = 'LOINC' AND cl = 'LOINC System' AND n = ?", [name]).fetchone():
                    problems.append(f"{sid}: {label} '{name}' 없음")
        if comps:
            sql = f"""SELECT DISTINCT c.id FROM r JOIN c ON c.id = r.a AND {std} AND c.dom = 'Measurement'
                      WHERE r.rel = 'Has component' AND r.b IN ({', '.join(map(str, comps))})"""
            if d.get("systems"):
                sql += f""" AND EXISTS (SELECT 1 FROM r r2 JOIN c sy ON sy.id = r2.b WHERE r2.a = c.id AND r2.rel = 'Has system'
                                         AND sy.n IN ({', '.join('?' * len(d['systems']))}))"""
            if d.get("exclude_systems"):
                sql += f""" AND NOT EXISTS (SELECT 1 FROM r r2 JOIN c sy ON sy.id = r2.b WHERE r2.a = c.id AND r2.rel = 'Has system'
                                             AND sy.n IN ({', '.join('?' * len(d['exclude_systems']))}))"""
            ids |= {x[0] for x in con.execute(sql, list(d.get("systems") or []) + list(d.get("exclude_systems") or [])).fetchall()}
        for cid in d.get("concepts", []):
            if not con.execute(f"SELECT 1 FROM c WHERE id = ? AND {std}", [int(cid)]).fetchone():
                problems.append(f"{sid}: 개념 {cid} 가 표준·유효 개념이 아님")
            ids.add(int(cid))
        for cid in d.get("descendants_of", []):
            hit = con.execute(f"SELECT DISTINCT ca.d FROM ca JOIN c ON c.id = ca.d AND {std} WHERE ca.a = ?", [int(cid)]).fetchall()
            if not hit:
                problems.append(f"{sid}: {cid} 의 표준 하위 개념 없음")
            ids |= {h[0] for h in hit}
        if not ids:
            problems.append(f"{sid}: 개념 집합이 비었다")
        out[sid] = sorted(ids)
    if problems:
        sys.exit("개념 집합을 만들 수 없습니다:\n  " + "\n  ".join(problems))

    class D(yaml.SafeDumper):
        pass
    D.add_representer(OrderedDict, lambda dd, data: dd.represent_dict(data.items()))
    doc = OrderedDict(meta=OrderedDict(vocabulary_version=version, generated_by="spec/build_concept_sets.py",
                                       note="개념 ID 만 싣는다. 정의는 spec/expected_data.yaml 의 concept_sets"),
                      sets=out)
    with open(ROOT / "spec" / "concept_sets.yaml", "w", encoding="utf-8") as fh:
        fh.write("# 자동 생성 파일 — 손으로 고치지 않는다. python spec/build_concept_sets.py\n")
        yaml.dump(doc, fh, Dumper=D, allow_unicode=True, sort_keys=False, width=160, default_flow_style=None)
    print(f"개념 집합 {len(out)}개 (어휘 {version}): " + ", ".join(f"{k} {len(v)}" for k, v in out.items()))


if __name__ == "__main__":
    main()
