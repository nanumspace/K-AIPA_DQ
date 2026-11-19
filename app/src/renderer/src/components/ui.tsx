// 작은 공용 컴포넌트
import type { ReactNode } from "react";
import { severityInfo } from "@shared/labels";
import type { RuleOrigin, RunRecord } from "@shared/types";

export function Card(props: { title?: ReactNode; num?: number; sub?: ReactNode; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={`card ${props.className ?? ""}`}>
      {props.title && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <h2>{props.num !== undefined && <span className="num">{props.num}</span>}{props.title}</h2>
          {props.right}
        </div>
      )}
      {props.sub && <div className="sub">{props.sub}</div>}
      {props.children}
    </section>
  );
}

export function Stat(props: { k: string; v: ReactNode; s?: ReactNode; tone?: "red" | "orange" | "green" }) {
  return (
    <div className="stat">
      <div className="k">{props.k}</div>
      <div className={`v ${props.tone ?? ""}`}>{props.v}</div>
      {props.s && <div className="s">{props.s}</div>}
    </div>
  );
}

export function SeverityPill({ s }: { s: string }) {
  const info = severityInfo(s);
  return <span className={`pill ${info.key}`}>{info.short}</span>;
}

export function StatusPill({ s }: { s: string }) {
  const label: Record<string, string> = { pass: "통과", fail: "위반 발견", skipped: "건너뜀", error: "실행 오류", disabled: "꺼짐" };
  return <span className={`pill ${s === "error" ? "fail" : s}`}>{label[s] ?? s}</span>;
}

const ORIGIN_LABEL: Record<RuleOrigin, string> = { standard: "표준", modified: "변경", custom: "사용자", admin: "관리자" };

/** 규칙의 출처. 표준이 아니면 눈에 띄게 보인다. */
export function OriginPill({ o }: { o: string }) {
  if (o === "standard" || !o) return <span style={{ color: "var(--muted)", fontSize: 12 }}>표준</span>;
  return <span className={`pill ${o}`}>{ORIGIN_LABEL[o as RuleOrigin] ?? o}</span>;
}

export function RunOutcome({ run }: { run: RunRecord }) {
  const incomplete = run.rules_error + run.rules_skipped - (run.rules_skipped_optional ?? 0) + run.rules_disabled;
  const cls = run.rules_error || run.violations_error ? "error" : incomplete || run.violations_warning ? "warning" : "pass";
  const label = run.rules_error ? "검사 불완전 · 실행 오류" : incomplete ? "검사 범위 확인 필요" : run.violations_error ? "오류 수정 필요" : run.violations_warning ? "경고 검토 필요" : "보고된 위반 없음";
  return <span className={`pill ${cls}`}>{label}</span>;
}

export function RunSummary({ run }: { run: RunRecord }) {
  const optional = run.rules_skipped_optional ?? 0;
  const skipped = run.rules_skipped - optional;
  return (
    <section aria-label="검증 결과 요약">
      <div className="result-heading"><RunOutcome run={run} /><span>입력 {run.rows_total.toLocaleString("ko-KR")}행 · 테이블 {Object.keys(run.tables).length}개 · 대상 규칙 {run.rules_total}개</span></div>
      <div className="grid c4">
        <Stat k="수정할 오류" v={run.violations_error.toLocaleString("ko-KR")} s="오류 등급 위반 건수" tone={run.violations_error ? "red" : undefined} />
        <Stat k="검토할 경고" v={run.violations_warning.toLocaleString("ko-KR")} s="원천 데이터와 임상 맥락 확인" tone={run.violations_warning ? "orange" : undefined} />
        <Stat k="실행 오류" v={run.rules_error} s="검사를 끝내지 못한 규칙" tone={run.rules_error ? "red" : undefined} />
        <Stat k="미검사 규칙" v={skipped + run.rules_disabled} s={`건너뜀 ${skipped} · 꺼짐 ${run.rules_disabled}${optional ? ` · 선택 항목 미제출 ${optional}(미검사 아님)` : ""}`} tone={skipped + run.rules_disabled ? "orange" : undefined} />
      </div>
      {(run.rules_error + skipped + run.rules_disabled > 0) && <p className="callout warn">검사하지 못했거나 꺼 둔 규칙이 있습니다. 오류·경고가 0건이어도 전체 규칙을 통과한 것은 아닙니다. 아래 미검사·실행 오류 사유를 확인하세요.</p>}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
