// 회귀 시험: SEM-SACT-001(날짜 순서, 오류)과 SEM-SACT-006(line 번호 순서 휴리스틱, 경고)의 분리.
// line_of_therapy 는 선택 값이며 매뉴얼은 1 부터 시작하거나 연속일 것을 요구하지 않는다.
import { describe, it, expect } from "vitest";
import { DuckDBInstance } from "@duckdb/node-api";
import { loadSemanticRules } from "../src/load.js";

const rules = loadSemanticRules();
const rule = (id: string) => rules.find((r) => r.id === id)!;

async function run(id: string, rows: string): Promise<string[]> {
  const instance = await DuckDBInstance.create(":memory:");
  const con = await instance.connect();
  try {
    await con.run("CREATE TABLE SACT (sact_id BIGINT, person_id BIGINT, line_of_therapy BIGINT, regimen_start_date DATE, regimen_end_date DATE)");
    if (rows) await con.run(`INSERT INTO SACT VALUES ${rows}`);
    const res = await con.runAndReadAll(rule(id).sql);
    return res.getRowObjects().map((r) => String(r.row_key));
  } finally {
    con.closeSync();
    instance.closeSync();
  }
}

describe("SEM-SACT-001 / 006 분리", () => {
  it("심각도: 001 은 오류, 006 은 경고", () => {
    expect(rule("SEM-SACT-001").severity).toBe("error");
    expect(rule("SEM-SACT-006").severity).toBe("warning");
  });

  it("처음 관찰된 요법이 line 2 이면 006 경고만 나고 001 오류는 없다", async () => {
    const rows = "(1, 10, 2, DATE '2022-01-01', DATE '2022-02-01')";
    expect(await run("SEM-SACT-001", rows)).toEqual([]);
    expect(await run("SEM-SACT-006", rows)).toEqual(["1"]);
  });

  it("종료일이 시작일보다 앞서면 001 오류이고 006 은 line 이 맞으면 조용하다", async () => {
    const rows = "(1, 10, 1, DATE '2022-03-01', DATE '2022-02-01')";
    expect(await run("SEM-SACT-001", rows)).toEqual(["1"]);
    expect(await run("SEM-SACT-006", rows)).toEqual([]);
  });

  it("line_of_therapy 가 비어 있으면 006 은 위반하지 않는다", async () => {
    const rows = "(1, 10, NULL, DATE '2022-01-01', DATE '2022-02-01'), (2, 10, NULL, DATE '2022-03-01', DATE '2022-04-01')";
    expect(await run("SEM-SACT-006", rows)).toEqual([]);
  });

  it("시작일 순서와 맞는 line 1, 2 는 위반이 없다", async () => {
    const rows = "(1, 10, 1, DATE '2022-01-01', DATE '2022-02-01'), (2, 10, 2, DATE '2022-03-01', DATE '2022-04-01')";
    expect(await run("SEM-SACT-001", rows)).toEqual([]);
    expect(await run("SEM-SACT-006", rows)).toEqual([]);
  });

});
