// 규칙 묶음 해시의 입력 범위와 비표준 SQL 의 결과 열 구성 시험 (데이터 불필요, 임시 저장소 사본 사용)
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getRoot, setRoot } from "../src/load.js";
import { ruleSetHash } from "../src/rules.js";
import { runSemantic } from "../src/semantic.js";
import type { SemanticContext, SemanticSink } from "../src/semantic.js";
import type { RuleStat, SemanticRule } from "../src/types.js";

const REAL_ROOT = getRoot();
const tmpDirs: string[] = [];

function tempRoot(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "kai-hash-"));
  tmpDirs.push(d);
  for (const sub of ["spec", "rules"]) fs.cpSync(path.join(REAL_ROOT, sub), path.join(d, sub), { recursive: true });
  return d;
}

function mutate(root: string, rel: string, fn: (text: string) => string): void {
  const p = path.join(root, rel);
  const before = fs.readFileSync(p, "utf-8");
  const after = fn(before);
  expect(after).not.toBe(before);
  fs.writeFileSync(p, after);
}

function hashAt(root: string): string {
  setRoot(root);
  return ruleSetHash(undefined);
}

afterEach(() => {
  setRoot(undefined);
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("ruleSetHash 입력 범위", () => {
  it("같은 내용의 사본은 같은 해시이고, 코드 값만 바뀌어도 달라진다", () => {
    const base = hashAt(tempRoot());
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAt(tempRoot())).toBe(base);

    const r = tempRoot();
    mutate(r, "spec/codelists.yaml", (t) => t.replace("    '7': 기타\n", "    '7': 기타\n    '99': 신규 코드\n"));
    expect(hashAt(r)).not.toBe(base);
  });

  it("코드표 안의 코드 순서 · 설명 문구만 바뀌면 해시는 같다 (정규화)", () => {
    const base = hashAt(tempRoot());
    const r = tempRoot();
    mutate(r, "spec/codelists.yaml", (t) => t.replace("    '1': Adenocarcinoma\n    '2': Squamous cell carcinoma\n", "    '2': 다른 설명\n    '1': 또 다른 설명\n"));
    expect(hashAt(r)).toBe(base);
  });

  it("명세 · concept · 프로파일이 바뀌면 해시가 달라진다", () => {
    const base = hashAt(tempRoot());
    const a = tempRoot();
    mutate(a, "spec/kai_cdm_spec.yaml", (t) => t.replace(/required: (true|false)/, (m, v) => `required: ${v === "true" ? "false" : "true"}`));
    expect(hashAt(a)).not.toBe(base);

    const b = tempRoot();
    mutate(b, "spec/concepts.yaml", (t) => t.replace("median_min: 55", "median_min: 54"));
    expect(hashAt(b)).not.toBe(base);

    const c = tempRoot();
    mutate(c, "spec/cohort_profiles.yaml", (t) => t.replace("    - SACT\n", ""));
    expect(hashAt(c)).not.toBe(base);
  });

  it("시험이 끝나면 저장소 루트가 복원된다", () => {
    hashAt(tempRoot());
    setRoot(undefined);
    expect(getRoot()).toBe(REAL_ROOT);
  });
});

function rule(sql: string): SemanticRule {
  return { id: "ADM-001", name: "t", category: "Conformance", severity: "error", scope: "all", requires: ["PERSON"], sql, origin: "admin" };
}

async function exec(sql: string, origin: SemanticRule["origin"] = "admin") {
  const stats: RuleStat[] = [];
  const added: Array<{ rowKey: string; personId: string | null; detail: string }> = [];
  const sink: SemanticSink = {
    initStat(r, table) {
      const st: RuleStat = {
        rule_id: r.id, name: r.name, category: r.category, subcategory: "", severity: r.severity, table, fields: "", check: "sql",
        origin: r.origin, status: "pass", violations: 0, rows_checked: 0, note: "",
      };
      stats.push(st);
      return st;
    },
    add(_r, _t, _f, rowKey, personId, detail) {
      stats[0].violations += 1;
      added.push({ rowKey, personId, detail });
    },
  };
  const ctx: SemanticContext = {
    cohort: "X", todayIso: "2026-01-01",
    spec: { tables: { PERSON: { name: "PERSON", kor: "p", category: "disease", pk: "person_id", fields: [{ name: "person_id", type: "integer", required: true }] } } },
    concepts: { measurements: {}, drugs: {} },
    tablesInCohort: ["PERSON"],
    raw: new Map([["PERSON", { columns: ["person_id"], cols: new Map([["person_id", ["1", "2"]]]), n: 2 }]]),
    diseaseTable: "PERSON",
  };
  await runSemantic(ctx, [{ ...rule(sql), origin }], sink);
  return { st: stats[0], added };
}

describe("비표준 SQL 결과 열 구성", () => {
  it("행이 0개여도 열 구성이 틀리면 거절한다", async () => {
    for (const sql of [
      "SELECT 1 AS person_id, 'a' AS row_key FROM PERSON WHERE false",
      "SELECT 1 AS a, 2 AS b, 3 AS c FROM PERSON WHERE false",
      "SELECT 1 AS person_id, 2 AS row_key, 3 AS detail, 4 AS extra FROM PERSON WHERE false",
    ]) {
      const { st } = await exec(sql);
      expect(st.status, sql).toBe("error");
      expect(st.note).toContain("SQL 오류");
    }
  });

  it("이름이 겹치거나 빠지거나 남으면 거절한다 (값은 오류문에 나오지 않는다)", async () => {
    const secret = "SECRET-PATIENT-VALUE";
    for (const sql of [
      `SELECT person_id, person_id AS row_key, '${secret}' AS detail, 1 AS detail FROM PERSON`,
      `SELECT person_id, '${secret}' AS detail FROM PERSON`,
      `SELECT person_id, person_id AS rk, '${secret}' AS detail FROM PERSON`,
      `SELECT person_id, person_id AS row_key, '${secret}' AS detail, 1 AS x FROM PERSON`,
    ]) {
      const { st, added } = await exec(sql);
      expect(st.status, sql).toBe("error");
      expect(st.note).not.toContain(secret);
      expect(added).toHaveLength(0);
    }
  });

  it("열 순서가 달라도 이름으로 대응한다", async () => {
    const { st, added } = await exec("SELECT 'why' AS detail, 'RK' || person_id::VARCHAR AS row_key, person_id FROM PERSON ORDER BY person_id");
    expect(st.status).toBe("fail");
    expect(added).toEqual([
      { rowKey: "RK1", personId: "1", detail: "why" },
      { rowKey: "RK2", personId: "2", detail: "why" },
    ]);
  });

  it("표준 규칙은 위치 기준 그대로 동작한다", async () => {
    const { st, added } = await exec("SELECT person_id, person_id, 'd' FROM PERSON ORDER BY person_id", "standard");
    expect(st.status).toBe("fail");
    expect(added.map((a) => [a.personId, a.rowKey, a.detail])).toEqual([["1", "1", "d"], ["2", "2", "d"]]);
  });
});
