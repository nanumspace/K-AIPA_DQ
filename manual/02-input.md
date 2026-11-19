# 2. 입력 파일 준비

프로그램은 코호트 데이터를 **파일**로 받습니다. **표를 직접 채웁니다.** 서식을 따로 채워 변환하는 단계가 없고, 병원 정보시스템에서 뽑은 값과 담당자가 채운 값을 같은 표에 담아 한 번에 넣습니다. 컬럼 이름과 코드값은 의뢰사 매뉴얼(2026-11-16)을 따릅니다. 이 프로그램이 다루는 것은 여섯 질환 코호트 테이블뿐이며, 전임상·오믹스·AI 모델 데이터는 받지 않습니다. 입력 파일에는 환자 단위 정보가 들어 있으므로 기관의 정보보안 정책에 맞게 다루세요. 앱은 넣은 파일을 이 PC 의 앱 데이터 폴더에 정규화한 사본(`input/`)으로도 보관합니다([3장](03-run.md)).

## 어떤 표를 준비하나

코호트마다 질환 본표 하나와 공통 표를 냅니다. 컬럼 이름과 코드값은 앱이 주는 양식(아래 "입력 양식 내려받기")을 그대로 따릅니다.

| 표 | 내용 | 비고 |
|---|---|---|
| PERSON | 환자 | **없으면 실행이 막힙니다** |
| 질환 본표 (`LUNG_CANCER` · `BREAST_CANCER` · `COLORECTAL_CANCER` · `MASLD` · `DIABETES` · `LYMPHOMA`) | 질환별 진단·병기·병리·바이오마커·검사·평가 | **없으면 실행이 막힙니다** |
| VISIT_OCCURRENCE | 방문 | |
| PROCEDURE_OCCURRENCE | 처치 | 원천 코드 `procedure_source_value`·`procedure_source_concept_id` 는 선택 |
| DRUG_EXPOSURE | 약물 | `sact_id`, `note_id` 는 선택. 원천 코드 `drug_source_value`·`drug_source_concept_id` 도 선택 |
| CONDITION_OCCURRENCE | 진단 | 원천 코드 `condition_source_value`·`condition_source_concept_id` 는 선택(아래) |
| MEASUREMENT | 검사 | |
| OBSERVATION | 관찰 | |
| NOTE | 기록 | 필수는 `note_id`, `note_type_concept_id`, `note_class_concept_id` 세 개 |
| ADVERSE_EVENT | 이상사례 | `severity`·`causality`·`seriousness`·`outcome`·`action_taken` `_concept_id` 는 이름과 달리 **매뉴얼 자체 코드값**(1~6)입니다. OMOP 개념 ID 를 넣지 마세요 |
| SACT | 항암요법 (키 `sact_id`) | 폐암·유방암·대장암·림프종만. 대사이상지방간·당뇨병은 없음 |
| CONCEPT | 표준 용어 일부 | **선택**(매뉴얼 보완). 낸 데이터에 쓴 개념만 담습니다(아래) |
| VOCABULARY | 어휘 배포판 | **선택**(매뉴얼 보완). 어휘 버전을 확인합니다 |

표는 폐암·유방암·대장암·림프종이 11개, 대사이상지방간·당뇨병이 10개입니다(SACT 없음). 선택 표 CONCEPT·VOCABULARY 는 이 수에 넣지 않습니다. 표가 빠지면 "테이블 없음"으로 보고되고 그 표에 관한 규칙은 건너뜁니다. **해당 사례가 없더라도 헤더만 있는 빈 파일을 넣는** 편이 좋습니다. 그래야 "없어서 못 본 것"과 "있는데 비어 있는 것"이 구분됩니다. 선택 표와 선택 컬럼은 없어도 "테이블 없음"·"컬럼 누락"이 아니며, 사전 점검이 안내만 합니다.

코호트별 적용 규칙 수는 폐암 331 · 유방암 340 · 대장암 323 · 대사이상지방간 302 · 당뇨병 299 · 림프종 332개입니다. 이 가운데 42개(SACT 가 있는 코호트는 43개)는 선택 표·선택 컬럼 규칙이라 내지 않으면 "건너뜀"이 됩니다.

### 선택 컬럼과 선택 표 (매뉴얼 보완, 1.0.3)

매뉴얼에는 없지만 사업 방침([표준 용어 방침](../docs/vocabulary.md))으로 더한 항목입니다. 내지 않아도 오류가 아니고, 내면 경고 수준으로 검사합니다.

- **원천 코드 컬럼.** 매뉴얼 1.2 ⑦ "원본 코드 유지"를 위해 진단·처치·약물 표 끝에 `*_source_value`(병원 원천 코드 그대로, 예 KCD-8 `C34.1`, EDI 코드)와 `*_source_concept_id`(그 원천 코드의 OMOP 개념 ID, 예 KCD7·EDI 어휘. 없으면 `0`)를 넣을 수 있습니다.
- **CONCEPT.** 낸 표의 `*_concept_id` 값(이상사례 코드값 5개 제외)과 `*_source_concept_id` 값이 가리키는 개념만 OMOP CONCEPT 테이블에서 뽑아 냅니다. 컬럼은 OMOP CONCEPT 와 같은 10개입니다. 앱은 개념마다 CONCEPT 에 있는지, 표준(`standard_concept = S`)·유효한지, 필드에 맞는 영역·어휘인지 봅니다([표준 용어 방침](../docs/vocabulary.md) 2절). 원천 개념은 있는지만 봅니다.
- **VOCABULARY.** OMOP VOCABULARY 테이블 전체(수십 행)를 냅니다. `vocabulary_id = 'None'` 행의 버전이 기준 배포판 `v5.0 29-AUG-26`(v20260829)이 아니면 경고합니다.

병원 OMOP DB 에서 CONCEPT 일부를 뽑는 예(PostgreSQL, 스키마 이름은 기관에 맞게):

```sql
WITH used AS (
  SELECT condition_concept_id AS id FROM cdm.condition_occurrence
  UNION SELECT condition_type_concept_id FROM cdm.condition_occurrence
  UNION SELECT condition_source_concept_id FROM cdm.condition_occurrence
  UNION SELECT drug_concept_id FROM cdm.drug_exposure
  -- … 제출하는 표의 나머지 *_concept_id 컬럼도 같은 식으로 (ADVERSE_EVENT 의 코드값 5개 제외)
)
SELECT c.* FROM cdm.concept c JOIN used u ON c.concept_id = u.id;
```

DB 에서 표준 CSV(쉼표 구분, 따옴표 처리)로 내보내 주세요. `valid_start_date`·`valid_end_date` 는 `YYYY-MM-DD` 와 Athena 의 `YYYYMMDD` 를 모두 받습니다. Athena 에서 받은 원본 CONCEPT.csv 를 잘라 쓰면 개념 이름 속 따옴표(`"`) 때문에 읽기 오류가 날 수 있습니다. 전체 CONCEPT(수백만 행)를 내면 느려지므로 쓴 개념만 냅니다.

### 매뉴얼의 이 부분은 이렇게 채웁니다

- **NOTE.** 필수는 `note_id`, `note_type_concept_id`, `note_class_concept_id` 세 개뿐입니다. `person_id`, `visit_occurrence_id`, `note_date`, `note_text`, `file_id` 는 선택이므로 비워 둘 수 있습니다.
- **약물의 화학 구조식(SMILES).** 별도 표가 없습니다. SMILES 는 NOTE 레코드로 넣고, 그 약물 행(`DRUG_EXPOSURE`)의 `note_id` 가 그 노트를 가리키게 합니다. `DRUG_EXPOSURE.note_id` 와 `sact_id` 는 선택입니다. (견본 데이터의 SMILES 노트는 `note_class_concept_id` 를 0 으로 둡니다.)
- **SACT.** 항암요법 표입니다. 키는 `sact_id` 입니다. 약물이 항종양제(ATC L01)이면 `DRUG_EXPOSURE.sact_id` 를 연결하기를 권하며, 비어 있으면 연결 확인을 안내하는 경고가 납니다. 항암제 판정은 앱에 내장된 항암제 목록을 쓰므로 목록 밖 약은 판정되지 않습니다. SACT 표가 없는 코호트(대사이상지방간·당뇨병)에서는 `sact_id` 를 비워 둡니다.
- **약물 투여 빈도.** `frequency_per_day` 를 적었으면(매일 투여) `days_supply` 도 적어야 합니다. `dosing_interval_day` 가 1일을 넘으면 `dosing_number`(총 투여 횟수)도 적어야 합니다. 둘 다 매뉴얼이 정한 조건부 필수이므로 어기면 **오류**입니다.
- **림프종 `cell_of_origin`.** 필수 열입니다. DLBCL 이면 `GCB`, `ABC/non-GCB`, `unclassifiable` 중 하나를 적고, **DLBCL 이 아니면 글자 `NA` 를 그대로 적습니다.** 다른 열의 `NA` 는 빈 값으로 읽지만 이 열의 `NA` 는 값으로 읽습니다. 림프종 아형 열이 따로 없어서 DLBCL 인데 `NA` 라고 적은 경우는 프로그램이 알아채지 못합니다.
- **폐암 `clinical_stage`.** AJCC 병기군(`IA`, `IB`, `IIA`, `IIB`, `IIIA`, `IIIB`, `IIIC`, `IV` 등)으로 적습니다. 소세포폐암의 제한기/확장기(`LD`/`ED`)로 적으면 경고가 나므로 TNM 병기로 바꿔 입력합니다.
- **`diag_rgst_ymd`.** **진단정보 등록일**입니다(진단일이 아닙니다).
- **필수 여부.** 컬럼 명세서의 필수 열을 기준으로 삼습니다.
- **바이오마커·병기 (1.0.4).** 질환 본표에 필드가 없는 종양 바이오마커와 병기는 **MEASUREMENT 에 LOINC 검사로** 적습니다. 결과는 `value_as_concept_id`(예: 9191 Positive, 9189 Negative, 4126681 Detected, 9190 Not detected, LOINC 답변 MSI-H·Stable·Stage I~IV)나 `value_as_number`(ER·PR %)에 두고, 원문은 `value_source_value` 에 둡니다. 데이터 충실도가 이 기록을 셉니다([데이터 충실도](../docs/data-sufficiency.md)). 앱이 세는 검사는 같은 LOINC 구성요소의 모든 표준 검사입니다(자료실의 '데이터 충실도').

  | 코호트 | 검사 | LOINC 검사 예 (견본 데이터) |
  |---|---|---|
  | 폐암 (선암 IV기) | EGFR, ALK | 3009224 EGFR gene mutations found, 21492143 ALK gene rearrangements by FISH |
  | 유방암 | ER, PR, HER2, 병기 | 3016794 ER %, 3022156 PR %, 3019066 HER2 Ag IHC, 3031548 Derived AJCC stage group |
  | 대장암 | MMR·MSI, RAS(전이성) | 21493972 MSI interpretation, 3012200 KRAS·3001274 NRAS mutations found |

### 알려진 한계

- 선택 표 CONCEPT 를 내지 않으면 concept 코드(`*_concept_id`)가 OMOP 어휘에 있는지, 표준 개념인지는 검증하지 못합니다(어휘가 앱에 없습니다). 이때는 OMOP 대표 코드 목록 대조(경고)만 합니다. CONCEPT 를 내더라도 그 내용이 실제 Athena 배포판과 같은지는 확인하지 못합니다.
- 항종양제 판정은 앱에 내장된 항암제 목록을 씁니다. 목록 밖 약은 `sact_id` 연결 확인에서 잡히지 않습니다.
- 림프종 아형 열이 없어 DLBCL 의 `NA` 오기입은 검출하지 못합니다.

## 받는 파일 형태

| 형태 | 설명 |
|---|---|
| CSV 여러 개 | 파일 하나가 표 하나. UTF-8 또는 EUC-KR(자동 변환). 탭·세미콜론 구분도 알아서 읽습니다 |
| 엑셀 한 파일 | 시트 하나가 표 하나. 날짜 셀은 자동으로 YYYY-MM-DD로 바뀝니다 |
| 폴더 | 위 파일들이 든 폴더. 여러 개 넣어도 됩니다 |

같은 이름의 표가 두 폴더에서 오면 **합쳐 읽습니다**. 사전 점검이 "2개 파일을 합쳐 읽습니다"로 알려 줍니다.

## 값의 형식

| 항목 | 형식 |
|---|---|
| 문자 인코딩 | UTF-8 권장. EUC-KR(CP949)도 자동 인식해 변환합니다 |
| 헤더 | 첫 줄에 컬럼 이름. 명세의 컬럼 이름과 같아야 합니다. 대문자로 나와도(`PERSON_ID`) 알아서 맞춥니다. 명세에 없는 컬럼은 경고만 나고 검사에는 쓰이지 않습니다 |
| 빈 값(NULL) | 빈 문자열. `NULL`, `NA`, `N/A` 같은 글자가 들어 있으면 빈 값으로 읽고 몇 개였는지 보고서에 적습니다. **예외: `LYMPHOMA.cell_of_origin` 열의 `NA`** 는 값으로 읽습니다 |
| 날짜 | `YYYY-MM-DD` (예: 2026-03-15). `2026-03-15 00:00:00` 처럼 시각이 붙어 나오면 날짜만 읽습니다 |
| 정수 | 숫자만. `100001.0` 처럼 `.0` 이 붙어 나오면 정수로 읽습니다 |
| 숫자 | 숫자만. 단위나 천 단위 쉼표(`1,234`)를 넣지 않습니다 — 이것은 고쳐 주지 않고 위반으로 보고합니다 |

위 표의 "알아서 읽는" 것들은 내보내기 도구가 남긴 흔적이라 검증 전에 걷어 내고, 무엇을 얼마나 걷어 냈는지 `report.md` 의 **입력 정규화** 절에 적습니다. 뜻이 하나로 정해지는 경우만 손대며, `2026/03/15` 같은 다른 날짜 형식이나 엑셀 일련번호(`45000`)는 손대지 않고 위반으로 보고합니다.

**입력값이 버려질 수 있으면 실행을 막습니다.** 대소문자 정규화 뒤 같은 이름이 되는 열(`PERSON_ID`와 `Person_Id` 등), CSV에서 이름 있는 헤더보다 칸이 적은 행, 이름 없는 끝 칸의 실제 값은 파일과 행 위치를 알리고 중단합니다. 사전 점검뿐 아니라 실행 직전에도 검사합니다. 끝의 빈 칸만 더 붙은 CSV 흔적과 엑셀의 생략된 빈 끝 칸은 허용합니다.

## 입력 양식 내려받기

**검증 실행** 화면의 **입력 양식 내려받기**에서 받습니다. 같은 파일을 소개 페이지의 [자료실](https://nanumspace.github.io/K-AIPA_DQ/resources.html)에서도 받을 수 있습니다.

| 양식 | 용도 |
|---|---|
| 엑셀 양식 (시트당 테이블, 명세 포함) | 코호트의 표마다 헤더가 채워진 빈 양식. 명세 시트가 함께 들어 있습니다 |
| CSV 양식 묶음 (헤더만) | 표별 CSV 헤더 파일 |
| 컬럼 명세서 (xlsx) | 표·컬럼·한글 이름·타입·필수 여부·값 집합 목록 |
| 견본 데이터 (100명 가상 코호트) | 양식을 채운 예시. 실제 환자와 무관한 가상데이터입니다 |

## 견본 데이터로 먼저 시험하기

앱 안의 견본 데이터는 오류가 없는 clean 데이터입니다. 오류가 잡히는 모습까지 보려면 GitHub Release 페이지의 **견본 데이터**(`SampleData-<버전>-all.zip` 또는 코호트별 zip)를 받습니다. 모두 가상데이터이며 실제 환자와 무관합니다.

| 폴더 | 내용 | 기대 결과 |
|---|---|---|
| `…-<코호트>-clean` | 오류 없는 100명 데이터 | 오류(error) 위반 0건. 대장암·림프종은 경고 `SEM-SACT-006` 이 남을 수 있음(README.txt 의 참조 결과를 따릅니다) |
| `…-<코호트>-dirty` | 규칙에서 역으로 만든 오류를 주입한 데이터 + 정답표 `fault_manifest.csv` | 폴더의 README.txt 에 적힌 위반 건수 |
| `…-<코호트>-good` | 연결된 가상 환자 1명의 기록 | 위반 0건 |

1. zip 을 풀고 폴더 하나(예: `SampleData-<버전>-LUNG_CANCER-dirty`)를 **검증 실행** 화면에 끌어다 놓습니다. 엑셀 입력을 시험하려면 대신 `excel/` 안의 xlsx 파일 하나를 넣습니다. 두 방법의 결과는 같아야 합니다.
2. 폴더 README.txt에 적힌 검증 실행일을 화면의 **검증 기준일**에 넣습니다. 미래 날짜 규칙이 이 날짜를 기준으로 판정합니다.
3. 실행 결과의 위반 건수가 README 의 참조 결과와 같으면 설치가 정상입니다.
4. dirty 폴더의 `fault_manifest.csv`를 열어 어느 행에 어떤 오류를 넣었고 어느 규칙이 잡아야 하는지 확인합니다. **위반 상세**에서 해당 행을 찾아 대조하세요.

**견본 데이터를 읽을 때 알아 둘 것.** dirty 견본의 오류는 검사 규칙을 읽고 그 규칙을 어기도록 만든 것이라, 모두 잡힌다는 사실이 실제 병원 데이터의 오류를 그만큼 잡는다는 뜻은 아닙니다. Good Sample 은 합성한 자료이며 임상의의 감수를 받지 않은, 표가 어떻게 이어지는지 보여 주는 구조 예시입니다.

## 파일 이름

파일이나 시트 이름이 표 이름과 정확히 같지 않아도 됩니다(`person_20261101.csv` 도 됩니다). 프로그램이 이름에 표 이름이 들어 있는지와 헤더가 명세 컬럼과 얼마나 겹치는지(60% 이상)를 보고 자동으로 대응합니다. 자동 대응이 틀렸으면 실행 전 대응표에서 직접 고칠 수 있습니다.

## 자주 생기는 준비 오류

- **PERSON 이 없음.** 실행이 차단됩니다. 모든 표가 환자에 매달리기 때문입니다.
- **기본키나 person_id 컬럼이 없음.** 실행이 차단됩니다. 헤더 이름을 명세와 맞춥니다.
- **질환 본표가 없음.** PERSON 과 마찬가지로 실행이 차단됩니다. 파일 이름이나 시트 이름에 질환 본표 이름(예: `LUNG_CANCER`)을 넣습니다.
- **컬럼이 빠짐.** 매뉴얼의 컬럼이 하나라도 없으면 "컬럼 누락" 오류가 납니다. 앱이 주는 양식을 쓰세요. 컬럼 별칭은 받지 않습니다.
- **날짜가 `2026/03/15`나 `20260315` 형식.** 데이터 타입 불일치로 보고됩니다. `YYYY-MM-DD`로 바꿉니다.
- **한글이 깨져 보임.** EUC-KR 파일을 UTF-8로 잘못 저장한 경우입니다. 원본을 다시 내보냅니다.
