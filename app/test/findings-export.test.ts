import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Summary, RawTable } from "@engine/types.js";
import { readCsv } from "@engine/csv.js";
import * as db from "../src/main/db";

// 오류 현황의 '현재 조건 CSV 저장': 쪽 나누기와 무관하게 조건에 맞는 행이 모두, 그 행만, 수식 안전하게 나와야 한다.
const RUN = "run-a";
const OTHER = "run-b";
const N = 37;
let dir: string;

function table(prefix: string, n: number): RawTable {
  const cols = new Map<string, string[]>();
  const col = (name: string, f: (i: number) => string) => cols.set(name, Array.from({ length: n }, (_, i) => f(i)));
  col("rule_id", (i) => (i % 3 === 0 ? "STR-001" : "SEM-002"));
  col("rule_name", (i) => (i % 3 === 0 ? "필수값" : "논리 검사"));
  col("category", () => "Completeness");
  col("severity", (i) => (i % 2 === 0 ? "error" : "warning"));
  col("table", (i) => (i % 4 === 0 ? "PERSON" : "VISIT"));
  col("field", () => "birth");
  col("row_key", (i) => `${prefix}${i}`);
  col("person_id", (i) => `P${i % 5}`);
  // 쉼표 · 따옴표 · 줄바꿈과 수식처럼 시작하는 값
  col("detail", (i) => (i === 0 ? "=HYPERLINK(\"x\")" : i === 1 ? "-1+2" : i === 2 ? "줄1\n\"줄2\", 끝" : i === 3 ? "-12" : `값 ${i} 오류`));
  return { columns: [...cols.keys()], cols, n };
}

async function insert(runId: string, n: number) {
  const summary = { run_date: "2026-09-07", rules_total: 2, rules_failed: 2, rules_skipped: 0, rules_error: 0, violations_total: n, violations_error: 0, violations_warning: 0, tables: { PERSON: 1 }, rules: [] } as unknown as Summary;
  await db.insertRun({ runId, cohort: "LUNG_CANCER", cohortKor: "폐암", label: "t", dataDir: "x", createdAt: new Date().toISOString(), summary, findings: table(runId === RUN ? "k" : "z", n), ruleSetModified: false, adminModified: false });
}

async function pagedAll(filter: Parameters<typeof db.countFindings>[0], limit = 7) {
  const out: { seq: number; row_key: string }[] = [];
  for (let offset = 0; ; offset += limit) {
    const p = await db.getFindings({ ...filter, offset, limit });
    out.push(...p.rows);
    if (offset + limit >= p.total) return { total: p.total, rows: out };
  }
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "kai-findings-export-"));
  await db.openDb(path.join(dir, "h.duckdb"));
  await insert(RUN, N);
  await insert(OTHER, 11);
});
afterAll(() => { db.closeDb(); fs.rmSync(dir, { recursive: true, force: true }); });

describe("조건 CSV 저장", () => {
  const filters = [
    { runId: RUN },
    { runId: RUN, ruleId: "STR-001" },
    { runId: RUN, ruleId: "SEM-002", severity: "warning" },
    { runId: RUN, table: "PERSON", severity: "error" },
    { runId: RUN, search: "P3" },
    { runId: RUN, search: "오류" },
    { runId: RUN, ruleId: "STR-001", search: "nothing-matches" },
  ];

  it.each(filters)("여러 배치에 걸쳐도 쪽 나누기 조회와 같은 행이 같은 순서로 나온다 %j", async (f) => {
    const file = path.join(dir, "out.csv");
    const written = await db.exportFindingsCsv(f, file, { batchSize: 4 });
    const all = await pagedAll(f);
    const csv = readCsv(file);
    expect(written).toBe(all.total);
    expect(csv.n).toBe(all.total);
    expect(csv.cols.get("row_key")).toEqual(all.rows.map((r) => r.row_key));
    // 다른 실행의 행이 섞이지 않는다
    expect(csv.cols.get("row_key")!.every((k) => k.startsWith("k"))).toBe(true);
    expect(fs.readdirSync(dir).filter((x) => x.endsWith(".tmp"))).toEqual([]);
  });

  it("머리글은 엔진 findings.csv 와 같고 BOM 이 있다", async () => {
    const file = path.join(dir, "h.csv");
    await db.exportFindingsCsv({ runId: RUN }, file);
    const text = fs.readFileSync(file, "utf-8");
    expect(text.startsWith("\uFEFFrule_id,rule_name,category,severity,table,field,row_key,person_id,detail\n")).toBe(true);
  });

  it("수식으로 읽힐 값은 글자로 바꾸고 숫자와 쉼표·따옴표·줄바꿈은 보존한다", async () => {
    const file = path.join(dir, "f.csv");
    await db.exportFindingsCsv({ runId: RUN }, file);
    const d = readCsv(file).cols.get("detail")!;
    expect(d[0]).toBe("'=HYPERLINK(\"x\")");
    expect(d[1]).toBe("'-1+2");
    expect(d[2]).toBe("줄1\n\"줄2\", 끝");
    expect(d[3]).toBe("-12");
  });

  it("조건에 맞는 행이 없으면 머리글만 쓴다", async () => {
    const file = path.join(dir, "e.csv");
    expect(await db.exportFindingsCsv({ runId: RUN, search: "nothing-matches" }, file)).toBe(0);
    expect(readCsv(file).n).toBe(0);
  });

  it("잘못된 조건은 파일을 만들기 전에 거부한다 (조회와 같은 검증)", async () => {
    const file = path.join(dir, "bad.csv");
    for (const bad of [null, {}, { runId: "" }, { runId: 5 }, { runId: RUN, ruleId: 3 }, { runId: RUN, search: "x".repeat(501) }]) {
      await expect(db.exportFindingsCsv(bad as never, file)).rejects.toThrow();
      await expect(db.getFindings({ ...(bad as object), offset: 0, limit: 10 } as never)).rejects.toThrow();
    }
    await expect(db.getFindings({ runId: RUN, offset: -1, limit: 10 })).rejects.toThrow();
    await expect(db.getFindings({ runId: RUN, offset: 0, limit: 0 })).rejects.toThrow();
    await expect(db.getFindings({ runId: RUN, offset: 0, limit: 100000 })).rejects.toThrow();
    expect(fs.existsSync(file)).toBe(false);
  });

  it("저장 위치에 쓸 수 없으면 오류를 내고 반쯤 쓴 파일을 남기지 않는다", async () => {
    const file = path.join(dir, "no-such-dir", "x.csv");
    await expect(db.exportFindingsCsv({ runId: RUN }, file)).rejects.toThrow();
    expect(fs.existsSync(path.join(dir, "no-such-dir"))).toBe(false);
  });
});
