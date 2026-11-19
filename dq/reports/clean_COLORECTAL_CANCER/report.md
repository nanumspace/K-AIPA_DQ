# 데이터 품질 검증 보고서: COLORECTAL_CANCER (대장암)

검증일 2026-09-07 / 테이블 11개 / 규칙 320개 (실패 1, 건너뜀 43, 오류 0)

위반 14건 (error 0, warning 14)

| 분류 | 규칙 수 | 실패 규칙 | 위반 건수 |
|---|---|---|---|
| Conformance | 211 | 0 | 0 |
| Completeness | 66 | 0 | 0 |
| Plausibility | 43 | 1 | 14 |

## 테이블 행수

- PERSON: 100
- VISIT_OCCURRENCE: 2749
- PROCEDURE_OCCURRENCE: 1879
- DRUG_EXPOSURE: 3177
- CONDITION_OCCURRENCE: 557
- MEASUREMENT: 9776
- OBSERVATION: 126
- NOTE: 2296
- COLORECTAL_CANCER: 100
- ADVERSE_EVENT: 392
- SACT: 116

## 실패 규칙

| 규칙 | 분류 | 심각도 | 테이블 | 위반 |
|---|---|---|---|---|
| SEM-SACT-006 항암요법 line 번호와 시작일 순서 확인 | Plausibility | warning | SACT | 14 |
