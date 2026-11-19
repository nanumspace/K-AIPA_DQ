// 출력물: 실행 폴더의 파일 정의, 규칙별 결과 CSV 와 중앙 제출용 집계 생성, 묶음 내보내기
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { writeCsv } from "@engine/csv.js";
import { publicSummary } from "@engine/engine.js";
import type { Summary, RuleStat } from "@engine/types.js";
import type { OutputFile, RunOutputs } from "@shared/types";
import type { CriteriaInfo } from "@shared/criteria";
import type { NormReport } from "./input";
import { checkLabel } from "@shared/labels";
import type { RuleSetInfo } from "./ruleset";
import { CRITERIA_SNAPSHOT_JSON, CRITERIA_ZIP } from "./snapshot";

export const APP_VERSION = app.getVersion();

const FILES: Omit<OutputFile, "path" | "size">[] = [
  { key: "report", name: "report.md", label: "검증 보고서", desc: "요약, 분류별 집계와 실패 규칙별 건수. 입력 원문과 DB 오류 원문은 포함하지 않습니다.", shareable: true },
  { key: "findings", name: "findings.csv", label: "위반 행 목록 (CSV)", desc: "규칙, 테이블, 행 키, 환자 ID, 상세. 병원 내부에서 데이터를 고칠 때 씁니다.", shareable: false },
  { key: "sufficiency", name: "sufficiency.csv", label: "데이터 충실도 미충족 목록 (CSV)", desc: "있어야 할 기록이 없는 환자·요법과 사유. 병원 내부에서 누락을 찾을 때 씁니다.", shareable: false },
  { key: "rules", name: "rule_results.csv", label: "규칙별 결과 (CSV)", desc: "규칙 전체의 통과·실패·건너뜀·꺼짐과 위반 수, 검사 행 수, 규칙의 출처(표준·변경·사용자·관리자).", shareable: true },
  { key: "submission", name: "submission.json", label: "제출용 집계", desc: "환자 단위 정보를 뺀 규칙별 건수와 테이블 행 수, 규칙 설정(표준 여부). 제출이 필요할 때 전달하는 파일이며 앱이 자동으로 보내지는 않습니다.", shareable: true },
  { key: "summary", name: "summary.json", label: "실행 요약 (JSON)", desc: "규칙 단위 요약. DB 오류 원문을 제외한 프로그램 간 비교용 결과.", shareable: true },
  { key: "criteria", name: CRITERIA_ZIP, label: "실행 당시 기준 패키지 (ZIP)", desc: "이 실행에 쓴 명세·규칙·데이터 충실도 YAML 9종과 manifest 의 원본. 다른 PC 에서 같은 기준으로 다시 검증하거나 감사할 때 씁니다. 기관 자체 규칙의 SQL 이 포함될 수 있습니다.", shareable: false },
  { key: "criteriaSnapshot", name: CRITERIA_SNAPSHOT_JSON, label: "실행 당시 유효 규칙·명세 (JSON)", desc: "그 실행에 적용된 규칙(심각도·조건·SQL 포함), 명세 요약, 검증 기준일과 이 PC 의 규칙 덧씌우기. 기관 자체 규칙의 SQL 이 포함될 수 있어 외부로 보내지 않습니다.", shareable: false },
];

/** 엔진 출력(report/findings/summary) 위에 rule_results.csv 와 submission.json 을 더한다 */
export function writeExtraOutputs(runDir: string, summary: Summary, meta: { cohortKor: string; label: string; runId: string; ruleSet: RuleSetInfo; criteria?: CriteriaInfo }, norm: Record<string, NormReport> = {}): void {
  summary = publicSummary(summary);
  const rules = summary.rules as RuleStat[];
  appendNormalization(path.join(runDir, "report.md"), norm);
  appendCriteria(path.join(runDir, "report.md"), runDir, meta.criteria);
  writeCsv(path.join(runDir, "rule_results.csv"),
    ["rule_id", "name", "category", "subcategory", "severity", "check", "origin", "table", "fields", "status", "violations", "rows_checked", "note"],
    rules.map((r) => ({ ...r })));
  const byCheck = new Map<string, { rules: number; failed: number; violations: number }>();
  for (const r of rules) {
    const b = byCheck.get(r.check) ?? { rules: 0, failed: 0, violations: 0 };
    b.rules++; if (r.status === "fail") b.failed++; b.violations += r.violations; byCheck.set(r.check, b);
  }
  // 중앙 집계 규칙: rule_set 이 표준(origin 이 모두 standard, disabled·modified·custom·admin 이 모두 빔)인 제출분만
  // 병원 간 비교에 그대로 쓴다. origin 이 standard 가 아닌 규칙이 있으면 그 규칙의 결과를 비교에서 빼거나 따로 표시한다.
  // admin_modified 가 true 이면 표준 SQL 이 바뀐 제출분이므로 반드시 따로 표시한다. standard_hash 가 다르면 규칙 버전이 다른 제출분이다.
  const submission = {
    schema: "kai-dq-submission/3",
    app_version: APP_VERSION,
    run_id: meta.runId, cohort: summary.cohort, cohort_kor: meta.cohortKor, label: meta.label,
    run_date: summary.run_date, generated_at: new Date().toISOString(),
    tables: summary.tables,
    rows_total: Object.values(summary.tables).reduce((a, b) => a + b, 0),
    // 내보내기 흔적을 얼마나 걷어 냈는지 (환자 단위 값 없음). 중앙이 기관별 내보내기 상태를 알 수 있다.
    normalization: Object.fromEntries(Object.entries(norm).filter(([, r]) => Object.values(r).some((n) => n > 0))),
    rule_set: meta.ruleSet,
    ...(meta.criteria ? { criteria: criteriaMeta(runDir, meta.criteria) } : {}),
    rules: { total: summary.rules_total, failed: summary.rules_failed, skipped: summary.rules_skipped, error: summary.rules_error, disabled: summary.rules_disabled },
    violations: { total: summary.violations_total, error: summary.violations_error, warning: summary.violations_warning },
    by_category: summary.by_category,
    by_check: [...byCheck.entries()].map(([check, b]) => ({ check, label: checkLabel(check), ...b })),
    by_rule: rules.map((r) => ({ rule_id: r.rule_id, name: r.name, category: r.category, severity: r.severity, check: r.check, origin: r.origin, table: r.table, status: r.status, violations: r.violations, rows_checked: r.rows_checked })),
    // 데이터 충실도: 항목별 대상·충족 수와 연령대별 수 (규칙 집계와 별개, 환자 단위 값 없음)
    sufficiency: (summary.sufficiency ?? []).map((x) => ({ id: x.id, title: x.title, unit: x.unit, status: x.status, eligible: x.eligible, met: x.met, per_year_median: x.per_year_median, by_age: x.by_age })),
    note: "환자 단위 정보(person_id, row_key, detail)는 포함하지 않습니다.",
  };
  fs.writeFileSync(path.join(runDir, "submission.json"), JSON.stringify(submission, null, 1), "utf-8");
}

export function runOutputs(runDir: string): RunOutputs {
  const files: OutputFile[] = FILES.map((f) => {
    const p = path.join(runDir, f.name);
    return { ...f, path: p, size: fs.existsSync(p) ? fs.statSync(p).size : 0 };
  });
  return { dir: runDir, inputDir: path.join(runDir, "input"), files };
}

/** 출력물(결과 6종과 실행 당시 기준 2종)을 대상 폴더 아래 <실행 ID>/ 로 복사한다. 없는 파일은 건너뛴다. */
export function exportBundle(runDir: string, runId: string, destRoot: string): string {
  const dest = path.join(destRoot, runId);
  fs.mkdirSync(dest, { recursive: true });
  const files = runOutputs(runDir).files;
  for (const f of files) if (f.size > 0) fs.copyFileSync(f.path, path.join(dest, f.name));
  // 기준 스냅샷이 없는 이전 실행은 해당 파일을 안내에서 뺀다 (있는 것처럼 적지 않는다)
  const listed = files.filter((f) => f.size > 0 || (f.key !== "criteria" && f.key !== "criteriaSnapshot"));
  const hasCriteria = files.some((f) => f.size > 0 && (f.key === "criteria" || f.key === "criteriaSnapshot"));
  fs.writeFileSync(path.join(dest, "README.txt"), [
    `K-AIPA DQ 결과 · ${runId}`, "",
    ...listed.map((f) => `- ${f.name}: ${f.label}. ${f.desc}${f.shareable ? "" : " [외부 제출 금지]"}`), "",
    "이 폴더는 앱이 로컬에 복사한 파일입니다. 앱은 어떤 파일도 자동 전송하지 않습니다. 제출이 필요하면 submission.json 만 직접 전달하세요.",
    "findings.csv · sufficiency.csv 는 환자 단위 정보(환자 ID, 행 키)가 있으므로 보안이 확보된 기관 내부 위치에만 보관하고 외부로 내보내지 않습니다.",
    ...(hasCriteria ? [`${CRITERIA_ZIP}, ${CRITERIA_SNAPSHOT_JSON} 에는 기관 자체 규칙의 SQL 과 내부 설명이 담길 수 있으므로 외부로 내보내지 않습니다. 같은 기준으로 다시 검증하려면 ${CRITERIA_ZIP} 을 기준 패키지로 가져오세요.`] : []), ""].join("\n"), "utf-8");
  return dest;
}

/** 제출용 집계에 적는 기준 패키지 정보 (명세·규칙 본문과 SQL 은 담지 않고 이름·버전·해시만) */
function criteriaMeta(runDir: string, c: CriteriaInfo) {
  return {
    name: c.manifest.name, version: c.manifest.version, hash: c.hash, source: c.source,
    publisher: c.manifest.publisher, min_app_version: c.manifest.minAppVersion,
    tables: c.tables, fields: c.fields, rules: c.rules, cohorts: c.cohorts,
    snapshot_files: [CRITERIA_ZIP, CRITERIA_SNAPSHOT_JSON].filter((n) => fs.existsSync(path.join(runDir, n))),
  };
}

/** 적용한 기준 패키지의 이름·버전·해시와 보관된 스냅샷 파일 이름을 보고서 끝에 적는다. */
function appendCriteria(reportPath: string, runDir: string, c: CriteriaInfo | undefined): void {
  if (!c || !fs.existsSync(reportPath)) return;
  const kept = [CRITERIA_ZIP, CRITERIA_SNAPSHOT_JSON].filter((n) => fs.existsSync(path.join(runDir, n)));
  const text = ["", "## 적용 기준 패키지", "",
    "| 항목 | 값 |", "|---|---|",
    `| 이름 | ${esc(c.manifest.name)} |`, `| 버전 | ${esc(c.manifest.version)} |`, `| 해시 | \`${esc(c.hash)}\` |`,
    `| 출처 | ${c.source === "builtin" ? "앱 내장" : "가져온 패키지"} |`, `| 배포 | ${esc(c.manifest.publisher)} |`,
    `| 구성 | 테이블 ${c.tables}개 · 필드 ${c.fields}개 · 규칙 ${c.rules}개 |`,
    `| 코호트 | ${esc(c.cohorts.join(", "))} |`,
    `| 보관된 스냅샷 | ${kept.length ? kept.map((n) => `\`${n}\``).join(", ") : "없음"} |`, "",
    "이 실행의 명세·규칙 원본은 위 스냅샷 파일로 실행 폴더에 보관되며 이후 기준이 바뀌어도 이 보고서와 함께 그대로 남습니다.", ""].join("\n");
  fs.appendFileSync(reportPath, text, "utf-8");
}

function esc(s: string): string { return s.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " "); }

const NORM_LABEL: Record<keyof NormReport, string> = {
  caseFolded: "컬럼명 대소문자를 소문자로", droppedColumns: "이름 없는 끝 컬럼 버림", trimmed: "값의 양끝 공백 걷음",
  nullStrings: "'NULL'·'NA' 등의 글자를 빈 값으로 (LYMPHOMA.cell_of_origin 의 'NA' 는 값이라 그대로 둠)", intFloats: "정수의 '.0' 걷음", zeroTimes: "날짜의 '00:00:00' 걷음",
};

/** 실행할 때 입력에 손댄 것이 있으면 보고서 끝에 적는다. 없으면 아무것도 적지 않는다. */
function appendNormalization(reportPath: string, norm: Record<string, NormReport>): void {
  const rows: string[] = [];
  for (const [table, r] of Object.entries(norm)) {
    for (const [k, n] of Object.entries(r) as Array<[keyof NormReport, number]>) if (n > 0) rows.push(`| ${table} | ${NORM_LABEL[k]} | ${n.toLocaleString("ko-KR")} |`);
  }
  if (!rows.length || !fs.existsSync(reportPath)) return;
  const text = ["", "## 입력 정규화", "",
    "검증 전에 내보내기 도구의 흔적을 걷어 냈습니다. 데이터를 고친 것이 아니라 표기를 되돌린 것이며, 아래 항목은 규칙 위반으로 세지 않았습니다.", "",
    "| 테이블 | 한 일 | 건수 |", "|---|---|---|", ...rows, ""].join("\n");
  fs.appendFileSync(reportPath, text, "utf-8");
}
