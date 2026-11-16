// 규칙 조정(RuleOverrides) 시험: 끄기 · 심각도 · 파라미터 · 사용자 규칙 · 관리자 SQL · 규칙 묶음 해시 · 보고서 절
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getRoot, loadStructuralRules } from "../src/load.js";
import { Engine, runEngine } from "../src/engine.js";
import { effectiveRules, ruleSetHash, describeOverrides } from "../src/rules.js";
import type { RuleOverrides, Summary } from "../src/types.js";

const ROOT = getRoot();
const COHORT = "LUNG_CANCER";
const TODAY = "2026-09-07";
const DIRTY = path.join(ROOT, "synth/output/dirty", COHORT);
const CLEAN = path.join(ROOT, "synth/output/clean", COHORT);
const haveData = fs.existsSync(path.join(DIRTY, "PERSON.csv")) && fs.existsSync(path.join(CLEAN, "PERSON.csv"));

async function run(data: string, overrides?: RuleOverrides, adminMode = false): Promise<Engine> {
  const e = new Engine({ cohort: COHORT, today: TODAY, overrides, adminMode }).load(data);
  e.runStructural();
  await e.runSemantic();
  return e;
}

describe("규칙 묶음 · 해시 (데이터 불필요)", () => {
  it("해시는 같은 설정에서 같고, 설정이 바뀌면 달라진다", () => {
    const std = ruleSetHash(undefined);
    expect(std).toMatch(/^[0-9a-f]{64}$/);
    expect(ruleSetHash(undefined)).toBe(std);
    expect(ruleSetHash({})).toBe(std);
    const a = ruleSetHash({ disabled: ["ST-0001"] });
    expect(a).not.toBe(std);
    expect(ruleSetHash({ disabled: ["ST-0001"] })).toBe(a);
    expect(ruleSetHash({ severity: { "ST-0001": "warning" } })).not.toBe(std);
  });

  it("origin 은 변경 종류에 따라 정해진다", () => {
    const range = loadStructuralRules().find((r) => r.check === "range")!;
    const eff = effectiveRules({
      disabled: ["ST-0001"], severity: { "ST-0002": "warning" }, params: { [range.id]: { max: Number(range.params.max) + 1 } },
      sql: { "SEM-COM-001": "SELECT 1, 2, 3" },
      customRules: [{ id: "USR-001", name: "t", table: "PERSON", field: "year_of_birth", check: "range", severity: "error", params: { min: 1, max: 2 } }],
      customSql: [{ id: "ADM-001", name: "s", category: "Conformance", severity: "error", scope: "all", requires: ["PERSON"], sql: "SELECT 1, 2, 3" }],
    });
    const o = (id: string) => [...eff.structural, ...eff.semantic].find((r) => r.id === id)!.origin;
    expect([o("ST-0001"), o("ST-0002"), o(range.id), o("SEM-COM-001"), o("USR-001"), o("ADM-001"), o("ST-0004")])
      .toEqual(["modified", "modified", "modified", "admin", "custom", "admin", "standard"]);
  });

  it("알 수 없는 규칙 id · 잘못된 입력은 명확한 오류를 낸다", () => {
    expect(() => effectiveRules({ disabled: ["ST-9999"] })).toThrow(/알 수 없는 규칙 id/);
    expect(() => effectiveRules({ severity: { "XX-1": "error" } })).toThrow(/알 수 없는 규칙 id/);
    expect(() => effectiveRules({ params: { "XX-1": { min: 1 } } })).toThrow(/알 수 없는 규칙 id/);
    expect(() => effectiveRules({ sql: { "XX-1": "SELECT 1" } })).toThrow(/알 수 없는/);
    expect(() => effectiveRules({ severity: { "ST-0001": "fatal" as never } })).toThrow(/severity/);
    expect(() => effectiveRules({ params: { "ST-0001": { min: 1 } } })).toThrow(/줄 수 없다/);
    const bad = (id: string) => ({ id, name: "t", table: "PERSON", field: "year_of_birth", check: "not_null" as const, severity: "error" as const, params: {} });
    expect(() => effectiveRules({ customRules: [bad("USR-1")] })).toThrow(/USR-000/);
    expect(() => effectiveRules({ customRules: [bad("ADM-001")] })).toThrow(/USR-000/);
    expect(() => effectiveRules({ customRules: [{ ...bad("USR-001"), field: "nope" }] })).toThrow(/없는 컬럼/);
    expect(() => effectiveRules({ customRules: [bad("USR-001"), bad("USR-001")] })).toThrow(/중복/);
    expect(() => effectiveRules({ customSql: [{ id: "USR-001", name: "s", category: "Conformance", severity: "error", scope: "all", requires: [], sql: "SELECT 1" }] })).toThrow(/ADM-000/);
  });

  it("SQL 규칙은 관리자 모드 없이는 받지 않는다", () => {
    expect(() => new Engine({ cohort: COHORT, overrides: { sql: { "SEM-COM-001": "SELECT 1,2,3" } } })).toThrow(/관리자 모드/);
  });

  it("describeOverrides 는 변경마다 한 줄을 돌려준다", () => {
    const d = describeOverrides({ disabled: ["ST-0001"], severity: { "ST-0002": "warning" }, sql: { "SEM-COM-001": "SELECT 1" } });
    expect(d.map((x) => [x.rule_id, x.origin])).toEqual([["ST-0001", "modified"], ["ST-0002", "modified"], ["SEM-COM-001", "admin"]]);
    expect(d[0].change).toBeTruthy();
  });
});

describe.skipIf(!haveData)("규칙 조정 실행 (합성 데이터)", () => {
  it("끈 규칙은 disabled 로 기록되고 실행되지 않는다", async () => {
    const base = await run(DIRTY);
    const target = [...base.ruleStats.values()].find((s) => s.status === "fail" && s.check !== "sql")!;
    const e = await run(DIRTY, { disabled: [target.rule_id] });
    const st = e.ruleStats.get(target.rule_id)!;
    expect([st.status, st.violations, st.origin]).toEqual(["disabled", 0, "modified"]);
    expect(e.findings.some((f) => f.rule_id === target.rule_id)).toBe(false);
    const s = e.summary();
    expect(s.rules_disabled).toBe(1);
    expect(s.rules_total).toBe(base.summary().rules_total);
    expect(s.violations_total).toBe(base.summary().violations_total - target.violations);
  });

  it("심각도를 바꾸면 error/warning 집계가 옮겨간다", async () => {
    const base = await run(DIRTY);
    const target = [...base.ruleStats.values()].find((s) => s.status === "fail" && s.severity === "error")!;
    const b = base.summary(), s = (await run(DIRTY, { severity: { [target.rule_id]: "warning" } })).summary();
    expect(s.violations_total).toBe(b.violations_total);
    expect(s.violations_error).toBe(b.violations_error - target.violations);
    expect(s.violations_warning).toBe(b.violations_warning + target.violations);
  });

  it("range 파라미터를 바꾸면 위반이 달라진다", async () => {
    const base = await run(CLEAN);
    const rules = loadStructuralRules().filter((r) => r.check === "range" && base.ruleStats.get(r.id)?.rows_checked);
    let changed = 0;
    for (const r of rules) {
      const e = await run(CLEAN, { params: { [r.id]: { min: 1e9, max: 1e9 } } });
      if (e.ruleStats.get(r.id)!.violations > 0) { changed += 1; expect(e.ruleStats.get(r.id)!.origin).toBe("modified"); break; }
    }
    expect(changed).toBe(1);
    expect(base.summary().violations_total).toBe(0);
  });

  it("codelist extraCodes 는 허용 코드로 받아들여진다", async () => {
    const base = await run(DIRTY);
    const bad = base.findings.find((f) => /코드표\(.+\) 밖/.test(f.detail))!;
    const code = new RegExp(`^${bad.field}=(\\S*) `).exec(bad.detail)![1];
    const same = base.findings.filter((f) => f.rule_id === bad.rule_id && f.detail === bad.detail).length;
    const e = await run(DIRTY, { params: { [bad.rule_id]: { extraCodes: [code] } } });
    const after = e.findings.filter((f) => f.rule_id === bad.rule_id && f.detail === bad.detail).length;
    expect([same > 0, after]).toEqual([true, 0]);
  });

  it("사용자 규칙(level 3)이 위반을 찾는다", async () => {
    const e = await run(CLEAN, {
      customRules: [{ id: "USR-001", name: "출생연도 하한", table: "PERSON", field: "year_of_birth", check: "range", severity: "warning", params: { min: 3000, max: 3001 } }],
    });
    const st = e.ruleStats.get("USR-001")!;
    expect([st.status, st.origin, st.check, st.severity]).toEqual(["fail", "custom", "range", "warning"]);
    expect(st.violations).toBe(e.raw.get("PERSON")!.n);
    expect(e.findings.filter((f) => f.rule_id === "USR-001")).toHaveLength(st.violations);
  });

  it("관리자 SQL: 교체와 추가가 실행되고, 깨진 SQL 은 error 로 기록된다 (예외 없음)", async () => {
    const good = "SELECT person_id, CAST(person_id AS VARCHAR) AS row_key, 'x' AS detail FROM PERSON";
    const e = await run(CLEAN, {
      sql: { "SEM-COM-001": good, "SEM-COM-002": "SELECT FROM WHERE" },
      customSql: [
        { id: "ADM-001", name: "추가", category: "Conformance", severity: "error", scope: "all", requires: ["PERSON"], sql: good },
        { id: "ADM-002", name: "파괴", category: "Conformance", severity: "error", scope: "all", requires: ["PERSON"], sql: "DROP TABLE PERSON" },
        { id: "ADM-003", name: "열 부족", category: "Conformance", severity: "error", scope: "all", requires: ["PERSON"], sql: "SELECT person_id FROM PERSON" },
      ],
    }, true);
    const n = e.raw.get("PERSON")!.n;
    const get = (id: string) => e.ruleStats.get(id)!;
    expect([get("SEM-COM-001").status, get("SEM-COM-001").violations, get("SEM-COM-001").origin]).toEqual(["fail", n, "admin"]);
    expect([get("ADM-001").status, get("ADM-001").violations]).toEqual(["fail", n]);
    for (const id of ["SEM-COM-002", "ADM-002", "ADM-003"]) {
      expect(get(id).status).toBe("error");
      expect(get(id).note).toMatch(/^SQL 오류/);
    }
    expect(e.summary().rules_error).toBe(3);
  });

  it("report.md 의 `## 규칙 설정` 은 조정이 있을 때만 나온다", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kai-ov-"));
    const rep = async (name: string, overrides?: RuleOverrides, adminMode?: boolean): Promise<string> => {
      const s: Summary = await runEngine({ cohort: COHORT, today: TODAY, data: CLEAN, out: path.join(tmp, name), overrides, adminMode });
      expect(s.cohort).toBe(COHORT);
      return fs.readFileSync(path.join(tmp, name, "report.md"), "utf-8");
    };
    try {
      expect(await rep("std")).not.toContain("## 규칙 설정");
      expect(await rep("empty", {}, false)).not.toContain("## 규칙 설정");
      const a = await rep("ov", { disabled: ["ST-0001"] });
      expect(a).toContain("## 규칙 설정");
      expect(a).toContain("| ST-0001 | modified |");
      expect(a).toContain(ruleSetHash({ disabled: ["ST-0001"] }));
      expect(a.split("\n")[0]).toMatch(/^# 데이터 품질 검증 보고서/);
      expect(await rep("admin", undefined, true)).toContain("관리자 모드: 사용");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
