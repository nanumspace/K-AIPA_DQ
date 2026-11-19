// 데이터 충실도: 있어야 할 기록이 있는 비율 (spec/expected_data.yaml, spec/concept_sets.yaml).
// 규칙과 별개로 세며, SQL 과 문자열은 참조 구현(dq/engine.py 의 run_sufficiency)과 같다.
import type { DuckDBConnection } from "@duckdb/node-api";
import type { ExpectedData, RawTable, SufficiencyResult, SufficiencyRow } from "./types.js";
import { pyList, pySorted } from "./pyrepr.js";

export const AGE_BANDS = ["<50", "50-64", "65+", "미상"];
const EMPTY_EVENTS = "SELECT CAST(NULL AS BIGINT) AS person_id, CAST(NULL AS VARCHAR) AS set_id, CAST(NULL AS DATE) AS event_date WHERE false";
const wrap = (sql: string, age: string) => `CREATE OR REPLACE TEMP TABLE _S AS
SELECT s.person_id, s.unit_key, COALESCE(s.met, false) AS met, s.detail, s.per_year,
       CASE WHEN p.age IS NULL THEN '미상' WHEN p.age < 50 THEN '<50' WHEN p.age < 65 THEN '50-64' ELSE '65+' END AS age_band
FROM (${sql}) s
LEFT JOIN (SELECT person_id, ${age} AS age FROM PERSON GROUP BY person_id) p ON p.person_id = s.person_id`;
const TOTAL = "SELECT COUNT(*), COUNT(*) FILTER (WHERE met), CAST(ROUND(MEDIAN(per_year), 1) AS VARCHAR) FROM _S";
const BANDS = "SELECT age_band, COUNT(*), COUNT(*) FILTER (WHERE met) FROM _S GROUP BY age_band";
const UNMET = "SELECT person_id, unit_key, detail FROM _S WHERE NOT met ORDER BY person_id, unit_key";
export const SUFF_PUBLIC_ERROR = "실행 오류: 상세는 내부 실행 기록에서 확인하세요.";

export interface SufficiencyContext {
  cohort: string;
  raw: Map<string, RawTable>;
  diseaseTable: string;
  expected: ExpectedData;
  conceptSets: Record<string, number[]>;
}

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const errText = (e: unknown) => String((e as Error).message ?? e).slice(0, 200);

/** 정수 연산으로 소수 첫째 자리 백분율 (참조 구현의 pct 와 같다) */
export function pct(met: number, n: number): string {
  if (!n) return "-";
  const t = Math.floor((met * 2000 + n) / (2 * n));
  return `${Math.floor(t / 10)}.${t % 10}%`;
}

export async function runSufficiency(con: DuckDBConnection, ctx: SufficiencyContext): Promise<{ items: SufficiencyResult[]; rows: SufficiencyRow[] }> {
  const ed = ctx.expected;
  const items: SufficiencyResult[] = [];
  const rows: SufficiencyRow[] = [];
  await con.run("CREATE TEMP TABLE _CONCEPT_SET (set_id VARCHAR, concept_id BIGINT)");
  const vals = Object.entries(ctx.conceptSets).flatMap(([k, ids]) => ids.map((c) => `('${k.replace(/'/g, "''")}', ${Number(c)})`));
  for (let i = 0; i < vals.length; i += 1000) await con.run(`INSERT INTO _CONCEPT_SET VALUES ${vals.slice(i, i + 1000).join(", ")}`);
  const parts: string[] = [];
  for (const ev of ed.events) {
    const df = ctx.raw.get(ev.table);
    if (df && ["person_id", ev.concept, ev.date].every((c) => df.cols.has(c)))
      parts.push(`SELECT x.person_id, s.set_id, x."${ev.date}" AS event_date FROM "${ev.table}" x `
        + `JOIN _CONCEPT_SET s ON s.concept_id = x."${ev.concept}" WHERE x.person_id IS NOT NULL AND x."${ev.date}" IS NOT NULL`);
  }
  await con.run("CREATE TEMP TABLE _EVENTS AS " + (parts.join(" UNION ALL ") || EMPTY_EVENTS));
  const dtab = ctx.diseaseTable;
  const present = new Set(ctx.raw.keys());
  const missingSetup = pySorted([...new Set([...ed.setup_requires, dtab])].filter((t) => !present.has(t)));
  let setupError: string | null = null;
  if (!missingSetup.length) {
    try {
      for (const stmt of ed.setup) await con.run(stmt.split("{ANCHOR}").join(ed.anchors[ctx.cohort]).split("{DISEASE}").join(dtab));
    } catch (e) { setupError = errText(e); }
  }
  const person = ctx.raw.get("PERSON");
  const age = person?.cols.has("age_at_index") ? "MIN(age_at_index)" : "CAST(NULL AS BIGINT)";
  for (const item of ed.items) {
    if (item.scope !== "all" && !item.scope.includes(ctx.cohort)) continue;
    const r: SufficiencyResult = { id: item.id, title: item.title, unit: item.unit, status: "ok", note: "", eligible: 0, met: 0, per_year_median: null, by_age: [] };
    items.push(r);
    const req = item.requires ?? [];
    const missReq = req.filter((t) => !present.has(t));
    if (missingSetup.length || missReq.length) {
      r.status = "skipped"; r.note = `필요 테이블 없음: ${pyList(pySorted([...new Set([...missingSetup, ...missReq])]))}`; continue;
    }
    if (setupError) { r.status = "error"; r.note = `SQL 오류: ${setupError}`; continue; }
    try {
      await con.run(wrap(item.sql.split("{DISEASE}").join(dtab), age));
      const tot = (await con.runAndReadAll(TOTAL)).getRows()[0];
      const bands = new Map((await con.runAndReadAll(BANDS)).getRows().map((b) => [String(b[0]), [Number(b[1]), Number(b[2])]]));
      const unmet = (await con.runAndReadAll(UNMET)).getRows();
      r.eligible = Number(tot[0]); r.met = Number(tot[1]); r.per_year_median = str(tot[2]);
      r.by_age = AGE_BANDS.filter((b) => bands.has(b)).map((b) => ({ band: b, eligible: bands.get(b)![0], met: bands.get(b)![1] }));
      for (const u of unmet) rows.push({ item_id: item.id, person_id: str(u[0]) ?? "", unit_key: str(u[1]) ?? "", detail: str(u[2]) ?? "" });
    } catch (e) {
      r.status = "error"; r.note = `SQL 오류: ${errText(e)}`; r.eligible = 0; r.met = 0; r.per_year_median = null; r.by_age = [];
    }
  }
  return { items, rows };
}

/** 보고서의 `## 데이터 충실도` 절 (참조 구현과 글자 단위로 같다) */
export function sufficiencyMd(items: SufficiencyResult[]): string[] {
  if (!items.length) return [];
  const L = ["", "## 데이터 충실도", "",
    "있어야 할 기록이 있는 비율이다(규칙 위반과 별개, 충족 판정·목표치 없음). 미충족 단위는 sufficiency.csv(기관 내부용)에 있다.", "",
    `| 항목 | 단위 | 대상 | 충족 | 비율 | 1인·1년당 중앙값 | ${AGE_BANDS.join(" | ")} |`,
    "|---|---|---|---|---|---|" + "---|".repeat(AGE_BANDS.length)];
  for (const x of items) {
    if (x.status !== "ok") {
      const why = x.status === "skipped" ? `건너뜀 (${x.note})` : "실행 오류";
      L.push(`| ${x.id} ${x.title} | ${x.unit} | - | - | ${why} | - |` + " - |".repeat(AGE_BANDS.length));
      continue;
    }
    const band = new Map(x.by_age.map((b) => [b.band, b]));
    const cells = AGE_BANDS.map((b) => (band.has(b) ? `${band.get(b)!.met}/${band.get(b)!.eligible}` : "-"));
    L.push(`| ${x.id} ${x.title} | ${x.unit} | ${x.eligible} | ${x.met} | ${pct(x.met, x.eligible)} | ${x.per_year_median || "-"} | ${cells.join(" | ")} |`);
  }
  return L;
}
