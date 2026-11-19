// 표준 용어 매핑률: 표준 개념 필드(명세 concept.standard)에서 0(매핑 실패)이 아닌 값의 비율.
// 위반이 아니며 규칙 집계와 별개다. 참조 구현(dq/engine.py 의 run_mapping)과 같다. 환자 단위 값은 만들지 않는다.
import type { MappingRate, RawTable, Spec } from "./types.js";
import { pct } from "./sufficiency.js";

const INT = /^[+-]?[0-9]+$/;

export function runMapping(spec: Spec, tablesInCohort: string[], raw: Map<string, RawTable>): MappingRate[] {
  const out: MappingRate[] = [];
  for (const t of tablesInCohort) {
    const df = raw.get(t);
    if (!df) continue;
    for (const f of spec.tables[t].fields) {
      const concept = f.concept as { standard?: boolean } | undefined;
      const col = df.cols.get(f.name);
      if (!concept?.standard || !col) continue;
      let blank = 0, eligible = 0, zero = 0;
      for (const v of col) {
        const s = v.trim();
        if (s === "") blank++;
        else if (INT.test(s)) { eligible++; if (Number(s) === 0) zero++; }
      }
      out.push({ table: t, field: f.name, rows: df.n, blank, invalid: df.n - blank - eligible, eligible, mapped: eligible - zero, unmapped: zero });
    }
  }
  return out;
}

/** 보고서의 `## 표준 용어 매핑률` 절 (참조 구현과 글자 단위로 같다) */
export function mappingMd(rates: MappingRate[]): string[] {
  if (!rates.length) return [];
  return ["", "## 표준 용어 매핑률", "",
    "표준 개념 필드에서 매핑하지 못해 `0` 으로 적재한 비율이다(위반 아님, 규칙 집계와 별개). "
    + "대상은 정수로 읽히는 값이고, 빈 값과 정수가 아닌 값은 대상에서 빼고 제외 칸에 따로 센다. "
    + "`0` 이 맞는 경우(예: 구조식 노트의 분류)도 미매핑에 들어간다.", "",
    "| 테이블 | 필드 | 행 | 대상 | 매핑 | 미매핑(0) | 미매핑률 | 제외(빈 값·형식 오류) |", "|---|---|---|---|---|---|---|---|",
    ...rates.map((m) => `| ${m.table} | ${m.field} | ${m.rows} | ${m.eligible} | ${m.mapped} | ${m.unmapped} | ${pct(m.unmapped, m.eligible)} | ${m.blank}·${m.invalid} |`)];
}
