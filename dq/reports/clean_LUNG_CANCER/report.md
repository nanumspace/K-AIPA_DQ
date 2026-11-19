# 데이터 품질 검증 보고서: LUNG_CANCER (폐암)

검증일 2026-09-07 / 테이블 11개 / 규칙 328개 (실패 0, 건너뜀 43, 오류 0)

위반 0건 (error 0, warning 0)

| 분류 | 규칙 수 | 실패 규칙 | 위반 건수 |
|---|---|---|---|
| Conformance | 215 | 0 | 0 |
| Completeness | 69 | 0 | 0 |
| Plausibility | 44 | 0 | 0 |

## 테이블 행수

- PERSON: 100
- VISIT_OCCURRENCE: 2627
- PROCEDURE_OCCURRENCE: 1182
- DRUG_EXPOSURE: 2671
- CONDITION_OCCURRENCE: 574
- MEASUREMENT: 12680
- OBSERVATION: 200
- NOTE: 1993
- LUNG_CANCER: 100
- ADVERSE_EVENT: 311
- SACT: 142

## 실패 규칙

| 규칙 | 분류 | 심각도 | 테이블 | 위반 |
|---|---|---|---|---|

## 데이터 충실도

있어야 할 기록이 있는 비율이다(규칙 위반과 별개, 충족 판정·목표치 없음). 미충족 단위는 sufficiency.csv(기관 내부용)에 있다.

| 항목 | 단위 | 대상 | 충족 | 비율 | 1인·1년당 중앙값 | <50 | 50-64 | 65+ | 미상 |
|---|---|---|---|---|---|---|---|---|---|
| EXP-COM-01 키 | 환자 | 100 | 100 | 100.0% | - | 2/2 | 44/44 | 54/54 | - |
| EXP-COM-02 체중 | 환자 | 100 | 100 | 100.0% | - | 2/2 | 44/44 | 54/54 | - |
| EXP-COM-03 항암 요법 시작 전 키·체중 | 요법 | 142 | 61 | 43.0% | - | 1/5 | 25/53 | 35/84 | - |
| EXP-COM-04 요법별 수행 상태(ECOG) | 요법 | 142 | 142 | 100.0% | - | 5/5 | 53/53 | 84/84 | - |
| EXP-COM-05 항암 요법 시작 전 혈구검사 | 요법 | 142 | 142 | 100.0% | - | 5/5 | 53/53 | 84/84 | - |
| EXP-LC-01 EGFR·ALK 검사 결과 | 환자 | 23 | 23 | 100.0% | - | 1/1 | 9/9 | 13/13 | - |
| EXP-LC-02 진단 시 흉부 CT | 환자 | 100 | 100 | 100.0% | - | 2/2 | 44/44 | 54/54 | - |

## 표준 용어 매핑률

표준 개념 필드에서 매핑하지 못해 `0` 으로 적재한 비율이다(위반 아님, 규칙 집계와 별개). 대상은 정수로 읽히는 값이고, 빈 값과 정수가 아닌 값은 대상에서 빼고 제외 칸에 따로 센다. `0` 이 맞는 경우(예: 구조식 노트의 분류)도 미매핑에 들어간다.

| 테이블 | 필드 | 행 | 대상 | 매핑 | 미매핑(0) | 미매핑률 | 제외(빈 값·형식 오류) |
|---|---|---|---|---|---|---|---|
| PERSON | gender_concept_id | 100 | 100 | 100 | 0 | 0.0% | 0·0 |
| VISIT_OCCURRENCE | visit_concept_id | 2627 | 2627 | 2627 | 0 | 0.0% | 0·0 |
| VISIT_OCCURRENCE | visit_type_concept_id | 2627 | 2627 | 2627 | 0 | 0.0% | 0·0 |
| PROCEDURE_OCCURRENCE | procedure_concept_id | 1182 | 1182 | 1182 | 0 | 0.0% | 0·0 |
| PROCEDURE_OCCURRENCE | procedure_type_concept_id | 1182 | 1182 | 1182 | 0 | 0.0% | 0·0 |
| DRUG_EXPOSURE | drug_concept_id | 2671 | 2671 | 2671 | 0 | 0.0% | 0·0 |
| DRUG_EXPOSURE | amount_unit_concept_id | 2671 | 2671 | 2671 | 0 | 0.0% | 0·0 |
| DRUG_EXPOSURE | numerator_unit_concept_id | 2671 | 0 | 0 | 0 | - | 2671·0 |
| DRUG_EXPOSURE | denominator_unit_concept_id | 2671 | 0 | 0 | 0 | - | 2671·0 |
| CONDITION_OCCURRENCE | condition_concept_id | 574 | 574 | 574 | 0 | 0.0% | 0·0 |
| CONDITION_OCCURRENCE | condition_type_concept_id | 574 | 574 | 574 | 0 | 0.0% | 0·0 |
| MEASUREMENT | measurement_concept_id | 12680 | 12680 | 12680 | 0 | 0.0% | 0·0 |
| MEASUREMENT | measurement_type_concept_id | 12680 | 12680 | 12680 | 0 | 0.0% | 0·0 |
| MEASUREMENT | value_as_concept_id | 12680 | 156 | 156 | 0 | 0.0% | 12524·0 |
| MEASUREMENT | unit_concept_id | 12680 | 12524 | 12524 | 0 | 0.0% | 156·0 |
| OBSERVATION | observation_concept_id | 200 | 200 | 200 | 0 | 0.0% | 0·0 |
| OBSERVATION | observation_type_concept_id | 200 | 200 | 200 | 0 | 0.0% | 0·0 |
| OBSERVATION | unit_concept_id | 200 | 0 | 0 | 0 | - | 200·0 |
| NOTE | note_type_concept_id | 1993 | 1993 | 1993 | 0 | 0.0% | 0·0 |
| NOTE | note_class_concept_id | 1993 | 1993 | 1983 | 10 | 0.5% | 0·0 |
| ADVERSE_EVENT | adverse_event_concept_id | 311 | 311 | 311 | 0 | 0.0% | 0·0 |
| SACT | regimen_concept_id | 142 | 142 | 121 | 21 | 14.8% | 0·0 |
