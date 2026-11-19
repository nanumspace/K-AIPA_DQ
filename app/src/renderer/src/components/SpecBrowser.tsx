import { useMemo, useState } from 'react';
import type { RuleInfo, SpecTableInfo } from '@shared/types';
import { Card } from './ui';

export function SpecBrowser({ tables, rules, onRule }: { tables: SpecTableInfo[]; rules: RuleInfo[]; onRule: (id: string) => void }) {
  const [table, setTable] = useState('');
  const [query, setQuery] = useState('');
  const selected = tables.find((t) => t.table === table) ?? tables[0];
  const fields = useMemo(() => selected?.fields.filter((f) => `${f.name} ${f.desc} ${f.codelist ?? ''}`.toLowerCase().includes(query.toLowerCase())) ?? [], [selected, query]);
  return <Card title="적용 명세" sub="현재 기준 패키지의 명세입니다. 필드별 규칙을 선택하면 기존 규칙 관리 화면에서 기관 조정을 확인·편집합니다.">
    <div className="filters"><label className="field-label">테이블<select value={selected?.table ?? ''} onChange={(e) => setTable(e.target.value)}>{tables.map((t) => <option value={t.table} key={t.table}>{t.table} · {t.kor}</option>)}</select></label><label className="field-label">컬럼·설명 검색<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="컬럼명, 설명, 코드표명" /></label></div>
    {selected && <p>{selected.kor} · {selected.fields.length}개 컬럼 · 필수 {selected.fields.filter((f) => f.required).length}개{selected.optional ? ' · 선택 테이블(매뉴얼 보완): 내면 개념 ID 를 표준 용어와 대조합니다' : ''}</p>}
    <div className="table-wrap"><table><thead><tr><th>컬럼 · 자료형</th><th>필수</th><th>명세 설명 · 허용 조건</th><th>연결된 규칙</th></tr></thead><tbody>{fields.map((f) => {
      const related = rules.filter((r) => r.table.split(',').includes(selected.table) && (r.kind === 'semantic' || r.fields.split(',').map((s) => s.trim()).includes(f.name)));
      return <tr key={f.name}><td><b className="mono">{f.name}</b><div>{f.type}</div>{f.optional && <div>선택 컬럼(매뉴얼 보완)</div>}</td><td>{f.required ? 'Y' : 'N'}</td><td style={{ maxWidth: 620, whiteSpace: 'normal' }}>{f.desc || '설명 없음'}{f.range && <div>범위: {f.range.join(' ~ ')}</div>}{f.ref && <div>참조: {f.ref}</div>}{f.codelist && <details><summary>허용 코드 · {f.codelist} ({f.codes.length}개)</summary><div style={{ overflowWrap: 'anywhere' }}>{f.codes.join(', ') || '코드표에 정의된 값 없음'}</div></details>}</td><td style={{ maxWidth: 300, whiteSpace: 'normal' }}>{related.length ? related.map((r) => <button type="button" className="btn sm" style={{ margin: 2 }} key={r.id} title={r.name} onClick={() => onRule(r.id)}>{r.id}{r.disabled ? ' (꺼짐)' : r.origin !== 'standard' ? ' (조정됨)' : ''}</button>) : '연결된 규칙 없음'}</td></tr>;
    })}</tbody></table></div>
    {!fields.length && <p role="status">검색 조건에 맞는 컬럼이 없습니다.</p>}
  </Card>;
}
