// 검증 규칙 관리: 표준 규칙은 읽기 전용이고, 이 PC 의 설정(끄기 · 심각도 · 값 · 사용자 규칙 · 관리자 SQL)만 덧씌운다.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CohortInfo, RuleChange, RuleInfo, RuleSetState, Severity, SpecTableInfo } from "@shared/types";
import { checkLabel, CATEGORY_LABELS, CHECK_GUIDES } from "@shared/labels";
import { api, errText, fmt } from "../api";
import { Card, SeverityPill, OriginPill, Empty } from "../components/ui";
import { CustomRuleModal, HistoryModal, SqlGateControls, SqlRuleModal, useSqlGate } from "../components/RuleForms";

const ORIGIN_FILTER: Record<string, string> = { standard: "표준", modified: "변경됨", custom: "사용자 규칙", admin: "관리자 규칙", disabled: "꺼 둔 규칙" };

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

  const reload = useCallback(async () => {
    const [rs, st, cfg] = await Promise.all([api.listRules(), api.getRuleSet(), api.getConfig()]);
    setRules(rs); setState(st); setAdmin(cfg.adminMode);
    window.dispatchEvent(new Event("kai:config"));   // 꼬리말의 규칙 수 갱신
  }, []);

  useEffect(() => {
    reload().catch((e) => setErr(errText(e)));
    api.listCohorts().then(setCohorts).catch((e) => setErr(errText(e)));
    api.listSpecTables().then(setTables).catch((e) => setErr(errText(e)));
    const off = api.onSmokeRule((id) => setSelId(id));
    const onCfg = () => { api.getConfig().then((c) => setAdmin(c.adminMode)).catch(() => undefined); };
    window.addEventListener("kai:config", onCfg);
    return () => { off(); window.removeEventListener("kai:config", onCfg); };
  }, [reload]);

  const sel = useMemo(() => rules.find((r) => r.id === selId) ?? null, [rules, selId]);
  const tableNames = useMemo(() => [...new Set(rules.flatMap((r) => r.table.split(",")))].filter(Boolean).sort(), [rules]);
  const checks = useMemo(() => [...new Set(rules.map((r) => r.check))].sort(), [rules]);
  const list = useMemo(() => rules.filter((r) =>
    (!kind || r.kind === kind) && (!category || r.category === category) && (!severity || r.severity === severity) &&
    (!check || r.check === check) && (!table || r.table.split(",").includes(table)) &&
    (!origin || (origin === "disabled" ? r.disabled : r.origin === origin)) &&
    (!q || `${r.id} ${r.name} ${r.desc} ${r.fields}`.toLowerCase().includes(q.toLowerCase()))), [rules, kind, category, severity, check, table, origin, q]);

  /** 규칙 설정을 바꾸고 화면을 갱신한다. 실패하면 이유를 보여 준다. */
  const change = async (ch: RuleChange, done?: string): Promise<boolean> => {
    setErr(null); setMsg(null);
    try { setState(await api.changeRules(ch)); await reload(); if (done) setMsg(done); return true; }
    catch (e) { setErr(errText(e)); return false; }
  };
  const resetAll = async () => {
    if (!state || (state.changes.length === 0 && !(state.overrides.customRules?.length))) { setMsg("이미 표준 그대로입니다."); return; }
    if (!window.confirm("이 PC 의 규칙 설정을 모두 지우고 표준으로 되돌립니다. 사용자 규칙과 관리자 SQL 도 삭제됩니다. 계속할까요?")) return;
    await change({ op: "resetAll" }, "모든 규칙을 표준으로 되돌렸습니다.");
  };
  const doExport = async () => {
    setErr(null); setMsg(null);
    try { const p = await api.exportRuleSet(); if (p) setMsg(`내보냈습니다: ${p}`); } catch (e) { setErr(errText(e)); }
  };
  const doImport = async () => {
    setErr(null); setMsg(null);
    try {
      const st = await api.importRuleSet();
      if (st) { setState(st); await reload(); setMsg("규칙 설정을 가져왔습니다."); }
    } catch (e) { setErr(errText(e)); }
  };

  const nCustom = state?.overrides.customRules?.length ?? 0;
  const nAdmin = rules.filter((r) => r.origin === "admin").length;
  const nStd = rules.filter((r) => r.origin !== "custom" && r.subcategory !== "admin").length;
  const changed = state?.changes.length ?? 0;
  const editCustom = editId ? state?.overrides.customRules?.find((r) => r.id === editId) : undefined;
  const editAdm = editId ? state?.overrides.customSql?.find((r) => r.id === editId) : undefined;

  return (
    <>
      <div className="page-title">
        <h1>검증 규칙 관리</h1>
        <span className="sub">표준 규칙 {fmt(nStd)}개{nCustom ? ` · 사용자 규칙 ${nCustom}개` : ""}{(state?.overrides.customSql?.length ?? 0) ? ` · 관리자 SQL 규칙 ${state?.overrides.customSql?.length}개` : ""}</span>
      </div>
      <div className="callout" style={{ marginBottom: 12 }}>
        표준 규칙은 바꿀 수 없습니다. 이 PC 에서만 규칙을 <b>끄거나</b>, <b>심각도 · 허용 범위 · 패턴 · 코드</b>를 조정하거나, <b>사용자 규칙</b>을 더할 수 있습니다.
        표준과 달라진 규칙은 검증 결과의 보고서와 제출용 집계에 '변경 · 사용자 · 관리자'로 기록됩니다 (앱이 자동 전송하지는 않으며, 제출할 때 함께 전달됩니다).
        {changed ? <> 지금 표준과 다른 점 <b>{changed}건</b> (표준 {state?.standardHash.slice(0, 8)} → 적용 {state?.effectiveHash.slice(0, 8)}).</> : <> 지금은 표준 그대로입니다.</>}
      </div>
      {err && <div className="callout err" style={{ marginBottom: 12 }}>{err}</div>}
      {msg && <div className="callout" style={{ marginBottom: 12 }}>{msg}</div>}
      <div className="toolbar">
        <button className="btn primary" onClick={() => { setEditId(null); setModal("custom"); }} disabled={!tables.length}>사용자 규칙 추가</button>
        <button className="btn" onClick={() => { setEditId(null); setModal("sql"); }} disabled={!admin || !tables.length} title={admin ? "" : "설정에서 관리자 모드를 켜면 쓸 수 있습니다"}>SQL 규칙 추가 (관리자)</button>
        <span className="spacer" />
        <button className="btn" onClick={() => setModal("history")}>변경 이력</button>
        <button className="btn" onClick={doExport}>설정 내보내기</button>
        <button className="btn" onClick={doImport}>설정 가져오기</button>
        <button className="btn danger" onClick={resetAll}>모두 표준으로 되돌리기</button>
      </div>
      <div className="toolbar">
        <select value={origin} onChange={(e) => setOrigin(e.target.value)}><option value="">전체 출처</option>{Object.entries(ORIGIN_FILTER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select value={kind} onChange={(e) => setKind(e.target.value)}><option value="">전체 종류</option><option value="structural">구조 (자동 생성)</option><option value="semantic">교차 테이블 (SQL)</option></select>
        <select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">전체 분류</option>{Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v} {k}</option>)}</select>
        <select value={severity} onChange={(e) => setSeverity(e.target.value)}><option value="">전체 심각도</option><option value="error">오류</option><option value="warning">경고</option></select>
        <select value={check} onChange={(e) => setCheck(e.target.value)}><option value="">전체 검사 유형</option>{checks.map((c) => <option key={c} value={c}>{checkLabel(c)}</option>)}</select>
        <select value={table} onChange={(e) => setTable(e.target.value)}><option value="">전체 테이블</option>{tableNames.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <input type="text" placeholder="규칙 ID · 이름 · 설명 검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 220 }} />
        <span className="spacer" /><span style={{ color: "var(--muted)", fontSize: 12 }}>{fmt(list.length)}개 표시</span>
      </div>
      <div className="grid" style={{ gridTemplateColumns: sel ? "1.4fr 1fr" : "1fr" }}>
        <Card className="pad0">
          <div className="tblwrap" style={{ maxHeight: "68vh" }}>
            {list.length === 0 ? <Empty>조건에 맞는 규칙이 없습니다</Empty> : (
              <table className="tbl">
                <thead><tr><th>사용</th><th>규칙 ID</th><th>규칙명</th><th>출처</th><th>분류</th><th>검사 유형</th><th>심각도</th><th>대상 테이블</th><th>필드</th></tr></thead>
                <tbody>
                  {list.slice(0, 600).map((r) => (
                    <tr key={r.id} className={`click ${selId === r.id ? "sel" : ""} ${r.disabled ? "off" : ""}`} onClick={() => setSelId(r.id)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        {r.origin === "custom" || r.subcategory === "admin" ? <span className="hint">-</span> : (
                          <label className="switch" title={r.disabled ? "꺼져 있음 — 켜기" : "켜져 있음 — 끄기"}>
                            <input type="checkbox" checked={!r.disabled} onChange={(e) => void change({ op: "disable", id: r.id, disabled: !e.target.checked })} />
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
          <RuleDetail key={sel.id + (state?.effectiveHash ?? "")} rule={sel} admin={admin} cohorts={cohorts}
            change={change}
            onEdit={() => { setEditId(sel.id); setModal(sel.origin === "custom" ? "custom" : "sql"); }} onClose={() => setSelId(null)} />
        )}
      </div>
      {modal === "custom" && <CustomRuleModal tables={tables} edit={editCustom ? { ...(rules.find((r) => r.id === editCustom.id) as RuleInfo), custom: editCustom } : undefined}
        onClose={() => setModal(null)} onSaved={() => { setModal(null); void reload(); setMsg(editCustom ? "사용자 규칙을 고쳤습니다." : "사용자 규칙을 추가했습니다."); }} />}
      {modal === "sql" && <SqlRuleModal tables={tables} cohorts={cohorts} edit={editAdm ? { ...(rules.find((r) => r.id === editAdm.id) as RuleInfo), adm: editAdm } : undefined}
        onClose={() => setModal(null)} onSaved={() => { setModal(null); void reload(); setMsg("SQL 규칙을 저장했습니다."); }} />}
      {modal === "history" && <HistoryModal onClose={() => setModal(null)} />}
    </>
  );
}

const numText = (v: number | undefined) => (v === undefined ? "" : String(v));
const codes = (t: string) => [...new Set(t.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];

function RuleDetail({ rule: r, admin, cohorts, change, onEdit, onClose }: {
  rule: RuleInfo; admin: boolean; cohorts: CohortInfo[];
  change: (ch: RuleChange, done?: string) => Promise<boolean>; onEdit: () => void; onClose: () => void;
}) {
  const isUsr = r.origin === "custom";
  const isAdm = r.subcategory === "admin";
  const isStd = !isUsr && !isAdm;
  const [min, setMin] = useState(numText(r.params?.min));
  const [max, setMax] = useState(numText(r.params?.max));
  const [regex, setRegex] = useState(r.params?.regex ?? "");
  const [extra, setExtra] = useState((r.params?.extraCodes ?? []).join(", "));
  const [sql, setSql] = useState(r.sql ?? "");
  const gate = useSqlGate(cohorts);

  const saveParams = () => {
    const kind = r.paramKind;
    const params = kind === "range" ? { min: min.trim() === "" ? undefined : Number(min), max: max.trim() === "" ? undefined : Number(max) }
      : kind === "pattern" ? { regex } : { extraCodes: codes(extra) };
    return change({ op: "params", id: r.id, params }, "값을 저장했습니다.");
  };
  const sqlReq = { sql, requires: r.table.split(",").filter(Boolean), ruleId: r.id };
  const saveSql = async () => { await change({ op: "sql", id: r.id, sql }, "SQL 을 저장했습니다. 이 변경은 '관리자' 규칙으로 결과물에 기록됩니다."); };
  const sqlChanged = sql.trim() !== (r.sql ?? "").trim();

  return (
    <Card title={<span className="mono">{r.id}</span>} sub={r.name} right={<button className="btn sm" onClick={onClose}>닫기</button>}>
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

      <div style={{ borderTop: "1px solid var(--line)", margin: "12px 0", paddingTop: 12, display: "grid", gap: 12 }}>
        {isStd && (
          <>
            <div className="rowflex">
              <b style={{ fontSize: 12.5 }}>사용</b>
              <label className="switch"><input type="checkbox" checked={!r.disabled} onChange={(e) => void change({ op: "disable", id: r.id, disabled: !e.target.checked })} /><span className="sl" /></label>
              <span className="hint">{r.disabled ? "꺼져 있어 실행하지 않습니다 (결과에는 '꺼짐'으로 남습니다)" : "켜져 있음"}</span>
            </div>
            <div className="rowflex">
              <b style={{ fontSize: 12.5 }}>심각도</b>
              <select value={r.severity} style={{ width: "auto" }} onChange={(e) => void change({ op: "severity", id: r.id, severity: e.target.value as Severity })}>
                <option value="error">오류 (High)</option><option value="warning">경고 (Medium)</option>
              </select>
              {r.severity !== r.standardSeverity && <span className="hint">표준: {r.standardSeverity === "error" ? "오류" : "경고"}</span>}
            </div>
          </>
        )}
        {isStd && r.paramKind === "range" && (
          <div>
            <b style={{ fontSize: 12.5 }}>허용 범위</b> <span className="hint">표준: {numText(r.standardParams?.min)} ~ {numText(r.standardParams?.max)}</span>
            <div className="rowflex" style={{ marginTop: 6 }}>
              <input type="text" value={min} onChange={(e) => setMin(e.target.value)} style={{ width: 110 }} placeholder="최솟값" /> ~
              <input type="text" value={max} onChange={(e) => setMax(e.target.value)} style={{ width: 110 }} placeholder="최댓값" />
              <button className="btn sm primary" onClick={() => void saveParams()}>범위 저장</button>
            </div>
          </div>
        )}
        {isStd && r.paramKind === "pattern" && (
          <div>
            <b style={{ fontSize: 12.5 }}>패턴 (정규식)</b> <span className="hint">표준: <span className="mono">{r.standardParams?.regex}</span></span>
            <div className="rowflex" style={{ marginTop: 6 }}>
              <input type="text" className="mono" value={regex} onChange={(e) => setRegex(e.target.value)} />
              <button className="btn sm primary" onClick={() => void saveParams()}>패턴 저장</button>
            </div>
          </div>
        )}
        {isStd && r.paramKind === "codelist" && (
          <div>
            <b style={{ fontSize: 12.5 }}>추가 허용 코드</b> <span className="hint">코드표 <span className="mono">{r.standardParams?.codelist}</span> 에 더해 허용합니다 (병원 코드가 표준 집합에 없을 때)</span>
            <div className="rowflex" style={{ marginTop: 6 }}>
              <input type="text" className="mono" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="쉼표로 구분: 4188540, 4188539" />
              <button className="btn sm primary" onClick={() => void saveParams()}>코드 저장</button>
            </div>
          </div>
        )}
        {(isUsr || isAdm) && (
          <div className="rowflex">
            <button className="btn sm" onClick={onEdit} disabled={isAdm && !admin} title={isAdm && !admin ? "관리자 모드에서만 고칠 수 있습니다" : ""}>수정</button>
            <button className="btn sm danger" disabled={isAdm && !admin} onClick={() => { if (window.confirm(`${r.id} 규칙을 삭제할까요?`)) void change(isUsr ? { op: "removeCustom", id: r.id } : { op: "removeSql", id: r.id }, "규칙을 삭제했습니다."); }}>삭제</button>
          </div>
        )}
        {isStd && r.origin !== "standard" && (
          <div><button className="btn sm" onClick={() => void change({ op: "resetRule", id: r.id }, "이 규칙을 표준으로 되돌렸습니다.")}>이 규칙만 표준으로 되돌리기</button></div>
        )}
      </div>

      {r.sql !== undefined && (
        <div style={{ display: "grid", gap: 8 }}>
          <b style={{ fontSize: 12.5 }}>SQL{r.standardSql !== undefined && r.sql.trim() !== r.standardSql.trim() ? " (관리자가 바꾼 SQL)" : ""}</b>
          {isStd && admin ? (
            <>
              <textarea className="sql" value={sql} onChange={(e) => { setSql(e.target.value); gate.reset(); }} spellCheck={false} />
              <SqlGateControls gate={gate} cohorts={cohorts} />
              <div className="rowflex">
                <button className="btn sm" disabled={gate.busy} onClick={() => void gate.test(sqlReq)}>시험 실행</button>
                {gate.needsConfirm
                  ? <button className="btn sm danger" disabled={gate.busy} onClick={() => void gate.testThenSave(sqlReq, saveSql, true)}>확인하고 저장</button>
                  : <button className="btn sm primary" disabled={gate.busy || !sqlChanged} onClick={() => void gate.testThenSave(sqlReq, saveSql)}>시험 후 저장</button>}
                {r.standardSql !== undefined && r.sql.trim() !== r.standardSql.trim() && (
                  <button className="btn sm" onClick={() => void change({ op: "sql", id: r.id, sql: null }, "SQL 을 표준으로 되돌렸습니다.")}>SQL 만 표준으로</button>
                )}
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
  );
}
