// 선택 테이블 CONCEPT·VOCABULARY 와 선택 컬럼(원천 코드): 내지 않으면 건너뛰고, 내면 개념 ID 를 표준 용어와 대조한다.
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getRoot, loadSpec } from "../src/load.js";
import { Engine } from "../src/engine.js";
import { readCsv, writeCsv } from "../src/csv.js";
import type { RawTable } from "../src/types.js";

const ROOT = getRoot();
const COHORT = "LUNG_CANCER";
const SRC = path.join(ROOT, "synth/output/good", COHORT);
const TODAY = "2026-09-07";
const CONCEPT_COLS = ["concept_id", "concept_name", "domain_id", "vocabulary_id", "concept_class_id", "standard_concept", "concept_code", "valid_start_date", "valid_end_date", "invalid_reason"];

const rowsOf = (t: RawTable): Record<string, string>[] =>
  Array.from({ length: t.n }, (_, i) => Object.fromEntries(t.columns.map((c) => [c, t.cols.get(c)![i]])));

async function run(dir: string): Promise<Engine> {
  const e = new Engine({ cohort: COHORT, today: TODAY }).load(dir);
  e.runStructural();
  await e.runSemantic();
  return e;
}

/** 견본의 모든 개념 값을 명세의 대응대로 맞게 담은 CONCEPT 행 */
function conceptRows(dir: string): Map<string, Record<string, string>> {
  const spec = loadSpec();
  const out = new Map<string, Record<string, string>>();
  for (const [t, st] of Object.entries(spec.tables)) {
    const p = path.join(dir, `${t}.csv`);
    if (!fs.existsSync(p)) continue;
    const df = readCsv(p);
    for (const f of st.fields) {
      const c = f.concept as { domain?: string; vocabularies?: string[] } | undefined;
      if (!c || !df.cols.has(f.name)) continue;
      for (const v of df.cols.get(f.name)!) {
        if (v === "" || v === "0" || out.has(v)) continue;
        out.set(v, { concept_id: v, concept_name: `c${v}`, domain_id: c.domain ?? "Meas Value", vocabulary_id: c.vocabularies?.[0] ?? "SNOMED",
          concept_class_id: "x", standard_concept: "S", concept_code: v, valid_start_date: "19700101", valid_end_date: "20991231", invalid_reason: "" });
      }
    }
  }
  return out;
}

let base: string;
beforeAll(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), "kai-vocab-"));
});

function copySample(name: string): string {
  const dir = path.join(base, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(SRC)) if (f.endsWith(".csv")) fs.copyFileSync(path.join(SRC, f), path.join(dir, f));
  return dir;
}

describe("선택 테이블·선택 컬럼", () => {
  it("내지 않으면 표준 용어 규칙은 건너뛰고 위반이 없다", async () => {
    const e = await run(copySample("none"));
    const concept = [...e.ruleStats.values()].filter((s) => s.check === "concept");
    expect(concept.length).toBeGreaterThan(0);
    // 선택 컬럼(원천 개념)이 없는 표도, CONCEPT 가 없는 표도 '선택 항목 미제출'로 건너뛴다(미검사와 구분)
    expect(concept.every((s) => s.status === "skipped" && s.note.startsWith("선택 항목 미제출: "))).toBe(true);
    expect(concept.filter((s) => s.note === "선택 항목 미제출: CONCEPT").length).toBeGreaterThan(10);
    expect(e.ruleStats.get("SEM-VOC-001")?.status).toBe("skipped");
    expect(e.findings).toEqual([]);
  });

  it("맞는 CONCEPT·VOCABULARY 를 내면 위반이 없다", async () => {
    const dir = copySample("ok");
    writeCsv(path.join(dir, "CONCEPT.csv"), CONCEPT_COLS, [...conceptRows(dir).values()]);
    writeCsv(path.join(dir, "VOCABULARY.csv"), ["vocabulary_id", "vocabulary_name", "vocabulary_reference", "vocabulary_version", "vocabulary_concept_id"],
      [{ vocabulary_id: "None", vocabulary_name: "OMOP Standardized Vocabularies", vocabulary_reference: "OMOP generated", vocabulary_version: "v5.0 29-AUG-26", vocabulary_concept_id: "44819096" }]);
    const e = await run(dir);
    expect(e.findings).toEqual([]);
    expect([...e.ruleStats.values()].filter((s) => s.check === "concept" && s.status === "pass").length).toBeGreaterThan(10);
  });

  it("없는 개념 · 비표준 · 영역 · 어휘 · 배포판 차이를 찾고, 원천 개념은 존재만 본다", async () => {
    const dir = copySample("bad");
    const concepts = conceptRows(dir);
    // 원천 코드 컬럼: 하나는 CONCEPT 에 있는 비표준 KCD7 개념(통과), 하나는 없는 개념(위반)
    const cond = readCsv(path.join(dir, "CONDITION_OCCURRENCE.csv"));
    const rows = rowsOf(cond);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    rows.forEach((r, i) => { r.condition_source_value = i === 0 ? "C34.1" : "C34.9"; r.condition_source_concept_id = i === 0 ? "45590000" : (i === 1 ? "999999999" : "0"); });
    writeCsv(path.join(dir, "CONDITION_OCCURRENCE.csv"), [...cond.columns, "condition_source_value", "condition_source_concept_id"], rows);
    concepts.set("45590000", { ...concepts.values().next().value!, concept_id: "45590000", domain_id: "Condition", vocabulary_id: "KCD7", standard_concept: "", concept_code: "C34.1" });
    // 진단 개념 하나는 비표준, 성별 개념은 빠짐, 단위 개념 하나는 영역과 어휘가 틀림
    const dx = rows[0].condition_concept_id;
    concepts.set(dx, { ...concepts.get(dx)!, standard_concept: "", invalid_reason: "U" });
    const gender = readCsv(path.join(dir, "PERSON.csv")).cols.get("gender_concept_id")![0];
    concepts.delete(gender);
    const unit = readCsv(path.join(dir, "MEASUREMENT.csv")).cols.get("unit_concept_id")!.find((v) => v !== "" && v !== "0")!;
    concepts.set(unit, { ...concepts.get(unit)!, domain_id: "Measurement", vocabulary_id: "LOINC" });
    writeCsv(path.join(dir, "CONCEPT.csv"), CONCEPT_COLS, [...concepts.values()]);
    writeCsv(path.join(dir, "VOCABULARY.csv"), ["vocabulary_id", "vocabulary_name", "vocabulary_reference", "vocabulary_version", "vocabulary_concept_id"],
      [{ vocabulary_id: "None", vocabulary_name: "OMOP Standardized Vocabularies", vocabulary_reference: "OMOP generated", vocabulary_version: "v5.0 27-FEB-25", vocabulary_concept_id: "44819096" }]);

    const e = await run(dir);
    const by = (field: string) => [...new Set(e.findings.filter((f) => f.field === field).map((f) => f.detail))];
    expect(e.findings.every((f) => f.severity === "warning")).toBe(true);
    expect(by("condition_source_concept_id")).toEqual(["condition_source_concept_id=999999999 CONCEPT 에 없음"]);
    expect(by("condition_concept_id")).toEqual([`condition_concept_id=${dx} standard_concept=NULL, invalid_reason=U`]);
    expect(by("gender_concept_id")).toEqual([`gender_concept_id=${gender} CONCEPT 에 없음`]);
    expect(by("unit_concept_id")).toEqual([`unit_concept_id=${unit} domain_id=Measurement (요구 Unit), vocabulary_id=LOINC (허용 UCUM)`]);
    expect(e.findings.filter((f) => f.rule_id === "SEM-VOC-001").map((f) => f.detail))
      .toEqual(["vocabulary_version=v5.0 27-FEB-25 는 기준 배포판 v5.0 29-AUG-26(v20260829) 이 아님"]);
    // 원천 코드 컬럼은 선택이라 '컬럼 누락'이 아니고, 넣으면 타입 검사를 받는다
    expect(e.findings.some((f) => f.detail.startsWith("컬럼 누락"))).toBe(false);
    expect(e.findings.some((f) => f.detail.startsWith("명세에 없는 컬럼"))).toBe(false);
  });
});
