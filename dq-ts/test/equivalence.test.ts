// 회귀 시험: 6개 코호트 × (clean, dirty, good) 를 실행해
//   (1) clean · good 은 위반 0 · 규칙 오류 0, dirty 는 주입 오류 전부 검출
//   (2) Python 참조 구현(dq/reports)과 findings.csv · report.md · summary.json 이 같음
// 을 확인한다. 규칙이나 엔진을 바꾼 뒤에는 이 시험이 기준선이다.
// Python 쪽 보고서는 `python3 dq/run_all.py` 로 만든다.
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getRoot } from "../src/load.js";
import { runEngine } from "../src/engine.js";
import { COHORTS, verify } from "../src/verify.js";
import type { Summary } from "../src/types.js";

const ROOT = getRoot();
const OUT = path.join(ROOT, "dq-ts/output/test-reports");
const TODAY = "2026-09-07";
const KINDS = ["clean", "dirty", "good"] as const;
const dataDir = (kind: string, c: string) => path.join(ROOT, `synth/output/${kind}/${c}`);
const pyDir = (kind: string, c: string) => path.join(ROOT, `dq/reports/${kind}_${c}`);
const tsDir = (kind: string, c: string) => path.join(OUT, `${kind}_${c}`);
const runs = KINDS.flatMap((kind) => COHORTS.map((c) => ({ kind, c })));
const ready = (kind: string, c: string) => fs.existsSync(dataDir(kind, c)) && fs.existsSync(path.join(pyDir(kind, c), "summary.json"));
const readSummary = (dir: string): Summary => JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf-8"));

beforeAll(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  for (const { kind, c } of runs) {
    if (!fs.existsSync(dataDir(kind, c))) continue;
    await runEngine({ cohort: c, today: TODAY, data: dataDir(kind, c), out: tsDir(kind, c) });
  }
}, 600_000);

describe("검출 성능", () => {
  for (const c of COHORTS) {
    it(`${c}: clean 오탐 0, dirty 재현율 1.00`, () => {
      const v = verify(c, OUT);
      expect(v.clean.violations).toBe(0);
      expect(v.faults_detected).toBe(v.faults_total);
      expect(v.recall).toBe(1);
      expect(v.fault_types_fully_detected).toBe(v.fault_types);
    });
  }
  for (const c of COHORTS) {
    for (const kind of ["clean", "good"]) {
      it(`${c} ${kind}: 위반 0 · 규칙 오류 0 · 표준 규칙만 실행`, () => {
        const s = readSummary(tsDir(kind, c));
        expect({ violations: s.violations_total, errors: s.rules_error, disabled: s.rules_disabled }).toEqual({ violations: 0, errors: 0, disabled: 0 });
        expect(s.rules.every((r) => r.origin === "standard")).toBe(true);
      });
    }
  }
});

describe("Python 참조 구현과 동등성", () => {
  it("18개 실행(6개 코호트 × clean·dirty·good) 모두 데이터와 Python 보고서가 있다", () => {
    expect(runs.filter(({ kind, c }) => !ready(kind, c)).map(({ kind, c }) => `${kind}_${c}`)).toEqual([]);
  });

  for (const { kind, c } of runs) {
    describe.skipIf(!ready(kind, c))(`${kind}_${c}`, () => {
      const read = (dir: string, f: string) => fs.readFileSync(path.join(dir, f), "utf-8");
      it("findings.csv 가 Python 과 글자 단위로 같다", () => {
        expect(read(tsDir(kind, c), "findings.csv")).toBe(read(pyDir(kind, c), "findings.csv"));
      });
      it("report.md 가 Python 과 글자 단위로 같다", () => {
        expect(read(tsDir(kind, c), "report.md")).toBe(read(pyDir(kind, c), "report.md"));
      });
      it("summary.json 이 Python 과 같다 (값 · 키 순서)", () => {
        const ts = readSummary(tsDir(kind, c)), py = readSummary(pyDir(kind, c));
        expect(ts).toEqual(py);
        expect(Object.keys(ts)).toEqual(Object.keys(py));
        expect(Object.keys(ts.rules[0])).toEqual(Object.keys(py.rules[0]));
      });
    });
  }
});
