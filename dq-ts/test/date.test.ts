// 검증 기준일 기본값: 한국 시간 오전 9시 전에도 UTC 전날이 아니라 한국 날짜여야 한다
import { describe, it, expect } from "vitest";
import { seoulToday } from "../src/date.js";
import { runStructural } from "../src/structural.js";
import type { RawTable, StructuralRule, Spec } from "../src/types.js";

describe("seoulToday", () => {
  it("서울 00:00, 08:59, 09:00 모두 같은 날짜", () => {
    for (const utc of ["2026-11-19T15:00:00Z", "2026-11-19T23:59:00Z", "2026-11-20T00:00:00Z"]) expect(seoulToday(new Date(utc))).toBe("2026-11-20");
    expect(seoulToday(new Date("2026-11-19T14:59:00Z"))).toBe("2026-11-19");
  });

  it("서울 08:30 기본 기준일로 당일 방문은 미래 날짜가 아니고, 다음 날 방문은 미래 날짜다", () => {
    const today = seoulToday(new Date("2026-11-19T23:30:00Z"));
    const rule = { id: "ST-0038", name: "미래 날짜", category: "Plausibility", table: "VISIT_OCCURRENCE", fields: ["visit_start_date"], severity: "error", check: "not_future", params: {}, scope: "all" } as unknown as StructuralRule;
    const vals = ["2026-11-20", "2026-11-21"];
    const df: RawTable = { columns: ["visit_occurrence_id", "person_id", "visit_start_date"], n: 2,
      cols: new Map([["visit_occurrence_id", ["1", "2"]], ["person_id", ["1", "1"]], ["visit_start_date", vals]]) };
    const spec = { tables: { VISIT_OCCURRENCE: { name: "VISIT_OCCURRENCE", kor: "방문", category: "core", pk: "visit_occurrence_id", fields: [] } } } as unknown as Spec;
    const found: string[] = [];
    runStructural({ cohort: "LUNG_CANCER", today: new Date(`${today}T00:00:00Z`), spec, codelists: new Map(), tablesInCohort: ["VISIT_OCCURRENCE"], raw: new Map([["VISIT_OCCURRENCE", df]]) } as never,
      [rule], { initStat: () => ({ status: "pass", violations: 0, rows_checked: 0 }) as never, add: (_r: unknown, _t: string, _f: string, _k: string, _p: string, d: string) => { found.push(d); } } as never);
    expect(found).toEqual(["visit_start_date=2026-11-21 미래 날짜"]);
  });
});
