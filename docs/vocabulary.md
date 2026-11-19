# 표준 용어 방침

> **상태: 결정 사항 정리 (2026-11-17).** 앱 명세·규칙에는 아직 반영하지 않았습니다. 4절의 미결 사항은 의뢰사 확인이 필요합니다.

ETL은 `raw/매뉴얼_20261116.docx`(K-AI 공통데이터모델 매뉴얼 V1.0)를 따릅니다. 이 매뉴얼의 임상 테이블 16개는 앱 명세(`spec/kai_cdm_spec.yaml`)와 필드명·타입·필수 여부가 모두 같습니다. 매뉴얼 2장은 표준 용어 테이블(CONCEPT, CONCEPT_ANCESTOR, SOURCE_TO_CONCEPT_MAP 등)을 정의합니다.

## 1. 사용 어휘

| 어휘 | 역할 | 비고 |
|---|---|---|
| SNOMED CT | 표준: 진단, 시술, 범주형 값 | 한국은 2020년 8월부터 SNOMED International 회원국. 이용 신청은 한국보건의료정보원 NRC |
| LOINC | 표준: 검사 항목, 범주형 결과값(답변 코드) | |
| RxNorm, RxNorm Extension | 표준: 약물 | 국내 제품은 RxNorm Extension 에 있음 |
| UCUM | 표준: 단위 | 현재 앱 단위 목록이 이미 UCUM 개념 |
| HemOnc | 항암 요법 | `SACT.regimen_concept_id` |
| ~~MedDRA~~ | 사용하지 않음 (2026-11-19 변경) | Athena 의 MedDRA 는 [OHDSI MedDRA EULA](https://www.ohdsi.org/meddra-eula/) 동의가 필요하고, 이용 범위가 미국 내 약물 결과 연구로 한정됨. 국내 사업에 맞지 않아 이상사례도 SNOMED CT 로 기록 |
| OMOP 자체 어휘 | 성별(Gender), 방문 유형(Visit), 기록 출처(Type Concept) | |
| KCD | 원천: 진단 | 저장 시 SNOMED 로 매핑 ("Maps to") |
| EDI | 원천: 시술·약제 | 저장 시 SNOMED / RxNorm Extension 으로 매핑 |

Domain·Vocabulary·Concept Class·Relationship 같은 어휘 메타데이터는 Athena 배포판에 함께 들어 있습니다.

## 2. 필드별 허용 용어

| 필드 | 허용 어휘 | 표준 개념 요구 |
|---|---|---|
| `PERSON.gender_concept_id` | Gender | 예 |
| `VISIT_OCCURRENCE.visit_concept_id` | Visit | 예 |
| 모든 `*_type_concept_id` | Type Concept | 예 |
| `CONDITION_OCCURRENCE.condition_concept_id` | SNOMED (Condition 영역) | 예 |
| `PROCEDURE_OCCURRENCE.procedure_concept_id` | SNOMED (Procedure 영역) | 예 |
| `DRUG_EXPOSURE.drug_concept_id` | RxNorm, RxNorm Extension (Drug 영역) | 예 |
| `MEASUREMENT.measurement_concept_id` | LOINC (Measurement 영역) | 예 |
| `MEASUREMENT.value_as_concept_id` | LOINC 답변 코드, SNOMED | 예 |
| `OBSERVATION.observation_concept_id` | SNOMED, LOINC | 예 |
| 모든 단위 필드 (`unit_concept_id`, `*_unit_concept_id`) | UCUM | 예 |
| `SACT.regimen_concept_id` | HemOnc | 예 |
| `ADVERSE_EVENT.adverse_event_concept_id` | SNOMED CT | 예 |
| `ADVERSE_EVENT` 의 `severity`·`causality`·`seriousness`·`outcome`·`action_taken` `_concept_id` | 매뉴얼 자체 코드값 (1~6) | 해당 없음. **표준 개념으로 바꾸지 않음** |
| `NOTE.note_class_concept_id` | 잠정 LOINC 문서 분류(Note 영역) | 예. 확정은 4절 |

매핑하지 못한 원천 코드는 `0` 으로 적재합니다(매뉴얼 2.9.1). 기관 자체 개념은 2,000,000,000 초과 ID 를 씁니다(매뉴얼 2.1.1).

**기준 배포판: OHDSI 표준 어휘 v20260829** ([릴리스 노트](https://github.com/OHDSI/Vocabulary-v5.0/releases)). SNOMED CT 국제판 2026-02-01, LOINC 2.82, RxNorm Extension 2026-06 정리분, EDI 2026-01판(v20260227 에서 반영)을 포함합니다. 사업 기간 동안 고정하며, 새 배포판(다음 예상 2027-02)으로는 의뢰사 승인이 있을 때만 모든 병원이 함께 교체합니다.

## 3. 앱에 반영할 것

1. **필드별 허용 용어 명세**: 2절을 `spec/constraints.yaml` 에 넣습니다.
2. **개념 검증 규칙**: 개념 존재, 허용 어휘, 테이블 영역 일치, 표준·유효(`invalid_reason` 없음) 여부, 단위의 UCUM 여부. 이상사례 코드값 필드는 지금처럼 코드 목록으로 검사합니다.
3. **매핑률 지표**: 필드별 `concept_id = 0` 비율. 기록 누락과 매핑 실패를 구분하는 데 씁니다.
4. **어휘 버전 확인**: VOCABULARY 테이블의 `vocabulary_id = 'None'` 행이 기준 배포판과 같은지 확인합니다.
5. ~~**가상데이터 재검증**~~ (2026-11-19 완료): 카탈로그의 진단·이상사례·검사·약물·시술 개념 59개, 관찰·노트 개념, 코드 목록의 노트 유형·분류와 단위 2개가 이름과 다른 개념이거나 비표준·폐기 개념이어서 고쳤습니다. `synth/check_vocab.py` 가 카탈로그, 코드 목록, clean·good 데이터의 모든 개념을 어휘와 대조하며 현재 어긋나는 항목은 0건입니다.
6. **기대 데이터 정의** ([data-sufficiency.md](data-sufficiency.md)): 항목을 LOINC·SNOMED 코드로 적고, CONCEPT_ANCESTOR 로 하위 개념까지 셉니다.

## 4. 의뢰사에 확인할 것

1. **원천 코드 필드 추가**: KCD·EDI 원코드를 보존하려면 CONDITION_OCCURRENCE 에 `condition_source_value`·`condition_source_concept_id` 를 추가해야 합니다. 시술·약물에도 같은 필드를 권장합니다. 없으면 매뉴얼 1.2 ⑦ "원본 코드 유지"와 충돌합니다.
2. **이상사례 코드 필드 설명**: 이름은 `concept_id` 이지만 값은 자체 코드입니다. 매뉴얼에 "코드값"이라고 분명히 적어 두면 혼동을 줄일 수 있습니다.
3. **`note_class_concept_id` 의 어휘**: 지금은 OMOP 관례대로 LOINC 문서 분류(Radiology Note, Pathology Note, Progress note 등)를 코드 목록에 두었습니다.
4. ~~기준 Athena 배포판 버전~~: v20260829 로 결정, 사업 기간 고정 (2026-11-18).
5. **표준 용어 테이블 제출 범위**: 병원이 사용한 개념만 담은 CONCEPT·CONCEPT_ANCESTOR 일부를 함께 제출할지(권장), 앱에 고정 버전 일부를 내장할지(SNOMED 재배포 조건 확인 필요).
