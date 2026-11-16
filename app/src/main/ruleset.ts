// 규칙 설정 (이 PC 의 덧씌우기): 표준 규칙은 바꾸지 않고 userData/rule-overrides.json 에 차이만 둔다.
// 이 모듈은 Electron 없이 도는 순수 부분이다 — 규칙 목록 만들기, 변경 검증·적용, 파일 저장, 변경 이력.
//
// 수준 1 끄기/켜기 · 수준 2 심각도와 범위·패턴·코드 · 수준 3 서식으로 만드는 사용자 규칙(USR-###)
// 수준 4(관리자 모드) 표준 교차 규칙의 SQL 교체 · SQL 규칙 추가(ADM-###)
import fs from "node:fs";
import path from "node:path";
import type { Spec, StructuralRule, SemanticRule } from "@engine/types.js";
import type {
  RuleInfo, RuleParams, ParamKind, RuleChange, RuleHistoryEntry, RuleOverrides, RuleParamsOverride, CustomRule, CustomSqlRule, Severity, RuleOrigin,
} from "@shared/types";

export interface BaseRules { structural: StructuralRule[]; semantic: SemanticRule[] }
/** 검증에 필요한 명세 쪽 정보 (코호트 ID 는 SQL 규칙의 적용 범위 확인용) */
export interface RuleContext { spec: Spec; cohortIds: string[]; base: BaseRules }

export const OVERRIDES_FILE = "rule-overrides.json";
export const HISTORY_FILE = "rule-history.jsonl";

const SEVERITIES: Severity[] = ["error", "warning"];
const CUSTOM_CHECKS: CustomRule["check"][] = ["not_null", "range", "codelist", "pattern", "not_future"];
const SQL_CATEGORIES: CustomSqlRule["category"][] = ["Conformance", "Completeness", "Plausibility"];
const NUMERIC = new Set(["integer", "bigint", "float"]);
const TEXTUAL = new Set(["varchar", "text"]);
const DATELIKE = new Set(["date", "timestamp"]);

// ------------------------------------------------------------------ 규칙 목록 (표준 + 이 PC 의 설정)
export function paramKindOf(check: string): ParamKind | undefined {
  return check === "range" ? "range" : check === "pattern" ? "pattern" : check === "codelist" ? "codelist" : undefined;
}

function standardParamsOf(r: StructuralRule): RuleParams | undefined {
  const kind = paramKindOf(r.check);
  if (kind === "range") return { min: r.params.min, max: r.params.max };
  if (kind === "pattern") return { regex: r.params.regex };
  if (kind === "codelist") return { codelist: String(r.params.codelist ?? ""), extraCodes: [] };
  return undefined;
}

function effectiveParams(std: RuleParams, ov: RuleParamsOverride | undefined): RuleParams {
  if (!ov) return std;
  return { ...std, ...(ov.min !== undefined ? { min: ov.min } : {}), ...(ov.max !== undefined ? { max: ov.max } : {}),
    ...(ov.regex !== undefined ? { regex: ov.regex } : {}), ...(ov.extraCodes !== undefined ? { extraCodes: ov.extraCodes } : {}) };
}

const scopeText = (s: "all" | string[]) => (s === "all" ? "all" : s.join(","));

/** 사용자 규칙을 사람이 읽는 설명으로 */
export function describeCustomRule(r: CustomRule): string {
  const t = `${r.table}.${r.field}`;
  switch (r.check) {
    case "not_null": return `${t} 은 비어 있을 수 없다.`;
    case "range": return `${t} 은 ${r.params.min} 이상 ${r.params.max} 이하여야 한다.`;
    case "codelist": return `${t} 은 ${(r.params.codes ?? []).join(", ")} 중 하나여야 한다.`;
    case "pattern": return `${t} 은 정규식 ${r.params.regex} 와 맞아야 한다.`;
    case "not_future": return `${t} 은 검증 실행일보다 미래일 수 없다.`;
  }
}

/** 화면에 보일 전체 규칙: 표준 규칙에 이 PC 의 설정을 입히고 사용자·관리자 규칙을 뒤에 붙인다 */
export function buildRuleViews(base: BaseRules, ov: RuleOverrides): RuleInfo[] {
  const off = new Set(ov.disabled ?? []);
  const out: RuleInfo[] = [];
  for (const r of base.structural) {
    const std = standardParamsOf(r);
    const kind = paramKindOf(r.check);
    const severity = ov.severity?.[r.id] ?? r.severity;
    const params = std ? effectiveParams(std, ov.params?.[r.id]) : undefined;
    const modified = off.has(r.id) || severity !== r.severity || !!ov.params?.[r.id];
    out.push({
      id: r.id, name: r.name, category: r.category, subcategory: r.subcategory ?? "", severity, table: r.table, fields: r.fields.join(","),
      check: r.check, desc: r.desc ?? "", scope: scopeText(r.scope), kind: "structural",
      origin: modified ? "modified" : "standard", disabled: off.has(r.id), standardSeverity: r.severity,
      paramKind: kind, params, standardParams: std,
    });
  }
  for (const r of base.semantic) {
    const severity = ov.severity?.[r.id] ?? r.severity;
    const sql = ov.sql?.[r.id];
    const modified = off.has(r.id) || severity !== r.severity;
    const origin: RuleOrigin = sql !== undefined ? "admin" : modified ? "modified" : "standard";
    out.push({
      id: r.id, name: r.name, category: r.category, subcategory: r.subcategory ?? "", severity, table: r.requires.join(","), fields: "",
      check: "sql", desc: r.desc ?? "", scope: scopeText(r.scope), kind: "semantic", sql: sql ?? r.sql,
      origin, disabled: off.has(r.id), standardSeverity: r.severity, standardSql: r.sql,
    });
  }
  for (const r of ov.customRules ?? []) {
    const params: RuleParams | undefined = r.check === "range" ? { min: r.params.min, max: r.params.max }
      : r.check === "pattern" ? { regex: r.params.regex } : r.check === "codelist" ? { codelist: "", extraCodes: r.params.codes ?? [] } : undefined;
    out.push({
      id: r.id, name: r.name, category: r.check === "not_null" ? "Completeness" : r.check === "not_future" || r.check === "range" ? "Plausibility" : "Conformance",
      subcategory: "custom", severity: r.severity, table: r.table, fields: r.field, check: r.check, desc: r.desc || describeCustomRule(r),
      scope: "all", kind: "structural", origin: "custom", disabled: false, standardSeverity: r.severity, params,
    });
  }
  for (const r of ov.customSql ?? []) {
    out.push({
      id: r.id, name: r.name, category: r.category, subcategory: "admin", severity: r.severity, table: r.requires.join(","), fields: "", check: "sql",
      desc: r.desc ?? "", scope: scopeText(r.scope), kind: "semantic", sql: r.sql, origin: "admin", disabled: false, standardSeverity: r.severity,
    });
  }
  return out;
}

// ------------------------------------------------------------------ 값 정리
export function isEmptyOverrides(o: RuleOverrides): boolean {
  return !(o.disabled?.length || Object.keys(o.severity ?? {}).length || Object.keys(o.params ?? {}).length ||
    Object.keys(o.sql ?? {}).length || o.customRules?.length || o.customSql?.length);
}

/** 빈 항목을 걷고 순서를 고정한다 (같은 설정이면 같은 파일·같은 해시가 나오도록) */
export function normalizeOverrides(o: RuleOverrides): RuleOverrides {
  const out: RuleOverrides = {};
  const sortObj = <T>(m: Record<string, T> | undefined): Record<string, T> | undefined => {
    if (!m || !Object.keys(m).length) return undefined;
    return Object.fromEntries(Object.keys(m).sort().map((k) => [k, m[k]]));
  };
  if (o.disabled?.length) out.disabled = [...new Set(o.disabled)].sort();
  const sev = sortObj(o.severity); if (sev) out.severity = sev;
  const par = sortObj(o.params); if (par) out.params = par;
  const sql = sortObj(o.sql); if (sql) out.sql = sql;
  if (o.customRules?.length) out.customRules = [...o.customRules].sort((a, b) => a.id.localeCompare(b.id));
  if (o.customSql?.length) out.customSql = [...o.customSql].sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

// ------------------------------------------------------------------ 검증
const err = (m: string): never => { throw new Error(m); };

/**
 * 관리자가 쓰는 SQL 의 안전 점검. 규칙 SQL 은 위반 행을 돌려주는 SELECT 하나여야 한다.
 * 데이터를 바꾸거나 파일·확장을 건드리는 문장은 막는다 (관리자라도 규칙 편집 화면에서 쓸 일이 아니다).
 */
export function checkSql(sql: string): string | null {
  if (typeof sql !== "string" || !sql.trim()) return "SQL 이 비어 있습니다.";
  if (sql.length > 20000) return "SQL 이 너무 깁니다 (20,000자 이하).";
  // 문자열 리터럴과 주석을 걷어 낸 뒤 본다
  const bare = sql.replace(/'(?:[^']|'')*'/g, "''").replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").trim();
  const body = bare.replace(/;\s*$/, "");
  if (body.includes(";")) return "문장은 하나여야 합니다 (세미콜론으로 나눈 여러 문장은 쓸 수 없습니다).";
  if (!/^(select|with)\b/i.test(body)) return "SELECT 또는 WITH 로 시작해야 합니다.";
  const bad = /\b(copy|attach|detach|install|load|export|import|pragma|create|drop|insert|update|delete|alter|call|set|truncate|read_csv|read_csv_auto|read_json|read_parquet|read_text|glob|httpfs)\b/i.exec(body);
  if (bad) return `쓸 수 없는 구문입니다: ${bad[0]}`;
  if (!/\bperson_id\b/i.test(body) || !/\brow_key\b/i.test(body) || !/\bdetail\b/i.test(body)) return "결과 컬럼 person_id, row_key, detail 이 모두 있어야 합니다.";
  return null;
}

function checkRegex(rx: unknown): string {
  if (typeof rx !== "string" || !rx.trim()) return err("정규식이 비어 있습니다.");
  if (rx.length > 500) err("정규식이 너무 깁니다 (500자 이하).");
  try { new RegExp(`^(?:${rx})`); } catch (e) { err(`정규식이 올바르지 않습니다: ${(e as Error).message}`); }
  return rx;
}

function finite(v: unknown, label: string): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "number" || !Number.isFinite(v)) return err(`${label} 은 숫자여야 합니다.`);
  return v;
}

function cleanCodes(v: unknown, label: string): string[] {
  if (!Array.isArray(v)) return err(`${label} 은 목록이어야 합니다.`);
  const codes = [...new Set(v.map((x) => String(x).trim()).filter(Boolean))];
  if (codes.length > 1000) err(`${label} 이 너무 많습니다 (1,000개 이하).`);
  if (codes.some((c) => c.length > 100)) err(`${label} 의 한 코드가 너무 깁니다 (100자 이하).`);
  return codes;
}

function checkSeverity(s: unknown): Severity {
  return SEVERITIES.includes(s as Severity) ? (s as Severity) : err("심각도는 오류(error) 또는 경고(warning) 여야 합니다.");
}

function cleanName(n: unknown): string {
  const name = typeof n === "string" ? n.trim() : "";
  if (!name) err("규칙 이름을 적어 주세요.");
  if (name.length > 120) err("규칙 이름이 너무 깁니다 (120자 이하).");
  return name;
}

/** 서식으로 만든 사용자 규칙을 검증해 정리한 값으로 돌려준다. 문제가 있으면 예외. */
export function cleanCustomRule(r: CustomRule, spec: Spec): CustomRule {
  if (!r || typeof r !== "object") err("사용자 규칙 형식이 올바르지 않습니다.");
  const name = cleanName(r.name);
  const t = spec.tables[r.table];
  if (!t) err(`알 수 없는 테이블: ${r.table}`);
  const f = t.fields.find((x) => x.name === r.field);
  if (!f) err(`${r.table} 에 ${r.field} 컬럼이 없습니다.`);
  const severity = checkSeverity(r.severity);
  if (!CUSTOM_CHECKS.includes(r.check)) err(`알 수 없는 검사 유형: ${r.check}`);
  const p = r.params ?? {};
  const desc = typeof r.desc === "string" && r.desc.trim() ? r.desc.trim().slice(0, 500) : undefined;
  const type = f!.type as string;
  const base = { id: r.id, name, table: r.table, field: r.field, check: r.check, severity, ...(desc ? { desc } : {}) };
  switch (r.check) {
    case "not_null": return { ...base, params: {} };
    case "not_future":
      if (!DATELIKE.has(type)) err(`${r.field} 은 날짜 컬럼이 아니라 '미래 날짜' 검사를 쓸 수 없습니다.`);
      return { ...base, params: {} };
    case "range": {
      if (!NUMERIC.has(type)) err(`${r.field} 은 숫자 컬럼이 아니라 '값 범위' 검사를 쓸 수 없습니다.`);
      const min = finite(p.min, "최솟값"), max = finite(p.max, "최댓값");
      if (min === undefined || max === undefined) err("최솟값과 최댓값을 모두 적어 주세요.");
      if (min! > max!) err("최솟값이 최댓값보다 클 수 없습니다.");
      return { ...base, params: { min, max } };
    }
    case "codelist": {
      const codes = cleanCodes(p.codes ?? [], "허용 코드");
      if (!codes.length) err("허용 코드를 하나 이상 적어 주세요.");
      return { ...base, params: { codes } };
    }
    case "pattern": {
      if (!TEXTUAL.has(type)) err(`${r.field} 은 문자 컬럼이 아니라 '패턴' 검사를 쓸 수 없습니다.`);
      return { ...base, params: { regex: checkRegex(p.regex) } };
    }
  }
}

/** 관리자 SQL 규칙을 검증해 정리한다 */
export function cleanCustomSql(r: CustomSqlRule, ctx: RuleContext): CustomSqlRule {
  if (!r || typeof r !== "object") err("SQL 규칙 형식이 올바르지 않습니다.");
  const name = cleanName(r.name);
  if (!SQL_CATEGORIES.includes(r.category)) err("분류는 적합성·완전성·타당성 중 하나여야 합니다.");
  const severity = checkSeverity(r.severity);
  const scope = r.scope === "all" ? "all" : Array.isArray(r.scope) && r.scope.length ? [...new Set(r.scope)] : err("적용 코호트를 고르세요.");
  if (scope !== "all") for (const c of scope) if (!ctx.cohortIds.includes(c)) err(`알 수 없는 코호트: ${c}`);
  if (!Array.isArray(r.requires) || !r.requires.length) err("필요한 테이블을 하나 이상 고르세요.");
  const requires = [...new Set(r.requires)];
  for (const t of requires) if (!ctx.spec.tables[t]) err(`알 수 없는 테이블: ${t}`);
  const sqlErr = checkSql(r.sql);
  if (sqlErr) err(sqlErr);
  const desc = typeof r.desc === "string" && r.desc.trim() ? r.desc.trim().slice(0, 500) : undefined;
  return { id: r.id, name, category: r.category, severity, scope: scope as "all" | string[], requires, sql: r.sql.trim(), ...(desc ? { desc } : {}) };
}

function cleanParamsOverride(id: string, p: RuleParamsOverride, ctx: RuleContext): RuleParamsOverride | null {
  const rule = ctx.base.structural.find((r) => r.id === id);
  if (!rule) return err(`${id}: 값을 조정할 수 있는 표준 규칙이 아닙니다.`);
  const kind = paramKindOf(rule.check);
  if (!kind) return err(`${id}: 이 검사 유형(${rule.check})은 값을 조정할 수 없습니다.`);
  const std = standardParamsOf(rule)!;
  if (kind === "range") {
    const min = finite(p.min, "최솟값"), max = finite(p.max, "최댓값");
    const effMin = min ?? std.min, effMax = max ?? std.max;
    if (effMin !== undefined && effMax !== undefined && effMin > effMax) err(`${id}: 최솟값이 최댓값보다 클 수 없습니다.`);
    const o: RuleParamsOverride = {};
    if (min !== undefined && min !== std.min) o.min = min;
    if (max !== undefined && max !== std.max) o.max = max;
    return Object.keys(o).length ? o : null;
  }
  if (kind === "pattern") {
    if (p.regex === undefined) return null;
    const rx = checkRegex(p.regex);
    return rx === std.regex ? null : { regex: rx };
  }
  const codes = p.extraCodes === undefined ? [] : cleanCodes(p.extraCodes, "추가 코드");
  return codes.length ? { extraCodes: codes } : null;
}

const nextId = (prefix: string, used: string[]): string => {
  const n = used.map((id) => Number(id.slice(prefix.length + 1))).filter((x) => Number.isInteger(x)).reduce((a, b) => Math.max(a, b), 0) + 1;
  return `${prefix}-${String(n).padStart(3, "0")}`;
};

/** 파일에서 읽었거나 가져온 설정 전체를 검증한다. 모르는 규칙 ID, 맞지 않는 값은 예외. */
export function validateOverrides(raw: unknown, ctx: RuleContext, opts: { allowSql: boolean }): RuleOverrides {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return err("규칙 설정 파일의 형식이 올바르지 않습니다.");
  const o = raw as Record<string, unknown>;
  const known = new Set(["disabled", "severity", "params", "sql", "customRules", "customSql", "schema", "exported_at", "app_version"]);
  for (const k of Object.keys(o)) if (!known.has(k)) err(`알 수 없는 항목: ${k}`);
  const ids = new Set([...ctx.base.structural.map((r) => r.id), ...ctx.base.semantic.map((r) => r.id)]);
  const out: RuleOverrides = {};
  if (o.disabled !== undefined) {
    if (!Array.isArray(o.disabled)) err("disabled 는 규칙 ID 목록이어야 합니다.");
    for (const id of o.disabled as unknown[]) if (typeof id !== "string" || !ids.has(id)) err(`꺼 둔 규칙 ID 를 알 수 없습니다: ${String(id)}`);
    out.disabled = o.disabled as string[];
  }
  if (o.severity !== undefined) {
    if (typeof o.severity !== "object" || o.severity === null || Array.isArray(o.severity)) err("severity 형식이 올바르지 않습니다.");
    out.severity = {};
    for (const [id, s] of Object.entries(o.severity as Record<string, unknown>)) {
      if (!ids.has(id)) err(`심각도를 바꾼 규칙 ID 를 알 수 없습니다: ${id}`);
      out.severity[id] = checkSeverity(s);
    }
  }
  if (o.params !== undefined) {
    if (typeof o.params !== "object" || o.params === null || Array.isArray(o.params)) err("params 형식이 올바르지 않습니다.");
    out.params = {};
    for (const [id, p] of Object.entries(o.params as Record<string, unknown>)) {
      if (!p || typeof p !== "object") err(`${id}: 값 조정 형식이 올바르지 않습니다.`);
      const c = cleanParamsOverride(id, p as RuleParamsOverride, ctx);
      if (c) out.params[id] = c;
    }
  }
  const hasSql = (o.sql && Object.keys(o.sql as object).length) || (Array.isArray(o.customSql) && o.customSql.length);
  if (hasSql && !opts.allowSql) err("SQL 규칙이 들어 있는 설정은 관리자 모드에서만 가져올 수 있습니다.");
  if (o.sql !== undefined) {
    if (typeof o.sql !== "object" || o.sql === null || Array.isArray(o.sql)) err("sql 형식이 올바르지 않습니다.");
    out.sql = {};
    const semantic = new Set(ctx.base.semantic.map((r) => r.id));
    for (const [id, sql] of Object.entries(o.sql as Record<string, unknown>)) {
      if (!semantic.has(id)) err(`SQL 을 바꿀 수 있는 표준 교차 규칙이 아닙니다: ${id}`);
      const e = checkSql(String(sql));
      if (e) err(`${id}: ${e}`);
      out.sql[id] = String(sql);
    }
  }
  if (o.customRules !== undefined) {
    if (!Array.isArray(o.customRules)) err("customRules 는 목록이어야 합니다.");
    const seen = new Set<string>();
    out.customRules = (o.customRules as CustomRule[]).map((r) => {
      if (!/^USR-\d{3,}$/.test(String(r?.id))) err(`사용자 규칙 ID 형식이 올바르지 않습니다: ${String(r?.id)}`);
      if (seen.has(r.id)) err(`사용자 규칙 ID 가 겹칩니다: ${r.id}`);
      seen.add(r.id);
      return cleanCustomRule(r, ctx.spec);
    });
  }
  if (o.customSql !== undefined) {
    if (!Array.isArray(o.customSql)) err("customSql 은 목록이어야 합니다.");
    const seen = new Set<string>();
    out.customSql = (o.customSql as CustomSqlRule[]).map((r) => {
      if (!/^ADM-\d{3,}$/.test(String(r?.id))) err(`SQL 규칙 ID 형식이 올바르지 않습니다: ${String(r?.id)}`);
      if (seen.has(r.id)) err(`SQL 규칙 ID 가 겹칩니다: ${r.id}`);
      seen.add(r.id);
      return cleanCustomSql(r, ctx);
    });
  }
  return normalizeOverrides(out);
}

// ------------------------------------------------------------------ 변경 적용
export type HistoryDraft = Omit<RuleHistoryEntry, "ts" | "admin_mode">;

/** 규칙 하나의 지금 설정을 이력에 적을 모양으로 (없는 부분은 적지 않는다) */
function ruleState(views: RuleInfo[], id: string): Record<string, unknown> | null {
  const v = views.find((x) => x.id === id);
  if (!v) return null;
  if (v.origin === "custom" || (v.origin === "admin" && v.subcategory === "admin")) return { name: v.name, severity: v.severity, check: v.check, table: v.table, fields: v.fields, params: v.params, sql: v.sql, desc: v.desc };
  return { disabled: v.disabled, severity: v.severity, ...(v.params ? { params: v.params } : {}), ...(v.kind === "semantic" ? { sql: v.sql } : {}) };
}

/**
 * 설정 하나를 바꾼다. 새 설정과 이력 초안을 돌려준다. 입력 설정은 건드리지 않는다.
 * SQL 을 고치는 동작은 관리자 모드에서만 허용한다.
 */
export function applyChange(ctx: RuleContext, cur: RuleOverrides, ch: RuleChange, adminMode: boolean): { overrides: RuleOverrides; history: HistoryDraft[] } {
  const next: RuleOverrides = JSON.parse(JSON.stringify(cur));
  const before = buildRuleViews(ctx.base, cur);
  const hist: HistoryDraft[] = [];
  const stdIds = new Set([...ctx.base.structural.map((r) => r.id), ...ctx.base.semantic.map((r) => r.id)]);
  const needStd = (id: string) => { if (!stdIds.has(id)) err(`표준 규칙이 아닙니다: ${id}`); };
  const needAdmin = () => { if (!adminMode) err("SQL 규칙은 관리자 모드에서만 고칠 수 있습니다. 설정에서 관리자 모드를 켜세요."); };
  const record = (action: string, id: string, b: unknown, a: unknown) => hist.push({ action, rule_id: id, before: b, after: a });
  const after = () => buildRuleViews(ctx.base, next);

  switch (ch.op) {
    case "disable": {
      needStd(ch.id);
      const set = new Set(next.disabled ?? []);
      if (ch.disabled) set.add(ch.id); else set.delete(ch.id);
      next.disabled = [...set];
      record(ch.disabled ? "disable" : "enable", ch.id, { disabled: !ch.disabled }, { disabled: ch.disabled });
      break;
    }
    case "severity": {
      needStd(ch.id);
      const std = [...ctx.base.structural, ...ctx.base.semantic].find((r) => r.id === ch.id)!.severity;
      const sev = ch.severity === null ? std : checkSeverity(ch.severity);
      next.severity = { ...(next.severity ?? {}) };
      if (sev === std) delete next.severity[ch.id]; else next.severity[ch.id] = sev;
      record("severity", ch.id, { severity: before.find((v) => v.id === ch.id)!.severity }, { severity: sev });
      break;
    }
    case "params": {
      needStd(ch.id);
      const c = ch.params === null ? null : cleanParamsOverride(ch.id, ch.params, ctx);
      next.params = { ...(next.params ?? {}) };
      if (c) next.params[ch.id] = c; else delete next.params[ch.id];
      record("params", ch.id, { params: before.find((v) => v.id === ch.id)!.params }, { params: after().find((v) => v.id === ch.id)!.params });
      break;
    }
    case "sql": {
      needAdmin(); needStd(ch.id);
      const rule = ctx.base.semantic.find((r) => r.id === ch.id);
      if (!rule) err(`SQL 을 바꿀 수 있는 표준 교차 규칙이 아닙니다: ${ch.id}`);
      const prev = before.find((v) => v.id === ch.id)!.sql;
      next.sql = { ...(next.sql ?? {}) };
      if (ch.sql === null || ch.sql.trim() === rule!.sql.trim()) delete next.sql[ch.id];
      else { const e = checkSql(ch.sql); if (e) err(e); next.sql[ch.id] = ch.sql.trim(); }
      record("sql", ch.id, { sql: prev }, { sql: after().find((v) => v.id === ch.id)!.sql });
      break;
    }
    case "addCustom": {
      const id = nextId("USR", (cur.customRules ?? []).map((r) => r.id));
      const rule = cleanCustomRule({ ...ch.rule, id }, ctx.spec);
      next.customRules = [...(next.customRules ?? []), rule];
      record("add_custom", id, null, ruleState(after(), id));
      break;
    }
    case "updateCustom": {
      const i = (cur.customRules ?? []).findIndex((r) => r.id === ch.rule.id);
      if (i < 0) err(`사용자 규칙이 없습니다: ${ch.rule.id}`);
      next.customRules = [...cur.customRules!];
      next.customRules[i] = cleanCustomRule(ch.rule, ctx.spec);
      record("update_custom", ch.rule.id, ruleState(before, ch.rule.id), ruleState(after(), ch.rule.id));
      break;
    }
    case "removeCustom": {
      if (!(cur.customRules ?? []).some((r) => r.id === ch.id)) err(`사용자 규칙이 없습니다: ${ch.id}`);
      next.customRules = cur.customRules!.filter((r) => r.id !== ch.id);
      record("remove_custom", ch.id, ruleState(before, ch.id), null);
      break;
    }
    case "addSql": {
      needAdmin();
      const id = nextId("ADM", (cur.customSql ?? []).map((r) => r.id));
      const rule = cleanCustomSql({ ...ch.rule, id }, ctx);
      next.customSql = [...(next.customSql ?? []), rule];
      record("add_sql", id, null, ruleState(after(), id));
      break;
    }
    case "updateSql": {
      needAdmin();
      const i = (cur.customSql ?? []).findIndex((r) => r.id === ch.rule.id);
      if (i < 0) err(`SQL 규칙이 없습니다: ${ch.rule.id}`);
      next.customSql = [...cur.customSql!];
      next.customSql[i] = cleanCustomSql(ch.rule, ctx);
      record("update_sql", ch.rule.id, ruleState(before, ch.rule.id), ruleState(after(), ch.rule.id));
      break;
    }
    case "removeSql": {
      needAdmin();
      if (!(cur.customSql ?? []).some((r) => r.id === ch.id)) err(`SQL 규칙이 없습니다: ${ch.id}`);
      next.customSql = cur.customSql!.filter((r) => r.id !== ch.id);
      record("remove_sql", ch.id, ruleState(before, ch.id), null);
      break;
    }
    case "resetRule": {
      if (!stdIds.has(ch.id)) err(`표준 규칙이 아닙니다: ${ch.id}`);
      const b = ruleState(before, ch.id);
      next.disabled = (next.disabled ?? []).filter((x) => x !== ch.id);
      for (const k of ["severity", "params", "sql"] as const) if (next[k]) { next[k] = { ...next[k] } as never; delete (next[k] as Record<string, unknown>)[ch.id]; }
      record("reset_rule", ch.id, b, ruleState(after(), ch.id));
      break;
    }
    case "resetAll": {
      for (const v of before) if (v.origin !== "standard") hist.push({ action: "reset_all", rule_id: v.id, before: ruleState(before, v.id), after: v.origin === "custom" || v.subcategory === "admin" ? null : ruleState(buildRuleViews(ctx.base, {}), v.id) });
      if (!hist.length) hist.push({ action: "reset_all", rule_id: "", before: null, after: null });
      return { overrides: {}, history: hist };
    }
  }
  const norm = normalizeOverrides(next);
  // 아무것도 달라지지 않았으면(같은 값으로 저장) 이력에 남기지 않는다
  return { overrides: norm, history: JSON.stringify(norm) === JSON.stringify(normalizeOverrides(cur)) ? [] : hist };
}

// ------------------------------------------------------------------ 제출용 기록
/** submission.json 의 rule_set: 이 실행에 표준이 아닌 규칙이 있었는지를 중앙이 알 수 있게 한다 */
export interface RuleSetInfo {
  standard_hash: string;
  effective_hash: string;
  admin_mode: boolean;
  /** 관리자 출처 규칙(표준 교차 규칙의 SQL 교체 또는 ADM-###)이 하나라도 있으면 true. 관리자 모드를 켰다는 사실만으로는 true 가 아니다. */
  admin_modified: boolean;
  disabled: string[];
  modified: { rule_id: string; change: string }[];
  custom: string[];
  admin: string[];
}

export function buildRuleSetInfo(o: RuleOverrides, adminMode: boolean, hashes: { standard: string; effective: string }, changes: { rule_id: string; origin: RuleOrigin; change: string }[]): RuleSetInfo {
  const admin = [...Object.keys(o.sql ?? {}), ...(o.customSql ?? []).map((r) => r.id)].sort();
  return {
    standard_hash: hashes.standard, effective_hash: hashes.effective, admin_mode: adminMode, admin_modified: admin.length > 0,
    disabled: [...(o.disabled ?? [])].sort(),
    modified: changes.filter((c) => c.origin === "modified").map((c) => ({ rule_id: c.rule_id, change: c.change })),
    custom: (o.customRules ?? []).map((r) => r.id).sort(), admin,
  };
}

// ------------------------------------------------------------------ 저장 · 이력
export function loadOverrides(dir: string, ctx: RuleContext): RuleOverrides {
  const p = path.join(dir, OVERRIDES_FILE);
  if (!fs.existsSync(p)) return {};
  // 저장된 파일이 깨졌거나 규칙이 바뀌어 맞지 않으면, 조용히 쓰지 않고 예외로 알려 준다 (잘못된 설정으로 검증하지 않는다)
  try { return validateOverrides(JSON.parse(fs.readFileSync(p, "utf-8")), ctx, { allowSql: true }); }
  catch (e) { throw new Error(`규칙 설정 파일(${p})을 읽을 수 없습니다: ${(e as Error).message}`); }
}

export function saveOverrides(dir: string, o: RuleOverrides): void {
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, OVERRIDES_FILE);
  if (isEmptyOverrides(o)) { fs.rmSync(p, { force: true }); return; }
  fs.writeFileSync(p, JSON.stringify(o, null, 2) + "\n", "utf-8");
}

export function appendHistory(dir: string, entries: HistoryDraft[], adminMode: boolean, now = new Date()): void {
  if (!entries.length) return;
  fs.mkdirSync(dir, { recursive: true });
  const ts = now.toISOString();
  fs.appendFileSync(path.join(dir, HISTORY_FILE), entries.map((e) => JSON.stringify({ ts, action: e.action, rule_id: e.rule_id, before: e.before, after: e.after, admin_mode: adminMode })).join("\n") + "\n", "utf-8");
}

/** 최근 이력부터 (최대 limit 줄) */
export function readHistory(dir: string, limit = 500): RuleHistoryEntry[] {
  const p = path.join(dir, HISTORY_FILE);
  if (!fs.existsSync(p)) return [];
  const out: RuleHistoryEntry[] = [];
  for (const line of fs.readFileSync(p, "utf-8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line) as RuleHistoryEntry); } catch { /* 깨진 줄은 건너뛴다 */ }
  }
  return out.slice(-limit).reverse();
}
