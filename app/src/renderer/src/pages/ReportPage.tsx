import { useEffect, useMemo, useState } from "react";
import type { RunRecord, RunDetail, RunOutputs } from "@shared/types";
import { CATEGORY_LABELS, checkLabel } from "@shared/labels";
import { api, fmt, pct, fmtTime } from "../api";
import { Card, RunSummary, SeverityPill, StatusPill, OriginPill, Empty } from "../components/ui";
import { OutputList } from "./RunPage";
import type { Nav } from "../App";

export function ReportPage({ nav }: { nav: Nav }) {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [runId, setRunId] = useState(nav.runId ?? "");
  const [d, setD] = useState<RunDetail | null>(null);
  const [outputs, setOutputs] = useState<RunOutputs | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [outputsErr, setOutputsErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [listing, setListing] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setListing(true); setErr(null);
    api.listRuns().then((rs) => {
      if (!active) return;
      setRuns(rs); setRunId((id) => rs.some((r) => r.run_id === id) ? id : rs[0]?.run_id ?? "");
    }).catch((e) => { if (active) setErr(String(e)); })
      .finally(() => { if (active) setListing(false); });
    return () => { active = false; };
  }, [retry]);
  useEffect(() => {
    let active = true;
    setD(null); setOutputs(null); setOutputsErr(null);
    if (!runId) { setLoading(false); return; }
    setLoading(true); setErr(null);
    api.getRun(runId).then((detail) => { if (active) setD(detail); })
      .catch((e) => { if (active) setErr(String(e)); })
      .finally(() => { if (active) setLoading(false); });
    api.getRunOutputs(runId).then((files) => { if (active) setOutputs(files); })
      .catch((e) => { if (active) setOutputsErr(String(e)); });
    return () => { active = false; };
  }, [runId, retry]);

  const byCat = useMemo(() => {
    const m = new Map<string, { rules: number; failed: number; violations: number }>();
    for (const r of d?.rules ?? []) { const b = m.get(r.category) ?? { rules: 0, failed: 0, violations: 0 }; b.rules++; if (r.status === "fail") b.failed++; b.violations += r.violations; m.set(r.category, b); }
    return ["Conformance", "Completeness", "Plausibility"].map((c) => ({ c, ...(m.get(c) ?? { rules: 0, failed: 0, violations: 0 }) }));
  }, [d]);
  const failed = useMemo(() => (d?.rules ?? []).filter((r) => r.status === "fail").sort((a, b) => Number(b.severity === "error") - Number(a.severity === "error") || b.violations - a.violations), [d]);
  const skipped = useMemo(() => (d?.rules ?? []).filter((r) => r.status !== "fail" && r.status !== "pass").sort((a, b) => Number(b.status === "error") - Number(a.status === "error")), [d]);
  const run = d?.run.run_id === runId ? d.run : undefined;

  return (
    <>
      <div className="page-title"><h1>결과 보고서</h1>{run && <span className="sub">검증 기준일 {run.run_date} · 실제 실행 시각 {fmtTime(run.created_at)}</span>}</div>
      <div className="toolbar">
        <label className="field-label">실행 기록
          <select value={runId} onChange={(e) => setRunId(e.target.value)} disabled={listing || !runs.length}>
            {!runs.length && <option value="">실행 기록 없음</option>}
            {runs.map((r) => <option key={r.run_id} value={r.run_id}>{fmtTime(r.created_at)} · {r.cohort_kor} · {r.label}</option>)}
          </select>
        </label>
        <span className="spacer" />
        <button className="btn" disabled={!run || loading} onClick={() => nav.go("findings", runId)}>위반 상세</button>
      </div>
      {err && <div className="callout err error-actions" role="alert"><span>{err}</span><button className="btn" onClick={() => setRetry((n) => n + 1)}>다시 시도</button></div>}
      {(listing || loading) && <div className="loading" role="status">검증 결과를 불러오는 중…</div>}
      {!listing && !loading && !err && !runs.length && <Empty>실행 기록이 없습니다. <button className="btn" onClick={() => nav.go("run")}>검증 시작하기</button></Empty>}
      {!loading && run && (
        <>
          <h2 className="run-title">{run.cohort_kor} · {run.label}</h2>
          <RunSummary run={run} />
          {run.rule_set_modified && <div className="callout warn">표준과 다른 규칙 설정으로 실행했습니다.{run.admin_modified && " 관리자 SQL 규칙이 포함되어 있습니다."} 변경 내역은 보고서 원문과 제출용 집계에 기록됩니다.</div>}
          {skipped.length > 0 && (
            <Card title="먼저 확인: 미검사 · 실행 오류" sub="입력 누락, 꺼 둔 규칙 또는 실행 오류의 사유를 확인한 뒤 다시 검증하세요.">
              <div className="table-scroll"><table className="tbl">
                <thead><tr><th>규칙</th><th>상태</th><th>사유</th></tr></thead>
                <tbody>{skipped.map((r) => <tr key={r.rule_id}><td><span className="mono">{r.rule_id}</span> {r.name}</td><td><StatusPill s={r.status} /></td><td>{r.note || "규칙 설정과 입력 테이블을 확인하세요."}</td></tr>)}</tbody>
              </table></div>
            </Card>
          )}
          <Card title="우선 확인할 위반 규칙" sub={`${failed.length}개 · 오류 우선, 같은 심각도에서는 위반 수 내림차순. 규칙을 선택하면 해당 위반 행을 볼 수 있습니다.`}>
            {failed.length === 0 ? <Empty>위반이 보고된 규칙이 없습니다. 위의 검사 범위와 실행 상태도 함께 확인하세요.</Empty> : (
              <div className="table-scroll"><table className="tbl">
                <thead><tr><th>규칙 · 상세 보기</th><th>출처</th><th>심각도</th><th>테이블</th><th className="num">위반 건수</th><th className="num">검사 행</th></tr></thead>
                <tbody>{failed.map((r) => (
                  <tr key={r.rule_id}><td><button className="btn-link" onClick={() => nav.go("findings", runId, r.rule_id)}><span className="mono">{r.rule_id}</span> {r.name}</button><div className="hint">{CATEGORY_LABELS[r.category] ?? r.category} · {checkLabel(r.check_type)}</div></td>
                    <td><OriginPill o={r.origin} /></td><td><SeverityPill s={r.severity} /></td><td className="mono">{r.table_name}</td><td className="num">{fmt(r.violations)}</td><td className="num">{fmt(r.rows_checked)}</td></tr>
                ))}</tbody>
              </table></div>
            )}
          </Card>
          <Card title="저장과 제출" sub="원인을 확인하고 원천 데이터를 수정한 뒤 재검증하세요. 저장은 자동 전송이 아닙니다.">
            {outputs ? <OutputList key={runId} outputs={outputs} runId={runId} /> : outputsErr ? <div className="callout err" role="alert">출력물을 불러오지 못했습니다: {outputsErr} <button className="btn" onClick={() => setRetry((n) => n + 1)}>다시 시도</button></div> : <div role="status">출력물 확인 중…</div>}
          </Card>
          <details className="result-supplement">
            <summary>분류별 통계 · 입력 행 수 · 계산 지표</summary>
            <p className="hint">위반 건수 ÷ 입력 행 수: {run.rows_total ? pct(run.violations_total / run.rows_total * 100) : "계산 대상 없음"}. 한 행이 여러 규칙을 위반하면 중복 집계됩니다. 잘못된 행의 비율이나 임상 품질 점수가 아니며 100%를 넘을 수 있습니다.</p>
            <div className="grid c2">
              <Card title="Kahn 분류별"><div className="table-scroll"><table className="tbl">
                <thead><tr><th>분류</th><th className="num">규칙</th><th className="num">위반 발견 규칙</th><th className="num">위반 건수</th></tr></thead>
                <tbody>{byCat.map((b) => <tr key={b.c}><td>{CATEGORY_LABELS[b.c]}</td><td className="num">{b.rules}</td><td className="num">{b.failed}</td><td className="num">{fmt(b.violations)}</td></tr>)}</tbody>
              </table></div></Card>
              <Card title="입력 테이블 행 수"><div className="table-scroll"><table className="tbl"><tbody>{Object.entries(run.tables).map(([t, n]) => <tr key={t}><th scope="row">{t}</th><td className="num">{fmt(n)}</td></tr>)}</tbody></table></div></Card>
            </div>
          </details>
          <details className="result-supplement"><summary>보고서 원문 · report.md</summary><pre className="report">{d?.report || "(보고서 파일 없음)"}</pre></details>
        </>
      )}
    </>
  );
}
