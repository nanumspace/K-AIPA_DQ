# 표준 용어 방침

> **상태: 결정 사항 (2026-11-19 확정, 남은 결정 없음).** 방침 결정권자가 아래 내용을 확정했습니다. 앱 반영 상태는 3절, 결정 기록은 4절에 있습니다.

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
| `SACT.regimen_concept_id` | HemOnc (Regimen 영역). HemOnc 에 같은 요법의 표준 개념이 없으면 `0` 과 `regimen_source_value` | 예 |
| `ADVERSE_EVENT.adverse_event_concept_id` | SNOMED CT | 예 |
| `ADVERSE_EVENT` 의 `severity`·`causality`·`seriousness`·`outcome`·`action_taken` `_concept_id` | 매뉴얼 자체 코드값 (1~6) | 해당 없음. **표준 개념으로 바꾸지 않음** |
| `NOTE.note_class_concept_id` | LOINC 문서 분류 (Note 영역). 표준 분류가 없는 노트(SMILES 구조식)는 `0` | 예 |

매핑하지 못한 원천 코드는 `0` 으로 적재합니다(매뉴얼 2.9.1). 기관 자체 개념은 2,000,000,000 초과 ID 를 씁니다(매뉴얼 2.1.1).

**기준 배포판: OHDSI 표준 어휘 v20260829** ([릴리스 노트](https://github.com/OHDSI/Vocabulary-v5.0/releases)). SNOMED CT 국제판 2026-02-01, LOINC 2.82, RxNorm Extension 2026-06 정리분, EDI 2026-01판(v20260227 에서 반영)을 포함합니다. 사업 기간 동안 고정하며, 새 배포판(다음 예상 2027-02)으로는 승인이 있을 때만 모든 병원이 함께 교체합니다.

## 3. 앱 반영 상태 (1.0.3)

1. ~~**필드별 허용 용어 명세**~~ (완료): 2절을 `spec/constraints.yaml` 의 `concept` 항목으로 넣었습니다. 명세(`spec/kai_cdm_spec.yaml`)의 각 개념 필드에 `concept: {domain, vocabularies, standard}` 가 붙고, `synth/check_vocab.py` 도 같은 대응을 씁니다.
2. ~~**개념 검증 규칙**~~ (완료): 개념 필드마다 `표준 용어` 구조 규칙(검사 유형 `concept`, 25개, 경고)이 있습니다. 개념 존재, 표준(`standard_concept = 'S'`)·유효(`invalid_reason` 없음), 영역, 허용 어휘를 봅니다. 값 `0` 은 매핑 실패 표시라 보지 않습니다. 원천 개념 필드(`*_source_concept_id`)는 존재만 봅니다. 병원이 선택 테이블 CONCEPT 를 냈을 때만 돌고, 내지 않으면 'CONCEPT 미제출'로 건너뜁니다. 이상사례 코드값 필드는 지금처럼 코드 목록(`AE.*`)으로 검사합니다.
3. **매핑률 지표**: 필드별 `concept_id = 0` 비율. 기록 누락과 매핑 실패를 구분하는 데 씁니다. 아직 구현하지 않았습니다.
4. ~~**어휘 버전 확인**~~ (완료): 교차 규칙 `SEM-VOC-001`(경고)이 선택 테이블 VOCABULARY 의 `vocabulary_id = 'None'` 행 `vocabulary_version` 이 `v5.0 29-AUG-26`(v20260829)인지 봅니다.
5. ~~**가상데이터 재검증**~~ (2026-11-19 완료): 카탈로그의 진단·이상사례·검사·약물·시술 개념 59개, 관찰·노트 개념, 코드 목록의 노트 유형·분류와 단위 2개가 이름과 다른 개념이거나 비표준·폐기 개념이어서 고쳤습니다. 항암 요법 이름 48개는 `spec/concepts.yaml` 의 `regimens` 표로 HemOnc 개념에 대응했습니다(표준 개념이 없는 3개는 `0`). `synth/check_vocab.py` 가 카탈로그, 코드 목록, clean·good 데이터의 모든 개념을 어휘와 대조하며 현재 어긋나는 항목은 0건입니다.
6. **기대 데이터 정의** ([data-sufficiency.md](data-sufficiency.md)): 항목을 LOINC·SNOMED 코드로 적고, CONCEPT_ANCESTOR 로 하위 개념까지 셉니다. 아직 구현하지 않았습니다. 구현할 때 CONCEPT_ANCESTOR 를 선택 테이블에 더합니다.

## 4. 결정 기록

1. ~~**원천 코드 필드**~~ (2026-11-19 결정): CONDITION_OCCURRENCE·PROCEDURE_OCCURRENCE·DRUG_EXPOSURE 에 `*_source_value`(varchar)·`*_source_concept_id`(integer)를 **선택 컬럼**으로 더합니다(매뉴얼 보완, `spec/constraints.yaml` 의 `supplement.fields`). 매뉴얼 1.2 ⑦ "원본 코드 유지"를 따르기 위한 것입니다. 컬럼이 없어도 '컬럼 누락'이 아니고 앱 사전 점검은 안내만 냅니다. 컬럼을 내면 `*_source_concept_id` 의 정수 형식(경고)과, CONCEPT 를 냈을 때 개념 존재(경고)를 봅니다. 원천 개념은 KCD7·EDI 같은 비표준 어휘라 표준 여부는 보지 않습니다. 기존 병원 데이터는 그대로 통과합니다.
2. ~~**이상사례 코드 필드 설명**~~ (2026-11-19 결정): 컬럼 이름(`severity_concept_id` 등)은 매뉴얼대로 두고, 명세 설명·입력 양식·컬럼 명세서·자료실에 "매뉴얼 자체 코드값, OMOP 표준 개념 ID 아님"을 적습니다. 코드표 이름도 `OMOP.*` 에서 `AE.severity`·`AE.causality`·`AE.seriousness`·`AE.outcome`·`AE.action_taken` 으로 바꿨습니다. 코드값과 규칙 심각도(경고)는 그대로입니다.
3. ~~**`note_class_concept_id` 의 어휘**~~: LOINC 문서 분류로 확정 (2026-11-19).
4. ~~기준 Athena 배포판 버전~~: v20260829 로 결정, 사업 기간 고정 (2026-11-18).
5. ~~**표준 용어 테이블 제출 범위**~~ (2026-11-19 결정): 병원이 사용한 개념만 담은 CONCEPT 일부와 VOCABULARY 를 **선택 테이블**로 받습니다(`supplement.tables`). 앱에 어휘를 넣지 않으므로 SNOMED 등 재배포 문제가 없습니다. 내면 1·2절대로 대조하고, 없으면 그 규칙만 건너뜁니다. 추출 방법은 [manual/02-input.md](../manual/02-input.md) 에 있습니다.

보완 규칙은 매뉴얼 규칙 뒤에 번호를 이어 붙였습니다(ST-0369~ST-0410, SEM-VOC-001). 매뉴얼 규칙 ST-0001~ST-0368 의 번호는 그대로라 병원의 규칙 조정이 그대로 남습니다.
