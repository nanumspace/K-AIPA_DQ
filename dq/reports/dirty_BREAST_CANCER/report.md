# 데이터 품질 검증 보고서: BREAST_CANCER (유방암)

검증일 2026-09-07 / 테이블 11개 / 규칙 343개 (실패 257, 건너뜀 44, 오류 0)

위반 1391건 (error 1309, warning 82)

| 분류 | 규칙 수 | 실패 규칙 | 위반 건수 |
|---|---|---|---|
| Conformance | 223 | 157 | 839 |
| Completeness | 72 | 54 | 65 |
| Plausibility | 48 | 46 | 487 |

## 테이블 행수

- PERSON: 100
- VISIT_OCCURRENCE: 3547
- PROCEDURE_OCCURRENCE: 894
- DRUG_EXPOSURE: 3308
- CONDITION_OCCURRENCE: 506
- MEASUREMENT: 10707
- OBSERVATION: 100
- NOTE: 1472
- BREAST_CANCER: 99
- ADVERSE_EVENT: 362
- SACT: 181

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
| ST-0028 VISIT_OCCURRENCE.visit_occurrence_id PK 유일성 | Conformance | error | VISIT_OCCURRENCE | 3 |
| ST-0029 VISIT_OCCURRENCE.visit_occurrence_id 타입(integer) | Conformance | error | VISIT_OCCURRENCE | 1 |
| ST-0030 VISIT_OCCURRENCE.person_id 필수 | Completeness | error | VISIT_OCCURRENCE | 1 |
| ST-0031 VISIT_OCCURRENCE.person_id 타입(integer) | Conformance | error | VISIT_OCCURRENCE | 1 |
| ST-0032 VISIT_OCCURRENCE.person_id -> PERSON.person_id 참조무결성 | Conformance | error | VISIT_OCCURRENCE | 91 |
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
| ST-0051 PROCEDURE_OCCURRENCE.visit_occurrence_id -> VISIT_OCCURRENCE.visit_occurrence_id 참조무결성 | Conformance | error | PROCEDURE_OCCURRENCE | 3 |
| ST-0052 PROCEDURE_OCCURRENCE.person_id 필수 | Completeness | error | PROCEDURE_OCCURRENCE | 1 |
| ST-0053 PROCEDURE_OCCURRENCE.person_id 타입(integer) | Conformance | error | PROCEDURE_OCCURRENCE | 1 |
| ST-0054 PROCEDURE_OCCURRENCE.person_id -> PERSON.person_id 참조무결성 | Conformance | error | PROCEDURE_OCCURRENCE | 24 |
| ST-0055 PROCEDURE_OCCURRENCE.procedure_concept_id 필수 | Completeness | error | PROCEDURE_OCCURRENCE | 1 |
| ST-0056 PROCEDURE_OCCURRENCE.procedure_concept_id 타입(integer) | Conformance | error | PROCEDURE_OCCURRENCE | 1 |
| ST-0057 PROCEDURE_OCCURRENCE.procedure_date 필수 | Completeness | error | PROCEDURE_OCCURRENCE | 1 |
| ST-0058 PROCEDURE_OCCURRENCE.procedure_date 타입(date) | Conformance | error | PROCEDURE_OCCURRENCE | 1 |
| ST-0059 PROCEDURE_OCCURRENCE.procedure_date 미래 날짜 금지 | Plausibility | error | PROCEDURE_OCCURRENCE | 1 |
| ST-0060 PROCEDURE_OCCURRENCE.procedure_type_concept_id 필수 | Completeness | error | PROCEDURE_OCCURRENCE | 1 |
| ST-0061 PROCEDURE_OCCURRENCE.procedure_type_concept_id 타입(integer) | Conformance | error | PROCEDURE_OCCURRENCE | 1 |
| ST-0062 PROCEDURE_OCCURRENCE.procedure_type_concept_id 코드표 | Conformance | warning | PROCEDURE_OCCURRENCE | 2 |
| ST-0066 DRUG_EXPOSURE.drug_exposure_id PK 유일성 | Conformance | error | DRUG_EXPOSURE | 3 |
| ST-0067 DRUG_EXPOSURE.drug_exposure_id 타입(integer) | Conformance | error | DRUG_EXPOSURE | 1 |
| ST-0068 DRUG_EXPOSURE.visit_occurrence_id 필수 | Completeness | error | DRUG_EXPOSURE | 1 |
| ST-0069 DRUG_EXPOSURE.visit_occurrence_id 타입(integer) | Conformance | error | DRUG_EXPOSURE | 1 |
| ST-0070 DRUG_EXPOSURE.visit_occurrence_id -> VISIT_OCCURRENCE.visit_occurrence_id 참조무결성 | Conformance | error | DRUG_EXPOSURE | 7 |
| ST-0071 DRUG_EXPOSURE.person_id 필수 | Completeness | error | DRUG_EXPOSURE | 1 |
| ST-0072 DRUG_EXPOSURE.person_id 타입(integer) | Conformance | error | DRUG_EXPOSURE | 1 |
| ST-0073 DRUG_EXPOSURE.person_id -> PERSON.person_id 참조무결성 | Conformance | error | DRUG_EXPOSURE | 84 |
| ST-0074 DRUG_EXPOSURE.sact_id 타입(integer) | Conformance | error | DRUG_EXPOSURE | 1 |
| ST-0075 DRUG_EXPOSURE.sact_id -> SACT.sact_id 참조무결성 | Conformance | error | DRUG_EXPOSURE | 50 |
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
| ST-0100 DRUG_EXPOSURE.frequency_per_day 타입(integer) | Conformance | error | DRUG_EXPOSURE | 1 |
| ST-0101 DRUG_EXPOSURE.frequency_per_day 범위 | Plausibility | warning | DRUG_EXPOSURE | 1 |
| ST-0102 DRUG_EXPOSURE.dosing_interval_day 타입(integer) | Conformance | error | DRUG_EXPOSURE | 1 |
| ST-0103 DRUG_EXPOSURE.dosing_interval_day 범위 | Plausibility | warning | DRUG_EXPOSURE | 1 |
| ST-0104 DRUG_EXPOSURE.dosing_number 타입(integer) | Conformance | error | DRUG_EXPOSURE | 1 |
| ST-0105 DRUG_EXPOSURE.dosing_number 범위 | Plausibility | warning | DRUG_EXPOSURE | 1 |
| ST-0110 CONDITION_OCCURRENCE.condition_occurrence_id PK 유일성 | Conformance | error | CONDITION_OCCURRENCE | 3 |
| ST-0111 CONDITION_OCCURRENCE.condition_occurrence_id 타입(integer) | Conformance | error | CONDITION_OCCURRENCE | 1 |
| ST-0112 CONDITION_OCCURRENCE.visit_occurrence_id 타입(integer) | Conformance | error | CONDITION_OCCURRENCE | 1 |
| ST-0113 CONDITION_OCCURRENCE.visit_occurrence_id -> VISIT_OCCURRENCE.visit_occurrence_id 참조무결성 | Conformance | error | CONDITION_OCCURRENCE | 1 |
| ST-0114 CONDITION_OCCURRENCE.person_id 필수 | Completeness | error | CONDITION_OCCURRENCE | 1 |
| ST-0115 CONDITION_OCCURRENCE.person_id 타입(integer) | Conformance | error | CONDITION_OCCURRENCE | 1 |
| ST-0116 CONDITION_OCCURRENCE.person_id -> PERSON.person_id 참조무결성 | Conformance | error | CONDITION_OCCURRENCE | 16 |
| ST-0117 CONDITION_OCCURRENCE.condition_concept_id 필수 | Completeness | error | CONDITION_OCCURRENCE | 1 |
| ST-0118 CONDITION_OCCURRENCE.condition_concept_id 타입(integer) | Conformance | error | CONDITION_OCCURRENCE | 1 |
| ST-0119 CONDITION_OCCURRENCE.condition_start_date 필수 | Completeness | error | CONDITION_OCCURRENCE | 1 |
| ST-0120 CONDITION_OCCURRENCE.condition_start_date 타입(date) | Conformance | error | CONDITION_OCCURRENCE | 1 |
| ST-0121 CONDITION_OCCURRENCE.condition_start_date 미래 날짜 금지 | Plausibility | error | CONDITION_OCCURRENCE | 1 |
| ST-0122 CONDITION_OCCURRENCE.condition_type_concept_id 필수 | Completeness | error | CONDITION_OCCURRENCE | 1 |
| ST-0123 CONDITION_OCCURRENCE.condition_type_concept_id 타입(integer) | Conformance | error | CONDITION_OCCURRENCE | 1 |
| ST-0124 CONDITION_OCCURRENCE.condition_type_concept_id 코드표 | Conformance | warning | CONDITION_OCCURRENCE | 2 |
| ST-0126 MEASUREMENT 컬럼 구성 | Conformance | error | MEASUREMENT | 1 |
| ST-0128 MEASUREMENT.measurement_id PK 유일성 | Conformance | error | MEASUREMENT | 3 |
| ST-0129 MEASUREMENT.measurement_id 타입(integer) | Conformance | error | MEASUREMENT | 1 |
| ST-0130 MEASUREMENT.visit_occurrence_id 타입(integer) | Conformance | error | MEASUREMENT | 1 |
| ST-0131 MEASUREMENT.visit_occurrence_id -> VISIT_OCCURRENCE.visit_occurrence_id 참조무결성 | Conformance | error | MEASUREMENT | 14 |
| ST-0132 MEASUREMENT.person_id 필수 | Completeness | error | MEASUREMENT | 1 |
| ST-0133 MEASUREMENT.person_id 타입(integer) | Conformance | error | MEASUREMENT | 1 |
| ST-0134 MEASUREMENT.person_id -> PERSON.person_id 참조무결성 | Conformance | error | MEASUREMENT | 267 |
| ST-0135 MEASUREMENT.measurement_concept_id 필수 | Completeness | error | MEASUREMENT | 1 |
| ST-0136 MEASUREMENT.measurement_concept_id 타입(integer) | Conformance | error | MEASUREMENT | 1 |
| ST-0137 MEASUREMENT.measurement_date 타입(date) | Conformance | error | MEASUREMENT | 1 |
| ST-0138 MEASUREMENT.measurement_date 미래 날짜 금지 | Plausibility | error | MEASUREMENT | 1 |
| ST-0139 MEASUREMENT.measurement_type_concept_id 타입(integer) | Conformance | error | MEASUREMENT | 1 |
| ST-0140 MEASUREMENT.measurement_type_concept_id 코드표 | Conformance | warning | MEASUREMENT | 2 |
| ST-0141 MEASUREMENT.value_as_number 타입(float) | Conformance | error | MEASUREMENT | 1 |
| ST-0142 MEASUREMENT.value_as_number 범위 | Plausibility | warning | MEASUREMENT | 1 |
| ST-0143 MEASUREMENT.value_as_concept_id 타입(integer) | Conformance | error | MEASUREMENT | 1 |
| ST-0144 MEASUREMENT.unit_concept_id 타입(integer) | Conformance | error | MEASUREMENT | 1 |
| ST-0145 MEASUREMENT.unit_concept_id 코드표 | Conformance | warning | MEASUREMENT | 2 |
| ST-0146 MEASUREMENT.range_low 타입(float) | Conformance | error | MEASUREMENT | 1 |
| ST-0147 MEASUREMENT.range_low 범위 | Plausibility | warning | MEASUREMENT | 1 |
| ST-0148 MEASUREMENT.range_high 타입(float) | Conformance | error | MEASUREMENT | 1 |
| ST-0149 MEASUREMENT.range_high 범위 | Plausibility | warning | MEASUREMENT | 1 |
| ST-0152 OBSERVATION 명세 외 컬럼 | Conformance | warning | OBSERVATION | 1 |
| ST-0153 OBSERVATION.observation_id PK 유일성 | Conformance | error | OBSERVATION | 3 |
| ST-0154 OBSERVATION.observation_id 타입(integer) | Conformance | error | OBSERVATION | 1 |
| ST-0155 OBSERVATION.visit_occurrence_id 필수 | Completeness | error | OBSERVATION | 1 |
| ST-0156 OBSERVATION.visit_occurrence_id 타입(integer) | Conformance | error | OBSERVATION | 1 |
| ST-0157 OBSERVATION.visit_occurrence_id -> VISIT_OCCURRENCE.visit_occurrence_id 참조무결성 | Conformance | error | OBSERVATION | 1 |
| ST-0158 OBSERVATION.person_id 필수 | Completeness | error | OBSERVATION | 1 |
| ST-0159 OBSERVATION.person_id 타입(integer) | Conformance | error | OBSERVATION | 1 |
| ST-0160 OBSERVATION.person_id -> PERSON.person_id 참조무결성 | Conformance | error | OBSERVATION | 4 |
| ST-0161 OBSERVATION.observation_concept_id 필수 | Completeness | error | OBSERVATION | 1 |
| ST-0162 OBSERVATION.observation_concept_id 타입(integer) | Conformance | error | OBSERVATION | 1 |
| ST-0163 OBSERVATION.observation_date 필수 | Completeness | error | OBSERVATION | 1 |
| ST-0164 OBSERVATION.observation_date 타입(date) | Conformance | error | OBSERVATION | 1 |
| ST-0165 OBSERVATION.observation_date 미래 날짜 금지 | Plausibility | error | OBSERVATION | 1 |
| ST-0166 OBSERVATION.observation_type_concept_id 필수 | Completeness | error | OBSERVATION | 1 |
| ST-0167 OBSERVATION.observation_type_concept_id 타입(integer) | Conformance | error | OBSERVATION | 1 |
| ST-0168 OBSERVATION.observation_type_concept_id 코드표 | Conformance | warning | OBSERVATION | 2 |
| ST-0169 OBSERVATION.value_as_number 타입(float) | Conformance | error | OBSERVATION | 1 |
| ST-0170 OBSERVATION.value_as_number 범위 | Plausibility | warning | OBSERVATION | 1 |
| ST-0174 NOTE 컬럼 구성 | Conformance | error | NOTE | 1 |
| ST-0176 NOTE.note_id PK 유일성 | Conformance | error | NOTE | 3 |
| ST-0177 NOTE.note_id 타입(integer) | Conformance | error | NOTE | 1 |
| ST-0178 NOTE.visit_occurrence_id 타입(integer) | Conformance | error | NOTE | 1 |
| ST-0179 NOTE.visit_occurrence_id -> VISIT_OCCURRENCE.visit_occurrence_id 참조무결성 | Conformance | error | NOTE | 2 |
| ST-0180 NOTE.person_id 타입(integer) | Conformance | error | NOTE | 1 |
| ST-0181 NOTE.person_id -> PERSON.person_id 참조무결성 | Conformance | error | NOTE | 31 |
| ST-0182 NOTE.note_date 타입(date) | Conformance | error | NOTE | 1 |
| ST-0183 NOTE.note_date 미래 날짜 금지 | Plausibility | error | NOTE | 1 |
| ST-0184 NOTE.note_type_concept_id 필수 | Completeness | error | NOTE | 1 |
| ST-0185 NOTE.note_type_concept_id 타입(integer) | Conformance | error | NOTE | 1 |
| ST-0186 NOTE.note_type_concept_id 코드표 | Conformance | warning | NOTE | 2 |
| ST-0187 NOTE.note_class_concept_id 필수 | Completeness | error | NOTE | 1 |
| ST-0188 NOTE.note_class_concept_id 타입(integer) | Conformance | error | NOTE | 1 |
| ST-0189 NOTE.note_class_concept_id 코드표 | Conformance | warning | NOTE | 2 |
| ST-0215 BREAST_CANCER.breast_cancer_id PK 유일성 | Conformance | error | BREAST_CANCER | 3 |
| ST-0216 BREAST_CANCER.breast_cancer_id 타입(integer) | Conformance | error | BREAST_CANCER | 1 |
| ST-0217 BREAST_CANCER.person_id 필수 | Completeness | error | BREAST_CANCER | 1 |
| ST-0218 BREAST_CANCER.person_id 타입(integer) | Conformance | error | BREAST_CANCER | 1 |
| ST-0219 BREAST_CANCER.person_id -> PERSON.person_id 참조무결성 | Conformance | error | BREAST_CANCER | 4 |
| ST-0220 BREAST_CANCER.visit_occurrence_id 필수 | Completeness | error | BREAST_CANCER | 1 |
| ST-0221 BREAST_CANCER.visit_occurrence_id 타입(integer) | Conformance | error | BREAST_CANCER | 1 |
| ST-0222 BREAST_CANCER.visit_occurrence_id -> VISIT_OCCURRENCE.visit_occurrence_id 참조무결성 | Conformance | error | BREAST_CANCER | 1 |
| ST-0223 BREAST_CANCER.diag_rgst_ymd 필수 | Completeness | error | BREAST_CANCER | 1 |
| ST-0224 BREAST_CANCER.diag_rgst_ymd 타입(date) | Conformance | error | BREAST_CANCER | 1 |
| ST-0225 BREAST_CANCER.diag_rgst_ymd 미래 날짜 금지 | Plausibility | error | BREAST_CANCER | 1 |
| ST-0226 BREAST_CANCER.menopause_status 필수 | Completeness | error | BREAST_CANCER | 1 |
| ST-0227 BREAST_CANCER.menopause_status 타입(integer) | Conformance | error | BREAST_CANCER | 1 |
| ST-0228 BREAST_CANCER.menopause_status 코드표 | Conformance | error | BREAST_CANCER | 2 |
| ST-0229 BREAST_CANCER.pregnant_at_diagnosis 필수 | Completeness | error | BREAST_CANCER | 1 |
| ST-0230 BREAST_CANCER.pregnant_at_diagnosis 타입(integer) | Conformance | error | BREAST_CANCER | 1 |
| ST-0231 BREAST_CANCER.pregnant_at_diagnosis 코드표 | Conformance | error | BREAST_CANCER | 2 |
| ST-0232 BREAST_CANCER.history_of_live_birth 필수 | Completeness | error | BREAST_CANCER | 1 |
| ST-0233 BREAST_CANCER.history_of_live_birth 타입(integer) | Conformance | error | BREAST_CANCER | 1 |
| ST-0234 BREAST_CANCER.history_of_live_birth 코드표 | Conformance | error | BREAST_CANCER | 2 |
| ST-0235 BREAST_CANCER.postpartum_at_diagnosis 필수 | Completeness | error | BREAST_CANCER | 1 |
| ST-0236 BREAST_CANCER.postpartum_at_diagnosis 타입(integer) | Conformance | error | BREAST_CANCER | 1 |
| ST-0237 BREAST_CANCER.postpartum_at_diagnosis 코드표 | Conformance | error | BREAST_CANCER | 2 |
| ST-0238 BREAST_CANCER.fertility_history 필수 | Completeness | error | BREAST_CANCER | 1 |
| ST-0239 BREAST_CANCER.fertility_history 타입(integer) | Conformance | error | BREAST_CANCER | 1 |
| ST-0240 BREAST_CANCER.fertility_history 코드표 | Conformance | error | BREAST_CANCER | 2 |
| ST-0241 BREAST_CANCER.fertility_treatment_type 타입(integer) | Conformance | error | BREAST_CANCER | 1 |
| ST-0242 BREAST_CANCER.fertility_treatment_type 코드표 | Conformance | error | BREAST_CANCER | 1 |
| ST-0317 SACT 명세 외 컬럼 | Conformance | warning | SACT | 1 |
| ST-0318 SACT.sact_id PK 유일성 | Conformance | error | SACT | 3 |
| ST-0319 SACT.sact_id 타입(integer) | Conformance | error | SACT | 1 |
| ST-0320 SACT.person_id 필수 | Completeness | error | SACT | 1 |
| ST-0321 SACT.person_id 타입(integer) | Conformance | error | SACT | 1 |
| ST-0322 SACT.person_id -> PERSON.person_id 참조무결성 | Conformance | error | SACT | 7 |
| ST-0323 SACT.regimen_concept_id 필수 | Completeness | error | SACT | 1 |
| ST-0324 SACT.regimen_concept_id 타입(integer) | Conformance | error | SACT | 1 |
| ST-0325 SACT.regimen_source_value 필수 | Completeness | error | SACT | 1 |
| ST-0326 SACT.regimen_start_date 필수 | Completeness | error | SACT | 1 |
| ST-0327 SACT.regimen_start_date 타입(date) | Conformance | error | SACT | 1 |
| ST-0328 SACT.regimen_start_date 미래 날짜 금지 | Plausibility | error | SACT | 1 |
| ST-0329 SACT.regimen_end_date 필수 | Completeness | error | SACT | 1 |
| ST-0330 SACT.regimen_end_date 타입(date) | Conformance | error | SACT | 1 |
| ST-0331 SACT.regimen_end_date 미래 날짜 금지 | Plausibility | error | SACT | 1 |
| ST-0333 SACT.line_of_therapy 범위 | Plausibility | warning | SACT | 1 |
| ST-0334 SACT.number_of_cycles 타입(integer) | Conformance | error | SACT | 1 |
| ST-0335 SACT.number_of_cycles 범위 | Plausibility | warning | SACT | 1 |
| ST-0336 SACT.therapy_intent 타입(integer) | Conformance | error | SACT | 1 |
| ST-0337 SACT.therapy_intent 코드표 | Conformance | error | SACT | 2 |
| ST-0338 SACT.ecog_performance_status 타입(integer) | Conformance | error | SACT | 1 |
| ST-0339 SACT.ecog_performance_status 범위 | Plausibility | warning | SACT | 1 |
| ST-0340 SACT.date_of_progression 타입(date) | Conformance | error | SACT | 1 |
| ST-0341 SACT.date_of_progression 미래 날짜 금지 | Plausibility | error | SACT | 1 |
| ST-0345 ADVERSE_EVENT.adverse_event_id PK 유일성 | Conformance | error | ADVERSE_EVENT | 3 |
| ST-0346 ADVERSE_EVENT.adverse_event_id 타입(integer) | Conformance | error | ADVERSE_EVENT | 1 |
| ST-0347 ADVERSE_EVENT.person_id 필수 | Completeness | error | ADVERSE_EVENT | 1 |
| ST-0348 ADVERSE_EVENT.person_id 타입(integer) | Conformance | error | ADVERSE_EVENT | 1 |
| ST-0349 ADVERSE_EVENT.person_id -> PERSON.person_id 참조무결성 | Conformance | error | ADVERSE_EVENT | 12 |
| ST-0350 ADVERSE_EVENT.visit_occurrence_id 필수 | Completeness | error | ADVERSE_EVENT | 1 |
| ST-0351 ADVERSE_EVENT.visit_occurrence_id 타입(integer) | Conformance | error | ADVERSE_EVENT | 1 |
| ST-0352 ADVERSE_EVENT.visit_occurrence_id -> VISIT_OCCURRENCE.visit_occurrence_id 참조무결성 | Conformance | error | ADVERSE_EVENT | 1 |
| ST-0353 ADVERSE_EVENT.adverse_event_concept_id 필수 | Completeness | error | ADVERSE_EVENT | 1 |
| ST-0354 ADVERSE_EVENT.adverse_event_concept_id 타입(integer) | Conformance | error | ADVERSE_EVENT | 1 |
| ST-0355 ADVERSE_EVENT.adverse_event_start_date 필수 | Completeness | error | ADVERSE_EVENT | 1 |
| ST-0356 ADVERSE_EVENT.adverse_event_start_date 타입(date) | Conformance | error | ADVERSE_EVENT | 1 |
| ST-0357 ADVERSE_EVENT.adverse_event_start_date 미래 날짜 금지 | Plausibility | error | ADVERSE_EVENT | 1 |
| ST-0358 ADVERSE_EVENT.severity_concept_id 타입(integer) | Conformance | error | ADVERSE_EVENT | 1 |
| ST-0359 ADVERSE_EVENT.severity_concept_id 코드표 | Conformance | warning | ADVERSE_EVENT | 2 |
| ST-0360 ADVERSE_EVENT.causality_concept_id 타입(integer) | Conformance | error | ADVERSE_EVENT | 1 |
| ST-0361 ADVERSE_EVENT.causality_concept_id 코드표 | Conformance | warning | ADVERSE_EVENT | 2 |
| ST-0362 ADVERSE_EVENT.is_serious_yn 타입(integer) | Conformance | error | ADVERSE_EVENT | 1 |
| ST-0363 ADVERSE_EVENT.seriousness_concept_id 타입(integer) | Conformance | error | ADVERSE_EVENT | 1 |
| ST-0364 ADVERSE_EVENT.seriousness_concept_id 코드표 | Conformance | warning | ADVERSE_EVENT | 2 |
| ST-0365 ADVERSE_EVENT.outcome_concept_id 타입(integer) | Conformance | error | ADVERSE_EVENT | 1 |
| ST-0366 ADVERSE_EVENT.outcome_concept_id 코드표 | Conformance | warning | ADVERSE_EVENT | 2 |
| ST-0367 ADVERSE_EVENT.action_taken_concept_id 타입(integer) | Conformance | error | ADVERSE_EVENT | 1 |
| ST-0368 ADVERSE_EVENT.action_taken_concept_id 코드표 | Conformance | warning | ADVERSE_EVENT | 2 |
| SEM-COM-001 방문 종료일 >= 시작일 | Plausibility | error | VISIT_OCCURRENCE | 3 |
| SEM-COM-002 방문일 >= 출생연도 | Plausibility | error | PERSON,VISIT_OCCURRENCE | 48 |
| SEM-COM-003 사망 이후 임상 이벤트 금지 | Plausibility | error | CONDITION_OCCURRENCE,DRUG_EXPOSURE,MEASUREMENT,NOTE,OBSERVATION,PERSON,PROCEDURE_OCCURRENCE,VISIT_OCCURRENCE | 142 |
| SEM-COM-004 이벤트-방문 환자 일치 | Conformance | error | ADVERSE_EVENT,CONDITION_OCCURRENCE,DRUG_EXPOSURE,MEASUREMENT,NOTE,OBSERVATION,PROCEDURE_OCCURRENCE,VISIT_OCCURRENCE | 24 |
| SEM-COM-005 약물 종료일 >= 시작일, days_supply 일치 | Plausibility | error | DRUG_EXPOSURE | 6 |
| SEM-COM-006 매일 투여면 days_supply 필수 | Completeness | error | DRUG_EXPOSURE | 1 |
| SEM-COM-007 투여 간격이 1일 초과면 dosing_number 필수 | Completeness | error | DRUG_EXPOSURE | 2 |
| SEM-COM-008 정상범위 하한 <= 상한 | Plausibility | error | MEASUREMENT | 3 |
| SEM-COM-009 특화 테이블 누락 환자 | Completeness | warning | PERSON | 6 |
| SEM-COM-010 특화 테이블 방문 환자 일치 | Conformance | error | VISIT_OCCURRENCE | 2 |
| SEM-COM-011 이상사례 발생일 사망 이후 금지 | Plausibility | error | ADVERSE_EVENT,PERSON | 3 |
| SEM-COM-012 노트-환자 일치 | Conformance | error | DRUG_EXPOSURE,NOTE | 1 |
| SEM-COM-013 검사·시술·약물 날짜의 연도 >= 출생연도 | Plausibility | error | DRUG_EXPOSURE,MEASUREMENT,PERSON,PROCEDURE_OCCURRENCE | 229 |
| SEM-MEAS-001 검사일 없음 | Completeness | warning | MEASUREMENT | 3 |
| SEM-MEAS-002 검사 결과값 없음 | Completeness | warning | MEASUREMENT | 3 |
| SEM-MEAS-005 검사일이 연결된 방문 기간 밖 | Plausibility | warning | MEASUREMENT,VISIT_OCCURRENCE | 1 |
| SEM-MEAS-006 같은 검사 결과가 PK만 다르게 중복된 후보 | Plausibility | warning | MEASUREMENT | 7 |
| SEM-MEAS-003 HbA1c·UACR·크레아티닌 단위 부적합 | Plausibility | warning | MEASUREMENT | 1 |
| SEM-SACT-001 항암요법 종료일 >= 시작일 | Plausibility | error | SACT | 2 |
| SEM-SACT-006 항암요법 line 번호와 시작일 순서 확인 | Plausibility | warning | SACT | 1 |
| SEM-SACT-002 항암요법 기간이 연결 약물 기간과 일치 | Plausibility | warning | DRUG_EXPOSURE,SACT | 8 |
| SEM-SACT-003 진행일 >= 항암 시작일 | Plausibility | error | SACT | 1 |
| SEM-SACT-004 약물-항암요법 환자 일치 | Conformance | error | DRUG_EXPOSURE,SACT | 14 |
| SEM-SACT-005 항종양제 투여의 항암요법 연결 확인 | Completeness | warning | DRUG_EXPOSURE,SACT | 2 |

## 데이터 충실도

있어야 할 기록이 있는 비율이다(규칙 위반과 별개, 충족 판정·목표치 없음). 미충족 단위는 sufficiency.csv(기관 내부용)에 있다.

| 항목 | 단위 | 대상 | 충족 | 비율 | 1인·1년당 중앙값 | <50 | 50-64 | 65+ | 미상 |
|---|---|---|---|---|---|---|---|---|---|
| EXP-COM-01 키 | 환자 | 97 | 90 | 92.8% | - | 29/34 | 45/47 | 14/14 | 2/2 |
| EXP-COM-02 체중 | 환자 | 97 | 90 | 92.8% | - | 29/34 | 45/47 | 14/14 | 2/2 |
| EXP-COM-03 항암 요법 시작 전 키·체중 | 요법 | 179 | 31 | 17.3% | - | 8/61 | 18/84 | 3/23 | 2/11 |
| EXP-COM-04 요법별 수행 상태(ECOG) | 요법 | 179 | 178 | 99.4% | - | 60/61 | 84/84 | 23/23 | 11/11 |
| EXP-COM-05 항암 요법 시작 전 혈구검사 | 요법 | 179 | 102 | 57.0% | - | 35/61 | 46/84 | 14/23 | 7/11 |
| EXP-BC-01 HER2 검사 결과 | 환자 | 97 | 97 | 100.0% | - | 34/34 | 47/47 | 14/14 | 2/2 |
| EXP-BC-02 ER·PR 검사 결과 | 환자 | 97 | 97 | 100.0% | - | 34/34 | 47/47 | 14/14 | 2/2 |
| EXP-BC-04 HER2 표준 결과 coverage | 환자 | 97 | 97 | 100.0% | - | 34/34 | 47/47 | 14/14 | 2/2 |
| EXP-BC-05 ER 표준 결과 coverage | 환자 | 97 | 97 | 100.0% | - | 34/34 | 47/47 | 14/14 | 2/2 |
| EXP-BC-06 PR 표준 결과 coverage | 환자 | 97 | 97 | 100.0% | - | 34/34 | 47/47 | 14/14 | 2/2 |
| EXP-BC-03 병기 | 환자 | 97 | 97 | 100.0% | - | 34/34 | 47/47 | 14/14 | 2/2 |

## 표준 용어 매핑률

표준 개념 필드에서 매핑하지 못해 `0` 으로 적재한 비율이다(위반 아님, 규칙 집계와 별개). 대상은 정수로 읽히는 값이고, 빈 값과 정수가 아닌 값은 대상에서 빼고 제외 칸에 따로 센다. `0` 이 맞는 경우(예: 구조식 노트의 분류)도 미매핑에 들어간다.

| 테이블 | 필드 | 행 | 대상 | 매핑 | 미매핑(0) | 미매핑률 | 제외(빈 값·형식 오류) |
|---|---|---|---|---|---|---|---|
| PERSON | gender_concept_id | 100 | 98 | 98 | 0 | 0.0% | 1·1 |
| VISIT_OCCURRENCE | visit_concept_id | 3547 | 3545 | 3545 | 0 | 0.0% | 1·1 |
| VISIT_OCCURRENCE | visit_type_concept_id | 3547 | 3545 | 3545 | 0 | 0.0% | 1·1 |
| PROCEDURE_OCCURRENCE | procedure_concept_id | 894 | 892 | 892 | 0 | 0.0% | 1·1 |
| PROCEDURE_OCCURRENCE | procedure_type_concept_id | 894 | 892 | 892 | 0 | 0.0% | 1·1 |
| DRUG_EXPOSURE | drug_concept_id | 3308 | 3306 | 3306 | 0 | 0.0% | 1·1 |
| DRUG_EXPOSURE | amount_unit_concept_id | 3308 | 3307 | 3307 | 0 | 0.0% | 0·1 |
| DRUG_EXPOSURE | numerator_unit_concept_id | 3308 | 0 | 0 | 0 | - | 3308·0 |
| DRUG_EXPOSURE | denominator_unit_concept_id | 3308 | 0 | 0 | 0 | - | 3308·0 |
| CONDITION_OCCURRENCE | condition_concept_id | 506 | 504 | 504 | 0 | 0.0% | 1·1 |
| CONDITION_OCCURRENCE | condition_type_concept_id | 506 | 504 | 504 | 0 | 0.0% | 1·1 |
| MEASUREMENT | measurement_concept_id | 10707 | 10705 | 10705 | 0 | 0.0% | 1·1 |
| MEASUREMENT | measurement_type_concept_id | 10707 | 10706 | 10706 | 0 | 0.0% | 0·1 |
| MEASUREMENT | value_as_concept_id | 10707 | 399 | 399 | 0 | 0.0% | 10307·1 |
| MEASUREMENT | unit_concept_id | 10707 | 10506 | 10506 | 0 | 0.0% | 200·1 |
| OBSERVATION | observation_concept_id | 100 | 98 | 98 | 0 | 0.0% | 1·1 |
| OBSERVATION | observation_type_concept_id | 100 | 98 | 98 | 0 | 0.0% | 1·1 |
| OBSERVATION | unit_concept_id | 100 | 0 | 0 | 0 | - | 100·0 |
| NOTE | note_type_concept_id | 1472 | 1470 | 1470 | 0 | 0.0% | 1·1 |
| NOTE | note_class_concept_id | 1472 | 1470 | 1458 | 12 | 0.8% | 1·1 |
| ADVERSE_EVENT | adverse_event_concept_id | 362 | 360 | 360 | 0 | 0.0% | 1·1 |
| SACT | regimen_concept_id | 181 | 179 | 171 | 8 | 4.5% | 1·1 |
