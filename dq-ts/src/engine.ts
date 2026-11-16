// 검증 엔진 본체: 적재 → 구조 규칙 → 교차 규칙 → 요약/보고서
import fs from "node:fs";
import path from "node:path";
import { loadSpec, loadCodelists, loadConcepts, loadProfiles } from "./load.js";
import { readCsv, writeCsv } from "./csv.js";
import { runStructural } from "./structural.js";
import { runSemantic } from "./semantic.js";
import { effectiveRules, ruleSetHash, describeOverrides, isEmptyOverrides } from "./rules.js";
import type { Finding, RawTable, RuleStat, Summary, Spec, Concepts, StructuralRule, SemanticRule, RuleOverrides } from "./types.js";

/**
 * 보고서에 싣는 예시에서 데이터 값을 가린다. report.md 는 병원 밖으로 나갈 수 있는 파일이라
 * 문장의 모양(어느 컬럼이 어떻게 어긋났는지)만 남기고 값(ID·날짜·수치·원천 문자열)은 '…' 로 바꾼다.
 * 규칙: 따옴표 안, '=' 뒤, 날짜, 그리고 식별자 밖의 숫자. dq/engine.py 의 mask_values 와 같아야 한다.
 */
export function maskValues(detail: string): string {
  return detail
    .replace(/'[^']*'/g, "'…'")
    .replace(/=\S+/g, "=…")
    .replace(/\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?/g, "…")
    .replace(/(?<![A-Za-z_\d.])\d+(?:\.\d+)?(?![A-Za-z_\d])/g, "…");
}

export const FINDING_COLUMNS = ["rule_id", "rule_name", "category", "severity", "table", "field", "row_key", "person_id", "detail"];

export type ProgressStage = "load" | "structural" | "semantic" | "write";
export interface Progress { stage: ProgressStage; done: number; total: number; text: string }
export type ProgressFn = (p: Progress) => void;

export interface EngineOptions {
  cohort: string;
  today?: string; // YYYY-MM-DD
  onProgress?: ProgressFn;
  /** 규칙 조정(끄기 · 심각도 · 범위 · 사용자 규칙 · SQL). 없으면 표준 규칙 그대로 돈다. */
  overrides?: RuleOverrides;
  /** 관리자 모드. SQL 교체·SQL 규칙(overrides.sql, customSql)은 이 값이 true 일 때만 받는다. */
  adminMode?: boolean;
}

export class Engine {
  readonly cohort: string;
  readonly todayIso: string;
  readonly spec: Spec;
  readonly codelists: Map<string, Set<string>>;
  readonly concepts: Concepts;
  readonly profile: { kor: string; tables: string[] };
  readonly tablesInCohort: string[];
  readonly diseaseTable: string;
  readonly rulesStruct: StructuralRule[];
  readonly rulesSem: SemanticRule[];
  readonly overrides?: RuleOverrides;
  readonly adminMode: boolean;
  readonly raw = new Map<string, RawTable>();
  readonly findings: Finding[] = [];
  readonly ruleStats = new Map<string, RuleStat>();
  private readonly progress?: ProgressFn;

  constructor(opt: EngineOptions) {
    this.cohort = opt.cohort;
    this.progress = opt.onProgress;
    this.todayIso = opt.today ?? new Date().toISOString().slice(0, 10);
    this.adminMode = opt.adminMode === true;
    this.overrides = isEmptyOverrides(opt.overrides) ? undefined : opt.overrides;
    if (!this.adminMode && (Object.keys(this.overrides?.sql ?? {}).length || this.overrides?.customSql?.length)) {
      throw new Error("규칙 설정 오류: SQL 교체와 SQL 규칙은 관리자 모드(adminMode)에서만 쓸 수 있다");
    }
    this.concepts = loadConcepts();
    this.spec = loadSpec();
    this.codelists = loadCodelists();
    const profiles = loadProfiles();
    if (!profiles[opt.cohort]) throw new Error(`알 수 없는 코호트: ${opt.cohort}`);
    this.profile = profiles[opt.cohort];
    this.tablesInCohort = this.profile.tables;
    this.diseaseTable = this.tablesInCohort.find((t) => this.spec.tables[t].category === "disease")!;
    const eff = effectiveRules(this.overrides);
    this.rulesStruct = eff.structural;
    this.rulesSem = eff.semantic;
  }

  load(dataDir: string): this {
    const n = this.tablesInCohort.length;
    this.tablesInCohort.forEach((t, i) => {
      this.progress?.({ stage: "load", done: i, total: n, text: `${t}.csv 읽는 중` });
      const p = path.join(dataDir, `${t}.csv`);
      if (!fs.existsSync(p)) return;
      const df = readCsv(p);
      this.raw.set(t, df);
    });
    this.progress?.({ stage: "load", done: n, total: n, text: `테이블 ${this.raw.size}개 적재` });
    return this;
  }

  private initStat = (rule: { id: string; name: string; category: string; subcategory?: string; severity: string; fields?: string[]; check?: string; origin: RuleStat["origin"] }, table: string): RuleStat => {
    const st: RuleStat = {
      rule_id: rule.id, name: rule.name, category: rule.category, subcategory: rule.subcategory ?? "",
      severity: rule.severity, table, fields: (rule.fields ?? []).join(","), check: rule.check ?? "sql", origin: rule.origin,
      status: "pass", violations: 0, rows_checked: 0, note: "",
    };
    this.ruleStats.set(rule.id, st);
    return st;
  };

  private add = (rule: { id: string; name: string; category: string; severity: string }, table: string, field: string, rowKey: string, personId: string | null, detail: string): void => {
    const st = this.ruleStats.get(rule.id)!;
    st.violations += 1;
    this.findings.push({
      rule_id: rule.id, rule_name: rule.name, category: rule.category, severity: rule.severity,
      table, field, row_key: rowKey, person_id: personId ?? "", detail,
    });
  };

  runStructural(): void {
    runStructural(
      { cohort: this.cohort, today: new Date(this.todayIso + "T00:00:00Z"), spec: this.spec, codelists: this.codelists,
        tablesInCohort: this.tablesInCohort, raw: this.raw,
        onRule: (i, n, id) => this.progress?.({ stage: "structural", done: i, total: n, text: `구조 규칙 ${id}` }) },
      this.rulesStruct, { initStat: this.initStat, add: this.add });
    for (const st of this.ruleStats.values()) if (st.violations > 0) st.status = "fail";
  }

  async runSemantic(): Promise<void> {
    await runSemantic(
      { cohort: this.cohort, todayIso: this.todayIso, spec: this.spec, concepts: this.concepts,
        tablesInCohort: this.tablesInCohort, raw: this.raw, diseaseTable: this.diseaseTable,
        onRule: (i, n, id) => this.progress?.({ stage: "semantic", done: i, total: n, text: `교차 규칙 ${id}` }) },
      this.rulesSem, { initStat: this.initStat, add: this.add });
  }

  summary(): Summary {
    const stats = [...this.ruleStats.values()];
    const byCat: Summary["by_category"] = {};
    for (const s of stats) {
      const b = (byCat[s.category] ??= { rules: 0, failed: 0, violations: 0 });
      b.rules += 1; if (s.status === "fail") b.failed += 1; b.violations += s.violations;
    }
    const tables: Record<string, number> = {};
    for (const [t, df] of this.raw) tables[t] = df.n;
    const sum = (pred: (s: RuleStat) => boolean) => stats.filter(pred).reduce((a, s) => a + s.violations, 0);
    return {
      cohort: this.cohort, run_date: this.todayIso, tables,
      rules_total: stats.length,
      rules_failed: stats.filter((s) => s.status === "fail").length,
      rules_skipped: stats.filter((s) => s.status === "skipped").length,
      rules_error: stats.filter((s) => s.status === "error").length,
      rules_disabled: stats.filter((s) => s.status === "disabled").length,
      violations_total: sum(() => true),
      violations_error: sum((s) => s.severity === "error"),
      violations_warning: sum((s) => s.severity === "warning"),
      by_category: byCat, rules: stats,
    };
  }

  write(outDir: string): Summary {
    this.progress?.({ stage: "write", done: 0, total: 1, text: "보고서 쓰는 중" });
    fs.mkdirSync(outDir, { recursive: true });
    writeCsv(path.join(outDir, "findings.csv"), FINDING_COLUMNS, this.findings as unknown as Record<string, unknown>[]);
    const s = this.summary();
    fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(s, null, 1), "utf-8");
    fs.writeFileSync(path.join(outDir, "report.md"), this.reportMd(s), "utf-8");
    return s;
  }

  /** 보고서의 `## 규칙 설정` 절. 규칙 구성 정보이며 환자 데이터가 아니다. */
  private ruleSettingsMd(): string[] {
    const L = ["## 규칙 설정", "",
      `- 표준 규칙 묶음 해시: ${ruleSetHash(undefined)}`,
      `- 이번 실행 규칙 묶음 해시: ${ruleSetHash(this.overrides)}`,
      `- 관리자 모드: ${this.adminMode ? "사용" : "사용 안 함"}`, ""];
    const changes = describeOverrides(this.overrides);
    if (changes.length) {
      L.push("| 규칙 | 구분 | 변경 내용 |", "|---|---|---|");
      for (const c of changes) L.push(`| ${c.rule_id} | ${c.origin} | ${c.change.replace(/\|/g, "\\|").replace(/\r?\n/g, " ")} |`);
    } else L.push("표준 규칙에서 바뀐 것이 없다.");
    L.push("");
    return L;
  }

  reportMd(s: Summary): string {
    const L: string[] = [];
    L.push(`# 데이터 품질 검증 보고서: ${this.cohort} (${this.profile.kor})`, "");
    if (this.overrides || this.adminMode) L.push(...this.ruleSettingsMd());
    L.push(`검증일 ${s.run_date} / 테이블 ${Object.keys(s.tables).length}개 / 규칙 ${s.rules_total}개 (실패 ${s.rules_failed}, 건너뜀 ${s.rules_skipped}, 오류 ${s.rules_error}${s.rules_disabled ? `, 비활성 ${s.rules_disabled}` : ""})`, "");
    L.push(`위반 ${s.violations_total}건 (error ${s.violations_error}, warning ${s.violations_warning})`, "");
    L.push("| 분류 | 규칙 수 | 실패 규칙 | 위반 건수 |", "|---|---|---|---|");
    for (const c of ["Conformance", "Completeness", "Plausibility"]) {
      const b = s.by_category[c] ?? { rules: 0, failed: 0, violations: 0 };
      L.push(`| ${c} | ${b.rules} | ${b.failed} | ${b.violations} |`);
    }
    L.push("", "## 테이블 행수", "", ...Object.entries(s.tables).map(([t, n]) => `- ${t}: ${n}`));
    L.push("", "## 실패 규칙", "", "| 규칙 | 분류 | 심각도 | 테이블 | 위반 | 예시 |", "|---|---|---|---|---|---|");
    const ex = new Map<string, string[]>();
    for (const f of this.findings) {
      const a = ex.get(f.rule_id) ?? [];
      if (a.length < 2) { a.push(maskValues(f.detail)); ex.set(f.rule_id, a); }
    }
    for (const r of s.rules) if (r.status === "fail")
      L.push(`| ${r.rule_id} ${r.name} | ${r.category} | ${r.severity} | ${r.table} | ${r.violations} | ${(ex.get(r.rule_id) ?? []).join(" / ").slice(0, 150)} |`);
    const errs = s.rules.filter((r) => r.status === "error");
    if (errs.length) L.push("", "## 규칙 실행 오류", "", ...errs.map((r) => `- ${r.rule_id}: ${maskValues(r.note ?? "")}`));
    return L.join("\n") + "\n";
  }
}

export async function runEngine(opt: EngineOptions & { data: string; out: string }): Promise<Summary> {
  const e = new Engine(opt).load(opt.data);
  e.runStructural();
  await e.runSemantic();
  return e.write(opt.out);
}
