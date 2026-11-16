import { useEffect, useMemo, useState } from "react";
import type { RunRecord, RunDetail, RunOutputs, RuleInfo } from "@shared/types";
import type { CriteriaSnapshot } from "@shared/criteria";
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
  /** undefined: 불러오는 중, null: 당시 기준 원본이 보관되지 않은 실행 */
  const [criteria, setCriteria] = useState<CriteriaSnapshot | null | undefined>(undefined);
  const [criteriaErr, setCriteriaErr] = useState<string | null>(null);
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
    setD(null); setOutputs(null); setOutputsErr(null); setCriteria(undefined); setCriteriaErr(null);
    if (!runId) { setLoading(false); return; }
    setLoading(true); setErr(null);
    api.getRun(runId).then((detail) => { if (active) setD(detail); })
      .catch((e) => { if (active) setErr(String(e)); })
      .finally(() => { if (active) setLoading(false); });
    api.getRunOutputs(runId).then((files) => { if (active) setOutputs(files); })
      .catch((e) => { if (active) setOutputsErr(String(e)); });
    api.getRunCriteria(runId).then((c) => { if (active) setCriteria(c); })
      .catch((e) => { if (active) setCriteriaErr(String(e)); });
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
          <Card title="실행 당시 적용 기준" sub="이 실행을 시작할 때 보관한 명세와 규칙입니다. 이후 기준이 바뀌어도 이 화면은 바뀌지 않으며 현재 기준을 대신 보여 주지 않습니다.">
            {criteriaErr ? <div className="callout err" role="alert">당시 기준을 불러오지 못했습니다: {criteriaErr} <button className="btn" onClick={() => setRetry((n) => n + 1)}>다시 시도</button></div>
              : criteria === undefined ? <div role="status">당시 기준 확인 중…</div>
              : criteria === null ? <div className="callout warn" role="status">당시 명세·규칙 원본이 보관되지 않은 실행입니다. 이 실행에 적용된 기준을 정확히 복원할 수 없으므로 현재 기준으로 대신 보여 주지 않습니다. 위 결과의 규칙별 건수와 보고서 원문만 근거로 삼으세요.</div>
              : <HistoricCriteria key={runId} snap={criteria} results={d?.rules ?? []} />}
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

const RULE_LIMIT = 150;

/** 그 실행의 파라미터 조건 (범위·패턴·코드). 표준 값과 달라졌으면 표준 값도 적는다. */
function conditionLines(r: RuleInfo): string[] {
  const p = r.params, s = r.standardParams;
  if (!p) return [];
  const out: string[] = [];
  const diff = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
  if (p.min !== undefined || p.max !== undefined) out.push(`범위: ${p.min ?? "-"} ~ ${p.max ?? "-"}${s && diff([p.min, p.max], [s.min, s.max]) ? ` (표준 ${s.min ?? "-"} ~ ${s.max ?? "-"})` : ""}`);
  if (p.regex !== undefined) out.push(`패턴: ${p.regex}${s && p.regex !== s.regex ? ` (표준 ${s.regex ?? "-"})` : ""}`);
  if (p.codelist !== undefined) out.push(`코드 목록: ${p.codelist}`);
  if (p.extraCodes?.length) out.push(`추가 허용 코드: ${p.extraCodes.join(", ")}`);
  return out;
}

/** 실행 시작 때 보관한 명세·유효 규칙. 현재 기준은 읽지 않는다. */
function HistoricCriteria({ snap, results }: { snap: CriteriaSnapshot; results: RunDetail["rules"] }) {
  const [tab, setTab] = useState<"rules" | "spec">("rules");
  const [q, setQ] = useState("");
  const [ruleId, setRuleId] = useState("");
  const [table, setTable] = useState(snap.tables[0]?.table ?? "");
  const needle = q.trim().toLowerCase();
  const resultById = useMemo(() => new Map(results.map((r) => [r.rule_id, r])), [results]);
  const rules = useMemo(() => needle ? snap.rules.filter((r) => [r.id, r.name, r.table, r.fields, r.desc, r.check, r.sql ?? ""].some((v) => v.toLowerCase().includes(needle))) : snap.rules, [snap, needle]);
  const rule = snap.rules.find((r) => r.id === ruleId);
  const spec = snap.tables.find((t) => t.table === table);
  const fields = useMemo(() => !spec ? [] : needle ? spec.fields.filter((f) => [f.name, f.type, f.desc, f.codelist ?? "", f.ref ?? "", ...f.codes].some((v) => v.toLowerCase().includes(needle))) : spec.fields, [spec, needle]);
  const c = snap.criteria;
  const overridden = snap.standardHash !== snap.effectiveHash;

  return (
    <>
      <div className="kv">
        <span className="k">기준 패키지</span><span>{c.manifest.name} · 버전 {c.manifest.version} · {c.source === "builtin" ? "앱 내장" : "가져온 패키지"}</span>
        <span className="k">패키지 해시</span><code>{c.hash}</code>
        <span className="k">배포</span><span>{c.manifest.publisher}</span>
        <span className="k">구성</span><span>테이블 {c.tables}개 · 필드 {c.fields}개 · 규칙 {c.rules}개 · 코호트 {c.cohorts.join(", ")}</span>
        <span className="k">검증 기준일</span><span>{snap.today}</span>
        <span className="k">보관 시각</span><span>{fmtTime(snap.createdAt)}</span>
        <span className="k">규칙 설정</span><span>{overridden ? "표준과 다른 규칙 설정으로 실행" : "표준 규칙 그대로 실행"}{snap.adminMode ? " · 관리자 모드 켬" : ""} <span className="hint">(표준 {snap.standardHash.slice(0, 12)} · 적용 {snap.effectiveHash.slice(0, 12)})</span></span>
      </div>
      <p className="hint">원본은 실행 폴더의 criteria.zip 과 criteria-snapshot.json 에 있습니다. 관리자 SQL 이 담길 수 있어 기관 밖으로 보내지 않습니다.</p>
      <div className="toolbar" role="tablist" aria-label="당시 기준 보기">
        <button className={`btn${tab === "rules" ? " primary" : ""}`} role="tab" aria-selected={tab === "rules"} onClick={() => setTab("rules")}>적용된 규칙 {snap.rules.length}개</button>
        <button className={`btn${tab === "spec" ? " primary" : ""}`} role="tab" aria-selected={tab === "spec"} onClick={() => setTab("spec")}>명세 · 필드 {snap.tables.length}개 테이블</button>
        <span className="spacer" />
        <input type="search" aria-label="당시 기준 검색" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "rules" ? "규칙 ID · 이름 · 테이블 · 설명 · SQL 검색" : "필드 이름 · 유형 · 설명 · 코드 검색"} style={{ maxWidth: 320 }} />
      </div>
      {tab === "rules" ? (
        <>
          <p className="hint">{rules.length}개 중 {Math.min(rules.length, RULE_LIMIT)}개 표시{rules.length > RULE_LIMIT && " · 검색으로 좁히세요"}. 규칙을 선택하면 조건과 SQL 을 볼 수 있습니다.</p>
          <div className="tblwrap short"><table className="tbl">
            <thead><tr><th>규칙</th><th>출처</th><th>심각도</th><th>테이블</th><th>이 실행의 결과</th></tr></thead>
            <tbody>{rules.slice(0, RULE_LIMIT).map((r) => {
              const res = resultById.get(r.id);
              return (
                <tr key={r.id} className={`click${r.id === ruleId ? " sel" : ""}`} onClick={() => setRuleId(r.id === ruleId ? "" : r.id)}>
                  <td><button className="btn-link" aria-expanded={r.id === ruleId} onClick={(e) => { e.stopPropagation(); setRuleId(r.id === ruleId ? "" : r.id); }}><span className="mono">{r.id}</span> {r.name}</button></td>
                  <td><OriginPill o={r.origin} /></td><td><SeverityPill s={r.severity} /></td><td className="mono">{r.table}</td>
                  <td>{r.disabled ? <StatusPill s="disabled" /> : res ? <StatusPill s={res.status} /> : <span className="hint">기록 없음</span>}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
          {rule && (
            <div className="detail-panel" role="region" aria-label={`${rule.id} 당시 조건`}>
              <h3><span className="mono">{rule.id}</span> {rule.name}</h3>
              <div className="kv">
                <span className="k">분류</span><span>{CATEGORY_LABELS[rule.category] ?? rule.category} · {rule.subcategory} · {checkLabel(rule.check)}</span>
                <span className="k">테이블 · 필드</span><span className="mono">{rule.table}{rule.fields ? ` · ${rule.fields}` : ""}</span>
                <span className="k">적용 범위</span><span>{rule.scope}</span>
                <span className="k">심각도</span><span>{rule.severity}{rule.severity !== rule.standardSeverity && ` (표준 ${rule.standardSeverity})`}{rule.disabled && " · 꺼 둔 규칙"}</span>
                <span className="k">설명</span><span>{rule.desc || "-"}</span>
                <span className="k">조건</span><span>{conditionLines(rule).map((l) => <div key={l}>{l}</div>)}{!conditionLines(rule).length && (rule.sql ? "아래 SQL 이 조건입니다." : "조정 가능한 값이 없는 규칙입니다.")}</span>
              </div>
              {rule.sql && <><h4>당시 SQL</h4><pre className="report">{rule.sql}</pre></>}
              {rule.standardSql && rule.standardSql !== rule.sql && <><h4>표준 SQL (참고)</h4><pre className="report">{rule.standardSql}</pre></>}
            </div>
          )}
        </>
      ) : (
        <>
          <label className="field-label">테이블
            <select value={table} onChange={(e) => setTable(e.target.value)}>
              {snap.tables.map((t) => <option key={t.table} value={t.table}>{t.table} · {t.kor}</option>)}
            </select>
          </label>
          {spec ? (
            <div className="tblwrap"><table className="tbl">
              <thead><tr><th>필드</th><th>유형</th><th>필수</th><th>코드 · 범위 · 참조</th><th>설명</th></tr></thead>
              <tbody>{fields.map((f) => (
                <tr key={f.name}>
                  <td className="mono">{f.name}</td><td>{f.type}</td><td>{f.required ? "필수" : ""}</td>
                  <td>{f.codelist && <div className="mono">{f.codelist}</div>}{f.codes.length > 0 && <div className="mono">{f.codes.join(", ")}</div>}{f.range && <div>범위 {f.range.join(" ~ ")}</div>}{f.ref && <div>참조 {f.ref}</div>}</td>
                  <td>{f.desc}</td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <Empty>보관된 명세에 테이블이 없습니다.</Empty>}
        </>
      )}
    </>
  );
}
