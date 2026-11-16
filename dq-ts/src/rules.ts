// 규칙 묶음 구성: 표준 규칙 + 사용자 조정(RuleOverrides) → 실제로 쓰는 규칙(effectiveRules)
import { createHash } from "node:crypto";
import { loadSpec, loadStructuralRules, loadSemanticRules, loadCodelists, loadConcepts, loadProfiles } from "./load.js";
import type { Spec, CustomRule, CustomSqlRule, RuleOrigin, RuleOverrides, SemanticRule, Severity, StructuralRule } from "./types.js";

export const CUSTOM_ID_RE = /^USR-\d{3}$/;
export const ADMIN_ID_RE = /^ADM-\d{3}$/;
const SEVERITIES: Severity[] = ["error", "warning"];
const CUSTOM_CHECKS = ["not_null", "range", "codelist", "pattern", "not_future"];
const CATEGORIES = ["Conformance", "Completeness", "Plausibility"];

export interface EffectiveRules { structural: StructuralRule[]; semantic: SemanticRule[] }

export function isEmptyOverrides(o?: RuleOverrides): boolean {
  if (!o) return true;
  return !(o.disabled?.length || Object.keys(o.severity ?? {}).length || Object.keys(o.params ?? {}).length
    || Object.keys(o.sql ?? {}).length || o.customRules?.length || o.customSql?.length);
}

function fail(msg: string): never { throw new Error(`규칙 설정 오류: ${msg}`); }

function isNum(v: unknown): v is number { return typeof v === "number" && Number.isFinite(v); }

function checkRegex(id: string, rx: unknown): void {
  if (typeof rx !== "string" || rx === "") fail(`${id}: regex 는 비어 있지 않은 문자열이어야 한다`);
  try { new RegExp(`^(?:${rx})`); } catch (e) { fail(`${id}: regex 가 올바르지 않다 (${(e as Error).message})`); }
}

/** 사용자 규칙(수준 3)을 구조 규칙 형태로 바꾼다. 실행은 표준 구조 검사기가 그대로 맡는다. */
function customToStructural(c: CustomRule): StructuralRule {
  const category = c.check === "not_null" ? "Completeness" : c.check === "range" || c.check === "not_future" ? "Plausibility" : "Conformance";
  const subcategory = c.check === "range" ? "atemporal" : c.check === "not_future" ? "temporal" : "value";
  const params: Record<string, unknown> = {};
  if (c.check === "range") { params.min = c.params.min; params.max = c.params.max; }
  if (c.check === "codelist") { params.codelist = `사용자:${c.id}`; params.extraCodes = c.params.codes; }
  if (c.check === "pattern") params.regex = c.params.regex;
  return {
    id: c.id, name: c.name, category, subcategory, table: c.table, fields: [c.field], severity: c.severity,
    check: c.check, params, desc: c.desc, scope: "all", origin: "custom",
  };
}

function validateCustom(c: CustomRule, spec: Spec): void {
  if (!CUSTOM_ID_RE.test(String(c.id))) fail(`사용자 규칙 id 는 USR-000 형식이어야 한다: ${c.id}`);
  if (!c.name) fail(`${c.id}: name 이 비어 있다`);
  if (!SEVERITIES.includes(c.severity)) fail(`${c.id}: severity 는 error|warning`);
  if (!CUSTOM_CHECKS.includes(c.check)) fail(`${c.id}: 알 수 없는 검사 유형 ${c.check}`);
  const t = spec.tables[c.table];
  if (!t) fail(`${c.id}: 명세에 없는 테이블 ${c.table}`);
  if (!t.fields.some((f) => f.name === c.field)) fail(`${c.id}: ${c.table} 에 없는 컬럼 ${c.field}`);
  const p = c.params ?? {};
  if (c.check === "range") {
    if (!isNum(p.min) || !isNum(p.max)) fail(`${c.id}: range 는 숫자 min, max 가 필요하다`);
    if (p.min > p.max) fail(`${c.id}: min 이 max 보다 클 수 없다`);
  } else if (c.check === "codelist") {
    if (!Array.isArray(p.codes) || !p.codes.length) fail(`${c.id}: codelist 는 codes 가 필요하다`);
  } else if (c.check === "pattern") checkRegex(c.id, p.regex);
}

function validateSql(c: CustomSqlRule, spec: Spec): void {
  if (!ADMIN_ID_RE.test(String(c.id))) fail(`관리자 규칙 id 는 ADM-000 형식이어야 한다: ${c.id}`);
  if (!c.name) fail(`${c.id}: name 이 비어 있다`);
  if (!CATEGORIES.includes(c.category)) fail(`${c.id}: 알 수 없는 category ${c.category}`);
  if (!SEVERITIES.includes(c.severity)) fail(`${c.id}: severity 는 error|warning`);
  if (typeof c.sql !== "string" || !c.sql.trim()) fail(`${c.id}: sql 이 비어 있다`);
  if (c.scope !== "all" && !Array.isArray(c.scope)) fail(`${c.id}: scope 는 "all" 또는 코호트 목록`);
  for (const t of c.requires ?? []) if (!spec.tables[t]) fail(`${c.id}: requires 에 명세에 없는 테이블 ${t}`);
}

/**
 * 표준 규칙에 사용자 조정을 입혀 실제로 쓸 규칙 묶음을 만든다. 입력은 엄격하게 검증하며
 * 알 수 없는 규칙 id, 맞지 않는 params, 잘못된 id 형식은 Error 로 알린다.
 * 사용자 규칙(수준 3)은 구조 규칙 뒤에, 관리자 SQL 규칙(수준 4)은 교차 규칙 뒤에 붙는다.
 */
export function effectiveRules(overrides?: RuleOverrides): EffectiveRules {
  const structural = loadStructuralRules();
  const semantic = loadSemanticRules();
  const o = overrides ?? {};
  const sById = new Map(structural.map((r) => [r.id, r]));
  const mById = new Map(semantic.map((r) => [r.id, r]));
  const find = (id: string, where: string): StructuralRule | SemanticRule => {
    const r = sById.get(id) ?? mById.get(id);
    if (!r) fail(`${where}: 알 수 없는 규칙 id ${id}`);
    return r;
  };
  const mark = (r: StructuralRule | SemanticRule, origin: RuleOrigin) => {
    if (r.origin === "standard" || origin === "admin") r.origin = origin;
  };

  for (const id of o.disabled ?? []) { const r = find(id, "disabled"); r.disabled = true; mark(r, "modified"); }
  for (const [id, sev] of Object.entries(o.severity ?? {})) {
    const r = find(id, "severity");
    if (!SEVERITIES.includes(sev)) fail(`severity ${id}: error|warning 만 쓸 수 있다 (${sev})`);
    r.severity = sev; mark(r, "modified");
  }
  for (const [id, po] of Object.entries(o.params ?? {})) {
    const r = sById.get(id);
    if (!r) fail(mById.has(id) ? `params ${id}: 교차 규칙은 params 를 쓰지 않는다(sql 로 교체)` : `params: 알 수 없는 규칙 id ${id}`);
    const keys = Object.keys(po).filter((k) => (po as Record<string, unknown>)[k] !== undefined);
    const allowed: Record<string, string[]> = { range: ["min", "max"], pattern: ["regex"], codelist: ["extraCodes"] };
    const ok = allowed[r.check] ?? [];
    for (const k of keys) if (!ok.includes(k)) fail(`params ${id}: ${r.check} 규칙에는 ${k} 를 줄 수 없다`);
    if (!keys.length) fail(`params ${id}: 바꿀 값이 없다`);
    if (r.check === "range") {
      for (const k of ["min", "max"] as const) {
        const v = po[k];
        if (v === undefined) continue;
        if (!isNum(v)) fail(`params ${id}: ${k} 는 숫자여야 한다`);
        r.params[k] = v;
        r.paramText = { ...r.paramText, [k]: String(v) };
      }
      if (r.params.min > r.params.max) fail(`params ${id}: min 이 max 보다 클 수 없다`);
    } else if (r.check === "pattern") {
      checkRegex(id, po.regex); r.params.regex = po.regex;
    } else {
      const ec = po.extraCodes;
      if (!Array.isArray(ec) || ec.some((c) => typeof c !== "string" || c === "")) fail(`params ${id}: extraCodes 는 비어 있지 않은 문자열 배열이어야 한다`);
      r.params.extraCodes = [...new Set(ec)];
    }
    mark(r, "modified");
  }
  for (const [id, sql] of Object.entries(o.sql ?? {})) {
    const r = mById.get(id);
    if (!r) fail(sById.has(id) ? `sql ${id}: 구조 규칙의 SQL 은 교체할 수 없다` : `sql: 알 수 없는 교차 규칙 id ${id}`);
    if (typeof sql !== "string" || !sql.trim()) fail(`sql ${id}: SQL 이 비어 있다`);
    r.sql = sql; mark(r, "admin");
  }

  const spec = loadSpec();
  const seen = new Set<string>();
  for (const c of o.customRules ?? []) {
    validateCustom(c, spec);
    if (seen.has(c.id)) fail(`id 중복: ${c.id}`);
    seen.add(c.id);
    structural.push(customToStructural(c));
  }
  for (const c of o.customSql ?? []) {
    validateSql(c, spec);
    if (seen.has(c.id)) fail(`id 중복: ${c.id}`);
    seen.add(c.id);
    semantic.push({
      id: c.id, name: c.name, category: c.category, severity: c.severity, scope: c.scope, requires: [...(c.requires ?? [])],
      desc: c.desc, sql: c.sql, origin: "admin",
    });
  }
  return { structural, semantic };
}

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => [k, canonical((v as Record<string, unknown>)[k])]));
  }
  return v;
}

/** 해시 형식 표지. 해시에 들어가는 입력의 구성이 바뀌면 올린다. */
export const RULESET_HASH_FORMAT = "kai-ruleset-hash/2";

/** 설명 문구(desc/description)는 동작에 영향이 없으므로 해시에서 뺀다 */
function stripDesc(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripDesc);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>)
      .filter(([k]) => k !== "desc" && k !== "description").map(([k, x]) => [k, stripDesc(x)]));
  }
  return v;
}

/** 판정 동작에 영향을 주는 모든 입력(실제 규칙 + 명세 + 코드표 값 + concept + 프로파일)의 SHA-256. 같은 설정이면 언제나 같은 값이다. */
export function ruleSetHash(overrides?: RuleOverrides): string {
  const eff = effectiveRules(overrides);
  const strip = <T extends { paramText?: unknown; desc?: string }>({ paramText: _p, desc: _d, ...r }: T) => r;
  const codelists = Object.fromEntries([...loadCodelists().entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, set]) => [name, [...set].sort()]));
  const body = canonical({
    format: RULESET_HASH_FORMAT,
    rules: { structural: eff.structural.map(strip), semantic: eff.semantic.map(strip) },
    spec: stripDesc(loadSpec()),
    codelists,
    concepts: stripDesc(loadConcepts()),
    profiles: stripDesc(loadProfiles()),
  });
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

const SEV_KOR: Record<Severity, string> = { error: "오류(error)", warning: "경고(warning)" };

/** 사용자 조정을 사람이 읽을 수 있는 목록으로 (로그와 report.md 의 `## 규칙 설정` 표에 쓴다) */
export function describeOverrides(overrides?: RuleOverrides): Array<{ rule_id: string; origin: RuleOrigin; change: string }> {
  const o = overrides ?? {};
  const base = new Map<string, StructuralRule | SemanticRule>();
  for (const r of [...loadStructuralRules(), ...loadSemanticRules()]) base.set(r.id, r);
  const out: Array<{ rule_id: string; origin: RuleOrigin; change: string }> = [];
  for (const id of o.disabled ?? []) out.push({ rule_id: id, origin: "modified", change: "규칙을 끔" });
  for (const [id, sev] of Object.entries(o.severity ?? {})) {
    const b = base.get(id);
    out.push({ rule_id: id, origin: "modified", change: `심각도 ${b ? SEV_KOR[b.severity] : "?"} → ${SEV_KOR[sev]}` });
  }
  for (const [id, p] of Object.entries(o.params ?? {})) {
    const b = base.get(id) as StructuralRule | undefined;
    const parts: string[] = [];
    if (p.min !== undefined) parts.push(`최솟값 ${b?.params?.min ?? "?"} → ${p.min}`);
    if (p.max !== undefined) parts.push(`최댓값 ${b?.params?.max ?? "?"} → ${p.max}`);
    if (p.regex !== undefined) parts.push(`패턴 → ${p.regex}`);
    if (p.extraCodes !== undefined) parts.push(`허용 코드 추가: ${p.extraCodes.join(", ")}`);
    out.push({ rule_id: id, origin: "modified", change: parts.join("; ") });
  }
  for (const id of Object.keys(o.sql ?? {})) out.push({ rule_id: id, origin: "admin", change: "SQL 교체" });
  for (const c of o.customRules ?? []) {
    out.push({ rule_id: c.id, origin: "custom", change: `사용자 규칙 추가: ${c.table}.${c.field} ${c.check} (${c.severity})` });
  }
  for (const c of o.customSql ?? []) {
    out.push({ rule_id: c.id, origin: "admin", change: `SQL 규칙 추가: ${c.name} (${c.severity})` });
  }
  return out;
}
