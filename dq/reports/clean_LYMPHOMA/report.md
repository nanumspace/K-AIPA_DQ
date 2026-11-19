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

## 데이터 충실도

있어야 할 기록이 있는 비율이다(규칙 위반과 별개, 충족 판정·목표치 없음). 미충족 단위는 sufficiency.csv(기관 내부용)에 있다.

| 항목 | 단위 | 대상 | 충족 | 비율 | 1인·1년당 중앙값 | <50 | 50-64 | 65+ | 미상 |
|---|---|---|---|---|---|---|---|---|---|
| EXP-COM-01 키 | 환자 | 100 | 100 | 100.0% | - | 22/22 | 40/40 | 38/38 | - |
| EXP-COM-02 체중 | 환자 | 100 | 100 | 100.0% | - | 22/22 | 40/40 | 38/38 | - |
| EXP-COM-03 항암 요법 시작 전 키·체중 | 요법 | 121 | 90 | 74.4% | - | 20/26 | 35/46 | 35/49 | - |
| EXP-COM-04 요법별 수행 상태(ECOG) | 요법 | 121 | 121 | 100.0% | - | 26/26 | 46/46 | 49/49 | - |
| EXP-COM-05 항암 요법 시작 전 혈구검사 | 요법 | 121 | 119 | 98.3% | - | 25/26 | 45/46 | 49/49 | - |
| EXP-LY-01 진단 시 LDH | 환자 | 100 | 100 | 100.0% | - | 22/22 | 40/40 | 38/38 | - |
| EXP-LY-02 IPI 구성요소 (셀 수 있는 것만) | 환자 | 43 | 43 | 100.0% | - | 1/1 | 23/23 | 19/19 | - |
| EXP-LY-03 진단 시 PET-CT 또는 골수 생검 | 환자 | 100 | 100 | 100.0% | - | 22/22 | 40/40 | 38/38 | - |

## 표준 용어 매핑률

표준 개념 필드에서 매핑하지 못해 `0` 으로 적재한 비율이다(위반 아님, 규칙 집계와 별개). 대상은 정수로 읽히는 값이고, 빈 값과 정수가 아닌 값은 대상에서 빼고 제외 칸에 따로 센다. `0` 이 맞는 경우(예: 구조식 노트의 분류)도 미매핑에 들어간다.

| 테이블 | 필드 | 행 | 대상 | 매핑 | 미매핑(0) | 미매핑률 | 제외(빈 값·형식 오류) |
|---|---|---|---|---|---|---|---|
| PERSON | gender_concept_id | 100 | 100 | 100 | 0 | 0.0% | 0·0 |
| VISIT_OCCURRENCE | visit_concept_id | 2236 | 2236 | 2236 | 0 | 0.0% | 0·0 |
| VISIT_OCCURRENCE | visit_type_concept_id | 2236 | 2236 | 2236 | 0 | 0.0% | 0·0 |
| PROCEDURE_OCCURRENCE | procedure_concept_id | 1371 | 1371 | 1371 | 0 | 0.0% | 0·0 |
| PROCEDURE_OCCURRENCE | procedure_type_concept_id | 1371 | 1371 | 1371 | 0 | 0.0% | 0·0 |
| DRUG_EXPOSURE | drug_concept_id | 2869 | 2869 | 2869 | 0 | 0.0% | 0·0 |
| DRUG_EXPOSURE | amount_unit_concept_id | 2869 | 2869 | 2869 | 0 | 0.0% | 0·0 |
| DRUG_EXPOSURE | numerator_unit_concept_id | 2869 | 0 | 0 | 0 | - | 2869·0 |
| DRUG_EXPOSURE | denominator_unit_concept_id | 2869 | 0 | 0 | 0 | - | 2869·0 |
| CONDITION_OCCURRENCE | condition_concept_id | 401 | 401 | 401 | 0 | 0.0% | 0·0 |
| CONDITION_OCCURRENCE | condition_type_concept_id | 401 | 401 | 401 | 0 | 0.0% | 0·0 |
| MEASUREMENT | measurement_concept_id | 8105 | 8105 | 8105 | 0 | 0.0% | 0·0 |
| MEASUREMENT | measurement_type_concept_id | 8105 | 8105 | 8105 | 0 | 0.0% | 0·0 |
| MEASUREMENT | value_as_concept_id | 8105 | 0 | 0 | 0 | - | 8105·0 |
| MEASUREMENT | unit_concept_id | 8105 | 8105 | 8105 | 0 | 0.0% | 0·0 |
| OBSERVATION | observation_concept_id | 100 | 100 | 100 | 0 | 0.0% | 0·0 |
| OBSERVATION | observation_type_concept_id | 100 | 100 | 100 | 0 | 0.0% | 0·0 |
| OBSERVATION | unit_concept_id | 100 | 0 | 0 | 0 | - | 100·0 |
| NOTE | note_type_concept_id | 1457 | 1457 | 1457 | 0 | 0.0% | 0·0 |
| NOTE | note_class_concept_id | 1457 | 1457 | 1447 | 10 | 0.7% | 0·0 |
| ADVERSE_EVENT | adverse_event_concept_id | 248 | 248 | 248 | 0 | 0.0% | 0·0 |
| SACT | regimen_concept_id | 121 | 121 | 119 | 2 | 1.7% | 0·0 |
