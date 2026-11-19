# 데이터 품질 검증 보고서: LUNG_CANCER (폐암)

검증일 2026-09-07 / 테이블 11개 / 규칙 334개 (실패 0, 건너뜀 43, 오류 0)

위반 0건 (error 0, warning 0)

| 분류 | 규칙 수 | 실패 규칙 | 위반 건수 |
|---|---|---|---|
| Conformance | 215 | 0 | 0 |
| Completeness | 70 | 0 | 0 |
| Plausibility | 49 | 0 | 0 |

## 테이블 행수

- PERSON: 1
- VISIT_OCCURRENCE: 48
- PROCEDURE_OCCURRENCE: 6
- DRUG_EXPOSURE: 39
- CONDITION_OCCURRENCE: 6
- MEASUREMENT: 294
- OBSERVATION: 2
- NOTE: 7
- LUNG_CANCER: 1
- ADVERSE_EVENT: 5
- SACT: 1

## 실패 규칙

| 규칙 | 분류 | 심각도 | 테이블 | 위반 |
|---|---|---|---|---|

## 데이터 충실도

있어야 할 기록이 있는 비율이다(규칙 위반과 별개, 충족 판정·목표치 없음). 미충족 단위는 sufficiency.csv(기관 내부용)에 있다.

| 항목 | 단위 | 대상 | 충족 | 비율 | 1인·1년당 중앙값 | <50 | 50-64 | 65+ | 미상 |
|---|---|---|---|---|---|---|---|---|---|
| EXP-COM-01 키 | 환자 | 1 | 1 | 100.0% | - | - | - | 1/1 | - |
| EXP-COM-02 체중 | 환자 | 1 | 1 | 100.0% | - | - | - | 1/1 | - |
| EXP-COM-03 항암 요법 시작 전 키·체중 | 요법 | 1 | 0 | 0.0% | - | - | - | 0/1 | - |
| EXP-COM-04 요법별 수행 상태(ECOG) | 요법 | 1 | 1 | 100.0% | - | - | - | 1/1 | - |
| EXP-COM-05 항암 요법 시작 전 혈구검사 | 요법 | 1 | 1 | 100.0% | - | - | - | 1/1 | - |
| EXP-LC-01 EGFR·ALK 검사 결과 | 환자 | 0 | 0 | - | - | - | - | - | - |
| EXP-LC-03 첫 요법 전 EGFR 결과 | 환자 | 0 | 0 | - | - | - | - | - | - |
| EXP-LC-04 첫 요법 전 ALK 결과 | 환자 | 0 | 0 | - | - | - | - | - | - |
| EXP-LC-05 EGFR 표준 결과 coverage | 환자 | 0 | 0 | - | - | - | - | - | - |
| EXP-LC-06 ALK 표준 결과 coverage | 환자 | 0 | 0 | - | - | - | - | - | - |
| EXP-LC-02 진단 시 흉부 CT | 환자 | 1 | 1 | 100.0% | - | - | - | 1/1 | - |

## 표준 용어 매핑률

표준 개념 필드에서 매핑하지 못해 `0` 으로 적재한 비율이다(위반 아님, 규칙 집계와 별개). 대상은 정수로 읽히는 값이고, 빈 값과 정수가 아닌 값은 대상에서 빼고 제외 칸에 따로 센다. `0` 이 맞는 경우(예: 구조식 노트의 분류)도 미매핑에 들어간다.

| 테이블 | 필드 | 행 | 대상 | 매핑 | 미매핑(0) | 미매핑률 | 제외(빈 값·형식 오류) |
|---|---|---|---|---|---|---|---|
| PERSON | gender_concept_id | 1 | 1 | 1 | 0 | 0.0% | 0·0 |
| VISIT_OCCURRENCE | visit_concept_id | 48 | 48 | 48 | 0 | 0.0% | 0·0 |
| VISIT_OCCURRENCE | visit_type_concept_id | 48 | 48 | 48 | 0 | 0.0% | 0·0 |
| PROCEDURE_OCCURRENCE | procedure_concept_id | 6 | 6 | 6 | 0 | 0.0% | 0·0 |
| PROCEDURE_OCCURRENCE | procedure_type_concept_id | 6 | 6 | 6 | 0 | 0.0% | 0·0 |
| DRUG_EXPOSURE | drug_concept_id | 39 | 39 | 39 | 0 | 0.0% | 0·0 |
| DRUG_EXPOSURE | amount_unit_concept_id | 39 | 39 | 39 | 0 | 0.0% | 0·0 |
| DRUG_EXPOSURE | numerator_unit_concept_id | 39 | 0 | 0 | 0 | - | 39·0 |
| DRUG_EXPOSURE | denominator_unit_concept_id | 39 | 0 | 0 | 0 | - | 39·0 |
| CONDITION_OCCURRENCE | condition_concept_id | 6 | 6 | 6 | 0 | 0.0% | 0·0 |
| CONDITION_OCCURRENCE | condition_type_concept_id | 6 | 6 | 6 | 0 | 0.0% | 0·0 |
| MEASUREMENT | measurement_concept_id | 294 | 294 | 294 | 0 | 0.0% | 0·0 |
| MEASUREMENT | measurement_type_concept_id | 294 | 294 | 294 | 0 | 0.0% | 0·0 |
| MEASUREMENT | value_as_concept_id | 294 | 2 | 2 | 0 | 0.0% | 292·0 |
| MEASUREMENT | unit_concept_id | 294 | 292 | 292 | 0 | 0.0% | 2·0 |
| OBSERVATION | observation_concept_id | 2 | 2 | 2 | 0 | 0.0% | 0·0 |
| OBSERVATION | observation_type_concept_id | 2 | 2 | 2 | 0 | 0.0% | 0·0 |
| OBSERVATION | unit_concept_id | 2 | 0 | 0 | 0 | - | 2·0 |
| NOTE | note_type_concept_id | 7 | 7 | 7 | 0 | 0.0% | 0·0 |
| NOTE | note_class_concept_id | 7 | 7 | 6 | 1 | 14.3% | 0·0 |
| ADVERSE_EVENT | adverse_event_concept_id | 5 | 5 | 5 | 0 | 0.0% | 0·0 |
| SACT | regimen_concept_id | 1 | 1 | 1 | 0 | 0.0% | 0·0 |
