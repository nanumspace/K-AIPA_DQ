// 규칙 설정(이 PC 의 덧씌우기): 변경 검증·적용, 관리자 모드 제한, 저장·이력, 제출용 기록, 엔진과의 맞물림
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { setRoot, loadSpec, loadProfiles, loadStructuralRules, loadSemanticRules, effectiveRules, ruleSetHash, describeOverrides } from "@engine/index.js";
import type { CustomRule, CustomSqlRule, RuleChange, RuleOverrides } from "@shared/types";
import * as rs from "../src/main/ruleset";

const ROOT = path.resolve(__dirname, "../..");
let ctx: rs.RuleContext;

beforeAll(() => {
  setRoot(ROOT);
  ctx = { spec: loadSpec(), cohortIds: Object.keys(loadProfiles()), base: { structural: loadStructuralRules(), semantic: loadSemanticRules() } };
});

const apply = (cur: RuleOverrides, ch: RuleChange, admin = false) => rs.applyChange(ctx, cur, ch, admin);
const rangeRule = () => ctx.base.structural.find((r) => r.check === "range")!;
const codelistRule = () => ctx.base.structural.find((r) => r.check === "codelist")!;
const notNullRule = () => ctx.base.structural.find((r) => r.check === "not_null")!;
const sem = () => ctx.base.semantic[0];

describe("규칙 목록", () => {
  it("설정이 없으면 모두 표준이고 심각도·SQL 이 표준과 같다", () => {
    const views = rs.buildRuleViews(ctx.base, {});
    expect(views).toHaveLength(ctx.base.structural.length + ctx.base.semantic.length);
    expect(views.every((v) => v.origin === "standard" && !v.disabled && v.severity === v.standardSeverity)).toBe(true);
  });

  it("범위·코드표 규칙은 조정할 값의 종류를 알려 준다", () => {
    const views = rs.buildRuleViews(ctx.base, {});
    const r = views.find((v) => v.id === rangeRule().id)!;
    expect(r.paramKind).toBe("range");
    expect(r.params?.min).toBe(rangeRule().params.min);
    expect(views.find((v) => v.id === codelistRule().id)?.paramKind).toBe("codelist");
    expect(views.find((v) => v.id === notNullRule().id)?.paramKind).toBeUndefined();
  });
});

describe("수준 1 · 2: 끄기, 심각도, 값", () => {
  it("끄면 modified, 다시 켜면 설정이 사라진다", () => {
    const off = apply({}, { op: "disable", id: notNullRule().id, disabled: true });
    expect(off.overrides.disabled).toEqual([notNullRule().id]);
    expect(rs.buildRuleViews(ctx.base, off.overrides).find((v) => v.id === notNullRule().id)).toMatchObject({ disabled: true, origin: "modified" });
    expect(off.history[0]).toMatchObject({ action: "disable", rule_id: notNullRule().id, before: { disabled: false }, after: { disabled: true } });
    const on = apply(off.overrides, { op: "disable", id: notNullRule().id, disabled: false });
    expect(rs.isEmptyOverrides(on.overrides)).toBe(true);
  });

  it("표준과 같은 심각도로 되돌리면 설정에서 빠진다", () => {
    const std = rangeRule().severity;
    const other = std === "error" ? "warning" : "error";
    const a = apply({}, { op: "severity", id: rangeRule().id, severity: other });
    expect(a.overrides.severity).toEqual({ [rangeRule().id]: other });
    const b = apply(a.overrides, { op: "severity", id: rangeRule().id, severity: std });
    expect(rs.isEmptyOverrides(b.overrides)).toBe(true);
  });

  it("범위: 한쪽만 바꿔도 되고, 최솟값이 최댓값보다 크면 거부한다", () => {
    const r = rangeRule();
    const a = apply({}, { op: "params", id: r.id, params: { max: Number(r.params.max) + 5 } });
    expect(a.overrides.params?.[r.id]).toEqual({ max: Number(r.params.max) + 5 });
    expect(() => apply({}, { op: "params", id: r.id, params: { min: Number(r.params.max) + 1 } })).toThrow(/최솟값/);
    expect(() => apply({}, { op: "params", id: r.id, params: { min: Number.NaN } })).toThrow(/숫자/);
  });

  it("코드표 규칙은 추가 코드만, 값을 조정할 수 없는 규칙은 거부한다", () => {
    const a = apply({}, { op: "params", id: codelistRule().id, params: { extraCodes: [" 77 ", "77", "88"] } });
    expect(a.overrides.params?.[codelistRule().id]).toEqual({ extraCodes: ["77", "88"] });
    expect(() => apply({}, { op: "params", id: notNullRule().id, params: { min: 1 } })).toThrow(/조정할 수 없/);
  });

  it("알 수 없는 규칙 ID · 심각도는 거부한다", () => {
    expect(() => apply({}, { op: "disable", id: "ST-9999", disabled: true })).toThrow(/표준 규칙이 아닙니다/);
    expect(() => apply({}, { op: "severity", id: rangeRule().id, severity: "info" as never })).toThrow(/심각도/);
  });

  it("같은 값으로 저장하면 이력이 남지 않는다", () => {
    const a = apply({}, { op: "disable", id: notNullRule().id, disabled: false });
    expect(a.history).toEqual([]);
  });
});

describe("수준 3: 사용자 규칙", () => {
  const range: Omit<CustomRule, "id"> = { name: "출생연도 1950 이후", table: "PERSON", field: "year_of_birth", check: "range", severity: "warning", params: { min: 1950, max: 2010 } };

  it("USR-001 부터 번호가 붙고 목록에 custom 으로 나온다", () => {
    const a = apply({}, { op: "addCustom", rule: range });
    expect(a.overrides.customRules?.[0]).toMatchObject({ id: "USR-001", table: "PERSON", field: "year_of_birth" });
    const b = apply(a.overrides, { op: "addCustom", rule: { name: "필수", table: "PERSON", field: "care_site_id", check: "not_null", severity: "error", params: {} } });
    expect(b.overrides.customRules?.map((r) => r.id)).toEqual(["USR-001", "USR-002"]);
    const v = rs.buildRuleViews(ctx.base, b.overrides).find((x) => x.id === "USR-002")!;
    expect(v).toMatchObject({ origin: "custom", kind: "structural", check: "not_null", fields: "care_site_id" });
    expect(b.history[0]).toMatchObject({ action: "add_custom", rule_id: "USR-002", before: null });
  });

  it("검사 유형은 필드 타입에 맞아야 한다", () => {
    expect(() => apply({}, { op: "addCustom", rule: { ...range, field: "gender_concept_id", check: "not_future", params: {} } })).toThrow(/날짜 컬럼/);
    expect(() => apply({}, { op: "addCustom", rule: { ...range, check: "pattern", params: { regex: "[A-Z]+" } } })).toThrow(/문자 컬럼/);
    expect(() => apply({}, { op: "addCustom", rule: { ...range, params: { min: 1950 } } })).toThrow(/모두 적어/);
    expect(() => apply({}, { op: "addCustom", rule: { ...range, params: { min: 2020, max: 1950 } } })).toThrow(/클 수 없/);
    expect(() => apply({}, { op: "addCustom", rule: { ...range, table: "NO_TABLE" } })).toThrow(/알 수 없는 테이블/);
    expect(() => apply({}, { op: "addCustom", rule: { ...range, field: "no_field" } })).toThrow(/컬럼이 없/);
    expect(() => apply({}, { op: "addCustom", rule: { ...range, check: "codelist", params: { codes: [] } } })).toThrow(/코드/);
    expect(() => apply({}, { op: "addCustom", rule: { ...range, name: "  " } })).toThrow(/이름/);
  });

  it("정규식은 문자 컬럼에서 컴파일되어야 한다", () => {
    const text = ctx.spec.tables.NOTE.fields.find((f) => f.type === "text" || f.type === "varchar")!.name;
    const ok = apply({}, { op: "addCustom", rule: { name: "패턴", table: "NOTE", field: text, check: "pattern", severity: "warning", params: { regex: "[A-Z]\\d{2}" } } });
    expect(ok.overrides.customRules?.[0].params.regex).toBe("[A-Z]\\d{2}");
    expect(() => apply({}, { op: "addCustom", rule: { name: "패턴", table: "NOTE", field: text, check: "pattern", severity: "warning", params: { regex: "[A-Z" } } })).toThrow(/정규식/);
  });

  it("수정 · 삭제", () => {
    const a = apply({}, { op: "addCustom", rule: range });
    const up = apply(a.overrides, { op: "updateCustom", rule: { ...a.overrides.customRules![0], severity: "error" } });
    expect(up.overrides.customRules?.[0].severity).toBe("error");
    expect(up.history[0]).toMatchObject({ action: "update_custom", rule_id: "USR-001" });
    const del = apply(up.overrides, { op: "removeCustom", id: "USR-001" });
    expect(rs.isEmptyOverrides(del.overrides)).toBe(true);
    expect(() => apply({}, { op: "removeCustom", id: "USR-009" })).toThrow(/없습니다/);
  });
});

describe("수준 4: 관리자 모드의 SQL", () => {
  const newSql: Omit<CustomSqlRule, "id"> = { name: "시험", category: "Plausibility", severity: "warning", scope: ["LUNG_CANCER"], requires: ["VISIT_OCCURRENCE"],
    sql: "SELECT person_id, CAST(visit_occurrence_id AS VARCHAR) AS row_key, 'x' AS detail FROM VISIT_OCCURRENCE WHERE visit_end_date IS NULL" };

  it("관리자 모드가 아니면 SQL 을 고치거나 더할 수 없다", () => {
    expect(() => apply({}, { op: "sql", id: sem().id, sql: sem().sql + "\n-- x" }, false)).toThrow(/관리자 모드/);
    expect(() => apply({}, { op: "addSql", rule: newSql }, false)).toThrow(/관리자 모드/);
  });

  it("표준 교차 규칙의 SQL 교체는 admin 출처가 되고, 이력에 바꾸기 전·후 SQL 이 모두 남는다", () => {
    const edited = sem().sql.trim() + "\n-- 변경";
    const a = apply({}, { op: "sql", id: sem().id, sql: edited }, true);
    expect(a.overrides.sql).toEqual({ [sem().id]: edited });
    expect(rs.buildRuleViews(ctx.base, a.overrides).find((v) => v.id === sem().id)).toMatchObject({ origin: "admin", sql: edited, standardSql: sem().sql });
    expect(a.history[0]).toMatchObject({ action: "sql", rule_id: sem().id, before: { sql: sem().sql }, after: { sql: edited } });
    // 관리자 모드를 꺼도(= adminMode=false 로 다른 변경) SQL 변경은 남는다
    const b = apply(a.overrides, { op: "severity", id: rangeRule().id, severity: rangeRule().severity === "error" ? "warning" : "error" }, false);
    expect(b.overrides.sql).toEqual(a.overrides.sql);
    // 표준 SQL 과 같아지면 설정에서 빠진다
    const c = apply(a.overrides, { op: "sql", id: sem().id, sql: sem().sql }, true);
    expect(rs.isEmptyOverrides(c.overrides)).toBe(true);
  });

  it("ADM-001 이 추가되고 admin 규칙으로 보인다", () => {
    const a = apply({}, { op: "addSql", rule: newSql }, true);
    expect(a.overrides.customSql?.[0]).toMatchObject({ id: "ADM-001", requires: ["VISIT_OCCURRENCE"] });
    expect(rs.buildRuleViews(ctx.base, a.overrides).find((v) => v.id === "ADM-001")).toMatchObject({ origin: "admin", kind: "semantic", subcategory: "admin" });
    expect(() => apply({}, { op: "addSql", rule: { ...newSql, scope: ["NO_COHORT"] } }, true)).toThrow(/코호트/);
    expect(() => apply({}, { op: "addSql", rule: { ...newSql, requires: ["NO_TABLE"] } }, true)).toThrow(/테이블/);
  });

  it("SQL 점검: SELECT 하나, 결과 컬럼, 위험 구문", () => {
    expect(rs.checkSql(sem().sql)).toBeNull();
    expect(rs.checkSql("")).toMatch(/비어/);
    expect(rs.checkSql("DELETE FROM PERSON")).toMatch(/SELECT/);
    expect(rs.checkSql("SELECT 1 AS person_id, 2 AS row_key, 3 AS detail; DROP TABLE PERSON")).toMatch(/하나/);
    expect(rs.checkSql("SELECT person_id, 'a' AS row_key, 'b' AS detail FROM read_csv('/etc/passwd')")).toMatch(/쓸 수 없는/);
    expect(rs.checkSql("SELECT person_id FROM PERSON")).toMatch(/person_id, row_key, detail/);
    // 문자열 안의 단어와 update_date 같은 컬럼명은 걸리지 않는다
    expect(rs.checkSql("SELECT person_id, 'set update' AS row_key, update_date AS detail FROM X")).toBeNull();
  });
});

describe("되돌리기", () => {
  it("규칙 하나만 되돌린다", () => {
    const a = apply({}, { op: "disable", id: notNullRule().id, disabled: true });
    const b = apply(a.overrides, { op: "severity", id: rangeRule().id, severity: rangeRule().severity === "error" ? "warning" : "error" });
    const c = apply(b.overrides, { op: "resetRule", id: notNullRule().id });
    expect(c.overrides.disabled).toBeUndefined();
    expect(c.overrides.severity).toBeDefined();
    expect(c.history[0]).toMatchObject({ action: "reset_rule", rule_id: notNullRule().id });
  });

  it("전체를 되돌리면 사용자·관리자 규칙까지 모두 지운다", () => {
    let cur: RuleOverrides = apply({}, { op: "disable", id: notNullRule().id, disabled: true }).overrides;
    cur = apply(cur, { op: "addCustom", rule: { name: "n", table: "PERSON", field: "care_site_id", check: "not_null", severity: "error", params: {} } }).overrides;
    cur = apply(cur, { op: "sql", id: sem().id, sql: sem().sql + "\n-- x" }, true).overrides;
    const r = apply(cur, { op: "resetAll" }, false);
    expect(r.overrides).toEqual({});
    expect(r.history.map((h) => h.rule_id).sort()).toEqual([notNullRule().id, sem().id, "USR-001"].sort());
  });
});

describe("가져오기 검증", () => {
  it("저장한 설정은 그대로 다시 읽힌다", () => {
    let cur: RuleOverrides = apply({}, { op: "disable", id: notNullRule().id, disabled: true }).overrides;
    cur = apply(cur, { op: "params", id: rangeRule().id, params: { max: Number(rangeRule().params.max) + 1 } }).overrides;
    cur = apply(cur, { op: "sql", id: sem().id, sql: sem().sql + "\n-- x" }, true).overrides;
    expect(rs.validateOverrides(JSON.parse(JSON.stringify(cur)), ctx, { allowSql: true })).toEqual(cur);
  });

  it("모르는 항목 · 규칙 ID · 형식 오류는 거부하고, SQL 은 관리자 모드에서만 받는다", () => {
    expect(() => rs.validateOverrides([], ctx, { allowSql: true })).toThrow(/형식/);
    expect(() => rs.validateOverrides({ foo: 1 }, ctx, { allowSql: true })).toThrow(/알 수 없는 항목/);
    expect(() => rs.validateOverrides({ disabled: ["ST-9999"] }, ctx, { allowSql: true })).toThrow(/알 수 없습니다/);
    expect(() => rs.validateOverrides({ severity: { [rangeRule().id]: "fatal" } }, ctx, { allowSql: true })).toThrow(/심각도/);
    expect(() => rs.validateOverrides({ params: { [notNullRule().id]: { min: 1 } } }, ctx, { allowSql: true })).toThrow(/조정할 수 없/);
    expect(() => rs.validateOverrides({ customRules: [{ id: "XX-1" }] }, ctx, { allowSql: true })).toThrow(/ID 형식/);
    expect(() => rs.validateOverrides({ sql: { [sem().id]: sem().sql } }, ctx, { allowSql: false })).toThrow(/관리자 모드에서만/);
    expect(() => rs.validateOverrides({ sql: { [rangeRule().id]: "SELECT 1" } }, ctx, { allowSql: true })).toThrow(/교차 규칙/);
    expect(rs.validateOverrides({ sql: { [sem().id]: sem().sql } }, ctx, { allowSql: true }).sql).toBeDefined();
  });
});

describe("저장 · 이력 · 제출용 기록", () => {
  it("저장하고 다시 읽으며, 비면 파일을 지운다. 깨진 파일은 예외로 알린다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kai-ruleset-"));
    const o = apply({}, { op: "disable", id: notNullRule().id, disabled: true }).overrides;
    rs.saveOverrides(dir, o);
    expect(rs.loadOverrides(dir, ctx)).toEqual(o);
    rs.saveOverrides(dir, {});
    expect(fs.existsSync(path.join(dir, rs.OVERRIDES_FILE))).toBe(false);
    fs.writeFileSync(path.join(dir, rs.OVERRIDES_FILE), "{not json");
    expect(() => rs.loadOverrides(dir, ctx)).toThrow(/읽을 수 없습니다/);
  });

  it("이력은 시각·동작·규칙·전후 값(SQL 포함)을 줄 단위 JSON 으로 남기고 최근 것부터 읽힌다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kai-history-"));
    const edited = sem().sql + "\n-- x";
    const ch = apply({}, { op: "sql", id: sem().id, sql: edited }, true);
    rs.appendHistory(dir, [{ action: "admin_on", rule_id: "", before: null, after: null }], true, new Date("2026-11-16T01:00:00Z"));
    rs.appendHistory(dir, ch.history, true, new Date("2026-11-16T01:05:00Z"));
    const rows = rs.readHistory(dir);
    expect(rows.map((r) => r.action)).toEqual(["sql", "admin_on"]);
    expect(rows[0]).toMatchObject({ ts: "2026-11-16T01:05:00.000Z", rule_id: sem().id, admin_mode: true, before: { sql: sem().sql }, after: { sql: edited } });
    expect(fs.readFileSync(path.join(dir, rs.HISTORY_FILE), "utf-8").trim().split("\n")).toHaveLength(2);
  });

  it("rule_set: 관리자 모드만 켠 실행은 admin_modified 가 아니고, SQL 변경이 있으면 admin_modified", () => {
    let o: RuleOverrides = apply({}, { op: "disable", id: notNullRule().id, disabled: true }).overrides;
    o = apply(o, { op: "addCustom", rule: { name: "n", table: "PERSON", field: "care_site_id", check: "not_null", severity: "error", params: {} } }).overrides;
    const hashes = { standard: "s", effective: "e" };
    const plain = rs.buildRuleSetInfo(o, true, hashes, describeOverrides(o));
    expect(plain).toMatchObject({ admin_mode: true, admin_modified: false, disabled: [notNullRule().id], custom: ["USR-001"], admin: [] });
    expect(plain.modified.map((m) => m.rule_id)).toEqual([notNullRule().id]);
    const withSql = rs.buildRuleSetInfo(apply(o, { op: "sql", id: sem().id, sql: sem().sql + "\n-- x" }, true).overrides, false, hashes, []);
    expect(withSql).toMatchObject({ admin_mode: false, admin_modified: true, admin: [sem().id] });
    expect(rs.buildRuleSetInfo({}, false, hashes, [])).toEqual({ standard_hash: "s", effective_hash: "e", admin_mode: false, admin_modified: false, disabled: [], modified: [], custom: [], admin: [] });
  });
});

describe("엔진과 맞물림", () => {
  it("앱이 만든 설정을 엔진이 그대로 받아들이고, 해시와 변경 설명이 맞다", () => {
    let o: RuleOverrides = apply({}, { op: "disable", id: notNullRule().id, disabled: true }).overrides;
    o = apply(o, { op: "severity", id: rangeRule().id, severity: rangeRule().severity === "error" ? "warning" : "error" }).overrides;
    o = apply(o, { op: "params", id: rangeRule().id, params: { max: Number(rangeRule().params.max) + 1 } }).overrides;
    o = apply(o, { op: "params", id: codelistRule().id, params: { extraCodes: ["99999"] } }).overrides;
    o = apply(o, { op: "addCustom", rule: { name: "출생연도", table: "PERSON", field: "year_of_birth", check: "range", severity: "warning", params: { min: 1950, max: 2010 } } }).overrides;
    o = apply(o, { op: "sql", id: sem().id, sql: sem().sql + "\n-- x" }, true).overrides;
    o = apply(o, { op: "addSql", rule: { name: "시험", category: "Plausibility", severity: "warning", scope: "all", requires: ["VISIT_OCCURRENCE"],
      sql: "SELECT person_id, CAST(visit_occurrence_id AS VARCHAR) AS row_key, 'x' AS detail FROM VISIT_OCCURRENCE WHERE visit_end_date IS NULL" } }, true).overrides;
    const eff = effectiveRules(o);
    expect(eff.structural.find((r) => r.id === notNullRule().id)?.disabled).toBe(true);
    expect(eff.structural.find((r) => r.id === "USR-001")?.origin).toBe("custom");
    expect(eff.semantic.find((r) => r.id === "ADM-001")?.origin).toBe("admin");
    expect(eff.semantic.find((r) => r.id === sem().id)?.origin).toBe("admin");
    // 우리 목록의 출처 판정과 엔진의 출처 판정이 같아야 한다
    const mine = new Map(rs.buildRuleViews(ctx.base, o).map((v) => [v.id, v.origin]));
    for (const r of [...eff.structural, ...eff.semantic]) expect(mine.get(r.id), r.id).toBe(r.origin);
    expect(ruleSetHash(o)).not.toBe(ruleSetHash(undefined));
    expect(describeOverrides(o).map((d) => d.origin).sort()).toContain("admin");
    // 전부 되돌리면 표준 해시로 돌아간다
    expect(ruleSetHash(apply(o, { op: "resetAll" }).overrides)).toBe(ruleSetHash(undefined));
  });
});
