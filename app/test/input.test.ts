// 입력 정규화의 'NA' 처리: 내보내기 도구가 빈 값 대신 적는 NA 는 빈 값으로 바꾸지만,
// LYMPHOMA.cell_of_origin 의 NA 는 매뉴얼이 정한 값(DLBCL 이 아니면 NA)이라 그대로 둔다.
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { setRoot, loadSpec } from "@engine/index.js";
import type { Spec } from "@engine/types.js";
import type { InputPlan } from "@shared/types";
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

describe("입력 무결성: 컬럼명 겹침 · 버려질 칸", () => {
  const setup = (name: string, csv: string) => {
    const dir = path.join(work, name);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "PERSON.csv");
    fs.writeFileSync(file, csv, "utf-8");
    const plan = buildPlan("LYMPHOMA", ["PERSON"], spec, inspectPaths([dir]), undefined, []);
    return { dir, file, plan, texts: plan.tables[0].issues.filter((i) => i.level === "error").map((i) => i.text) };
  };
  const stage = (plan: InputPlan, name: string) => stageInputs(plan.candidates, plan.mapping, path.join(work, `${name}-staged`), spec);

  it("PERSON_ID 와 Person_Id 는 정규화 뒤 같은 person_id 라 점검에서 막고 스테이징도 거부한다", () => {
    const { plan, texts } = setup("collide", "PERSON_ID,Person_Id\n1,2\n");
    expect(plan.ok).toBe(false);
    expect(texts.join("\n")).toMatch(/PERSON\.csv.*PERSON_ID.*Person_Id.*person_id/);
    expect(() => stage(plan, "collide")).toThrow(/PERSON_ID.*Person_Id.*person_id/);
  });

  it("헤더에 이름 없는 칸에 값이 있으면 (표본 20행 밖이라도) 파일과 행 위치를 알리고 막는다", () => {
    const rows = ["person_id"];
    for (let i = 1; i <= 40; i++) rows.push(i === 35 ? `${i},oops` : `${i}`);
    const { plan, texts } = setup("extra-cell", rows.join("\n") + "\n");
    expect(plan.ok).toBe(false);
    expect(texts.join("\n")).toMatch(/PERSON\.csv.*데이터 35번째 행\(파일 36번째 줄\).*oops/);
  });

  it("행이 헤더보다 짧으면 막는다", () => {
    const { plan, texts } = setup("short-row", "person_id,sex\n1,M\n2\n3,F\n");
    expect(plan.ok).toBe(false);
    expect(texts.join("\n")).toMatch(/PERSON\.csv.*데이터 2번째 행\(파일 3번째 줄\)/);
  });

  it("끝의 빈 헤더 · 빈 값 흔적(',,')은 그대로 받는다", () => {
    const { plan, lines } = stageOne("PERSON", "person_id,sex,,\n1,M,,\n2,F,,\n3,M,,,\n", "trailing-ok");
    expect(plan.tables[0].issues.some((i) => i.level === "error")).toBe(false);
    expect(lines).toEqual(["person_id,sex", "1,M", "2,F", "3,M"]);
  });

  it("점검 뒤 원본이 바뀌어도 스테이징이 다시 막는다", () => {
    const { file, plan } = setup("changed-after", "person_id\n1\n2\n");
    expect(plan.ok).toBe(true);
    fs.writeFileSync(file, "person_id\n1\n2,lost\n", "utf-8");
    expect(() => stage(plan, "changed-after")).toThrow(/PERSON\.csv.*데이터 2번째 행.*lost/);
    fs.writeFileSync(file, "person_id,PERSON_ID\n1,2\n", "utf-8");
    expect(() => stage(plan, "changed-after")).toThrow(/겹칩니다/);
  });
});
