// 실행 기준 스냅샷: 실행 시작 전에 그 순간의 명세·규칙 원본을 실행 폴더에 한 번만 보관한다.
// criteria/<YAML 7종 + manifest.json>   워커가 읽는 기준 루트 (실행이 끝난 뒤에도 그대로 남는다)
// criteria.zip                          같은 내용을 한 파일로 묶은 이식용 패키지
// criteria-snapshot.json                실행 당시의 유효 규칙·명세 요약·기준일·덧씌우기 (이력 화면과 감사용)
// 한 번 쓰면 바꾸지 않는다: 모든 파일을 배타적으로 만들고, 중간에 실패하면 이번에 만든 것만 치운다.
import fs from "node:fs";
import path from "node:path";
import { zipSync } from "fflate";
import { CRITERIA_FILES, type CriteriaSnapshot } from "@shared/criteria";

export const CRITERIA_ZIP = "criteria.zip";
export const CRITERIA_SNAPSHOT_JSON = "criteria-snapshot.json";
export const CRITERIA_DIR = "criteria";
export const CRITERIA_MANIFEST_FILE = "manifest.json";

/** 이 실행의 엔진이 읽을 기준 루트 */
export function criteriaSnapshotRoot(runDir: string): string {
  return path.join(runDir, CRITERIA_DIR);
}

/** 압축 파일의 수정 시각 (생성 시각 고정 → 같은 입력이면 같은 바이트). ZIP 은 1980 년 이전을 표현하지 못한다. */
function zipTime(createdAt: string): Date {
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && t >= Date.UTC(1980, 0, 1) ? new Date(t) : new Date(Date.UTC(1980, 0, 1));
}

/**
 * root(기준 패키지가 풀려 있는 폴더)의 YAML 7종과 manifest 를 runDir/criteria 로 복사하고,
 * criteria.zip 과 criteria-snapshot.json 을 만든다. 이미 있는 파일은 덮어쓰지 않고 실패한다.
 * 실패하면 이번 호출이 만든 파일과 폴더만 지우고 오류를 던진다.
 */
export function writeCriteriaSnapshot(root: string, runDir: string, snapshot: CriteriaSnapshot): void {
  if (snapshot.schema !== "kai-criteria-snapshot/1") throw new Error("지원하지 않는 기준 스냅샷 형식입니다.");
  const contents = new Map<string, Uint8Array>();
  for (const rel of CRITERIA_FILES) {
    const p = path.join(root, ...rel.split("/"));
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) throw new Error(`기준 파일이 없습니다: ${rel}`);
    contents.set(rel, new Uint8Array(fs.readFileSync(p)));
  }
  const manifest = new TextEncoder().encode(JSON.stringify(snapshot.criteria.manifest, null, 2));

  const dir = criteriaSnapshotRoot(runDir);
  const zipPath = path.join(runDir, CRITERIA_ZIP);
  const jsonPath = path.join(runDir, CRITERIA_SNAPSHOT_JSON);
  const madeDirs: string[] = [];
  const madeFiles: string[] = [];
  const create = (p: string, data: Uint8Array | string) => {
    fs.writeFileSync(p, data, { flag: "wx" });
    madeFiles.push(p);
  };
  try {
    fs.mkdirSync(runDir, { recursive: true });
    fs.mkdirSync(dir); // 이미 있으면 EEXIST: 스냅샷은 다시 쓰지 않는다
    madeDirs.push(dir);
    for (const rel of CRITERIA_FILES) {
      const p = path.join(dir, ...rel.split("/"));
      const parent = path.dirname(p);
      if (!fs.existsSync(parent)) { fs.mkdirSync(parent); madeDirs.push(parent); }
      create(p, contents.get(rel)!);
    }
    create(path.join(dir, CRITERIA_MANIFEST_FILE), manifest);

    const mtime = zipTime(snapshot.createdAt);
    const entries: Record<string, [Uint8Array, { mtime: Date }]> = {};
    for (const rel of CRITERIA_FILES) entries[rel] = [contents.get(rel)!, { mtime }];
    entries[CRITERIA_MANIFEST_FILE] = [manifest, { mtime }];
    create(zipPath, zipSync(entries));

    create(jsonPath, JSON.stringify(snapshot, null, 1));
  } catch (e) {
    for (const f of madeFiles.reverse()) fs.rmSync(f, { force: true });
    for (const d of madeDirs.reverse()) fs.rmSync(d, { recursive: true, force: true });
    throw e;
  }
}

/**
 * 실행 폴더의 기준 스냅샷을 읽는다. 스냅샷을 만들기 전의 실행(파일 없음)은 null.
 * 파일이 있는데 읽거나 해석할 수 없으면 null 로 숨기지 않고 오류를 던진다.
 */
export function readCriteriaSnapshot(runDir: string): CriteriaSnapshot | null {
  const p = path.join(runDir, CRITERIA_SNAPSHOT_JSON);
  if (!fs.existsSync(p)) return null;
  let raw: unknown;
  try { raw = JSON.parse(fs.readFileSync(p, "utf-8")); }
  catch (e) { throw new Error(`${CRITERIA_SNAPSHOT_JSON} 을 읽지 못했습니다: ${(e as Error).message}`); }
  const s = raw as Partial<CriteriaSnapshot> | null;
  if (!s || s.schema !== "kai-criteria-snapshot/1" || !s.criteria?.manifest || !Array.isArray(s.tables) || !Array.isArray(s.rules) || typeof s.today !== "string") {
    throw new Error(`${CRITERIA_SNAPSHOT_JSON} 의 형식이 올바르지 않습니다.`);
  }
  return s as CriteriaSnapshot;
}
