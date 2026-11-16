import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { CRITERIA_FILES, type CriteriaSnapshot } from "@shared/criteria";
import { criteriaSnapshotRoot, readCriteriaSnapshot, writeCriteriaSnapshot, CRITERIA_ZIP, CRITERIA_SNAPSHOT_JSON } from "../src/main/snapshot";
import { exportBundle, runOutputs } from "../src/main/outputs";

vi.mock("electron", () => ({ app: { getVersion: () => "snapshot-test" } }));
const REPO = path.resolve(__dirname, "../..");

function makeSnapshot(): CriteriaSnapshot {
  return {
    schema: "kai-criteria-snapshot/1", createdAt: "2026-11-17T09:00:00.000Z",
    criteria: {
      manifest: { schema: "kai-criteria/1", name: "test-criteria", version: "1.0.0", manual: "", publisher: "테스트", minAppVersion: "1.0.1", files: {} },
      hash: "h-original", source: "builtin", tables: 1, fields: 1, rules: 1, cohorts: ["LUNG_CANCER"],
    },
    standardHash: "std", effectiveHash: "eff", adminMode: false, today: "2026-11-17", overrides: {},
    tables: [{ table: "PERSON", kor: "환자", category: "core", fields: [{ name: "person_id", type: "string", required: true, desc: "환자 ID", codes: [] }] }],
    rules: [{
      id: "SEM-COM-001", name: "원본 규칙", category: "Conformance", subcategory: "x", severity: "error", table: "PERSON", fields: "person_id", check: "cross",
      desc: "원본", scope: "all", kind: "semantic", sql: "SELECT 1 AS original_sql", origin: "standard", disabled: false, standardSeverity: "error",
    }],
  };
}

let tmp: string;
let baseline: string;
let runDir: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kai-snapshot-"));
  baseline = path.join(tmp, "baseline");
  runDir = path.join(tmp, "run");
  for (const rel of CRITERIA_FILES) {
    const dest = path.join(baseline, ...rel.split("/"));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(REPO, ...rel.split("/")), dest);
  }
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("실행 기준 스냅샷", () => {
  it("현재 기준을 바꿔도 보관된 스냅샷은 그대로이고 ZIP 은 당시 원본과 같다", () => {
    const original = new Map(CRITERIA_FILES.map((rel) => [rel, fs.readFileSync(path.join(baseline, ...rel.split("/")))]));
    const snap = makeSnapshot();
    writeCriteriaSnapshot(baseline, runDir, snap);

    // 현재(앱 내장) 기준을 나중에 바꾼다
    for (const rel of CRITERIA_FILES) fs.appendFileSync(path.join(baseline, ...rel.split("/")), "\n# changed after the run\n");

    const root = criteriaSnapshotRoot(runDir);
    for (const rel of CRITERIA_FILES) expect(fs.readFileSync(path.join(root, ...rel.split("/"))).equals(original.get(rel)!)).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"))).toEqual(snap.criteria.manifest);

    const zip = unzipSync(new Uint8Array(fs.readFileSync(path.join(runDir, CRITERIA_ZIP))));
    expect(Object.keys(zip).sort()).toEqual([...CRITERIA_FILES, "manifest.json"].sort());
    for (const rel of CRITERIA_FILES) expect(Buffer.from(zip[rel]).equals(original.get(rel)!)).toBe(true);

    const read = readCriteriaSnapshot(runDir)!;
    expect(read).toEqual(snap);
    expect(read.rules[0].sql).toBe("SELECT 1 AS original_sql");
    expect(read.criteria.hash).toBe("h-original");
  });

  it("같은 실행 폴더에 다시 쓰면 실패하고 기존 파일은 그대로다", () => {
    writeCriteriaSnapshot(baseline, runDir, makeSnapshot());
    const files = [path.join(runDir, CRITERIA_ZIP), path.join(runDir, CRITERIA_SNAPSHOT_JSON), path.join(criteriaSnapshotRoot(runDir), "manifest.json")];
    const before = files.map((f) => fs.readFileSync(f));
    const changed = makeSnapshot();
    changed.criteria.hash = "h-other";
    expect(() => writeCriteriaSnapshot(baseline, runDir, changed)).toThrow();
    files.forEach((f, i) => expect(fs.readFileSync(f).equals(before[i])).toBe(true));
    expect(readCriteriaSnapshot(runDir)!.criteria.hash).toBe("h-original");
  });

  it("중간에 실패하면 이번에 만든 파일만 치운다", () => {
    // 1) 기준 파일 하나가 없으면 아무것도 만들지 않는다
    fs.rmSync(path.join(baseline, "rules", "rules_semantic.yaml"));
    expect(() => writeCriteriaSnapshot(baseline, runDir, makeSnapshot())).toThrow(/rules_semantic/);
    expect(fs.existsSync(runDir)).toBe(false);

    // 2) criteria.zip 이 이미 있으면 거기서 실패하고, 앞서 만든 criteria/ 만 치우며 기존 파일은 남긴다
    fs.copyFileSync(path.join(REPO, "rules", "rules_semantic.yaml"), path.join(baseline, "rules", "rules_semantic.yaml"));
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, CRITERIA_ZIP), "existing");
    expect(() => writeCriteriaSnapshot(baseline, runDir, makeSnapshot())).toThrow();
    expect(fs.existsSync(criteriaSnapshotRoot(runDir))).toBe(false);
    expect(fs.existsSync(path.join(runDir, CRITERIA_SNAPSHOT_JSON))).toBe(false);
    expect(fs.readFileSync(path.join(runDir, CRITERIA_ZIP), "utf8")).toBe("existing");
  });

  it("스냅샷이 없는 이전 실행은 null, 깨진 스냅샷은 숨기지 않고 오류", () => {
    fs.mkdirSync(runDir, { recursive: true });
    expect(readCriteriaSnapshot(runDir)).toBeNull();
    expect(readCriteriaSnapshot(path.join(tmp, "no-such-run"))).toBeNull();
    fs.writeFileSync(path.join(runDir, CRITERIA_SNAPSHOT_JSON), "{ broken");
    expect(() => readCriteriaSnapshot(runDir)).toThrow();
    fs.writeFileSync(path.join(runDir, CRITERIA_SNAPSHOT_JSON), JSON.stringify({ schema: "other" }));
    expect(() => readCriteriaSnapshot(runDir)).toThrow(/형식/);
  });

  it("출력물 목록에 두 파일이 외부 제출 금지로 있고 묶음에 함께 복사된다", () => {
    writeCriteriaSnapshot(baseline, runDir, makeSnapshot());
    fs.writeFileSync(path.join(runDir, "report.md"), "# report");
    const outs = runOutputs(runDir).files;
    for (const key of ["criteria", "criteriaSnapshot"]) {
      const f = outs.find((o) => o.key === key)!;
      expect(f.size).toBeGreaterThan(0);
      expect(f.shareable).toBe(false);
    }
    const dest = exportBundle(runDir, "run-1", path.join(tmp, "export"));
    expect(fs.readFileSync(path.join(dest, CRITERIA_ZIP)).equals(fs.readFileSync(path.join(runDir, CRITERIA_ZIP)))).toBe(true);
    expect(fs.readFileSync(path.join(dest, CRITERIA_SNAPSHOT_JSON), "utf8")).toBe(fs.readFileSync(path.join(runDir, CRITERIA_SNAPSHOT_JSON), "utf8"));
    const readme = fs.readFileSync(path.join(dest, "README.txt"), "utf8");
    expect(readme).toContain(CRITERIA_ZIP);
    expect(readme).toMatch(new RegExp(`${CRITERIA_ZIP.replace(".", "\\.")}[^\\n]*\\[외부 제출 금지\\]`));
  });

  it("스냅샷이 없는 이전 실행의 묶음은 기준 파일을 있는 것처럼 안내하지 않는다", () => {
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, "report.md"), "# report");
    const dest = exportBundle(runDir, "legacy", path.join(tmp, "export"));
    expect(fs.existsSync(path.join(dest, CRITERIA_ZIP))).toBe(false);
    expect(fs.readFileSync(path.join(dest, "README.txt"), "utf8")).not.toContain(CRITERIA_ZIP);
  });
});
