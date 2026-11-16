// 메인 · preload · 렌더러가 공유하는 타입과 IPC 계약
import type { RuleOrigin, Severity, RuleOverrides, RuleParamsOverride, CustomRule, CustomSqlRule } from "@engine/types.js";

export type { RuleOrigin, Severity, RuleOverrides, RuleParamsOverride, CustomRule, CustomSqlRule };

export interface AppConfig {
  /** 명세(spec/)와 규칙(rules/)이 있는 디렉터리 */
  root: string;
  /** 검증 실행일 기본값 (null 이면 오늘) */
  defaultToday: string | null;
  /** 앱 데이터 위치 (읽기 전용 정보) */
  userData: string;
  /** 프로그램 버전 (package.json) */
  version: string;
  packaged: boolean;
  /** 관리자 모드. 앱을 켜는 동안만 유지되고 다시 열면 꺼진다 (SQL 로 바꾼 규칙은 꺼도 그대로 남는다) */
  adminMode: boolean;
}

export interface CohortInfo { id: string; kor: string; tables: string[] }

/** 규칙 서식(사용자 규칙 추가)에서 테이블 → 필드를 고르기 위한 명세 요약 */
export interface SpecTableInfo { table: string; kor: string; category: string; fields: { name: string; type: string }[] }

/** 규칙 하나에서 사용자가 조정할 수 있는 값의 종류 */
export type ParamKind = "range" | "pattern" | "codelist";
export interface RuleParams { min?: number; max?: number; regex?: string; codelist?: string; extraCodes?: string[] }

export interface RuleInfo {
  id: string; name: string; category: string; subcategory: string;
  /** 지금 적용되는 심각도 (이 PC 의 설정 반영) */
  severity: string;
  table: string; fields: string; check: string;
  desc: string; scope: string; kind: "structural" | "semantic";
  /** 지금 적용되는 SQL (교차 규칙) */
  sql?: string;
  origin: RuleOrigin;
  /** 이 PC 에서 꺼 둔 규칙 */
  disabled: boolean;
  standardSeverity: string;
  /** 범위·패턴·코드를 조정할 수 있는 규칙이면 그 종류 */
  paramKind?: ParamKind;
  params?: RuleParams;
  standardParams?: RuleParams;
  standardSql?: string;
}

/** 이 PC 의 규칙 설정 (표준 규칙은 바꾸지 않고 덧씌우기로만 저장한다) */
export interface RuleSetState {
  overrides: RuleOverrides;
  adminMode: boolean;
  standardHash: string;
  effectiveHash: string;
  /** 표준과 달라진 점 (규칙 ID · 출처 · 설명) */
  changes: { rule_id: string; origin: RuleOrigin; change: string }[];
}

/** 규칙 설정을 바꾸는 한 가지 동작. 메인이 검증·기록한 뒤 저장한다. */
export type RuleChange =
  | { op: "disable"; id: string; disabled: boolean }
  | { op: "severity"; id: string; severity: Severity | null }
  | { op: "params"; id: string; params: RuleParamsOverride | null }
  | { op: "sql"; id: string; sql: string | null }
  | { op: "addCustom"; rule: Omit<CustomRule, "id"> }
  | { op: "updateCustom"; rule: CustomRule }
  | { op: "removeCustom"; id: string }
  | { op: "addSql"; rule: Omit<CustomSqlRule, "id"> }
  | { op: "updateSql"; rule: CustomSqlRule }
  | { op: "removeSql"; id: string }
  | { op: "resetRule"; id: string }
  | { op: "resetAll" };

export interface RuleHistoryEntry {
  ts: string;
  action: string;
  rule_id: string;
  before: unknown;
  after: unknown;
  admin_mode: boolean;
}

/** 관리자 모드 SQL 시험: 내장 견본의 clean·dirty 에 규칙 하나만 돌려 본다 */
export interface SqlTestRequest { cohort: string; sql: string; requires: string[]; ruleId?: string }
export interface SqlTestSide { ok: boolean; error?: string; violations: number; rowsChecked: number; samples: string[] }
export interface SqlTestResult { cohort: string; clean: SqlTestSide | null; dirty: SqlTestSide | null }

// ------------------------------------------------------------------ 입력
/** 사용자가 넣은 파일 하나(CSV) 또는 엑셀 시트 하나 */
export interface SourceCandidate {
  id: string;
  kind: "csv" | "xlsx";
  path: string;
  sheet?: string;
  /** 표시 이름 (파일명 또는 파일명/시트명) */
  name: string;
  /** 이 파일이 있던 폴더. 폴더를 여럿 넣었을 때 같은 이름을 가려내는 데 쓴다. */
  folder: string;
  rows: number;
  columns: string[];
  /** 앞 20행 표본 (사전 점검용) */
  sample: string[][];
  encoding: string;
  sizeBytes: number;
  /** 쉼표가 아닐 때만 (';' 또는 '\t') */
  delimiter?: string;
  error?: string;
}

export interface InputIssue { level: "error" | "warn" | "info"; text: string }

export interface TableCheck {
  table: string;
  kor: string;
  /** 없으면 검증 자체가 무의미한 테이블 (PERSON, 질환 특화) */
  required: boolean;
  /** 이 테이블로 읽는 후보들 (없으면 빈 배열, 합치면 둘 이상) */
  candidateIds: string[];
  auto: boolean;
  rows: number | null;
  missingColumns: string[];
  extraColumns: string[];
  issues: InputIssue[];
}

export interface InputPlan {
  cohort: string;
  candidates: SourceCandidate[];
  /**
   * 테이블 → 그 테이블로 읽을 후보들. 보통 하나다.
   * 같은 이름의 파일이 여러 폴더에서 오면(나눠서 내보낸 MEASUREMENT 등) 합쳐 읽는다.
   */
  mapping: Record<string, string[]>;
  tables: TableCheck[];
  errors: number;
  warnings: number;
  /** 실행 가능 여부 (error 가 없음) */
  ok: boolean;
}

export interface PreviewData { columns: string[]; rows: string[][]; total: number }

export type TemplateKind = "csv" | "xlsx" | "spec" | "sample-clean" | "sample-dirty" | "sample-good";

// ------------------------------------------------------------------ 실행
export interface RunRequest {
  cohort: string;
  candidates: SourceCandidate[];
  mapping: Record<string, string[]>;
  today?: string;
  label?: string;
}

export interface RunProgress { runId: string; stage: string; done: number; total: number; text: string; pct: number }

export interface RunRecord {
  run_id: string; cohort: string; cohort_kor: string; label: string; data_dir: string;
  run_date: string; created_at: string;
  rules_total: number; rules_failed: number; rules_skipped: number; rules_error: number;
  violations_total: number; violations_error: number; violations_warning: number;
  rows_total: number; tables: Record<string, number>;
  /** 이 PC 에서 끈 규칙 수 */
  rules_disabled: number;
  /** 표준이 아닌 규칙(변경·사용자·관리자)이 하나라도 있었는지 */
  rule_set_modified: boolean;
  /** 관리자 출처 규칙(SQL 교체·ADM)이 있었는지 */
  admin_modified: boolean;
}

export interface RuleResultRow {
  rule_id: string; name: string; category: string; subcategory: string; severity: string;
  table_name: string; fields: string; check_type: string; origin: string; status: string;
  violations: number; rows_checked: number; note: string;
}

export interface FindingRow {
  seq: number; rule_id: string; rule_name: string; category: string; severity: string;
  table_name: string; field: string; row_key: string; person_id: string; detail: string;
}

export interface FindingsQuery {
  runId: string; ruleId?: string; table?: string; severity?: string; search?: string;
  offset: number; limit: number;
}
export interface FindingsPage { total: number; rows: FindingRow[] }

export interface RunDetail { run: RunRecord; rules: RuleResultRow[]; report: string }

// ------------------------------------------------------------------ 출력
export interface OutputFile {
  key: "report" | "findings" | "rules" | "submission" | "summary";
  name: string;
  label: string;
  desc: string;
  path: string;
  size: number;
  /** 병원 밖으로 보내도 되는 파일인지 */
  shareable: boolean;
}
export interface RunOutputs { dir: string; inputDir: string; files: OutputFile[] }

export interface CohortStatus extends RunRecord { error_rate: number }

export interface Dashboard {
  latestByCohort: CohortStatus[];
  byCheck: { check: string; label: string; count: number }[];
  bySeverity: { severity: string; count: number }[];
  rulesCount: { structural: number; semantic: number; total: number };
  trend: { run_id: string; created_at: string; cohort: string; label: string; violations_error: number; violations_warning: number; rows_total: number; error_rate: number }[];
  totals: { rows: number; violations: number; error_rate: number; runs: number };
}

export interface Api {
  getConfig(): Promise<AppConfig>;
  setConfig(patch: Partial<Pick<AppConfig, "root" | "defaultToday">>): Promise<AppConfig>;
  listCohorts(): Promise<CohortInfo[]>;
  listSpecTables(): Promise<SpecTableInfo[]>;
  listRules(): Promise<RuleInfo[]>;
  chooseDirectory(title?: string): Promise<string | null>;
  /** 폴더 여러 개 (테이블 파일을 나눠 담은 폴더들) */
  chooseDirectories(title?: string): Promise<string[]>;
  chooseFiles(): Promise<string[]>;
  /** 드래그 앤 드롭으로 받은 File 객체들의 실제 경로 */
  pathsForFiles(files: File[]): string[];
  inspectInput(cohort: string, paths: string[], existing?: SourceCandidate[]): Promise<InputPlan>;
  checkInput(cohort: string, candidates: SourceCandidate[], mapping: Record<string, string[]>): Promise<InputPlan>;
  previewSource(candidate: SourceCandidate): Promise<PreviewData>;
  exportTemplate(cohort: string, kind: TemplateKind): Promise<string | null>;
  runValidation(req: RunRequest): Promise<RunRecord>;
  onProgress(cb: (p: RunProgress) => void): () => void;
  listRuns(): Promise<RunRecord[]>;
  getRun(runId: string): Promise<RunDetail>;
  getRunOutputs(runId: string): Promise<RunOutputs>;
  getFindings(q: FindingsQuery): Promise<FindingsPage>;
  exportFile(runId: string, key: OutputFile["key"]): Promise<string | null>;
  exportBundle(runId: string): Promise<string | null>;
  deleteRun(runId: string): Promise<void>;
  getDashboard(): Promise<Dashboard>;
  openPath(p: string): Promise<void>;
  onNav(cb: (page: string) => void): () => void;
  /** 자동 점검 모드에서 메인이 넣어 주는 입력 계획 (화면 캡처용) */
  onSmokePlan(cb: (plan: InputPlan) => void): () => void;
  // ---- 규칙 설정 (이 PC 의 덧씌우기)
  getRuleSet(): Promise<RuleSetState>;
  changeRules(change: RuleChange): Promise<RuleSetState>;
  exportRuleSet(): Promise<string | null>;
  importRuleSet(): Promise<RuleSetState | null>;
  getRuleHistory(limit?: number): Promise<RuleHistoryEntry[]>;
  /** 관리자 모드를 켜고 끈다. 처음 켤 때는 확인 창이 뜨며 취소하면 꺼진 채로 남는다. */
  setAdminMode(on: boolean): Promise<AppConfig>;
  testSqlRule(req: SqlTestRequest): Promise<SqlTestResult>;
  /** 자동 점검 모드에서 메인이 알려 주는 규칙 화면 시연 대상 (화면 캡처용) */
  onSmokeRule(cb: (id: string) => void): () => void;
}
