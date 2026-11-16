// 검증 규칙 관리: 표준 규칙은 읽기 전용이고, 이 PC 의 설정(끄기 · 심각도 · 값 · 사용자 규칙 · 관리자 SQL)만 덧씌운다.
// 켜기/끄기 · 심각도는 누르는 즉시 저장되고, 값 · SQL · 규칙 서식은 '저장'을 눌러야 반영된다.
// 저장하지 않은 입력이 있으면 규칙 선택 · 닫기 · 메뉴 이동 때 버릴지 묻는다 (취소하면 입력이 그대로 남는다).
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MutableRefObject } from "react";
import type { CohortInfo, RuleChange, RuleInfo, RuleSetState, Severity, SpecTableInfo } from "@shared/types";
import { checkLabel, CATEGORY_LABELS, CHECK_GUIDES } from "@shared/labels";
import { api, errText, fmt } from "../api";
import { Card, SeverityPill, OriginPill, Empty } from "../components/ui";
import { CustomRuleModal, ChangePreview, HistoryModal, SqlGateControls, SqlRuleModal, useSqlGate } from "../components/RuleForms";
import { confirmDiscard, DISCARD_MESSAGE, useDirtyRef } from "../components/Modal";
import "./rules.css";
import { SpecBrowser } from "../components/SpecBrowser";

const ORIGIN_FILTER: Record<string, string> = { standard: "표준", modified: "변경됨", custom: "사용자 규칙", admin: "관리자 규칙", disabled: "꺼 둔 규칙" };
const sevText = (s: string) => (s === "error" ? "오류 (High)" : "경고 (Medium)");

export function RulesPage() {
  const [rules, setRules] = useState<RuleInfo[]>([]);
  const [state, setState] = useState<RuleSetState | null>(null);
  const [admin, setAdmin] = useState(false);
  const [cohorts, setCohorts] = useState<CohortInfo[]>([]);
  const [tables, setTables] = useState<SpecTableInfo[]>([]);
  const [kind, setKind] = useState("");
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("");
  const [check, setCheck] = useState("");
  const [table, setTable] = useState("");
  const [origin, setOrigin] = useState("");
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [modal, setModal] = useState<"custom" | "sql" | "history" | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [showSpec, setShowSpec] = useState(false);
  const [saving, setSaving] = useState(false);
  /** 저장하지 않은 입력이 있는지: 오른쪽 상세 패널 / 열려 있는 편집 창 */
  const detailDirty = useRef(false);
  const modalDirty = useRef(false);

  const reload = useCallback(async () => {
    const [rs, st, cfg] = await Promise.all([api.listRules(), api.getRuleSet(), api.getConfig()]);
    setRules(rs); setState(st); setAdmin(cfg.adminMode);
    window.dispatchEvent(new Event("kai:config"));   // 꼬리말의 규칙 수 갱신
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setLoadErr(null);
    try { await Promise.all([reload(), api.listCohorts().then(setCohorts), api.listSpecTables().then(setTables)]); }
    catch (e) { setLoadErr(errText(e)); }
    finally { setLoading(false); }
  }, [reload]);

  useEffect(() => {
    void load();
    const off = api.onSmokeRule((id) => setSelId(id));
    const onCfg = () => { api.getConfig().then((c) => setAdmin(c.adminMode)).catch(() => undefined); };
    // 메뉴 이동 보호: 저장 안 된 입력이 있으면 한 번만 묻고, 취소하면 이동을 막는다
    const onBeforeNav = (e: Event) => {
      if ((detailDirty.current || modalDirty.current) && !window.confirm(DISCARD_MESSAGE)) e.preventDefault();
    };
    window.addEventListener("kai:config", onCfg);
    window.addEventListener("kai:before-nav", onBeforeNav);
    return () => { off(); window.removeEventListener("kai:config", onCfg); window.removeEventListener("kai:before-nav", onBeforeNav); };
  }, [load]);

  const sel = useMemo(() => rules.find((r) => r.id === selId) ?? null, [rules, selId]);
  const tableNames = useMemo(() => [...new Set(rules.flatMap((r) => r.table.split(",")))].filter(Boolean).sort(), [rules]);
  const checks = useMemo(() => [...new Set(rules.map((r) => r.check))].sort(), [rules]);
  const list = useMemo(() => rules.filter((r) =>
    (!kind || r.kind === kind) && (!category || r.category === category) && (!severity || r.severity === severity) &&
    (!check || r.check === check) && (!table || r.table.split(",").includes(table)) &&
    (!origin || (origin === "disabled" ? r.disabled : r.origin === origin)) &&
    (!q || `${r.id} ${r.name} ${r.desc} ${r.fields}`.toLowerCase().includes(q.toLowerCase()))), [rules, kind, category, severity, check, table, origin, q]);
  const filtered = !!(kind || category || severity || check || table || origin || q);
  const clearFilters = () => { setKind(""); setCategory(""); setSeverity(""); setCheck(""); setTable(""); setOrigin(""); setQ(""); };

  /** 규칙 선택을 바꾼다. 저장 안 된 입력이 있으면 버릴지 묻고, 취소하면 그대로 둔다. */
  const requestSelect = (id: string | null) => {
    if (id === selId) return;
    if (!confirmDiscard(detailDirty.current)) return;
    setSelId(id);
  };
  const onRowKey = (e: KeyboardEvent<HTMLTableRowElement>, id: string) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); requestSelect(id); }
  };

  /** 설정을 바꾸고 화면을 갱신한다. 실패하면 던진다. */
  const apply = useCallback(async (ch: RuleChange): Promise<void> => {
    setSaving(true);
    try { setState(await api.changeRules(ch)); await reload(); }
    finally { setSaving(false); }
  }, [reload]);
  /** 페이지 위쪽 안내에 결과를 알리는 변경 (목록의 스위치 · 도구 모음 · 가져오기 등) */
  const change = async (ch: RuleChange, done?: string): Promise<boolean> => {
    setErr(null); setMsg(null);
    try { await apply(ch); if (done) setMsg(done); return true; }
    catch (e) { setErr(errText(e)); return false; }
  };
  const resetAll = async () => {
    const nCustomSql = state?.overrides.customSql?.length ?? 0;
    if (!state || (state.changes.length === 0 && !(state.overrides.customRules?.length) && !nCustomSql)) { setErr(null); setMsg("이미 표준 그대로입니다."); return; }
    if (!window.confirm(`이 PC 의 규칙 설정을 모두 지우고 표준으로 되돌립니다.\n표준과 다른 점 ${state.changes.length}건, 사용자 규칙 ${state.overrides.customRules?.length ?? 0}개, 관리자 SQL 규칙 ${nCustomSql}개가 삭제됩니다. 계속할까요?`)) return;
    if (!confirmDiscard(detailDirty.current || modalDirty.current)) return;
    // 버려도 된다고 확인했으므로 열려 있던 상세 · 편집 창도 닫아 입력이 남지 않게 한다
    if (await change({ op: "resetAll" }, "모든 규칙을 표준으로 되돌렸습니다.")) { setSelId(null); setModal(null); }
  };
  const doExport = async () => {
    setErr(null); setMsg(null);
    try { const p = await api.exportRuleSet(); if (p) setMsg(`내보냈습니다: ${p}`); } catch (e) { setErr(errText(e)); }
  };
  const doImport = async () => {
    if (!confirmDiscard(detailDirty.current || modalDirty.current)) return;
    setErr(null); setMsg(null);
    try {
      const st = await api.importRuleSet();
      if (st) { setState(st); await reload(); setSelId(null); setModal(null); setMsg("규칙 설정을 가져왔습니다."); }
    } catch (e) { setErr(errText(e)); }
  };

  const nCustom = state?.overrides.customRules?.length ?? 0;
  const nAdminSql = state?.overrides.customSql?.length ?? 0;
  const nStd = rules.filter((r) => r.origin !== "custom" && r.subcategory !== "admin").length;
  const changed = state?.changes.length ?? 0;
  const editCustom = editId ? state?.overrides.customRules?.find((r) => r.id === editId) : undefined;
  const editAdm = editId ? state?.overrides.customSql?.find((r) => r.id === editId) : undefined;

  if (!state) {
    return (
      <>
        <div className="page-title"><h1>검증 규칙 관리</h1></div>
        {loading
          ? <div className="loading" role="status" aria-live="polite">규칙을 불러오는 중…</div>
          : (
            <div className="callout err" role="alert">
              규칙을 불러오지 못했습니다{loadErr ? `: ${loadErr}` : "."}
              <div className="error-actions"><button type="button" className="btn sm primary" onClick={() => void load()}>다시 시도</button></div>
            </div>
          )}
      </>
    );
  }

  return (
    <>
      <div className="page-title">
        <h1>검증 규칙 관리</h1>
        <span className="sub">표준 규칙 {fmt(nStd)}개{nCustom ? ` · 사용자 규칙 ${nCustom}개` : ""}{nAdminSql ? ` · 관리자 SQL 규칙 ${nAdminSql}개` : ""}</span>
      </div>
      <div className="callout" style={{ marginBottom: 12 }}>
        표준 규칙은 바꿀 수 없습니다. 이 PC 에서만 규칙을 <b>끄거나</b>, <b>심각도 · 허용 범위 · 패턴 · 코드</b>를 조정하거나, <b>사용자 규칙</b>을 더할 수 있습니다.
        표준과 달라진 규칙은 검증 결과의 보고서와 제출용 집계에 '변경 · 사용자 · 관리자'로 기록됩니다 (앱이 자동 전송하지는 않으며, 제출할 때 함께 전달됩니다).
        {changed ? <> 지금 표준과 다른 점 <b>{changed}건</b> (표준 {state.standardHash.slice(0, 8)} → 적용 {state.effectiveHash.slice(0, 8)}).</> : <> 지금은 표준 그대로입니다.</>}
        <div className="apply-legend">
          <span className="apply-tag now">즉시 적용</span> 켜기/끄기 · 심각도는 누르는 순간 저장됩니다.{" "}
          <span className="apply-tag save">저장해야 적용</span> 값 · SQL · 사용자 규칙 서식은 저장 단추를 눌러야 반영됩니다.
        </div>
      </div>
      {loadErr && <div className="callout err" role="alert" style={{ marginBottom: 12 }}>일부 정보를 불러오지 못했습니다: {loadErr}<div className="error-actions"><button type="button" className="btn sm" onClick={() => void load()}>다시 시도</button></div></div>}
      {err && <div className="callout err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      <div role="status" aria-live="polite">{msg && <div className="callout ok" style={{ marginBottom: 12 }}>{msg}</div>}</div>
      <div className="actions" style={{ marginBottom: 12 }}>
        <button type="button" className="btn" aria-expanded={showSpec} onClick={() => setShowSpec(!showSpec)}>{showSpec ? "명세 조회 닫기" : "적용 명세 · 컬럼별 규칙 보기"}</button>
      </div>
      {showSpec && <SpecBrowser tables={tables} rules={rules} onRule={(id) => {
        if (!confirmDiscard(detailDirty.current || modalDirty.current)) return;
        clearFilters(); setSelId(id); setShowSpec(false);
      }} />}
      <div className="toolbar actions">
        <button type="button" className="btn primary" onClick={() => { setEditId(null); setModal("custom"); }} disabled={!tables.length}>사용자 규칙 추가</button>
        <button type="button" className="btn" onClick={() => { setEditId(null); setModal("sql"); }} disabled={!admin || !tables.length} title={admin ? "" : "설정에서 관리자 모드를 켜면 쓸 수 있습니다"}>SQL 규칙 추가 (관리자)</button>
        <span className="spacer" />
        <button type="button" className="btn" onClick={() => setModal("history")}>변경 이력</button>
        <button type="button" className="btn" onClick={doExport}>설정 내보내기</button>
        <button type="button" className="btn" onClick={doImport}>설정 가져오기</button>
      </div>
      <div className="toolbar" role="group" aria-label="규칙 필터">
        <select aria-label="출처" value={origin} onChange={(e) => setOrigin(e.target.value)}><option value="">전체 출처</option>{Object.entries(ORIGIN_FILTER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select aria-label="종류" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">전체 종류</option><option value="structural">구조 (자동 생성)</option><option value="semantic">교차 테이블 (SQL)</option></select>
        <select aria-label="분류" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">전체 분류</option>{Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v} {k}</option>)}</select>
        <select aria-label="심각도" value={severity} onChange={(e) => setSeverity(e.target.value)}><option value="">전체 심각도</option><option value="error">오류</option><option value="warning">경고</option></select>
        <select aria-label="검사 유형" value={check} onChange={(e) => setCheck(e.target.value)}><option value="">전체 검사 유형</option>{checks.map((c) => <option key={c} value={c}>{checkLabel(c)}</option>)}</select>
        <select aria-label="대상 테이블" value={table} onChange={(e) => setTable(e.target.value)}><option value="">전체 테이블</option>{tableNames.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <input type="search" aria-label="규칙 검색 (ID · 이름 · 설명)" placeholder="규칙 ID · 이름 · 설명 검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 220 }} />
        {filtered && <button type="button" className="btn sm" onClick={clearFilters}>필터 지우기</button>}
        <span className="spacer" /><span style={{ color: "var(--muted)", fontSize: 12 }} role="status" aria-live="polite">{fmt(list.length)}개 표시</span>
      </div>
      <div className={`grid rule-grid ${sel ? "with-detail" : ""}`}>
        <Card className="pad0">
          <div className="tblwrap table-scroll" style={{ maxHeight: "68vh" }}>
            {list.length === 0 ? <Empty>조건에 맞는 규칙이 없습니다{filtered ? " — 필터를 지우고 다시 보세요" : ""}</Empty> : (
              <table className="tbl">
                <caption className="sr-only">검증 규칙 목록. 행을 선택하면 상세가 열립니다.</caption>
                <thead><tr><th scope="col">사용</th><th scope="col">규칙 ID</th><th scope="col">규칙명</th><th scope="col">출처</th><th scope="col">분류</th><th scope="col">검사 유형</th><th scope="col">심각도</th><th scope="col">대상 테이블</th><th scope="col">필드</th></tr></thead>
                <tbody>
                  {list.slice(0, 600).map((r) => (
                    <tr key={r.id} tabIndex={0} aria-current={selId === r.id ? "true" : undefined} className={`click ${selId === r.id ? "sel" : ""} ${r.disabled ? "off" : ""}`}
                      onClick={() => requestSelect(r.id)} onKeyDown={(e) => onRowKey(e, r.id)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        {r.origin === "custom" || r.subcategory === "admin" ? <span className="hint">-</span> : (
                          <label className="switch" title={r.disabled ? "꺼져 있음 — 켜기 (즉시 적용)" : "켜져 있음 — 끄기 (즉시 적용)"}>
                            <input type="checkbox" role="switch" aria-label={`${r.id} ${r.name} 사용`} checked={!r.disabled} disabled={saving}
                              onChange={(e) => void change({ op: "disable", id: r.id, disabled: !e.target.checked }, `${r.id} 규칙을 ${e.target.checked ? "켰습니다" : "껐습니다"} (바로 적용됨).`)} />
                            <span className="sl" />
                          </label>
                        )}
                      </td>
                      <td className="mono">{r.id}</td><td>{r.name}</td><td><OriginPill o={r.origin} /></td>
                      <td className="nw">{CATEGORY_LABELS[r.category] ?? r.category}</td><td className="nw">{checkLabel(r.check)}</td>
                      <td><SeverityPill s={r.severity} /></td><td className="mono ellipsis" style={{ maxWidth: 200 }}>{r.table}</td><td className="mono ellipsis" style={{ maxWidth: 160 }}>{r.fields}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {list.length > 600 && <div className="sub" style={{ padding: 8 }}>상위 600개만 표시합니다. 조건을 좁혀 주세요.</div>}
        </Card>
        {sel && (
          <RuleDetail key={sel.id} rule={sel} admin={admin} cohorts={cohorts} saving={saving} apply={apply} dirtyRef={detailDirty}
            onEdit={() => { setEditId(sel.id); setModal(sel.origin === "custom" ? "custom" : "sql"); }} onClose={() => requestSelect(null)} />
        )}
      </div>

      <section className="danger-zone" aria-labelledby="danger-zone-h">
        <h2 id="danger-zone-h">위험 구역</h2>
        <p>이 PC 의 규칙 설정을 모두 지우고 표준으로 되돌립니다. 끈 규칙, 바꾼 심각도 · 값 · SQL, 사용자 규칙, 관리자 SQL 규칙이 모두 삭제됩니다. 되돌린 기록은 변경 이력에 남습니다.</p>
        <button type="button" className="btn danger" onClick={() => void resetAll()} disabled={saving}>모든 규칙을 표준으로 되돌리기…</button>
      </section>

      {modal === "custom" && <CustomRuleModal tables={tables} dirtyRef={modalDirty} edit={editCustom ? { ...(rules.find((r) => r.id === editCustom.id) as RuleInfo), custom: editCustom } : undefined}
        onClose={() => setModal(null)} onSaved={() => { setModal(null); void reload(); setErr(null); setMsg(editCustom ? "사용자 규칙을 고쳤습니다." : "사용자 규칙을 추가했습니다."); }} />}
      {modal === "sql" && <SqlRuleModal tables={tables} cohorts={cohorts} dirtyRef={modalDirty} edit={editAdm ? { ...(rules.find((r) => r.id === editAdm.id) as RuleInfo), adm: editAdm } : undefined}
        onClose={() => setModal(null)} onSaved={() => { setModal(null); void reload(); setErr(null); setMsg("SQL 규칙을 저장했습니다."); }} />}
      {modal === "history" && <HistoryModal onClose={() => setModal(null)} />}
    </>
  );
}

const numText = (v: number | undefined) => (v === undefined ? "" : String(v));
const codes = (t: string) => [...new Set(t.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
const rangeText = (min: string, max: string) => `${min.trim() || "제한 없음"} ~ ${max.trim() || "제한 없음"}`;

/** 화면에서 고치는 값 (글자 그대로) */
interface Draft { min: string; max: string; regex: string; extra: string; sql: string }
const draftOf = (r: RuleInfo): Draft => ({
  min: numText(r.params?.min), max: numText(r.params?.max), regex: r.params?.regex ?? "", extra: (r.params?.extraCodes ?? []).join(", "), sql: r.sql ?? "",
});

function RuleDetail({ rule: r, admin, cohorts, saving, apply, dirtyRef, onEdit, onClose }: {
  rule: RuleInfo; admin: boolean; cohorts: CohortInfo[]; saving: boolean;
  apply: (ch: RuleChange) => Promise<void>; dirtyRef: MutableRefObject<boolean>; onEdit: () => void; onClose: () => void;
}) {
  const isUsr = r.origin === "custom";
  const isAdm = r.subcategory === "admin";
  const isStd = !isUsr && !isAdm;
  const base = draftOf(r);
  const baseSig = JSON.stringify(base);
  const [draft, setDraft] = useState<Draft>(base);
  const baseRef = useRef(base);
  const [review, setReview] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const gate = useSqlGate(cohorts);

  // 저장된 값이 바뀌면(저장 · 되돌리기 · 가져오기) 손대지 않은 칸만 새 값으로 맞춘다. 고치던 칸은 건드리지 않는다.
  useEffect(() => {
    const old = baseRef.current;
    if (JSON.stringify(old) === baseSig) return;
    baseRef.current = base;
    setDraft((d) => ({ min: d.min === old.min ? base.min : d.min, max: d.max === old.max ? base.max : d.max, regex: d.regex === old.regex ? base.regex : d.regex, extra: d.extra === old.extra ? base.extra : d.extra, sql: d.sql === old.sql ? base.sql : d.sql }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseSig]);

  const paramsDirty = isStd && (r.paramKind === "range" ? draft.min.trim() !== base.min || draft.max.trim() !== base.max
    : r.paramKind === "pattern" ? draft.regex !== base.regex
    : r.paramKind === "codelist" ? codes(draft.extra).join(",") !== codes(base.extra).join(",") : false);
  const sqlEditable = isStd && admin && r.sql !== undefined;
  // 저장 안 된 SQL 변경은 관리자 모드가 꺼져도 변경으로 센다 (권한과 무관)
  const sqlChanged = isStd && r.sql !== undefined && draft.sql.trim() !== base.sql.trim();
  const dirty = paramsDirty || sqlChanged;
  useDirtyRef(dirtyRef, dirty);

  const edit = (patch: Partial<Draft>) => { setDraft((d) => ({ ...d, ...patch })); setReview(false); setNote(null); setLocalErr(null); };
  const discard = () => { setDraft(base); setReview(false); gate.reset(); };

  /** 바로 적용되는 변경: 결과를 이 자리에서 알린다 */
  const immediate = async (ch: RuleChange, done: string) => {
    setLocalErr(null); setNote(null);
    try { await apply(ch); setNote(done); } catch (e) { setLocalErr(errText(e)); }
  };

  // ----- 값(범위 · 패턴 · 코드): 저장 전에 현재 → 저장 후 를 보여 준다
  const show = (v: Draft) => r.paramKind === "range" ? rangeText(v.min, v.max) : r.paramKind === "pattern" ? (v.regex || "(비어 있음)") : (codes(v.extra).join(", ") || "추가 코드 없음");
  const std = r.standardParams;
  const stdDraft: Draft = { min: numText(std?.min), max: numText(std?.max), regex: std?.regex ?? "", extra: (std?.extraCodes ?? []).join(", "), sql: "" };
  const paramLabel = r.paramKind === "range" ? "허용 범위" : r.paramKind === "pattern" ? "패턴" : "추가 허용 코드";
  const askParams = () => {
    setLocalErr(null); setNote(null);
    if (r.paramKind === "range" && [draft.min, draft.max].some((t) => t.trim() !== "" && !Number.isFinite(Number(t)))) { setLocalErr("최솟값과 최댓값은 숫자로 입력해 주세요."); return; }
    setReview(true);
  };
  const saveParams = async () => {
    const params = r.paramKind === "range" ? { min: draft.min.trim() === "" ? undefined : Number(draft.min), max: draft.max.trim() === "" ? undefined : Number(draft.max) }
      : r.paramKind === "pattern" ? { regex: draft.regex } : { extraCodes: codes(draft.extra) };
    const before = show(base), after = show(draft);
    setLocalErr(null); setNote(null);
    try {
      await apply({ op: "params", id: r.id, params });
      setDraft((d) => ({ ...d, min: d.min.trim(), max: d.max.trim(), extra: codes(d.extra).join(", ") }));
      setReview(false);
      setNote(`저장했습니다 · ${paramLabel}: ${before} → ${after}`);
    } catch (e) { setLocalErr(errText(e)); }
  };

  // ----- SQL (관리자): 시험을 통과해야 저장된다
  const sqlReq = { sql: draft.sql, requires: r.table.split(",").filter(Boolean), ruleId: r.id };
  const saveSql = async () => {
    const before = base.sql;
    await apply({ op: "sql", id: r.id, sql: draft.sql });
    setNote(`SQL 을 저장했습니다 (${before.split("\n").length}줄 → ${draft.sql.split("\n").length}줄). 이 변경은 '관리자' 규칙으로 결과물에 기록됩니다.`);
  };
  const sqlIsCustom = r.standardSql !== undefined && r.sql !== undefined && r.sql.trim() !== r.standardSql.trim();

  const resetRule = async () => {
    if (!confirmDiscard(dirty)) return;
    setLocalErr(null); setNote(null);
    try {
      await apply({ op: "resetRule", id: r.id });
      setDraft({ ...stdDraft, sql: r.standardSql ?? base.sql }); setReview(false); gate.reset();
      setNote("이 규칙을 표준으로 되돌렸습니다.");
    } catch (e) { setLocalErr(errText(e)); }
  };
  const resetSql = async () => {
    if (!confirmDiscard(sqlChanged)) return;
    setLocalErr(null); setNote(null);
    try {
      await apply({ op: "sql", id: r.id, sql: null });
      setDraft((d) => ({ ...d, sql: r.standardSql ?? d.sql })); gate.reset();
      setNote("SQL 을 표준으로 되돌렸습니다.");
    } catch (e) { setLocalErr(errText(e)); }
  };
  const remove = async () => {
    if (!window.confirm(`${r.id} 규칙을 삭제할까요?`)) return;
    await immediate(isUsr ? { op: "removeCustom", id: r.id } : { op: "removeSql", id: r.id }, "규칙을 삭제했습니다.");
  };

  return (
    <div className="detail-panel" role="region" aria-label={`${r.id} 규칙 상세`}>
      <Card title={<span className="mono">{r.id}</span>} sub={r.name} right={<button type="button" className="btn sm" onClick={onClose}>닫기</button>}>
        <div className="kv">
          <span className="k">출처</span><span><OriginPill o={r.origin} />{r.disabled && <span className="pill disabled" style={{ marginLeft: 6 }}>꺼짐</span>}</span>
          <span className="k">종류</span><span>{r.kind === "structural" ? (isUsr ? "사용자 규칙 (서식으로 만듦)" : "구조 규칙 (명세에서 자동 생성)") : (isAdm && !r.standardSql ? "관리자가 추가한 SQL 규칙" : "교차 테이블 규칙 (DuckDB SQL)")}</span>
          <span className="k">분류</span><span>{CATEGORY_LABELS[r.category] ?? r.category}{r.subcategory ? ` · ${r.subcategory}` : ""}</span>
          <span className="k">검사 유형</span><span>{checkLabel(r.check)}</span>
          <span className="k">대상 테이블</span><span className="mono">{r.table}</span>
          {r.fields && <><span className="k">필드</span><span className="mono">{r.fields}</span></>}
          <span className="k">적용 코호트</span><span>{r.scope === "all" ? "전체" : r.scope}</span>
          <span className="k">설명</span><span>{r.desc || "-"}</span>
          <span className="k">조치 안내</span><span>{CHECK_GUIDES[r.check] ?? CHECK_GUIDES.sql}</span>
        </div>

        <div role="status" aria-live="polite">{note && <div className="callout ok" style={{ marginTop: 10 }}>{note}</div>}</div>
        {localErr && <div className="callout err" role="alert" style={{ marginTop: 10 }}>{localErr}</div>}
        {dirty && (
          <div className="callout warn" role="status" style={{ marginTop: 10 }}>
            저장하지 않은 변경이 있습니다. 아래 저장 단추를 눌러야 적용됩니다.
            <div className="error-actions"><button type="button" className="btn sm" onClick={discard}>입력 취소 (저장된 값으로)</button></div>
          </div>
        )}

        <div style={{ borderTop: "1px solid var(--line)", margin: "12px 0", paddingTop: 12, display: "grid", gap: 12 }}>
          {isStd && (
            <>
              <div className="rowflex">
                <b style={{ fontSize: 12.5 }}>사용</b>
                <label className="switch"><input type="checkbox" role="switch" aria-label={`${r.id} 사용`} checked={!r.disabled} disabled={saving}
                  onChange={(e) => void immediate({ op: "disable", id: r.id, disabled: !e.target.checked }, `${e.target.checked ? "켰습니다" : "껐습니다"} — 바로 적용되었습니다.`)} /><span className="sl" /></label>
                <span className="apply-tag now">즉시 적용</span>
                <span className="hint">{r.disabled ? "꺼져 있어 실행하지 않습니다 (결과에는 '꺼짐'으로 남습니다)" : "켜져 있음"}</span>
              </div>
              <div className="rowflex">
                <label htmlFor={`sev-${r.id}`} style={{ fontSize: 12.5, fontWeight: 700 }}>심각도</label>
                <select id={`sev-${r.id}`} value={r.severity} style={{ width: "auto" }} disabled={saving}
                  onChange={(e) => void immediate({ op: "severity", id: r.id, severity: e.target.value as Severity }, `심각도를 ${sevText(r.severity)} → ${sevText(e.target.value)} 로 바꿨습니다 — 바로 적용되었습니다.`)}>
                  <option value="error">오류 (High)</option><option value="warning">경고 (Medium)</option>
                </select>
                <span className="apply-tag now">즉시 적용</span>
                {r.severity !== r.standardSeverity && <span className="hint">표준: {r.standardSeverity === "error" ? "오류" : "경고"}</span>}
              </div>
            </>
          )}
          {isStd && r.paramKind === "range" && (
            <div>
              <b style={{ fontSize: 12.5 }}>허용 범위</b> <span className="apply-tag save">저장해야 적용</span> <span className="hint">표준: {rangeText(stdDraft.min, stdDraft.max)}</span>
              <div className="rowflex" style={{ marginTop: 6 }}>
                <input type="text" inputMode="decimal" aria-label="최솟값" value={draft.min} onChange={(e) => edit({ min: e.target.value })} style={{ width: 110 }} placeholder="최솟값" /> ~
                <input type="text" inputMode="decimal" aria-label="최댓값" value={draft.max} onChange={(e) => edit({ max: e.target.value })} style={{ width: 110 }} placeholder="최댓값" />
                <button type="button" className="btn sm primary" disabled={!paramsDirty || saving || review} onClick={askParams}>범위 저장</button>
              </div>
            </div>
          )}
          {isStd && r.paramKind === "pattern" && (
            <div>
              <b style={{ fontSize: 12.5 }}>패턴 (정규식)</b> <span className="apply-tag save">저장해야 적용</span> <span className="hint">표준: <span className="mono">{r.standardParams?.regex}</span></span>
              <div className="rowflex" style={{ marginTop: 6 }}>
                <input type="text" className="mono" aria-label="패턴 (정규식)" value={draft.regex} onChange={(e) => edit({ regex: e.target.value })} />
                <button type="button" className="btn sm primary" disabled={!paramsDirty || saving || review} onClick={askParams}>패턴 저장</button>
              </div>
            </div>
          )}
          {isStd && r.paramKind === "codelist" && (
            <div>
              <b style={{ fontSize: 12.5 }}>추가 허용 코드</b> <span className="apply-tag save">저장해야 적용</span> <span className="hint">코드표 <span className="mono">{r.standardParams?.codelist}</span> 에 더해 허용합니다 (병원 코드가 표준 집합에 없을 때)</span>
              <div className="rowflex" style={{ marginTop: 6 }}>
                <input type="text" className="mono" aria-label="추가 허용 코드 (쉼표로 구분)" value={draft.extra} onChange={(e) => edit({ extra: e.target.value })} placeholder="쉼표로 구분: 4188540, 4188539" />
                <button type="button" className="btn sm primary" disabled={!paramsDirty || saving || review} onClick={askParams}>코드 저장</button>
              </div>
            </div>
          )}
          {review && paramsDirty && (
            <div>
              <ChangePreview title={`${paramLabel} 저장 전 확인`} rows={[{ label: paramLabel, before: show(base), after: show(draft), std: show(stdDraft) }]} />
              <div className="rowflex" style={{ marginTop: 8 }}>
                <button type="button" className="btn sm primary" disabled={saving} onClick={() => void saveParams()}>확인하고 저장</button>
                <button type="button" className="btn sm" onClick={() => setReview(false)}>계속 고치기</button>
              </div>
            </div>
          )}
          {(isUsr || isAdm) && (
            <div className="rowflex">
              <button type="button" className="btn sm" onClick={onEdit} disabled={isAdm && !admin} title={isAdm && !admin ? "관리자 모드에서만 고칠 수 있습니다" : ""}>수정</button>
              <button type="button" className="btn sm danger" disabled={(isAdm && !admin) || saving} onClick={() => void remove()}>삭제</button>
            </div>
          )}
          {isStd && r.origin !== "standard" && (
            <div><button type="button" className="btn sm" disabled={saving} onClick={() => void resetRule()}>이 규칙만 표준으로 되돌리기</button></div>
          )}
        </div>

        {r.sql !== undefined && (
          <div style={{ display: "grid", gap: 8 }}>
            <b style={{ fontSize: 12.5 }}>SQL{sqlIsCustom ? " (관리자가 바꾼 SQL)" : ""}{sqlEditable && <> <span className="apply-tag save">시험 후 저장해야 적용</span></>}</b>
            {sqlEditable || sqlChanged ? (
              <>
                <textarea className="sql" aria-label={`${r.id} SQL`} value={draft.sql} readOnly={!admin} onChange={(e) => { edit({ sql: e.target.value }); gate.reset(); }} spellCheck={false} />
                {!admin && <div className="hint">관리자 모드가 꺼져 있어 SQL 을 저장할 수 없습니다. 입력은 그대로 남아 있으니 '입력 취소'로 버리거나 관리자 모드를 다시 켜세요.</div>}
                {sqlChanged && (
                  <details className="sql-compare" open>
                    <summary>변경 전 → 후 SQL 비교</summary>
                    <div><b>지금 적용 중</b><pre className="report">{base.sql}</pre></div>
                    <div><b>저장 후</b><pre className="report">{draft.sql}</pre></div>
                  </details>
                )}
                <SqlGateControls gate={gate} cohorts={cohorts} />
                <div className="rowflex">
                  <button type="button" className="btn sm" disabled={gate.busy || !admin} onClick={() => void gate.test(sqlReq)}>시험 실행</button>
                  {gate.needsConfirm
                    ? <button type="button" className="btn sm danger" disabled={gate.busy || saving || !admin} onClick={() => void gate.testThenSave(sqlReq, saveSql, true)}>확인하고 저장</button>
                    : <button type="button" className="btn sm primary" disabled={gate.busy || saving || !sqlChanged || !admin} onClick={() => void gate.testThenSave(sqlReq, saveSql)}>시험 후 저장</button>}
                  {sqlIsCustom && <button type="button" className="btn sm" disabled={saving || !admin} onClick={() => void resetSql()}>SQL 만 표준으로</button>}
                </div>
              </>
            ) : (
              <>
                <pre className="report">{r.sql}</pre>
                {isStd && <div className="hint">SQL 은 관리자 모드에서만 고칠 수 있습니다 (설정 → 관리자 모드).</div>}
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
