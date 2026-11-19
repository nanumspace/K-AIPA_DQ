import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { RuleInfo, FindingRow, RuleResultRow } from "@shared/types";
import { checkLabel, CHECK_GUIDES } from "@shared/labels";
import { api, errText, fmt, fmtTime } from "../api";
import { Card, SeverityPill, Empty, RunOutcome } from "../components/ui";
import type { Nav } from "../App";
import "./findings.css";

const PAGE = 100;

type Load<T> = { key: string; status: "idle" | "loading" | "ok" | "error"; data?: T; error?: string };

/**
 * key 가 바뀌면 이전 결과는 즉시 버리고 새로 불러온다. 늦게 도착한 옛 응답은 무시한다(key 가 다르거나 effect 가 정리된 뒤).
 * key 가 null 이면 아직 불러올 때가 아니다. tick 을 올리면 같은 key 로 다시 시도한다.
 */
function useLoad<T>(key: string | null, load: () => Promise<T>, tick: number): Load<T> {
  const [state, setState] = useState<Load<T>>({ key: "", status: "idle" });
  useEffect(() => {
    if (key === null) return;
    let live = true;
    setState({ key, status: "loading" });
    load().then(
      (data) => { if (live) setState({ key, status: "ok", data }); },
      (e) => { if (live) setState({ key, status: "error", error: errText(e) }); },
    );
    return () => { live = false; };
    // load 는 key 에 담긴 값만 쓴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);
  if (key === null) return { key: "", status: "idle" };
  return state.key === key ? state : { key, status: "loading" };
}

function paramsText(info: RuleInfo | undefined): string | null {
  const p = info?.params;
  if (!info || !info.paramKind || !p) return null;
  if (info.paramKind === "range") return `허용 범위: ${p.min ?? "제한 없음"} ~ ${p.max ?? "제한 없음"}`;
  if (info.paramKind === "pattern") return p.regex ? `허용 형식(정규식): ${p.regex}` : null;
  if (!p.codelist) return null;
  return `기준 코드표: ${p.codelist}${p.extraCodes?.length ? ` (이 PC 에서 추가한 코드 ${p.extraCodes.length}개 포함)` : ""}`;
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div className="fnd-field"><label className="field-label" htmlFor={id}>{label}</label>{children}</div>;
}

function Loading({ children }: { children: ReactNode }) {
  return <div className="loading" role="status" aria-live="polite">{children}</div>;
}

function ErrorBox({ text, onRetry, retryLabel = "다시 시도" }: { text: string; onRetry: () => void; retryLabel?: string }) {
  return (
    <div className="callout err" role="alert">
      <div>{text}</div>
      <div className="error-actions"><button type="button" className="btn sm" onClick={onRetry}>{retryLabel}</button></div>
    </div>
  );
}

function DetailPanel(props: {
  f: FindingRow; result: RuleResultRow | undefined; info: RuleInfo | undefined; ruleFiltered: boolean;
  panelRef: { current: HTMLElement | null }; onClose: () => void; onFilterRule: () => void;
}) {
  const { f, result, info } = props;
  const checkType = result?.check_type ?? info?.check;
  const guide = checkType ? (CHECK_GUIDES[checkType] ?? CHECK_GUIDES.sql) : null;
  const expected = paramsText(info);
  const none = <span style={{ color: "var(--muted)" }}>(없음)</span>;
  return (
    <section className="detail-panel card" role="dialog" aria-labelledby="fnd-panel-title" tabIndex={-1} ref={(el) => { props.panelRef.current = el; }}
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); props.onClose(); } }}>
      <div className="fnd-panel-head">
        <h2 id="fnd-panel-title">위반 #{f.seq} · {f.rule_id} {f.rule_name} <SeverityPill s={f.severity} /></h2>
        <button type="button" className="btn sm" onClick={props.onClose}>닫기</button>
      </div>
      <dl className="fnd-detail-grid">
        <dt>테이블 · 필드</dt><dd className="mono">{f.table_name || none} · {f.field || none}</dd>
        <dt>행 키</dt><dd className="mono">{f.row_key || none}</dd>
        <dt>환자 ID</dt><dd className="mono">{f.person_id || none}</dd>
        {checkType && <><dt>검사 유형</dt><dd>{checkLabel(checkType)}{f.category ? ` · ${f.category}` : ""}</dd></>}
      </dl>
      <h3 style={{ margin: "0", fontSize: 13 }}>상세 내용 (검증 결과 전문)</h3>
      <pre className="fnd-detail-text">{f.detail || "(상세 내용 없음)"}</pre>
      {(info?.desc || expected) && (
        <>
          <h3 style={{ margin: "0", fontSize: 13 }}>기대 조건 (규칙 설명)</h3>
          <div style={{ margin: "4px 0 10px" }}>
            {info?.desc && <div>{info.desc}</div>}
            {expected && <div>{expected}</div>}
            <div style={{ color: "var(--muted)", fontSize: 12 }}>이 실행 당시 보관한 규칙 기준입니다. 이후 기관 조정과 무관합니다.</div>
          </div>
        </>
      )}
      <div className="callout warn fnd-guide">
        <b>확인 방법</b>
        {guide && <div>{guide}</div>}
        <div>{f.table_name ? `${f.table_name} 테이블에서 ` : "원천 데이터에서 "}{f.row_key ? `행 키 ${f.row_key}` : "해당 행"}{f.person_id ? ` (환자 ID ${f.person_id})` : ""}을(를) 찾아 {f.field ? `${f.field} 값을 ` : "값을 "}위 상세 내용과 대조해 확인하세요.</div>
      </div>
      <div className="actions" style={{ marginTop: 10 }}>
        {!props.ruleFiltered && <button type="button" className="btn sm" onClick={props.onFilterRule}>이 규칙의 위반만 보기</button>}
      </div>
    </section>
  );
}

export function FindingsPage({ nav }: { nav: Nav }) {
  const [runId, setRunId] = useState(nav.runId ?? "");
  const [ruleId, setRuleId] = useState(nav.ruleId ?? "");
  const [table, setTable] = useState("");
  const [severity, setSeverity] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [runsTick, setRunsTick] = useState(0);
  const [detailTick, setDetailTick] = useState(0);
  const [queryTick, setQueryTick] = useState(0);
  const [exporting, setExporting] = useState<"filtered" | "all" | null>(null);
  const [exportMsg, setExportMsg] = useState<{ kind: "ok" | "info" | "err"; text: string } | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // 실행 · 규칙 선택을 다른 화면(보고서 등)이 바꿔 준 경우
  const navKey = `${nav.runId ?? ""}|${nav.ruleId ?? ""}`;
  const prevNav = useRef(navKey);
  useEffect(() => {
    if (prevNav.current === navKey) return;
    prevNav.current = navKey;
    resetTo(nav.runId ?? "", nav.ruleId ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey]);

  /** 실행을 바꾸면 이전 실행의 조건과 선택은 모두 버린다 */
  function resetTo(nextRun: string, nextRule = "") {
    setRunId(nextRun); setRuleId(nextRule); setTable(""); setSeverity(""); setSearchInput(""); setSearch("");
    setPage(0); setSelectedSeq(null); setNotice(null); setExportMsg(null);
  }

  const runsLoad = useLoad("runs", () => api.listRuns(), runsTick);
  const runs = runsLoad.data ?? [];
  useEffect(() => {
    if (runsLoad.status !== "ok" || !runs.length) return;
    if (!runId) setRunId(runs[0].run_id);
    else if (!runs.some((r) => r.run_id === runId)) { resetTo(runs[0].run_id); setNotice(`선택한 실행 기록(${runId})을 찾을 수 없어 가장 최근 실행을 보여 줍니다.`); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runsLoad.status, runsLoad.data, runId]);

  const criteriaLoad = useLoad(runId || null, () => api.getRunCriteria(runId), detailTick);
  const ruleInfos = useMemo(() => new Map((criteriaLoad.status === "ok" ? criteriaLoad.data?.rules ?? [] : []).map((r) => [r.id, r])), [criteriaLoad]);

  const runKnown = runsLoad.status === "ok" && runs.some((r) => r.run_id === runId);
  const detailLoad = useLoad(runKnown ? runId : null, () => api.getRun(runId), detailTick);
  const detail = detailLoad.status === "ok" ? detailLoad.data : undefined;
  const run = detail?.run ?? runs.find((r) => r.run_id === runId);
  const failed = useMemo(() => (detail?.rules ?? []).filter((r) => r.status === "fail"), [detail]);
  const tables = useMemo(() => [...new Set(failed.map((r) => r.table_name))].sort(), [failed]);
  const failedById = useMemo(() => new Map(failed.map((r) => [r.rule_id, r])), [failed]);

  // 불러온 실행에 없는 규칙·테이블 조건은 풀어 준다 (엉뚱한 빈 결과를 보이지 않기 위해)
  const ruleOk = !ruleId || failedById.has(ruleId);
  const tableOk = !table || tables.includes(table);
  useEffect(() => {
    if (detailLoad.status !== "ok" || (ruleOk && tableOk)) return;
    const msgs: string[] = [];
    if (!ruleOk) { msgs.push(`규칙 ${ruleId} 는 이 실행에서 위반이 발견되지 않아 규칙 조건을 풀었습니다.`); setRuleId(""); }
    if (!tableOk) { msgs.push(`테이블 ${table} 에서는 위반이 발견되지 않아 테이블 조건을 풀었습니다.`); setTable(""); }
    setNotice(msgs.join(" ")); setPage(0); setSelectedSeq(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailLoad.status, detailLoad.key, ruleOk, tableOk]);

  // 검색어는 입력이 멈추면(또는 Enter) 반영한다
  useEffect(() => {
    const v = searchInput.trim();
    if (v === search) return;
    const t = setTimeout(() => { setSearch(v); setPage(0); setSelectedSeq(null); }, 300);
    return () => clearTimeout(t);
  }, [searchInput, search]);
  const searchPending = searchInput.trim() !== search;

  const queryReady = runKnown && (detailLoad.status === "error" || (detailLoad.status === "ok" && ruleOk && tableOk));
  const queryKey = queryReady ? JSON.stringify([runId, ruleId, table, severity, search, page]) : null;
  const queryLoad = useLoad(queryKey, () => api.getFindings({ runId, ruleId: ruleId || undefined, table: table || undefined, severity: severity || undefined, search: search || undefined, offset: page * PAGE, limit: PAGE }), queryTick);
  const total = queryLoad.data?.total ?? 0;
  const rows = queryLoad.status === "ok" ? queryLoad.data!.rows : [];
  const pages = Math.max(1, Math.ceil(total / PAGE));
  useEffect(() => {
    if (queryLoad.status === "ok" && !rows.length && total > 0 && page > 0) setPage(pages - 1);
  }, [queryLoad.status, rows.length, total, page, pages]);

  const selected = selectedSeq === null ? undefined : rows.find((r) => r.seq === selectedSeq);
  useEffect(() => { if (selected) panelRef.current?.focus(); }, [selected?.seq]); // eslint-disable-line react-hooks/exhaustive-deps
  const openFinding = (seq: number, opener: HTMLElement | null) => { openerRef.current = opener; setSelectedSeq(seq); };
  const closePanel = () => {
    setSelectedSeq(null);
    const o = openerRef.current;
    if (o && o.isConnected) o.focus();
  };

  const filtersActive = !!(ruleId || table || severity || searchInput);
  const clearFilters = () => { setRuleId(""); setTable(""); setSeverity(""); setSearchInput(""); setSearch(""); setPage(0); setSelectedSeq(null); };
  const changeFilter = (fn: () => void) => { fn(); setPage(0); setSelectedSeq(null); };
  const toggleRule = (id: string) => changeFilter(() => setRuleId(ruleId === id ? "" : id));

  const exportFiltered = async () => {
    if (!runId || exporting) return;
    setExporting("filtered"); setExportMsg(null);
    try {
      const r = await api.exportFindings({ runId, ruleId: ruleId || undefined, table: table || undefined, severity: severity || undefined, search: search || undefined });
      setExportMsg(r ? { kind: "ok", text: `현재 조건에 맞는 위반 ${fmt(r.rows)}건을 저장했습니다: ${r.path}` } : { kind: "info", text: "저장을 취소했습니다. 파일은 만들어지지 않았습니다." });
    } catch (e) {
      setExportMsg({ kind: "err", text: `현재 조건 CSV 를 저장하지 못했습니다. ${errText(e)}` });
    } finally { setExporting(null); }
  };
  const exportAll = async () => {
    if (!runId || exporting) return;
    setExporting("all"); setExportMsg(null);
    try {
      const r = await api.exportFindings({ runId });
      setExportMsg(r ? { kind: "ok", text: `이 실행의 전체 위반 ${fmt(r.rows)}건을 저장했습니다: ${r.path}` } : { kind: "info", text: "저장을 취소했습니다. 파일은 만들어지지 않았습니다." });
    } catch (e) {
      setExportMsg({ kind: "err", text: `전체 위반 CSV 를 저장하지 못했습니다. ${errText(e)}` });
    } finally { setExporting(null); }
  };

  const title = (
    <div className="page-title"><h1>위반 상세</h1>
      {run && <span className="sub">{run.cohort_kor} · {run.label} · {fmtTime(run.created_at)} · 위반 {fmt(run.violations_total)}건 <RunOutcome run={run} /></span>}
    </div>
  );

  if (runsLoad.status === "idle" || runsLoad.status === "loading") return <div className="findings-page">{title}<Loading>실행 기록을 불러오는 중…</Loading></div>;
  if (runsLoad.status === "error") return <div className="findings-page">{title}<ErrorBox text={`실행 기록을 불러오지 못했습니다. ${runsLoad.error}`} onRetry={() => setRunsTick((t) => t + 1)} retryLabel="실행 기록 다시 불러오기" /></div>;
  if (!runs.length) return (
    <div className="findings-page">{title}
      <Empty>실행 기록이 없습니다. 먼저 검증을 실행하세요.<div style={{ marginTop: 10 }}><button type="button" className="btn primary" onClick={() => nav.go("run")}>검증 실행으로 이동</button></div></Empty>
    </div>
  );

  const incomplete = run ? run.rules_error + run.rules_skipped - (run.rules_skipped_optional ?? 0) + run.rules_disabled : 0;
  const selectedRule = ruleId ? failedById.get(ruleId) : undefined;
  const queryWaiting = queryLoad.status === "idle" || queryLoad.status === "loading";
  const exportDisabled = !!exporting || queryLoad.status !== "ok" || searchPending || total === 0;

  return (
    <div className="findings-page">
      {title}
      {criteriaLoad.status === "ok" && !criteriaLoad.data && <div className="callout warn" role="status">이 실행은 당시 명세·규칙 원본이 보관되지 않았습니다. 현재 기준으로 기대 조건을 대신 표시하지 않습니다.</div>}
      {criteriaLoad.status === "error" && <ErrorBox text={`실행 당시 기준을 읽지 못했습니다: ${criteriaLoad.error}`} onRetry={() => setDetailTick((t) => t + 1)} />}
      {notice && (
        <div className="callout warn fnd-notice" role="status"><span>{notice}</span><button type="button" className="btn sm" onClick={() => setNotice(null)}>닫기</button></div>
      )}
      <form className="toolbar fnd-filters" role="search" aria-label="위반 행 조회 조건" onSubmit={(e) => e.preventDefault()}>
        <Field id="fnd-run" label="실행 기록">
          <select id="fnd-run" className="fnd-run-select" value={runId} onChange={(e) => resetTo(e.target.value)}>
            {runs.map((r) => <option key={r.run_id} value={r.run_id}>{fmtTime(r.created_at)} · {r.cohort_kor} · {r.label} · 위반 {fmt(r.violations_total)}건</option>)}
          </select>
        </Field>
        <Field id="fnd-severity" label="심각도">
          <select id="fnd-severity" value={severity} onChange={(e) => changeFilter(() => setSeverity(e.target.value))}>
            <option value="">전체 심각도</option><option value="error">오류</option><option value="warning">경고</option>
          </select>
        </Field>
        <Field id="fnd-table" label="테이블">
          <select id="fnd-table" value={table} onChange={(e) => changeFilter(() => setTable(e.target.value))} disabled={detailLoad.status === "loading"}>
            <option value="">전체 테이블</option>{tables.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field id="fnd-rule" label="규칙">
          <select id="fnd-rule" className="fnd-rule-select" value={ruleOk ? ruleId : ""} onChange={(e) => changeFilter(() => setRuleId(e.target.value))} disabled={detailLoad.status === "loading"}>
            <option value="">전체 규칙 (위반이 발견된 규칙 {failed.length}개)</option>
            {failed.map((r) => <option key={r.rule_id} value={r.rule_id}>{r.rule_id} {r.name} ({fmt(r.violations)})</option>)}
          </select>
        </Field>
        <Field id="fnd-search" label="검색 (상세 · 규칙명 · 환자 ID · 행 키)">
          <input id="fnd-search" type="search" value={searchInput} placeholder="예: 환자 ID, 행 키, 상세 일부"
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { const v = searchInput.trim(); if (v !== search) { setSearch(v); setPage(0); setSelectedSeq(null); } } }} />
        </Field>
        <button type="button" className="btn" onClick={clearFilters} disabled={!filtersActive}>필터 지우기</button>
        <span className="spacer" />
        <button type="button" className="btn" onClick={() => nav.go("report", runId)}>결과 보고서</button>
      </form>

      <div className="fnd-export">
        <div className="fnd-export-row actions">
          <button type="button" className="btn primary" onClick={exportFiltered} disabled={exportDisabled} aria-describedby="fnd-export-hint">
            {exporting === "filtered" ? "저장 중…" : "현재 조건 CSV 저장"}
          </button>
          <button type="button" className="btn" onClick={exportAll} disabled={!!exporting} aria-describedby="fnd-export-hint">
            {exporting === "all" ? "저장 중…" : "전체 위반 CSV 저장"}
          </button>
          <span className="hint" id="fnd-export-hint">
            현재 조건: 위 조건에 맞는 위반 {queryLoad.status === "ok" ? `${fmt(total)}건 전체(모든 쪽)` : "을 불러오는 중"} · 전체: 이 실행의 위반 {run ? `${fmt(run.violations_total)}건` : ""} 전부
          </span>
        </div>
        <div className="callout warn">저장한 CSV에는 환자 ID·행 키·실제 값이 들어 있습니다. 기관 내부의 보안이 확보된 위치에만 보관하세요. 중앙 제출은 기관의 반출 검토를 거친 제출용 집계(submission.json)와 지정된 피드백 양식을 사용합니다.</div>
        {exportMsg && <div className={`callout ${exportMsg.kind === "err" ? "err" : exportMsg.kind === "info" ? "warn" : ""}`} role={exportMsg.kind === "err" ? "alert" : "status"}>{exportMsg.text}</div>}
      </div>

      <div className="findings-grid">
        <Card title="위반이 발견된 규칙" sub={detailLoad.status === "ok" ? `${failed.length}개 규칙에서 위반 발견 · 규칙을 누르면 그 규칙만 봅니다` : undefined} className="pad0">
          <div className="tblwrap table-scroll fnd-rules-scroll">
            {detailLoad.status === "loading" || detailLoad.status === "idle" ? <Loading>규칙별 결과를 불러오는 중…</Loading>
              : detailLoad.status === "error" ? <ErrorBox text={`규칙별 결과를 불러오지 못했습니다. 위반 행 목록은 아래에서 계속 볼 수 있습니다. ${detailLoad.error}`} onRetry={() => setDetailTick((t) => t + 1)} retryLabel="규칙 목록 다시 불러오기" />
              : failed.length === 0 ? <Empty>이 실행에서 위반이 발견된 규칙이 없습니다.{incomplete > 0 && <div>검사하지 못했거나 꺼 둔 규칙이 {incomplete}개 있어 전체 통과를 뜻하지는 않습니다.</div>}</Empty>
              : (
                <table className="tbl">
                  <caption className="sr-only">위반이 발견된 규칙 목록. 규칙 이름을 누르거나 Enter 를 눌러 그 규칙의 위반만 봅니다.</caption>
                  <thead><tr><th scope="col">규칙</th><th scope="col" className="num">위반</th></tr></thead>
                  <tbody>
                    {failed.map((r) => (
                      <tr key={r.rule_id} className={`click ${ruleId === r.rule_id ? "sel" : ""}`} onClick={() => toggleRule(r.rule_id)}>
                        <td>
                          <button type="button" className="rule-pick" aria-pressed={ruleId === r.rule_id} onClick={(e) => { e.stopPropagation(); toggleRule(r.rule_id); }}>
                            <span className="mono">{r.rule_id} <SeverityPill s={r.severity} /></span>
                            <span className="name">{r.name}</span>
                            <span className="meta">{checkLabel(r.check_type)} · {r.table_name}</span>
                          </button>
                        </td>
                        <td className="num">{fmt(r.violations)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </div>
        </Card>
        <div>
          {selectedRule && <div className="callout warn fnd-rule-banner"><b>{selectedRule.rule_id} {selectedRule.name}</b> · {CHECK_GUIDES[selectedRule.check_type] ?? CHECK_GUIDES.sql}</div>}
          {selected && (
            <DetailPanel f={selected} result={failedById.get(selected.rule_id) ?? detail?.rules.find((r) => r.rule_id === selected.rule_id)} info={ruleInfos?.get(selected.rule_id)}
              ruleFiltered={ruleId === selected.rule_id} panelRef={panelRef} onClose={closePanel} onFilterRule={() => { setSelectedSeq(null); toggleRule(selected.rule_id); }} />
          )}
          <Card className="pad0">
            <div className="tblwrap table-scroll fnd-scroll" role="region" aria-label="위반 행 목록" aria-busy={queryWaiting} tabIndex={0}>
              {queryWaiting ? <Loading>위반 행을 불러오는 중…</Loading>
                : queryLoad.status === "error" ? <ErrorBox text={`위반 행을 불러오지 못했습니다. ${queryLoad.error}`} onRetry={() => setQueryTick((t) => t + 1)} />
                : rows.length === 0 ? (
                  <Empty>
                    {filtersActive ? "조건에 맞는 위반 행이 없습니다." : (run?.violations_total ?? 0) === 0 ? "이 실행에서 보고된 위반 행이 없습니다." : "표시할 위반 행이 없습니다."}
                    {!filtersActive && incomplete > 0 && <div>검사하지 못했거나 꺼 둔 규칙이 {incomplete}개 있어 전체 통과를 뜻하지는 않습니다.</div>}
                    {filtersActive && <div style={{ marginTop: 10 }}><button type="button" className="btn" onClick={clearFilters}>필터 지우기</button></div>}
                  </Empty>
                ) : (
                  <table className="tbl">
                    <caption className="sr-only">위반 행 목록. 각 행의 상세 보기 버튼으로 전체 내용을 엽니다.</caption>
                    <thead><tr><th scope="col">#</th><th scope="col">규칙</th><th scope="col">심각도</th><th scope="col">테이블</th><th scope="col">필드</th><th scope="col">행 키</th><th scope="col">환자 ID</th><th scope="col">상세</th><th scope="col">열기</th></tr></thead>
                    <tbody>
                      {rows.map((f) => (
                        <tr key={f.seq} className={`click ${selected?.seq === f.seq ? "sel" : ""}`} onClick={(e) => openFinding(f.seq, e.currentTarget.querySelector("button"))}>
                          <td className="num">{f.seq}</td><td className="mono" title={f.rule_name}>{f.rule_id}</td><td><SeverityPill s={f.severity} /></td>
                          <td className="mono">{f.table_name}</td><td className="mono">{f.field}</td><td className="mono">{f.row_key}</td><td className="mono">{f.person_id}</td>
                          <td className="ellipsis fnd-detail-cell" title={f.detail}>{f.detail}</td>
                          <td>
                            <button type="button" className="btn sm" aria-haspopup="dialog" aria-expanded={selected?.seq === f.seq} aria-label={`위반 ${f.seq} ${f.rule_id} 상세 보기`}
                              onClick={(e) => { e.stopPropagation(); openFinding(f.seq, e.currentTarget); }}>상세 보기</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </div>
            <div className="pager fnd-status">
              <span role="status" aria-live="polite">{queryLoad.status === "ok" ? `총 ${fmt(total)}건 · ${page + 1}/${pages} 쪽 (쪽당 ${PAGE}건)` : queryWaiting ? "불러오는 중" : "불러오지 못함"}</span>
              <button type="button" className="btn sm" disabled={page === 0 || queryWaiting} onClick={() => { setPage(page - 1); setSelectedSeq(null); }}>이전</button>
              <button type="button" className="btn sm" disabled={queryLoad.status !== "ok" || page + 1 >= pages} onClick={() => { setPage(page + 1); setSelectedSeq(null); }}>다음</button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
