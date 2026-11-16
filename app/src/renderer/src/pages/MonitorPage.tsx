import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { RunRecord } from "@shared/types";
import { severityInfo } from "@shared/labels";
import { api, fmt, pct, fmtTime } from "../api";
import { Card, Empty, RunOutcome } from "../components/ui";
import type { Nav } from "../App";

export function MonitorPage({ nav }: { nav: Nav }) {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [cohort, setCohort] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setErr(null);
    api.listRuns().then((rs) => { if (active) setRuns(rs); }).catch((e) => { if (active) setErr(String(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);

  const cohorts = useMemo(() => [...new Map(runs.map((r) => [r.cohort, r.cohort_kor])).entries()], [runs]);
  const list = useMemo(() => runs.filter((r) => !cohort || r.cohort === cohort), [runs, cohort]);
  const series = useMemo(() => list.slice().reverse().map((r, i) => ({
    x: `#${i + 1}`, time: fmtTime(r.created_at), label: `${r.cohort_kor} · ${r.label}`,
    error: r.violations_error, warning: r.violations_warning,
    rate: r.rows_total ? Number(((r.violations_total / r.rows_total) * 100).toFixed(3)) : 0,
  })), [list]);

  const del = async (r: RunRecord) => {
    if (!window.confirm(`실행 기록을 삭제할까요?\n${r.cohort_kor} · ${r.label} · ${fmtTime(r.created_at)}`)) return;
    try { await api.deleteRun(r.run_id); setRetry((n) => n + 1); }
    catch (e) { setErr(String(e)); }
  };

  return (
    <>
      <div className="page-title"><h1>통계 모니터링</h1><span className="sub">실행 이력 {fmt(runs.length)}회</span></div>
      {err && <div className="callout err" role="alert">{err} <button className="btn" onClick={() => setRetry((n) => n + 1)}>다시 시도</button></div>}
      {loading && <div className="loading" role="status">실행 이력을 불러오는 중…</div>}
      <div className="toolbar">
        <label className="field-label">코호트<select value={cohort} onChange={(e) => setCohort(e.target.value)}><option value="">전체 코호트</option>{cohorts.map(([id, kor]) => <option key={id} value={id}>{kor}</option>)}</select></label>
      </div>
      {!loading && <div>
        <Card title="위반 건수 추이" sub="실행 순서대로 · 오류(High) / 경고(Medium)">
          <div style={{ height: 240 }}>
            {series.length ? (
              <ResponsiveContainer>
                <LineChart data={series} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="#eef1f5" /><XAxis dataKey="x" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} />
                  <Tooltip labelFormatter={(_, p) => `${p?.[0]?.payload?.time ?? ""} · ${p?.[0]?.payload?.label ?? ""}`} /><Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="error" name="오류(High)" stroke={severityInfo("error").color} />
                  <Line type="monotone" dataKey="warning" name="경고(Medium)" stroke={severityInfo("warning").color} />
                </LineChart>
              </ResponsiveContainer>
            ) : <Empty>실행 기록 없음</Empty>}
          </div>
        </Card>
        <details className="result-supplement">
        <summary>보조 계산 지표: 위반 건수 ÷ 입력 행 수</summary>
        <Card title="입력 행 대비 위반 건수 (%)" sub="중복 집계 지표입니다. 잘못된 행의 비율이나 임상 품질 점수가 아니며 100%를 넘을 수 있습니다.">
          <div style={{ height: 240 }}>
            {series.length ? (
              <ResponsiveContainer>
                <LineChart data={series} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="#eef1f5" /><XAxis dataKey="x" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} unit="%" />
                  <Tooltip formatter={(v) => pct(Number(v))} labelFormatter={(_, p) => `${p?.[0]?.payload?.time ?? ""} · ${p?.[0]?.payload?.label ?? ""}`} />
                  <Line type="monotone" dataKey="rate" name="위반 건수 ÷ 입력 행 수" stroke="#3b6fd6" />
                </LineChart>
              </ResponsiveContainer>
            ) : <Empty>실행 기록 없음</Empty>}
          </div>
        </Card>
        </details>
      <Card title="실행 이력" className="pad0">
        <div className="tblwrap" style={{ maxHeight: "50vh" }}>
          {list.length === 0 ? <Empty>실행 기록 없음</Empty> : (
            <table className="tbl">
              <thead><tr><th>실행 시각</th><th>코호트</th><th>실행 이름</th><th>검증 기준일</th><th className="num">입력 행</th><th className="num">대상 규칙</th><th className="num">위반 발견 규칙</th><th className="num">오류</th><th className="num">경고</th><th>검사 상태</th><th>작업</th></tr></thead>
              <tbody>{list.map((r) => {
                return (
                  <tr key={r.run_id}>
                    <td>{fmtTime(r.created_at)}</td><td>{r.cohort_kor}</td><td>{r.label}</td><td>{r.run_date}</td>
                    <td className="num">{fmt(r.rows_total)}</td><td className="num">{fmt(r.rules_total)}</td><td className="num">{fmt(r.rules_failed)}</td>
                    <td className="num">{fmt(r.violations_error)}</td><td className="num">{fmt(r.violations_warning)}</td><td><RunOutcome run={r} /></td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn sm" onClick={() => nav.go("findings", r.run_id)}>위반 상세</button>{" "}
                      <button className="btn sm" onClick={() => nav.go("report", r.run_id)}>보고서</button>{" "}
                      <button className="btn sm danger" onClick={() => del(r)}>삭제</button>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          )}
        </div>
      </Card>
      </div>}
    </>
  );
}
