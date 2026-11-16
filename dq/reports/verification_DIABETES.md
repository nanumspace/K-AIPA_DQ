# 검출 성능 검증: DIABETES

- clean 데이터: 규칙 253개 실행, 위반 0건 (오탐)
- dirty 데이터: 주입 오류 197건 중 197건 검출, 재현율 1.0
- 오류 유형 25종 중 전부 검출 25종
- 주입 오류의 부수 효과로 함께 발화한 규칙: ST-0359, ST-0361, ST-0364, ST-0366, ST-0368

| 오류 유형 | 분류 | 주입 | 검출 | 재현율 |
|---|---|---|---|---|
| AE_AFTER_DEATH | Plausibility | 1 | 1 | 1.0 |
| CODELIST | Conformance | 10 | 10 | 1.0 |
| COLUMN_MISSING | Conformance | 2 | 2 | 1.0 |
| DAYS_SUPPLY_MISMATCH | Plausibility | 2 | 2 | 1.0 |
| DISEASE_VISIT_PERSON_MISMATCH | Conformance | 1 | 1 | 1.0 |
| DRUG_END_BEFORE_START | Plausibility | 1 | 1 | 1.0 |
| DRUG_NOTE_PERSON_MISMATCH | Conformance | 1 | 1 | 1.0 |
| EXTRA_COLUMN | Conformance | 2 | 2 | 1.0 |
| FK_BROKEN | Conformance | 16 | 16 | 1.0 |
| FREQ_WITHOUT_DAYS_SUPPLY | Completeness | 1 | 1 | 1.0 |
| FUTURE_DATE | Plausibility | 12 | 12 | 1.0 |
| INTERVAL_WITHOUT_NUMBER | Completeness | 1 | 1 | 1.0 |
| MEASUREMENT_WITHOUT_DATE | Completeness | 2 | 2 | 1.0 |
| MEASUREMENT_WITHOUT_RESULT | Completeness | 2 | 2 | 1.0 |
| MUST_BE_NULL | Conformance | 1 | 1 | 1.0 |
| PERSON_WITHOUT_DISEASE_ROW | Completeness | 1 | 1 | 1.0 |
| PK_DUP | Conformance | 8 | 8 | 1.0 |
| PK_NULL | Completeness | 8 | 8 | 1.0 |
| RANGE | Plausibility | 13 | 13 | 1.0 |
| RANGE_LOW_GT_HIGH | Plausibility | 2 | 2 | 1.0 |
| REQUIRED_NULL | Completeness | 33 | 33 | 1.0 |
| TABLE_MISSING | Completeness | 1 | 1 | 1.0 |
| TYPE_BAD | Conformance | 73 | 73 | 1.0 |
| VISIT_BEFORE_BIRTH | Plausibility | 1 | 1 | 1.0 |
| VISIT_END_BEFORE_START | Plausibility | 2 | 2 | 1.0 |
