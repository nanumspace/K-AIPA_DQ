# K-AIPA DQ · K-AIPA 임상 데이터 품질검증

**K-AIPA Clinical Data Quality Validator** (앱 이름 K-AIPA DQ, 버전 1.0.4)

폐암, 유방암, 대장암, 대사이상지방간(MASLD), 당뇨병, 림프종 **6개 질환 임상 코호트 테이블**이 의뢰사 매뉴얼의 명세에 맞는지 병원 담당자가 직접 점검하는 데스크톱 프로그램입니다. 코호트 테이블 파일을 넣고 실행하면 명세 적합성·완전성·타당성 규칙 433개(코호트마다 295~337개 적용)를 검사해 보고서와 중앙 제출용 집계를 만듭니다. 검증 중 병원 DB에 접속하지 않으며, 입력 데이터를 외부로 보내는 기능이 없습니다. 중앙에 제출하는 것은 사용자가 직접 보내는 집계 파일(`submission.json`)입니다.

소개 페이지: **https://nanumspace.github.io/K-AIPA_DQ/** (기능, 사용 흐름, 화면 예시, 다운로드, 자료실)
저장소: https://github.com/nanumspace/K-AIPA_DQ

## 이 프로그램이 다루는 범위

[K-AIPA](https://k-aipa.org/overview)는 K-AI 신약개발의 전임상·임상 모델개발을 다루는 사업입니다. 이 저장소의 프로그램은 그중 **임상 데이터 품질검증**의 한 부분인 **여섯 질환 코호트 테이블의 검증**만 합니다.

| 하는 일 | 하지 않는 일 |
|---|---|
| 여섯 코호트(폐암·유방암·대장암·MASLD·당뇨병·림프종) 테이블이 매뉴얼 명세에 맞는지 점검 | 전임상 데이터, 오믹스 데이터, AI 모델의 검증 |
| 표 형식·필수값·코드표·날짜 순서·표 사이 연결·임상 상식 범위 점검 | 임상적 적절성의 판정, 임상 데이터 인증, 기관의 승인 |

이 프로젝트는 K-AIPA의 공식 승인·후원을 받았다고 주장하지 않으며, K-AIPA 로고나 명칭의 사용 허락을 받았다는 뜻도 아닙니다. 사업의 공식 내용은 위 링크를 따르세요.

> **주의.** 검증을 통과(위반 0건)했다는 것은 데이터가 이 프로그램의 규칙을 어기지 않았다는 뜻일 뿐, 임상적으로 적절하다거나 임상 승인을 받았다는 뜻이 아닙니다. 또한 앱에는 Athena(OMOP 어휘판)가 들어 있지 않아, 병원이 선택 표 CONCEPT 를 함께 내지 않으면 `concept_id`가 표준 어휘에 있는지는 검사하지 않습니다.

저장소에는 병원 데이터가 없습니다. 검증 프로그램의 개발과 시험에는 같은 명세에서 만든 **가상데이터**만 사용했습니다.

## 검증 기준: 의뢰사 매뉴얼 2026-11-16

검증 기준은 하나입니다. 의뢰사의 **「질환별 데이터 테이블」 매뉴얼 2026-11-16**(`raw/매뉴얼_질환별 데이터 테이블_20261116.xlsx`)이며, 표 16개 · 필드 157개(매뉴얼) + 보완 선택 컬럼 6개·선택 테이블 2개입니다(전체 18표 · 178필드). 선택 컬럼(원천 코드)과 선택 테이블(CONCEPT·VOCABULARY)은 매뉴얼 보완이며 없어도 오류가 아니고, 내면 표준 용어(OHDSI v20260829)와 대조합니다([docs/vocabulary.md](docs/vocabulary.md)). 이 파일은 저장소에 있는 기존 승인본 그대로이며, 이 저장소는 별도의 승인 기관이나 승인 절차를 주장하지 않습니다. 매뉴얼에 없는 표나 열은 만들지 않습니다(위 보완 제외).

| 구분 | 표 |
|---|---|
| 공통 8 | PERSON, VISIT_OCCURRENCE, PROCEDURE_OCCURRENCE, DRUG_EXPOSURE, CONDITION_OCCURRENCE, MEASUREMENT, OBSERVATION, NOTE |
| 질환 본표 6 | LUNG_CANCER, BREAST_CANCER, COLORECTAL_CANCER, MASLD, DIABETES, LYMPHOMA |
| 확장 2 | ADVERSE_EVENT, SACT(항암요법; 폐암·유방암·대장암·림프종만) |

코호트마다 공통 8표 + 질환 본표 + ADVERSE_EVENT를 내고, 폐암·유방암·대장암·림프종은 SACT를 더합니다(표 11개, MASLD·당뇨병은 10개). 병원은 이 표를 직접 채워 넣습니다.

### 규칙의 세 종류와 심각도

규칙은 두 파일입니다. 총 433개 중 구조 규칙 410개(`rules/rules_structural.yaml`, 매뉴얼 유래 368 + 보완 42)는 명세에서 자동 생성하고, 교차 테이블 SQL 규칙 23개(`rules/rules_semantic.yaml`)는 손으로 작성합니다. 보완 규칙은 선택 표·컬럼을 낸 경우에만 실행되고 모두 경고입니다. 코호트별 적용 규칙은 폐암 328 · 유방암 337 · 대장암 320 · MASLD 299 · 당뇨병 295 · 림프종 329개입니다.

| 구분 | 근거 | 심각도 |
|---|---|---|
| 매뉴얼 제약 | 매뉴얼에 적힌 표·필드·타입·PK/FK·필수·코드표 | 위반은 **오류(error)** |
| 표 사이 논리 | 날짜 순서, 방문·약물·사건 연결 등 교차 테이블 규칙 | 규칙마다 오류 또는 경고 (23개 중 오류 14 · 경고 9) |
| 임상 휴리스틱 | 임상 상식 범위, OMOP 대표 코드, 치료 차수 연속성(`SEM-SACT-006`), 명세에 없는 추가 열 | **경고(warning)** |

이 구분과 심각도는 규칙의 의미를 바꾸지 않고 설명한 것입니다. 매뉴얼을 어떻게 해석했는지는 [docs/spec-and-rules.md](docs/spec-and-rules.md)에 있습니다.

기관의 사정에 맞춰 규칙을 켜고 끄고, 값 범위를 조정하고, 양식으로 규칙을 보탤 수 있으며(수준 1~3), 관리자 모드에서는 SQL까지 고칠 수 있습니다(수준 4). 표준과 달라진 실행은 보고서와 제출 파일에 그 사실이 남고 중앙은 표준 규칙의 실행과 따로 집계합니다. → [규칙 편집](manual/06-rules.md)

### 데이터 충실도

규칙 위반과 별개로, 있어야 할 기록이 실제로 있는지(공통 5개·질환별 17개, 모두 22개 항목)를 측정합니다. 결과는 충족 비율과 1인·1년당 중앙값뿐이며 합격·불합격 판정이나 목표값은 없습니다. 환자 단위 목록은 `sufficiency.csv`(기관 내부 전용)에 남고 중앙 제출 파일에는 집계만 들어갑니다. → [docs/data-sufficiency.md](docs/data-sufficiency.md)

## 무엇이 들어 있나

| 구성 | 위치 | 내용 |
|---|---|---|
| 데스크톱 앱 | `app/` | Electron + React. 병원 담당자가 쓰는 프로그램. Windows 11과 macOS |
| 검증 엔진 (TypeScript) | `dq-ts/` | 앱에 내장되는 엔진. Python 참조 구현과 동등성이 회귀 시험으로 고정됨 |
| 검증 엔진 (Python 참조 구현) | `dq/` | 규칙 의미의 기준. 검출 성능 평가 도구 포함 |
| 기계 판독 명세 | `spec/` | 매뉴얼 → `kai_cdm_spec.yaml`(표 16 · 필드 157 + 보완 선택 컬럼 6·선택 테이블 2), 코드표, 코호트 구성, 값 제약(`constraints.yaml`) |
| 검증 규칙 카탈로그 | `rules/` | 433개 = 구조 규칙 410개(명세에서 자동 생성) + 교차 테이블 SQL 규칙 23개 |
| 가상데이터 생성기 | `synth/` | 질환별 환자 여정 시나리오, 규칙에서 오류 유형을 뽑는 주입기, 생성된 clean/dirty/good 데이터 |
| 문서 | `docs/` | 설계 원칙, 명세와 규칙, 가상데이터, 엔진과 검출 성능, 재현 방법, 릴리스 노트 |
| 사용자 설명서 | `manual/` | 병원 담당자용 설치·입력·실행·출력물·규칙 편집 안내 |
| 파일럿 키트 | `pilot/` | 파일럿 안내서, 피드백 양식, 중앙용 submission 집계 도구 |

내부 파일 이름의 일부(`kai_cdm_spec.yaml` 등)와 앱 데이터 폴더 이름(`Quality Validator`)은 기존 설치와의 연속성을 위해 옛 이름을 유지합니다.

## 빠른 시작

**병원 담당자**는 [Releases](https://github.com/nanumspace/K-AIPA_DQ/releases)에서 현재 릴리스의 설치 파일을 받아 [사용자 설명서](manual/README.md)를 따릅니다.

| 파일 | 대상 |
|---|---|
| `K-AIPA-DQ-1.0.4-mac-arm64.dmg` | macOS (Apple Silicon) |
| `K-AIPA-DQ-1.0.4-win-x64.exe` | Windows 10/11 64비트 (x64) |
| `K-AIPA-DQ-1.0.4-win-arm64.exe` | Windows 11 ARM64 |
| `SampleData-1.0.4-all.zip` 및 코호트별 `SampleData-1.0.4-<COHORT>-clean.zip`·`-dirty.zip`·`-good.zip` | 견본 데이터(가상데이터) |
| `K-AIPA-DQ-Criteria-1.0.4.zip` | 명세·규칙 전체 기준 패키지. 기관 조정과 환자 데이터 제외 |
| `SHA256SUMS.txt` | 위 파일의 SHA-256 |

같은 페이지의 견본 데이터 zip으로 앱 동작을 먼저 확인할 수 있습니다. 소개 페이지·자료실은 공개 릴리스 기준으로 배포되며, `main` 브랜치에서 개발 중인 내용과 다를 수 있습니다. 이전 이름(Quality Validator)의 v0.x 릴리스는 [기존 저장소](https://github.com/nanumspace/KAI_DQ_App/releases)에 보존됩니다. 새 앱에서 이전 명세를 선택하는 기능은 없습니다.

**명세·규칙 사용:** 기본 기준은 내장되어 있습니다. **검증 규칙 관리 → 적용 명세 · 컬럼별 규칙 보기**에서 기준을 확인하고 규칙으로 이동합니다. 중앙에서 새 기준을 받으면 **설정 → 검증 기준 패키지**에서 ZIP을 가져와 변경 사항과 기관 조정 충돌을 확인한 뒤 적용합니다. 폴더를 직접 만들 필요가 없습니다. 각 실행은 당시 기준과 기관 조정을 보관하며 이후 변경과 무관하게 조회합니다. [사용 절차](manual/06-rules.md#검증-기준-패키지).

**개발자**는 다음으로 앱을 개발 모드로 띄웁니다.

```bash
cd app && npm install && npm run dev
```

엔진만 명령줄로 실행하려면 표를 `<TABLE>.csv`로 한 폴더에 두고 다음을 실행합니다.

```bash
cd dq-ts && npm install
npm run engine -- --cohort LUNG_CANCER --data <csv 폴더> --out <출력 폴더>
```

전체 파이프라인(명세 → 규칙 → 가상데이터 → 검증 → 성능 평가)과 릴리스 빌드·서명·게시 절차는 [docs/reproduce.md](docs/reproduce.md)에 있습니다.

## 검출 성능과 가상 임상 사례

가상데이터 6개 코호트(질환당 100명)에서 규칙을 만족하도록 만든 clean 데이터는 **오류 등급 위반과 규칙 실행 오류가 0건**이어야 합니다. 다만 임상 치료 차수가 단순 요법 시작일 순서와 다른 경우(유지요법 등) 경고 규칙 `SEM-SACT-006`이 울릴 수 있어, 현재 clean 데이터는 대장암(14건)과 림프종(7건)에서 이 경고 한 가지만 남습니다. 환자 1명의 가상 임상 사례인 Good Sample 6종은 위반이 **0건**입니다. 규칙에서 역으로 만들어 오류를 주입한 dirty 데이터는 주입 오류가 전부 검출되어야 합니다(`python dq/run_all.py`가 이를 판정합니다). 이 값은 프로그램이 규칙을 정확히 구현했다는 증거이며, **오류를 규칙에서 뽑아 만들었으므로 실제 병원 데이터에서의 민감도나 오탐률에 대한 예측이 아닙니다.** 실데이터에서 규칙이 어떻게 우는지는 파일럿이 답합니다.

Good Sample은 "좋은 임상 표준"이 아니라, 공개 임상 근거를 참고해 진단·검사·치료·추적과 표 사이 연결을 보여 주는 **합성 임상 사례 예시**입니다. 임상의의 감수·승인을 받지 않았고, 한 환자의 치료가 모든 환자에게 권하는 지침도 아닙니다. 자세한 근거와 한계는 [docs/synthetic-data.md](docs/synthetic-data.md)에 있습니다.

앱은 병원 내보내기 도구의 흔적(BOM, EUC-KR, 대문자 컬럼명, `NULL` 글자, `100001.0`, `2022-01-01 00:00:00`, 세미콜론 구분자, 빈 끝 컬럼)을 검증 전에 걷어 내고 무엇을 걷어 냈는지 보고서에 적습니다. 그 시험은 `app/test/realworld.test.ts` 에 있습니다.

## 릴리스

서명에 USB 토큰과 키체인이 필요해, 릴리스는 개발자의 macOS에서 저장소 루트의 `release.sh`로 합니다. 설치 파일 이름은 `K-AIPA-DQ-<버전>-<os>-<arch>.<확장자>`입니다. 준비물, 명령, 단계별 동작과 `--publish-only` 의 조건은 [docs/reproduce.md](docs/reproduce.md#릴리스-releasesh)에 있습니다. 버전별 변경 사항은 `docs/release-notes/<태그>.md`이며 Release 설명 맨 앞에 실립니다. 현재 노트: [v1.0.4](docs/release-notes/v1.0.4.md).

## 문서

- [docs/overview.md](docs/overview.md) 배경, 설계 원칙, 5단계 계획
- [docs/spec-and-rules.md](docs/spec-and-rules.md) 매뉴얼 해석, 명세 속성, 규칙 카탈로그, 규칙 편집 구조
- [docs/synthetic-data.md](docs/synthetic-data.md) 생성 프레임워크, 시나리오, 오류 주입, 가상 임상 사례
- [docs/engine.md](docs/engine.md) 엔진 세 층, 검출 성능과 해석의 한계, 앱 구조
- [docs/reproduce.md](docs/reproduce.md) 환경, 파이프라인 재현, 앱 빌드와 릴리스
- [docs/release-notes/v1.0.4.md](docs/release-notes/v1.0.4.md) 1.0.4 릴리스 노트
- [manual/README.md](manual/README.md) 사용자 설명서 ([규칙 편집](manual/06-rules.md) 포함)
- [pilot/README.md](pilot/README.md) 파일럿 키트
- [CONTRIBUTING.md](CONTRIBUTING.md) 규칙 추가와 시험 방법
- [NOTICE](NOTICE), [LICENSE](LICENSE) 저작권·라이선스 고지
