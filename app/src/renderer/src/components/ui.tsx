// 작은 공용 컴포넌트
import type { ReactNode } from "react";
import { severityInfo, rateStatus } from "@shared/labels";
import type { RuleOrigin } from "@shared/types";

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
  const label: Record<string, string> = { pass: "통과", fail: "실패", skipped: "건너뜀", error: "오류", disabled: "꺼짐" };
  return <span className={`pill ${s === "error" ? "fail" : s}`}>{label[s] ?? s}</span>;
}

const ORIGIN_LABEL: Record<RuleOrigin, string> = { standard: "표준", modified: "변경", custom: "사용자", admin: "관리자" };

/** 규칙의 출처. 표준이 아니면 눈에 띄게 보인다. */
export function OriginPill({ o }: { o: string }) {
  if (o === "standard" || !o) return <span style={{ color: "var(--muted)", fontSize: 12 }}>표준</span>;
  return <span className={`pill ${o}`}>{ORIGIN_LABEL[o as RuleOrigin] ?? o}</span>;
}

export function RateDot({ pct }: { pct: number }) {
  const st = rateStatus(pct);
  return <span className="dot" style={{ background: st.color }} title={st.label} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
