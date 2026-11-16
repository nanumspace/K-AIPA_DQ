// 입력 정규화의 'NA' 처리: 내보내기 도구가 빈 값 대신 적는 NA 는 빈 값으로 바꾸지만,
// LYMPHOMA.cell_of_origin 의 NA 는 매뉴얼이 정한 값(DLBCL 이 아니면 NA)이라 그대로 둔다.
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { setRoot, loadSpec } from "@engine/index.js";
import type { Spec } from "@engine/types.js";
import { inspectPaths, buildPlan, stageInputs, normalizeCell } from "../src/main/input";

const ROOT = path.resolve(__dirname, "../..");
let spec: Spec;
let work: string;

beforeAll(() => {
  setRoot(ROOT);
  spec = loadSpec();
  work = fs.mkdtempSync(path.join(os.tmpdir(), "kai-input-"));
});

/** 표 하나짜리 CSV 를 정규화해 읽어 돌아온 줄들을 본다 */
function stageOne(table: string, csv: string, name: string) {
  const dir = path.join(work, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${table}.csv`), csv, "utf-8");
  const candidates = inspectPaths([dir]);
  const plan = buildPlan("LYMPHOMA", [table], spec, candidates, undefined, []);
  const out = path.join(work, `${name}-staged`);
  const norm = stageInputs(plan.candidates, plan.mapping, out, spec);
  return { plan, norm: norm[table], lines: fs.readFileSync(path.join(out, `${table}.csv`), "utf-8").trimEnd().split("\n") };
}

describe("NA 글자 처리", () => {
  it("normalizeCell: 일반 컬럼의 NA · N/A · NULL 은 빈 값, 값 컬럼(keepNA)의 'NA' 만 그대로", () => {
    for (const v of ["NA", "N/A", "NULL", "null", "n/a", "#N/A", "None", "nan"]) expect(normalizeCell(v, "varchar")).toBe("");
    expect(normalizeCell("NA", "varchar", undefined, true)).toBe("NA");
    // 값 컬럼에서도 다른 도구 흔적은 그대로 빈 값으로 본다
    for (const v of ["N/A", "NULL", "null", "n/a", "#N/A", "None"]) expect(normalizeCell(v, "varchar", undefined, true)).toBe("");
    // 'NA' 와 비슷한 진짜 값은 건드리지 않는다
    for (const v of ["NAME", "GCB", "ABC/non-GCB"]) expect(normalizeCell(v, "varchar", undefined, true)).toBe(v);
  });

  it("LYMPHOMA.cell_of_origin 의 NA 는 값으로 남고 다른 컬럼의 NA 는 빈 값이 된다", () => {
    const { lines, norm, plan } = stageOne("LYMPHOMA",
      ["lymphoma_id,cell_of_origin,double_expressor_yn,t_14_18_result",
        "1,NA,NA,NA", "2,GCB,NA,positive", "3,N/A,1,NULL", "4,NULL,0,negative"].join("\n") + "\n", "lymphoma-na");
    expect(plan.tables[0].missingColumns.length).toBeGreaterThan(0);   // 일부 컬럼만 넣은 시험 파일
    expect(lines[0]).toBe("lymphoma_id,cell_of_origin,double_expressor_yn,t_14_18_result");
    expect(lines.slice(1)).toEqual([
      "1,NA,,",       // cell_of_origin 의 NA 는 값, 나머지 NA 는 빈 값
      "2,GCB,,positive",
      "3,,1,",        // 'N/A' · 'NULL' 은 이 컬럼에서도 도구의 흔적이라 빈 값 → 필수값 누락 규칙이 잡는다
      "4,,0,negative",
    ]);
    // 값으로 남긴 NA 는 '흔적을 걷은 건수'에 세지 않는다: 빈 값이 된 것만 센다 (NA 3 + N/A 1 + NULL 2 = 6)
    expect(norm.nullStrings).toBe(6);
  });

  it("다른 질환 표의 NA 는 그대로 빈 값으로 본다 (면제는 LYMPHOMA.cell_of_origin 하나뿐)", () => {
    const { lines } = stageOne("BREAST_CANCER", "breast_cancer_id,menopause_status\n1,NA\n2,1\n", "breast-na");
    expect(lines).toEqual(["breast_cancer_id,menopause_status", "1,", "2,1"]);
  });

  it("사전 점검의 표본 안내도 cell_of_origin 의 NA 는 세지 않는다", () => {
    const dir = path.join(work, "plan-na");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "LYMPHOMA.csv"), "lymphoma_id,cell_of_origin\n1,NA\n2,GCB\n", "utf-8");
    const plan = buildPlan("LYMPHOMA", ["LYMPHOMA"], spec, inspectPaths([dir]), undefined, []);
    expect(plan.tables[0].issues.some((i) => i.text.includes("NULL"))).toBe(false);
  });
});
