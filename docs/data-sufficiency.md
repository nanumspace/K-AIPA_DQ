# 데이터 충실도: 선행 근거와 질환별 기대 데이터 후보 (초안)

> **상태: 검토용 초안 (2026-11-17).** 앱에 아직 구현하지 않았습니다. 아래 후보는 공개 지침·문헌을 근거로 정리한 것이며, 채택 여부·대상·기간·목표치는 **임상 전문가와 의뢰사가 확정**해야 합니다. 의뢰사 매뉴얼(2026-11-16)은 이 항목들을 요구하지 않으므로, 확정되더라도 매뉴얼 위반(오류)과 섞지 않고 별도 축으로 보고합니다.

## 1. 무엇을 평가하려는가

현재 규칙 390개는 **있는 행이 맞게 적혔는가**를 봅니다(적합성·완전성·타당성). 예를 들어 `SEM-MEAS-002` 는 검사 행이 있는데 결과값이 비었는지를 보지만, 어떤 환자에게 체중 기록이 **아예 없는** 경우는 위반 0건으로 지나갑니다. `SEM-COM-009` 도 환자가 질환 특화 테이블에 1행 이상 있는지만 확인합니다.

이 문서가 다루는 것은 **있어야 할 기록이 실제로 있는가**입니다.

| 측면 | 질문 | 예 |
|---|---|---|
| 폭 (breadth) | 해당 환자에게 필요한 종류의 기록이 있는가 | 키·체중이 한 번이라도 있는가 |
| 밀도 (density) | 시간에 따라 충분히 반복되는가 | 당뇨 환자의 HbA1c 가 6개월마다 있는가 |

용어는 Weiskopf 등의 완전성 구분(기록 여부·폭·밀도·예측)을 따르고, 지표 정의는 EMA 데이터 품질 프레임워크의 extensiveness(완전성·포괄 범위) 축을 따릅니다. 이 문서에서는 이 축을 **데이터 충실도**라고 부릅니다.

## 2. 선행 근거

### 2.1 기준과 도구

| 출처 | 내용 | 이 앱과의 관계 |
|---|---|---|
| [EMA, Data Quality Framework: application to Real-World Data](https://www.ema.europa.eu/en/documents/other/data-quality-framework-eu-medicines-regulation-application-real-world-data_en.pdf) (EMA/503781/2024, 2026-03-16 CHMP 채택) | extensiveness 축의 지표 예: "X% of patients have 2 or more blood pressure measurements", 진단일 누락 비율을 국가 자료의 기대 누락률과 비교. 임상적으로 중요한 하위 집단별로 나눠 보라고 권함 | **지표 정의를 그대로 가져올 수 있는 공식 근거** |
| [OHDSI DataQualityDashboard `measurePersonCompleteness`](https://ohdsi.github.io/DataQualityDashboard/articles/checks/measurePersonCompleteness.html) | 테이블에 기록이 하나도 없는 환자 비율(표 단위) | 표 단위에서 멈춤. 개념·질환·시점 단위의 기대치는 없음 |
| [OHDSI DbDiagnostics](https://ohdsi.github.io/DbDiagnostics/articles/DataDiagnosticsSettings.html) | 연구 전에 DB가 쓸 만한지 판정. 모든 환자에게 필요한 영역(`requiredDomains`)과 일부만 있으면 되는 영역(`desiredDomains`), 최소 추적 기간(`requiredDurationDays`)을 지정 | 설정 구조를 참고. DB 전체 요약 통계만 사용하며 환자별 반복 횟수는 보지 않음 |
| [dataquieR](https://doi.org/10.1186/s12874-021-01252-7) (Schmidt 등, 2021) | 연구 코호트용 R 패키지. 지표 34개, 메타데이터로 항목별 누락 계산 | 연구 설계상 정해진 측정 대상. 진료 데이터의 반복 검사 충분성은 범위 밖 |
| [Kahn 등, 2016 조화 용어](https://pmc.ncbi.nlm.nih.gov/articles/PMC5051581/) | 현재 앱이 따르는 체계(적합성·완전성·타당성). 비교표에 Weiskopf의 폭(breadth)·예측은 이 용어 체계가 다루지 않는다고 적음 | 별도 축이 필요하다는 근거 |
| [Flatiron Health, 2024](https://doi.org/10.1200/CCI.23.00046) | 종양 실사용 데이터의 완전성을 "기대되는 원천 기록과 비교해" 평가 | 상용 공정. 공개 도구 아님 |

### 2.2 6개 질환 관련 연구

| 질환 | 출처 | 요점 |
|---|---|---|
| 유방암 | [All of Us DCIS 연구](https://www.ohdsi.org/wp-content/uploads/2024/09/Ostchega-OHDSI-Community-Call-09242024.pdf) (Berman 등, JCO CCI 2024) | NCCN 지침의 검사·1차 치료·수술 후 치료를 기준으로 OMOP 데이터의 다섯 품질 차원을 점검. **지침에서 기대 기록을 뽑는 방식의 선례** |
| 유방·대장·폐 수술 | [All of Us 외과종양 5개 코호트](https://pubmed.ncbi.nlm.nih.gov/40627823) (2025) | 모든 코호트에서 개념 출현 빈도가 낮고 완전성 문제로 "쓸 수 있는가" 평가가 제한됨. 바이오마커가 적어 타당성 분석도 제한 |
| 폐암 | [Ghent 대학병원 OMOP 변환](https://pubmed.ncbi.nlm.nih.gov/42258805) (JMIR 2026) | 변환 전후 환자·기록 수 비교. 흡연력 등 자유 텍스트 변수는 변환에서 제외 |
| 폐암 | [외부 스캔 문서 연구](https://pubmed.ncbi.nlm.nih.gov/36791386) (JCO CCI 2023) | 진행성 비소세포폐암 125명, 변수 30개. 외부 스캔 문서 포함 시 완전성 77.6%, 제외 시 54.3%. 차이는 주로 바이오마커 |
| MASLD | [FIB-4 계산 가능성](https://pubmed.ncbi.nlm.nih.gov/42453838) (Cureus 2026) | 당뇨+MASLD 397명 중 FIB-4 계산에 필요한 검사가 모두 있는 환자 36.0%. AST·ALT가 가장 많이 누락 |
| MASLD | [1차 진료 결손 탐지](https://pubmed.ncbi.nlm.nih.gov/36757410) (Hepatol Commun 2023) | 연간 FIB-4 검사 누락 52%(1129/2154). 이를 **진료 결손**으로 해석 |
| 당뇨병 | [영국 국가 당뇨 감사 NDA](https://digital.nhs.uk/data-and-information/publications/statistical/national-diabetes-audit/report-1-cp-and-tt-data-release-2024-25/nda-report-1-cp-and-tt-data-release-2024-25) | HbA1c·혈압·콜레스테롤·크레아티닌·소변 알부민/크레아티닌비 등 진료 과정이 기록된 비율을 매년 산출. 계산 방식은 같고 목적은 진료 질 |
| 당뇨병 | [스페인 BIFAP 30만 명](https://pubmed.ncbi.nlm.nih.gov/39586146) (IJMI 2025) | HbA1c 누락 10.8%, 공복혈당 21.4%. 누락이 무작위가 아니고 주요 심혈관사건과 연관 |
| 림프종 | [스웨덴](https://pubmed.ncbi.nlm.nih.gov/38988133)·[덴마크](https://pubmed.ncbi.nlm.nih.gov/27336800) 국가 림프종 등록체계, [프랑스 REALYSA](https://pubmed.ncbi.nlm.nih.gov/37874913) | 국가암등록 대조와 의무기록 재추출로 완전성·정확성 측정. 스웨덴은 대부분 누락 <5%, 유지·공고 치료 변수는 높음. 수작업 검증이며 자동 도구는 아님 |
| 국내 | [한국 바이오뱅크 네트워크](https://pubmed.ncbi.nlm.nih.gov/37983215) (2023), [K-CURE 암 임상 라이브러리](https://www.bigdata-cancer.kr/ncc/clinicalLibraryInfo.do) | 규칙 기반 오류율(0.74%)이나 학회 검증 항목 정의서 중심. **질환별 기대 검사 충족도를 평가하는 공개 기준·도구는 찾지 못함** |

### 2.3 근거에서 얻은 설계 원칙

1. **기대 항목은 지침에서 가져온다.** 임의 기준이 아니라 지침 조항을 항목마다 붙인다.
2. **"기록 없음"은 원인을 단정하지 않는다.** 같은 지표가 MASLD·당뇨 연구에서는 진료 결손으로 해석됐다. 실제 미시행, 외부 병원 시행, 추출 누락, 코드 매핑 차이, 자유 텍스트에만 존재(폐암 사례)가 모두 원인이 될 수 있다. 앱은 **데이터 결손 후보**로만 표시한다.
3. **분모를 공정하게 잡는다.** 추적 기간이 짧거나 사망한 환자에게 같은 횟수를 기대하지 않는다. 해당 치료를 받은 환자만 대상으로 삼는다(DbDiagnostics의 최소 추적 기간과 같은 생각).
4. **하위 집단별로 나눠 본다.** 누락이 결과와 연관될 수 있으므로(BIFAP), 연령·병기·치료군별 충족률을 함께 보인다.
5. **목표치는 파일럿 뒤에 정한다.** 처음에는 충족 여부를 판정하지 않고 비율만 보인다.

## 3. 질환별 기대 데이터 후보 (초안)

### 읽는 법

- **현재 판정**: 11/16 명세만으로 앱이 셀 수 있는지입니다.
  - `가능`: 필요한 필드가 명세에 있습니다. 검사 개념 ID만 합의하면 됩니다.
  - `부분`: 일부 구성요소만 있습니다.
  - `불가`: 명세에 담을 자리가 없습니다. 매뉴얼에 필드를 추가하거나 MEASUREMENT 개념을 합의해야 합니다.
- **기준일**: 폐암·유방암·대장암은 `diag_rgst_ymd`, 림프종은 `diagnosis_date`, 당뇨병은 `DIABETES.condition_start_date` 입니다. MASLD 표에는 날짜 필드가 없어 `visit_occurrence_id` 가 가리키는 방문 시작일을 씁니다.
- **기간·횟수**는 근거 문서의 문구가 있는 경우 그대로 옮기고, 없으면 `제안`으로 표시했습니다. 목표 충족률은 모두 **파일럿 후 결정**입니다.
- **개념 ID**는 앱의 가상데이터 카탈로그(`spec/concepts.yaml`)에서 가져왔습니다. 이 카탈로그는 OHDSI Athena 어휘와 대조하지 않았습니다. 매뉴얼은 `measurement_concept_id` 값을 정하지 않으므로, 병원이 실제로 쓰는 개념 집합을 의뢰사와 합의해야 합니다.

### 3.1 공통 (6개 코호트)

| ID | 항목 | 대상 | 시점·횟수 | 근거 | 현재 판정 |
|---|---|---|---|---|---|
| EXP-COM-01 | 키 (`3036277`) | 전 환자 | 기준일 전후 1회 이상 (구간 `제안`: 전 365일 ~ 후 90일) | BMI·체표면적 계산의 필수 변수. EMA extensiveness 지표 예 | 가능 |
| EXP-COM-02 | 체중 (`3025315`) | 전 환자 | 위와 같음 | 위와 같음 | 가능 |
| EXP-COM-03 | 항암 요법 시작 전 키·체중 | `SACT` 행이 있는 환자(폐·유방·대장·림프종) | 각 `regimen_start_date` 이전 1회 이상 (구간 `제안`: 전 30일) | [ASCO/ONS 항암 투여 안전 기준](https://www.ons.org/system/files/journal-article-pdfs/ectGuidelines_1.pdf) Standard 1.7: 체중·키를 측정해 기록한다. **같은 문서는 주기마다 체중 측정이 꼭 필요하지는 않다는 연구도 함께 인용하므로 요법 단위로 둡니다** | 가능 |
| EXP-COM-04 | 수행 상태(ECOG) | `SACT` 행 | 요법마다 `SACT.ecog_performance_status` 기록 | ASCO/ONS Standard 1.6.1: 진료·투여일마다 기능/수행 상태를 평가·기록 | 가능 (매뉴얼상 선택 필드라 오류는 아님) |
| EXP-COM-05 | 항암 요법 시작 전 혈구검사(백혈구·호중구·혈색소·혈소판) | `SACT` 행 | 각 요법 시작 전 1회 이상 (구간 `제안`) | ASCO/ONS 기준은 처방서에 검사값 재평가 주기를 적도록 할 뿐(3.9.8.3) 시점을 정하지 않음. **임상 확인 필요** | 가능 |

### 3.2 폐암

| ID | 항목 | 대상 | 시점·횟수 | 근거 | 현재 판정 |
|---|---|---|---|---|---|
| EXP-LC-01 | EGFR·ALK 검사 결과 | 선암(`histologic_diagnosis`=1) 중 진행 병기(`clinical_stage` IV 또는 `stage_iv_diagnosis_date` 있음) | 1회 이상 | [CAP/IASLC/AMP 분자검사 지침 (ASCO 인정)](https://pubmed.ncbi.nlm.nih.gov/29589987) | **불가**: 바이오마커 필드·개념 없음 |
| EXP-LC-02 | 진단 시 흉부 CT (`4059400`) | 전 환자 | 기준일 전후 1회 이상 (구간 `제안`) | 병기 결정 검사. **지침 조항 확인 필요** | 가능 |

### 3.3 유방암

| ID | 항목 | 대상 | 시점·횟수 | 근거 | 현재 판정 |
|---|---|---|---|---|---|
| EXP-BC-01 | HER2 검사 결과 | 침습성 유방암 | 1회 이상 | [ASCO-CAP HER2 검사 지침 2023 (2018 권고 재확인)](https://pubmed.ncbi.nlm.nih.gov/37284804) | **불가**: 바이오마커 필드·개념 없음 |
| EXP-BC-02 | ER·PR 검사 결과 | 침습성 유방암 | 1회 이상 | ASCO-CAP ER/PgR 지침. **원문 확인 필요** | **불가** |
| EXP-BC-03 | 병기 | 전 환자 | 1회 | 유방암 특화 표에 병기 필드 없음 | **불가** |

### 3.4 대장암

| ID | 항목 | 대상 | 시점·횟수 | 근거 | 현재 판정 |
|---|---|---|---|---|---|
| EXP-CRC-01 | MMR 또는 MSI 검사 결과 | 전 환자 | 1회 이상 | [CAP MMR/MSI 지침 요약 (2019)](https://documents.cap.org/documents/cap-18-mmr-msi-for-crc-2019.pdf): 대장암 환자 전원에게 MMR 또는 MSI 검사 권고. [ASCO의 CAP 지침 인정 (2023)](https://pubmed.ncbi.nlm.nih.gov/36603179) | **불가** |
| EXP-CRC-02 | 진단 시 CEA (`3028641`) | 전 환자 | 기준일 전후 1회 이상 (구간 `제안`) | **지침 조항 확인 필요** | 가능 |
| EXP-CRC-03 | RAS 검사 결과 | 전이성 대장암 | 1회 이상 | [ESMO 전이성 대장암 지침](https://www.annalsofoncology.org/article/S0923-7534(26)00108-0/fulltext). **원문 확인 필요** | **불가**: 전이 여부·바이오마커 필드 없음 |

### 3.5 대사이상지방간 (MASLD)

| ID | 항목 | 대상 | 시점·횟수 | 근거 | 현재 판정 |
|---|---|---|---|---|---|
| EXP-MASLD-01 | FIB-4 구성 검사: AST(`3013721`)·ALT(`3006923`)·혈소판(`3024929`) | 전 환자 | 기준일 전후 같은 날 또는 같은 방문에 세 검사 모두 (구간 `제안`) | [AASLD 2023 진료 지침](https://pmc.ncbi.nlm.nih.gov/articles/PMC10735173/): 지방간·의심 환자는 FIB-4로 1차 위험 평가. 실제 계산 가능 비율 36%·52% 결손 보고(2.2절) | 가능 |
| EXP-MASLD-02 | FIB-4 반복 평가 | 당뇨·전당뇨 또는 대사 위험인자 2개 이상 | **1~2년마다** 위 세 검사 | AASLD 2023: "primary risk assessment with FIB-4 should be repeated every 1–2 years" | 부분: 당뇨는 `CONDITION_OCCURRENCE` 로 판정 가능, 위험인자 개수 정의는 확인 필요 |
| EXP-MASLD-03 | 키·체중 또는 BMI(`3038553`) | 전 환자 | 연 1회 이상 (`제안`) | 대사 위험인자 판정에 필요 | 가능 |

### 3.6 당뇨병

| ID | 항목 | 대상 | 시점·횟수 | 근거 | 현재 판정 |
|---|---|---|---|---|---|
| EXP-DM-01 | 진단 시 HbA1c (`3004410`) | 전 환자 | 기준일 전후 1회 이상 | [ADA Standards of Care 2026, 6장](https://pmc.ncbi.nlm.nih.gov/articles/PMC12690178/): "A1C testing should be performed routinely in all people with diabetes at initial assessment and as part of continuing care" | 가능 |
| EXP-DM-02 | 추적 중 HbA1c | 관찰 기간 6개월 이상 환자 | **6개월마다 1회 이상** (연 2회) | ADA 권고 6.2: "at least two times a year" (목표 미달·치료 변경 시 3개월마다) | 가능 (관찰 종료일 정의 필요) |
| EXP-DM-03 | 혈압(`3004249`·`3012888`), 크레아티닌(`3016723`)·eGFR(`3049187`), 지질(`3027114`·`3028437`), 체중 또는 BMI | 관찰 기간 1년 이상 환자 | 연 1회 이상 | [영국 NDA 진료 과정](https://digital.nhs.uk/data-and-information/publications/statistical/national-diabetes-audit/report-1-cp-and-tt-data-release-2024-25/nda-report-1-cp-and-tt-data-release-2024-25). **국내 지침과의 차이 확인 필요** | 가능 (소변 알부민/크레아티닌비·발 검사는 개념 없음) |

### 3.7 림프종

| ID | 항목 | 대상 | 시점·횟수 | 근거 | 현재 판정 |
|---|---|---|---|---|---|
| EXP-LY-01 | 진단 시 LDH (`3022250`) | 전 환자 | 기준일 전후 1회 이상 (구간 `제안`) | [IPI (NEJM 1993)](https://pubmed.ncbi.nlm.nih.gov/8141877): 나이·병기·LDH·수행 상태·결절외 침범 수로 예후 분류 | 가능 |
| EXP-LY-02 | IPI 구성요소 전부 | 공격성 림프종(DLBCL 등) | 진단 시 | 위와 같음 | 부분: 나이(PERSON)·LDH·ECOG(`SACT`)만 있음. **병기·결절외 침범 수 필드 없음** |
| EXP-LY-03 | 진단 시 PET-CT (`4305790`) 또는 골수 생검 (`4023083`) | 전 환자 | 기준일 전후 1회 이상 | 병기 결정 검사. **지침 조항 확인 필요** | 가능 |

### 3.8 요약

| 현재 판정 | 항목 수 | 예 |
|---|---|---|
| 가능 | 14 | 키·체중, 항암 전 키·체중, HbA1c, FIB-4 구성 검사, LDH |
| 부분 | 2 | FIB-4 반복(위험인자 정의), IPI 전체 |
| 불가 | 6 | EGFR·ALK, HER2, ER·PR, 유방암 병기, MMR/MSI, RAS |

**불가 6건은 모두 종양 바이오마커와 병기입니다.** 문헌(2.2절)에서도 이 변수들이 가장 잘 빠지고, AI 모델 개발에서 중요도가 높습니다. 그러나 현재 매뉴얼에는 담을 자리가 없습니다.

## 4. 결과를 어떻게 보일 것인가 (구현 시)

| 수준 | 내용 | 공유 범위 |
|---|---|---|
| 환자 | 항목별 미충족 환자·요법·기간 목록 | 기관 내부 전용 (`findings.csv` 와 같은 취급) |
| 코호트 | 대상 환자 수, 충족 환자 수와 비율, 환자 1인·1년당 횟수 중앙값, 하위 집단별 비율 | 집계만 담아 `submission.json` 에 포함 가능 |

- 보고서에 **"데이터 충실도"** 절을 따로 둡니다. 오류·경고 건수와 규칙 통과율에는 넣지 않습니다.
- 미충족 행에 원천 문자열 단서(예: `measurement_source_value` 에 '체중'·'weight' 가 있는데 개념 ID가 다름)를 함께 보여 매핑 문제를 구분할 수 있게 합니다.
- 기대 항목 정의는 명세·규칙과 같은 방식으로 검증 기준 패키지에 넣어 해시와 실행 스냅샷에 보관합니다.

## 5. 확정이 필요한 질문

1. **채택 범위**: 위 후보 중 무엇을 평가 대상으로 삼는가, 국내 지침(대한당뇨병학회, 대한간학회, 각 암 학회 등)으로 근거를 바꿀 항목은 무엇인가.
2. **바이오마커·병기 표현**: 불가 6건을 평가하려면 매뉴얼에 필드를 추가하거나, MEASUREMENT의 개념·값 표현을 의뢰사와 정해야 합니다. 앱이 임의로 정할 수 없습니다.
3. **개념 집합**: 각 검사의 개념 ID 목록(병원별 로컬 코드 대응 포함)을 Athena 대조로 확정.
4. **기간과 분모**: 기준일 전후 구간, 관찰 종료일(마지막 방문·사망), 최소 관찰 기간.
5. **목표치**: 파일럿 결과를 본 뒤 정할지, 처음부터 둘지.
