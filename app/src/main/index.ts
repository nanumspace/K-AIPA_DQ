// 메인 프로세스: 창 · IPC · 입력 처리 · 엔진 워커 · 이력 DB · 출력물 · 규칙 설정 · 스모크 모드
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app, BrowserWindow, ipcMain, dialog, shell, utilityProcess } from "electron";
import * as XLSX from "xlsx";
import { setRoot, loadSpec, loadProfiles, loadStructuralRules, loadSemanticRules, ruleSetHash, describeOverrides, readCsv } from "@engine/index.js";
import type { Summary, Spec } from "@engine/types.js";
import type {
  AppConfig, CohortInfo, RuleInfo, RunRequest, RunRecord, RunDetail, FindingsQuery, Dashboard, InputPlan, SourceCandidate, TemplateKind, OutputFile,
  RuleChange, RuleOverrides, RuleSetState, SqlTestRequest, SqlTestResult, SqlTestSide, SpecTableInfo,
} from "@shared/types";
import { readConfig, writeConfig, adminAcknowledged, setAdminAcknowledged } from "./config";
import * as db from "./db";
import * as input from "./input";
import { writeExtraOutputs, runOutputs, exportBundle, APP_VERSION } from "./outputs";
import * as rs from "./ruleset";

const SMOKE = process.env.KAI_SMOKE === "1";
if (SMOKE) app.setPath("userData", path.join(process.env.KAI_SMOKE_OUT ?? app.getPath("temp"), "kai-smoke-userdata"));

/** 견본 데이터·SQL 시험의 검증 실행일. clean·good 이 위반 0 이 되도록 맞춰 둔 날짜다. */
const SAMPLE_TODAY = "2026-09-07";

let win: BrowserWindow | null = null;
let config: AppConfig;
/** 이 PC 의 규칙 설정(덧씌우기)과 관리자 모드. 관리자 모드는 이 프로세스가 사는 동안만 켜져 있다. */
let overrides: RuleOverrides = {};
let adminMode = false;

function runsDir(): string { return path.join(app.getPath("userData"), "runs"); }
const userDir = () => app.getPath("userData");

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1480, height: 940, minWidth: 1100, minHeight: 700, show: false,
    title: "Quality Validator",
    backgroundColor: "#eef2f7",
    webPreferences: { preload: path.join(__dirname, "../preload/index.js"), sandbox: true, contextIsolation: true },
  });
  w.once("ready-to-show", () => w.show());
  if (process.env.ELECTRON_RENDERER_URL) w.loadURL(process.env.ELECTRON_RENDERER_URL);
  else w.loadFile(path.join(__dirname, "../renderer/index.html"));
  return w;
}

// ------------------------------------------------------------------ 명세·규칙
// 명세는 의뢰사 매뉴얼(2026-11-16) 하나다. 표준 규칙은 읽기 전용이고, 이 PC 의 설정은 overrides 에 덧씌워 둔다.
function spec(): Spec { setRoot(config.root); return loadSpec(); }

let baseCache: { root: string; ctx: rs.RuleContext } | null = null;
/** 표준 규칙과 명세 (위치가 바뀌면 다시 읽는다) */
function ruleCtx(): rs.RuleContext {
  if (baseCache?.root !== config.root) {
    setRoot(config.root);
    baseCache = { root: config.root, ctx: { spec: loadSpec(), cohortIds: Object.keys(loadProfiles()), base: { structural: loadStructuralRules(), semantic: loadSemanticRules() } } };
  }
  return baseCache.ctx;
}

function cohorts(): CohortInfo[] {
  setRoot(config.root);
  return Object.entries(loadProfiles()).map(([id, p]) => ({ id, kor: p.kor, tables: p.tables }));
}

function cohortOf(id: string): CohortInfo {
  const c = cohorts().find((x) => x.id === id);
  if (!c) throw new Error(`알 수 없는 코호트: ${id}`);
  return c;
}

function rules(): RuleInfo[] { return rs.buildRuleViews(ruleCtx().base, overrides); }

/** 엔진에 넘길 설정: 비었으면 undefined (표준 실행) */
const engineOverrides = (o: RuleOverrides = overrides): RuleOverrides | undefined => (rs.isEmptyOverrides(o) ? undefined : o);

function ruleSetState(): RuleSetState {
  setRoot(config.root);
  const eo = engineOverrides();
  return { overrides, adminMode, standardHash: ruleSetHash(undefined), effectiveHash: ruleSetHash(eo), changes: eo ? describeOverrides(eo) : [] };
}

/** 변경을 검증·적용하고 저장한 뒤 이력에 남긴다 */
function changeRules(ch: RuleChange): RuleSetState {
  const r = rs.applyChange(ruleCtx(), overrides, ch, adminMode);
  rs.saveOverrides(userDir(), r.overrides);
  rs.appendHistory(userDir(), r.history, adminMode);
  overrides = r.overrides;
  return ruleSetState();
}

/** 앱을 열 때 저장된 설정을 읽는다. 읽을 수 없으면 표준으로 시작하고 깨진 파일은 치워 둔다 (잘못된 설정으로 검증하지 않는다). */
function loadSavedOverrides(): void {
  try { overrides = rs.loadOverrides(userDir(), ruleCtx()); }
  catch (e) {
    const f = path.join(userDir(), rs.OVERRIDES_FILE);
    if (fs.existsSync(f)) fs.renameSync(f, `${f}.invalid-${Date.now()}`);
    rs.appendHistory(userDir(), [{ action: "invalid_overrides", rule_id: "", before: String((e as Error).message), after: null }], false);
    if (!SMOKE) dialog.showErrorBox("규칙 설정을 읽을 수 없습니다", `${(e as Error).message}\n\n표준 규칙으로 시작합니다. 깨진 파일은 이름을 바꿔 보관했습니다.`);
    overrides = {};
  }
}

async function setAdminMode(on: boolean): Promise<AppConfig> {
  if (on === adminMode) return { ...config, adminMode };
  if (on && !SMOKE && !adminAcknowledged()) {
    const r = await dialog.showMessageBox(win!, {
      type: "warning", title: "관리자 모드", buttons: ["관리자 모드 켜기", "취소"], defaultId: 1, cancelId: 1,
      message: "SQL 규칙을 직접 수정할 수 있습니다. 결과물에 기록됩니다",
      detail: "관리자 모드에서 바꾼 SQL 은 모드를 꺼도 그대로 남고, 검증 결과(report.md · submission.json)에 '관리자 변경'으로 적혀 중앙에 전달됩니다. 변경 이력은 이 PC 에 남습니다.",
    });
    if (r.response !== 0) return { ...config, adminMode };
    setAdminAcknowledged();
  }
  adminMode = on;
  rs.appendHistory(userDir(), [{ action: on ? "admin_on" : "admin_off", rule_id: "", before: null, after: null }], on);
  return { ...config, adminMode };
}

/** 견본 데이터 위치: 개발 중에는 저장소의 synth/output, 설치본은 resources/kai/synth/output (같은 구조) */
function sampleDir(cohort: string, kind: "clean" | "dirty" | "good"): string | null {
  const d = path.join(config.root, "synth/output", kind, cohort);
  return fs.existsSync(path.join(d, "PERSON.csv")) ? d : null;
}

// ------------------------------------------------------------------ 입력
/**
 * 없으면 검증 자체가 서지 않는 표: 환자와 그 코호트의 질환 본표.
 * 나머지가 없으면 막지 않고 경고만 낸다 — 엔진이 '테이블 없음'으로 따로 보고한다.
 */
function requiredTables(tables: string[]): string[] {
  const s = spec();
  const disease = tables.find((t) => s.tables[t].category === "disease");
  return disease ? ["PERSON", disease] : ["PERSON"];
}

function inspect(cohort: string, paths: string[], existing: SourceCandidate[] = []): InputPlan {
  const info = cohortOf(cohort);
  const fresh = input.inspectPaths(paths);
  const seen = new Set(fresh.map((c) => c.id));
  const candidates = [...existing.filter((c) => !seen.has(c.id)), ...fresh];
  return input.buildPlan(cohort, info.tables, spec(), candidates, undefined, requiredTables(info.tables));
}

function check(cohort: string, candidates: SourceCandidate[], mapping: Record<string, string[]>): InputPlan {
  return input.buildPlan(cohort, cohortOf(cohort).tables, spec(), candidates, mapping, requiredTables(cohortOf(cohort).tables));
}

async function exportTemplate(cohort: string, kind: TemplateKind): Promise<string | null> {
  const info = cohortOf(cohort); const s = spec();
  if (kind === "csv" || kind.startsWith("sample-")) {
    const r = await dialog.showOpenDialog(win!, { title: "저장할 폴더 선택", properties: ["openDirectory", "createDirectory"] });
    if (r.canceled) return null;
    if (kind === "csv") {
      const dest = path.join(r.filePaths[0], `${cohort}_입력양식`);
      input.writeCsvTemplates(info.tables, s, dest);
      return dest;
    }
    const sk = kind.slice("sample-".length) as "clean" | "dirty" | "good";
    const src = sampleDir(cohort, sk);
    if (!src) throw new Error("견본 데이터가 없습니다");
    const dest = path.join(r.filePaths[0], `${cohort}_견본데이터_${sk}`);
    fs.mkdirSync(dest, { recursive: true });
    for (const t of info.tables) { const p = path.join(src, `${t}.csv`); if (fs.existsSync(p)) fs.copyFileSync(p, path.join(dest, `${t}.csv`)); }
    // dirty 는 주입한 오류의 정답표, good 은 설명 문서가 함께 간다
    for (const extra of sk === "dirty" ? ["fault_manifest.csv"] : sk === "good" ? ["README.md"] : []) {
      if (fs.existsSync(path.join(src, extra))) fs.copyFileSync(path.join(src, extra), path.join(dest, extra));
    }
    return dest;
  }
  const name = kind === "xlsx" ? `${cohort}_입력양식.xlsx` : `${cohort}_컬럼명세서.xlsx`;
  const r = await dialog.showSaveDialog(win!, { defaultPath: name, filters: [{ name: "Excel", extensions: ["xlsx"] }] });
  if (r.canceled || !r.filePath) return null;
  if (kind === "xlsx") input.writeXlsxTemplate(info.tables, s, r.filePath); else input.writeSpecSheet(info.tables, s, r.filePath);
  return r.filePath;
}

// ------------------------------------------------------------------ 검증 실행
let running = false;

interface WorkerRun { cohort: string; dataDir: string; outDir: string; today?: string; overrides?: RuleOverrides; adminMode: boolean }

type WorkerMsg =
  | { type: "progress"; stage: string; done: number; total: number; text: string }
  | { type: "done"; summary: Summary }
  | { type: "error"; message: string };

/** 엔진 워커(별도 프로세스)에서 한 번 돌린다 */
function runInWorker(job: WorkerRun, onProgress?: (m: { stage: string; done: number; total: number; text: string }) => void): Promise<Summary> {
  const { promise, resolve, reject } = Promise.withResolvers<Summary>();
  const child = utilityProcess.fork(path.join(__dirname, "worker.js"), [], { serviceName: "kai-dq-engine" });
  let settled = false;
  const end = (fn: () => void) => { if (settled) return; settled = true; fn(); child.kill(); };
  child.on("message", (m: WorkerMsg) => {
    if (m.type === "progress") onProgress?.(m);
    else if (m.type === "done") end(() => resolve(m.summary));
    else end(() => reject(new Error(m.message)));
  });
  child.on("exit", (code) => end(() => reject(new Error(`엔진 프로세스가 종료됨 (code ${code})`))));
  child.postMessage({ type: "run", root: config.root, ...job });
  return promise;
}

async function runValidation(req: RunRequest): Promise<RunRecord> {
  if (running) throw new Error("이미 검증이 실행 중입니다");
  const info = cohortOf(req.cohort);
  const plan = check(req.cohort, req.candidates, req.mapping);
  if (!plan.ok) throw new Error("사전 점검에서 오류가 있어 실행할 수 없습니다. 테이블 대응표를 확인하세요.");
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:.]/g, "").replace("T", "_").slice(0, 18); // YYYYMMDD_HHMMSSmmm
  let runId = `${req.cohort}_${stamp}`;
  for (let k = 2; fs.existsSync(path.join(runsDir(), runId)); k++) runId = `${req.cohort}_${stamp}_${k}`;
  const outDir = path.join(runsDir(), runId);
  const inputDir = path.join(outDir, "input");
  const today = req.today || config.defaultToday || now.toISOString().slice(0, 10);
  const firstPath = req.candidates.find((c) => c.id === Object.values(req.mapping)[0]?.[0])?.path ?? "";
  const label = req.label?.trim() || path.basename(path.dirname(firstPath) || firstPath) || req.cohort;
  // 실행하는 동안 설정이 바뀌어도 이 실행은 시작할 때의 설정으로 끝까지 간다 (결과에 적힌 해시와 어긋나지 않도록)
  const usedOverrides = engineOverrides();
  const usedAdminMode = adminMode;
  const ruleSet = ruleSetState();
  running = true;
  const progress = (stage: string, done: number, total: number, text: string, pct: number) =>
    win?.webContents.send("run:progress", { runId, stage, done, total, text, pct });
  try {
    progress("stage", 0, 1, "입력 파일을 UTF-8 CSV 로 정규화하는 중", 2);
    const norm = input.stageInputs(req.candidates, req.mapping, inputDir, spec());
    fs.writeFileSync(path.join(outDir, "normalization.json"), JSON.stringify(norm, null, 2), "utf-8");
    const summary = await runInWorker({ cohort: req.cohort, dataDir: inputDir, outDir, today, overrides: usedOverrides, adminMode: usedAdminMode }, (m) => {
      const order = { load: 0, structural: 1, semantic: 2, write: 3 } as Record<string, number>;
      const base = [5, 12, 55, 95][order[m.stage] ?? 0]; const span = [7, 43, 40, 4][order[m.stage] ?? 0];
      progress(m.stage, m.done, m.total, m.text, Math.min(99, Math.round(base + (m.total ? (m.done / m.total) * span : 0))));
    });
    const used = usedOverrides ?? {};
    const ruleSetInfo = rs.buildRuleSetInfo(used, usedAdminMode, { standard: ruleSet.standardHash, effective: ruleSet.effectiveHash }, ruleSet.changes);
    writeExtraOutputs(outDir, summary, { cohortKor: info.kor, label, runId, ruleSet: ruleSetInfo }, norm);
    const findings = readCsv(path.join(outDir, "findings.csv"));
    const rec = await db.insertRun({
      runId, cohort: req.cohort, cohortKor: info.kor, label, dataDir: firstPath ? path.dirname(firstPath) : inputDir, createdAt: now.toISOString(),
      summary, findings, ruleSetModified: !rs.isEmptyOverrides(used), adminModified: ruleSetInfo.admin_modified,
    });
    progress("done", 1, 1, "완료", 100);
    return rec;
  } finally { running = false; }
}

/** 폴더 하나로 자동 대응해 실행 (스모크 모드용) */
function runFromDir(cohort: string, dir: string, today: string, label: string): Promise<RunRecord> {
  const plan = inspect(cohort, [dir]);
  return runValidation({ cohort, candidates: plan.candidates, mapping: plan.mapping, today, label });
}

// ------------------------------------------------------------------ 관리자 모드: SQL 시험
/**
 * 규칙 SQL 하나를 내보내기 전에 내장 견본(clean · dirty)으로 시험한다.
 * 시험할 규칙만 켜고 나머지 표준 규칙은 모두 끈 채 엔진을 돌리므로 몇 초면 끝난다.
 * clean 에서 위반이 나오면 규칙이 너무 넓다는 신호이고, dirty 에서 0 이면 아무것도 못 잡는다는 신호다.
 */
async function testSqlRule(req: SqlTestRequest): Promise<SqlTestResult> {
  if (!adminMode) throw new Error("SQL 시험은 관리자 모드에서만 쓸 수 있습니다.");
  if (running) throw new Error("검증이 실행 중입니다. 끝난 뒤에 시험하세요.");
  cohortOf(req.cohort);
  const sqlErr = rs.checkSql(req.sql);
  if (sqlErr) return { cohort: req.cohort, clean: { ok: false, error: sqlErr, violations: 0, rowsChecked: 0, samples: [] }, dirty: null };
  const ctx = ruleCtx();
  const std = ctx.base.semantic.some((r) => r.id === req.ruleId);
  const targetId = req.ruleId ?? "ADM-000";
  // 시험 설정: 시험할 SQL 하나만 남긴다. 다른 사용자·관리자 규칙은 빼고, 표준 규칙은 전부 끈다.
  const trial: RuleOverrides = std
    ? { sql: { [targetId]: req.sql }, disabled: [...ctx.base.structural, ...ctx.base.semantic].map((r) => r.id).filter((id) => id !== targetId) }
    : {
        customSql: [{ id: targetId, name: "SQL 시험", category: "Plausibility", severity: "error", scope: "all", requires: req.requires.length ? req.requires : ["PERSON"], sql: req.sql }],
        disabled: [...ctx.base.structural, ...ctx.base.semantic].map((r) => r.id),
      };
  running = true;
  try {
    const side = async (kind: "clean" | "dirty"): Promise<SqlTestSide | null> => {
      const dir = sampleDir(req.cohort, kind);
      if (!dir) return null;
      const out = fs.mkdtempSync(path.join(os.tmpdir(), "kai-sqltest-"));
      try {
        const summary = await runInWorker({ cohort: req.cohort, dataDir: dir, outDir: out, today: SAMPLE_TODAY, overrides: trial, adminMode: true });
        const stat = summary.rules.find((r) => r.rule_id === targetId);
        if (!stat) return { ok: false, error: "시험한 규칙이 결과에 없습니다.", violations: 0, rowsChecked: 0, samples: [] };
        if (stat.status === "error" || stat.status === "skipped") {
          return { ok: false, error: stat.status === "error" ? stat.note : `건너뜀: ${stat.note || "필요한 테이블이 이 코호트에 없습니다"}`, violations: 0, rowsChecked: stat.rows_checked, samples: [] };
        }
        const f = readCsv(path.join(out, "findings.csv"));
        const ids = f.cols.get("rule_id") ?? [];
        const detail = f.cols.get("detail") ?? [];
        const samples: string[] = [];
        for (let i = 0; i < f.n && samples.length < 5; i++) if (ids[i] === targetId) samples.push(detail[i]);
        return { ok: true, violations: stat.violations, rowsChecked: stat.rows_checked, samples };
      } finally { fs.rmSync(out, { recursive: true, force: true }); }
    };
    const clean = await side("clean");
    const dirty = await side("dirty");
    return { cohort: req.cohort, clean, dirty };
  } finally { running = false; }
}

// ------------------------------------------------------------------ IPC
function registerIpc(): void {
  ipcMain.handle("config:get", () => ({ ...config, adminMode }));
  ipcMain.handle("config:set", (_e, patch) => {
    config = writeConfig(patch);
    return { ...config, adminMode };
  });
  ipcMain.handle("cohorts:list", () => cohorts());
  ipcMain.handle("spec:tables", (): SpecTableInfo[] => Object.entries(spec().tables).map(([table, t]) => ({ table, kor: t.kor, category: t.category, fields: t.fields.map((f) => ({ name: f.name, type: f.type })) })));
  ipcMain.handle("rules:list", () => rules());
  ipcMain.handle("ruleset:get", () => ruleSetState());
  ipcMain.handle("ruleset:change", (_e, ch: RuleChange) => changeRules(ch));
  ipcMain.handle("ruleset:history", (_e, limit?: number) => rs.readHistory(userDir(), limit));
  ipcMain.handle("ruleset:export", async () => {
    const r = await dialog.showSaveDialog(win!, { defaultPath: "rule-overrides.json", filters: [{ name: "JSON", extensions: ["json"] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, JSON.stringify({ schema: "kai-rule-overrides/1", app_version: APP_VERSION, exported_at: new Date().toISOString(), ...overrides }, null, 2) + "\n", "utf-8");
    return r.filePath;
  });
  ipcMain.handle("ruleset:import", async () => {
    const r = await dialog.showOpenDialog(win!, { title: "규칙 설정 파일 선택", properties: ["openFile"], filters: [{ name: "JSON", extensions: ["json"] }] });
    if (r.canceled) return null;
    let raw: unknown;
    try { raw = JSON.parse(fs.readFileSync(r.filePaths[0], "utf-8")); } catch { throw new Error("JSON 파일을 읽을 수 없습니다."); }
    // 검증이 통과해야만 바꾼다. 통과하지 못하면 지금 설정은 그대로다.
    const next = rs.validateOverrides(raw, ruleCtx(), { allowSql: adminMode });
    rs.appendHistory(userDir(), [{ action: "import", rule_id: "", before: overrides, after: next }], adminMode);
    rs.saveOverrides(userDir(), next);
    overrides = next;
    return ruleSetState();
  });
  ipcMain.handle("admin:set", (_e, on: boolean) => setAdminMode(on));
  ipcMain.handle("admin:testSql", (_e, req: SqlTestRequest) => testSqlRule(req));
  ipcMain.handle("dialog:directory", async (_e, title?: string) => {
    const r = await dialog.showOpenDialog(win!, { title: title ?? "디렉터리 선택", properties: ["openDirectory"] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle("dialog:directories", async (_e, title?: string) => {
    const r = await dialog.showOpenDialog(win!, { title: title ?? "폴더 선택", properties: ["openDirectory", "multiSelections"] });
    return r.canceled ? [] : r.filePaths;
  });
  ipcMain.handle("dialog:files", async () => {
    const r = await dialog.showOpenDialog(win!, { title: "CSV 또는 엑셀 파일 선택", properties: ["openFile", "multiSelections"],
      filters: [{ name: "CSV · 엑셀", extensions: ["csv", "tsv", "txt", "xlsx", "xlsm", "xls"] }] });
    return r.canceled ? [] : r.filePaths;
  });
  ipcMain.handle("input:inspect", (_e, cohort: string, paths: string[], existing?: SourceCandidate[]) => inspect(cohort, paths, existing));
  ipcMain.handle("input:check", (_e, cohort: string, candidates: SourceCandidate[], mapping: Record<string, string[]>) => check(cohort, candidates, mapping));
  ipcMain.handle("input:preview", (_e, c: SourceCandidate) => input.preview(c));
  ipcMain.handle("template:export", (_e, cohort: string, kind: TemplateKind) => exportTemplate(cohort, kind));
  ipcMain.handle("run:start", (_e, req: RunRequest) => runValidation(req));
  ipcMain.handle("runs:list", () => db.listRuns());
  ipcMain.handle("runs:get", async (_e, runId: string): Promise<RunDetail> => {
    const run = await db.getRun(runId);
    if (!run) throw new Error("실행 기록이 없습니다");
    const rp = path.join(runsDir(), runId, "report.md");
    return { run, rules: await db.getRuleResults(runId), report: fs.existsSync(rp) ? fs.readFileSync(rp, "utf-8") : "" };
  });
  ipcMain.handle("runs:outputs", (_e, runId: string) => runOutputs(path.join(runsDir(), runId)));
  ipcMain.handle("findings:query", (_e, q: FindingsQuery) => db.getFindings(q));
  ipcMain.handle("runs:exportFile", async (_e, runId: string, key: OutputFile["key"]) => {
    const f = runOutputs(path.join(runsDir(), runId)).files.find((x) => x.key === key);
    if (!f || !f.size) throw new Error("파일이 없습니다");
    const r = await dialog.showSaveDialog(win!, { defaultPath: `${runId}_${f.name}` });
    if (r.canceled || !r.filePath) return null;
    fs.copyFileSync(f.path, r.filePath);
    return r.filePath;
  });
  ipcMain.handle("runs:exportBundle", async (_e, runId: string) => {
    const r = await dialog.showOpenDialog(win!, { title: "결과를 저장할 폴더 선택", properties: ["openDirectory", "createDirectory"] });
    if (r.canceled) return null;
    return exportBundle(path.join(runsDir(), runId), runId, r.filePaths[0]);
  });
  ipcMain.handle("runs:delete", async (_e, runId: string) => {
    await db.deleteRun(runId);
    fs.rmSync(path.join(runsDir(), runId), { recursive: true, force: true });
  });
  ipcMain.handle("dashboard:get", async (): Promise<Dashboard> => {
    const all = rules();
    const structural = all.filter((r) => r.kind === "structural").length;
    return db.dashboard({ structural, semantic: all.length - structural, total: all.length });
  });
  ipcMain.handle("shell:open", (_e, p: string) => shell.openPath(p));
}

// ------------------------------------------------------------------ 스모크 모드
// KAI_SMOKE=1: 번들된 견본 데이터로 검증을 자동 실행하고 각 화면을 PNG 로 찍은 뒤 종료한다 (자동 점검용).
// 실패가 하나라도 있으면 종료 코드가 1 이다.
async function smoke(): Promise<void> {
  const out = process.env.KAI_SMOKE_OUT ?? app.getPath("temp");
  fs.mkdirSync(out, { recursive: true });
  let failures = 0;
  const log = (s: string) => { console.log(`[smoke] ${s}`); fs.appendFileSync(path.join(out, "smoke.log"), s + "\n"); };
  const expect = (cond: boolean, what: string) => { if (!cond) { failures++; log(`FAIL ${what}`); } };
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  try {
    const all = rules();
    log(`매뉴얼 2026-11-16 · 규칙 ${all.length}개 · 코호트 ${cohorts().length}개 · ${config.packaged ? "설치본" : "개발 모드"}`);
    // 엑셀 입력 경로 시험: 폐암 dirty 를 엑셀 한 파일(시트당 테이블)로 만들어 넣는다
    const xlsxPath = path.join(out, "LUNG_CANCER_dirty.xlsx");
    const dirtyLung = sampleDir("LUNG_CANCER", "dirty");
    if (dirtyLung) {
      const wb = XLSX.utils.book_new();
      for (const t of cohortOf("LUNG_CANCER").tables) {
        const p = path.join(dirtyLung, `${t}.csv`);
        if (!fs.existsSync(p)) continue;
        const raw = readCsv(p);
        const rows = [raw.columns, ...Array.from({ length: raw.n }, (_, i) => raw.columns.map((c) => raw.cols.get(c)![i]))];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), t.slice(0, 31));
      }
      XLSX.writeFile(wb, xlsxPath);
    }
    // 표준 실행: clean 은 위반 0, dirty 는 위반이 있어야 한다. 설치본에도 clean · dirty · good 이 들어 있다.
    for (const [cohort, kind, label] of [["LUNG_CANCER", "clean", "clean 견본"], ["LUNG_CANCER", "good", "good 견본"], ["DIABETES", "dirty", "dirty 견본"], ["LYMPHOMA", "clean", "림프종 clean 견본"]] as const) {
      const dir = sampleDir(cohort, kind);
      if (!dir) { failures++; log(`FAIL ${cohort} ${kind} 견본 데이터가 없습니다 (${path.join(config.root, "synth/output", kind, cohort)})`); continue; }
      const rec = await runFromDir(cohort, dir, SAMPLE_TODAY, label);
      log(`run ${rec.run_id}: rules=${rec.rules_total} violations=${rec.violations_total}`);
      expect(rec.rules_error === 0, `${cohort} ${kind}: 규칙 실행 오류 ${rec.rules_error}`);
      expect(kind === "dirty" ? rec.violations_total > 0 : rec.violations_total === 0, `${cohort} ${kind}: 위반 ${rec.violations_total}건`);
      expect(!rec.rule_set_modified && !rec.admin_modified, `${cohort} ${kind}: 표준 실행인데 규칙 변경으로 기록됨`);
      const sub = JSON.parse(fs.readFileSync(path.join(runsDir(), rec.run_id, "submission.json"), "utf-8"));
      expect(sub.rule_set.standard_hash === sub.rule_set.effective_hash && sub.rule_set.admin_modified === false && sub.rule_set.disabled.length === 0, `${cohort} ${kind}: 표준 실행의 rule_set 이 표준이 아님`);
    }
    const planX = dirtyLung ? inspect("LUNG_CANCER", [xlsxPath]) : null;
    if (planX) {
      log(`xlsx plan: candidates=${planX.candidates.length} mapped=${Object.keys(planX.mapping).length} errors=${planX.errors} warnings=${planX.warnings}`);
      const recX = await runValidation({ cohort: "LUNG_CANCER", candidates: planX.candidates, mapping: planX.mapping, today: SAMPLE_TODAY, label: "dirty 엑셀 입력" });
      log(`run ${recX.run_id}: rules=${recX.rules_total} violations=${recX.violations_total} (엑셀)`);
      expect(recX.violations_total > 0, "엑셀 dirty: 위반이 없음");
    }
    // 폴더 두 곳을 한 번에 넣는 길: 큰 표를 나눠 내보낸 경우. 합쳐 읽어야 위반 0 이 나온다.
    let planFolders: InputPlan | null = null;
    {
      const src = sampleDir("LUNG_CANCER", "clean");
      const tables = src ? cohortOf("LUNG_CANCER").tables.filter((t) => fs.existsSync(path.join(src, `${t}.csv`))) : [];
      if (!src || !tables.length) { failures++; log("FAIL 폴더 2곳: 데이터가 없습니다"); } else {
        const half = Math.ceil(tables.length / 2);
        const dirs = [path.join(out, "split/내보내기_1"), path.join(out, "split/내보내기_2")];
        dirs.forEach((d) => fs.mkdirSync(d, { recursive: true }));
        tables.forEach((t, i) => fs.copyFileSync(path.join(src, `${t}.csv`), path.join(dirs[i < half ? 0 : 1], `${t}.csv`)));
        // MEASUREMENT 는 두 폴더에 반씩 나눠 둔다 — 합쳐 읽어야 위반 0 이 나온다.
        const lines = fs.readFileSync(path.join(src, "MEASUREMENT.csv"), "utf-8").split(/\r?\n/).filter(Boolean);
        const cut = Math.ceil((lines.length - 1) / 2);
        fs.writeFileSync(path.join(dirs[0], "MEASUREMENT.csv"), [lines[0], ...lines.slice(1, 1 + cut)].join("\n") + "\n", "utf-8");
        fs.writeFileSync(path.join(dirs[1], "MEASUREMENT.csv"), [lines[0], ...lines.slice(1 + cut)].join("\n") + "\n", "utf-8");
        const plan2 = inspect("LUNG_CANCER", dirs);
        planFolders = plan2;
        const mt = plan2.tables.find((t) => t.table === "MEASUREMENT")!;
        log(`폴더 2곳: 후보 ${plan2.candidates.length}개, 대응 ${Object.keys(plan2.mapping).length}/${tables.length}, 오류 ${plan2.errors} 주의 ${plan2.warnings} · MEASUREMENT ${mt.candidateIds.length}개 파일 ${mt.rows}행`);
        const rec2 = await runValidation({ cohort: "LUNG_CANCER", candidates: plan2.candidates, mapping: plan2.mapping, today: SAMPLE_TODAY, label: "폴더 2곳 입력" });
        log(`run ${rec2.run_id}: rules=${rec2.rules_total} violations=${rec2.violations_total} (폴더 2곳)`);
        expect(rec2.violations_total === 0, "폴더 2곳 합쳐 읽기: 위반 0 이어야 함");
        const planP = inspect("LUNG_CANCER", [path.join(out, "split")]);
        log(`상위 폴더 1곳: 후보 ${planP.candidates.length}개, 대응 ${Object.keys(planP.mapping).length}/${tables.length}`);
        // 같은 이름이 두 폴더에 있으면 합쳐 읽는다. PERSON 을 두 벌 넣으면 행이 두 배가 되고 PK 중복이 나와야 한다.
        fs.copyFileSync(path.join(src, "PERSON.csv"), path.join(dirs[1], "PERSON.csv"));
        const planD = inspect("LUNG_CANCER", dirs);
        const recD = await runValidation({ cohort: "LUNG_CANCER", candidates: planD.candidates, mapping: planD.mapping, today: SAMPLE_TODAY, label: "PERSON 두 벌" });
        log(`run ${recD.run_id}: violations=${recD.violations_total} (PERSON 두 벌 → PK 중복이어야 함)`);
        expect(recD.violations_total > 0, "PERSON 두 벌: PK 중복이 잡혀야 함");
        fs.rmSync(path.join(dirs[1], "PERSON.csv"));
      }
    }

    // ---- 규칙 설정: 끄기 · 심각도 · 범위 · 사용자 규칙, 관리자 모드(SQL 시험 · SQL 교체 · ADM), 되돌리기
    const base = ruleCtx().base;
    const rangeRule = base.structural.find((r) => r.check === "range")!;
    const notNull = base.structural.find((r) => r.check === "not_null")!;
    const sem = base.semantic[0];
    changeRules({ op: "disable", id: notNull.id, disabled: true });
    changeRules({ op: "severity", id: rangeRule.id, severity: rangeRule.severity === "error" ? "warning" : "error" });
    changeRules({ op: "params", id: rangeRule.id, params: { max: Number(rangeRule.params.max) + 1 } });
    changeRules({ op: "addCustom", rule: { name: "출생연도 1950 이후", table: "PERSON", field: "year_of_birth", check: "range", severity: "warning", params: { min: 1950, max: 2010 } } });
    expect(rules().find((r) => r.id === notNull.id)?.disabled === true, "끄기가 반영되지 않음");
    // 관리자 모드를 켜기 전에는 SQL 을 고칠 수 없다
    let denied = false;
    try { changeRules({ op: "sql", id: sem.id, sql: sem.sql }); } catch { denied = true; }
    expect(denied, "관리자 모드가 아닌데 SQL 교체가 허용됨");
    await setAdminMode(true);
    expect(adminMode, "관리자 모드가 켜지지 않음");
    const cleanDir = sampleDir("LUNG_CANCER", "clean");
    if (cleanDir) {
      // 올바른 SQL 은 오류 없이 돌고, 틀린 SQL 은 오류가 그대로 나와야 한다
      const good = await testSqlRule({ cohort: "LUNG_CANCER", ruleId: sem.id, sql: sem.sql, requires: sem.requires });
      log(`SQL 시험(표준 SQL 그대로): clean 위반 ${good.clean?.violations} · dirty 위반 ${good.dirty?.violations}`);
      expect(good.clean?.ok === true && good.clean.violations === 0, "표준 SQL 시험: clean 에서 위반 0 이어야 함");
      const bad = await testSqlRule({ cohort: "LUNG_CANCER", sql: "SELECT person_id, CAST(1 AS VARCHAR) AS row_key, 'x' AS detail FROM NO_SUCH_TABLE", requires: ["PERSON"] });
      log(`SQL 시험(틀린 SQL): ${bad.clean?.error?.split("\n")[0]}`);
      expect(bad.clean?.ok === false && !!bad.clean.error, "틀린 SQL 이 오류로 나오지 않음");
    }
    changeRules({ op: "sql", id: sem.id, sql: `${sem.sql.trim()}\n-- 관리자 시험 변경` });
    changeRules({ op: "addSql", rule: { name: "방문 종료일 시험(관리자)", category: "Plausibility", severity: "warning", scope: ["LUNG_CANCER"], requires: ["VISIT_OCCURRENCE"],
      sql: "SELECT person_id, CAST(visit_occurrence_id AS VARCHAR) AS row_key, 'visit_end_date 없음' AS detail FROM VISIT_OCCURRENCE WHERE visit_end_date IS NULL" } });
    const st = ruleSetState();
    log(`규칙 설정: ${st.changes.length}건 · 표준 ${st.standardHash.slice(0, 8)} → 적용 ${st.effectiveHash.slice(0, 8)}`);
    expect(st.standardHash !== st.effectiveHash, "규칙을 바꿨는데 해시가 그대로임");
    if (cleanDir) {
      const rec = await runFromDir("LUNG_CANCER", cleanDir, SAMPLE_TODAY, "규칙 변경 실행");
      const sub = JSON.parse(fs.readFileSync(path.join(runsDir(), rec.run_id, "submission.json"), "utf-8"));
      const rr = fs.readFileSync(path.join(runsDir(), rec.run_id, "rule_results.csv"), "utf-8").split(/\r?\n/);
      log(`규칙 변경 실행 ${rec.run_id}: disabled=${rec.rules_disabled} origin 컬럼=${rr[0].includes("origin")} rule_set=${JSON.stringify({ ...sub.rule_set, standard_hash: undefined, effective_hash: undefined })}`);
      expect(rr[0].includes("origin"), "rule_results.csv 에 origin 컬럼이 없음");
      expect(rec.rules_disabled === 1 && rec.rule_set_modified && rec.admin_modified, "변경 실행의 이력 표지가 맞지 않음");
      expect(sub.rule_set.admin_mode === true && sub.rule_set.admin_modified === true && sub.rule_set.disabled.length === 1 && sub.rule_set.custom.length === 1 && sub.rule_set.admin.length === 2, "submission.rule_set 내용이 맞지 않음");
      expect(sub.rule_set.standard_hash !== sub.rule_set.effective_hash, "submission.rule_set 해시가 같음");
      expect(fs.readFileSync(path.join(runsDir(), rec.run_id, "report.md"), "utf-8").includes("## 규칙 설정"), "report.md 에 '규칙 설정' 절이 없음");
    }
    // 이력과 되돌리기
    const hist = rs.readHistory(userDir());
    expect(hist.some((h) => h.action === "admin_on") && hist.some((h) => h.action === "sql" && h.admin_mode), "변경 이력에 관리자 모드·SQL 변경이 없음");
    log(`변경 이력 ${hist.length}줄`);

    // 화면 캡처: 검증 실행 화면은 대응표 상태를 보기 위해 렌더러에 계획을 넣어 준다 (폴더 2곳을 넣은 모습)
    if (planFolders ?? planX) win!.webContents.send("smoke:plan", planFolders ?? planX);
    // [화면, 파일 이름, 규칙 화면에서 고를 규칙]: 규칙 화면은 값을 바꾼 규칙과 SQL 을 바꾼 관리자 규칙, 두 모습을 찍는다
    const shots: Array<[string, string, string?]> = [["run", "run"], ["report", "report"], ["findings", "findings"], ["dashboard", "dashboard"],
      ["rules", "rules", rangeRule.id], ["rules", "rules_sql", sem.id], ["monitor", "monitor"], ["settings", "settings"]];
    for (const [page, file, ruleId] of shots) {
      win!.webContents.send("nav", page);
      // 화면이 붙은 뒤에 보내야 한다 — 그 화면은 열릴 때 비로소 듣기 시작한다
      await wait(400);
      if (ruleId) win!.webContents.send("smoke:rule", ruleId);
      await wait(page === "dashboard" || page === "run" ? 2100 : 1100);
      const img = await win!.webContents.capturePage();
      fs.writeFileSync(path.join(out, `${file}.png`), img.toPNG());
      log(`captured ${file}`);
    }
    // 되돌린 뒤에는 표준과 같아야 한다. 관리자 모드를 꺼도 SQL 변경은 남는다.
    await setAdminMode(false);
    expect(rules().find((r) => r.id === sem.id)?.origin === "admin", "관리자 모드를 껐더니 SQL 변경이 사라짐");
    changeRules({ op: "resetAll" });
    const reset = ruleSetState();
    expect(reset.standardHash === reset.effectiveHash && rs.isEmptyOverrides(reset.overrides), "표준으로 되돌린 뒤에도 해시가 다름");
    log(failures ? `FAILED ${failures}` : "ok");
  } catch (e) {
    failures++;
    log(`error ${(e as Error).stack ?? e}`);
  } finally {
    app.exit(failures ? 1 : 0);
  }
}

// ------------------------------------------------------------------ 시작
app.whenReady().then(async () => {
  config = readConfig();
  await db.openDb(path.join(app.getPath("userData"), "history.duckdb"));
  loadSavedOverrides();
  registerIpc();
  win = createWindow();
  win.on("closed", () => { win = null; });
  if (SMOKE) win.webContents.once("did-finish-load", () => { setTimeout(() => void smoke(), 800); });
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) win = createWindow(); });
});

app.on("window-all-closed", () => { db.closeDb(); if (process.platform !== "darwin" || SMOKE) app.quit(); });
app.on("before-quit", () => db.closeDb());
