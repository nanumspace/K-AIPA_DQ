// 실행 이력 저장소 (DuckDB 파일). 실행마다 요약 · 규칙 결과 · 위반 행을 적재한다.
import fs from "node:fs";
import path from "node:path";
import { DuckDBInstance, DuckDBConnection, type DuckDBValue } from "@duckdb/node-api";
import type { Summary, RuleStat, RawTable } from "@engine/types.js";
import { csvCell } from "@engine/csv.js";
import type { RunRecord, RuleResultRow, FindingRow, FindingsQuery, FindingsFilter, FindingsPage, Dashboard, CohortStatus } from "@shared/types";
import { checkLabel } from "@shared/labels";

let inst: DuckDBInstance | null = null;
let con: DuckDBConnection | null = null;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS runs (
     run_id VARCHAR PRIMARY KEY, cohort VARCHAR, cohort_kor VARCHAR, label VARCHAR, data_dir VARCHAR,
     run_date VARCHAR, created_at VARCHAR,
     rules_total INTEGER, rules_failed INTEGER, rules_skipped INTEGER, rules_error INTEGER,
     violations_total INTEGER, violations_error INTEGER, violations_warning INTEGER,
     rows_total BIGINT, tables_json VARCHAR)`,
  `CREATE TABLE IF NOT EXISTS rule_results (
     run_id VARCHAR, rule_id VARCHAR, name VARCHAR, category VARCHAR, subcategory VARCHAR, severity VARCHAR,
     table_name VARCHAR, fields VARCHAR, check_type VARCHAR, status VARCHAR,
     violations INTEGER, rows_checked INTEGER, note VARCHAR)`,
  `CREATE TABLE IF NOT EXISTS findings (
     run_id VARCHAR, seq INTEGER, rule_id VARCHAR, rule_name VARCHAR, category VARCHAR, severity VARCHAR,
     table_name VARCHAR, field VARCHAR, row_key VARCHAR, person_id VARCHAR, detail VARCHAR)`,
  // 규칙 설정 도입 전에 만든 이력 DB 도 그대로 열린다: 없는 컬럼만 더하고 옛 행은 표준 실행으로 본다.
  `ALTER TABLE runs ADD COLUMN IF NOT EXISTS rules_disabled INTEGER DEFAULT 0`,
  `ALTER TABLE runs ADD COLUMN IF NOT EXISTS rule_set_modified BOOLEAN DEFAULT false`,
  `ALTER TABLE runs ADD COLUMN IF NOT EXISTS admin_modified BOOLEAN DEFAULT false`,
  `ALTER TABLE rule_results ADD COLUMN IF NOT EXISTS origin VARCHAR DEFAULT 'standard'`,
];

export async function openDb(file: string): Promise<void> {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  inst = await DuckDBInstance.create(file);
  con = await inst.connect();
  for (const s of SCHEMA) await con.run(s);
}

export function closeDb(): void {
  con?.closeSync(); inst?.closeSync(); con = null; inst = null;
}

function c(): DuckDBConnection {
  if (!con) throw new Error("DB 가 열려 있지 않습니다");
  return con;
}

async function rows<T>(sql: string, params?: DuckDBValue[]): Promise<T[]> {
  const r = await c().runAndReadAll(sql, params);
  return r.getRowObjectsJson() as unknown as T[];
}

const NUM_FIELDS = ["rules_total", "rules_failed", "rules_skipped", "rules_error", "violations_total", "violations_error", "violations_warning", "rows_total", "rules_disabled"] as const;

/** DuckDB 의 BIGINT 는 JSON 변환 시 문자열이 될 수 있어 숫자 필드를 강제 변환한다. */
function toRun(r: Record<string, unknown>): RunRecord {
  const { tables_json, ...rest } = r as Record<string, unknown> & { tables_json: string };
  const out = { ...(rest as unknown as RunRecord), tables: JSON.parse(tables_json || "{}") };
  for (const k of NUM_FIELDS) out[k] = Number(out[k] ?? 0);
  out.rule_set_modified = out.rule_set_modified === true;
  out.admin_modified = out.admin_modified === true;
  return out;
}

export interface InsertRunArgs {
  runId: string; cohort: string; cohortKor: string; label: string; dataDir: string; createdAt: string;
  summary: Summary; findings: RawTable;
  /** 표준이 아닌 규칙(변경·사용자·관리자)이 하나라도 있었는지 */
  ruleSetModified: boolean;
  /** 관리자 출처 규칙(SQL 교체·ADM)이 있었는지 */
  adminModified: boolean;
}

export async function insertRun(a: InsertRunArgs): Promise<RunRecord> {
  const s = a.summary;
  const rowsTotal = Object.values(s.tables).reduce((x, y) => x + y, 0);
  await c().run(
    `INSERT INTO runs (run_id, cohort, cohort_kor, label, data_dir, run_date, created_at,
       rules_total, rules_failed, rules_skipped, rules_error, violations_total, violations_error, violations_warning,
       rows_total, tables_json, rules_disabled, rule_set_modified, admin_modified)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [a.runId, a.cohort, a.cohortKor, a.label, a.dataDir, s.run_date, a.createdAt,
     s.rules_total, s.rules_failed, s.rules_skipped, s.rules_error,
     s.violations_total, s.violations_error, s.violations_warning, rowsTotal, JSON.stringify(s.tables),
     s.rules_disabled ?? 0, a.ruleSetModified, a.adminModified]);
  const ra = await c().createAppender("rule_results");
  for (const r of s.rules as RuleStat[]) {
    ra.appendVarchar(a.runId); ra.appendVarchar(r.rule_id); ra.appendVarchar(r.name); ra.appendVarchar(r.category);
    ra.appendVarchar(r.subcategory); ra.appendVarchar(r.severity); ra.appendVarchar(r.table); ra.appendVarchar(r.fields);
    ra.appendVarchar(r.check); ra.appendVarchar(r.status); ra.appendInteger(r.violations); ra.appendInteger(r.rows_checked);
    ra.appendVarchar(r.note); ra.appendVarchar(r.origin); ra.endRow();
  }
  ra.closeSync();
  const f = a.findings;
  const col = (n: string) => f.cols.get(n) ?? new Array<string>(f.n).fill("");
  const cols = ["rule_id", "rule_name", "category", "severity", "table", "field", "row_key", "person_id", "detail"].map(col);
  const fa = await c().createAppender("findings");
  for (let i = 0; i < f.n; i++) {
    fa.appendVarchar(a.runId); fa.appendInteger(i + 1);
    for (const cc of cols) fa.appendVarchar(cc[i]);
    fa.endRow();
  }
  fa.closeSync();
  return (await getRun(a.runId))!;
}

export async function listRuns(): Promise<RunRecord[]> {
  return (await rows<Record<string, unknown>>(`SELECT * FROM runs ORDER BY created_at DESC`)).map(toRun);
}

export async function getRun(runId: string): Promise<RunRecord | null> {
  const r = await rows<Record<string, unknown>>(`SELECT * FROM runs WHERE run_id = ?`, [runId]);
  return r.length ? toRun(r[0]) : null;
}

export async function getRuleResults(runId: string): Promise<RuleResultRow[]> {
  const rs = await rows<RuleResultRow>(`SELECT * FROM rule_results WHERE run_id = ? ORDER BY rowid`, [runId]);
  return rs.map((r) => ({ ...r, violations: Number(r.violations), rows_checked: Number(r.rows_checked) }));
}

const MAX_TEXT = 500;
const MAX_PAGE_LIMIT = 1000;

function optText(v: unknown, name: string): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") throw new Error(`조회 조건이 올바르지 않습니다 (${name})`);
  if (v.length > MAX_TEXT) throw new Error(`조회 조건이 너무 깁니다 (${name})`);
  return v;
}

/** 조회·내보내기가 함께 쓰는 조건 검증. 렌더러에서 온 값은 믿지 않는다. */
export function parseFindingsFilter(q: unknown): FindingsFilter {
  if (!q || typeof q !== "object") throw new Error("조회 조건이 올바르지 않습니다");
  const o = q as Record<string, unknown>;
  const runId = optText(o.runId, "runId");
  if (!runId) throw new Error("실행 기록이 지정되지 않았습니다");
  return { runId, ruleId: optText(o.ruleId, "ruleId"), table: optText(o.table, "table"), severity: optText(o.severity, "severity"), search: optText(o.search, "search") };
}

export function parseFindingsQuery(q: unknown): FindingsQuery {
  const f = parseFindingsFilter(q);
  const { offset, limit } = q as Record<string, unknown>;
  if (!Number.isInteger(offset) || (offset as number) < 0) throw new Error("조회 조건이 올바르지 않습니다 (offset)");
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > MAX_PAGE_LIMIT) throw new Error("조회 조건이 올바르지 않습니다 (limit)");
  return { ...f, offset: offset as number, limit: limit as number };
}

/** 쪽 나누기 조회와 내보내기가 같은 WHERE 를 쓰도록 한 곳에서 만든다 */
function findingsWhere(f: FindingsFilter): { w: string; params: DuckDBValue[] } {
  const where: string[] = ["run_id = ?"]; const params: DuckDBValue[] = [f.runId];
  if (f.ruleId) { where.push("rule_id = ?"); params.push(f.ruleId); }
  if (f.table) { where.push("table_name = ?"); params.push(f.table); }
  if (f.severity) { where.push("severity = ?"); params.push(f.severity); }
  if (f.search) { where.push("(detail ILIKE ? OR rule_name ILIKE ? OR person_id = ? OR row_key = ?)"); params.push(`%${f.search}%`, `%${f.search}%`, f.search, f.search); }
  return { w: where.join(" AND "), params };
}

export async function getFindings(query: FindingsQuery): Promise<FindingsPage> {
  const q = parseFindingsQuery(query);
  const { w, params } = findingsWhere(q);
  const total = (await rows<{ n: number }>(`SELECT count(*) AS n FROM findings WHERE ${w}`, params))[0].n;
  const page = await rows<FindingRow>(`SELECT * FROM findings WHERE ${w} ORDER BY seq LIMIT ? OFFSET ?`, [...params, q.limit, q.offset]);
  return { total: Number(total), rows: page.map((f) => ({ ...f, seq: Number(f.seq) })) };
}

export async function countFindings(filter: FindingsFilter): Promise<number> {
  const { w, params } = findingsWhere(parseFindingsFilter(filter));
  return Number((await rows<{ n: number }>(`SELECT count(*) AS n FROM findings WHERE ${w}`, params))[0].n);
}

const EXPORT_COLUMNS = ["rule_id", "rule_name", "category", "severity", "table_name", "field", "row_key", "person_id", "detail"] as const;
/** findings.csv(엔진 출력) 와 같은 머리글 */
const EXPORT_HEADER = ["rule_id", "rule_name", "category", "severity", "table", "field", "row_key", "person_id", "detail"];
const EXPORT_BATCH = 5000;

/** 엑셀이 수식으로 읽을 수 있는 시작 문자(= + - @ 탭 CR)는 앞에 ' 를 붙여 글자로 보이게 한다. 숫자 값은 그대로 둔다. */
export function formulaSafeCsvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return csvCell(s);
}

/**
 * 조건(쪽 나누기 제외)에 맞는 위반 행 전체를 CSV 로 쓴다. seq 를 기준으로 배치씩 읽어 메모리를 일정하게 쓰고,
 * 임시 파일에 다 쓴 뒤에야 이름을 바꿔 두므로 도중에 실패해도 반쯤 쓴 파일이 남지 않는다. 쓴 행 수를 돌려준다.
 */
export async function exportFindingsCsv(filter: FindingsFilter, file: string, opts: { batchSize?: number } = {}): Promise<number> {
  const f = parseFindingsFilter(filter);
  const { w, params } = findingsWhere(f);
  const batchSize = opts.batchSize ?? EXPORT_BATCH;
  const tmp = `${file}.${process.pid}.tmp`;
  let fd = fs.openSync(tmp, "w");
  let n = 0;
  try {
    fs.writeFileSync(fd, "\uFEFF" + EXPORT_HEADER.map(csvCell).join(",") + "\n", "utf-8");
    let after = 0;
    for (;;) {
      const batch = await rows<Record<string, unknown>>(
        `SELECT seq, ${EXPORT_COLUMNS.join(", ")} FROM findings WHERE ${w} AND seq > ? ORDER BY seq LIMIT ?`, [...params, after, batchSize]);
      if (!batch.length) break;
      fs.writeFileSync(fd, batch.map((r) => EXPORT_COLUMNS.map((c) => formulaSafeCsvCell(r[c])).join(",") + "\n").join(""), "utf-8");
      n += batch.length;
      after = Number(batch[batch.length - 1].seq);
      if (batch.length < batchSize) break;
    }
    fs.closeSync(fd); fd = -1;
    fs.renameSync(tmp, file);
  } catch (e) {
    if (fd >= 0) try { fs.closeSync(fd); } catch { /* 이미 닫힘 */ }
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  return n;
}

export async function deleteRun(runId: string): Promise<void> {
  for (const t of ["findings", "rule_results", "runs"]) await c().run(`DELETE FROM ${t} WHERE run_id = ?`, [runId]);
}

export async function dashboard(rulesCount: Dashboard["rulesCount"]): Promise<Dashboard> {
  const all = (await rows<Record<string, unknown>>(`SELECT * FROM runs ORDER BY created_at`)).map(toRun);
  const latest = new Map<string, RunRecord>();
  for (const r of all) latest.set(r.cohort, r); // 시간순이므로 마지막이 최신
  const latestByCohort: CohortStatus[] = [...latest.values()].sort((a, b) => a.cohort.localeCompare(b.cohort))
    .map((r) => ({ ...r, error_rate: r.rows_total ? (r.violations_total / r.rows_total) * 100 : 0 }));
  const ids = latestByCohort.map((r) => r.run_id);
  let byCheck: Dashboard["byCheck"] = [], bySeverity: Dashboard["bySeverity"] = [];
  if (ids.length) {
    const ph = ids.map(() => "?").join(",");
    const bc = await rows<{ check_type: string; n: number }>(
      `SELECT check_type, sum(violations) AS n FROM rule_results WHERE run_id IN (${ph}) GROUP BY check_type HAVING sum(violations) > 0 ORDER BY n DESC`, ids);
    byCheck = bc.map((x) => ({ check: x.check_type, label: checkLabel(x.check_type), count: Number(x.n) }));
    const bs = await rows<{ severity: string; n: number }>(
      `SELECT severity, sum(violations) AS n FROM rule_results WHERE run_id IN (${ph}) GROUP BY severity`, ids);
    bySeverity = bs.map((x) => ({ severity: x.severity, count: Number(x.n) }));
  }
  const trend = all.slice(-40).map((r) => ({
    run_id: r.run_id, created_at: r.created_at, cohort: r.cohort, label: r.label,
    violations_error: r.violations_error, violations_warning: r.violations_warning, rows_total: r.rows_total,
    error_rate: r.rows_total ? (r.violations_total / r.rows_total) * 100 : 0,
  }));
  const rowsSum = latestByCohort.reduce((x, r) => x + r.rows_total, 0);
  const vioSum = latestByCohort.reduce((x, r) => x + r.violations_total, 0);
  return { latestByCohort, byCheck, bySeverity, rulesCount, trend,
    totals: { rows: rowsSum, violations: vioSum, error_rate: rowsSum ? (vioSum / rowsSum) * 100 : 0, runs: all.length } };
}
