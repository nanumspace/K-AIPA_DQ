# 데이터 품질 검증 보고서: BREAST_CANCER (유방암)

검증일 2026-09-07 / 테이블 11개 / 규칙 341개 (실패 1, 건너뜀 43, 오류 0)

위반 7건 (error 0, warning 7)

| 분류 | 규칙 수 | 실패 규칙 | 위반 건수 |
|---|---|---|---|
| Conformance | 223 | 0 | 0 |
| Completeness | 72 | 0 | 0 |
| Plausibility | 46 | 1 | 7 |

## 테이블 행수

- PERSON: 100
- VISIT_OCCURRENCE: 3547
- PROCEDURE_OCCURRENCE: 894
- DRUG_EXPOSURE: 3308
- CONDITION_OCCURRENCE: 506
- MEASUREMENT: 10707
- OBSERVATION: 100
- NOTE: 1472
- BREAST_CANCER: 100
- ADVERSE_EVENT: 362
- SACT: 181

## 실패 규칙

| 규칙 | 분류 | 심각도 | 테이블 | 위반 |
|---|---|---|---|---|
| SEM-MEAS-006 같은 검사 결과가 PK만 다르게 중복된 후보 | Plausibility | warning | MEASUREMENT | 7 |

## 데이터 충실도

있어야 할 기록이 있는 비율이다(규칙 위반과 별개, 충족 판정·목표치 없음). 미충족 단위는 sufficiency.csv(기관 내부용)에 있다.

| 항목 | 단위 | 대상 | 충족 | 비율 | 1인·1년당 중앙값 | <50 | 50-64 | 65+ | 미상 |
|---|---|---|---|---|---|---|---|---|---|
| EXP-COM-01 키 | 환자 | 100 | 100 | 100.0% | - | 36/36 | 48/48 | 16/16 | - |
| EXP-COM-02 체중 | 환자 | 100 | 100 | 100.0% | - | 36/36 | 48/48 | 16/16 | - |
| EXP-COM-03 항암 요법 시작 전 키·체중 | 요법 | 181 | 33 | 18.2% | - | 10/64 | 20/89 | 3/28 | - |
| EXP-COM-04 요법별 수행 상태(ECOG) | 요법 | 181 | 181 | 100.0% | - | 64/64 | 89/89 | 28/28 | - |
| EXP-COM-05 항암 요법 시작 전 혈구검사 | 요법 | 181 | 107 | 59.1% | - | 38/64 | 52/89 | 17/28 | - |
| EXP-BC-01 HER2 검사 결과 | 환자 | 100 | 100 | 100.0% | - | 36/36 | 48/48 | 16/16 | - |
| EXP-BC-02 ER·PR 검사 결과 | 환자 | 100 | 100 | 100.0% | - | 36/36 | 48/48 | 16/16 | - |
| EXP-BC-04 HER2 표준 결과 coverage | 환자 | 100 | 100 | 100.0% | - | 36/36 | 48/48 | 16/16 | - |
| EXP-BC-05 ER 표준 결과 coverage | 환자 | 100 | 100 | 100.0% | - | 36/36 | 48/48 | 16/16 | - |
| EXP-BC-06 PR 표준 결과 coverage | 환자 | 100 | 100 | 100.0% | - | 36/36 | 48/48 | 16/16 | - |
| EXP-BC-03 병기 | 환자 | 100 | 100 | 100.0% | - | 36/36 | 48/48 | 16/16 | - |

## 표준 용어 매핑률

표준 개념 필드에서 매핑하지 못해 `0` 으로 적재한 비율이다(위반 아님, 규칙 집계와 별개). 대상은 정수로 읽히는 값이고, 빈 값과 정수가 아닌 값은 대상에서 빼고 제외 칸에 따로 센다. `0` 이 맞는 경우(예: 구조식 노트의 분류)도 미매핑에 들어간다.

| 테이블 | 필드 | 행 | 대상 | 매핑 | 미매핑(0) | 미매핑률 | 제외(빈 값·형식 오류) |
|---|---|---|---|---|---|---|---|
| PERSON | gender_concept_id | 100 | 100 | 100 | 0 | 0.0% | 0·0 |
| VISIT_OCCURRENCE | visit_concept_id | 3547 | 3547 | 3547 | 0 | 0.0% | 0·0 |
| VISIT_OCCURRENCE | visit_type_concept_id | 3547 | 3547 | 3547 | 0 | 0.0% | 0·0 |
| PROCEDURE_OCCURRENCE | procedure_concept_id | 894 | 894 | 894 | 0 | 0.0% | 0·0 |
| PROCEDURE_OCCURRENCE | procedure_type_concept_id | 894 | 894 | 894 | 0 | 0.0% | 0·0 |
| DRUG_EXPOSURE | drug_concept_id | 3308 | 3308 | 3308 | 0 | 0.0% | 0·0 |
| DRUG_EXPOSURE | amount_unit_concept_id | 3308 | 3308 | 3308 | 0 | 0.0% | 0·0 |
| DRUG_EXPOSURE | numerator_unit_concept_id | 3308 | 0 | 0 | 0 | - | 3308·0 |
| DRUG_EXPOSURE | denominator_unit_concept_id | 3308 | 0 | 0 | 0 | - | 3308·0 |
| CONDITION_OCCURRENCE | condition_concept_id | 506 | 506 | 506 | 0 | 0.0% | 0·0 |
| CONDITION_OCCURRENCE | condition_type_concept_id | 506 | 506 | 506 | 0 | 0.0% | 0·0 |
| MEASUREMENT | measurement_concept_id | 10707 | 10707 | 10707 | 0 | 0.0% | 0·0 |
| MEASUREMENT | measurement_type_concept_id | 10707 | 10707 | 10707 | 0 | 0.0% | 0·0 |
| MEASUREMENT | value_as_concept_id | 10707 | 400 | 400 | 0 | 0.0% | 10307·0 |
| MEASUREMENT | unit_concept_id | 10707 | 10507 | 10507 | 0 | 0.0% | 200·0 |
| OBSERVATION | observation_concept_id | 100 | 100 | 100 | 0 | 0.0% | 0·0 |
| OBSERVATION | observation_type_concept_id | 100 | 100 | 100 | 0 | 0.0% | 0·0 |
| OBSERVATION | unit_concept_id | 100 | 0 | 0 | 0 | - | 100·0 |
| NOTE | note_type_concept_id | 1472 | 1472 | 1472 | 0 | 0.0% | 0·0 |
| NOTE | note_class_concept_id | 1472 | 1472 | 1460 | 12 | 0.8% | 0·0 |
| ADVERSE_EVENT | adverse_event_concept_id | 362 | 362 | 362 | 0 | 0.0% | 0·0 |
| SACT | regimen_concept_id | 181 | 181 | 173 | 8 | 4.4% | 0·0 |
