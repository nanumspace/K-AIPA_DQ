# -*- coding: utf-8 -*-
"""단계 2-B: clean 데이터에 오류를 심고 정답 목록(manifest)을 남긴다.

    python synth/inject_faults.py --cohort LUNG_CANCER
    python synth/inject_faults.py --all

구조 규칙(rules_structural.yaml)은 **규칙에서 거꾸로** 만든다. 규칙이 무엇을 금지하는지 읽고
바로 그것을 어기는 값을 넣으므로 규칙을 늘려도 주입이 따라 늘고, 정답(expected_rules)이 어긋나지 않는다.
적용 가능한 규칙마다 기본 1행씩 심는다(--k 로 늘림).
의미 규칙(rules_semantic.yaml)은 여러 테이블이 얽혀 있어 손으로 적었다:
  SEM-COM-001~012, SEM-MEAS-001·002, SEM-SACT-001~005, SEM-LC-001(폐암), SEM-LY-001(림프종) 를 모두 한 번 이상 어긴다.
  파일째 뺀 테이블 때문에 건너뛰어지는 의미 규칙의 오류는 심지 않는다(엔진이 귀속할 수 없다).

출력: synth/output/dirty/<COHORT>/<TABLE>.csv 와 fault_manifest.csv
manifest 한 행이 심은 오류 하나이고 expected_rules 는 그것을 잡아야 하는 규칙이다(| 구분, 하나라도 잡으면 검출).
pk / person_id 는 **주입 뒤** 값으로 적는다 — 엔진이 내는 row_key/person_id 와 같은 모양이어야 맞춰진다.
"""
import argparse
import io
import os
import re
import sys

import numpy as np
import pandas as pd
import yaml

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = yaml.safe_load(open(os.path.join(ROOT, "spec/kai_cdm_spec.yaml"), encoding="utf-8"))["tables"]
PROFILES = yaml.safe_load(open(os.path.join(ROOT, "spec/cohort_profiles.yaml"), encoding="utf-8"))["cohorts"]
RULES = yaml.safe_load(open(os.path.join(ROOT, "rules/rules_structural.yaml"), encoding="utf-8"))["rules"]
SEM_RULES = yaml.safe_load(open(os.path.join(ROOT, "rules/rules_semantic.yaml"), encoding="utf-8"))["rules"]
CONCEPTS = yaml.safe_load(open(os.path.join(ROOT, "spec/concepts.yaml"), encoding="utf-8"))
COHORTS = list(PROFILES)
# 테이블 하나를 통째로 빼 table_present 규칙을 검증한다. 그 테이블의 다른 규칙은 건너뛰어지고 그 테이블을 requires 로 가진
# 의미 규칙도 건너뛰어지므로(그 규칙의 오류는 심지 않는다) 한 코호트에서만 한다.
DROP_TABLE = ("DIABETES", "OBSERVATION")
SEM_SQL = "\n".join(r["sql"] for r in SEM_RULES)
SEM_BY_ID = {r["id"]: r for r in SEM_RULES}
L01 = {int(k) for k, v in CONCEPTS["drugs"].items() if v.get("category") in (1, 2, 4, 5)}


def day(s, n):
    return (pd.Timestamp(s) + pd.Timedelta(days=n)).date().isoformat()


class Injector:
    def __init__(self, cohort, k=1, seed=777):
        self.cohort, self.k = cohort, k
        self.rng = np.random.default_rng(seed)
        self.tables = list(PROFILES[cohort]["tables"])
        self.disease = [t for t in self.tables if SPEC[t]["category"] == "disease"][0]
        self.data, self.clean, self.manifest, self.n = {}, {}, [], 0
        self.used = set()          # 이미 오류를 심은 (table, 행). 한 행에 둘을 심으면 서로를 가린다
        self.dropped_columns, self.deleted_rows = {}, {}
        self.dropped_tables = {DROP_TABLE[1]} if cohort == DROP_TABLE[0] else set()

    def runs(self, *rule_ids):
        """파일째 뺀 테이블 때문에 건너뛰어지지 않을 의미 규칙만 돌려준다. 비면 그 오류는 심지 않는다."""
        present = set(self.tables) - self.dropped_tables
        return [r for r in rule_ids if set(SEM_BY_ID[r].get("requires", [])) <= present]

    def load(self, d):
        for t in self.tables:
            p = os.path.join(d, f"{t}.csv")
            if os.path.exists(p):
                self.data[t] = pd.read_csv(p, dtype=str, keep_default_na=False)
                self.clean[t] = self.data[t].copy()     # 의미 규칙 오류를 고를 때 찾아보는 용도(이미 깨진 값을 믿지 않는다)
        return self

    def intact(self, table):
        """아직 손대지 않은 행의 원래 값. 다른 행을 가리키는 오류는 가리키는 쪽이 멀쩡해야 규칙에 걸린다."""
        df = self.clean[table]
        return df[[(table, i) not in self.used for i in df.index]]

    # ------------------------------------------------------------- 기록
    def log(self, ftype, category, table, i, field, injected, rules, original="", note=""):
        df = self.data[table]
        pk = SPEC[table]["pk"]
        self.n += 1
        self.manifest.append(dict(
            fault_id=f"F{self.n:03d}", fault_type=ftype, category=category, table=table,
            pk=df.at[i, pk] if (i is not None and pk in df.columns) else "",
            person_id=df.at[i, "person_id"] if (i is not None and "person_id" in df.columns) else "",
            field=field, original=original, injected=injected,
            expected_rules="|".join(r for r in rules if r), note=note))

    def put(self, ftype, category, table, i, field, value, rules, note=""):
        before = self.data[table].at[i, field] if field in self.data[table].columns else ""
        self.data[table].at[i, field] = value
        self.log(ftype, category, table, i, field, value, [rules] if isinstance(rules, str) else rules, original=before, note=note)

    def rows(self, table, mask=None, k=None):
        """오류를 심을 행을 고른다. 손대지 않은 행만. 자리가 모자라면 적게 심는다."""
        if table not in self.data:
            return []
        df = self.data[table]
        idx = list(df.index if mask is None else df.index[mask])
        free = [i for i in idx if (table, i) not in self.used]
        if not free:
            return []
        picked = [int(i) for i in self.rng.choice(free, size=min(k or self.k, len(free)), replace=False)]
        for i in picked:
            self.used.add((table, i))
        return picked

    # ------------------------------------------------- 구조 규칙: 규칙에서 거꾸로
    def applicable(self, check):
        out = []
        for r in RULES:
            if r["check"] != check or r["table"] not in self.data:
                continue
            scope = r.get("scope", "all")
            if scope != "all" and self.cohort not in scope:
                continue
            if r["fields"] and not all(f in self.data[r["table"]].columns for f in r["fields"]):
                continue
            if (self.cohort, r["table"]) == DROP_TABLE and r["check"] != "table_present":
                continue            # 파일째 없앨 테이블이라 다른 오류를 심어도 검사되지 않는다
            if r["check"] == "fk" and r["params"]["ref_table"] not in self.tables:
                continue
            if not len(self.data[r["table"]]):
                continue
            out.append(r)
        return out

    def structural(self):
        pkcol = lambda t: SPEC[t]["pk"]
        for r in self.applicable("not_null"):
            t, f = r["table"], r["fields"][0]
            if f == pkcol(t):
                continue            # PK 비우기는 아래 pk_unique 에서 따로 한다
            for i in self.rows(t, mask=self.data[t][f] != ""):
                self.put("REQUIRED_NULL", "Completeness", t, i, f, "", r["id"])
        for r in self.applicable("type"):
            t, f = r["table"], r["fields"][0]
            ty = r["params"]["type"]
            bad = {"date": "2026-13-45", "timestamp": "2026-13-45 99:99:99"}.get(ty, "NOT_A_NUMBER")
            for i in self.rows(t, mask=self.data[t][f] != ""):
                self.put("TYPE_BAD", "Conformance", t, i, f, bad, r["id"])
        for r in self.applicable("fk"):
            t, f = r["table"], r["fields"][0]
            for i in self.rows(t, mask=self.data[t][f] != ""):
                self.put("FK_BROKEN", "Conformance", t, i, f, "999999999", r["id"])
        for r in self.applicable("pk_unique"):
            t = r["table"]
            cols = r["params"].get("columns", r["fields"])
            df = self.data[t]
            if len(df) < 3:
                continue
            picked = self.rows(t, k=3)
            if len(picked) < 3:
                continue
            src, dst, blank = picked
            for c in cols:
                df.at[dst, c] = df.at[src, c]
            self.log("PK_DUP", "Conformance", t, dst, "+".join(cols), df.at[src, cols[0]], [r["id"]])
            # PK 를 비운다 (PK NULL)
            before = df.at[blank, cols[0]]
            for c in cols:
                df.at[blank, c] = ""
            self.log("PK_NULL", "Completeness", t, blank, "+".join(cols), "", [r["id"]], original=before)
        for r in self.applicable("codelist"):
            t, f = r["table"], r["fields"][0]
            for i in self.rows(t, mask=self.data[t][f] != ""):
                self.put("CODELIST", "Conformance", t, i, f, "9999999", r["id"])
        for r in self.applicable("range"):
            t, f = r["table"], r["fields"][0]
            hi = r["params"]["max"]
            for i in self.rows(t, mask=self.data[t][f] != ""):
                self.put("RANGE", "Plausibility", t, i, f, str(int(abs(hi) * 10 + 1000)), r["id"])
        for r in self.applicable("pattern"):
            t, f = r["table"], r["fields"][0]
            for i in self.rows(t, mask=self.data[t][f] != ""):
                self.put("PATTERN", "Conformance", t, i, f, "BAD-CODE", r["id"])
        for r in self.applicable("not_future"):
            t, f = r["table"], r["fields"][0]
            for i in self.rows(t, mask=self.data[t][f] != ""):
                self.put("FUTURE_DATE", "Plausibility", t, i, f, "2099-01-01", r["id"])
        for r in self.applicable("must_be_null"):
            t, f = r["table"], r["fields"][0]
            for i in self.rows(t):
                self.put("MUST_BE_NULL", "Conformance", t, i, f, "12345", r["id"])

    def structure(self):
        """컬럼/테이블을 통째로 없앤다. 맨 마지막에 하고, 다른 오류·의미 규칙이 쓰지 않는 것만 고른다."""
        used_cols = {(m["table"], m["field"]) for m in self.manifest}
        for m in self.manifest:
            if "+" in m["field"]:
                used_cols |= {(m["table"], c) for c in m["field"].split("+")}
        rules = self.applicable("columns")
        rng_order = list(self.rng.permutation(len(rules)))
        done = 0
        for ix in rng_order:
            r = rules[ix]
            t = r["table"]
            if (self.cohort, t) == DROP_TABLE:
                continue
            df = self.data[t]
            keep = {SPEC[t]["pk"], "person_id"}
            cand = [c for c in df.columns if c not in keep and (t, c) not in used_cols
                    and not re.search(rf"\b{re.escape(c)}\b", SEM_SQL)]
            if not cand:
                continue
            c = cand[len(cand) // 2]
            self.log("COLUMN_MISSING", "Conformance", t, None, c, "(컬럼 삭제)", [r["id"]])
            self.dropped_columns.setdefault(t, []).append(c)
            done += 1
            if done >= 2:
                break
        # 명세에 없는 컬럼 추가 (경고 규칙 extra_columns)
        rules = [r for r in self.applicable("extra_columns") if r["table"] not in self.dropped_tables]
        for ix in list(self.rng.permutation(len(rules)))[:2]:
            r = rules[ix]
            t = r["table"]
            self.data[t]["extra_memo"] = "추가열"
            self.log("EXTRA_COLUMN", "Conformance", t, None, "extra_memo", "(명세에 없는 컬럼 추가)", [r["id"]])
        if self.dropped_tables:
            t = DROP_TABLE[1]
            rid = next(r["id"] for r in RULES if r["table"] == t and r["check"] == "table_present")
            self.log("TABLE_MISSING", "Completeness", t, None, "", "(테이블 삭제)", [rid])

    # ------------------------------------------------- 의미 규칙(손으로 적음)
    def semantic(self):
        d = self.data
        V, P, M, DR = d["VISIT_OCCURRENCE"], d["PERSON"], d["MEASUREMENT"], d["DRUG_EXPOSURE"]
        dis = d[self.disease]
        pids = list(self.clean["PERSON"]["person_id"])

        def other_person(pid):
            return next(x for x in pids if x != pid)

        # COM-001 방문 종료일이 시작일보다 앞
        for i in self.rows("VISIT_OCCURRENCE", mask=V["visit_start_date"] != "", k=2):
            self.put("VISIT_END_BEFORE_START", "Plausibility", "VISIT_OCCURRENCE", i, "visit_end_date",
                     day(V.at[i, "visit_start_date"], -1), "SEM-COM-001", note="종료일을 시작일보다 하루 앞으로")
        # COM-002 출생연도 이전 방문
        for i in self.rows("VISIT_OCCURRENCE", mask=V["visit_start_date"] != ""):
            self.put("VISIT_BEFORE_BIRTH", "Plausibility", "VISIT_OCCURRENCE", i, "visit_start_date", "1890-01-01", "SEM-COM-002")
        # COM-003 사망 이후 이벤트: 사망일을 환자의 첫 방문 전으로 당긴다
        cV = self.clean["VISIT_OCCURRENCE"]
        vstart = cV[cV["visit_start_date"] != ""].groupby("person_id")["visit_start_date"].min()
        if self.runs("SEM-COM-003"):
            for i in self.rows("PERSON", mask=(P["death_date"] == "") & P["person_id"].isin(vstart.index)):
                self.put("EVENT_AFTER_DEATH", "Plausibility", "PERSON", i, "death_date", day(vstart[P.at[i, "person_id"]], -5), "SEM-COM-003")
        # COM-011 이상사례 발생일이 사망일 이후 (같은 환자의 다른 이벤트도 사망 이후가 되므로 COM-003 도 발화한다)
        A = self.clean["ADVERSE_EVENT"]
        ae_first = A[A["adverse_event_start_date"] != ""].groupby("person_id")["adverse_event_start_date"].min()
        if self.runs("SEM-COM-011", "SEM-COM-003"):
            for i in self.rows("PERSON", mask=(P["death_date"] == "") & P["person_id"].isin(ae_first.index)):
                self.put("AE_AFTER_DEATH", "Plausibility", "PERSON", i, "death_date", day(ae_first[P.at[i, "person_id"]], -1),
                         self.runs("SEM-COM-011", "SEM-COM-003"))
        # COM-004 이벤트-방문 환자 불일치
        good_visits = set(self.intact("VISIT_OCCURRENCE")["visit_occurrence_id"])
        if self.runs("SEM-COM-004"):
            for i in self.rows("MEASUREMENT", mask=M["visit_occurrence_id"].isin(good_visits), k=2):
                self.put("EVENT_VISIT_PERSON_MISMATCH", "Conformance", "MEASUREMENT", i, "person_id", other_person(M.at[i, "person_id"]), "SEM-COM-004")
        # COM-005 약물 기간 / days_supply
        for i in self.rows("DRUG_EXPOSURE", mask=DR["days_supply"] != "", k=2):
            span = (pd.Timestamp(DR.at[i, "drug_exposure_end_date"]) - pd.Timestamp(DR.at[i, "drug_exposure_start_date"])).days + 1
            self.put("DAYS_SUPPLY_MISMATCH", "Plausibility", "DRUG_EXPOSURE", i, "days_supply", str(span + 20), "SEM-COM-005",
                     note="기간(end-start+1)보다 20일 길게")
        for i in self.rows("DRUG_EXPOSURE", mask=DR["drug_exposure_start_date"] != ""):
            self.put("DRUG_END_BEFORE_START", "Plausibility", "DRUG_EXPOSURE", i, "drug_exposure_end_date",
                     day(DR.at[i, "drug_exposure_start_date"], -3), "SEM-COM-005")
        # COM-006 매일 투여면 days_supply 필수
        for i in self.rows("DRUG_EXPOSURE", mask=DR["frequency_per_day"] != ""):
            self.put("FREQ_WITHOUT_DAYS_SUPPLY", "Completeness", "DRUG_EXPOSURE", i, "days_supply", "", "SEM-COM-006")
        # COM-007 투여 간격이 1일 초과면 dosing_number 필수
        interval = pd.to_numeric(DR["dosing_interval_day"].replace("", None), errors="coerce")
        for i in self.rows("DRUG_EXPOSURE", mask=(interval > 1) & (DR["dosing_number"] != "")):
            self.put("INTERVAL_WITHOUT_NUMBER", "Completeness", "DRUG_EXPOSURE", i, "dosing_number", "", "SEM-COM-007")
        # COM-008 정상범위 하한 > 상한
        for i in self.rows("MEASUREMENT", mask=(M["range_low"] != "") & (M["range_high"] != ""), k=2):
            self.put("RANGE_LOW_GT_HIGH", "Plausibility", "MEASUREMENT", i, "range_low", str(float(M.at[i, "range_high"]) + 100), "SEM-COM-008")
        # COM-010 특화 테이블 방문의 환자 불일치
        for i in self.rows(self.disease, mask=dis["visit_occurrence_id"] != ""):
            pid = dis.at[i, "person_id"]
            iv = self.intact("VISIT_OCCURRENCE")
            other = iv[iv["person_id"] != pid]
            self.put("DISEASE_VISIT_PERSON_MISMATCH", "Conformance", self.disease, i, "visit_occurrence_id",
                     other["visit_occurrence_id"].iloc[int(self.rng.integers(len(other)))], "SEM-COM-010")
        # COM-012 약물이 다른 환자의 노트를 가리킴 (노트에 person_id 가 있을 때만 규칙이 걸린다. SMILES 노트는 person_id 가 비어 있다)
        nt = self.intact("NOTE")
        owned = dict(zip(nt.loc[nt["person_id"] != "", "note_id"], nt.loc[nt["person_id"] != "", "person_id"]))
        for i in self.rows("DRUG_EXPOSURE"):
            pid = DR.at[i, "person_id"]
            other = [n_ for n_, p_ in owned.items() if p_ != pid]
            self.put("DRUG_NOTE_PERSON_MISMATCH", "Conformance", "DRUG_EXPOSURE", i, "note_id", other[int(self.rng.integers(len(other)))], "SEM-COM-012")
        # MEAS-001 검사일 없음 (경고)
        for i in self.rows("MEASUREMENT", mask=M["measurement_date"] != "", k=2):
            self.put("MEASUREMENT_WITHOUT_DATE", "Completeness", "MEASUREMENT", i, "measurement_date", "", "SEM-MEAS-001")
        # MEAS-002 결과값 없음 (경고): 수치 결과를 지운다. 범주 결과가 이미 있는 행은 고르지 않는다
        for i in self.rows("MEASUREMENT", mask=(M["value_as_number"] != "") & (M["value_as_concept_id"] == ""), k=2):
            self.put("MEASUREMENT_WITHOUT_RESULT", "Completeness", "MEASUREMENT", i, "value_as_number", "", "SEM-MEAS-002")

        if "SACT" in d:
            S = d["SACT"]
            # SACT-001 종료일 < 시작일, line 번호 불일치
            for i in self.rows("SACT", mask=S["regimen_start_date"] != ""):
                self.put("SACT_END_BEFORE_START", "Plausibility", "SACT", i, "regimen_end_date", day(S.at[i, "regimen_start_date"], -1), "SEM-SACT-001")
            for i in self.rows("SACT", mask=S["line_of_therapy"] != ""):
                self.put("SACT_LINE_MISMATCH", "Plausibility", "SACT", i, "line_of_therapy", "9", "SEM-SACT-001")
            # SACT-002 시작일이 연결 약물 최소 시작일과 다름 (1차 요법을 앞으로 당기면 line 순서는 그대로)
            for i in self.rows("SACT", mask=S["line_of_therapy"] == "1"):
                self.put("SACT_START_NE_DRUG_MIN", "Plausibility", "SACT", i, "regimen_start_date", day(S.at[i, "regimen_start_date"], -3), "SEM-SACT-002")
            # SACT-003 진행일 < 시작일
            for i in self.rows("SACT", mask=S["regimen_start_date"] != ""):
                self.put("PROGRESSION_BEFORE_START", "Plausibility", "SACT", i, "date_of_progression", day(S.at[i, "regimen_start_date"], -10), "SEM-SACT-003")
            # SACT-004 약물-요법 환자 불일치
            sact_person = dict(zip(*[self.intact("SACT")[c] for c in ("sact_id", "person_id")]))
            for i in self.rows("DRUG_EXPOSURE", mask=DR["sact_id"].isin(sact_person)):
                pid = DR.at[i, "person_id"]
                other = [s for s, p_ in sact_person.items() if p_ != pid]
                self.put("DRUG_SACT_PERSON_MISMATCH", "Conformance", "DRUG_EXPOSURE", i, "sact_id", other[int(self.rng.integers(len(other)))], "SEM-SACT-004")
            # SACT-005 항종양제인데 sact_id 없음 (경고)
            is_l01 = pd.to_numeric(DR["drug_concept_id"], errors="coerce").isin(L01) & (DR["sact_id"] != "")
            for i in self.rows("DRUG_EXPOSURE", mask=is_l01, k=2):
                self.put("L01_WITHOUT_SACT", "Completeness", "DRUG_EXPOSURE", i, "sact_id", "", "SEM-SACT-005")

        if self.cohort == "LUNG_CANCER":
            # LC-001 clinical_stage 가 AJCC 병기군이 아님 (소세포폐암 LD/ED 표기, 로마숫자만 쓴 III)
            for val, note in (("ED", "확장기 표기"), ("LD", "제한기 표기"), ("III", "하위 병기 없는 III")):
                for i in self.rows(self.disease, mask=dis["clinical_stage"] != ""):
                    self.put("STAGE_NOT_AJCC", "Conformance", self.disease, i, "clinical_stage", val, "SEM-LC-001", note=note)
        if self.cohort == "LYMPHOMA":
            # LY-001 cell_of_origin 이 GCB·ABC/non-GCB·unclassifiable·NA 가 아님 (비어 있으면 필수 규칙이 잡는다)
            for i in self.rows(self.disease, mask=dis["cell_of_origin"] == "NA"):
                self.put("COO_NA_FORMAT", "Conformance", self.disease, i, "cell_of_origin", "N/A", "SEM-LY-001", note="NA 를 N/A 로 적음")
            for i in self.rows(self.disease, mask=dis["cell_of_origin"].isin(["GCB", "ABC/non-GCB", "unclassifiable"])):
                self.put("COO_VALUE_INVALID", "Conformance", self.disease, i, "cell_of_origin", "ABC", "SEM-LY-001", note="ABC/non-GCB 를 ABC 로 적음")

        # COM-009 특화 테이블에 행이 없는 환자 (행을 지운다. 맨 마지막)
        ok_persons = set(self.intact("PERSON")["person_id"])        # PERSON 행이 멀쩡해야 '행 없는 환자'로 보고된다
        for i in self.rows(self.disease, mask=dis["person_id"].isin(ok_persons)):
            pid = dis.at[i, "person_id"]
            self.n += 1
            self.manifest.append(dict(
                fault_id=f"F{self.n:03d}", fault_type="PERSON_WITHOUT_DISEASE_ROW", category="Completeness", table=self.disease,
                pk=pid, person_id=pid, field="person_id", original=pid, injected="(행 삭제)", expected_rules="SEM-COM-009", note=""))
            self.deleted_rows.setdefault(self.disease, []).append(i)

    def run(self):
        self.structural()
        self.semantic()
        self.structure()
        return self

    # ------------------------------------------------------------- 쓰기
    def write(self, out):
        out = os.path.join(out, self.cohort)
        os.makedirs(out, exist_ok=True)
        for t, df in self.data.items():
            p = os.path.join(out, f"{t}.csv")
            if t in self.dropped_tables:
                if os.path.exists(p):
                    os.remove(p)
                continue
            df = df.drop(index=self.deleted_rows.get(t, []), errors="ignore")
            df = df.drop(columns=self.dropped_columns.get(t, []), errors="ignore")
            df.to_csv(p, index=False, encoding="utf-8")
        pd.DataFrame(self.manifest).to_csv(os.path.join(out, "fault_manifest.csv"), index=False, encoding="utf-8")
        return len(self.manifest)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--k", type=int, default=1, help="규칙마다 심을 행 수")
    ap.add_argument("--seed", type=int, default=777)
    ap.add_argument("--clean", default=os.path.join(ROOT, "synth/output/clean"))
    ap.add_argument("--out", default=os.path.join(ROOT, "synth/output/dirty"))
    a = ap.parse_args()
    for c in (COHORTS if a.all else [a.cohort]):
        inj = Injector(c, k=a.k, seed=a.seed).load(os.path.join(a.clean, c)).run()
        n = inj.write(a.out)
        print(f"[{c}] 심은 오류 {n}건 → {os.path.relpath(os.path.join(a.out, c), ROOT)}")


if __name__ == "__main__":
    main()
