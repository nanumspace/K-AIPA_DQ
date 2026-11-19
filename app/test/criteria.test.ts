// 검증 기준 꾸러미: 점검·만들기·가져오기 준비(ZIP 사전 점검, 해시·버전, spec/규칙 일관성, 규칙 설정 충돌, 전역 루트 복원)
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { zipSync, unzipSync } from "fflate";
import { getRoot, setRoot, loadSpec, loadProfiles, loadStructuralRules, loadSemanticRules } from "@engine/index.js";
import type { RuleOverrides } from "@shared/types";
import { CRITERIA_FILES } from "@shared/criteria";
import { inspectCriteria, createCriteriaPackage, stageCriteriaPackage, compareSemver } from "../src/main/criteria";

const ROOT = path.resolve(__dirname, "../..");
const APP = "1.0.2";
const META = { name: "테스트 기준", version: "1.0.2", manual: "2026-11-16", publisher: "K-AI 코호트 구축 TF", minAppVersion: "1.0.0" };
let work: string;
let seq = 0;

const tmp = (label: string) => { const d = path.join(work, `${label}-${seq++}`); fs.mkdirSync(d, { recursive: true }); return d; };
const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");

/** 기준 7개를 새 폴더로 복사하고 파일별로 고친다 */
function variant(edit: Record<string, (s: string) => string> = {}): string {
  const dir = tmp("crit");
  for (const rel of CRITERIA_FILES) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    const text = fs.readFileSync(path.join(ROOT, rel), "utf-8");
    fs.writeFileSync(path.join(dir, rel), edit[rel] ? edit[rel](text) : text);
  }
  return dir;
}

const replaceOnce = (from: string | RegExp, to: string) => (s: string) => {
  const out = s.replace(from, to);
  if (out === s) throw new Error(`테스트 준비 실패: 바꿀 문자열이 없음 ${String(from)}`);
  return out;
};

const pack = (dir: string, meta = META) => createCriteriaPackage(dir, meta);
const stage = (bytes: Uint8Array, ov: RuleOverrides = {}, current = ROOT, app = APP) => stageCriteriaPackage(bytes, tmp("staging"), current, ov, app);

/** 만든 꾸러미를 풀어 고친 뒤 다시 묶는다 (해시·manifest 변조용) */
function repack(bytes: Uint8Array, edit: (e: Record<string, Uint8Array>) => void): Uint8Array {
  const e = unzipSync(bytes);
  edit(e);
  return zipSync(e);
}
const goodPackage = () => pack(variant());

/** 중앙 디렉터리의 항목 속성을 심볼릭 링크로 바꾼다 */
function makeSymlink(bytes: Uint8Array, name: string): Uint8Array {
  const out = bytes.slice();
  const dv = new DataView(out.buffer);
  let eocd = out.length - 22;
  while (dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
  let p = dv.getUint32(eocd + 16, true);
  for (let i = 0; i < dv.getUint16(eocd + 10, true); i++) {
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    if (new TextDecoder().decode(out.subarray(p + 46, p + 46 + nl)) === name) {
      dv.setUint16(p + 4, (3 << 8) | 20, true);
      dv.setUint32(p + 38, (0o120777 << 16) >>> 0, true);
      return out;
    }
    p += 46 + nl + xl + cl;
  }
  throw new Error("항목 없음");
}

beforeAll(() => { work = fs.mkdtempSync(path.join(os.tmpdir(), "kai-criteria-")); });
afterAll(() => { fs.rmSync(work, { recursive: true, force: true }); });
beforeEach(() => setRoot(ROOT));

describe("inspectCriteria", () => {
  it("내장 기준: 고정 메타와 해시, 집계가 엔진 로더와 같다", () => {
    const info = inspectCriteria(ROOT, "builtin", APP);
    expect(info.source).toBe("builtin");
    expect(info.manifest).toMatchObject({ schema: "kai-criteria/1", version: "1.0.2", manual: "2026-11-16", publisher: "K-AI 코호트 구축 TF" });
    expect(Object.keys(info.manifest.files)).toEqual([...CRITERIA_FILES]);
    for (const f of CRITERIA_FILES) expect(info.manifest.files[f]).toBe(sha(fs.readFileSync(path.join(ROOT, f))));
    const spec = loadSpec();
    expect(info.tables).toBe(Object.keys(spec.tables).length);
    expect(info.fields).toBe(Object.values(spec.tables).reduce((n, t) => n + t.fields.length, 0));
    expect(info.rules).toBe(loadStructuralRules().length + loadSemanticRules().length);
    expect(info.cohorts).toEqual(Object.keys(loadProfiles()));
    expect(info.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("앱 버전 형식이 틀리면 거절한다", () => {
    expect(() => inspectCriteria(ROOT, "builtin", "v1")).toThrow(/버전 형식/);
  });

  it("가져온 기준은 manifest 를 읽고, 같은 내용이면 내장과 같은 해시", () => {
    const dir = variant();
    const bytes = pack(dir);
    const { root, preview } = stage(bytes);
    const info = inspectCriteria(root, "imported", APP);
    expect(info.manifest.name).toBe(META.name);
    expect(info.manifest.version).toBe("1.0.2");
    expect(info.hash).toBe(inspectCriteria(ROOT, "builtin", APP).hash);
    expect(preview.info).toEqual(info);
  });

  it("symlink 로 된 기준 파일은 거절한다", () => {
    const dir = variant();
    const real = path.join(dir, "spec/concepts.yaml");
    const moved = path.join(dir, "concepts-real.yaml");
    fs.renameSync(real, moved);
    fs.symlinkSync(moved, real);
    expect(() => inspectCriteria(dir, "builtin", APP)).toThrow(/심볼릭/);
  });

  it("semver 비교: 사전 배포 표기는 정식보다 낮다", () => {
    expect(compareSemver("1.0.1", "1.0.0")).toBeGreaterThan(0);
    expect(compareSemver("1.0.1-beta", "1.0.1")).toBeLessThan(0);
    expect(compareSemver("1.10.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareSemver("2.0.0", "2.0.0")).toBe(0);
  });
});

describe("createCriteriaPackage", () => {
  it("꾸러미는 manifest.json 과 파일 7개만 담고 해시가 맞다 (왕복)", () => {
    const bytes = goodPackage();
    const entries = unzipSync(bytes);
    expect(Object.keys(entries).sort()).toEqual(["manifest.json", ...CRITERIA_FILES].sort());
    const manifest = JSON.parse(new TextDecoder().decode(entries["manifest.json"]));
    expect(manifest.schema).toBe("kai-criteria/1");
    for (const f of CRITERIA_FILES) {
      expect(manifest.files[f]).toBe(sha(entries[f]));
      expect(Buffer.from(entries[f]).equals(fs.readFileSync(path.join(ROOT, f)))).toBe(true);
    }
  });

  it("같은 입력이면 같은 바이트", () => {
    expect(Buffer.from(pack(variant())).equals(Buffer.from(pack(variant())))).toBe(true);
  });

  it("가져오기 후 모든 파일이 원본과 같다", () => {
    const { root } = stage(goodPackage());
    for (const f of CRITERIA_FILES) expect(fs.readFileSync(path.join(root, f)).equals(fs.readFileSync(path.join(ROOT, f)))).toBe(true);
    expect(fs.existsSync(path.join(root, "manifest.json"))).toBe(true);
  });

  it("잘못된 메타(버전 형식, 빈 이름)는 만들지 못한다", () => {
    expect(() => pack(variant(), { ...META, version: "abc" })).toThrow(/버전 형식/);
    expect(() => pack(variant(), { ...META, name: " " })).toThrow(/name/);
    expect(() => pack(variant(), { ...META, minAppVersion: "1.0" })).toThrow(/minAppVersion/);
  });
});

describe("내용 검증", () => {
  it("FK 참조 대상이 명세에 없으면 거절", () => {
    const dir = variant({ "spec/kai_cdm_spec.yaml": replaceOnce("ref: PERSON.person_id", "ref: NOPE.person_id") });
    expect(() => pack(dir)).toThrow(/참조/);
  });

  it("spec 필수 표시와 구조 규칙(not_null)이 어긋나면 거절 — 조용히 허용하지 않는다", () => {
    const dir = variant({ "spec/kai_cdm_spec.yaml": replaceOnce(/(- name: year_of_birth\n\s+type: integer\n\s+required: )true/, "$1false") });
    expect(() => pack(dir)).toThrow(/not_null/);
  });

  it("spec 범위와 구조 규칙 범위가 어긋나면 거절", () => {
    const dir = variant({ "rules/rules_structural.yaml": replaceOnce(/(check: range\n\s+params:\n\s+min: )1900/, "$11800") });
    expect(() => pack(dir)).toThrow(/범위/);
  });

  it("구조 규칙이 없는 테이블을 가리키면 거절", () => {
    const dir = variant({ "rules/rules_structural.yaml": replaceOnce("table: PERSON", "table: NOPE") });
    expect(() => pack(dir)).toThrow(/명세에 없는 테이블/);
  });

  it("코드표가 codelists 에 없으면 거절", () => {
    const dir = variant({ "spec/kai_cdm_spec.yaml": replaceOnce("codelist: OMOP.gender_concept_id", "codelist: OMOP.nothing") });
    expect(() => pack(dir)).toThrow(/코드표/);
  });

  it("교차 규칙의 requires 테이블·SQL 안전 점검", () => {
    expect(() => pack(variant({ "rules/rules_semantic.yaml": replaceOnce("requires: [VISIT_OCCURRENCE]", "requires: [NOPE]") }))).toThrow(/requires/);
    expect(() => pack(variant({ "rules/rules_semantic.yaml": replaceOnce("SELECT person_id,", "DROP TABLE PERSON; SELECT person_id,") }))).toThrow(/SEM-COM-001/);
  });

  it("규칙 ID 중복·예약 접두사(USR/ADM) 거절", () => {
    expect(() => pack(variant({ "rules/rules_semantic.yaml": replaceOnce("id: SEM-COM-001", "id: ADM-001") }))).toThrow(/ID/);
    expect(() => pack(variant({ "rules/rules_semantic.yaml": replaceOnce("id: SEM-COM-001", "id: ST-0001") }))).toThrow(/겹칩니다/);
  });

  it("코호트가 명세에 없는 테이블을 쓰면 거절", () => {
    const dir = variant({ "spec/cohort_profiles.yaml": replaceOnce("- NOTE", "- NOPE_TABLE") });
    expect(() => pack(dir)).toThrow(/cohort_profiles/);
  });

  it("constraints 와 spec 이 다르면 거절", () => {
    const dir = variant({ "spec/constraints.yaml": replaceOnce("PERSON.month_of_birth:\n    range:\n    - 1\n    - 12", "PERSON.month_of_birth:\n    range:\n    - 1\n    - 13") });
    expect(() => pack(dir)).toThrow(/constraints/);
  });

  it("YAML 중복 키·별칭 폭탄 거절", () => {
    expect(() => pack(variant({ "spec/constraints.yaml": (s) => s + "\nfields: {}\n" }))).toThrow(/YAML 오류/);
    const bomb = "\nbomb: [&a x, " + Array.from({ length: 300 }, () => "*a").join(", ") + "]\n";
    expect(() => pack(variant({ "spec/concepts.yaml": (s) => s + bomb }))).toThrow(/별칭/);
  });

  it("UTF-8 이 아닌 파일 거절", () => {
    const dir = variant();
    fs.appendFileSync(path.join(dir, "spec/concepts.yaml"), Buffer.from([0xff, 0xfe, 0x0a]));
    expect(() => pack(dir)).toThrow(/UTF-8/);
  });
});

describe("stageCriteriaPackage: ZIP 사전 점검", () => {
  const base = () => unzipSync(goodPackage());

  it("경로 탈출·절대 경로·추가 파일 거절", () => {
    for (const bad of ["../evil.yaml", "spec/../../evil.yaml", "/abs.yaml", "spec\\x.yaml", "extra.txt", "spec/extra.yaml"]) {
      const bytes = zipSync({ ...base(), [bad]: new Uint8Array([1]) });
      expect(() => stage(bytes), bad).toThrow(/허용되지 않는/);
    }
  });

  it("필요한 파일이 빠지면 거절", () => {
    const e = base();
    delete e["spec/concepts.yaml"];
    expect(() => stage(zipSync(e))).toThrow(/필요한 파일이 없습니다/);
    const e2 = base();
    delete e2["manifest.json"];
    expect(() => stage(zipSync(e2))).toThrow(/manifest\.json/);
  });

  it("ZIP 이 아닌 바이트 거절", () => {
    expect(() => stage(new Uint8Array(200).fill(7))).toThrow(/ZIP/);
    expect(() => stage(new Uint8Array(5))).toThrow(/ZIP/);
  });

  it("심볼릭 링크 항목 거절", () => {
    expect(() => stage(makeSymlink(goodPackage(), "spec/concepts.yaml"))).toThrow(/심볼릭/);
  });

  it("파일 하나가 10MB 를 넘거나 전체가 50MB 를 넘는 압축 폭탄 거절", () => {
    const big = base();
    big["spec/concepts.yaml"] = new Uint8Array(11 * 1024 * 1024);
    expect(() => stage(zipSync(big))).toThrow(/너무 큽니다/);
    const many = base();
    for (const f of CRITERIA_FILES) many[f] = new Uint8Array(9 * 1024 * 1024);
    expect(() => stage(zipSync(many))).toThrow(/압축을 풀면 너무 큽니다/);
  });

  it("ZIP 자체가 25MB 를 넘으면 거절", () => {
    expect(() => stage(new Uint8Array(26 * 1024 * 1024))).toThrow(/ZIP 이 너무 큽니다/);
  });

  it("파일 내용을 바꾸면 해시 불일치", () => {
    const bytes = repack(goodPackage(), (e) => { e["spec/concepts.yaml"] = new TextEncoder().encode(new TextDecoder().decode(e["spec/concepts.yaml"]) + "\n# 변조\n"); });
    expect(() => stage(bytes)).toThrow(/해시/);
  });

  it("manifest 의 스키마·버전·알 수 없는 항목·해시 형식 거절", () => {
    const edit = (f: (m: Record<string, any>) => void) => repack(goodPackage(), (e) => {
      const m = JSON.parse(new TextDecoder().decode(e["manifest.json"]));
      f(m);
      e["manifest.json"] = new TextEncoder().encode(JSON.stringify(m));
    });
    expect(() => stage(edit((m) => { m.schema = "kai-criteria/2"; }))).toThrow(/지원하지 않는/);
    expect(() => stage(edit((m) => { m.version = "one"; }))).toThrow(/버전 형식/);
    expect(() => stage(edit((m) => { m.extra = 1; }))).toThrow(/알 수 없는 항목/);
    expect(() => stage(edit((m) => { m.files["spec/concepts.yaml"] = "abc"; }))).toThrow(/해시가 올바르지 않습니다/);
    expect(() => stage(edit((m) => { m.files["spec/other.yaml"] = "0".repeat(64); }))).toThrow(/알 수 없는 파일/);
  });

  it("앱보다 높은 minAppVersion 은 거절", () => {
    const bytes = pack(variant(), { ...META, minAppVersion: "9.0.0" });
    expect(() => stage(bytes)).toThrow(/9\.0\.0 이상/);
  });

  it("실패하면 임시 폴더를 남기지 않는다", () => {
    const staging = tmp("staging-fail");
    const bytes = repack(goodPackage(), (e) => { e["spec/concepts.yaml"] = new TextEncoder().encode("{}"); });
    expect(() => stageCriteriaPackage(bytes, staging, ROOT, {}, APP)).toThrow();
    expect(fs.readdirSync(staging)).toEqual([]);
  });
});

describe("stageCriteriaPackage: 미리보기", () => {
  it("임시 폴더는 stagingRoot 아래 고유하고 token 은 그 이름", () => {
    const staging = tmp("staging-uniq");
    const bytes = goodPackage();
    const a = stageCriteriaPackage(bytes, staging, ROOT, {}, APP);
    const b = stageCriteriaPackage(bytes, staging, ROOT, {}, APP);
    expect(path.dirname(a.root)).toBe(staging);
    expect(a.preview.token).toBe(path.basename(a.root));
    expect(a.root).not.toBe(b.root);
    expect(a.preview.token).not.toBe(b.preview.token);
  });

  it("같은 기준: 변경·충돌 없음, 설정 없으면 hasOverrides false", () => {
    const { preview } = stage(goodPackage());
    expect(preview.conflicts).toEqual([]);
    expect(preview.changes).toEqual(["현재 적용 중인 기준과 내용이 같습니다."]);
    expect(preview.hasOverrides).toBe(false);
  });

  it("규칙이 바뀌면 변경 목록에 ID 가 나오고, 그 규칙의 기존 설정은 충돌", () => {
    const dir = variant({ "rules/rules_semantic.yaml": replaceOnce("  severity: error", "  severity: warning") });
    const ov: RuleOverrides = { disabled: ["SEM-COM-001"], severity: { "SEM-COM-002": "warning" } };
    const { preview } = stage(pack(dir), ov);
    expect(preview.changes.some((c) => c.includes("SEM-COM-001"))).toBe(true);
    expect(preview.conflicts.some((c) => c.includes("SEM-COM-001"))).toBe(true);
    expect(preview.conflicts.some((c) => c.includes("SEM-COM-002"))).toBe(false);
    expect(preview.hasOverrides).toBe(true);
    // 기존 설정은 그대로 (조용히 옮기지 않는다)
    expect(ov).toEqual({ disabled: ["SEM-COM-001"], severity: { "SEM-COM-002": "warning" } });
  });

  it("바뀌지 않은 규칙의 설정은 충돌이 아니다", () => {
    const dir = variant({ "rules/rules_semantic.yaml": replaceOnce("  severity: error", "  severity: warning") });
    const { preview } = stage(pack(dir), { disabled: ["SEM-COM-002"] });
    expect(preview.conflicts).toEqual([]);
    expect(preview.hasOverrides).toBe(true);
  });

  it("필드 정의가 바뀌면 그 필드의 사용자 규칙은 충돌, 변경 목록에도 나온다", () => {
    const dir = variant({ "spec/kai_cdm_spec.yaml": replaceOnce("desc: 출생 월이다.", "desc: 출생 월(수정)이다.") });
    const ov: RuleOverrides = { customRules: [{ id: "USR-001", name: "월 필수", table: "PERSON", field: "month_of_birth", check: "not_null", severity: "warning", params: {} }] };
    const { preview } = stage(pack(dir), ov);
    expect(preview.changes.some((c) => c.includes("PERSON.month_of_birth"))).toBe(true);
    expect(preview.conflicts.some((c) => c.includes("USR-001"))).toBe(true);
  });

  it("새 기준에서 유효하지 않은 기존 설정은 충돌로 알린다 (무시하지 않음)", () => {
    const { preview } = stage(goodPackage(), { disabled: ["ST-9999"] });
    expect(preview.conflicts.some((c) => c.includes("ST-9999"))).toBe(true);
  });

  it("관리자 SQL 설정은 개념 목록이 바뀌면 충돌 후보", () => {
    const dir = variant({ "spec/concepts.yaml": (s) => s.replace("plausible: [1, 300]", "plausible: [1, 301]") });
    const ov: RuleOverrides = { sql: { "SEM-COM-001": "SELECT person_id, CAST(visit_occurrence_id AS VARCHAR) AS row_key, 'x' AS detail FROM VISIT_OCCURRENCE WHERE 1=0" } };
    const { preview } = stage(pack(dir), ov);
    expect(preview.conflicts.some((c) => c.includes("concept"))).toBe(true);
  });
});

describe("전역 루트와 활성 상태", () => {
  it("성공·실패 모두 엔진 루트를 되돌린다", () => {
    const sentinel = path.join(work, "sentinel-root");
    setRoot(sentinel);
    inspectCriteria(ROOT, "builtin", APP);
    expect(getRoot()).toBe(sentinel);
    stage(goodPackage());
    expect(getRoot()).toBe(sentinel);
    expect(() => inspectCriteria(variant({ "rules/rules_semantic.yaml": replaceOnce("requires: [VISIT_OCCURRENCE]", "requires: [NOPE]") }), "builtin", APP)).toThrow();
    expect(getRoot()).toBe(sentinel);
    expect(() => stage(new Uint8Array(100))).toThrow();
    expect(getRoot()).toBe(sentinel);
    // 현재 기준 읽기 실패(없는 폴더)에서도 복원
    expect(() => stage(goodPackage(), {}, path.join(work, "no-such-root"))).toThrow();
    expect(getRoot()).toBe(sentinel);
  });
});
