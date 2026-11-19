# 데이터 품질 검증 보고서: LYMPHOMA (림프종)

검증일 2026-09-07 / 테이블 11개 / 규칙 329개 (실패 1, 건너뜀 43, 오류 0)

위반 7건 (error 0, warning 7)

| 분류 | 규칙 수 | 실패 규칙 | 위반 건수 |
|---|---|---|---|
| Conformance | 216 | 0 | 0 |
| Completeness | 67 | 0 | 0 |
| Plausibility | 46 | 1 | 7 |

## 테이블 행수

- PERSON: 100
- VISIT_OCCURRENCE: 2236
- PROCEDURE_OCCURRENCE: 1371
- DRUG_EXPOSURE: 2869
- CONDITION_OCCURRENCE: 401
- MEASUREMENT: 8105
- OBSERVATION: 100
- NOTE: 1457
- LYMPHOMA: 100
- ADVERSE_EVENT: 248
- SACT: 121

## 실패 규칙

| 규칙 | 분류 | 심각도 | 테이블 | 위반 |
|---|---|---|---|---|
| SEM-SACT-006 항암요법 line 번호와 시작일 순서 확인 | Plausibility | warning | SACT | 7 |
