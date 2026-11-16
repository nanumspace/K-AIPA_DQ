import { useEffect, useRef, useState } from 'react';
import type { CriteriaInfo, CriteriaPreview } from '@shared/criteria';
import { api, errText } from '../api';
import { Card } from './ui';

export function CriteriaCard({ onApplied }: { onApplied: () => void }) {
  const [info, setInfo] = useState<CriteriaInfo | null>(null);
  const [preview, setPreview] = useState<CriteriaPreview | null>(null);
  const pending = useRef<string | null>(null);
  const [reset, setReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = () => api.getCriteria().then(setInfo).catch((e) => setError(errText(e)));
  useEffect(() => { void load(); return () => { if (pending.current) void api.cancelCriteria(pending.current); }; }, []);
  async function choose() {
    setBusy(true); setError(''); setMessage('');
    try { const p = await api.previewCriteria(); if (p) { pending.current = p.token; setPreview(p); setReset(false); } }
    catch (e) { setError(errText(e)); }
    finally { setBusy(false); }
  }
  async function cancel() {
    if (!preview) return;
    setBusy(true);
    try { await api.cancelCriteria(preview.token); pending.current = null; setPreview(null); setReset(false); }
    catch (e) { setError(errText(e)); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!preview) return;
    if (preview.conflicts.length && !window.confirm('기관 조정을 모두 초기화하고 새 기준을 적용합니다. 기존 조정 내용은 변경 이력에 남습니다. 계속할까요?')) return;
    setBusy(true); setError('');
    try { setInfo(await api.applyCriteria(preview.token, reset)); pending.current = null; setPreview(null); setReset(false); setMessage('검증 기준을 적용했습니다. 다음 실행부터 새 기준을 사용하며 과거 결과는 바뀌지 않습니다.'); onApplied(); }
    catch (e) { setError(errText(e)); }
    finally { setBusy(false); }
  }
  async function exportPackage() {
    setBusy(true); setError(''); setMessage('');
    try { const file = await api.exportCriteria(); if (file) setMessage(`기준 패키지를 저장했습니다: ${file}`); }
    catch (e) { setError(errText(e)); }
    finally { setBusy(false); }
  }
  const shown = preview?.info;
  return <Card title="검증 기준 패키지" sub="내장 기준으로 바로 검증할 수 있습니다. 중앙에서 받은 기준은 ZIP 파일 하나로 가져옵니다. 기관별 규칙 조정은 ‘검증 규칙 관리’에서 합니다.">
    {error && <div className="callout err" role="alert">{error}<button className="btn sm" onClick={() => { setError(''); void load(); }}>다시 읽기</button></div>}
    {message && <div className="callout" role="status">{message}</div>}
    {info && <div className="kv">
      <span className="k">현재 기준</span><span>{info.manifest.name} · {info.manifest.version} ({info.source === 'builtin' ? '내장' : '가져온 기준'})</span>
      <span className="k">기준 매뉴얼</span><span>{info.manifest.manual}</span>
      <span className="k">배포자 표기</span><span>{info.manifest.publisher}</span>
      <span className="k">구성</span><span>테이블 {info.tables}개 · 컬럼 {info.fields}개 · 규칙 {info.rules}개 · 코호트 {info.cohorts.length}개</span>
      <span className="k">기준 지문</span><span className="mono" style={{ overflowWrap: 'anywhere' }}>{info.hash}</span>
    </div>}
    <p className="hint">배포자 표기와 지문은 출처를 인증하지 않습니다. 사업 공식 배포 경로에서 받은 파일인지 확인하세요. 환자 데이터나 기관 조정은 기준 패키지에 포함되지 않습니다.</p>
    <div className="actions"><button className="btn primary" disabled={busy || !!preview} onClick={() => void choose()}>기준 패키지 가져오기</button><button className="btn" disabled={busy || !info || !!preview} onClick={() => void exportPackage()}>현재 기준 패키지 내보내기</button></div>
    {preview && shown && <section aria-label="검증 기준 변경 미리보기" style={{ marginTop: 16 }}>
      <h3>적용 전 확인</h3><p>{shown.manifest.name} · {shown.manifest.version} · 매뉴얼 {shown.manifest.manual} · 배포자 표기: {shown.manifest.publisher}</p>
      <p>테이블 {shown.tables}개 · 컬럼 {shown.fields}개 · 규칙 {shown.rules}개 · 코호트 {shown.cohorts.length}개</p>
      <div style={{ maxHeight: 250, overflow: 'auto' }}><ul>{preview.changes.map((c, i) => <li key={i}>{c}</li>)}</ul></div>
      {preview.conflicts.length ? <div className="callout warn"><b>기관 조정과 충돌합니다.</b><ul>{preview.conflicts.map((c, i) => <li key={i}>{c}</li>)}</ul><p>취소하면 현재 기준과 조정이 유지됩니다. 적용하려면 기관 조정 전체를 초기화해야 합니다.</p><label><input type="checkbox" checked={reset} onChange={(e) => setReset(e.target.checked)} disabled={busy} /> 기관 조정 전체 초기화에 동의합니다</label></div> : <p>{preview.hasOverrides ? '충돌이 없어 기존 기관 조정을 유지합니다.' : '기관 조정 없이 새 기준을 적용합니다.'}</p>}
      <div className="actions"><button className="btn primary" disabled={busy || (!!preview.conflicts.length && !reset)} onClick={() => void apply()}>확인한 기준 적용</button><button className="btn" disabled={busy} onClick={() => void cancel()}>취소</button></div>
    </section>}
    {busy && <p role="status">처리 중…</p>}
  </Card>;
}
