# K-AIPA DQ — 명세와 규칙 카탈로그

검증 기준은 **「질환별 데이터 테이블」 매뉴얼 2026-11-16**입니다. 현재 소스는 표 18개·필드 178개, 구조 규칙 410개와 교차 테이블 규칙 30개(총 440개)를 포함합니다. 비임상·오믹스 데이터나 AI 모델 성능은 검증하지 않습니다.

## 출처와 적용 범위

- 원전 파일·기준일·생성 도구는 `spec/kai_cdm_spec.yaml`의 `meta`에 기록합니다. 이 릴리스의 원전은 위 파일이며, 다른 날짜의 매뉴얼을 선택하는 기능은 없습니다.
- 표·열·타입·필수·코드표의 원전은 매뉴얼입니다. FK 대상 추론과 교차 테이블 논리는 아래 해석 및 규칙 SQL로 명시하고, 임상 검토용 제약은 `spec/constraints.yaml`에서 별도로 관리합니다.
- 규칙의 근거를 확인할 때는 **원전 시트·필드 설명 → 기계 판독 명세 → 규칙 ID·설명·SQL → 실행 결과** 순서로 추적합니다. 모든 규칙에 원전 셀 주소와 승인자 메타데이터가 자동 부여되는 기능은 현재 없습니다.
- 공식 문서 발행·승인 주체와 공개 범위는 사업 운영 주체가 관리합니다. 이 저장소의 파일명이나 제품명을 그 자체로 공식 승인 증거로 해석하지 않습니다.
- 명세·규칙의 변경은 근거, 영향 규칙, 검토 결과, 적용 릴리스를 기록한 뒤 반영합니다. 기관별 조정은 표준 원전을 변경하지 않으며 실행 규칙 해시와 함께 구분합니다.

| 항목 | 내용 |
|---|---|
| 명세 | `spec/kai_cdm_spec.yaml` (표 18개: 공통 8 · 질환 본표 6 · 확장 2(SACT, ADVERSE_EVENT) · 선택 2(CONCEPT, VOCABULARY) · 필드 178개), `spec/codelists.yaml`, `spec/cohort_profiles.yaml` |
| 값 제약·보완 | `spec/constraints.yaml` (매뉴얼에 없는 범위·형식·코드표·표준 용어 대응·제출 범위 밖 FK와 보완 항목(`supplement`), 손으로 관리) |
| 구조 규칙 | `rules/rules_structural.yaml` 410개 (명세에서 `rules/generate_structural_rules.py` 가 자동 생성. ST-0001~0368 매뉴얼, ST-0369~0410 보완) |
| 교차 규칙 | `rules/rules_semantic.yaml` 30개 (손으로 작성한 DuckDB SQL, ID `SEM-*`) |
| 코호트별 적용 규칙 | 폐암 333 · 유방암 342 · 대장암 325 · MASLD 304 · 당뇨병 301 · 림프종 334 (선택 테이블·컬럼 규칙 포함, 내지 않으면 건너뜀) |
| 코호트별 표 | 공통 8표 + 질환 본표 + ADVERSE_EVENT + SACT(MASLD·당뇨병 제외), 선택 표 CONCEPT·VOCABULARY |
| 실행 전 필수 표 | PERSON 과 질환 본표 (없으면 실행이 막힘) |
| 데이터 충실도 (규칙 아님) | `spec/expected_data.yaml` 항목과 `spec/concept_sets.yaml` 개념 집합. 위반·심각도 없이 비율만 보고 ([data-sufficiency.md](data-sufficiency.md)) |

**코호트별 적용 규칙의 셈법.** 엔진이 쓰는 기준과 같습니다. 구조 규칙은 *코호트 구성에 있는 표*(선택 표 포함)의 규칙 가운데 적용 범위(`scope`)가 `all` 이거나 그 코호트를 가리키는 것, 교차 규칙은 `scope` 가 `all` 이거나 그 코호트를 가리키는 것입니다. 교차 규칙이 필요로 하는 표가 코호트에 없거나 내지 않았으면 규칙은 *건너뜀*으로 보고됩니다(건너뜀도 적용 규칙 수에 들어갑니다). 자료실의 규칙 목록(`resources.html`)이 같은 계산을 합니다.

## 기계 판독 명세 (`spec/`)

`spec/build_spec.py` 가 매뉴얼 엑셀(시트 하나가 표 하나)을 읽어 필드마다 이름·타입·필수 여부·PK/FK·설명을 가져오고, 설명의 `N=라벨` 형태 코드표를 `codelists.yaml` 의 `embedded` 절로 분리합니다. 매뉴얼은 FK 의 대상 표를 적지 않으므로 이름으로 정합니다(`person_id`, `visit_occurrence_id`, `sact_id`, `note_id`). 거기에 `spec/constraints.yaml` 의 값 제약(`range`, `pattern`, `codelist`, `concept`, `note`, `fk_external`)과 보완 항목(`supplement`)을 합칩니다.

| 속성 | 내용 |
|---|---|
| `type` | integer / float / varchar / text / date 로 정규화 (매뉴얼 `RBDMS dependent text` 는 text) |
| `required` | 매뉴얼의 필수 열(Y/N). 값이 Y/N 이 아니면 생성이 멈춤 |
| `key`, `ref` | PK / FK 와 참조 대상 (예: `VISIT_OCCURRENCE.visit_occurrence_id`) |
| `codelist` | 설명문에서 분리한 코드표(`embedded`), OMOP 대표 코드 집합(`omop`), 이상사례 코드값(`ae`) 참조 |
| `range`, `pattern` | 수치 타당 범위, 문자열 정규식 (`constraints.yaml` 에서 옴. 위반은 경고) |
| `concept` | 표준 용어 대응 `{standard, domain, vocabularies}` ([vocabulary.md](vocabulary.md) 2절). 선택 테이블 CONCEPT 를 냈을 때 대조 |
| `optional` | 매뉴얼 보완 항목. 필드에 붙으면 선택 컬럼(없어도 컬럼 누락 아님), 표에 붙으면 선택 테이블(없어도 테이블 없음 아님) |
| `fk_external` | 제출 범위 밖 표를 가리키는 키(예: `PERSON.care_site_id`). 참조 무결성 검사 안 함 |

| 파일 | 내용 |
|---|---|
| `kai_cdm_spec.yaml` | 18 테이블 · 178 필드 명세 (매뉴얼 16 · 157 + 보완) |
| `codelists.yaml` | 매뉴얼 설명에서 분리한 코드표(embedded) + OMOP 대표 코드 집합(omop) + 이상사례 코드값(ae) |
| `cohort_profiles.yaml` | 코호트별 테이블 구성 (SACT 는 폐암·유방암·대장암·림프종만), 선택 테이블 `optional_tables` |
| `constraints.yaml` | 매뉴얼에 없는 값 제약과 보완 항목 |
| `concepts.yaml` | 가상데이터 생성기와 교차 규칙이 공유하는 대표 concept 목록, 검사 타당 범위 `_MEASUREMENT_CONCEPTS`, 항암제 목록 `_ANTICANCER_DRUGS` |

### 매뉴얼 해석

매뉴얼이 모호하거나 표 사이에 걸쳐 있는 곳은 다음처럼 해석합니다. 이 해석이 명세와 규칙에 들어 있습니다.

| 주제 | 해석 |
|---|---|
| NOTE 필수 열 | 필수는 `note_id`, `note_type_concept_id`, `note_class_concept_id` 세 개뿐입니다. `person_id`, `visit_occurrence_id`, `note_date`, `note_text`, `file_id` 는 선택입니다. 노트의 `person_id` 가 있으면 약물 등이 가리키는 환자와 같아야 합니다(`SEM-COM-012`). |
| SMILES (약물 화학 구조식) | 별도 표를 만들지 않습니다. 매뉴얼의 `DRUG_EXPOSURE.note_id` 설명("AI 학습용 의약품의 화학 구조식(Smiles code)은 Note 레코드로 매핑한다")대로 SMILES 는 NOTE 레코드에 담기고 약물 행이 `note_id` 로 가리킵니다. `DRUG_EXPOSURE.note_id` 와 `sact_id` 는 선택입니다. 가상데이터에서는 SMILES 노트의 `note_class_concept_id` 를 0("No matching concept")으로 둡니다(OMOP 대표 코드 집합에 0 이 들어 있음). |
| `LYMPHOMA.cell_of_origin` | 필수입니다. DLBCL 은 `GCB`·`ABC/non-GCB`·`unclassifiable` 중 하나를 적고, **DLBCL 이 아니면 `NA` 를 입력**합니다(매뉴얼 문구). 그래서 앱은 입력 정규화에서 `NA` 글자를 빈 값으로 바꾸지만 **이 열에서만 글자 `NA` 를 그대로 둡니다**(빈 값이 되면 필수값 누락으로 오인됨). 이 열 값이 이 넷이 아니면 `SEM-LY-001` 이 경고합니다. 한계: 림프종 아형(DLBCL 여부)을 담은 열이 명세에 없으므로 DLBCL 인데 `NA` 라고 잘못 적은 경우나 그 반대는 검출할 수 없습니다. |
| 폐암 `clinical_stage` | 매뉴얼은 AJCC 임상 병기로 `IA, IB, IIA, IIB, IIIA, IIIB, IV 등` 을 적으라고 합니다. AJCC 병기군(0, IA·IA1~IA3, IB, IIA, IIB, IIIA~IIIC, IV·IVA·IVB)이 아니면 `SEM-LC-001` 이 **경고**합니다. 소세포폐암의 제한기/확장기(LD/ED)는 병기군이 아니므로 이 경고에 걸리며 TNM 병기로 바꿔 입력해야 합니다. |
| `diag_rgst_ymd` | **진단정보 등록일**입니다(진단일이 아님). 매뉴얼 설명 "진단정보 등록 연월일"을 따릅니다. 진단일 관계를 검사하는 규칙에 쓰지 않습니다. |
| 약물 투여 빈도·간격 | 매뉴얼 설명 "매일 투여하는 경우 days_supply 값이 반드시 입력되어야 한다"(`frequency_per_day` 가 있으면 `days_supply` 필수, `SEM-COM-006`), "투여 간격이 1일을 초과하는 경우 dosing_number 값이 반드시 입력되어야 한다"(`SEM-COM-007`)는 매뉴얼이 명시한 조건부 필수이므로 **오류**입니다. |
| SACT 연결 | `DRUG_EXPOSURE.sact_id` 는 선택입니다. 항종양제(`_ANTICANCER_DRUGS` 의 ATC L01 계열)인데 `sact_id` 가 없으면 연결 누락 확인을 안내하는 **경고**(`SEM-SACT-005`)만 냅니다. SACT 가 없는 코호트(MASLD, 당뇨병)에서는 `sact_id` 가 항상 비어 있어야 합니다. |
| 치료 차수 | `line_of_therapy` 는 선택 값이며 매뉴얼은 1부터 시작하거나 연속일 것을 요구하지 않습니다. 시작일 순서와 차수의 불일치는 검토용 경고(`SEM-SACT-006`)이고, 종료일이 시작일보다 이른 오류(`SEM-SACT-001`)와 분리합니다. |
| 명세 외 열 | 매뉴얼에 없는 열이 파일에 있으면 `명세에 없는 컬럼: <c>` 경고만 냅니다(검사에는 쓰지 않음). 컬럼 구성 규칙은 **누락된** 열만 오류로 보고하며 별칭은 받지 않습니다. 보완 선택 컬럼은 명세 열이라 이 경고에 걸리지 않고, 없어도 누락이 아닙니다. |
| 원천 코드 (매뉴얼 보완) | 매뉴얼 1.2 ⑦ "원본 코드 유지"를 위해 CONDITION_OCCURRENCE·PROCEDURE_OCCURRENCE·DRUG_EXPOSURE 에 `*_source_value`·`*_source_concept_id` 를 선택 컬럼으로 둡니다. 내면 `*_source_concept_id` 의 정수 형식과(CONCEPT 를 냈을 때) 개념 존재를 경고로 봅니다. 원천 어휘(KCD7·EDI)는 비표준이라 표준 여부는 보지 않습니다. |
| 이상사례 코드값 | `ADVERSE_EVENT` 의 `severity`·`causality`·`seriousness`·`outcome`·`action_taken` `_concept_id` 는 이름과 달리 매뉴얼 자체 코드값(1~6)입니다. 명세 설명에 그렇게 적고, 코드표 `AE.*` 로 검사하며(경고) 표준 용어와 대조하지 않습니다. |
| 표준 용어 테이블 (매뉴얼 보완) | 병원이 사용한 개념만 담은 CONCEPT 일부와 VOCABULARY 를 선택 테이블로 받습니다. 내면 개념 필드마다 존재·표준·영역·어휘(`concept` 규칙)와 배포판 버전(`SEM-VOC-001`)을 경고로 봅니다. `valid_start_date`·`valid_end_date` 는 Athena 원본(YYYYMMDD)과 DB 내보내기(YYYY-MM-DD)를 모두 받도록 문자열입니다. |

## 심각도 원칙

| 심각도 | 기준 | 예 |
|---|---|---|
| error | **명세의 직접 요구사항 및 구조적·논리적 모순**: 표·컬럼 구성, 필수, 타입, PK/FK, 설명 속 코드표, 조건부 필수, 날짜 역전·환자 연결 불일치 등 | 필수값 NULL, PK 중복, 투여 빈도는 있는데 `days_supply` 없음, 방문 종료일이 시작일보다 앞섬 |
| warning | **검토용 제약·임상 개연성**: 명세가 직접 요구하지 않는 범위·대표 코드·휴리스틱과 매뉴얼 보완 항목 | 임상 범위(`constraints.yaml`), OMOP 대표 코드 집합, 이상사례 코드값, 명세 외 열, 검사 타당 범위, 병기군 표기, 치료 차수 확인, 선택 컬럼·선택 테이블 규칙, 표준 용어 대조 |

구조 규칙 410개 중 오류 309 · 경고 101(보완 42개는 모두 경고), 교차 규칙 30개 중 오류 16 · 경고 14입니다.

위 분류는 현재 구현의 검사 심각도입니다. 사업의 제출 승인·반려 기준이나 임상 품질 인증 등급을 자동으로 정하지 않습니다. 규칙의 근거를 문서화한다는 이유만으로 기존 심각도를 변경하지 않습니다.

## 규칙 카탈로그 (`rules/`)

### 구조 규칙 410개 (명세에서 자동 생성)

`rules/generate_structural_rules.py` 가 명세에서 생성하므로 매뉴얼이나 값 제약이 바뀌면 다시 생성합니다. 직접 편집하지 않습니다. 매뉴얼 규칙(ST-0001~0368)을 먼저, 보완 규칙(ST-0369~0410: 선택 컬럼 → 선택 테이블 → 표준 용어)을 뒤에 붙여 매뉴얼 규칙 번호가 바뀌지 않게 합니다.

| 검사 유형 | 규칙 수 | 내용 |
|---|---|---|
| type | 139 | integer / float / date(YYYY-MM-DD) 형식 |
| not_null | 72 | 필수 필드 |
| fk | 30 | 참조무결성 (참조 테이블이 코호트에 없으면 건너뜀) |
| codelist | 27 | 매뉴얼 설명의 코드표, OMOP 대표 코드 집합·이상사례 코드값(경고) |
| concept | 25 | 표준 용어 대조: 개념 존재, 표준·유효, 영역, 허용 어휘 (경고, CONCEPT 를 냈을 때만) |
| range | 24 | 임상 상식 범위 (경고) |
| not_future | 22 | 검증 실행일 이후 날짜 금지 |
| table_present | 16 | 코호트 구성에 있는 표가 제출되어야 함 (선택 표 제외) |
| columns | 18 | 명세의 모든 컬럼이 있어야 함 (누락 컬럼만 보고, 선택 컬럼 제외) |
| extra_columns | 18 | 명세에 없는 컬럼 알림 (경고) |
| pk_unique | 18 | PK 는 비어 있지 않고 유일 |
| must_be_null | 1 | 비항암 코호트(MASLD, 당뇨병)에서 `DRUG_EXPOSURE.sact_id` 는 NULL |

### 교차 테이블 규칙 30개 (수동 작성, `rules_semantic.yaml`)

DuckDB SQL로 작성되어 있어 병원 DBMS로 옮기기 쉽습니다. 각 규칙은 위반 행(person_id, row_key, detail)을 반환합니다. 치환자(`{TODAY}`, `{DISEASE}`, `{DISEASE_PK}`)로 코호트별로 실행됩니다.

| 그룹 | 수 | 규칙 |
|---|---|---|
| 공통 SEM-COM | 13 | 방문 기간, 출생연도·사망일과 이벤트 날짜, 이벤트와 방문의 환자 일치, 약물 기간과 조건부 필수값, 검사 정상범위, 특화 표 연결, 노트 연결. `SEM-COM-013`은 검사·시술·약물 시작일의 연도를 출생연도와 비교 |
| 검사 SEM-MEAS | 7 | 검사일 없음, 검사 결과값 없음, HbA1c·UACR·크레아티닌 단위가 개념별 허용 목록 밖(`SEM-MEAS-003`), 같은 개념들에 숫자 결과는 있는데 단위 없음(`SEM-MEAS-004`), 검사일이 같은 환자의 연결 방문 기간(시작·종료 모두 유효, 양끝 포함) 밖(`SEM-MEAS-005`, 종료일이 없으면 검사하지 않음), measurement_id 만 다르고 환자·방문·검사일·개념·결과·단위가 모두 같은 중복 후보(`SEM-MEAS-006`, 지우지 않고 알리기만 함; 합성 정상 자료에서도 같은 날 크레아티닌 재검사가 우연히 겹쳐 16건 나옴), ER·PR 양성 세포 비율(%) 개념의 value_as_number 가 0~100 밖(`SEM-MEAS-007`; Athena v20260829 에서 확인한 비율 LOINC ER 3016794·36203160, PR 3022156·36203156 만 대상이며 판독·Presence·질량·몰 농도 개념은 제외) (모두 경고) |
| 항암요법 SEM-SACT | 6 | 항암요법 종료일 ≥ 시작일, 항암요법 기간 = 연결 약물 기간(경고), 진행일 ≥ 항암 시작일, 약물-항암요법 환자 일치, 항종양제 투여의 항암요법 연결 확인(경고), line 번호와 시작일 순서 확인(경고, 검토용 휴리스틱: line_of_therapy 는 선택이며 매뉴얼은 1부터 시작·연속을 요구하지 않음) |
| 폐암 SEM-LC | 1 | 임상 병기가 AJCC 병기군 표기인지 (경고) |
| 림프종 SEM-LY | 1 | `cell_of_origin` 값 (경고) |
| 표준 용어 SEM-VOC | 1 | VOCABULARY 의 배포판 버전이 v20260829(`v5.0 29-AUG-26`)인지 (경고, VOCABULARY 를 냈을 때만) |
| 당뇨병 SEM-DM | 1 | 진단 종료일이 입력된 경우 시작일보다 앞서지 않는지 (`SEM-DM-001`, 오류) |

### 알려진 한계

- 앱에는 어휘 파일이 없습니다. 병원이 선택 테이블 CONCEPT 를 내지 않으면 `*_concept_id` 의 **존재·표준 여부는 검사하지 않고** OMOP 대표 코드 집합과의 대조(경고)만 합니다. CONCEPT 를 내더라도 그 CONCEPT 가 실제 Athena 배포판과 같은지는 앱이 확인할 수 없습니다(VOCABULARY 의 버전 행만 봅니다).
- 항종양제 판정은 앱에 내장된 항암제 목록(`_ANTICANCER_DRUGS`)을 씁니다. 목록 밖 약제는 판정되지 않습니다.
- 림프종 아형 열이 없어 DLBCL 인데 `cell_of_origin` 이 `NA` 인 오기입은 검출할 수 없습니다.
- 수치 범위와 문자열 패턴은 임상 상식 범위(예: `age_at_index` 0~110)이며 파일럿 병원 집계로 보정합니다.

## 규칙 편집 (앱의 규칙 설정)

위 YAML 이 **표준 규칙**입니다. 병원은 앱에서 표준 규칙 묶음을 자기 기관에 맞게 조정할 수 있고, 조정은 네 수준으로 나뉩니다. 사용자 안내는 [manual/06-rules.md](../manual/06-rules.md)에 있습니다.

| 수준 | 누가 | 할 수 있는 것 | 결과 규칙의 `origin` |
|---|---|---|---|
| 1 | 사용자 | 규칙 켜기/끄기 (`overrides.disabled`) | `modified` |
| 2 | 사용자 | 심각도 바꾸기(`severity`), 값 범위·정규식·허용 코드 조정(`params`: `min`, `max`, `regex`, `extraCodes`) | `modified` |
| 3 | 사용자 | 양식으로 사용자 규칙 만들기 — 표·필드·검사 유형(`not_null`, `range`, `codelist`, `pattern`, `not_future`)을 고르면 `USR-001` 형 규칙이 생김. SQL 을 쓰지 않음 | `custom` |
| 4 | 관리자 모드 | 표준 교차 규칙의 SQL 교체(`sql`), SQL 로 새 규칙 작성(`ADM-001` 형, `customSql`) | `admin` |

수준 4 는 설정 화면의 **관리자 모드** 단추로 켭니다(비밀번호 없음). 실수로 SQL 을 건드리지 않게 하는 안전장치이지 접근 통제가 아닙니다.

**엔진 쪽 구조** (`dq-ts/src/rules.ts`, `dq-ts/src/types.ts`)

- `RuleOverrides` 가 조정 전체를 담습니다. `effectiveRules(overrides)` 가 표준 규칙에 조정을 입힌 실제 규칙 묶음을, `ruleSetHash(overrides)` 가 그 묶음의 SHA-256 을, `describeOverrides(overrides)` 가 변경 목록(규칙 id, origin, 한국어 변경 내용)을 줍니다. 입력은 엄격히 검증하며(알 수 없는 규칙 id, 맞지 않는 `params`, 잘못된 id 형식은 오류) 정규식은 컴파일해 봅니다.
- 끈 규칙은 실행하지 않고 `status: disabled`, 위반 0건으로 통계에 남으며 `summary.json` 의 `rules_disabled` 에 셉니다.
- 규칙 통계 항목에는 `origin`(`standard`·`modified`·`custom`·`admin`) 이 있어 어떤 규칙이 표준에서 벗어났는지 남습니다. 표준 실행(조정 없음, 관리자 모드 꺼짐)의 `summary.json`·`report.md` 는 Python 참조 구현과 바이트까지 같습니다.

**조정이 남기는 기록**

| 위치 | 내용 |
|---|---|
| `report.md` 의 `## 규칙 설정` | 조정이 있거나 관리자 모드를 쓴 실행에만 붙는 절. 표준 규칙 묶음 해시와 실제 규칙 묶음 해시, 관리자 모드 사용 여부, 변경 표(규칙 id · origin · 변경 내용). 환자 데이터가 아니라 규칙 설정입니다. |
| `rule_results.csv` 의 `origin` 열 | 규칙마다 표준/변경/사용자/관리자 구분 |
| `submission.json` 의 `rule_set` | `standard_hash`, `effective_hash`, `admin_mode`(관리자 모드를 켠 채 실행), `admin_modified`(표준 교차 규칙의 SQL 교체나 `ADM-###` 규칙이 하나라도 있음 — 관리자 모드를 켰다는 사실만으로는 true 가 아님), `disabled`(꺼진 규칙 id), `modified`(`rule_id` 와 변경 내용), `custom`(`USR-###` id), `admin`(관리자 출처 규칙 id). `by_rule` 의 각 규칙에도 `origin` 이 있음 |
| 규칙 설정 파일과 변경 이력 | 앱 데이터 폴더의 `rule-overrides.json`(이 PC 의 설정: 표준과의 차이만 저장)과 `rule-history.jsonl`(설정을 바꿀 때마다 시각·규칙 id·변경 전후·관리자 모드 여부 한 줄씩 추가) |

**중앙 집계.** 중앙은 `submission.json` 의 `rule_set` 과 규칙별 `origin` 으로 표준 규칙의 결과와 그렇지 않은 것을 나눕니다(`pilot/aggregate.py`). `origin` 이 `standard` 인 규칙의 결과만 기관 간 비교(어떤 규칙이 여러 기관에서 우는가)에 쓰고, 끈 규칙·조정한 규칙·사용자 규칙·관리자 규칙의 결과는 `nonstandard_rules.csv` 로 따로 모읍니다. `standard_hash` 가 서로 다른 제출분(규칙 버전이 다름)이 섞여 있거나 `admin_modified` 인 제출분이 있으면 요약에 따로 표시합니다. 관리자 수준 변경이 있는 실행은 규칙 의미 자체가 달라졌으므로 더 조심해서 읽어야 합니다.

규칙을 추가하거나 고치는 방법(표준 규칙)은 [CONTRIBUTING.md](../CONTRIBUTING.md)에 있습니다.
