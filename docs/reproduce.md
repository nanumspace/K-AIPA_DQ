# 재현과 빌드

## 환경

| 구성 | 요구 사항 |
|---|---|
| Python 파이프라인 (`spec/`, `rules/`, `synth/`, `dq/`) | Python 3.10 이상, `pandas`, `numpy`, `pyyaml`, `duckdb`, `openpyxl` |
| TypeScript 엔진 (`dq-ts/`) | Node.js 20 이상 |
| 데스크톱 앱 (`app/`) | Node.js 20 이상. Windows 설치 파일은 Windows에서, macOS DMG는 macOS에서 빌드 |

```bash
pip install pandas numpy pyyaml duckdb openpyxl
```

`uv` 를 쓴다면 `uv run --with pyyaml --with pandas --with numpy --with duckdb --with openpyxl python …` 로 설치 없이 실행해도 됩니다. Windows에서는 `PYTHONIOENCODING=utf-8`을 권장합니다.

## 전체 파이프라인 재현

```bash
python spec/build_spec.py                    # 매뉴얼 엑셀(raw/) + spec/constraints.yaml → 명세·코드표·코호트 구성 (spec/)
python rules/generate_structural_rules.py    # 명세 → 구조 규칙 368개 (rules/rules_structural.yaml)
python dq/run_all.py                         # 생성·검증(clean/dirty/good)·오류 주입·정답 대조를 모두 실행
```

`dq/run_all.py` 는 clean 생성(`synth/output/clean/`) → clean 검증 → 오류 주입(`synth/output/dirty/` + `fault_manifest.csv`) → dirty 검증 → Good Sample 생성(`synth/output/good/`) → Good Sample 검증 → 검출 성능 판정을 코호트 6개에 대해 차례로 돌려 `dq/reports/` 를 만듭니다. 교차 규칙 `rules/rules_semantic.yaml` 은 손으로 고칩니다. 매뉴얼 해석의 근거는 [spec-and-rules.md](spec-and-rules.md)에 있습니다.

주입 오류 검출률은 규칙에서 역으로 만든 오류에 대한 결과이지 실제 병원 데이터의 민감도가 아닙니다. Good Sample 은 합성한 자료이며 임상의의 감수를 받지 않았습니다.

`run_all.py`는 코호트마다 시드를 고정하므로(20260907 + 코호트 순번) 결과가 재현됩니다. 실행 후 `synth/output/`과 `dq/reports/`가 저장소에 든 것과 같은 내용으로 다시 만들어집니다.

`spec/build_spec.py` 는 `raw/매뉴얼_질환별 데이터 테이블_20261116.xlsx` 를 읽습니다. 매뉴얼이 정하지 않는 값 제약(범위, 정규식, OMOP 대표 코드)은 `spec/constraints.yaml` 에서 옵니다. 매뉴얼에 없는 필드가 `constraints.yaml` 에 있으면 멈춥니다.

### 개별 실행

```bash
python synth/generate.py --cohort LUNG_CANCER --n 100 --seed 20260907
python dq/engine.py --cohort LUNG_CANCER --data synth/output/clean/LUNG_CANCER --out dq/reports/clean_LUNG_CANCER --today 2026-09-07
python synth/inject_faults.py --cohort LUNG_CANCER
python dq/engine.py --cohort LUNG_CANCER --data synth/output/dirty/LUNG_CANCER --out dq/reports/dirty_LUNG_CANCER --today 2026-09-07
python dq/verify.py --cohort LUNG_CANCER
python synth/build_good_samples.py            # clean → 질환별 환자 1명 (synth/output/good/)
python synth/check_samples.py                 # clean·good 의 임상·관계 불변식 점검
```

## TypeScript 엔진

```bash
cd dq-ts
npm install
npm run engine -- --cohort LUNG_CANCER --data ../synth/output/clean/LUNG_CANCER --out output/reports/clean_LUNG_CANCER --today 2026-09-07
npm run run-all      # 6개 코호트 clean/dirty 실행 → 검출 성능 평가 → Python 참조와 비교
npm test             # 단위 시험 + 위 전체 실행
```

`npm test`는 저장소에 포함된 `synth/output/`과 `dq/reports/`를 읽습니다. Python 파이프라인을 다시 돌린 뒤라면 두 구현이 같은 데이터를 보고 있는지 확인하세요.

## 데스크톱 앱

```bash
cd app
npm install                      # Electron 바이너리가 안 풀리면: node node_modules/electron/install.js
npm run dev                      # 개발 모드 (핫 리로드)
npm run typecheck
npm run build && npm run smoke   # 빌드 후 자동 점검 (KAI_SMOKE_OUT 으로 캡처 위치 지정)
npm run dist:mac                 # macOS DMG (macOS 에서)
npm run dist:win                 # Windows 설치 파일 (Windows 에서)
```

- 개발 모드에서는 명세 위치가 저장소 루트입니다. 실행 이력은 OS의 앱 데이터 폴더 아래 `Quality Validator` 폴더(macOS `~/Library/Application Support/Quality Validator`, Windows `%APPDATA%\Quality Validator`)에 저장됩니다. 앱 이름을 K-AIPA DQ 로 바꿨어도 v0.4.0 설치의 이력과 규칙 설정이 이어지도록 폴더 이름은 코드에서 고정했습니다(Windows 는 시험하지 않음). 규칙 설정(켜고 끄기, 조정, 사용자 규칙)과 그 변경 이력도 같은 폴더에 있습니다.
- 설치본은 `spec/`, `rules/` YAML과 견본 데이터(`synth/output/clean`)를 `resources/kai/`에 내장합니다.
- DuckDB는 네이티브 모듈이라 `asarUnpack`으로 풀어 둡니다.
- 앱 아이콘은 `app/build/icon.svg`(원본)와 `app/build/icon.png`(1024×1024)입니다. electron-builder가 PNG를 macOS icns와 Windows ico로 변환합니다. SVG를 고치면 `qlmanage -t -s 1024 -o app/build app/build/icon.svg && mv app/build/icon.svg.png app/build/icon.png`으로 다시 만듭니다.

## CI

`.github/workflows/ci.yml`은 push와 pull request마다 TypeScript 엔진의 회귀 시험(`dq-ts`의 `npm test`)과 앱의 타입 검사·빌드를 실행합니다.

## 소개 페이지와 자료실 (GitHub Pages)

`docs/index.html` 한 파일(인라인 CSS·JS, 한/영 전환, 라이트/다크)과 `docs/img/` 캡처가 소개 페이지입니다. 주소는 https://nanumspace.github.io/K-AIPA_DQ/ 입니다. 소개 페이지·자료실은 설치본과 같은 기준을 보여야 하므로 **main 에 push 해도 배포되지 않고**, `.github/workflows/deploy-pages.yml` 이 공개된(정식, 초안·사전 릴리스 제외) GitHub Release 의 태그를 체크아웃해 배포합니다. 릴리스가 게시될 때 자동으로 실행되며, 수동 실행(`workflow_dispatch`)은 배포할 공개 릴리스 태그(예: `v1.0.0`)를 입력합니다. 배포 단계에서 `python docs/build_resources.py` 가 자료실(`resources.html`)이 읽는 `docs/resources/`(코호트별 양식, 컬럼 명세서, 규칙 목록, `data.json`)를 그 태그의 명세·규칙·`dq/reports/*/summary.json` 에서 만듭니다. 다운로드 단추는 GitHub 의 최신 Release 를 읽어 파일 이름과 링크를 스스로 갱신하며(읽지 못할 때를 위한 대체 링크는 v1.0.0), 문서의 설명은 릴리스된 v1.0.0 자산을 기준으로 합니다. 캡처는 `internal/presentations/img/` 원본을 1600px JPEG 로 줄인 것입니다. 이전 저장소(`nanumspace/KAI_DQ_App`)와 그 페이지·릴리스는 그대로 남아 있으며, 이 저장소가 이전 주소를 대신하거나 이전 주소로 연결해 준다고 약속하지 않습니다.

## 릴리스 (`release.sh`)

서명에 USB 토큰과 키체인이 필요하므로 릴리스는 GitHub Actions 가 아니라 개발자의 macOS 에서 `release.sh` 로 합니다. 대상 저장소는 `nanumspace/K-AIPA_DQ` 이고, 설치 파일 이름은 `K-AIPA-DQ-<버전>-<os>-<arch>.<확장자>`, 견본 데이터 이름은 `SampleData-<버전>-…` (바꾸지 않음)입니다.

**한 번만 준비할 것**

```bash
brew install osslsigncode opensc gh
security add-generic-password -a "$USER" -s kai-safenet-pin -w          # 토큰 PIN (대화식 입력)
xcrun notarytool store-credentials kai-notary --apple-id <Apple ID> --team-id <Team ID>   # 앱 암호 입력
gh auth login
```

**릴리스할 때.** `release.sh` 는 버전을 올리지 않습니다. 먼저 `app/package.json`·`app/package-lock.json`(그리고 `dq-ts` 의 같은 파일)의 버전을 직접 고쳐 커밋하고, USB 토큰을 꽂고, 변경 사항을 모두 커밋한 main 브랜치에서 실행합니다. 인자로 버전을 주면 커밋된 앱 버전과 같은지 확인만 합니다.

```bash
./release.sh 1.0.0            # 앱 버전이 1.0.0 인지 확인 후 빌드 → 서명 → 공증 → 검증 → 태그 v1.0.0 → GitHub Release
./release.sh                  # package.json 의 현재 버전으로 릴리스
./release.sh --no-publish     # 빌드·서명·공증·검증까지만 (app/release/ 에 산출물)
./release.sh --publish-only   # app/release/ 에 이미 있는 같은 버전의 산출물로 태그와 Release 만 (main, 깨끗한 작업 트리 필요)
./release.sh --skip-win       # macOS 만 (또는 --skip-mac)
./release.sh --unsigned       # 서명·공증 없는 시험 빌드. 배포 금지
./release.sh --replace        # 같은 버전을 다시 게시 (기존 Release 와 태그 삭제 후)
```

산출물은 `K-AIPA-DQ-<버전>-mac-arm64.dmg`, `K-AIPA-DQ-<버전>-win-x64.exe`, `K-AIPA-DQ-<버전>-win-arm64.exe`, 견본 데이터 `SampleData-<버전>-*.zip`(코호트별 clean·dirty·good 18개와 전체 묶음 1개), `SHA256SUMS.txt` 입니다. 버전별 변경 사항은 `docs/release-notes/<태그>.md` 에 쓰면 Release 설명 맨 앞에 실립니다. 정식 Release 가 게시되면 위 Pages 배포가 이어집니다. 스크립트가 하는 일은 다음 순서입니다.

| 단계 | 내용 |
|---|---|
| 사전 점검 | 토큰 인식과 PIN 로그인, Developer ID 인증서, 공증 프로필, GitHub 로그인, main 브랜치(게시할 때), 커밋되지 않은 변경 없음, 같은 태그·Release 없음 |
| 버전 | `app/package.json` 의 버전을 읽어 태그 `v<버전>` 을 정함. 인자 버전이 다르면 중단 (버전을 올리거나 커밋하지 않음) |
| 빌드 준비 | 타입 검사, `electron-vite build`. 빌드 대상 플랫폼의 DuckDB 바이너리만 `node_modules/@duckdb/` 에 남기고 나머지는 잠시 치움 (Windows 바이너리는 npm 레지스트리에서 받아 `~/Library/Caches/kai-release/` 에 보관) |
| macOS | `electron-builder --mac --arm64`. hardened runtime 으로 Developer ID 서명, 앱 공증과 staple 은 electron-builder 가 `APPLE_KEYCHAIN_PROFILE` 로 수행. 이어서 DMG 자체를 `notarytool` 로 공증하고 staple (오프라인 PC 에서도 경고 없이 열리도록) |
| Windows | x64, arm64 각각 `electron-builder --win`. exe 마다 `app/build/sign-win.cjs` 훅이 `osslsigncode` 로 토큰 서명 (PKCS#11 은 OpenSC 모듈, 중간 인증서 `app/build/globalsign-ev-codesigning-ca-2020.pem` 첨부, RFC 3161 타임스탬프) |
| 견본 데이터 | `app/build/pack-samples.cjs` 가 `synth/output/{clean,dirty,good}` 를 코호트별 zip 18개와 전체 묶음 1개로 만듦. clean/dirty 는 100명 규칙 시험용, good 은 질환별 1명 구조 예시(합성, 임상의 감수 없음). 각 zip 에 CSV·시트별 엑셀, (dirty) 정답표, README.txt, (good) 질환별 README.md. 기대 결과는 `dq/reports/` 의 `summary.json` 에서 읽음 |
| 검증 | `osslsigncode verify`, `spctl -a -t open`, `xcrun stapler validate`, `SHA256SUMS.txt` (설치 파일과 견본 zip) |
| 게시 | 태그 `v<버전>` 생성과 push, `gh release create` 로 DMG·exe·견본 zip·SHA256SUMS 첨부. Release 설명 맨 앞에 `docs/release-notes/<태그>.md` 가 실림. `--replace` 를 주면 같은 버전의 기존 Release 와 태그를 지우고 다시 게시 |

Windows 32비트(x86)는 만들지 않습니다. DuckDB Node 바인딩이 Windows 는 x64 와 arm64 만 제공하고, Windows 11 은 64비트 전용입니다.

환경 변수로 바꿀 수 있는 값: `KAI_NOTARY_PROFILE`(기본 kai-notary), `KAI_PIN_SERVICE`(기본 kai-safenet-pin), `KAI_PKCS11_MODULE`(기본 `/opt/homebrew/lib/opensc-pkcs11.so`), `KAI_TSA_URL`(기본 `http://timestamp.digicert.com`).
