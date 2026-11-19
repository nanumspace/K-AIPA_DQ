# 데이터 품질 검증 보고서: DIABETES (당뇨병)

검증일 2026-09-07 / 테이블 10개 / 규칙 302개 (실패 0, 건너뜀 49, 오류 0)

위반 0건 (error 0, warning 0)

| 분류 | 규칙 수 | 실패 규칙 | 위반 건수 |
|---|---|---|---|
| Conformance | 197 | 0 | 0 |
| Completeness | 61 | 0 | 0 |
| Plausibility | 44 | 0 | 0 |

## 테이블 행수

- PERSON: 100
- VISIT_OCCURRENCE: 1726
- PROCEDURE_OCCURRENCE: 462
- DRUG_EXPOSURE: 4816
- CONDITION_OCCURRENCE: 337
- MEASUREMENT: 13538
- OBSERVATION: 100
- NOTE: 1721
- DIABETES: 100
- ADVERSE_EVENT: 39

## 실패 규칙

| 규칙 | 분류 | 심각도 | 테이블 | 위반 |
|---|---|---|---|---|

## 데이터 충실도

있어야 할 기록이 있는 비율이다(규칙 위반과 별개, 충족 판정·목표치 없음). 미충족 단위는 sufficiency.csv(기관 내부용)에 있다.

| 항목 | 단위 | 대상 | 충족 | 비율 | 1인·1년당 중앙값 | <50 | 50-64 | 65+ | 미상 |
|---|---|---|---|---|---|---|---|---|---|
| EXP-COM-01 키 | 환자 | 100 | 100 | 100.0% | - | 22/22 | 46/46 | 32/32 | - |
| EXP-COM-02 체중 | 환자 | 100 | 100 | 100.0% | - | 22/22 | 46/46 | 32/32 | - |
| EXP-DM-01 진단 시 HbA1c | 환자 | 100 | 100 | 100.0% | - | 22/22 | 46/46 | 32/32 | - |
| EXP-DM-02 추적 중 HbA1c (6개월마다) | 환자 | 100 | 100 | 100.0% | 4.3 | 22/22 | 46/46 | 32/32 | - |
| EXP-DM-03 연 1회 혈압·신기능·지질·체중 | 환자 | 100 | 75 | 75.0% | - | 16/22 | 37/46 | 22/32 | - |
| EXP-DM-04 연 1회 소변 알부민/크레아티닌비(UACR) | 환자 | 100 | 0 | 0.0% | - | 0/22 | 0/46 | 0/32 | - |
| EXP-DM-05 연 1회 혈압 (수축기·이완기) | 환자 | 100 | 100 | 100.0% | - | 22/22 | 46/46 | 32/32 | - |
| EXP-DM-06 연 1회 신기능 (크레아티닌 또는 eGFR) | 환자 | 100 | 75 | 75.0% | - | 16/22 | 37/46 | 22/32 | - |
| EXP-DM-07 연 1회 지질 (총콜레스테롤 또는 LDL) | 환자 | 100 | 75 | 75.0% | - | 16/22 | 37/46 | 22/32 | - |
| EXP-DM-08 연 1회 체중 또는 BMI | 환자 | 100 | 100 | 100.0% | - | 22/22 | 46/46 | 32/32 | - |

## 표준 용어 매핑률

표준 개념 필드에서 매핑하지 못해 `0` 으로 적재한 비율이다(위반 아님, 규칙 집계와 별개). 대상은 정수로 읽히는 값이고, 빈 값과 정수가 아닌 값은 대상에서 빼고 제외 칸에 따로 센다. `0` 이 맞는 경우(예: 구조식 노트의 분류)도 미매핑에 들어간다.

| 테이블 | 필드 | 행 | 대상 | 매핑 | 미매핑(0) | 미매핑률 | 제외(빈 값·형식 오류) |
|---|---|---|---|---|---|---|---|
| PERSON | gender_concept_id | 100 | 100 | 100 | 0 | 0.0% | 0·0 |
| VISIT_OCCURRENCE | visit_concept_id | 1726 | 1726 | 1726 | 0 | 0.0% | 0·0 |
| VISIT_OCCURRENCE | visit_type_concept_id | 1726 | 1726 | 1726 | 0 | 0.0% | 0·0 |
| PROCEDURE_OCCURRENCE | procedure_concept_id | 462 | 462 | 462 | 0 | 0.0% | 0·0 |
| PROCEDURE_OCCURRENCE | procedure_type_concept_id | 462 | 462 | 462 | 0 | 0.0% | 0·0 |
| DRUG_EXPOSURE | drug_concept_id | 4816 | 4816 | 4816 | 0 | 0.0% | 0·0 |
| DRUG_EXPOSURE | amount_unit_concept_id | 4816 | 4816 | 4816 | 0 | 0.0% | 0·0 |
| DRUG_EXPOSURE | numerator_unit_concept_id | 4816 | 0 | 0 | 0 | - | 4816·0 |
| DRUG_EXPOSURE | denominator_unit_concept_id | 4816 | 0 | 0 | 0 | - | 4816·0 |
| CONDITION_OCCURRENCE | condition_concept_id | 337 | 337 | 337 | 0 | 0.0% | 0·0 |
| CONDITION_OCCURRENCE | condition_type_concept_id | 337 | 337 | 337 | 0 | 0.0% | 0·0 |
| MEASUREMENT | measurement_concept_id | 13538 | 13538 | 13538 | 0 | 0.0% | 0·0 |
| MEASUREMENT | measurement_type_concept_id | 13538 | 13538 | 13538 | 0 | 0.0% | 0·0 |
| MEASUREMENT | value_as_concept_id | 13538 | 0 | 0 | 0 | - | 13538·0 |
| MEASUREMENT | unit_concept_id | 13538 | 13538 | 13538 | 0 | 0.0% | 0·0 |
| OBSERVATION | observation_concept_id | 100 | 100 | 100 | 0 | 0.0% | 0·0 |
| OBSERVATION | observation_type_concept_id | 100 | 100 | 100 | 0 | 0.0% | 0·0 |
| OBSERVATION | unit_concept_id | 100 | 0 | 0 | 0 | - | 100·0 |
| NOTE | note_type_concept_id | 1721 | 1721 | 1721 | 0 | 0.0% | 0·0 |
| NOTE | note_class_concept_id | 1721 | 1721 | 1714 | 7 | 0.4% | 0·0 |
| ADVERSE_EVENT | adverse_event_concept_id | 39 | 39 | 39 | 0 | 0.0% | 0·0 |
