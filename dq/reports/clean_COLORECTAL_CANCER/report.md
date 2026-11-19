# 데이터 품질 검증 보고서: COLORECTAL_CANCER (대장암)

검증일 2026-09-07 / 테이블 11개 / 규칙 323개 (실패 1, 건너뜀 43, 오류 0)

위반 14건 (error 0, warning 14)

| 분류 | 규칙 수 | 실패 규칙 | 위반 건수 |
|---|---|---|---|
| Conformance | 211 | 0 | 0 |
| Completeness | 67 | 0 | 0 |
| Plausibility | 45 | 1 | 14 |

## 테이블 행수

- PERSON: 100
- VISIT_OCCURRENCE: 2749
- PROCEDURE_OCCURRENCE: 1879
- DRUG_EXPOSURE: 3177
- CONDITION_OCCURRENCE: 557
- MEASUREMENT: 9944
- OBSERVATION: 126
- NOTE: 2296
- COLORECTAL_CANCER: 100
- ADVERSE_EVENT: 392
- SACT: 116

## 실패 규칙

| 규칙 | 분류 | 심각도 | 테이블 | 위반 |
|---|---|---|---|---|
| SEM-SACT-006 항암요법 line 번호와 시작일 순서 확인 | Plausibility | warning | SACT | 14 |

## 데이터 충실도

있어야 할 기록이 있는 비율이다(규칙 위반과 별개, 충족 판정·목표치 없음). 미충족 단위는 sufficiency.csv(기관 내부용)에 있다.

| 항목 | 단위 | 대상 | 충족 | 비율 | 1인·1년당 중앙값 | <50 | 50-64 | 65+ | 미상 |
|---|---|---|---|---|---|---|---|---|---|
| EXP-COM-01 키 | 환자 | 100 | 100 | 100.0% | - | 7/7 | 42/42 | 51/51 | - |
| EXP-COM-02 체중 | 환자 | 100 | 100 | 100.0% | - | 7/7 | 42/42 | 51/51 | - |
| EXP-COM-03 항암 요법 시작 전 키·체중 | 요법 | 116 | 20 | 17.2% | - | 1/7 | 11/51 | 8/58 | - |
| EXP-COM-04 요법별 수행 상태(ECOG) | 요법 | 116 | 116 | 100.0% | - | 7/7 | 51/51 | 58/58 | - |
| EXP-COM-05 항암 요법 시작 전 혈구검사 | 요법 | 116 | 116 | 100.0% | - | 7/7 | 51/51 | 58/58 | - |
| EXP-CRC-01 MMR 또는 MSI 검사 결과 | 환자 | 100 | 100 | 100.0% | - | 7/7 | 42/42 | 51/51 | - |
| EXP-CRC-02 진단 시 CEA | 환자 | 100 | 100 | 100.0% | - | 7/7 | 42/42 | 51/51 | - |
| EXP-CRC-03 전이성 대장암의 RAS 검사 결과 | 환자 | 32 | 32 | 100.0% | - | 2/2 | 12/12 | 18/18 | - |

## 표준 용어 매핑률

표준 개념 필드에서 매핑하지 못해 `0` 으로 적재한 비율이다(위반 아님, 규칙 집계와 별개). 대상은 정수로 읽히는 값이고, 빈 값과 정수가 아닌 값은 대상에서 빼고 제외 칸에 따로 센다. `0` 이 맞는 경우(예: 구조식 노트의 분류)도 미매핑에 들어간다.

| 테이블 | 필드 | 행 | 대상 | 매핑 | 미매핑(0) | 미매핑률 | 제외(빈 값·형식 오류) |
|---|---|---|---|---|---|---|---|
| PERSON | gender_concept_id | 100 | 100 | 100 | 0 | 0.0% | 0·0 |
| VISIT_OCCURRENCE | visit_concept_id | 2749 | 2749 | 2749 | 0 | 0.0% | 0·0 |
| VISIT_OCCURRENCE | visit_type_concept_id | 2749 | 2749 | 2749 | 0 | 0.0% | 0·0 |
| PROCEDURE_OCCURRENCE | procedure_concept_id | 1879 | 1879 | 1879 | 0 | 0.0% | 0·0 |
| PROCEDURE_OCCURRENCE | procedure_type_concept_id | 1879 | 1879 | 1879 | 0 | 0.0% | 0·0 |
| DRUG_EXPOSURE | drug_concept_id | 3177 | 3177 | 3177 | 0 | 0.0% | 0·0 |
| DRUG_EXPOSURE | amount_unit_concept_id | 3177 | 3177 | 3177 | 0 | 0.0% | 0·0 |
| DRUG_EXPOSURE | numerator_unit_concept_id | 3177 | 0 | 0 | 0 | - | 3177·0 |
| DRUG_EXPOSURE | denominator_unit_concept_id | 3177 | 0 | 0 | 0 | - | 3177·0 |
| CONDITION_OCCURRENCE | condition_concept_id | 557 | 557 | 557 | 0 | 0.0% | 0·0 |
| CONDITION_OCCURRENCE | condition_type_concept_id | 557 | 557 | 557 | 0 | 0.0% | 0·0 |
| MEASUREMENT | measurement_concept_id | 9944 | 9944 | 9944 | 0 | 0.0% | 0·0 |
| MEASUREMENT | measurement_type_concept_id | 9944 | 9944 | 9944 | 0 | 0.0% | 0·0 |
| MEASUREMENT | value_as_concept_id | 9944 | 168 | 168 | 0 | 0.0% | 9776·0 |
| MEASUREMENT | unit_concept_id | 9944 | 9776 | 9776 | 0 | 0.0% | 168·0 |
| OBSERVATION | observation_concept_id | 126 | 126 | 126 | 0 | 0.0% | 0·0 |
| OBSERVATION | observation_type_concept_id | 126 | 126 | 126 | 0 | 0.0% | 0·0 |
| OBSERVATION | unit_concept_id | 126 | 0 | 0 | 0 | - | 126·0 |
| NOTE | note_type_concept_id | 2296 | 2296 | 2296 | 0 | 0.0% | 0·0 |
| NOTE | note_class_concept_id | 2296 | 2296 | 2289 | 7 | 0.3% | 0·0 |
| ADVERSE_EVENT | adverse_event_concept_id | 392 | 392 | 392 | 0 | 0.0% | 0·0 |
| SACT | regimen_concept_id | 116 | 116 | 116 | 0 | 0.0% | 0·0 |
