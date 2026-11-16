// 앱 설정 (userData/config.json)
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { AppConfig } from "@shared/types";

function configPath(): string {
  return path.join(app.getPath("userData"), "config.json");
}

/** 명세·규칙 기본 위치: 개발 중에는 저장소 루트, 패키징 후에는 resources/kai */
export function defaultRoot(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, "kai");
  return path.resolve(app.getAppPath(), "..");
}

interface Saved { root?: string; defaultToday?: string | null; adminAcknowledged?: boolean }

function readSaved(): Saved {
  try { return JSON.parse(fs.readFileSync(configPath(), "utf-8")); } catch { return {}; }
}

function saveSaved(s: Saved): void {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(s, null, 2), "utf-8");
}

/** 관리자 모드(adminMode)는 설정 파일에 두지 않는다 — 켜 둔 채 잊는 일이 없도록 앱을 열 때마다 꺼져 있다. */
export function readConfig(): AppConfig {
  const saved = readSaved();
  return {
    root: saved.root && fs.existsSync(path.join(saved.root, "spec")) ? saved.root : defaultRoot(),
    defaultToday: saved.defaultToday ?? null,
    userData: app.getPath("userData"),
    version: app.getVersion(),
    packaged: app.isPackaged,
    adminMode: false,
  };
}

export function writeConfig(patch: Partial<Pick<AppConfig, "root" | "defaultToday">>): AppConfig {
  const saved = readSaved();
  const cur = readConfig();
  saveSaved({
    ...saved,
    root: patch.root ?? cur.root,
    defaultToday: patch.defaultToday === undefined ? cur.defaultToday : patch.defaultToday,
  });
  return readConfig();
}

/** 관리자 모드의 첫 확인 창을 이미 봤는지 */
export function adminAcknowledged(): boolean { return readSaved().adminAcknowledged === true; }
export function setAdminAcknowledged(): void { saveSaved({ ...readSaved(), adminAcknowledged: true }); }
