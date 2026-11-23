import { useEffect, useMemo, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import type { Dashboard as DashboardData, RuleInfo } from "@shared/types";
import { SEVERITIES, severityInfo, checkLabel } from "@shared/labels";
import { api, fmt, fmtTime } from "../api";
import { Card, Stat, Empty, RunOutcome } from "../components/ui";
import type { Nav } from "../App";

const PALETTE = ["#2563eb", "#38bdf8", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#f97316", "#64748b", "#a3e635"];

export function Dashboard({ nav }: { nav: Nav }) {
  const [d, setD] = useState<DashboardData | null>(null);
  const [rules, setRules] = useState<RuleInfo[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [rulesErr, setRulesErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true; setErr(null); setRulesErr(null); setD(null);
    api.getDashboard().then((data) => { if (active) setD(data); }).catch((e) => { if (active) setErr(String(e)); });
    api.listRules().then((data) => { if (active) setRules(data); }).catch((e) => { if (active) setRulesErr(String(e)); });
    return () => { active = false; };
  }, [retry]);

  const totalViolations = useMemo(() => d?.byCheck.reduce((a, b) => a + b.count, 0) ?? 0, [d]);
  const severityRows = useMemo(() => {
    const m = new Map(d?.bySeverity.map((s) => [s.severity, s.count]) ?? []);
    return SEVERITIES.map((s) => ({ ...s, count: m.get(s.key) ?? 0 }));
  }, [d]);
  const trend = useMemo(() => (d?.trend ?? []).map((t, i) => ({ ...t, x: `${t.cohort.slice(0, 4)}#${i + 1}`, time: fmtTime(t.created_at) })), [d]);
  const latestRun = d?.latestByCohort.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  if (err) return <div className="callout err" role="alert">{err} <button className="btn" onClick={() => setRetry((n) => n + 1)}>다시 시도</button></div>;
  if (!d) return <div className="loading" role="status">대시보드를 불러오는 중…</div>;

  return (
    <>
      <div className="page-title">
        <h1>대시보드</h1>
        <span className="sub">코호트별 최신 실행 기준 · 실행 {d.totals.runs}회 누적</span>
      </div>

      {d.latestByCohort.length === 0 && (
        <div className="callout warn" style={{ marginBottom: 14 }}>
          아직 검증 실행 기록이 없습니다. 좌측 메뉴의 검증 실행에서 코호트 파일을 넣고 실행하면 이 화면이 채워집니다.
        </div>
      )}

      <div className="grid c2">
        {/* ① 위반 유형별 통계 */}
        <Card num={1} title="위반 유형별 통계" sub="오류와 경고를 포함한 위반 건수의 분포">
          {d.byCheck.length === 0 ? <Empty>보고된 위반 없음 · 검사 범위는 각 보고서에서 확인하세요.</Empty> : (
            <div style={{ display: "grid", gridTemplateColumns: "130px minmax(0, 1fr)", gap: 6, alignItems: "center" }}>
              <div style={{ height: 150, position: "relative" }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={d.byCheck} dataKey="count" nameKey="label" innerRadius={42} outerRadius={70} paddingAngle={1} stroke="none">
                      {d.byCheck.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmt(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", textAlign: "center", fontSize: 11, color: "var(--muted)" }}>
                  <div>총 위반 건수<br /><b style={{ fontSize: 15, color: "var(--navy)" }}>{fmt(totalViolations)}</b></div>
                </div>
              </div>
              <div className="legend">
                {d.byCheck.slice(0, 7).map((c, i) => (
                  <div key={c.check}><span className="sw" style={{ background: PALETTE[i % PALETTE.length] }} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</span>
                    <span style={{ color: "var(--ink-2)" }} title={`${fmt(c.count)}건`}>{totalViolations ? ((c.count / totalViolations) * 100).toFixed(1) : "0.0"}%</span></div>
                ))}
              </div>
            </div>
          )}
          <div className="sub" style={{ marginTop: 10, fontWeight: 600, color: "var(--navy)" }}>심각도별 통계</div>
          <table className="tbl">
            <thead><tr><th>심각도</th><th className="num">건수</th><th className="num">비율</th></tr></thead>
            <tbody>
              {severityRows.map((s) => (
                <tr key={s.key}><td className="nw" style={{ color: s.color, fontWeight: 600 }}>{s.label}</td><td className="num">{fmt(s.count)}</td>
                  <td className="num" style={{ color: s.color }}>{totalViolations ? ((s.count / totalViolations) * 100).toFixed(1) : "0.0"}%</td></tr>
              ))}
              <tr className="total"><td>합계</td><td className="num">{fmt(totalViolations)}</td><td className="num">{totalViolations ? "100%" : "—"}</td></tr>
            </tbody>
          </table>
        </Card>

        {/* ② 질환별 검증 결과 */}
        <Card num={2} title="질환별 검증 결과" sub="코호트별 최신 실행. 오류·경고와 실제 검사 상태를 함께 확인하세요.">
          {d.latestByCohort.length === 0 ? <Empty>실행 기록 없음</Empty> : (
            <div className="table-scroll"><table className="tbl">
              <thead><tr><th>질환 · 보고서</th><th className="num">입력 행</th><th className="num">오류</th><th className="num">경고</th><th>검사 상태</th></tr></thead>
              <tbody>
                {d.latestByCohort.map((r) => (
                  <tr key={r.run_id}>
                    <td><button className="btn-link" onClick={() => nav.go("report", r.run_id)}>{r.cohort_kor}</button><div className="hint">{fmtTime(r.created_at)}</div></td><td className="num">{fmt(r.rows_total)}</td>
                    <td className="num">{fmt(r.violations_error)}</td><td className="num">{fmt(r.violations_warning)}</td><td><RunOutcome run={r} /></td>
                  </tr>
                ))}
                <tr className="total"><td>합계</td><td className="num">{fmt(d.totals.rows)}</td><td className="num">{fmt(d.latestByCohort.reduce((n, r) => n + r.violations_error, 0))}</td><td className="num">{fmt(d.latestByCohort.reduce((n, r) => n + r.violations_warning, 0))}</td><td>상태는 코호트별 확인</td></tr>
              </tbody>
            </table></div>
          )}
        </Card>

        {/* ③ 적용 검증 규칙 */}
        <Card num={3} title="적용 검증 규칙" sub={`구조 규칙 ${fmt(d.rulesCount.structural)}개 · 교차 규칙 ${fmt(d.rulesCount.semantic)}개`}>
          {rulesErr && <div className="callout err" role="alert">규칙을 불러오지 못했습니다. <button className="btn sm" onClick={() => setRetry((n) => n + 1)}>다시 시도</button></div>}
          <div className="tblwrap short">
            <table className="tbl">
              <thead><tr><th>규칙 ID</th><th>규칙명</th><th>규칙 유형</th></tr></thead>
              <tbody>
                {rules.filter((r) => !["table_present", "columns"].includes(r.check)).slice(0, 8).map((r) => (
                  <tr key={r.id}><td className="mono">{r.id}</td><td className="ellipsis" style={{ maxWidth: 120 }} title={`${r.name} · ${r.table}`}>{r.name}</td><td style={{ fontSize: 12 }}>{checkLabel(r.check)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sub" style={{ marginTop: 10, fontWeight: 600, color: "var(--navy)" }}>규칙 유형 설명</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.7, color: "var(--ink-2)" }}>
            <li><b>필수값</b>: 필수 항목의 존재 여부 확인</li>
            <li><b>코드 검증</b>: 코드표·OMOP 허용집합 적용 여부</li>
            <li><b>값 범위</b>: 허용 범위 내 값인지 검증</li>
            <li><b>타입 검증</b>: 날짜·숫자 형식 일치 여부</li>
            <li><b>논리 검증</b>: 이벤트 간 논리 및 시간 순서 (교차 테이블 SQL)</li>
          </ul>
        </Card>

        {/* ④ 후속 조치 내용 */}
        <Card num={4} title="후속 조치 내용" sub="위반 심각도별 조치 안내">
          <table className="tbl">
            <thead><tr><th>심각도</th><th>주요 조치 가이드</th></tr></thead>
            <tbody>
              {SEVERITIES.map((s) => (
                <tr key={s.key}><td style={{ color: s.color, fontWeight: 600, whiteSpace: "nowrap" }}>{s.label}</td><td>{s.guide}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="sub" style={{ marginTop: 12, fontWeight: 600, color: "var(--navy)" }}>검증 후속 절차</div>
          <div className="steps">
            {["오류 검토", "원인 분석", "데이터 수정", "재검증 수행", "검증 완료"].map((s, i, a) => (
              <span key={s} style={{ display: "contents" }}>
                <div className="st"><b>{["⌕", "▦", "✎", "↻", "✓"][i]}</b>{s}</div>
                {i < a.length - 1 && <span className="arrow">→</span>}
              </span>
            ))}
          </div>
        </Card>
      </div>

      {/* ⑤ 검증 결과 모니터링 */}
      <div style={{ marginTop: 14 }}>
        <Card num={5} title="검증 결과 모니터링" sub="이 PC 의 실행 이력에 따른 위반 추이">
          <div className="grid c2">
            <div>
              <div className="sub" style={{ fontWeight: 600, color: "var(--navy)" }}>실행별 위반 건수 추이</div>
              <div style={{ height: 210 }}>
                {trend.length ? (
                  <ResponsiveContainer>
                    <LineChart data={trend} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                      <CartesianGrid stroke="#eef1f5" />
                      <XAxis dataKey="x" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} />
                      <Tooltip labelFormatter={(_, p) => (p?.[0]?.payload?.time ?? "") + " · " + (p?.[0]?.payload?.label ?? "")} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="violations_error" name="오류(High)" stroke={severityInfo("error").color} dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="violations_warning" name="경고(Medium)" stroke={severityInfo("warning").color} dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <Empty>실행 기록 없음</Empty>}
              </div>
            </div>
            <div>
              <div className="sub" style={{ fontWeight: 600, color: "var(--navy)" }}>검증 상태 요약</div>
              <div className="grid c3" style={{ gap: 8 }}>
                <Stat k="입력 행 수" v={fmt(d.totals.rows)} s="코호트별 최신 실행 합계" />
                <Stat k="오류 건수" v={fmt(d.latestByCohort.reduce((n, r) => n + r.violations_error, 0))} tone={d.latestByCohort.some((r) => r.violations_error) ? "red" : undefined} />
                <Stat k="경고 건수" v={fmt(d.latestByCohort.reduce((n, r) => n + r.violations_warning, 0))} tone={d.latestByCohort.some((r) => r.violations_warning) ? "orange" : undefined} />
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "stretch" }}>
                <div className={`callout ${latestRun ? "" : "warn"}`} style={{ flex: 1 }}>
                  {latestRun ? <>✓ 최근 검증 완료: {latestRun.cohort_kor} · {latestRun.label} · {fmtTime(latestRun.created_at)}</> : "검증 실행 기록이 없습니다."}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
