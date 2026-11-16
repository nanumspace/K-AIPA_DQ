// 규칙 편집용 창과 부품: 사용자 규칙 서식(수준 3), 관리자 SQL 시험·저장(수준 4), 변경 이력
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { CohortInfo, CustomRule, CustomSqlRule, RuleHistoryEntry, RuleInfo, Severity, SpecTableInfo, SqlTestResult, SqlTestSide } from "@shared/types";
import { api, errText, fmt, fmtTime } from "../api";
import { confirmDiscard, Modal, useDirtyRef } from "./Modal";

/** 저장 전 확인: 지금 적용 중인 값 → 저장 뒤 값, 그리고 표준 값 */
export function ChangePreview({ title, rows }: { title: string; rows: { label: string; before: string; after: string; std?: string }[] }) {
  return (
    <div className="change-preview" role="group" aria-label={title}>
      <b>{title}</b>
      <table>
        <thead><tr><th scope="col">항목</th><th scope="col">지금 적용 중</th><th scope="col">저장 후</th><th scope="col">표준</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.label} className={r.before !== r.after ? "changed" : ""}>
            <th scope="row">{r.label}</th><td className="mono">{r.before}</td><td className="mono"><b>{r.after}</b></td><td className="mono">{r.std ?? "-"}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

const CHECK_NAMES: Record<CustomRule["check"], string> = {
  not_null: "필수값 (비어 있으면 위반)", range: "값 범위 (숫자)", codelist: "허용 코드 (목록 밖이면 위반)", pattern: "패턴 (정규식과 맞지 않으면 위반)", not_future: "미래 날짜 금지",
};

/** 필드 타입에 쓸 수 있는 검사 유형 */
function checksFor(type: string): CustomRule["check"][] {
  const c: CustomRule["check"][] = ["not_null", "codelist"];
  if (["integer", "bigint", "float"].includes(type)) c.push("range");
  if (["varchar", "text"].includes(type)) c.push("pattern");
  if (["date", "timestamp"].includes(type)) c.push("not_future");
  return c;
}

const splitCodes = (t: string) => [...new Set(t.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
const num = (t: string): number | undefined => (t.trim() === "" ? undefined : Number(t));

/** 수준 3: 표 → 필드 → 검사 유형 → 값 → 심각도 순서로 만드는 사용자 규칙 */
export function CustomRuleModal({ tables, edit, onClose, onSaved, dirtyRef }: { tables: SpecTableInfo[]; edit?: RuleInfo & { custom: CustomRule }; onClose: () => void; onSaved: () => void; dirtyRef?: MutableRefObject<boolean> }) {
  const init = edit?.custom;
  const [table, setTable] = useState(init?.table ?? tables[0]?.table ?? "");
  const [field, setField] = useState(init?.field ?? (tables.find((t) => t.table === (init?.table ?? tables[0]?.table))?.fields[0]?.name ?? ""));
  const [check, setCheck] = useState<CustomRule["check"]>(init?.check ?? "not_null");
  const [name, setName] = useState(init?.name ?? "");
  const [severity, setSeverity] = useState<Severity>(init?.severity ?? "warning");
  const [min, setMin] = useState(init?.params.min?.toString() ?? "");
  const [max, setMax] = useState(init?.params.max?.toString() ?? "");
  const [codes, setCodes] = useState((init?.params.codes ?? []).join(", "));
  const [regex, setRegex] = useState(init?.params.regex ?? "");
  const [desc, setDesc] = useState(init?.desc ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const snapshot = JSON.stringify([table, field, check, name, severity, min, max, codes, regex, desc]);
  const [initial] = useState(snapshot);
  const dirty = snapshot !== initial;
  const ownRef = useRef(false);
  useDirtyRef(dirtyRef ?? ownRef, dirty);

  const fields = useMemo(() => tables.find((t) => t.table === table)?.fields ?? [], [tables, table]);
  useEffect(() => { if (!fields.some((f) => f.name === field)) setField(fields[0]?.name ?? ""); }, [fields, field]);
  const type = fields.find((f) => f.name === field)?.type ?? "varchar";
  const allowed = checksFor(type);
  useEffect(() => { if (!allowed.includes(check)) setCheck("not_null"); }, [allowed, check]);

  const save = async () => {
    setErr(null); setBusy(true);
    const params = check === "range" ? { min: num(min), max: num(max) } : check === "codelist" ? { codes: splitCodes(codes) } : check === "pattern" ? { regex } : {};
    const rule = { name, table, field, check, severity, params, desc: desc.trim() || undefined };
    try {
      await api.changeRules(init ? { op: "updateCustom", rule: { ...rule, id: init.id } } : { op: "addCustom", rule });
      onSaved();
    } catch (e) { setErr(errText(e)); setBusy(false); }
  };

  return (
    <Modal title={init ? `사용자 규칙 수정 · ${init.id}` : "사용자 규칙 추가"} onClose={onClose} dirty={dirty}>
      <div className="form" style={{ maxWidth: "none" }}>
        <p className="hint">표준 규칙으로 잡지 못하는 기관 내부 기준을 서식으로 만듭니다. SQL 은 쓰지 않으며, 만든 규칙은 USR-### 로 번호가 붙고 결과물에 '사용자' 규칙으로 기록됩니다.</p>
        <label>규칙 이름<input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 출생연도 1950 이후" /></label>
        <div className="grid c2">
          <label>테이블<select value={table} onChange={(e) => setTable(e.target.value)}>{tables.map((t) => <option key={t.table} value={t.table}>{t.table} · {t.kor}</option>)}</select></label>
          <label>필드<select value={field} onChange={(e) => setField(e.target.value)}>{fields.map((f) => <option key={f.name} value={f.name}>{f.name} ({f.type})</option>)}</select></label>
        </div>
        <div className="grid c2">
          <label>검사 유형<select value={check} onChange={(e) => setCheck(e.target.value as CustomRule["check"])}>{allowed.map((c) => <option key={c} value={c}>{CHECK_NAMES[c]}</option>)}</select></label>
          <label>심각도<select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}><option value="error">오류 (High)</option><option value="warning">경고 (Medium)</option></select></label>
        </div>
        {check === "range" && (
          <div className="grid c2">
            <label>최솟값 (이상)<input type="text" value={min} onChange={(e) => setMin(e.target.value)} placeholder="예: 1950" /></label>
            <label>최댓값 (이하)<input type="text" value={max} onChange={(e) => setMax(e.target.value)} placeholder="예: 2010" /></label>
          </div>
        )}
        {check === "codelist" && <label>허용 코드 (쉼표 또는 줄바꿈으로 구분)<textarea rows={3} value={codes} onChange={(e) => setCodes(e.target.value)} placeholder="예: 1, 2, 3" /></label>}
        {check === "pattern" && <label>정규식 (값 전체가 아니라 앞에서부터 맞는지 봅니다)<input type="text" className="mono" value={regex} onChange={(e) => setRegex(e.target.value)} placeholder="예: [A-Z]\d{2}(\.\d+)?" /></label>}
        <label>설명 (선택)<input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
        {err && <div className="callout err" role="alert">{err}</div>}
        <div className="rowflex" style={{ justifyContent: "flex-end" }}>
          {dirty && <span className="hint" role="status">저장하지 않은 입력이 있습니다</span>}
          <button type="button" className="btn" onClick={() => { if (confirmDiscard(dirty)) onClose(); }}>취소</button>
          <button type="button" className="btn primary" disabled={busy} onClick={save}>{init ? "저장" : "규칙 추가"}</button>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ 관리자: SQL 시험
/** 시험 결과 한 쪽 (clean 또는 dirty) */
function SideView({ label, side, expectZero }: { label: string; side: SqlTestSide | null; expectZero: boolean }) {
  if (!side) return <div>{label}: <span className="hint">내장 견본이 없어 시험하지 못했습니다.</span></div>;
  if (!side.ok) return <div className="callout err" role="alert"><b>{label}: SQL 실행 실패 (규칙 위반이 아니라 SQL 을 실행하지 못했습니다)</b><pre className="mono" style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{side.error}</pre></div>;
  const bad = expectZero && side.violations > 0;
  return (
    <div>
      {label}: <b style={{ color: bad ? "var(--red)" : undefined }}>위반 {fmt(side.violations)}건</b> <span className="hint">(검사 {fmt(side.rowsChecked)}행)</span>
      {bad && <span style={{ color: "var(--red)" }}> — 오류 없는 데이터에서 위반이 나옵니다. 조건이 너무 넓은지 확인하세요.</span>}
      {!expectZero && side.violations === 0 && <span style={{ color: "#b5731a" }}> — 오류를 주입한 데이터에서 하나도 잡지 못합니다.</span>}
      {side.samples.length > 0 && <pre className="mono" style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", color: "var(--ink-2)" }}>{side.samples.join("\n")}</pre>}
    </div>
  );
}

export function SqlTestView({ result }: { result: SqlTestResult }) {
  return (
    <div className="sqltest">
      <SideView label="clean 견본 (오류 없음)" side={result.clean} expectZero />
      <SideView label="dirty 견본 (오류 주입)" side={result.dirty} expectZero={false} />
    </div>
  );
}

/**
 * SQL 시험과 저장의 흐름. 저장하려면 먼저 시험해야 한다.
 * SQL 오류가 있으면 저장할 수 없고, clean 에서 위반이 나오면 확인을 한 번 더 받는다.
 */
export interface SqlGate {
  cohort: string;
  setCohort: (c: string) => void;
  result: SqlTestResult | null;
  busy: boolean;
  err: string | null;
  needsConfirm: boolean;
  test: (req: SqlTestRule) => Promise<SqlTestResult | null>;
  testThenSave: (req: SqlTestRule, save: () => Promise<void>, confirmed?: boolean) => Promise<boolean>;
  reset: () => void;
}
export interface SqlTestRule { sql: string; requires: string[]; ruleId?: string }

export function useSqlGate(cohorts: CohortInfo[]): SqlGate {
  const [cohort, setCohort] = useState(cohorts.find((c) => c.id === "LUNG_CANCER")?.id ?? cohorts[0]?.id ?? "");
  const [result, setResult] = useState<SqlTestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  useEffect(() => { if (!cohort && cohorts.length) setCohort(cohorts[0].id); }, [cohorts, cohort]);

  const test = async (req: SqlTestRule): Promise<SqlTestResult | null> => {
    setBusy(true); setErr(null); setNeedsConfirm(false);
    try { const r = await api.testSqlRule({ cohort, ...req }); setResult(r); return r; }
    catch (e) { setErr(errText(e)); return null; }
    finally { setBusy(false); }
  };
  /** 시험하고, 통과하면(또는 확인을 받았으면) save 를 부른다. 저장했으면 true. */
  const testThenSave = async (req: SqlTestRule, save: () => Promise<void>, confirmed = false): Promise<boolean> => {
    const r = confirmed ? result : await test(req);
    if (!r) return false;
    if (r.clean && !r.clean.ok) return false;
    if (r.dirty && !r.dirty.ok) return false;
    if (!confirmed && r.clean && r.clean.violations > 0) { setNeedsConfirm(true); return false; }
    try { await save(); return true; } catch (e) { setErr(errText(e)); return false; }
  };
  const reset = () => { setResult(null); setErr(null); setNeedsConfirm(false); };
  return { cohort, setCohort, result, busy, err, needsConfirm, test, testThenSave, reset };
}

export function SqlGateControls({ gate, cohorts }: { gate: SqlGate; cohorts: CohortInfo[] }) {
  return (
    <>
      <label className="lbl">시험할 코호트 (내장 견본의 clean · dirty 로 돌려 봅니다)
        <select value={gate.cohort} onChange={(e) => { gate.setCohort(e.target.value); gate.reset(); }}>{cohorts.map((c) => <option key={c.id} value={c.id}>{c.kor} ({c.id})</option>)}</select>
      </label>
      {gate.busy && <div className="hint" role="status">시험하는 중…</div>}
      {gate.err && <div className="callout err" role="alert">{gate.err}</div>}
      {gate.result && <SqlTestView result={gate.result} />}
      {gate.needsConfirm && <div className="callout warn">clean 견본에서 위반이 나옵니다. 의도한 규칙이 아니라면 SQL 을 고치세요. 그래도 저장하려면 아래 '확인하고 저장'을 누르세요.</div>}
    </>
  );
}

const SQL_TEMPLATE = `SELECT person_id,
       CAST(visit_occurrence_id AS VARCHAR) AS row_key,
       'visit_end_date 없음' AS detail
FROM VISIT_OCCURRENCE
WHERE visit_end_date IS NULL`;

/** 수준 4(관리자): SQL 규칙 추가 · 수정 (ADM-###) */
export function SqlRuleModal({ tables, cohorts, edit, onClose, onSaved, dirtyRef }: { tables: SpecTableInfo[]; cohorts: CohortInfo[]; edit?: RuleInfo & { adm: CustomSqlRule }; onClose: () => void; onSaved: () => void; dirtyRef?: MutableRefObject<boolean> }) {
  const init = edit?.adm;
  const [name, setName] = useState(init?.name ?? "");
  const [category, setCategory] = useState<CustomSqlRule["category"]>(init?.category ?? "Plausibility");
  const [severity, setSeverity] = useState<Severity>(init?.severity ?? "warning");
  const [all, setAll] = useState(init ? init.scope === "all" : true);
  const [scope, setScope] = useState<string[]>(init && init.scope !== "all" ? init.scope : []);
  const [requires, setRequires] = useState<string[]>(init?.requires ?? ["VISIT_OCCURRENCE"]);
  const [sql, setSql] = useState(init?.sql ?? SQL_TEMPLATE);
  const [desc, setDesc] = useState(init?.desc ?? "");
  const gate = useSqlGate(cohorts);
  const snapshot = JSON.stringify([name, category, severity, all, scope, requires, sql, desc]);
  const [initial] = useState(snapshot);
  const dirty = snapshot !== initial;
  const ownRef = useRef(false);
  useDirtyRef(dirtyRef ?? ownRef, dirty);
  const toggle = (list: string[], set: (v: string[]) => void, x: string) => set(list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);

  const save = async () => {
    const rule = { name, category, severity, scope: all ? ("all" as const) : scope, requires, sql, desc: desc.trim() || undefined };
    await api.changeRules(init ? { op: "updateSql", rule: { ...rule, id: init.id } } : { op: "addSql", rule });
    onSaved();
  };
  const req = { sql, requires, ruleId: init?.id };

  return (
    <Modal title={init ? `SQL 규칙 수정 · ${init.id}` : "SQL 규칙 추가 (관리자)"} onClose={onClose} dirty={dirty} wide>
      <div style={{ overflow: "auto" }}>
        <div className="form" style={{ maxWidth: "none" }}>
          <p className="hint">DuckDB SQL 로 위반 행을 돌려주는 규칙입니다. SELECT 하나이며 결과 컬럼은 <span className="mono">person_id, row_key, detail</span> 이어야 합니다. 검증 기준일은 <span className="mono">{"{TODAY}"}</span>, 질환 본표는 <span className="mono">{"{DISEASE}"}</span>, 그 키는 <span className="mono">{"{DISEASE_PK}"}</span> 로 쓸 수 있습니다. 저장하면 ADM-### 번호가 붙고 결과물에 '관리자' 규칙으로 기록됩니다.</p>
          <label>규칙 이름<input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <div className="grid c2">
            <label>분류<select value={category} onChange={(e) => setCategory(e.target.value as CustomSqlRule["category"])}><option value="Conformance">적합성</option><option value="Completeness">완전성</option><option value="Plausibility">타당성</option></select></label>
            <label>심각도<select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}><option value="error">오류 (High)</option><option value="warning">경고 (Medium)</option></select></label>
          </div>
          <div>
            <div className="hint" style={{ marginBottom: 4 }}>적용 코호트</div>
            <div className="chips">
              <label className="chip"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> 전체</label>
              {!all && cohorts.map((c) => <label key={c.id} className="chip"><input type="checkbox" checked={scope.includes(c.id)} onChange={() => toggle(scope, setScope, c.id)} /> {c.kor}</label>)}
            </div>
          </div>
          <div>
            <div className="hint" style={{ marginBottom: 4 }}>필요한 테이블 (없는 코호트에서는 건너뜁니다)</div>
            <div className="chips">{tables.map((t) => <label key={t.table} className="chip"><input type="checkbox" checked={requires.includes(t.table)} onChange={() => toggle(requires, setRequires, t.table)} /> {t.table}</label>)}</div>
          </div>
          <label>SQL<textarea className="sql" value={sql} onChange={(e) => { setSql(e.target.value); gate.reset(); }} spellCheck={false} /></label>
          <label>설명 (선택)<input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
          <SqlGateControls gate={gate} cohorts={cohorts} />
          <div className="rowflex" style={{ justifyContent: "flex-end" }}>
            {dirty && <span className="hint" role="status">저장하지 않은 입력이 있습니다</span>}
            <button type="button" className="btn" onClick={() => { if (confirmDiscard(dirty)) onClose(); }}>취소</button>
            <button className="btn" disabled={gate.busy} onClick={() => void gate.test(req)}>시험 실행</button>
            {gate.needsConfirm
              ? <button className="btn danger" disabled={gate.busy} onClick={() => void gate.testThenSave(req, save, true)}>확인하고 저장</button>
              : <button className="btn primary" disabled={gate.busy} onClick={() => void gate.testThenSave(req, save)}>시험 후 저장</button>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ 변경 이력
const ACTION_LABELS: Record<string, string> = {
  disable: "끔", enable: "켬", severity: "심각도 변경", params: "값 변경", sql: "SQL 변경", add_custom: "사용자 규칙 추가", update_custom: "사용자 규칙 수정", remove_custom: "사용자 규칙 삭제",
  add_sql: "SQL 규칙 추가", update_sql: "SQL 규칙 수정", remove_sql: "SQL 규칙 삭제", reset_rule: "표준으로 되돌림", reset_all: "전체를 표준으로 되돌림", import: "설정 가져오기",
  admin_on: "관리자 모드 켬", admin_off: "관리자 모드 끔", invalid_overrides: "깨진 설정 파일 치움",
};

export function HistoryModal({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<RuleHistoryEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.getRuleHistory(500).then(setRows).catch((e) => setErr(errText(e))); }, []);
  return (
    <Modal title="규칙 변경 이력" onClose={onClose} wide>
      <p className="hint">이 PC 의 <span className="mono">rule-history.jsonl</span> 에 남은 기록입니다 (최근 500건). 바꾸기 전과 후의 값이 SQL 까지 그대로 들어 있습니다. 이 PC 의 일반 파일이라 위·변조를 막는 감사 기록이 아니며, '관리자' 표시는 인증된 신원이 아니라 관리자 모드였다는 뜻입니다.</p>
      {err && <div className="callout err" role="alert">{err}</div>}
      <div className="tblwrap" style={{ maxHeight: "62vh" }}>
        {rows === null && !err ? <div className="loading" role="status">불러오는 중…</div> : rows && rows.length === 0 ? <div className="empty">기록이 없습니다</div> : (
          <table className="tbl">
            <thead><tr><th>시각</th><th>동작</th><th>규칙</th><th>관리자</th><th>바꾸기 전 → 후</th></tr></thead>
            <tbody>{(rows ?? []).map((h, i) => (
              <tr key={i}>
                <td className="nw">{fmtTime(h.ts)}</td><td className="nw">{ACTION_LABELS[h.action] ?? h.action}</td><td className="mono">{h.rule_id || "-"}</td>
                <td>{h.admin_mode ? <span className="pill admin">관리자</span> : ""}</td>
                <td>{h.before === null && h.after === null ? "" : (
                  <details><summary className="hint" style={{ cursor: "pointer" }}>내용 보기</summary>
                    <pre className="mono" style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", maxWidth: 560 }}>{`전: ${JSON.stringify(h.before, null, 1)}\n후: ${JSON.stringify(h.after, null, 1)}`}</pre>
                  </details>
                )}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}
