// 검증 기준(criteria) 꾸러미: 명세 + 규칙 YAML 7개를 manifest.json 과 함께 ZIP 한 개로 주고받는다.
// Electron 없이 도는 순수 부분이다 — 점검(inspect), 만들기(create), 가져오기 준비(stage).
// 이 모듈은 활성 설정이나 규칙 덧씌우기(overrides)를 절대 바꾸지 않는다. 활성화·저장은 호출자(config)가 맡는다.
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { unzipSync, zipSync } from "fflate";
import { parseDocument } from "yaml";
import { getRoot, setRoot, loadSpec, loadProfiles, loadStructuralRules, loadSemanticRules, loadCodelists, loadConcepts } from "@engine/index.js";
import type { Spec, SpecField, StructuralRule, SemanticRule, Concepts, CohortProfile } from "@engine/types.js";
import type { RuleOverrides } from "@shared/types";
import { CRITERIA_FILES } from "@shared/criteria";
import type { CriteriaManifest, CriteriaInfo, CriteriaPreview } from "@shared/criteria";
import { checkSql, isEmptyOverrides, validateOverrides } from "./ruleset";
import type { RuleContext } from "./ruleset";

// ------------------------------------------------------------------ 한도
export const MAX_ZIP_BYTES = 25 * 1024 * 1024;
export const MAX_EXPANDED_BYTES = 50 * 1024 * 1024;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_ZIP_ENTRIES = 32;
const MAX_ALIASES = 200;
const MAX_LIST = 300; // 변경·충돌 목록 길이 상한
const MANIFEST_FILE = "manifest.json";
const SCHEMA = "kai-criteria/1" as const;
const FILE_SET = new Set<string>(CRITERIA_FILES);
const ALLOWED_DIRS = new Set(["spec/", "rules/"]);

export const BUILTIN_MANIFEST: Omit<CriteriaManifest, "files"> = {
  schema: SCHEMA, name: "K-AIPA DQ 기본 기준", version: "1.0.3", manual: "2026-11-16", publisher: "K-AI 코호트 구축 TF", minAppVersion: "1.0.3",
};

const fail = (m: string): never => { throw new Error(m); };
const sha256 = (b: Uint8Array | string): string => createHash("sha256").update(b).digest("hex");
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// ------------------------------------------------------------------ 버전
const SEMVER = /^(\d{1,9})\.(\d{1,9})\.(\d{1,9})(?:-([0-9A-Za-z.-]{1,40}))?$/;

function parseSemver(v: string, label: string): { n: number[]; pre?: string } {
  const m = SEMVER.exec(v);
  if (!m) return fail(`${label} 버전 형식이 올바르지 않습니다 (예: 1.0.1): ${v}`);
  return { n: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] };
}

/** a<b 이면 음수. 사전 배포 표기(-beta)는 같은 번호의 정식보다 낮다 */
export function compareSemver(a: string, b: string): number {
  const x = parseSemver(a, "비교"), y = parseSemver(b, "비교");
  for (let i = 0; i < 3; i++) if (x.n[i] !== y.n[i]) return x.n[i] - y.n[i];
  if (x.pre === y.pre) return 0;
  if (x.pre === undefined) return 1;
  if (y.pre === undefined) return -1;
  return x.pre < y.pre ? -1 : 1;
}

// ------------------------------------------------------------------ 엔진 루트 (전역 setRoot 는 반드시 되돌린다)
function withRoot<T>(root: string, fn: () => T): T {
  const prev = getRoot();
  setRoot(root);
  try { return fn(); } finally { setRoot(prev); }
}

// ------------------------------------------------------------------ 파일 읽기
function readRegular(root: string, rel: string, max: number): Uint8Array {
  const p = path.join(root, rel);
  let st: fs.Stats;
  try { st = fs.lstatSync(p); } catch { return fail(`기준 파일이 없습니다: ${rel}`); }
  if (st.isSymbolicLink()) fail(`기준 파일이 심볼릭 링크입니다: ${rel}`);
  if (!st.isFile()) fail(`기준 파일이 일반 파일이 아닙니다: ${rel}`);
  if (st.size > max) fail(`기준 파일이 너무 큽니다 (${rel}, 최대 ${max} 바이트)`);
  const buf = fs.readFileSync(p);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

function readCriteriaFiles(root: string): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  let total = 0;
  for (const rel of CRITERIA_FILES) {
    const b = readRegular(root, rel, MAX_FILE_BYTES);
    total += b.length;
    if (total > MAX_EXPANDED_BYTES) fail("기준 파일 전체 크기가 한도를 넘었습니다.");
    out.set(rel, b);
  }
  return out;
}

function hashOf(files: Record<string, string>): string {
  return sha256(CRITERIA_FILES.map((f) => `${f}\t${files[f]}\n`).join(""));
}

function fileHashes(files: Map<string, Uint8Array>): Record<string, string> {
  const o: Record<string, string> = {};
  for (const f of CRITERIA_FILES) o[f] = sha256(files.get(f)!);
  return o;
}

// ------------------------------------------------------------------ manifest
function cleanText(v: unknown, label: string, max: number): string {
  if (typeof v !== "string" || !v.trim()) return fail(`manifest.${label} 는 비어 있지 않은 문자열이어야 합니다.`);
  if (v.length > max || /[\u0000-\u001f\u007f]/.test(v)) return fail(`manifest.${label} 값이 올바르지 않습니다.`);
  return v;
}

function checkMeta(m: unknown): Omit<CriteriaManifest, "schema" | "files"> {
  if (!isObj(m)) return fail("manifest 형식이 올바르지 않습니다.");
  const name = cleanText(m.name, "name", 100), manual = cleanText(m.manual, "manual", 100), publisher = cleanText(m.publisher, "publisher", 100);
  const version = cleanText(m.version, "version", 40), minAppVersion = cleanText(m.minAppVersion, "minAppVersion", 40);
  parseSemver(version, "기준"); parseSemver(minAppVersion, "minAppVersion");
  return { name, version, manual, publisher, minAppVersion };
}

function parseManifest(bytes: Uint8Array): CriteriaManifest {
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return fail("manifest.json 을 읽을 수 없습니다 (JSON 형식 오류)."); }
  if (!isObj(raw)) return fail("manifest.json 형식이 올바르지 않습니다.");
  const keys = new Set(["schema", "name", "version", "manual", "publisher", "minAppVersion", "files"]);
  for (const k of Object.keys(raw)) if (!keys.has(k)) fail(`manifest.json 에 알 수 없는 항목이 있습니다: ${k}`);
  if (raw.schema !== SCHEMA) fail(`지원하지 않는 기준 꾸러미 형식입니다: ${String(raw.schema)} (필요: ${SCHEMA})`);
  const meta = checkMeta(raw);
  if (!isObj(raw.files)) return fail("manifest.files 형식이 올바르지 않습니다.");
  for (const k of Object.keys(raw.files)) if (!FILE_SET.has(k)) fail(`manifest.files 에 알 수 없는 파일이 있습니다: ${k}`);
  const files: Record<string, string> = {};
  for (const f of CRITERIA_FILES) {
    const h = raw.files[f];
    if (typeof h !== "string" || !/^[0-9a-f]{64}$/.test(h)) fail(`manifest.files 의 해시가 올바르지 않습니다: ${f}`);
    files[f] = h;
  }
  return { schema: SCHEMA, ...meta, files };
}

// ------------------------------------------------------------------ YAML 엄격 점검 + 엔진 로드
const utf8 = new TextDecoder("utf-8", { fatal: true });

function strictYaml(rel: string, bytes: Uint8Array): unknown {
  let text: string;
  try { text = utf8.decode(bytes); } catch { return fail(`${rel}: UTF-8 텍스트가 아닙니다.`); }
  if (text.includes("\u0000")) fail(`${rel}: 널 문자가 들어 있습니다.`);
  const doc = parseDocument(text, { uniqueKeys: true });
  if (doc.errors.length) fail(`${rel}: YAML 오류 — ${doc.errors[0].message.split("\n")[0]}`);
  if (doc.warnings.length) fail(`${rel}: YAML 경고 — ${doc.warnings[0].message.split("\n")[0]}`);
  try { return doc.toJS({ maxAliasCount: MAX_ALIASES }); } catch (e) { return fail(`${rel}: YAML 별칭이 너무 많거나 올바르지 않습니다 (${(e as Error).message})`); }
}

interface Loaded {
  spec: Spec; profiles: Record<string, CohortProfile>; structural: StructuralRule[]; semantic: SemanticRule[];
  codelists: Map<string, Set<string>>; concepts: Concepts; constraints: unknown;
}

/** 파일 7개가 다 있는 디렉터리에서 엔진 로더로 읽는다 (구조 점검 전이라 형식이 틀리면 예외) */
function loadAll(root: string, files: Map<string, Uint8Array>): Loaded {
  const docs = new Map<string, unknown>();
  for (const rel of CRITERIA_FILES) docs.set(rel, strictYaml(rel, files.get(rel)!));
  try {
    return withRoot(root, () => ({
      spec: loadSpec(), profiles: loadProfiles(), structural: loadStructuralRules(), semantic: loadSemanticRules(),
      codelists: loadCodelists(), concepts: loadConcepts(), constraints: docs.get("spec/constraints.yaml"),
    }));
  } catch (e) {
    return fail(`기준 파일 구조가 올바르지 않습니다: ${(e as Error).message}`);
  }
}

// ------------------------------------------------------------------ 내용 검증
const FIELD_TYPES = new Set(["integer", "bigint", "float", "varchar", "text", "date", "timestamp"]);
const SEVERITIES = new Set(["error", "warning"]);
const CATEGORIES = new Set(["Conformance", "Completeness", "Plausibility"]);
const STRUCT_CHECKS = new Set(["table_present", "columns", "extra_columns", "pk_unique", "not_null", "type", "fk", "codelist", "range", "pattern", "not_future", "must_be_null", "concept"]);
const ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

function regexOk(rx: unknown): boolean {
  if (typeof rx !== "string" || !rx) return false;
  try { new RegExp(`^(?:${rx})`); return true; } catch { return false; }
}

function checkSpec(L: Loaded, errs: string[]): void {
  const tables = L.spec?.tables;
  if (!isObj(tables) || !Object.keys(tables).length) { errs.push("spec: tables 가 비어 있습니다."); return; }
  for (const [key, t] of Object.entries(tables)) {
    if (!isObj(t) || t.name !== key) { errs.push(`spec: 테이블 ${key} 의 name 이 키와 다릅니다.`); continue; }
    if (!IDENT_RE.test(key)) errs.push(`spec: 테이블 이름이 올바르지 않습니다: ${key}`);
    if (typeof t.kor !== "string" || typeof t.category !== "string") errs.push(`spec: ${key} 의 kor/category 가 필요합니다.`);
    if (t.optional !== undefined && typeof t.optional !== "boolean") errs.push(`spec: ${key} 의 optional 은 true/false 여야 합니다.`);
    if (!Array.isArray(t.fields) || !t.fields.length) { errs.push(`spec: ${key} 에 필드가 없습니다.`); continue; }
    const names = new Set<string>();
    for (const f of t.fields as SpecField[]) {
      const at = `${key}.${String(f?.name)}`;
      if (!isObj(f) || typeof f.name !== "string" || !IDENT_RE.test(f.name)) { errs.push(`spec: ${key} 의 필드 이름이 올바르지 않습니다.`); continue; }
      if (names.has(f.name)) errs.push(`spec: 필드가 겹칩니다: ${at}`);
      names.add(f.name);
      if (!FIELD_TYPES.has(f.type as string)) errs.push(`spec: ${at} 의 type 이 올바르지 않습니다: ${String(f.type)}`);
      if (typeof f.required !== "boolean") errs.push(`spec: ${at} 의 required 는 true/false 여야 합니다.`);
      const key2 = f.key as unknown;
      if (key2 !== undefined && key2 !== "PK" && key2 !== "FK" && key2 !== "FK_EXTERNAL") errs.push(`spec: ${at} 의 key 가 올바르지 않습니다: ${String(key2)}`);
      if (key2 === "FK") {
        const ref = String(f.ref ?? "");
        const [rt, rf] = ref.split(".");
        const target = tables[rt] as { fields?: SpecField[] } | undefined;
        if (!rt || !rf || !target?.fields?.some((x) => x.name === rf)) errs.push(`spec: ${at} 의 참조(ref)가 명세에 없습니다: ${ref || "(없음)"}`);
      }
      if (key2 === "FK_EXTERNAL" && typeof f.ref !== "string") errs.push(`spec: ${at} 의 외부 참조(ref)가 필요합니다.`);
      if (f.range !== undefined) {
        const r = f.range as unknown;
        if (!Array.isArray(r) || r.length !== 2 || !isNum(r[0]) || !isNum(r[1]) || r[0] > r[1]) errs.push(`spec: ${at} 의 range 는 [최소, 최대] 숫자여야 합니다.`);
      }
      if (f.pattern !== undefined && !regexOk(f.pattern)) errs.push(`spec: ${at} 의 pattern 이 올바르지 않습니다.`);
      if (f.codelist !== undefined && (typeof f.codelist !== "string" || !L.codelists.has(f.codelist))) errs.push(`spec: ${at} 의 코드표가 codelists 에 없습니다: ${String(f.codelist)}`);
      if (f.optional !== undefined && typeof f.optional !== "boolean") errs.push(`spec: ${at} 의 optional 은 true/false 여야 합니다.`);
      if (f.concept !== undefined) {
        const c = f.concept as Record<string, unknown>;
        const ok = isObj(c) && typeof c.standard === "boolean" && Object.keys(c).every((k) => k === "standard" || k === "domain" || k === "vocabularies")
          && (c.domain === undefined || typeof c.domain === "string")
          && (c.vocabularies === undefined || (Array.isArray(c.vocabularies) && c.vocabularies.length > 0 && c.vocabularies.every((v) => typeof v === "string")));
        if (!ok) errs.push(`spec: ${at} 의 concept 는 {standard, domain?, vocabularies?} 여야 합니다.`);
      }
    }
    const pk = (t.fields as SpecField[]).find((f) => f.name === t.pk);
    if (!pk) errs.push(`spec: ${key} 의 PK 필드가 없습니다: ${String(t.pk)}`);
    else if (!pk.required) errs.push(`spec: ${key} 의 PK ${t.pk} 는 필수(required)여야 합니다.`);
  }
}

function checkProfiles(L: Loaded, errs: string[]): void {
  if (!isObj(L.profiles) || !Object.keys(L.profiles).length) { errs.push("cohort_profiles: cohorts 가 비어 있습니다."); return; }
  for (const [id, p] of Object.entries(L.profiles)) {
    if (!ID_RE.test(id)) errs.push(`cohort_profiles: 코호트 ID 가 올바르지 않습니다: ${id}`);
    if (!isObj(p) || typeof p.kor !== "string" || !Array.isArray(p.tables) || !p.tables.length) { errs.push(`cohort_profiles: ${id} 형식이 올바르지 않습니다.`); continue; }
    for (const t of p.tables) if (!L.spec.tables?.[t]) errs.push(`cohort_profiles: ${id} 가 명세에 없는 테이블을 씁니다: ${String(t)}`);
    else if (L.spec.tables[t].optional) errs.push(`cohort_profiles: ${id} 의 tables 에 선택 테이블이 있습니다: ${String(t)} (optional_tables 에 두세요)`);
    const opt = p.optional_tables;
    if (opt !== undefined && !Array.isArray(opt)) { errs.push(`cohort_profiles: ${id} 의 optional_tables 는 목록이어야 합니다.`); continue; }
    for (const t of opt ?? []) if (!L.spec.tables?.[t]?.optional) errs.push(`cohort_profiles: ${id} 의 optional_tables 에 선택 테이블이 아닌 것이 있습니다: ${String(t)}`);
  }
}

function checkCodelistsConcepts(L: Loaded, errs: string[], rawCodelists: unknown): void {
  if (!isObj(rawCodelists)) { errs.push("codelists: 형식이 올바르지 않습니다."); return; }
  for (const [sect, v] of Object.entries(rawCodelists)) {
    if (!isObj(v)) { errs.push(`codelists: 절 ${sect} 형식이 올바르지 않습니다.`); continue; }
    for (const [name, codes] of Object.entries(v)) if (codes !== null && !isObj(codes)) errs.push(`codelists: ${sect}.${name} 는 코드 → 설명 맵이어야 합니다.`);
  }
  const c = L.concepts;
  if (!isObj(c) || !isObj(c.measurements) || !isObj(c.drugs)) { errs.push("concepts: measurements, drugs 가 필요합니다."); return; }
  for (const [id, m] of Object.entries(c.measurements)) {
    const pl = (m as { plausible?: unknown })?.plausible;
    if (!Array.isArray(pl) || pl.length !== 2 || !isNum(pl[0]) || !isNum(pl[1]) || pl[0] > pl[1]) errs.push(`concepts: measurements.${id} 의 plausible 은 [최소, 최대] 여야 합니다.`);
  }
}

/** spec 과 constraints.yaml 의 값 제약이 어긋나면 안 된다 */
function checkConstraints(L: Loaded, errs: string[]): void {
  const c = L.constraints;
  if (!isObj(c) || !isObj(c.fields)) { errs.push("constraints: fields 가 필요합니다."); return; }
  for (const [k, v] of Object.entries(c.fields as Record<string, unknown>)) {
    const [t, f] = k.split(".");
    const F = L.spec.tables?.[t]?.fields?.find((x) => x.name === f);
    if (!F || !isObj(v)) { errs.push(`constraints: 명세에 없는 필드입니다: ${k}`); continue; }
    for (const [p, val] of Object.entries(v)) {
      if (p === "range" || p === "pattern" || p === "codelist") {
        if (JSON.stringify(F[p]) !== JSON.stringify(val)) errs.push(`constraints: ${k}.${p} 가 spec 과 다릅니다.`);
      } else if (p === "fk_external") {
        if (F.key !== "FK_EXTERNAL" || F.ref !== val) errs.push(`constraints: ${k}.fk_external 이 spec 과 다릅니다.`);
      } else if (p === "concept") {
        const c = (isObj(val) ? val : {}) as Record<string, unknown>;
        const want = { standard: c.standard ?? true, ...(c.domain ? { domain: c.domain } : {}), ...(c.vocabularies ? { vocabularies: c.vocabularies } : {}) };
        if (!sameJson(F.concept, want)) errs.push(`constraints: ${k}.concept 가 spec 과 다릅니다.`);
      } else if (p === "note") {
        if (typeof val !== "string" || !String(F.desc ?? "").endsWith(`※ ${val}`)) errs.push(`constraints: ${k}.note 가 spec 설명에 없습니다.`);
      } else errs.push(`constraints: ${k} 에 알 수 없는 제약이 있습니다: ${p}`);
    }
  }
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function checkScope(id: string, scope: unknown, L: Loaded, errs: string[]): void {
  if (scope === "all") return;
  if (!Array.isArray(scope) || !scope.length) { errs.push(`${id}: scope 는 "all" 또는 코호트 목록이어야 합니다.`); return; }
  for (const c of scope) if (!L.profiles[c]) errs.push(`${id}: scope 에 알 수 없는 코호트가 있습니다: ${String(c)}`);
}

function checkStructural(L: Loaded, errs: string[]): void {
  const tables = L.spec.tables ?? {};
  const seen = new Set<string>();
  const actual = new Map<string, StructuralRule[]>();
  for (const r of L.structural) {
    const id = String(r?.id);
    if (!isObj(r) || !ID_RE.test(id) || /^(USR|ADM)-/.test(id)) { errs.push(`구조 규칙 ID 가 올바르지 않습니다: ${id}`); continue; }
    if (seen.has(id)) errs.push(`규칙 ID 가 겹칩니다: ${id}`);
    seen.add(id);
    if (typeof r.name !== "string" || !r.name) errs.push(`${id}: name 이 비어 있습니다.`);
    if (!CATEGORIES.has(r.category)) errs.push(`${id}: category 가 올바르지 않습니다: ${String(r.category)}`);
    if (!SEVERITIES.has(r.severity)) errs.push(`${id}: severity 는 error|warning 이어야 합니다.`);
    if (!STRUCT_CHECKS.has(r.check)) { errs.push(`${id}: 알 수 없는 검사 유형입니다: ${String(r.check)}`); continue; }
    checkScope(id, r.scope, L, errs);
    const t = tables[r.table];
    if (!t) { errs.push(`${id}: 명세에 없는 테이블입니다: ${String(r.table)}`); continue; }
    if (!Array.isArray(r.fields) || r.fields.some((f) => !t.fields.some((x) => x.name === f))) { errs.push(`${id}: ${r.table} 에 없는 필드를 가리킵니다: ${JSON.stringify(r.fields)}`); continue; }
    const field = r.fields[0] ?? "";
    const tableLevel = r.check === "table_present" || r.check === "columns" || r.check === "extra_columns";
    if (tableLevel ? r.fields.length !== 0 : r.fields.length !== 1) { errs.push(`${id}: ${r.check} 규칙의 fields 개수가 올바르지 않습니다.`); continue; }
    const p = r.params ?? {};
    const F = t.fields.find((x) => x.name === field);
    if (r.check === "range" && !(isNum(p.min) && isNum(p.max) && p.min <= p.max)) errs.push(`${id}: range 에는 숫자 min<=max 가 필요합니다.`);
    if (r.check === "pattern" && !regexOk(p.regex)) errs.push(`${id}: pattern 의 regex 가 올바르지 않습니다.`);
    if (r.check === "codelist" && (typeof p.codelist !== "string" || !L.codelists.has(p.codelist))) errs.push(`${id}: 코드표가 codelists 에 없습니다: ${String(p.codelist)}`);
    if (r.check === "type" && (!FIELD_TYPES.has(p.type) || F?.type !== p.type)) errs.push(`${id}: type 규칙(${String(p.type)})이 spec 의 ${r.table}.${field} 타입(${F?.type})과 다릅니다.`);
    if (r.check === "fk") {
      const rt = tables[p.ref_table as string];
      if (!rt || !rt.fields.some((x) => x.name === p.ref_field)) errs.push(`${id}: 참조 대상이 명세에 없습니다: ${String(p.ref_table)}.${String(p.ref_field)}`);
    }
    if (r.check === "columns" && !sameJson(p.expected, t.fields.filter((f) => !f.optional).map((f) => f.name))) errs.push(`${id}: ${r.table} 의 expected 컬럼이 spec(선택 컬럼 제외)과 다릅니다.`);
    if (r.check === "extra_columns" && !sameJson(p.expected, t.fields.map((f) => f.name))) errs.push(`${id}: ${r.table} 의 expected 컬럼이 spec 과 다릅니다.`);
    const k = `${r.check}|${r.table}|${field}`;
    actual.set(k, [...(actual.get(k) ?? []), r]);
  }

  // spec ↔ 구조 규칙 일관성: spec 이 정하는 모든 제약에 규칙이 있어야 하고, 규칙은 spec 과 같아야 한다
  const expect = new Map<string, (r: StructuralRule) => string | null>();
  const add = (check: string, t: string, f: string, cmp: (r: StructuralRule) => string | null) => expect.set(`${check}|${t}|${f}`, cmp);
  for (const [tn, t] of Object.entries(tables)) {
    if (!Array.isArray(t.fields)) continue;
    if (!t.optional) add("table_present", tn, "", () => null);
    add("columns", tn, "", () => null);
    add("extra_columns", tn, "", () => null);
    add("pk_unique", tn, t.pk, () => null);
    for (const f of t.fields) {
      if (f.required && f.key !== "PK") add("not_null", tn, f.name, () => null);
      if (f.type === "integer" || f.type === "float" || f.type === "date") add("type", tn, f.name, () => null);
      if (f.key === "FK" && typeof f.ref === "string") {
        const [rt, rf] = f.ref.split(".");
        add("fk", tn, f.name, (r) => (r.params.ref_table === rt && r.params.ref_field === rf ? null : `참조가 spec(${f.ref})과 다릅니다`));
      }
      if (f.codelist) add("codelist", tn, f.name, (r) => (r.params.codelist === f.codelist ? null : `코드표가 spec(${String(f.codelist)})과 다릅니다`));
      const rg = f.range;
      if (Array.isArray(rg)) add("range", tn, f.name, (r) => (r.params.min === rg[0] && r.params.max === rg[1] ? null : `범위가 spec([${String(rg)}])과 다릅니다`));
      if (f.pattern) add("pattern", tn, f.name, (r) => (r.params.regex === f.pattern ? null : "패턴이 spec 과 다릅니다"));
      if (f.type === "date") add("not_future", tn, f.name, () => null);
      if (f.concept) add("concept", tn, f.name, (r) => (sameJson(r.params, f.concept) ? null : "표준 용어 대응이 spec 과 다릅니다"));
    }
  }
  const GENERATED = new Set(["table_present", "columns", "extra_columns", "pk_unique", "not_null", "type", "fk", "codelist", "range", "pattern", "not_future", "concept"]);
  for (const [k, cmp] of expect) {
    const [check, tn, f] = k.split("|");
    const rs = actual.get(k);
    const at = f ? `${tn}.${f}` : tn;
    if (!rs) { errs.push(`spec 에는 있으나 구조 규칙이 없습니다: ${check} ${at}${check === "not_null" ? " (spec 필수 필드인데 필수 검사가 없음)" : ""}`); continue; }
    if (rs.length > 1) errs.push(`같은 검사가 중복되어 있습니다: ${check} ${at} (${rs.map((r) => r.id).join(", ")})`);
    for (const r of rs) {
      if (r.scope !== "all") errs.push(`${r.id}: ${check} ${at} 규칙은 모든 코호트에 적용되어야 합니다.`);
      const m = cmp(r);
      if (m) errs.push(`${r.id}: ${m}`);
    }
  }
  for (const [k, rs] of actual) {
    const check = k.split("|")[0];
    if (!expect.has(k) && GENERATED.has(check)) {
      const [, tn, f] = k.split("|");
      for (const r of rs) errs.push(`${r.id}: spec 에 없는 제약입니다 (${check} ${tn}${f ? "." + f : ""}) — spec 의 required/타입/범위와 규칙이 어긋납니다.`);
    }
  }
}

function checkSemantic(L: Loaded, errs: string[]): void {
  const seen = new Set(L.structural.map((r) => r.id));
  for (const r of L.semantic) {
    const id = String(r?.id);
    if (!isObj(r) || !ID_RE.test(id) || /^(USR|ADM)-/.test(id)) { errs.push(`교차 규칙 ID 가 올바르지 않습니다: ${id}`); continue; }
    if (seen.has(id)) errs.push(`규칙 ID 가 겹칩니다: ${id}`);
    seen.add(id);
    if (typeof r.name !== "string" || !r.name) errs.push(`${id}: name 이 비어 있습니다.`);
    if (!CATEGORIES.has(r.category)) errs.push(`${id}: category 가 올바르지 않습니다: ${String(r.category)}`);
    if (!SEVERITIES.has(r.severity)) errs.push(`${id}: severity 는 error|warning 이어야 합니다.`);
    checkScope(id, r.scope, L, errs);
    if (!Array.isArray(r.requires)) errs.push(`${id}: requires 는 테이블 목록이어야 합니다.`);
    else for (const t of r.requires) if (!L.spec.tables?.[t]) errs.push(`${id}: requires 에 명세에 없는 테이블이 있습니다: ${String(t)}`);
    if (typeof r.sql !== "string" || !r.sql.trim()) errs.push(`${id}: sql 이 비어 있습니다.`);
    else { const e = checkSql(r.sql); if (e) errs.push(`${id}: ${e}`); }
  }
}

function validateContent(L: Loaded, rawCodelists: unknown): void {
  const errs: string[] = [];
  checkSpec(L, errs);
  checkProfiles(L, errs);
  checkCodelistsConcepts(L, errs, rawCodelists);
  if (!errs.length) { checkConstraints(L, errs); checkStructural(L, errs); checkSemantic(L, errs); }
  if (errs.length) fail(`기준 내용 검증 실패 (${errs.length}건): ${errs.slice(0, 8).join(" / ")}${errs.length > 8 ? ` … 외 ${errs.length - 8}건` : ""}`);
}

function loadValidated(root: string, files: Map<string, Uint8Array>): Loaded {
  const L = loadAll(root, files);
  validateContent(L, strictYaml("spec/codelists.yaml", files.get("spec/codelists.yaml")!));
  return L;
}

const toCtx = (L: Loaded): RuleContext => ({ spec: L.spec, cohortIds: Object.keys(L.profiles), base: { structural: L.structural, semantic: L.semantic } });

function summarize(L: Loaded, manifest: CriteriaManifest, source: CriteriaInfo["source"]): CriteriaInfo {
  const tables = Object.values(L.spec.tables);
  return {
    manifest, hash: hashOf(manifest.files), source, tables: tables.length,
    fields: tables.reduce((n, t) => n + t.fields.length, 0), rules: L.structural.length + L.semantic.length, cohorts: Object.keys(L.profiles),
  };
}

// ------------------------------------------------------------------ 공개 API: 점검
/**
 * 디렉터리의 기준 한 벌을 점검한다. builtin 은 manifest 를 앱 상수로 만들고,
 * imported 는 manifest.json 을 읽어 해시·버전·앱 호환까지 확인한다. 문제가 있으면 예외.
 */
export function inspectCriteria(root: string, source: "builtin" | "imported", appVersion: string): CriteriaInfo {
  parseSemver(appVersion, "앱");
  const files = readCriteriaFiles(root);
  const actual = fileHashes(files);
  let manifest: CriteriaManifest;
  if (source === "builtin") manifest = { ...BUILTIN_MANIFEST, files: actual };
  else {
    manifest = parseManifest(readRegular(root, MANIFEST_FILE, MAX_MANIFEST_BYTES));
    for (const f of CRITERIA_FILES) if (manifest.files[f] !== actual[f]) fail(`파일 해시가 manifest 와 다릅니다 (변조 또는 손상): ${f}`);
    if (compareSemver(appVersion, manifest.minAppVersion) < 0) fail(`이 기준은 앱 ${manifest.minAppVersion} 이상이 필요합니다 (현재 ${appVersion}).`);
  }
  return summarize(loadValidated(root, files), manifest, source);
}

// ------------------------------------------------------------------ 공개 API: 꾸러미 만들기
/** root 의 기준 7개를 내용 검증한 뒤 manifest.json 과 함께 ZIP 으로 묶는다 (같은 입력이면 같은 바이트) */
export function createCriteriaPackage(root: string, meta: Omit<CriteriaManifest, "schema" | "files">): Uint8Array {
  const m = checkMeta(meta);
  const files = readCriteriaFiles(root);
  loadValidated(root, files);
  const manifest: CriteriaManifest = { schema: SCHEMA, ...m, files: fileHashes(files) };
  const entries: Record<string, Uint8Array> = { [MANIFEST_FILE]: new TextEncoder().encode(JSON.stringify(manifest, null, 2) + "\n") };
  for (const f of CRITERIA_FILES) entries[f] = files.get(f)!;
  const mtime = new Date(1980, 0, 1);
  const zipEntries: Record<string, [Uint8Array, { level: 6; mtime: Date }]> = {};
  for (const [k, v] of Object.entries(entries)) zipEntries[k] = [v, { level: 6, mtime }];
  const out = zipSync(zipEntries);
  if (out.length > MAX_ZIP_BYTES) fail("만든 꾸러미가 너무 큽니다.");
  return out;
}

// ------------------------------------------------------------------ ZIP 사전 점검 (해제 전에 중앙 디렉터리만 읽는다)
interface ZipEntry { name: string; size: number; csize: number }

function scanZip(data: Uint8Array): ZipEntry[] {
  if (data.length > MAX_ZIP_BYTES) fail(`ZIP 이 너무 큽니다 (최대 ${MAX_ZIP_BYTES / 1024 / 1024}MB).`);
  if (data.length < 22) fail("ZIP 파일이 아닙니다.");
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let eocd = -1;
  for (let p = data.length - 22; p >= Math.max(0, data.length - 22 - 65535); p--) if (dv.getUint32(p, true) === 0x06054b50) { eocd = p; break; }
  if (eocd < 0) return fail("ZIP 파일이 아니거나 손상되었습니다.");
  const total = dv.getUint16(eocd + 10, true), cdSize = dv.getUint32(eocd + 12, true), cdOff = dv.getUint32(eocd + 16, true);
  if (total === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) fail("ZIP64 는 지원하지 않습니다.");
  if (dv.getUint16(eocd + 4, true) !== 0 || dv.getUint16(eocd + 6, true) !== 0) fail("여러 조각으로 나뉜 ZIP 은 지원하지 않습니다.");
  if (total === 0 || total > MAX_ZIP_ENTRIES) fail(`ZIP 항목 수가 올바르지 않습니다 (${total}개).`);
  if (cdOff + cdSize > eocd) fail("ZIP 중앙 디렉터리가 손상되었습니다.");
  const dec = new TextDecoder("utf-8");
  const out: ZipEntry[] = [];
  const names = new Set<string>();
  let p = cdOff, expanded = 0;
  for (let i = 0; i < total; i++) {
    if (p + 46 > cdOff + cdSize || dv.getUint32(p, true) !== 0x02014b50) return fail("ZIP 중앙 디렉터리가 손상되었습니다.");
    const madeBy = dv.getUint16(p + 4, true), flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true), size = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const ext = dv.getUint32(p + 38, true), lo = dv.getUint32(p + 42, true);
    if (p + 46 + nl + xl + cl > cdOff + cdSize) return fail("ZIP 중앙 디렉터리가 손상되었습니다.");
    const nameBytes = data.subarray(p + 46, p + 46 + nl);
    const name = dec.decode(nameBytes);
    p += 46 + nl + xl + cl;
    // 이름 검사: 경로 탈출·절대경로·역슬래시·제어문자
    if (!name || /[\u0000-\u001f\u007f\\]/.test(name) || name.startsWith("/") || /^[A-Za-z]:/.test(name) || name.split("/").some((s) => s === ".." || s === ".")) fail(`ZIP 에 허용되지 않는 경로가 있습니다: ${JSON.stringify(name)}`);
    if (names.has(name)) fail(`ZIP 에 같은 이름의 항목이 겹칩니다: ${name}`);
    names.add(name);
    if (flags & 1) fail(`암호화된 ZIP 항목은 지원하지 않습니다: ${name}`);
    if (method !== 0 && method !== 8) fail(`지원하지 않는 압축 방식입니다: ${name}`);
    if (csize === 0xffffffff || size === 0xffffffff) fail("ZIP64 는 지원하지 않습니다.");
    if ((madeBy >> 8) === 3) {
      const type = (ext >>> 16) & 0xf000;
      if (type === 0xa000) fail(`ZIP 에 심볼릭 링크가 있습니다: ${name}`);
      if (type !== 0 && type !== 0x8000 && type !== 0x4000) fail(`ZIP 에 일반 파일이 아닌 항목이 있습니다: ${name}`);
    }
    if (name.endsWith("/")) {
      if (!ALLOWED_DIRS.has(name) || size !== 0) fail(`ZIP 에 허용되지 않는 폴더 항목이 있습니다: ${name}`);
      continue;
    }
    if (name !== MANIFEST_FILE && !FILE_SET.has(name)) fail(`ZIP 에 허용되지 않는 파일이 있습니다: ${name}`);
    const cap = name === MANIFEST_FILE ? MAX_MANIFEST_BYTES : MAX_FILE_BYTES;
    if (size > cap) fail(`ZIP 항목이 너무 큽니다: ${name} (${size} 바이트, 최대 ${cap})`);
    expanded += size;
    if (expanded > MAX_EXPANDED_BYTES) fail(`ZIP 압축을 풀면 너무 큽니다 (최대 ${MAX_EXPANDED_BYTES / 1024 / 1024}MB).`);
    // 로컬 헤더가 중앙 디렉터리와 맞는지, 데이터가 파일 안에 있는지
    if (lo + 30 > data.length || dv.getUint32(lo, true) !== 0x04034b50) fail(`ZIP 항목 헤더가 손상되었습니다: ${name}`);
    const lnl = dv.getUint16(lo + 26, true), lxl = dv.getUint16(lo + 28, true);
    if (dec.decode(data.subarray(lo + 30, lo + 30 + lnl)) !== name) fail(`ZIP 항목 이름이 헤더와 다릅니다: ${name}`);
    if (lo + 30 + lnl + lxl + csize > cdOff) fail(`ZIP 항목 데이터 범위가 올바르지 않습니다: ${name}`);
    if (method === 0 && csize !== size) fail(`ZIP 항목 크기가 맞지 않습니다: ${name}`);
    out.push({ name, size, csize });
  }
  for (const f of [MANIFEST_FILE, ...CRITERIA_FILES]) if (!names.has(f)) fail(`ZIP 에 필요한 파일이 없습니다: ${f}`);
  return out;
}

function extractZip(data: Uint8Array): Map<string, Uint8Array> {
  const entries = scanZip(data);
  const want = new Map(entries.map((e) => [e.name, e]));
  let raw: Record<string, Uint8Array>;
  try { raw = unzipSync(data, { filter: (f) => want.has(f.name) }); } catch (e) { return fail(`ZIP 을 풀 수 없습니다: ${(e as Error).message}`); }
  const out = new Map<string, Uint8Array>();
  for (const [name, e] of want) {
    const b = raw[name];
    if (!b || b.length !== e.size) fail(`ZIP 항목 크기가 선언과 다릅니다: ${name}`);
    out.set(name, b);
  }
  return out;
}

// ------------------------------------------------------------------ 현재 기준과 비교
const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (isObj(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));
const ruleSig = (r: StructuralRule | SemanticRule): string => { const { origin: _o, paramText: _p, disabled: _d, ...rest } = r as StructuralRule; return stable(rest); };
const fieldSig = (f: SpecField): string => stable(f);

class Notes {
  private a: string[] = [];
  push(s: string) { this.a.push(s); }
  get list(): string[] { return this.a.length > MAX_LIST ? [...this.a.slice(0, MAX_LIST), `… 외 ${this.a.length - MAX_LIST}건`] : this.a; }
}

const diffKeys = (a: Record<string, unknown>, b: Record<string, unknown>) => ({
  added: Object.keys(b).filter((k) => !(k in a)), removed: Object.keys(a).filter((k) => !(k in b)),
  changed: Object.keys(a).filter((k) => k in b && stable(a[k]) !== stable(b[k])),
});

function fieldChangeText(a: SpecField, b: SpecField): string {
  const ks = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => k !== "name" && stable(a[k]) !== stable(b[k]));
  return ks.map((k) => (k === "desc" ? "설명" : `${k}: ${stable(a[k] ?? null)} → ${stable(b[k] ?? null)}`)).join(", ");
}

function compareBaselines(cur: Loaded, next: Loaded, ch: Notes): void {
  const ct = cur.spec.tables, nt = next.spec.tables;
  const td = diffKeys(ct, nt);
  for (const t of td.added) ch.push(`테이블 추가: ${t} (${nt[t].fields.length}개 필드)`);
  for (const t of td.removed) ch.push(`테이블 삭제: ${t}`);
  for (const t of Object.keys(nt)) {
    const a = ct[t], b = nt[t];
    if (!a) continue;
    if (a.pk !== b.pk) ch.push(`${t}: PK ${a.pk} → ${b.pk}`);
    if (a.kor !== b.kor || a.category !== b.category) ch.push(`${t}: 이름/구분 변경 (${a.kor}/${a.category} → ${b.kor}/${b.category})`);
    const af = Object.fromEntries(a.fields.map((f) => [f.name, f])), bf = Object.fromEntries(b.fields.map((f) => [f.name, f]));
    for (const f of Object.keys(bf)) {
      if (!af[f]) ch.push(`필드 추가: ${t}.${f} (${bf[f].type}${bf[f].required ? ", 필수" : ""})`);
      else if (fieldSig(af[f]) !== fieldSig(bf[f])) ch.push(`필드 변경: ${t}.${f} — ${fieldChangeText(af[f], bf[f])}`);
    }
    for (const f of Object.keys(af)) if (!bf[f]) ch.push(`필드 삭제: ${t}.${f}`);
  }
  const sd = (label: string, a: (StructuralRule | SemanticRule)[], b: (StructuralRule | SemanticRule)[]) => {
    const am = new Map(a.map((r) => [r.id, r])), bm = new Map(b.map((r) => [r.id, r]));
    for (const [id, r] of bm) {
      const o = am.get(id);
      if (!o) ch.push(`${label} 규칙 추가: ${id} ${r.name}`);
      else if (ruleSig(o) !== ruleSig(r)) {
        const ob: Record<string, unknown> = { ...o }, rb: Record<string, unknown> = { ...r };
        const ks = [...new Set([...Object.keys(ob), ...Object.keys(rb)])].filter((k) => k !== "origin" && k !== "paramText" && stable(ob[k]) !== stable(rb[k]));
        ch.push(`${label} 규칙 변경: ${id} ${r.name} (${ks.join(", ")})`);
      }
    }
    for (const [id, r] of am) if (!bm.has(id)) ch.push(`${label} 규칙 삭제: ${id} ${r.name}`);
  };
  sd("구조", cur.structural, next.structural);
  sd("교차", cur.semantic, next.semantic);
  const pd = diffKeys(cur.profiles, next.profiles);
  for (const c of pd.added) ch.push(`코호트 추가: ${c}`);
  for (const c of pd.removed) ch.push(`코호트 삭제: ${c}`);
  for (const c of pd.changed) ch.push(`코호트 변경: ${c} (테이블 구성 또는 이름)`);
  const cl = diffKeys(Object.fromEntries([...cur.codelists].map(([k, v]) => [k, [...v].sort()])), Object.fromEntries([...next.codelists].map(([k, v]) => [k, [...v].sort()])));
  for (const k of cl.added) ch.push(`코드표 추가: ${k}`);
  for (const k of cl.removed) ch.push(`코드표 삭제: ${k}`);
  for (const k of cl.changed) ch.push(`코드표 변경: ${k}`);
  for (const sect of ["measurements", "drugs"] as const) {
    const d = diffKeys(cur.concepts[sect] ?? {}, next.concepts[sect] ?? {});
    for (const k of d.added) ch.push(`concept(${sect}) 추가: ${k}`);
    for (const k of d.removed) ch.push(`concept(${sect}) 삭제: ${k}`);
    for (const k of d.changed) ch.push(`concept(${sect}) 변경: ${k}`);
  }
}

/** 이 PC 의 규칙 덧씌우기 중 새 기준에서 어긋나거나 영향 받는 것을 모두 모은다 (보수적으로: 의심되면 충돌) */
function findConflicts(cur: Loaded, next: Loaded, ov: RuleOverrides, ctx: RuleContext, out: Notes): void {
  const cs = new Map([...cur.structural, ...cur.semantic].map((r) => [r.id, r]));
  const ns = new Map([...next.structural, ...next.semantic].map((r) => [r.id, r]));
  const sigDiff = (id: string): string | null => {
    const o = cs.get(id), n = ns.get(id);
    if (!n) return "새 기준에서 삭제된 규칙";
    if (o && ruleSig(o) !== ruleSig(n)) return "새 기준에서 내용이 바뀐 규칙";
    return null;
  };
  const rule = (kind: string, id: string) => { const d = sigDiff(id); if (d) out.push(`${kind}: ${id} — ${d}`); };
  const codesOf = (L: Loaded, r: StructuralRule | SemanticRule | undefined) => {
    const name = (r as StructuralRule | undefined)?.params?.codelist;
    return typeof name === "string" ? stable([...(L.codelists.get(name) ?? [])].sort()) : null;
  };
  for (const id of ov.disabled ?? []) rule("끈 규칙", id);
  for (const id of Object.keys(ov.severity ?? {})) rule("심각도 변경", id);
  for (const id of Object.keys(ov.params ?? {})) {
    rule("값 조정", id);
    if (ns.has(id) && codesOf(cur, cs.get(id)) !== codesOf(next, ns.get(id))) out.push(`값 조정: ${id} — 코드표의 코드가 바뀌었습니다`);
  }
  for (const id of Object.keys(ov.sql ?? {})) rule("SQL 교체", id);
  const sqlUsers = Object.keys(ov.sql ?? {}).length > 0 || (ov.customSql?.length ?? 0) > 0;
  if (sqlUsers && (stable(cur.concepts) !== stable(next.concepts))) out.push("관리자 SQL: concept 목록(항암제·측정값 등)이 바뀌어 SQL 결과가 달라질 수 있습니다");
  const tableSig = (L: Loaded, t: string) => stable(L.spec.tables[t] ?? null);
  for (const r of ov.customRules ?? []) {
    const nt = next.spec.tables[r.table];
    const f = nt?.fields.find((x) => x.name === r.field);
    if (!nt) out.push(`사용자 규칙: ${r.id} — 테이블 ${r.table} 가 새 기준에 없습니다`);
    else if (!f) out.push(`사용자 규칙: ${r.id} — 필드 ${r.table}.${r.field} 가 새 기준에 없습니다`);
    else {
      const of = cur.spec.tables[r.table]?.fields.find((x) => x.name === r.field);
      if (!of || fieldSig(of) !== fieldSig(f)) out.push(`사용자 규칙: ${r.id} — 필드 ${r.table}.${r.field} 정의가 바뀌었습니다`);
    }
  }
  for (const r of ov.customSql ?? []) {
    for (const t of r.requires) {
      if (!next.spec.tables[t]) out.push(`관리자 규칙: ${r.id} — 필요한 테이블 ${t} 가 새 기준에 없습니다`);
      else if (tableSig(cur, t) !== tableSig(next, t)) out.push(`관리자 규칙: ${r.id} — 필요한 테이블 ${t} 정의가 바뀌었습니다`);
    }
    if (r.scope !== "all") for (const c of r.scope) {
      if (!next.profiles[c]) out.push(`관리자 규칙: ${r.id} — 코호트 ${c} 가 새 기준에 없습니다`);
      else if (stable(cur.profiles[c]) !== stable(next.profiles[c])) out.push(`관리자 규칙: ${r.id} — 코호트 ${c} 구성이 바뀌었습니다`);
    }
  }
  // 새 기준에서 설정 전체를 다시 검증 — 위에서 못 잡은 문제도 숨기지 않는다
  try { validateOverrides(ov, ctx, { allowSql: true }); } catch (e) { out.push(`기존 규칙 설정이 새 기준에서 유효하지 않습니다: ${(e as Error).message}`); }
}

// ------------------------------------------------------------------ 공개 API: 가져오기 준비
/**
 * ZIP 을 사전 점검·해제하고 stagingRoot 아래 새 임시 폴더에 풀어 전체 검증한 뒤, 현재 기준(currentRoot)과의
 * 차이와 기존 규칙 설정(overrides)과의 충돌을 알려 준다. 활성 설정·overrides 는 건드리지 않는다.
 * preview.token 은 임시 폴더 이름(무작위)이다. 실패하면 임시 폴더를 지우고 예외를 던진다.
 */
export function stageCriteriaPackage(bytes: Uint8Array, stagingRoot: string, currentRoot: string, overrides: RuleOverrides, appVersion: string): { root: string; preview: CriteriaPreview } {
  const files = extractZip(bytes);
  fs.mkdirSync(stagingRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(stagingRoot, `stage-${randomBytes(8).toString("hex")}-`));
  try {
    for (const rel of [MANIFEST_FILE, ...CRITERIA_FILES]) {
      const p = path.join(root, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, files.get(rel)!);
    }
    const info = inspectCriteria(root, "imported", appVersion);
    const curFiles = readCriteriaFiles(currentRoot);
    const cur = loadAll(currentRoot, curFiles);
    const next = loadAll(root, readCriteriaFiles(root));
    const changes = new Notes(), conflicts = new Notes();
    let curVersion: string | undefined;
    try { curVersion = parseManifest(readRegular(currentRoot, MANIFEST_FILE, MAX_MANIFEST_BYTES)).version; } catch { curVersion = BUILTIN_MANIFEST.version; }
    if (info.hash === hashOf(fileHashes(curFiles))) changes.push("현재 적용 중인 기준과 내용이 같습니다.");
    else {
      if (curVersion !== info.manifest.version) changes.push(`기준 버전: ${curVersion} → ${info.manifest.version}`);
      compareBaselines(cur, next, changes);
    }
    findConflicts(cur, next, overrides, toCtx(next), conflicts);
    return { root, preview: { token: path.basename(root), info, changes: changes.list, conflicts: conflicts.list, hasOverrides: !isEmptyOverrides(overrides) } };
  } catch (e) {
    fs.rmSync(root, { recursive: true, force: true });
    throw e;
  }
}
