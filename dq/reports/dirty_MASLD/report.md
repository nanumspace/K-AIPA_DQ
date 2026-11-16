# 데이터 품질 검증 보고서: MASLD (대사이상지방간)

검증일 2026-09-07 / 테이블 10개 / 규칙 257개 (실패 199, 건너뜀 9, 오류 0)

위반 1403건 (error 1348, warning 55)

| 분류 | 규칙 수 | 실패 규칙 | 위반 건수 |
|---|---|---|---|
| Conformance | 164 | 125 | 737 |
| Completeness | 53 | 42 | 53 |
| Plausibility | 40 | 32 | 613 |

## 테이블 행수

- PERSON: 100
- VISIT_OCCURRENCE: 1950
- PROCEDURE_OCCURRENCE: 340
- DRUG_EXPOSURE: 3146
- CONDITION_OCCURRENCE: 335
- MEASUREMENT: 10312
- OBSERVATION: 904
- NOTE: 1111
- MASLD: 99
- ADVERSE_EVENT: 13

## 실패 규칙

| 규칙 | 분류 | 심각도 | 테이블 | 위반 |
|---|---|---|---|---|
| ST-0004 PERSON.person_id PK 유일성 | Conformance | error | PERSON | 3 |
| ST-0005 PERSON.person_id 타입(integer) | Conformance | error | PERSON | 1 |
| ST-0006 PERSON.gender_concept_id 필수 | Completeness | error | PERSON | 1 |
| ST-0007 PERSON.gender_concept_id 타입(integer) | Conformance | error | PERSON | 1 |
| ST-0008 PERSON.gender_concept_id 코드표 | Conformance | warning | PERSON | 2 |
| ST-0009 PERSON.year_of_birth 필수 | Completeness | error | PERSON | 1 |
| ST-0010 PERSON.year_of_birth 타입(integer) | Conformance | error | PERSON | 1 |
| ST-0011 PERSON.year_of_birth 범위 | Plausibility | warning | PERSON | 1 |
| ST-0012 PERSON.month_of_birth 타입(integer) | Conformance | error | PERSON | 1 |
| ST-0013 PERSON.month_of_birth 범위 | Plausibility | warning | PERSON | 1 |
| ST-0014 PERSON.day_of_birth 타입(integer) | Conformance | error | PERSON | 1 |
| ST-0015 PERSON.day_of_birth 범위 | Plausibility | warning | PERSON | 1 |
| ST-0016 PERSON.age_at_index 필수 | Completeness | error | PERSON | 1 |
| ST-0017 PERSON.age_at_index 타입(integer) | Conformance | error | PERSON | 1 |
| ST-0018 PERSON.age_at_index 범위 | Plausibility | warning | PERSON | 1 |
| ST-0019 PERSON.care_site_id 필수 | Completeness | error | PERSON | 1 |
| ST-0020 PERSON.care_site_id 타입(integer) | Conformance | error | PERSON | 1 |
| ST-0021 PERSON.observation_period_start_date 타입(date) | Conformance | error | PERSON | 1 |
| ST-0022 PERSON.observation_period_start_date 미래 날짜 금지 | Plausibility | error | PERSON | 1 |
| ST-0023 PERSON.death_date 타입(date) | Conformance | error | PERSON | 1 |
| ST-0024 PERSON.death_date 미래 날짜 금지 | Plausibility | error | PERSON | 1 |
| ST-0027 VISIT_OCCURRENCE 명세 외 컬럼 | Conformance | warning | VISIT_OCCURRENCE | 1 |
| ST-0028 VISIT_OCCURRENCE.visit_occurrence_id PK 유일성 | Conformance | error | VISIT_OCCURRENCE | 3 |
| ST-0029 VISIT_OCCURRENCE.visit_occurrence_id 타입(integer) | Conformance | error | VISIT_OCCURRENCE | 1 |
| ST-0030 VISIT_OCCURRENCE.person_id 필수 | Completeness | error | VISIT_OCCURRENCE | 1 |
| ST-0031 VISIT_OCCURRENCE.person_id 타입(integer) | Conformance | error | VISIT_OCCURRENCE | 1 |
| ST-0032 VISIT_OCCURRENCE.person_id -> PERSON.person_id 참조무결성 | Conformance | error | VISIT_OCCURRENCE | 53 |
| ST-0033 VISIT_OCCURRENCE.visit_concept_id 필수 | Completeness | error | VISIT_OCCURRENCE | 1 |
| ST-0034 VISIT_OCCURRENCE.visit_concept_id 타입(integer) | Conformance | error | VISIT_OCCURRENCE | 1 |
| ST-0035 VISIT_OCCURRENCE.visit_concept_id 코드표 | Conformance | warning | VISIT_OCCURRENCE | 2 |
| ST-0036 VISIT_OCCURRENCE.visit_start_date 필수 | Completeness | error | VISIT_OCCURRENCE | 1 |
| ST-0037 VISIT_OCCURRENCE.visit_start_date 타입(date) | Conformance | error | VISIT_OCCURRENCE | 1 |
| ST-0038 VISIT_OCCURRENCE.visit_start_date 미래 날짜 금지 | Plausibility | error | VISIT_OCCURRENCE | 1 |
| ST-0039 VISIT_OCCURRENCE.visit_end_date 필수 | Completeness | error | VISIT_OCCURRENCE | 1 |
| ST-0040 VISIT_OCCURRENCE.visit_end_date 타입(date) | Conformance | error | VISIT_OCCURRENCE | 1 |
| ST-0041 VISIT_OCCURRENCE.visit_end_date 미래 날짜 금지 | Plausibility | error | VISIT_OCCURRENCE | 1 |
| ST-0042 VISIT_OCCURRENCE.visit_type_concept_id 필수 | Completeness | error | VISIT_OCCURRENCE | 1 |
| ST-0043 VISIT_OCCURRENCE.visit_type_concept_id 타입(integer) | Conformance | error | VISIT_OCCURRENCE | 1 |
| ST-0044 VISIT_OCCURRENCE.visit_type_concept_id 코드표 | Conformance | warning | VISIT_OCCURRENCE | 2 |
| ST-0048 PROCEDURE_OCCURRENCE.procedure_occurrence_id PK 유일성 | Conformance | error | PROCEDURE_OCCURRENCE | 3 |
| ST-0049 PROCEDURE_OCCURRENCE.procedure_occurrence_id 타입(integer) | Conformance | error | PROCEDURE_OCCURRENCE | 1 |
| ST-0050 PROCEDURE_OCCURRENCE.visit_occurrence_id 타입(integer) | Conformance | error | PROCEDURE_OCCURRENCE | 1 |
| ST-0051 PROCEDURE_OCCURRENCE.visit_occurrence_id -> VISIT_OCCURRENCE.visit_occurrence_id 참조무결성 | Conformance | error | PROCEDURE_OCCURRENCE | 1 |
| ST-0052 PROCEDURE_OCCURRENCE.person_id 필수 | Completeness | error | PROCEDURE_OCCURRENCE | 1 |
| ST-0053 PROCEDURE_OCCURRENCE.person_id 타입(integer) | Conformance | error | PROCEDURE_OCCURRENCE | 1 |
| ST-0054 PROCEDURE_OCCURRENCE.person_id -> PERSON.person_id 참조무결성 | Conformance | error | PROCEDURE_OCCURRENCE | 16 |
| ST-0055 PROCEDURE_OCCURRENCE.procedure_concept_id 필수 | Completeness | error | PROCEDURE_OCCURRENCE | 1 |
| ST-0056 PROCEDURE_OCCURRENCE.procedure_concept_id 타입(integer) | Conformance | error | PROCEDURE_OCCURRENCE | 1 |
| ST-0057 PROCEDURE_OCCURRENCE.procedure_date 필수 | Completeness | error | PROCEDURE_OCCURRENCE | 1 |
| ST-0058 PROCEDURE_OCCURRENCE.procedure_date 타입(date) | Conformance | error | PROCEDURE_OCCURRENCE | 1 |
| ST-0059 PROCEDURE_OCCURRENCE.procedure_date 미래 날짜 금지 | Plausibility | error | PROCEDURE_OCCURRENCE | 1 |
| ST-0060 PROCEDURE_OCCURRENCE.procedure_type_concept_id 필수 | Completeness | error | PROCEDURE_OCCURRENCE | 1 |
| ST-0061 PROCEDURE_OCCURRENCE.procedure_type_concept_id 타입(integer) | Conformance | error | PROCEDURE_OCCURRENCE | 1 |
| ST-0062 PROCEDURE_OCCURRENCE.procedure_type_concept_id 코드표 | Conformance | warning | PROCEDURE_OCCURRENCE | 2 |
| ST-0064 DRUG_EXPOSURE 컬럼 구성 | Conformance | error | DRUG_EXPOSURE | 1 |
| ST-0066 DRUG_EXPOSURE.drug_exposure_id PK 유일성 | Conformance | error | DRUG_EXPOSURE | 3 |
| ST-0067 DRUG_EXPOSURE.drug_exposure_id 타입(integer) | Conformance | error | DRUG_EXPOSURE | 1 |
| ST-0068 DRUG_EXPOSURE.visit_occurrence_id 필수 | Completeness | error | DRUG_EXPOSURE | 1 |
| ST-0069 DRUG_EXPOSURE.visit_occurrence_id 타입(integer) | Conformance | error | DRUG_EXPOSURE | 1 |
| ST-0070 DRUG_EXPOSURE.visit_occurrence_id -> VISIT_OCCURRENCE.visit_occurrence_id 참조무결성 | Conformance | error | DRUG_EXPOSURE | 5 |
| ST-0071 DRUG_EXPOSURE.person_id 필수 | Completeness | error | DRUG_EXPOSURE | 1 |
| ST-0072 DRUG_EXPOSURE.person_id 타입(integer) | Conformance | error | DRUG_EXPOSURE | 1 |
| ST-0073 DRUG_EXPOSURE.person_id -> PERSON.person_id 참조무결성 | Conformance | error | DRUG_EXPOSURE | 68 |
| ST-0076 DRUG_EXPOSURE.note_id 타입(integer) | Conformance | error | DRUG_EXPOSURE | 1 |
| ST-0077 DRUG_EXPOSURE.note_id -> NOTE.note_id 참조무결성 | Conformance | error | DRUG_EXPOSURE | 1 |
| ST-0078 DRUG_EXPOSURE.drug_concept_id 필수 | Completeness | error | DRUG_EXPOSURE | 1 |
| ST-0079 DRUG_EXPOSURE.drug_concept_id 타입(integer) | Conformance | error | DRUG_EXPOSURE | 1 |
| ST-0080 DRUG_EXPOSURE.drug_exposure_start_date 필수 | Completeness | error | DRUG_EXPOSURE | 1 |
| ST-0081 DRUG_EXPOSURE.drug_exposure_start_date 타입(date) | Conformance | error | DRUG_EXPOSURE | 1 |
| ST-0082 DRUG_EXPOSURE.drug_exposure_start_date 미래 날짜 금지 | Plausibility | error | DRUG_EXPOSURE | 1 |
| ST-0083 DRUG_EXPOSURE.drug_exposure_end_date 필수 | Completeness | error | DRUG_EXPOSURE | 1 |
| ST-0084 DRUG_EXPOSURE.drug_exposure_end_date 타입(date) | Conformance | error | DRUG_EXPOSURE | 1 |
| ST-0085 DRUG_EXPOSURE.drug_exposure_end_date 미래 날짜 금지 | Plausibility | error | DRUG_EXPOSURE | 1 |
| ST-0086 DRUG_EXPOSURE.days_supply 타입(integer) | Conformance | error | DRUG_EXPOSURE | 1 |
| ST-0087 DRUG_EXPOSURE.days_supply 범위 | Plausibility | warning | DRUG_EXPOSURE | 1 |
| ST-0088 DRUG_EXPOSURE.amount_unit_concept_id 타입(integer) | Conformance | error | DRUG_EXPOSURE | 1 |
| ST-0089 DRUG_EXPOSURE.amount_unit_concept_id 코드표 | Conformance | warning | DRUG_EXPOSURE | 2 |
| ST-0090 DRUG_EXPOSURE.amount_value 타입(float) | Conformance | error | DRUG_EXPOSURE | 1 |
| ST-0091 DRUG_EXPOSURE.amount_value 범위 | Plausibility | warning | DRUG_EXPOSURE | 1 |
| ST-0092 DRUG_EXPOSURE.quantity 타입(float) | Conformance | error | DRUG_EXPOSURE | 1 |
| ST-0093 DRUG_EXPOSURE.quantity 범위 | Plausibility | warning | DRUG_EXPOSURE | 1 |
| ST-0100 DRUG_EXPOSURE.frequency_per_day 타입(integer) | Conformance | error | DRUG_EXPOSURE | 1 |
| ST-0101 DRUG_EXPOSURE.frequency_per_day 범위 | Plausibility | warning | DRUG_EXPOSURE | 1 |
| ST-0102 DRUG_EXPOSURE.dosing_interval_day 타입(integer) | Conformance | error | DRUG_EXPOSURE | 1 |
| ST-0103 DRUG_EXPOSURE.dosing_interval_day 범위 | Plausibility | warning | DRUG_EXPOSURE | 1 |
| ST-0104 DRUG_EXPOSURE.dosing_number 타입(integer) | Conformance | error | DRUG_EXPOSURE | 1 |
| ST-0105 DRUG_EXPOSURE.dosing_number 범위 | Plausibility | warning | DRUG_EXPOSURE | 1 |
| ST-0106 DRUG_EXPOSURE.sact_id 비항암 코호트 NULL | Conformance | error | DRUG_EXPOSURE | 1 |
| ST-0110 CONDITION_OCCURRENCE.condition_occurrence_id PK 유일성 | Conformance | error | CONDITION_OCCURRENCE | 3 |
| ST-0111 CONDITION_OCCURRENCE.condition_occurrence_id 타입(integer) | Conformance | error | CONDITION_OCCURRENCE | 1 |
| ST-0112 CONDITION_OCCURRENCE.visit_occurrence_id 타입(integer) | Conformance | error | CONDITION_OCCURRENCE | 1 |
| ST-0113 CONDITION_OCCURRENCE.visit_occurrence_id -> VISIT_OCCURRENCE.visit_occurrence_id 참조무결성 | Conformance | error | CONDITION_OCCURRENCE | 1 |
| ST-0114 CONDITION_OCCURRENCE.person_id 필수 | Completeness | error | CONDITION_OCCURRENCE | 1 |
| ST-0115 CONDITION_OCCURRENCE.person_id 타입(integer) | Conformance | error | CONDITION_OCCURRENCE | 1 |
| ST-0116 CONDITION_OCCURRENCE.person_id -> PERSON.person_id 참조무결성 | Conformance | error | CONDITION_OCCURRENCE | 10 |
| ST-0117 CONDITION_OCCURRENCE.condition_concept_id 필수 | Completeness | error | CONDITION_OCCURRENCE | 1 |
| ST-0118 CONDITION_OCCURRENCE.condition_concept_id 타입(integer) | Conformance | error | CONDITION_OCCURRENCE | 1 |
| ST-0119 CONDITION_OCCURRENCE.condition_start_date 필수 | Completeness | error | CONDITION_OCCURRENCE | 1 |
| ST-0120 CONDITION_OCCURRENCE.condition_start_date 타입(date) | Conformance | error | CONDITION_OCCURRENCE | 1 |
| ST-0121 CONDITION_OCCURRENCE.condition_start_date 미래 날짜 금지 | Plausibility | error | CONDITION_OCCURRENCE | 1 |
| ST-0122 CONDITION_OCCURRENCE.condition_type_concept_id 필수 | Completeness | error | CONDITION_OCCURRENCE | 1 |
| ST-0123 CONDITION_OCCURRENCE.condition_type_concept_id 타입(integer) | Conformance | error | CONDITION_OCCURRENCE | 1 |
| ST-0124 CONDITION_OCCURRENCE.condition_type_concept_id 코드표 | Conformance | warning | CONDITION_OCCURRENCE | 2 |
| ST-0127 MEASUREMENT 명세 외 컬럼 | Conformance | warning | MEASUREMENT | 1 |
| ST-0128 MEASUREMENT.measurement_id PK 유일성 | Conformance | error | MEASUREMENT | 3 |
| ST-0129 MEASUREMENT.measurement_id 타입(integer) | Conformance | error | MEASUREMENT | 1 |
| ST-0130 MEASUREMENT.visit_occurrence_id 타입(integer) | Conformance | error | MEASUREMENT | 1 |
| ST-0131 MEASUREMENT.visit_occurrence_id -> VISIT_OCCURRENCE.visit_occurrence_id 참조무결성 | Conformance | error | MEASUREMENT | 1 |
| ST-0132 MEASUREMENT.person_id 필수 | Completeness | error | MEASUREMENT | 1 |
| ST-0133 MEASUREMENT.person_id 타입(integer) | Conformance | error | MEASUREMENT | 1 |
| ST-0134 MEASUREMENT.person_id -> PERSON.person_id 참조무결성 | Conformance | error | MEASUREMENT | 315 |
| ST-0135 MEASUREMENT.measurement_concept_id 필수 | Completeness | error | MEASUREMENT | 1 |
| ST-0136 MEASUREMENT.measurement_concept_id 타입(integer) | Conformance | error | MEASUREMENT | 1 |
| ST-0137 MEASUREMENT.measurement_date 타입(date) | Conformance | error | MEASUREMENT | 1 |
| ST-0138 MEASUREMENT.measurement_date 미래 날짜 금지 | Plausibility | error | MEASUREMENT | 1 |
| ST-0139 MEASUREMENT.measurement_type_concept_id 타입(integer) | Conformance | error | MEASUREMENT | 1 |
| ST-0140 MEASUREMENT.measurement_type_concept_id 코드표 | Conformance | warning | MEASUREMENT | 2 |
| ST-0141 MEASUREMENT.value_as_number 타입(float) | Conformance | error | MEASUREMENT | 1 |
| ST-0142 MEASUREMENT.value_as_number 범위 | Plausibility | warning | MEASUREMENT | 1 |
| ST-0144 MEASUREMENT.unit_concept_id 타입(integer) | Conformance | error | MEASUREMENT | 1 |
| ST-0145 MEASUREMENT.unit_concept_id 코드표 | Conformance | warning | MEASUREMENT | 2 |
| ST-0146 MEASUREMENT.range_low 타입(float) | Conformance | error | MEASUREMENT | 1 |
| ST-0147 MEASUREMENT.range_low 범위 | Plausibility | warning | MEASUREMENT | 1 |
| ST-0148 MEASUREMENT.range_high 타입(float) | Conformance | error | MEASUREMENT | 1 |
| ST-0149 MEASUREMENT.range_high 범위 | Plausibility | warning | MEASUREMENT | 1 |
| ST-0153 OBSERVATION.observation_id PK 유일성 | Conformance | error | OBSERVATION | 3 |
| ST-0154 OBSERVATION.observation_id 타입(integer) | Conformance | error | OBSERVATION | 1 |
| ST-0155 OBSERVATION.visit_occurrence_id 필수 | Completeness | error | OBSERVATION | 1 |
| ST-0156 OBSERVATION.visit_occurrence_id 타입(integer) | Conformance | error | OBSERVATION | 1 |
| ST-0157 OBSERVATION.visit_occurrence_id -> VISIT_OCCURRENCE.visit_occurrence_id 참조무결성 | Conformance | error | OBSERVATION | 1 |
| ST-0158 OBSERVATION.person_id 필수 | Completeness | error | OBSERVATION | 1 |
| ST-0159 OBSERVATION.person_id 타입(integer) | Conformance | error | OBSERVATION | 1 |
| ST-0160 OBSERVATION.person_id -> PERSON.person_id 참조무결성 | Conformance | error | OBSERVATION | 28 |
| ST-0161 OBSERVATION.observation_concept_id 필수 | Completeness | error | OBSERVATION | 1 |
| ST-0162 OBSERVATION.observation_concept_id 타입(integer) | Conformance | error | OBSERVATION | 1 |
| ST-0163 OBSERVATION.observation_date 필수 | Completeness | error | OBSERVATION | 1 |
| ST-0164 OBSERVATION.observation_date 타입(date) | Conformance | error | OBSERVATION | 1 |
| ST-0165 OBSERVATION.observation_date 미래 날짜 금지 | Plausibility | error | OBSERVATION | 1 |
| ST-0166 OBSERVATION.observation_type_concept_id 필수 | Completeness | error | OBSERVATION | 1 |
| ST-0167 OBSERVATION.observation_type_concept_id 타입(integer) | Conformance | error | OBSERVATION | 1 |
| ST-0168 OBSERVATION.observation_type_concept_id 코드표 | Conformance | warning | OBSERVATION | 2 |
| ST-0176 NOTE.note_id PK 유일성 | Conformance | error | NOTE | 3 |
| ST-0177 NOTE.note_id 타입(integer) | Conformance | error | NOTE | 1 |
| ST-0178 NOTE.visit_occurrence_id 타입(integer) | Conformance | error | NOTE | 1 |
| ST-0179 NOTE.visit_occurrence_id -> VISIT_OCCURRENCE.visit_occurrence_id 참조무결성 | Conformance | error | NOTE | 1 |
| ST-0180 NOTE.person_id 타입(integer) | Conformance | error | NOTE | 1 |
| ST-0181 NOTE.person_id -> PERSON.person_id 참조무결성 | Conformance | error | NOTE | 40 |
| ST-0182 NOTE.note_date 타입(date) | Conformance | error | NOTE | 1 |
| ST-0183 NOTE.note_date 미래 날짜 금지 | Plausibility | error | NOTE | 1 |
| ST-0184 NOTE.note_type_concept_id 필수 | Completeness | error | NOTE | 1 |
| ST-0185 NOTE.note_type_concept_id 타입(integer) | Conformance | error | NOTE | 1 |
| ST-0186 NOTE.note_type_concept_id 코드표 | Conformance | warning | NOTE | 2 |
| ST-0187 NOTE.note_class_concept_id 필수 | Completeness | error | NOTE | 1 |
| ST-0188 NOTE.note_class_concept_id 타입(integer) | Conformance | error | NOTE | 1 |
| ST-0189 NOTE.note_class_concept_id 코드표 | Conformance | warning | NOTE | 2 |
| ST-0258 MASLD 컬럼 구성 | Conformance | error | MASLD | 1 |
| ST-0260 MASLD.masld_id PK 유일성 | Conformance | error | MASLD | 3 |
| ST-0261 MASLD.masld_id 타입(integer) | Conformance | error | MASLD | 1 |
| ST-0262 MASLD.person_id 필수 | Completeness | error | MASLD | 1 |
| ST-0263 MASLD.person_id 타입(integer) | Conformance | error | MASLD | 1 |
| ST-0264 MASLD.person_id -> PERSON.person_id 참조무결성 | Conformance | error | MASLD | 4 |
| ST-0265 MASLD.visit_occurrence_id 필수 | Completeness | error | MASLD | 1 |
| ST-0266 MASLD.visit_occurrence_id 타입(integer) | Conformance | error | MASLD | 1 |
| ST-0267 MASLD.visit_occurrence_id -> VISIT_OCCURRENCE.visit_occurrence_id 참조무결성 | Conformance | error | MASLD | 1 |
| ST-0268 MASLD.fib4_score 타입(float) | Conformance | error | MASLD | 1 |
| ST-0269 MASLD.fib4_score 범위 | Plausibility | warning | MASLD | 1 |
| ST-0270 MASLD.apri_score 타입(float) | Conformance | error | MASLD | 1 |
| ST-0271 MASLD.apri_score 범위 | Plausibility | warning | MASLD | 1 |
| ST-0272 MASLD.bard_score 타입(float) | Conformance | error | MASLD | 1 |
| ST-0273 MASLD.bard_score 범위 | Plausibility | warning | MASLD | 1 |
| ST-0346 ADVERSE_EVENT.adverse_event_id 타입(integer) | Conformance | error | ADVERSE_EVENT | 1 |
| ST-0347 ADVERSE_EVENT.person_id 필수 | Completeness | error | ADVERSE_EVENT | 1 |
| ST-0348 ADVERSE_EVENT.person_id 타입(integer) | Conformance | error | ADVERSE_EVENT | 1 |
| ST-0350 ADVERSE_EVENT.visit_occurrence_id 필수 | Completeness | error | ADVERSE_EVENT | 1 |
| ST-0351 ADVERSE_EVENT.visit_occurrence_id 타입(integer) | Conformance | error | ADVERSE_EVENT | 1 |
| ST-0353 ADVERSE_EVENT.adverse_event_concept_id 필수 | Completeness | error | ADVERSE_EVENT | 1 |
| ST-0354 ADVERSE_EVENT.adverse_event_concept_id 타입(integer) | Conformance | error | ADVERSE_EVENT | 1 |
| ST-0355 ADVERSE_EVENT.adverse_event_start_date 필수 | Completeness | error | ADVERSE_EVENT | 1 |
| ST-0356 ADVERSE_EVENT.adverse_event_start_date 타입(date) | Conformance | error | ADVERSE_EVENT | 1 |
| ST-0358 ADVERSE_EVENT.severity_concept_id 타입(integer) | Conformance | error | ADVERSE_EVENT | 1 |
| ST-0359 ADVERSE_EVENT.severity_concept_id 코드표 | Conformance | warning | ADVERSE_EVENT | 1 |
| ST-0360 ADVERSE_EVENT.causality_concept_id 타입(integer) | Conformance | error | ADVERSE_EVENT | 1 |
| ST-0361 ADVERSE_EVENT.causality_concept_id 코드표 | Conformance | warning | ADVERSE_EVENT | 1 |
| ST-0362 ADVERSE_EVENT.is_serious_yn 타입(integer) | Conformance | error | ADVERSE_EVENT | 1 |
| ST-0365 ADVERSE_EVENT.outcome_concept_id 타입(integer) | Conformance | error | ADVERSE_EVENT | 1 |
| ST-0366 ADVERSE_EVENT.outcome_concept_id 코드표 | Conformance | warning | ADVERSE_EVENT | 1 |
| SEM-COM-001 방문 종료일 >= 시작일 | Plausibility | error | VISIT_OCCURRENCE | 3 |
| SEM-COM-002 방문일 >= 출생연도 | Plausibility | error | PERSON,VISIT_OCCURRENCE | 20 |
| SEM-COM-003 사망 이후 임상 이벤트 금지 | Plausibility | error | CONDITION_OCCURRENCE,DRUG_EXPOSURE,MEASUREMENT,NOTE,OBSERVATION,PERSON,PROCEDURE_OCCURRENCE,VISIT_OCCURRENCE | 554 |
| SEM-COM-004 이벤트-방문 환자 일치 | Conformance | error | ADVERSE_EVENT,CONDITION_OCCURRENCE,DRUG_EXPOSURE,MEASUREMENT,NOTE,OBSERVATION,PROCEDURE_OCCURRENCE,VISIT_OCCURRENCE | 52 |
| SEM-COM-005 약물 종료일 >= 시작일, days_supply 일치 | Plausibility | error | DRUG_EXPOSURE | 6 |
| SEM-COM-006 매일 투여면 days_supply 필수 | Completeness | error | DRUG_EXPOSURE | 2 |
| SEM-COM-007 투여 간격이 1일 초과면 dosing_number 필수 | Completeness | error | DRUG_EXPOSURE | 2 |
| SEM-COM-008 정상범위 하한 <= 상한 | Plausibility | error | MEASUREMENT | 3 |
| SEM-COM-009 특화 테이블 누락 환자 | Completeness | warning | PERSON | 6 |
| SEM-COM-010 특화 테이블 방문 환자 일치 | Conformance | error | VISIT_OCCURRENCE | 3 |
| SEM-COM-012 노트-환자 일치 | Conformance | error | DRUG_EXPOSURE,NOTE | 1 |
| SEM-MEAS-001 검사일 없음 | Completeness | warning | MEASUREMENT | 3 |
| SEM-MEAS-002 검사 결과값 없음 | Completeness | warning | MEASUREMENT | 3 |
