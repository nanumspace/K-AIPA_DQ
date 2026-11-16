# K-AI 코호트 데이터 품질검증 (Quality Validator)

폐암, 유방암, 대장암, 대사이상지방간(MASLD), 당뇨병, 림프종 6개 질환 코호트 데이터베이스의 **데이터 품질검증 프로그램**입니다. 병원 담당자가 코호트 테이블 파일을 넣고 실행하면, 명세 적합성·완전성·타당성 규칙 389개(코호트마다 252~293개 적용)를 검사해 보고서와 중앙 제출용 집계를 만듭니다. 병원 DB에 접속하지 않고 네트워크 통신도 하지 않습니다.

소개 페이지: **https://nanumspace.github.io/KAI_DQ_App/** (기능, 사용 흐름, 화면, 다운로드, 자료실)

저장소에는 병원 데이터가 없습니다. 검증 프로그램의 개발과 시험에는 같은 명세에서 만든 **가상데이터**만 사용했습니다.

## 검증 기준: 의뢰사 매뉴얼 2026-11-16

검증 기준은 하나입니다. 의뢰사의 **「질환별 데이터 테이블」 매뉴얼 2026-11-16**(`raw/매뉴얼_질환별 데이터 테이블_20261116.xlsx`)이며, 표 16개 · 필드 157개입니다. 매뉴얼에 없는 표나 열은 만들지 않습니다.

| 구분 | 표 |
|---|---|
| 공통 8 | PERSON, VISIT_OCCURRENCE, PROCEDURE_OCCURRENCE, DRUG_EXPOSURE, CONDITION_OCCURRENCE, MEASUREMENT, OBSERVATION, NOTE |
| 질환 본표 6 | LUNG_CANCER, BREAST_CANCER, COLORECTAL_CANCER, MASLD, DIABETES, LYMPHOMA |
| 확장 2 | ADVERSE_EVENT, SACT(항암요법; 폐암·유방암·대장암·림프종만) |

코호트마다 공통 8표 + 질환 본표 + ADVERSE_EVENT를 내고, 폐암·유방암·대장암·림프종은 SACT를 더합니다(표 11개, MASLD·당뇨병은 10개). 병원은 이 표를 직접 채워 넣습니다.

규칙은 두 파일입니다. 구조 규칙 368개(`rules/rules_structural.yaml`)는 명세에서 자동 생성하고, 교차 테이블 SQL 규칙 21개(`rules/rules_semantic.yaml`)는 손으로 작성합니다. 코호트별 적용 규칙은 폐암 284 · 유방암 293 · 대장암 276 · MASLD 256 · 당뇨병 252 · 림프종 285개입니다(코호트 구성에 있는 표의 구조 규칙 + 해당 코호트의 교차 규칙). 심각도 원칙은 **매뉴얼에 적힌 것의 위반은 오류(error), 임상 상식 범위·OMOP 대표 코드·명세에 없는 추가 열 같은 매뉴얼 밖 제약은 경고(warning)** 입니다. 매뉴얼을 어떻게 해석했는지는 [docs/spec-and-rules.md](docs/spec-and-rules.md)에 있습니다.

기관의 사정에 맞춰 규칙을 켜고 끄고, 값 범위를 조정하고, 양식으로 규칙을 보탤 수 있으며(수준 1~3), 관리자 모드에서는 SQL까지 고칠 수 있습니다(수준 4). 표준과 달라진 실행은 보고서와 제출 파일에 그 사실이 남고 중앙은 표준 규칙의 실행과 따로 집계합니다. → [규칙 편집](manual/06-rules.md)

## 무엇이 들어 있나

| 구성 | 위치 | 내용 |
|---|---|---|
| 데스크톱 앱 | `app/` | Electron + React. 병원 담당자가 쓰는 프로그램. Windows 11과 macOS |
| 검증 엔진 (TypeScript) | `dq-ts/` | 앱에 내장되는 엔진. Python 참조 구현과 동등성이 회귀 시험으로 고정됨 |
| 검증 엔진 (Python 참조 구현) | `dq/` | 규칙 의미의 기준. 검출 성능 평가 도구 포함 |
| 기계 판독 명세 | `spec/` | 매뉴얼 → `kai_cdm_spec.yaml`(표 16 · 필드 157), 코드표, 코호트 구성, 값 제약(`constraints.yaml`) |
| 검증 규칙 카탈로그 | `rules/` | 구조 규칙 368개(명세에서 자동 생성) + 교차 테이블 SQL 규칙 21개 |
| 가상데이터 생성기 | `synth/` | 질환별 환자 여정 시나리오, 규칙에서 오류 유형을 뽑는 주입기, 생성된 clean/dirty/good 데이터 |
| 문서 | `docs/` | 설계 원칙, 명세와 규칙, 가상데이터, 엔진과 검출 성능, 재현 방법 |
| 사용자 설명서 | `manual/` | 병원 담당자용 설치·입력·실행·출력물·규칙 편집 안내 |
| 파일럿 키트 | `pilot/` | 파일럿 안내서, 피드백 양식, 중앙용 submission 집계 도구 |

## 빠른 시작

**병원 담당자**는 [Releases](../../releases)에서 설치 파일을 받아 [사용자 설명서](manual/README.md)를 따릅니다. 같은 페이지의 견본 데이터 zip(가상데이터, clean/dirty/good)으로 앱 동작을 먼저 확인할 수 있습니다.

**개발자**는 다음으로 앱을 개발 모드로 띄웁니다.

```bash
cd app && npm install && npm run dev
```

엔진만 명령줄로 실행하려면 표를 `<TABLE>.csv`로 한 폴더에 두고 다음을 실행합니다.

```bash
cd dq-ts && npm install
npm run engine -- --cohort LUNG_CANCER --data <csv 폴더> --out <출력 폴더>
```

전체 파이프라인(명세 → 규칙 → 가상데이터 → 검증 → 성능 평가)을 재현하는 방법은 [docs/reproduce.md](docs/reproduce.md)에 있습니다.

## 검출 성능

가상데이터 6개 코호트(질환당 100명)에서 clean 데이터와 Good Sample은 위반 0건이어야 하고, 규칙에서 역으로 만들어 오류를 주입한 dirty 데이터는 주입 오류가 전부 검출되어야 합니다(`python dq/run_all.py`가 이를 판정합니다). 이 값은 프로그램이 규칙을 정확히 구현했다는 증거이며, **오류를 규칙에서 뽑아 만들었으므로 실제 병원 데이터에서의 민감도나 오탐률에 대한 예측이 아닙니다.** 실데이터에서 규칙이 어떻게 우는지는 파일럿이 답합니다. Good Sample은 합성한 자료이며 임상의의 감수를 받지 않았습니다.

앱은 병원 내보내기 도구의 흔적(BOM, EUC-KR, 대문자 컬럼명, `NULL` 글자, `100001.0`, `2022-01-01 00:00:00`, 세미콜론 구분자, 빈 끝 컬럼)을 검증 전에 걷어 내고 무엇을 걷어 냈는지 보고서에 적습니다. 그 시험은 `app/test/realworld.test.ts` 에 있습니다.

## 릴리스 (빌드 · 서명 · 공증 · 배포)

저장소 루트의 `release.sh` 하나로 macOS DMG 와 Windows 설치 파일을 빌드하고, 코드 서명과 Apple 공증을 거쳐 GitHub Release 에 올립니다. macOS 에서 실행하며, Windows 서명은 SafeNet USB 토큰(GlobalSign EV 인증서)을, macOS 서명은 키체인의 Developer ID 인증서를 씁니다.

**한 번만 준비할 것**

```bash
brew install osslsigncode opensc gh
security add-generic-password -a "$USER" -s kai-safenet-pin -w          # 토큰 PIN (대화식 입력)
xcrun notarytool store-credentials kai-notary --apple-id <Apple ID> --team-id <Team ID>   # 앱 암호 입력
gh auth login
```

**릴리스할 때**

```bash
./release.sh 0.4.0            # 버전을 올리고(커밋) 빌드 → 서명 → 공증 → 검증 → 태그 → GitHub Release
./release.sh                  # package.json 의 현재 버전으로 릴리스
./release.sh --no-publish     # 빌드·서명·공증·검증까지만 (app/release/ 에 산출물)
./release.sh --publish-only   # 위 산출물로 태그와 Release 만
./release.sh --skip-win       # macOS 만 (또는 --skip-mac)
./release.sh --unsigned       # 서명·공증 없는 시험 빌드. 배포 금지
./release.sh --replace        # 같은 버전을 다시 게시 (기존 Release 와 태그 삭제 후)
```

USB 토큰을 꽂고, 변경 사항을 모두 커밋한 뒤 main 브랜치에서 실행합니다. 산출물은 `QualityValidator-<버전>-mac-arm64.dmg`, `QualityValidator-<버전>-win-x64.exe`, `QualityValidator-<버전>-win-arm64.exe`, 견본 데이터 `SampleData-<버전>-*.zip`(코호트별 clean·dirty·good 18개와 전체 묶음 1개), `SHA256SUMS.txt` 입니다. 버전별 변경 사항은 `docs/release-notes/<태그>.md` 에 쓰면 Release 설명 맨 앞에 실립니다. 자세한 동작은 [docs/reproduce.md](docs/reproduce.md)에 있습니다.

## 문서

- [docs/overview.md](docs/overview.md) 배경, 설계 원칙, 5단계 계획
- [docs/spec-and-rules.md](docs/spec-and-rules.md) 매뉴얼 해석, 명세 속성, 규칙 카탈로그, 규칙 편집 구조
- [docs/synthetic-data.md](docs/synthetic-data.md) 생성 프레임워크, 시나리오, 오류 주입, Good Sample
- [docs/engine.md](docs/engine.md) 엔진 세 층, 검출 성능과 해석의 한계, 앱 구조
- [docs/reproduce.md](docs/reproduce.md) 환경, 파이프라인 재현, 앱 빌드와 배포
- [manual/README.md](manual/README.md) 사용자 설명서 ([규칙 편집](manual/06-rules.md) 포함)
- [pilot/README.md](pilot/README.md) 파일럿 키트
- [CONTRIBUTING.md](CONTRIBUTING.md) 규칙 추가와 시험 방법
