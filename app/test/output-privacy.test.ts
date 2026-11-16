import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Engine } from "@engine/engine.js";
import { setRoot, loadSpec, loadProfiles, loadStructuralRules, loadSemanticRules, ruleSetHash, describeOverrides } from "@engine/index.js";
import { applyChange, saveOverrides, loadOverrides, buildRuleSetInfo } from "../src/main/ruleset";
import { writeExtraOutputs } from "../src/main/outputs";

vi.mock("electron", () => ({ app: { getVersion: () => "review-test" } }));
const ROOT = path.resolve(__dirname, "../..");
const DATA = path.join(ROOT, "synth/output/good/LUNG_CANCER");

function context() {
  setRoot(ROOT);
  return { spec: loadSpec(), cohortIds: Object.keys(loadProfiles()), base: { structural: loadStructuralRules(), semantic: loadSemanticRules() } };
}

describe("외부 결과와 저장된 관리자 규칙", () => {
  it("모드를 끄고 저장 설정을 다시 읽어도 SQL은 실행되고 편집은 거부된다", async () => {
    const ctx = context();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kai-admin-persist-"));
    try {
      const sql = "SELECT person_id, CAST(person_id AS VARCHAR) AS row_key, 'review finding' AS detail FROM PERSON";
      const changed = applyChange(ctx, {}, { op: "sql", id: "SEM-COM-001", sql }, true).overrides;
      saveOverrides(dir, changed);
      const loaded = loadOverrides(dir, ctx);
      expect(() => applyChange(ctx, loaded, { op: "sql", id: "SEM-COM-001", sql: sql + " WHERE FALSE" }, false)).toThrow();
      const engine = new Engine({ cohort: "LUNG_CANCER", today: "2026-09-07", overrides: loaded, adminMode: false }).load(DATA);
      await engine.runSemantic();
      expect(engine.ruleStats.get("SEM-COM-001")).toMatchObject({ origin: "admin", status: "fail", violations: engine.raw.get("PERSON")!.n });
      const summary = engine.write(dir);
      const ruleSet = buildRuleSetInfo(loaded, false, { standard: ruleSetHash(), effective: ruleSetHash(loaded) }, describeOverrides(loaded));
      writeExtraOutputs(dir, summary, { cohortKor: "폐암", label: "review", runId: "review", ruleSet });
      const submission = JSON.parse(fs.readFileSync(path.join(dir, "submission.json"), "utf8"));
      expect(submission.rule_set).toMatchObject({ admin_mode: false, admin_modified: true, admin: ["SEM-COM-001"] });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("입력 식별자와 SQL 오류의 원문 값은 외부용 파일에 없고 내부 진단에는 남는다", async () => {
    context();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kai-public-output-"));
    const id = "HOSP_A_001";
    const note = "SYNTHETIC_PATIENT_NAME_ABC";
    const overrides = { customSql: [{ id: "ADM-001", name: "변환 검사", category: "Conformance" as const, severity: "error" as const, scope: "all" as const, requires: ["NOTE"], sql: "SELECT person_id, CAST(note_id AS VARCHAR) AS row_key, CAST(note_text AS INTEGER) AS detail FROM NOTE" }] };
    try {
      const engine = new Engine({ cohort: "LUNG_CANCER", today: "2026-09-07", overrides, adminMode: false }).load(DATA);
      const person = engine.raw.get("PERSON")!;
      person.cols.get("person_id")![0] = id;
      for (const values of person.cols.values()) values.push(values[0]);
      person.n++;
      engine.raw.get("NOTE")!.cols.get("note_text")![0] = note;
      engine.runStructural();
      await engine.runSemantic();
      const summary = engine.write(dir);
      expect(summary.rules.find((r) => r.rule_id === "ADM-001")).toMatchObject({ status: "error" });
      expect(summary.rules.find((r) => r.rule_id === "ADM-001")!.note).toContain(note);
      const ruleSet = buildRuleSetInfo(overrides, false, { standard: ruleSetHash(), effective: ruleSetHash(overrides) }, describeOverrides(overrides));
      writeExtraOutputs(dir, summary, { cohortKor: "폐암", label: "review", runId: "review", ruleSet });
      for (const file of ["report.md", "summary.json", "rule_results.csv", "submission.json"]) {
        const text = fs.readFileSync(path.join(dir, file), "utf8");
        expect(text, file).not.toContain(id);
        expect(text, file).not.toContain(note);
        expect(text, file).not.toContain("Conversion Error");
      }
      expect(fs.readFileSync(path.join(dir, "findings.csv"), "utf8")).toContain(id);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
