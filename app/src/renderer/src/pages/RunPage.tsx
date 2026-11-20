// 검증 실행: ① 코호트와 파일 → ② 테이블 대응과 사전 점검 → ③ 실행 → ④ 결과와 출력물
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { seoulToday } from "@engine/date.js";
import type { CohortInfo, InputPlan, PreviewData, RunProgress, RunRecord, RunOutputs, SourceCandidate, TableCheck, TemplateKind } from "@shared/types";
import { api, fmt } from "../api";
import { Card, RunSummary, Empty } from "../components/ui";
import { Modal } from "../components/Modal";
import type { Nav, RunActivity } from "../App";

function bytes(n: number): string { return n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`; }

const LEVEL: Record<string, { cls: string; label: string }> = { error: { cls: "error", label: "오류" }, warn: { cls: "warning", label: "주의" }, info: { cls: "gray", label: "참고" } };

/** 대응표 드롭다운에서 '합침' 상태를 나타내는 값 */
const MERGED = "\u0000merged";

/** 후보 id 들을 모든 테이블의 대응에서 뺀다. 빈 대응은 지운다. */
function dropIds(mapping: Record<string, string[]>, gone: Set<string>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [t, ids] of Object.entries(mapping)) { const keep = ids.filter((id) => !gone.has(id)); if (keep.length) out[t] = keep; }
  return out;
}

/** 경로의 마지막 칸 (윈도우의 역슬래시도 함께 본다) */
const leaf = (p: string) => p.split(/[\\/]/).filter(Boolean).slice(-1)[0] ?? p;

export function RunPage({ nav, onActivity }: { nav: Nav; onActivity: (activity: RunActivity) => void }) {
  const [cohorts, setCohorts] = useState<CohortInfo[]>([]);
  const [cohort, setCohort] = useState("");
  const [plan, setPlan] = useState<InputPlan | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // "inspect" | "run" | "template"
  const [today, setToday] = useState("");
  const [label, setLabel] = useState("");
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [result, setResult] = useState<RunRecord | null>(null);
  const [outputs, setOutputs] = useState<RunOutputs | null>(null);
  const [preview, setPreview] = useState<{ c: SourceCandidate; data: PreviewData } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [templateResult, setTemplateResult] = useState<{ text: string; path?: string; error?: boolean } | null>(null);
  const [drag, setDrag] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const operation = useRef(false);
  const currentPage = useRef(nav.page);
  currentPage.current = nav.page;
  useEffect(() => { onActivity({ busy, progress, result }); }, [busy, progress, result, onActivity]);

  useEffect(() => {
    api.listCohorts().then((cs) => { setCohorts(cs); if (cs.length) setCohort((c) => c || cs[0].id); }).catch((e) => setErr(String(e)));
    api.getConfig().then((c) => { setToday(c.defaultToday ?? seoulToday()); }).catch((e) => setErr(String(e)));
    const off1 = api.onProgress((p) => setProgress(p));
    const off2 = api.onSmokePlan((p) => { setCohort(p.cohort); setPlan(p); });
    return () => { off1(); off2(); };
  }, []);

  const info = cohorts.find((c) => c.id === cohort);

  // ---------------------------------------------------------------- ① 파일
  const addPaths = async (paths: string[]) => {
    if (!paths.length || !cohort || operation.current) return;
    operation.current = true;
    setErr(null); setResult(null); setOutputs(null); setBusy("inspect");
    try { setPlan(await api.inspectInput(cohort, paths, plan?.cohort === cohort ? plan.candidates : [])); }
    catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { operation.current = false; setBusy(null); }
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); void addPaths(api.pathsForFiles([...e.dataTransfer.files])); };
  const checkPlan = async (candidates: SourceCandidate[], mapping: Record<string, string[]>) => {
    if (operation.current) return;
    operation.current = true; setBusy("inspect"); setErr(null); setResult(null); setOutputs(null);
    try { setPlan(await api.checkInput(cohort, candidates, mapping)); }
    catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { operation.current = false; setBusy(null); }
  };
  const removeCandidate = async (id: string) => {
    if (!plan) return;
    const candidates = plan.candidates.filter((c) => c.id !== id);
    const mapping = dropIds(plan.mapping, new Set([id]));
    await checkPlan(candidates, mapping);
  };
  /** 한 폴더에서 온 파일을 한꺼번에 뺀다 (폴더를 잘못 넣었을 때) */
  const removeFolder = async (folder: string) => {
    if (!plan) return;
    const gone = new Set(plan.candidates.filter((c) => c.folder === folder).map((c) => c.id));
    const candidates = plan.candidates.filter((c) => !gone.has(c.id));
    await checkPlan(candidates, dropIds(plan.mapping, gone));
  };
  const changeCohort = (id: string) => {
    if (busy || (plan && !window.confirm("코호트를 바꾸면 현재 입력 파일과 테이블 대응이 초기화됩니다. 계속할까요?"))) return;
    setCohort(id); setPlan(null); setResult(null); setOutputs(null); setErr(null);
  };
  const template = async (kind: TemplateKind) => {
    if (operation.current) return;
    operation.current = true; setBusy("template"); setTemplateResult({ text: "저장 위치를 선택해 주세요…" });
    try {
      const p = await api.exportTemplate(cohort, kind);
      setTemplateResult(p ? { text: `저장 완료: ${p}`, path: kind.startsWith("sample-") ? p : p.replace(/[\\/][^\\/]+$/, "") } : { text: "저장을 취소했습니다." });
    }
    catch (e) { setTemplateResult({ text: `저장 실패: ${String((e as Error).message ?? e)}`, error: true }); }
    finally { operation.current = false; setBusy(null); }
  };

  // ---------------------------------------------------------------- ② 대응표
  const remap = async (table: string, cid: string) => {
    if (!plan) return;
    // 직접 고르면 그 파일 하나만 쓴다 (합쳐 읽던 것은 풀린다). 다른 표에 있던 같은 파일은 거기서 뺀다.
    const mapping = cid ? dropIds(plan.mapping, new Set([cid])) : { ...plan.mapping };
    if (cid) mapping[table] = [cid]; else delete mapping[table];
    await checkPlan(plan.candidates, mapping);
  };
  const showPreview = async (c: SourceCandidate) => {
    try { setPreview({ c, data: await api.previewSource(c) }); } catch (e) { setErr(String((e as Error).message ?? e)); }
  };
  const unmapped = useMemo(() => plan ? plan.candidates.filter((c) => !Object.values(plan.mapping).some((ids) => ids.includes(c.id))) : [], [plan]);
  const nameOf = (id: string) => { const c = plan?.candidates.find((x) => x.id === id); return c ? (folders.length > 1 ? `${c.name} (${leaf(c.folder)})` : c.name) : id; };
  /** 넣은 폴더 목록 (넣은 차례 그대로) */
  const folders = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of plan?.candidates ?? []) m.set(c.folder, (m.get(c.folder) ?? 0) + 1);
    return [...m].map(([folder, count]) => ({ folder, count }));
  }, [plan]);

  // ---------------------------------------------------------------- ③ 실행
  const run = async () => {
    if (!plan?.ok || operation.current) return;
    operation.current = true;
    setErr(null); setResult(null); setOutputs(null); setProgress(null); setBusy("run");
    try {
      const rec = await api.runValidation({ cohort, candidates: plan.candidates, mapping: plan.mapping, today: today || undefined, label: label || undefined });
      setResult(rec); setOutputs(await api.getRunOutputs(rec.run_id));
      if (currentPage.current === "run") requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { operation.current = false; setBusy(null); }
  };

  const stepDone = { files: !!plan && plan.candidates.length > 0, check: !!plan?.ok, run: !!result };

  return (
    <>
      <div className="page-title"><h1>검증 실행</h1><span className="sub">입력: 코호트 테이블 CSV 또는 엑셀 → 출력: 보고서 · 위반 행 · 규칙별 결과 · 제출용 집계</span></div>
      <nav className="stepbar" aria-label="검증 단계">
        {[["1", "코호트와 파일", stepDone.files, "run-input"], ["2", "대응 · 사전 점검", stepDone.check, "run-check"], ["3", "검증 실행", stepDone.run, "run-execute"], ["4", "결과", stepDone.run, "run-result"]].map(([n, t, done, id]) => (
          <button type="button" key={String(n)} className={`step ${done ? "done" : ""}`} disabled={n !== "1" && !stepDone.files || n === "4" && !result} onClick={() => document.getElementById(String(id))?.scrollIntoView({ behavior: "smooth" })}><b>{n}</b>{t}{done && <span className="sr-only"> 완료</span>}</button>
        ))}
      </nav>
      {plan && <div className="workflow-actions" role="status">
        <span>{busy ? busy === "run" ? `검증 중 · ${progress?.pct ?? 0}%` : "파일 준비 중…" : plan.ok ? `실행 준비 완료${plan.warnings ? ` · 주의 ${plan.warnings}건 확인` : ""}` : `사전 점검 오류 ${plan.errors}건을 해결하세요.`}</span>
        <button className="btn primary" disabled={!!busy} onClick={() => document.getElementById(plan.ok ? "run-execute" : "run-check")?.scrollIntoView({ behavior: "smooth" })}>{plan.ok ? "검증 설정으로 이동" : "사전 점검 오류 보기"}</button>
      </div>}
      {err && <div className="callout err" style={{ marginBottom: 12 }}>{err}</div>}
      {msg && <div className="callout" style={{ marginBottom: 12 }}>{msg}</div>}

      {/* ① */}
      <div id="run-input" className="workflow-section">
      <Card num={1} title="코호트와 입력 파일" sub="파일 하나가 테이블 하나입니다. CSV 여러 개, 시트당 테이블 하나인 엑셀 파일, 폴더 여러 개를 섞어 넣을 수 있습니다.">
        <div className="run-input-grid">
          <div className="form">
            <label>코호트
              <select value={cohort} onChange={(e) => changeCohort(e.target.value)} disabled={!!busy}>
                {cohorts.map((c) => <option key={c.id} value={c.id}>{c.kor} ({c.id})</option>)}
              </select>
            </label>
            {info && <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>필요 테이블 {info.tables.length}개<br />{info.tables.join(" · ")}{info.optionalTables.length > 0 && <><br />선택 테이블 {info.optionalTables.join(" · ")} (내면 개념 ID 를 표준 용어와 대조)</>}</div>}
          </div>
          <div className={`dropzone ${drag ? "drag" : ""}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--navy)" }}>여기에 파일이나 폴더를 끌어다 놓으세요</div>
            <div style={{ color: "var(--muted)", fontSize: 12.5, margin: "6px 0 12px" }}>
              CSV(UTF-8 또는 EUC-KR) · 엑셀(.xlsx) · 테이블별 파일이 든 폴더<br />
              폴더는 여러 개 넣어도 됩니다 — 테이블 파일을 나눠 담은 폴더들도 그대로 넣으세요.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button className="btn primary" disabled={!!busy} onClick={async () => addPaths(await api.chooseFiles())}>파일 선택</button>
              <button className="btn" disabled={!!busy} onClick={async () => { const ds = await api.chooseDirectories("테이블 파일이 든 폴더 선택 (여러 개 고를 수 있습니다)"); if (ds.length) addPaths(ds); }}>폴더 선택</button>
            </div>
            {busy === "inspect" && <div style={{ marginTop: 10, fontSize: 12 }}>파일을 읽는 중…</div>}
          </div>
          <details className="support-materials">
            <summary>입력 양식 · 샘플 내려받기</summary>
            <div style={{ display: "grid", gap: 6 }}>
              <button className="btn sm" disabled={!!busy} onClick={() => template("xlsx")}>엑셀 양식 (시트당 테이블, 명세 포함)</button>
              <button className="btn sm" disabled={!!busy} onClick={() => template("csv")}>CSV 양식 ZIP (헤더만)</button>
              <button className="btn sm" disabled={!!busy} onClick={() => template("spec")}>컬럼 명세서 (xlsx)</button>
              <button className="btn sm" disabled={!!busy} onClick={() => template("sample-clean")}>합성 견본 데이터 · clean (오류 없음, 100명)</button>
              <button className="btn sm" disabled={!!busy} onClick={() => template("sample-dirty")}>합성 견본 데이터 · dirty (오류 주입 + 정답표)</button>
              <button className="btn sm" disabled={!!busy} onClick={() => template("sample-good")}>합성 임상 사례 예제 · good (가상 환자 1명, 설명 포함)</button>
            </div>
            {templateResult && <div className={`callout ${templateResult.error ? "err" : ""}`} role={templateResult.error ? "alert" : "status"} style={{ marginTop: 10, overflowWrap: "anywhere" }}>
              {templateResult.text}
              {templateResult.path && <div><button className="btn sm" onClick={() => void api.openPath(templateResult.path!).catch((e) => setTemplateResult({ text: String(e), error: true }))}>저장 위치 열기</button></div>}
            </div>}
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>병원은 이 양식대로 내보내면 됩니다. 파일명과 컬럼명은 그대로 두고, 날짜는 YYYY-MM-DD, 빈 값은 빈 칸입니다.</div>
          </details>
        </div>
        {plan && plan.candidates.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="sub" style={{ fontWeight: 600, color: "var(--navy)" }}>넣은 파일 {plan.candidates.length}개{folders.length > 1 ? ` · 폴더 ${folders.length}곳` : ""}</div>
            {folders.length > 1 && (
              <div className="chips" style={{ margin: "6px 0 8px" }}>
                {folders.map((f) => (
                  <span key={f.folder} className="chip" title={f.folder}>
                    {leaf(f.folder)} · {f.count}개
                    <button className="chip-x" disabled={!!busy} aria-label={`${leaf(f.folder)} 폴더 파일 모두 빼기`} onClick={() => removeFolder(f.folder)}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div className="tblwrap short">
              <table className="tbl">
                <thead><tr><th>파일 / 시트</th><th>종류</th><th>인코딩</th><th className="num">행</th><th className="num">컬럼</th><th className="num">크기</th><th>대응 테이블</th><th></th></tr></thead>
                <tbody>{plan.candidates.map((c) => {
                  const t = Object.entries(plan.mapping).find(([, ids]) => ids.includes(c.id))?.[0];
                  return (
                    <tr key={c.id}>
                      <td className="ellipsis" title={c.path}>
                        {c.name}
                        {folders.length > 1 && <div style={{ color: "var(--muted)", fontSize: 11 }}>{leaf(c.folder)}</div>}
                      </td><td>{c.kind === "xlsx" ? "엑셀 시트" : "CSV"}</td>
                      <td>{c.error ? <span className="pill error">읽기 실패</span> : c.encoding}</td>
                      <td className="num">{c.error ? "-" : fmt(c.rows)}</td><td className="num">{c.columns.length || "-"}</td><td className="num">{bytes(c.sizeBytes)}</td>
                      <td>{t ? <span className="mono">{t}</span> : <span className="pill warning">대응 없음</span>}</td>
                      <td style={{ whiteSpace: "nowrap" }}><button className="btn sm" disabled={!!c.error || !!busy} onClick={() => showPreview(c)} aria-label={`${c.name} 미리보기`}>미리보기</button> <button className="btn sm danger" disabled={!!busy} onClick={() => removeCandidate(c.id)} aria-label={`${c.name} 제거`}>제거</button></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
      </div>

      {/* ② */}
      {plan && plan.candidates.length > 0 && (
        <div id="run-check" className="workflow-section" style={{ marginTop: 14 }}>
          <Card num={2} title="테이블 대응과 사전 점검" sub="테이블마다 어느 파일을 쓸지 확인합니다. 자동 대응이 틀렸으면 직접 고르세요."
            right={<span className={`pill ${plan.ok ? "pass" : "fail"}`}>{plan.ok ? (plan.warnings ? `실행 가능 · 주의 ${plan.warnings}` : "실행 가능") : `오류 ${plan.errors} · 실행 불가`}</span>}>
            <div className="table-scroll">
            <table className="tbl">
              <thead><tr><th>테이블</th><th>파일 / 시트</th><th className="num">행</th><th>점검 결과</th></tr></thead>
              <tbody>{plan.tables.map((t: TableCheck) => (
                <tr key={t.table}>
                  <td style={{ whiteSpace: "nowrap" }}><span className="mono">{t.table}</span><div style={{ color: "var(--muted)", fontSize: 11 }}>{t.kor}{t.required ? " · 필수" : t.optional ? " · 선택" : ""}</div></td>
                  <td style={{ minWidth: 260 }}>
                    <select aria-label={`${t.table} 대응 파일`} value={t.candidateIds.length === 1 ? t.candidateIds[0] : t.candidateIds.length ? MERGED : ""} onChange={(e) => { if (e.target.value !== MERGED) remap(t.table, e.target.value); }} disabled={!!busy} style={{ padding: "5px 8px" }}>
                      {t.candidateIds.length > 1 && <option value={MERGED}>{t.candidateIds.map((id) => nameOf(id)).join(" + ")} (합침)</option>}
                      <option value="">(없음)</option>
                      {plan.candidates.filter((c) => !c.error).map((c) => (
                        <option key={c.id} value={c.id}>{folders.length > 1 ? `${c.name}  (${leaf(c.folder)})` : c.name}</option>
                      ))}
                    </select>
                    {t.candidateIds.length > 0 && !t.auto && <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 6 }}>직접 지정</span>}
                  </td>
                  <td className="num">{t.rows === null ? "-" : fmt(t.rows)}</td>
                  <td>
                    {t.issues.length === 0 ? <span className="pill pass">이상 없음</span> : t.issues.map((i, k) => (
                      <div key={k} style={{ marginBottom: 2 }}><span className={`pill ${LEVEL[i.level].cls}`}>{LEVEL[i.level].label}</span> <span style={{ fontSize: 12.5 }}>{i.text}</span></div>
                    ))}
                  </td>
                </tr>
              ))}</tbody>
            </table>
            </div>
            {unmapped.length > 0 && <div className="callout warn" style={{ marginTop: 10 }}>대응되지 않은 파일 {unmapped.length}개: {unmapped.map((c) => c.name).join(", ")} · 필요하면 위 표에서 테이블에 지정하세요.</div>}
          </Card>
        </div>
      )}

      {/* ③ */}
      {plan && plan.candidates.length > 0 && (
        <div id="run-execute" className="workflow-section" style={{ marginTop: 14 }}>
          <Card num={3} title="검증 실행">
            <div className="run-settings-grid">
              <label className="lbl">검증 기준일 <span className="hint">미래 날짜 판정 기준 · 실제 실행 시각과 별개</span><input type="date" value={today} onChange={(e) => setToday(e.target.value)} disabled={!!busy} /></label>
              <label className="lbl">실행 이름 <span className="hint">비우면 폴더 이름</span><input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="예: 2026-09 제출본" disabled={!!busy} /></label>
              <div><button className="btn primary" onClick={run} disabled={!plan.ok || !!busy} style={{ padding: "9px 22px" }}>{busy === "run" ? "검증 중…" : "검증 실행"}</button>
                {!plan.ok && <span style={{ marginLeft: 10, color: "var(--red)", fontSize: 12.5 }}>사전 점검 오류를 먼저 해결하세요.</span>}</div>
            </div>
            {(busy === "run" || (progress && !result)) && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-2)", marginBottom: 4 }}><span>{progress?.text ?? "준비 중"}</span><span>{progress?.pct ?? 0}%</span></div>
                <div className="progress" role="progressbar" aria-label="검증 진행" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress?.pct ?? 0}><div style={{ width: `${progress?.pct ?? 0}%` }} /></div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ④ */}
      {result && (
        <div id="run-result" className="workflow-section" style={{ marginTop: 14 }} ref={resultRef}>
          <Card num={4} title="검증 결과" sub={`${result.cohort_kor} · ${result.label} · 기준일 ${result.run_date}`}
            right={<div className="actions"><button className="btn primary" onClick={() => nav.go("report", result.run_id)}>결과 보고서</button><button className="btn" onClick={() => nav.go("findings", result.run_id)}>위반 상세</button></div>}>
            <RunSummary run={result} />
            <p className="hint">위반이 있는 경우 보고서에서 규칙을 선택해 원인을 확인하고, 원천 데이터를 수정한 뒤 다시 검증하세요.</p>
            {result.rule_set_modified && (
              <div className={`callout ${result.admin_modified ? "err" : "warn"}`} style={{ marginBottom: 12 }}>
                {result.admin_modified ? "관리자가 바꾼 SQL 규칙이 포함된 실행입니다." : "표준과 다른 규칙 설정으로 실행했습니다."} 이 사실은 보고서와 제출용 집계(submission.json)에 기록됩니다. 앱이 자동으로 전송하지는 않으며, 파일을 직접 제출할 때 함께 전달됩니다.
              </div>
            )}
            {outputs ? <OutputList key={result.run_id} outputs={outputs} runId={result.run_id} /> : <div className="callout warn">출력물 목록을 불러오지 못했습니다. <button className="btn" onClick={() => nav.go("report", result.run_id)}>보고서에서 다시 확인</button></div>}
          </Card>
        </div>
      )}

      {preview && (
        <Modal title={`${preview.c.name} · 앞 ${preview.data.rows.length}행 / 전체 ${fmt(preview.data.total)}행 · 컬럼 ${preview.data.columns.length}개`} onClose={() => setPreview(null)} wide>
            <div className="tblwrap" style={{ maxHeight: "70vh" }}>
              <table className="tbl mono" style={{ fontSize: 11.5 }}>
                <thead><tr>{preview.data.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
                <tbody>{preview.data.rows.map((r, i) => <tr key={i}>{preview.data.columns.map((_, j) => <td key={j} className="nw">{r[j] ?? ""}</td>)}</tr>)}</tbody>
              </table>
            </div>
        </Modal>
      )}
      {!plan && <Empty>코호트를 고르고 파일을 넣으면 테이블 대응표와 사전 점검 결과가 여기에 나타납니다.</Empty>}
    </>
  );
}

/** 출력물 목록 (검증 실행 ④ 와 결과 보고서에서 공용) */
export function OutputList({ outputs, runId }: { outputs: RunOutputs; runId: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async (action: () => Promise<string | null>) => {
    setSaving(true); setMsg(null); setErr(null);
    try { const p = await action(); setMsg(p ? `저장됨: ${p}` : "저장을 취소했습니다."); }
    catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };
  const submission = outputs.files.find((f) => f.key === "submission" && f.size > 0);
  return (
    <div className="output-list" aria-busy={saving}>
      <section className="submission-export" aria-label="제출용 집계 저장">
        <div><h3>제출용 집계</h3><p>자동 전송하지 않습니다. <code>submission.json</code>의 실행 이름·규칙 설명·소수 집계를 기관 정책에 따라 반출 검토한 뒤 제출하세요.</p></div>
        <button className="btn primary" disabled={saving || !submission} onClick={() => void save(() => api.exportFile(runId, "submission"))}>제출용 집계 저장</button>
      </section>
      {err && <div className="callout err" role="alert">{err}</div>}
      {msg && <div className="callout" role="status">{msg}</div>}
      <details className="internal-exports">
        <summary>기관 내부 분석용 파일 · 전체 결과 묶음</summary>
        <p className="callout warn">전체 묶음과 위반 CSV에는 환자 단위 정보가 포함됩니다. 보안이 확보된 기관 내부 위치에만 저장하고 제출용 파일과 구분하세요.</p>
        <div className="actions">
          <button className="btn" disabled={saving} onClick={() => void save(() => api.exportBundle(runId))}>기관 내부용 전체 묶음 저장</button>
          <button className="btn" onClick={() => { void api.openPath(outputs.dir).catch((e) => setErr(String(e))); }}>실행 폴더 열기</button>
        </div>
        <div className="table-scroll"><table className="tbl">
          <thead><tr><th>파일</th><th>내용</th><th>권장 용도</th><th className="num">크기</th><th>저장</th></tr></thead>
          <tbody>{outputs.files.filter((f) => f.size > 0 && f.key !== "submission").map((f) => (
            <tr key={f.key}>
              <td><b>{f.label}</b><div className="mono">{f.name}</div></td>
              <td>{f.desc}</td>
              <td><span className={`pill ${!f.shareable ? "warning" : "gray"}`}>{!f.shareable ? "환자 단위 정보 포함" : "기본 제출 대상 아님"}</span></td>
              <td className="num">{bytes(f.size)}</td>
              <td><button className="btn sm" disabled={saving} aria-label={`${f.label} 저장`} onClick={() => void save(() => api.exportFile(runId, f.key))}>저장</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      </details>
    </div>
  );
}
