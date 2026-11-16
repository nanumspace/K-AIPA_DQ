# 가상데이터

검증 프로그램의 개발과 시험에 쓰는 데이터는 모두 가상데이터입니다. 실제 환자와 무관하며, 같은 시드로 다시 생성하면 같은 내용이 나옵니다. 세 종류가 있고 용도가 다릅니다.

| 종류 | 위치 | 내용 | 용도 |
|---|---|---|---|
| clean | `synth/output/clean/<COHORT>/` | 코호트당 100명. 명세 오류 없이 생성하며 임상 차수 관련 휴리스틱 경고는 보존 | 오류·예상 밖 경고 점검, 엔진 회귀 시험 |
| dirty | `synth/output/dirty/<COHORT>/` | clean 에 규칙에서 역으로 만든 오류를 주입 + `fault_manifest.csv`(정답) | 주입 오류의 검출 여부 점검 |
| good | `synth/output/good/<COHORT>/` | 질환마다 **연결된 가상 환자 1명**의 모든 행 + `README.md` | 근거와 가정을 명시한 합성 임상 사례 및 테이블 연결 예시 |

전체를 다시 만들고 검증하려면 `python dq/run_all.py` 한 줄이면 됩니다(생성 → clean 검증 → 오류 주입 → dirty 검증 → Good Sample 생성·검증 → 검출 성능 판정). 개별 단계는 [reproduce.md](reproduce.md)에 있습니다.

## 용도와 한계

> **recall 의 한계.** 오류 주입은 검사 규칙을 읽고 **그 규칙을 어기는 값**을 만드는 방식입니다. 그래서 «주입 오류를 모두 검출했다»는 결과는 프로그램이 규칙을 정확히 구현했다는 증거일 뿐, 실제 병원 데이터에서 일어나는 오류를 얼마나 잡는지(민감도)나 오탐률의 예측이 **아닙니다**. 실데이터에서의 동작은 파일럿에서 측정합니다.
>
> **Good Sample 의 한계.** Good Sample 은 합성한 자료이며 **임상의의 감수·승인을 받지 않았습니다.** 공개 임상 근거를 참고한 사례별 경과와 테이블 연결을 보여 주지만, 모든 환자에게 동일한 검사·치료를 권하는 지침이나 실데이터 분포의 추정치는 아닙니다. 병원 원천 코드·파일 ID 는 확인할 원본이 없어 꾸며 넣지 않았고, OMOP concept_id 는 기관의 Athena 어휘판과 대조해야 합니다. 생성·자동 점검과 임상 전문가의 적절성 검토는 서로 대체할 수 없습니다.

clean 과 good 은 `--today 2026-09-07` 로 검증했을 때 오류 등급 위반·규칙 실행 오류 0건이어야 합니다. `SEM-SACT-006`은 유지요법이나 보조요법을 새로운 차수로 세지 않는 실제 임상 차수에도 경고를 낼 수 있습니다. 이 경고는 사례·보고서에 그대로 보존하며 그 외 경고는 허용하지 않습니다. dirty 의 주입 오류는 하나도 빠짐없이 검출되어야 합니다. 이 조건은 `dq/verify.py` 와 `dq/run_all.py` 가 판정합니다.

## 생성 프레임워크 (`synth/framework.py`)

- 명세(`spec/kai_cdm_spec.yaml`)에서 표와 컬럼을 읽어 코호트별 `<TABLE>.csv`를 씁니다 (UTF-8, 헤더 포함, NULL은 빈 문자열, 날짜 ISO 8601). 명세에 없는 표·열은 만들지 않습니다.
- numpy 시드 기반이라 같은 시드면 같은 데이터가 나옵니다.
- `Ctx` 헬퍼가 환자·방문·약물 연결과 날짜 관계를 구성합니다. 처방의 복용기간이나 검사 결과 보고일은 내원 당일보다 길거나 늦을 수 있으므로, 방문 밖 날짜를 일괄 오류로 취급하지 않습니다. 약물 종료일은 시작일 + days_supply − 1 입니다.
- 대표 concept(진단, 약물, 검사, 처치, 이상사례)은 `spec/concepts.yaml`에서 가져옵니다. concept id는 OMOP 대표값이며 병원 적용 전 Athena 대조가 필요합니다.

매뉴얼 해석이 반영되는 곳은 다음과 같습니다([명세와 규칙 카탈로그](spec-and-rules.md#매뉴얼-해석)).

- **NOTE**: 필수 열 `note_id`·`note_type_concept_id`·`note_class_concept_id` 만 항상 채웁니다.
- **SMILES**: 약물의 화학 구조식은 NOTE 레코드로 만들고 `DRUG_EXPOSURE.note_id` 가 가리킵니다. `note_class_concept_id` 는 0(No matching concept)입니다.
- **림프종 `cell_of_origin`**: DLBCL 은 GCB·ABC/non-GCB·unclassifiable, 그 밖의 아형은 글자 `NA`.
- **폐암 `clinical_stage`**: AJCC 병기군만 씁니다. 소세포폐암도 LD/ED 가 아니라 TNM 병기로 적습니다.
- **`diag_rgst_ymd`**: 진단정보 등록일(진단 입원 첫날)로 둡니다.

## 질환별 환자 여정 시나리오 (`synth/scenarios/`)

시나리오는 `synth/scenarios/<질환>.py` 에 있고(`lung`, `breast`, `colorectal`, `masld`, `diabetes`, `lymphoma`), 질환 본표는 매뉴얼의 열만 채웁니다.

| 시나리오 | 여정 개요 |
|---|---|
| lung | 진단 입원(CT, 기관지내시경 생검, 병기 평가) → 병기별 치료(I~II 폐엽절제 + 보조항암, III 동시항암방사선, IV 표적·면역항암 병용, 진행 시 2차 요법) → 사이클별 검사와 이상사례 → 추적, 재발, 사망 |
| breast | 유방촬영, 코어 생검, IHC 아형 → 아형별 치료(DCIS, HR+, HER2+, TNBC) → 수술, 방사선, 내분비 치료 line → 전이·재발 |
| colorectal | 대장내시경 생검, CT, 직장암 MRI → 직장암 선행 CCRT, 결장절제/LAR, 장루 → FOLFOX/CAPOX 보조, 전이 치료 → 추적 |
| masld | 복부초음파, 진단, 동반질환, 생활습관 → 섬유화 점수(FIB-4 등)와 검사 → 약물 반복 처방과 이상사례 → 추적, 간경변 진행, 간이식 |
| diabetes | T2DM 진단, 동반질환, HbA1c·혈당·지질·신장 기능 → 분기별 외래, 단계적 약물 강화 → 합병증, 저혈당 이상사례 |
| lymphoma | 림프절 생검, 아형별 면역염색·FISH, PET-CT 병기 → R-CHOP/ABVD 등 치료와 반응 평가 → 재발·불응 시 구제요법, 이식 또는 CAR-T → 추적 |

명세 검증에 통과하는지와 별개로, 임상 사례의 내부 일관성을 `synth/check_samples.py`에서 점검합니다. 모든 규칙을 통과했다는 사실만으로 임상적 적절성이나 실제 오류 검출 성능이 입증되지는 않습니다.

### 임상 타당성 검토 원칙

- 명세 검증과 별도로 내보낸 CSV의 용량 단위, 신장·체중·BMI, 같은 날 AST·ALT·혈소판 기반 섬유화 점수, 요법 구성과 이상사례 후 조치를 점검합니다.
- 체중당/체표면적당 용량과 실제 투여량을 혼동하지 않습니다. 약물의 공통 기본 용량만으로 모든 요법을 생성하지 않으며, 요법별 투여량·투여일·부하/유지용량을 구분합니다.
- 산식을 검증할 수 없거나 입력값이 없는 임상 점수는 임의의 근삿값으로 채우지 않습니다.
- 암의 유지요법·수술 전후 치료를 시작 날짜순으로 새로운 치료 차수라고 간주하지 않습니다. 차수 정의가 확정되지 않은 값은 선택 컬럼을 비워 둡니다.
- 독성의 중증도와 중대성은 다릅니다. 응급실 방문을 입원으로, 처방 중단·교체를 감량으로 기록하지 않습니다.
- 생성기의 환자 선택은 다양한 표와 경과를 보여 주기 위한 것입니다. 반응률·치료 효과·대표성을 추정할 수 없으며, 특정 치료 경로의 의도적인 선택은 사례의 가정입니다.

용량과 요법의 참고 근거:
- [Herceptin 투여량·부하용량·심기능 모니터링](https://www.herceptin.com/hcp/adjuvant-breast-cancer/dosing-and-administration/dosing.html)
- [eviQ R-CHOP21](https://www.eviq.org.au/haematology-and-bmt/lymphoma/other-b-cell-lymphoma/70-r-chop21-rituximab-cyclophosphamide-doxorubici)
- [FDA: Wegovy 비만 적응증 최초 승인(2021-06-04)](https://www.fda.gov/news-events/press-announcements/fda-approves-new-drug-treatment-chronic-weight-management-first-2014)
- [NCI CTCAE v5.0: 저혈당 등급과 이상사례 용어](https://dctd.cancer.gov/research/ctep-trials/for-sites/adverse-events/ctcae-v5-5x7.pdf)
- [CREATE-X: 선행항암 후 잔존 HER2 음성 유방암의 보조 capecitabine](https://www.nejm.org/doi/full/10.1056/NEJMoa1612645)
- [OHDSI SemaglutideNvamd: semaglutide 개념 793143 및 비교 약제 개념 집합](https://ohdsi-studies.github.io/SemaglutideNvamd/protocol.html)

이 근거는 합성 사례를 검토하기 위한 것이며 개별 환자의 치료 처방이나 한국의 허가·급여 적합성을 보증하지 않습니다.

## dirty 데이터와 정답 manifest (`synth/inject_faults.py`)

구조 규칙은 **규칙에서 거꾸로** 만듭니다. 주입기가 규칙(`rules/rules_structural.yaml`)이 무엇을 금지하는지 읽고 그것을 어기는 값을 넣으므로, 규칙을 늘려도 주입이 따라 늘고 정답이 어긋나지 않습니다. 교차 규칙(`rules/rules_semantic.yaml`)은 여러 표가 얽혀 있어 손으로 적었고, 모든 규칙을 한 번 이상 어깁니다.

오류마다 잡아야 할 규칙 id 를 `fault_manifest.csv`(fault_id, fault_type, category, table, pk, person_id, field, original, injected, expected_rules, note)에 기록합니다. `expected_rules` 의 규칙 중 하나라도 같은 person_id 또는 같은 pk 로 `findings.csv` 에 있으면 검출입니다. 주입 오류의 부수 효과로 함께 발화한 규칙(collateral)은 별도로 기록합니다.

| 분류 | 주입 유형 |
|---|---|
| 구조 | 필수값 NULL, PK NULL·중복, FK 고아, 날짜/숫자 형식 오류, 코드표 밖 값, 범위 밖 값, 미래 날짜, 컬럼 누락·추가, 표 누락, 비항암 코호트의 `sact_id` |
| 의미 (공통) | 방문 종료일 < 시작일, 방문일 < 출생연도, 사망 후 이벤트·이상사례, 이벤트-방문 환자 불일치, 약물 종료 < 시작, days_supply 불일치, 투여 빈도는 있으나 days_supply 없음, 투여 간격 > 1일인데 dosing_number 없음, 노트-환자 불일치, 검사 정상범위 하한 > 상한, 검사일·결과값 없음, 특화 표 누락 환자와 방문 환자 불일치 |
| 항암요법·질환별 | SACT 기간·line 번호, 진행일 < 항암 시작, 약물-SACT 환자 불일치, 항종양제의 `sact_id` 누락, 폐암 병기 표기(LD/ED 등), 림프종 `cell_of_origin` 값 |

## 저장소에 포함된 데이터

`synth/output/clean/`, `dirty/`, `good/`을 저장소에 포함합니다. clean·dirty 는 엔진의 회귀 시험용이고 Good Sample 은 환자 1명의 전체 방문·이벤트·질환 기록을 연결한 CSV(질환별 `README.md` 포함)입니다. 환자별 표에 해당 사건이 없으면 헤더만 있는 빈 CSV를 둡니다. 릴리스 zip 에는 코호트별 clean·dirty·good 의 CSV 와 같은 내용의 엑셀이 들어갑니다. 각 폴더의 기대 결과(검증 실행일, 적용 규칙 수, 위반 건수)는 `dq/reports/`의 `summary.json` 에서 옵니다. 다시 만들려면 [reproduce.md](reproduce.md)를 보세요.
