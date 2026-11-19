# -*- coding: utf-8 -*-
"""
단계 3: 데이터 품질 검증 엔진 (참조 구현)

사용법:
    python dq/engine.py --cohort LUNG_CANCER --data synth/output/clean/LUNG_CANCER --out dq/reports/clean_LUNG_CANCER

입력  : 코호트 디렉터리의 <TABLE>.csv (UTF-8, 헤더 포함, NULL 은 빈 문자열)
규칙  : rules/rules_structural.yaml (명세에서 자동 생성) + rules/rules_semantic.yaml (수동 작성, DuckDB SQL)
명세  : spec/kai_cdm_spec.yaml (의뢰사 매뉴얼 2026-11-16 판), spec/codelists.yaml, spec/cohort_profiles.yaml
출력  : findings.csv (위반 행 단위), summary.json (규칙 단위), report.md (사람용 요약),
        sufficiency.csv (데이터 충실도 미충족 단위, 기관 내부용)

데이터 충실도(spec/expected_data.yaml, spec/concept_sets.yaml)는 규칙과 별개로 "있어야 할 기록이 있는 비율"을 센다.

구조 규칙은 원본 문자열 위에서 검사하고(타입 오류를 잡기 위해), 의미 규칙은 명세 타입으로 변환한 뒤 DuckDB 에서 SQL 로 검사한다.
"""
import argparse, io, json, os, re, sys, datetime as dt
from collections import OrderedDict, defaultdict
import pandas as pd
import yaml
import duckdb

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TS_RE = re.compile(r"^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$")
INT_RE = re.compile(r"^[+-]?\d+$")
FLOAT_RE = re.compile(r"^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$")


# 데이터 충실도: 항목 SQL 을 감싸 연령대를 붙이고 집계한다 (dq-ts/src/sufficiency.ts 와 같은 SQL)
AGE_BANDS = ["<50", "50-64", "65+", "미상"]
SUFF_EMPTY_EVENTS = "SELECT CAST(NULL AS BIGINT) AS person_id, CAST(NULL AS VARCHAR) AS set_id, CAST(NULL AS DATE) AS event_date WHERE false"
SUFF_WRAP = """CREATE OR REPLACE TEMP TABLE _S AS
SELECT s.person_id, s.unit_key, COALESCE(s.met, false) AS met, s.detail, s.per_year,
       CASE WHEN p.age IS NULL THEN '미상' WHEN p.age < 50 THEN '<50' WHEN p.age < 65 THEN '50-64' ELSE '65+' END AS age_band
FROM ({sql}) s
LEFT JOIN (SELECT person_id, {age} AS age FROM PERSON GROUP BY person_id) p ON p.person_id = s.person_id"""
SUFF_TOTAL = "SELECT COUNT(*), COUNT(*) FILTER (WHERE met), CAST(ROUND(MEDIAN(per_year), 1) AS VARCHAR) FROM _S"
SUFF_BANDS = "SELECT age_band, COUNT(*), COUNT(*) FILTER (WHERE met) FROM _S GROUP BY age_band"
SUFF_UNMET = "SELECT person_id, unit_key, detail FROM _S WHERE NOT met ORDER BY person_id, unit_key"
SUFF_PUBLIC_ERROR = "실행 오류: 상세는 내부 실행 기록에서 확인하세요."
# 매뉴얼 보완 선택 항목(선택 테이블·선택 컬럼)을 내지 않아 건너뛴 규칙의 note 머리말. 앱이 '미검사'와 구분해 보인다
OPTIONAL_SKIP = "선택 항목 미제출"


def pct(met, n):
    """정수 연산으로 소수 첫째 자리 백분율 (반올림, 두 엔진이 같은 글자를 낸다)"""
    if not n:
        return "-"
    t = (met * 2000 + n) // (2 * n)
    return f"{t // 10}.{t % 10}%"



def load_yaml(p):
    return yaml.safe_load(open(os.path.join(ROOT, p), encoding="utf-8"))




class Engine:
    def __init__(self, cohort, today=None, max_examples=50):
        self.cohort = cohort
        self.today = today or dt.date.today()
        self.max_examples = max_examples
        self.spec = load_yaml("spec/kai_cdm_spec.yaml")["tables"]
        cl = load_yaml("spec/codelists.yaml")
        self.codelists = {}
        for sect in cl.values():
            for k, v in sect.items():
                self.codelists[k] = {str(c) for c in v.keys()}
        self.concepts = load_yaml("spec/concepts.yaml")
        self.profile = load_yaml("spec/cohort_profiles.yaml")["cohorts"][cohort]
        # 선택 테이블(CONCEPT·VOCABULARY)은 내면 읽고, 없으면 그 규칙만 건너뛴다
        self.tables_in_cohort = self.profile["tables"] + self.profile.get("optional_tables", [])
        self._concepts = None
        self.disease_table = [t for t in self.tables_in_cohort if self.spec[t]["category"] == "disease"][0]
        self.rules_struct = load_yaml("rules/rules_structural.yaml")["rules"]
        self.rules_sem = load_yaml("rules/rules_semantic.yaml")["rules"]
        self.findings = []
        self.rule_stats = OrderedDict()

    # ------------------------------------------------------------------ data
    def load(self, data_dir):
        self.raw = {}
        for t in self.tables_in_cohort:
            p = os.path.join(data_dir, f"{t}.csv")
            if os.path.exists(p):
                df = pd.read_csv(p, dtype=str, keep_default_na=False, encoding="utf-8")
                df.columns = [c.strip() for c in df.columns]
                self.raw[t] = df
        return self

    # --------------------------------------------------------------- helpers
    def add(self, rule, table, field, row_key, person_id, detail, count_only=False):
        st = self.rule_stats[rule["id"]]
        st["violations"] += 1
        if st["violations"] <= self.max_examples or not count_only:
            self.findings.append(OrderedDict(
                rule_id=rule["id"], rule_name=rule["name"], category=rule["category"], severity=rule["severity"],
                table=table, field=field, row_key=str(row_key), person_id=str(person_id) if person_id is not None else "",
                detail=detail))

    def init_stat(self, rule, table):
        self.rule_stats[rule["id"]] = OrderedDict(
            rule_id=rule["id"], name=rule["name"], category=rule["category"], subcategory=rule.get("subcategory", ""),
            severity=rule["severity"], table=table, fields=",".join(rule.get("fields", [])), check=rule.get("check", "sql"),
            origin="standard", status="pass", violations=0, rows_checked=0, note="")

    def pk_of(self, table):
        return self.spec[table]["pk"]

    def keys(self, df, table):
        pk = self.pk_of(table)
        pkcol = df[pk] if pk in df.columns else pd.Series([""] * len(df), index=df.index)
        pid = df["person_id"] if "person_id" in df.columns else pd.Series([""] * len(df), index=df.index)
        return pkcol, pid

    def concept_index(self):
        """제출된 CONCEPT: concept_id -> (domain_id, vocabulary_id, standard_concept, invalid_reason)"""
        if self._concepts is None:
            df = self.raw["CONCEPT"]
            col = lambda c: df[c] if c in df.columns else pd.Series([""] * len(df), index=df.index)
            self._concepts = dict(zip(df["concept_id"], zip(col("domain_id"), col("vocabulary_id"),
                                                              col("standard_concept"), col("invalid_reason"))))
        return self._concepts

    # ------------------------------------------------------- structural pass
    def run_structural(self):
        for rule in self.rules_struct:
            table = rule["table"]
            if table not in self.tables_in_cohort:
                continue
            scope = rule.get("scope", "all")
            if scope != "all" and self.cohort not in scope:
                continue
            self.init_stat(rule, table)
            st = self.rule_stats[rule["id"]]
            chk = rule["check"]
            if chk == "table_present":
                if table not in self.raw:
                    self.add(rule, table, "", "", None, f"{table}.csv 없음")
                continue
            if table not in self.raw:
                st["status"] = "skipped"
                st["note"] = f"{OPTIONAL_SKIP}: {table}" if self.spec[table].get("optional") else "테이블 없음"
                continue
            df = self.raw[table]
            st["rows_checked"] = len(df)
            pkcol, pid = self.keys(df, table)
            fields = rule.get("fields", [])
            p = rule.get("params", {})
            if chk == "columns":
                for c in sorted(set(p["expected"]) - set(df.columns)):
                    self.add(rule, table, c, "", None, f"컬럼 누락: {c}")
                continue
            if chk == "extra_columns":
                for c in sorted(set(df.columns) - set(p["expected"])):
                    self.add(rule, table, c, "", None, f"명세에 없는 컬럼: {c}")
                continue
            # 이하 필드 기반 검사: 필드가 없으면 columns 규칙이 이미 잡았으므로 건너뜀
            missing = [f for f in fields if f not in df.columns]
            if missing and chk not in ("group_anchor", "person_invariant"):
                opt = all(next(x for x in self.spec[table]["fields"] if x["name"] == m).get("optional") for m in missing)
                st["status"] = "skipped"; st["note"] = f"{OPTIONAL_SKIP if opt else '컬럼 없음'}: {missing}"; continue
            if chk == "pk_unique":
                cols = fields
                null = df[cols].eq("").any(axis=1)
                for i in df.index[null]:
                    self.add(rule, table, "+".join(cols), "", pid[i], "PK NULL")
                dup = df[cols].duplicated(keep=False) & ~null
                for i in df.index[dup]:
                    key = "+".join(str(df.at[i, c]) for c in cols)
                    self.add(rule, table, "+".join(cols), key, pid[i], f"PK 중복: {key}")
            elif chk == "not_null":
                f = fields[0]
                for i in df.index[df[f] == ""]:
                    self.add(rule, table, f, pkcol[i], pid[i], f"{f} NULL")
            elif chk == "type":
                f = fields[0]; ty = p["type"]
                rx = {"integer": INT_RE, "float": FLOAT_RE, "date": DATE_RE, "timestamp": TS_RE}[ty]
                vals = df[f]
                bad = (vals != "") & ~vals.str.match(rx)
                if ty in ("date", "timestamp"):
                    ok_fmt = (vals != "") & vals.str.match(rx)
                    parsed = pd.to_datetime(vals.where(ok_fmt, None), errors="coerce")
                    bad = bad | (ok_fmt & parsed.isna())
                for i in df.index[bad]:
                    self.add(rule, table, f, pkcol[i], pid[i], f"{f}='{vals[i]}' 은 {ty} 아님")
            elif chk == "fk":
                f = fields[0]; rt = p["ref_table"]; rc = p["ref_field"]
                if rt not in self.tables_in_cohort:
                    st["status"] = "skipped"; st["note"] = f"참조 테이블 {rt} 코호트에 없음"; continue
                if rt not in self.raw or rc not in self.raw[rt].columns:
                    st["status"] = "skipped"; st["note"] = f"참조 테이블 {rt} 없음"; continue
                refset = set(self.raw[rt][rc][self.raw[rt][rc] != ""])
                vals = df[f]
                bad = (vals != "") & ~vals.isin(refset)
                for i in df.index[bad]:
                    self.add(rule, table, f, pkcol[i], pid[i], f"{f}={vals[i]} 가 {rt}.{rc} 에 없음")
            elif chk == "codelist":
                f = fields[0]; allowed = self.codelists.get(p["codelist"], set())
                vals = df[f]
                bad = (vals != "") & ~vals.isin(allowed)
                for i in df.index[bad]:
                    self.add(rule, table, f, pkcol[i], pid[i], f"{f}={vals[i]} 코드표({p['codelist']}) 밖")
            elif chk == "range":
                f = fields[0]; lo, hi = p["min"], p["max"]
                num = pd.to_numeric(df[f].replace("", None), errors="coerce")
                bad = num.notna() & ((num < lo) | (num > hi))
                for i in df.index[bad]:
                    self.add(rule, table, f, pkcol[i], pid[i], f"{f}={df.at[i, f]} 범위 [{lo},{hi}] 밖")
            elif chk == "pattern":
                f = fields[0]; rx = re.compile(p["regex"])
                vals = df[f]
                bad = (vals != "") & ~vals.apply(lambda v: bool(rx.match(v)))
                for i in df.index[bad]:
                    self.add(rule, table, f, pkcol[i], pid[i], f"{f}='{vals[i]}' 패턴 불일치")
            elif chk == "not_future":
                f = fields[0]
                d = pd.to_datetime(df[f].replace("", None), errors="coerce")
                bad = d.notna() & (d > pd.Timestamp(self.today))
                for i in df.index[bad]:
                    self.add(rule, table, f, pkcol[i], pid[i], f"{f}={df.at[i, f]} 미래 날짜")
            elif chk == "group_anchor":
                anchor = p["anchor"]; members = [m for m in p["members"] if m in df.columns]
                if anchor not in df.columns or not members:
                    st["status"] = "skipped"; st["note"] = "anchor/멤버 컬럼 없음"; continue
                any_member = (df[members] != "").any(axis=1)
                bad = any_member & (df[anchor] == "")
                for i in df.index[bad]:
                    filled = [m for m in members if df.at[i, m] != ""][:3]
                    self.add(rule, table, anchor, pkcol[i], pid[i], f"{filled} 값 있으나 anchor {anchor} NULL")
            elif chk == "person_invariant":
                fs = [f for f in p["fields"] if f in df.columns]
                if "person_id" not in df.columns or not fs:
                    st["status"] = "skipped"; continue
                for f in fs:
                    sub = df[df[f] != ""][["person_id", f]]
                    n = sub.groupby("person_id")[f].nunique()
                    for person in n.index[n > 1]:
                        vals = sorted(set(sub[sub.person_id == person][f]))
                        self.add(rule, table, f, "", person, f"{f} 값이 환자 내에서 다름: {vals}")
            elif chk == "must_be_null":
                f = fields[0]
                for i in df.index[df[f] != ""]:
                    self.add(rule, table, f, pkcol[i], pid[i], f"{f}={df.at[i, f]} (이 코호트에서는 NULL 이어야 함)")
            elif chk == "concept":
                if "CONCEPT" not in self.raw:
                    st["status"] = "skipped"; st["note"] = f"{OPTIONAL_SKIP}: CONCEPT"; continue
                if "concept_id" not in self.raw["CONCEPT"].columns:
                    st["status"] = "skipped"; st["note"] = "CONCEPT.concept_id 컬럼 없음"; continue
                f = fields[0]; idx = self.concept_index()
                domain, vocabs, standard = p.get("domain"), p.get("vocabularies"), p.get("standard", True)
                for i in df.index[(df[f] != "") & (df[f] != "0")]:
                    v = df.at[i, f]
                    c = idx.get(v)
                    if c is None:
                        self.add(rule, table, f, pkcol[i], pid[i], f"{f}={v} CONCEPT 에 없음")
                        continue
                    dom, voc, std, inv = c
                    why = []
                    if standard and std != "S":
                        why.append(f"standard_concept={std or 'NULL'}")
                    if standard and inv:
                        why.append(f"invalid_reason={inv}")
                    if domain and dom != domain:
                        why.append(f"domain_id={dom} (요구 {domain})")
                    if vocabs and voc not in vocabs:
                        why.append(f"vocabulary_id={voc} (허용 {'/'.join(vocabs)})")
                    if why:
                        self.add(rule, table, f, pkcol[i], pid[i], f"{f}={v} " + ", ".join(why))
        for st in self.rule_stats.values():
            if st["violations"] > 0:
                st["status"] = "fail"

    # --------------------------------------------------------- typed frames
    def typed(self, table):
        df = self.raw[table]
        cols = {}
        for f in self.spec[table]["fields"]:
            n = f["name"]
            if n not in df.columns:
                continue
            s = df[n].replace("", None)
            t = f["type"]
            if t == "integer":
                cols[n] = pd.to_numeric(s, errors="coerce").astype("Int64")
            elif t == "float":
                cols[n] = pd.to_numeric(s, errors="coerce")
            elif t in ("date", "timestamp"):
                cols[n] = pd.to_datetime(s, errors="coerce")
            else:
                cols[n] = s
        return pd.DataFrame(cols, index=df.index)

    # ------------------------------------------------------- semantic pass
    def run_semantic(self):
        con = duckdb.connect()
        for t in self.tables_in_cohort:
            if t not in self.raw:
                continue
            df = self.typed(t)
            con.register(f"_raw_{t}", df)
            casts = []
            for f in self.spec[t]["fields"]:
                n = f["name"]
                if n not in df.columns:
                    continue
                if f["type"] == "date":
                    casts.append(f'CAST("{n}" AS DATE) AS "{n}"')
                else:
                    casts.append(f'"{n}"')
            con.execute(f'CREATE TABLE "{t}" AS SELECT {", ".join(casts)} FROM _raw_{t}')
        # 보조 테이블
        mc = self.concepts["measurements"]
        con.register("_mc", pd.DataFrame([dict(concept_id=int(k), name=v["name"], lo=float(v["plausible"][0]), hi=float(v["plausible"][1])) for k, v in mc.items()]))
        con.execute("CREATE TABLE _MEASUREMENT_CONCEPTS AS SELECT * FROM _mc")
        ac = [dict(concept_id=int(k), name=v["name"], category=int(v["category"])) for k, v in self.concepts["drugs"].items() if v.get("category") is not None]
        con.register("_ac", pd.DataFrame(ac))
        con.execute("CREATE TABLE _ANTICANCER_DRUGS AS SELECT * FROM _ac")

        dtab = self.disease_table
        subst = {"{TODAY}": f"DATE '{self.today.isoformat()}'", "{DISEASE}": dtab, "{DISEASE_PK}": self.pk_of(dtab)}
        present = set(self.raw)
        for rule in self.rules_sem:
            scope = rule.get("scope", "all")
            if scope != "all" and self.cohort not in scope:
                continue
            req = set(rule.get("requires", []))
            self.init_stat(rule, ",".join(sorted(req)) if req else dtab)
            st = self.rule_stats[rule["id"]]
            if not req.issubset(present) or dtab not in present:
                lack = sorted(req - present)
                opt = dtab in present and all(self.spec[t].get("optional") for t in lack)
                st["status"] = "skipped"; st["note"] = f"{OPTIONAL_SKIP if opt else '필요 테이블 없음'}: {lack}"; continue
            self._run_one_sem(con, rule, subst)
        self.run_sufficiency(con)
        con.close()
        self.run_mapping()
        return self

    # ------------------------------------------------------ mapping rate
    def run_mapping(self):
        """표준 개념 필드(명세 concept.standard)마다 매핑률을 센다. 위반이 아니며 규칙 집계와 별개다.
        대상 = 정수로 읽히는 값, 매핑 = 0 이 아닌 값, 미매핑 = 0(매뉴얼 2.9.1). 빈 값·정수 아님은 대상에서 빼고 따로 센다.
        환자 단위 값은 만들지 않는다."""
        self.mapping_rates = []
        for t in self.tables_in_cohort:
            if t not in self.raw:
                continue
            df = self.raw[t]
            for f in self.spec[t]["fields"]:
                if not (f.get("concept") or {}).get("standard") or f["name"] not in df.columns:
                    continue
                s = df[f["name"]].str.strip()
                blank = int((s == "").sum())
                ints = s[s.str.fullmatch(r"[+-]?[0-9]+")]
                zero = int((ints.map(int) == 0).sum()) if len(ints) else 0
                self.mapping_rates.append(OrderedDict(
                    table=t, field=f["name"], rows=len(df), blank=blank, invalid=len(df) - blank - len(ints),
                    eligible=len(ints), mapped=len(ints) - zero, unmapped=zero))

    # ------------------------------------------------- data sufficiency
    def run_sufficiency(self, con):
        """기대 데이터 항목마다 대상 단위 수·충족 수·연령대별 수를 센다. 의미 규칙과 같은 DuckDB 연결을 쓴다."""
        ed = load_yaml("spec/expected_data.yaml")
        sets = load_yaml("spec/concept_sets.yaml")["sets"]
        self.sufficiency, self.suff_rows = [], []
        con.execute("CREATE TEMP TABLE _CONCEPT_SET (set_id VARCHAR, concept_id BIGINT)")
        rows = [(k, int(c)) for k, v in sets.items() for c in v]
        if rows:
            con.executemany("INSERT INTO _CONCEPT_SET VALUES (?, ?)", rows)
        parts = []
        for ev in ed["events"]:
            t, cc, dc = ev["table"], ev["concept"], ev["date"]
            if t in self.raw and all(c in self.raw[t].columns for c in ("person_id", cc, dc)):
                parts.append(f'SELECT x.person_id, s.set_id, x."{dc}" AS event_date FROM "{t}" x '
                             f'JOIN _CONCEPT_SET s ON s.concept_id = x."{cc}" WHERE x.person_id IS NOT NULL AND x."{dc}" IS NOT NULL')
        con.execute("CREATE TEMP TABLE _EVENTS AS " + (" UNION ALL ".join(parts) or SUFF_EMPTY_EVENTS))
        dtab = self.disease_table
        present = set(self.raw)
        missing_setup = sorted(set(ed["setup_requires"] + [dtab]) - present)
        setup_error = None
        if not missing_setup:
            subst = {"{ANCHOR}": ed["anchors"][self.cohort], "{DISEASE}": dtab}
            try:
                for stmt in ed["setup"]:
                    for k, v in subst.items():
                        stmt = stmt.replace(k, v)
                    con.execute(stmt)
            except Exception as e:
                setup_error = str(e)[:200]
        p = self.raw.get("PERSON")
        age = "MIN(age_at_index)" if p is not None and "age_at_index" in p.columns else "CAST(NULL AS BIGINT)"
        for item in ed["items"]:
            scope = item.get("scope", "all")
            if scope != "all" and self.cohort not in scope:
                continue
            r = OrderedDict(id=item["id"], title=item["title"], unit=item["unit"], status="ok", note="",
                            eligible=0, met=0, per_year_median=None, by_age=[])
            self.sufficiency.append(r)
            req = set(item.get("requires", []))
            if missing_setup or not req.issubset(present):
                r["status"] = "skipped"; r["note"] = f"필요 테이블 없음: {sorted(set(missing_setup) | (req - present))}"; continue
            if setup_error:
                r["status"] = "error"; r["note"] = f"SQL 오류: {setup_error}"; continue
            sql = item["sql"].replace("{DISEASE}", dtab)
            try:
                con.execute(SUFF_WRAP.format(sql=sql, age=age))
                n, m, med = con.execute(SUFF_TOTAL).fetchone()
                bands = {b: (bn, bm) for b, bn, bm in con.execute(SUFF_BANDS).fetchall()}
                unmet = con.execute(SUFF_UNMET).fetchall()
            except Exception as e:
                r["status"] = "error"; r["note"] = f"SQL 오류: {str(e)[:200]}"; continue
            r["eligible"], r["met"], r["per_year_median"] = int(n), int(m), med
            r["by_age"] = [OrderedDict(band=b, eligible=int(bands[b][0]), met=int(bands[b][1])) for b in AGE_BANDS if b in bands]
            for pid, key, detail in unmet:
                self.suff_rows.append(OrderedDict(item_id=item["id"], person_id="" if pid is None else str(int(pid)),
                                                  unit_key=key or "", detail=detail or ""))

    def _run_one_sem(self, con, rule, subst):
        """의미 규칙 하나를 돌린다. SELECT 는 person_id, row_key, detail 순서로 낸다."""
        st = self.rule_stats[rule["id"]]
        sql = rule["sql"]
        for k, v in subst.items():
            sql = sql.replace(k, v)
        try:
            res = con.execute(sql).fetchall()
        except Exception as e:
            st["status"] = "error"; st["note"] = f"SQL 오류: {str(e)[:200]}"; return
        for person_id, row_key, detail in res:
            # 오류 데이터에서는 person_id 가 숫자가 아닐 수 있다(그 자체가 검출 대상이다).
            # 엔진이 여기서 넘어지면 정작 그 오류를 보고하지 못한다.
            if person_id is None:
                pid = None
            else:
                try:
                    pid = int(person_id)
                except (TypeError, ValueError):
                    pid = str(person_id)
            self.add(rule, st["table"], "", row_key, pid, detail or "")
        if st["violations"] > 0:
            st["status"] = "fail"

    # --------------------------------------------------------------- report
    def summary(self):
        stats = list(self.rule_stats.values())
        by_cat = defaultdict(lambda: dict(rules=0, failed=0, violations=0))
        for s in stats:
            b = by_cat[s["category"]]; b["rules"] += 1
            if s["status"] == "fail": b["failed"] += 1
            b["violations"] += s["violations"]
        return OrderedDict(
            cohort=self.cohort, run_date=self.today.isoformat(),
            tables={t: len(df) for t, df in self.raw.items()},
            rules_total=len(stats), rules_failed=sum(s["status"] == "fail" for s in stats),
            rules_skipped=sum(s["status"] == "skipped" for s in stats), rules_error=sum(s["status"] == "error" for s in stats),
            rules_disabled=sum(s["status"] == "disabled" for s in stats),
            violations_total=sum(s["violations"] for s in stats),
            violations_error=sum(s["violations"] for s in stats if s["severity"] == "error"),
            violations_warning=sum(s["violations"] for s in stats if s["severity"] == "warning"),
            by_category=dict(by_cat), rules=stats, sufficiency=getattr(self, "sufficiency", []),
            mapping_rates=getattr(self, "mapping_rates", []))

    def write(self, out_dir):
        os.makedirs(out_dir, exist_ok=True)
        # 위반이 없어도 머리글은 쓴다. 빈 DataFrame 을 그대로 쓰면 컬럼조차 없는 파일이 되어
        # 읽는 쪽이 '형식이 잘못된 파일'로 본다(TypeScript 구현과도 어긋난다).
        cols = ["rule_id", "rule_name", "category", "severity", "table", "field", "row_key", "person_id", "detail"]
        pd.DataFrame(self.findings, columns=cols).to_csv(
            os.path.join(out_dir, "findings.csv"), index=False, encoding="utf-8-sig")
        pd.DataFrame(getattr(self, "suff_rows", []), columns=["item_id", "person_id", "unit_key", "detail"]).to_csv(
            os.path.join(out_dir, "sufficiency.csv"), index=False, encoding="utf-8-sig")
        s = self.summary()
        public = {**s, "rules": [
            {**r, "note": "규칙 실행 오류: 상세는 내부 실행 기록에서 확인하세요."} if r["status"] == "error" else r
            for r in s["rules"]
        ], "sufficiency": [{**x, "note": SUFF_PUBLIC_ERROR} if x["status"] == "error" else x for x in s["sufficiency"]]}
        json.dump(public, open(os.path.join(out_dir, "summary.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=str)
        with open(os.path.join(out_dir, "report.md"), "w", encoding="utf-8") as fh:
            fh.write(f"# 데이터 품질 검증 보고서: {self.cohort} ({self.profile['kor']})\n\n")
            fh.write(f"검증일 {s['run_date']} / 테이블 {len(s['tables'])}개 / 규칙 {s['rules_total']}개 (실패 {s['rules_failed']}, 건너뜀 {s['rules_skipped']}, 오류 {s['rules_error']})\n\n")
            fh.write(f"위반 {s['violations_total']}건 (error {s['violations_error']}, warning {s['violations_warning']})\n\n")
            fh.write("| 분류 | 규칙 수 | 실패 규칙 | 위반 건수 |\n|---|---|---|---|\n")
            for c in ("Conformance", "Completeness", "Plausibility"):
                b = s["by_category"].get(c, dict(rules=0, failed=0, violations=0))
                fh.write(f"| {c} | {b['rules']} | {b['failed']} | {b['violations']} |\n")
            fh.write("\n## 테이블 행수\n\n" + "\n".join(f"- {t}: {n}" for t, n in s["tables"].items()) + "\n")
            fh.write("\n## 실패 규칙\n\n| 규칙 | 분류 | 심각도 | 테이블 | 위반 |\n|---|---|---|---|---|\n")
            for r in s["rules"]:
                if r["status"] == "fail":
                    fh.write(f"| {r['rule_id']} {r['name']} | {r['category']} | {r['severity']} | {r['table']} | {r['violations']} |\n")
            errs = [r for r in s["rules"] if r["status"] == "error"]
            if errs:
                fh.write("\n## 규칙 실행 오류\n\n" + "\n".join(f"- {r['rule_id']}: 규칙 실행 오류: 상세는 내부 실행 기록에서 확인하세요." for r in errs) + "\n")
            if s["sufficiency"]:
                fh.write("\n## 데이터 충실도\n\n있어야 할 기록이 있는 비율이다(규칙 위반과 별개, 충족 판정·목표치 없음). "
                         "미충족 단위는 sufficiency.csv(기관 내부용)에 있다.\n\n"
                         "| 항목 | 단위 | 대상 | 충족 | 비율 | 1인·1년당 중앙값 | " + " | ".join(AGE_BANDS) + " |\n"
                         "|---|---|---|---|---|---|" + "---|" * len(AGE_BANDS) + "\n")
                for x in s["sufficiency"]:
                    if x["status"] != "ok":
                        why = f"건너뜀 ({x['note']})" if x["status"] == "skipped" else "실행 오류"
                        fh.write(f"| {x['id']} {x['title']} | {x['unit']} | - | - | {why} | - |" + " - |" * len(AGE_BANDS) + "\n")
                        continue
                    band = {b["band"]: b for b in x["by_age"]}
                    cells = [f"{band[b]['met']}/{band[b]['eligible']}" if b in band else "-" for b in AGE_BANDS]
                    fh.write(f"| {x['id']} {x['title']} | {x['unit']} | {x['eligible']} | {x['met']} | {pct(x['met'], x['eligible'])} | "
                             f"{x['per_year_median'] or '-'} | " + " | ".join(cells) + " |\n")
            if s["mapping_rates"]:
                fh.write("\n## 표준 용어 매핑률\n\n표준 개념 필드에서 매핑하지 못해 `0` 으로 적재한 비율이다(위반 아님, 규칙 집계와 별개). "
                         "대상은 정수로 읽히는 값이고, 빈 값과 정수가 아닌 값은 대상에서 빼고 제외 칸에 따로 센다. "
                         "`0` 이 맞는 경우(예: 구조식 노트의 분류)도 미매핑에 들어간다.\n\n"
                         "| 테이블 | 필드 | 행 | 대상 | 매핑 | 미매핑(0) | 미매핑률 | 제외(빈 값·형식 오류) |\n|---|---|---|---|---|---|---|---|\n")
                for m in s["mapping_rates"]:
                    fh.write(f"| {m['table']} | {m['field']} | {m['rows']} | {m['eligible']} | {m['mapped']} | {m['unmapped']} | "
                             f"{pct(m['unmapped'], m['eligible'])} | {m['blank']}·{m['invalid']} |\n")
        return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", required=True)
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--today", default=None)
    a = ap.parse_args()
    today = dt.date.fromisoformat(a.today) if a.today else None
    e = Engine(a.cohort, today=today).load(a.data)
    e.run_structural()
    e.run_semantic()
    s = e.write(a.out)
    print(f"[{a.cohort}] rules={s['rules_total']} failed={s['rules_failed']} skipped={s['rules_skipped']} error={s['rules_error']} "
          f"violations={s['violations_total']} (error={s['violations_error']}, warning={s['violations_warning']})")


if __name__ == "__main__":
    main()
