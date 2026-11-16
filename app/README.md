# Quality Validator · K-AI 코호트 데이터 품질검증 앱

Electron + React + TypeScript 데스크톱 앱입니다. 검증 엔진은 `../dq-ts`(TypeScript, DuckDB)를 그대로 번들하며, 명세·규칙은 저장소의 `spec/`, `rules/` YAML 을 읽습니다. Windows 11 과 macOS 양쪽에서 같은 소스로 빌드합니다.

## 명세

명세는 의뢰사 매뉴얼 **2026-11-16** 하나입니다 (표 16개 · 필드 157개, 6개 코호트). 코호트마다 핵심 표 8개(PERSON, VISIT_OCCURRENCE, PROCEDURE_OCCURRENCE, DRUG_EXPOSURE, CONDITION_OCCURRENCE, MEASUREMENT, OBSERVATION, NOTE), 질환 본표 하나, ADVERSE_EVENT 를 쓰고, 폐암·유방암·대장암·림프종은 SACT 를 더합니다. 구조 규칙(`rules/rules_structural.yaml`)은 명세에서 자동 생성되고 교차 규칙(`rules/rules_semantic.yaml`)은 손으로 씁니다. 사이드바 아래 꼬리말이 `매뉴얼 2026-11-16 · 규칙 N개 · 코호트 6개` 로 지금의 규모를 보여 줍니다 (규칙 수는 이 PC 의 사용자·관리자 규칙을 포함합니다).

몇 가지 해석을 앱이 알고 있습니다.

- `진단정보 등록일(diag_rgst_ymd)` 은 진단일이 아니라 진단 정보를 등록한 날짜입니다.
- `LYMPHOMA.cell_of_origin` 은 필수이며 DLBCL 이 아니면 글자 그대로 `NA` 를 적습니다. 입력 정규화가 이 컬럼의 `NA` 를 빈 값으로 바꾸지 않습니다(아래 표).
- NOTE 필수는 `note_id`, `note_type_concept_id`, `note_class_concept_id` 입니다. SMILES(약물 화학 구조)는 NOTE 레코드로 두고 `DRUG_EXPOSURE.note_id` 가 가리킵니다.

## 입력과 출력

**입력**은 코호트 테이블 파일입니다. 세 가지 형태를 받습니다.

| 형태 | 설명 |
|---|---|
| CSV 여러 개 | 파일 하나가 테이블 하나. UTF-8 또는 EUC-KR(자동 변환). 탭 구분(.tsv)도 됨 |
| 엑셀 한 파일 | 시트 하나가 테이블 하나. 날짜 셀은 자동으로 YYYY-MM-DD 로 변환 |
| 폴더 | 위 파일들이 든 폴더를 통째로. **여러 개 넣어도 됩니다.** 폴더에 파일이 직접 없으면 바로 아래 폴더까지 찾습니다 |

폴더를 여럿 넣으면 파일 목록에 어느 폴더에서 왔는지가 함께 나오고, 폴더 하나에서 온 파일을 한꺼번에 뺄 수 있습니다. **같은 이름의 파일이 다른 폴더에서 오면 합쳐 읽습니다** (큰 MEASUREMENT 를 나눠 내보낸 경우 등). 사전 점검이 "2개 파일을 합쳐 읽습니다 (N행 + M행)" 로 알리고, 컬럼 구성이 다르면 없는 자리를 빈 값으로 채운다고 경고합니다. 대응표에서 파일 하나를 직접 고르면 합침이 풀립니다.

**입력 정규화.** 병원 내보내기 도구가 남긴 흔적은 검증 전에 걷어 내고, 무엇을 얼마나 걷어 냈는지 보고서(`report.md` 의 '입력 정규화')와 `submission.json` 에 적습니다. 데이터를 고치는 것이 아니라 표기를 되돌리는 것이라 **뜻이 하나로 정해지는 경우만** 손댑니다.

| 흔적 | 처리 |
|---|---|
| UTF-8 BOM, CRLF, EUC-KR | UTF-8 로 |
| 세미콜론·탭·파이프 구분자 | 첫 줄에서 알아채 쉼표로 |
| 대문자 컬럼명 (`PERSON_ID`) | 소문자 명세 이름으로 |
| 이름 없는 끝 컬럼 (엑셀의 `,,,`) | 버림 |
| 값의 양끝 공백 | 걷음 |
| `NULL` `null` `NA` `N/A` `#N/A` `None` `nan` `NaN` | 빈 값으로. **단 `LYMPHOMA.cell_of_origin` 의 `NA` 는 값이라 그대로 둠** (그 컬럼의 `N/A`·`NULL` 등은 여전히 빈 값) |
| 정수 컬럼의 `100001.0` (pandas·엑셀) | `100001` 로 |
| 날짜 컬럼의 `2022-01-01 00:00:00` (SQL 내보내기) | `2022-01-01` 로 |

`1,234` 같은 천 단위 쉼표, `2022/01/01` 같은 다른 날짜 형식, 엑셀 일련번호 날짜(`45000`)는 손대지 않고 규칙 위반으로 보고합니다. 이 때문에 같은 파일을 명령줄 엔진(`dq-ts`)에 바로 넣었을 때와 위반 수가 다를 수 있습니다. 시험은 `app/test/realworld.test.ts`(흉내 입력 18종)와 `app/test/input.test.ts`(NA 처리)에 있습니다.

파일·시트 이름이 테이블 이름과 다르면 이름 포함 여부와 헤더 유사도(명세 컬럼의 60% 이상)로 자동 대응하고, 화면의 대응표에서 직접 바꿀 수 있습니다. 실행 전 사전 점검이 기본키·person_id 누락, 컬럼 불일치, 날짜 형식 표본을 알려 주며, 오류가 있으면 실행 단추가 잠깁니다. 넣은 파일은 실행 폴더의 `input/` 에 `<TABLE>.csv` (UTF-8) 로 정규화되어 보관됩니다. 사전 점검에서 **없으면 실행을 막는 표**는 환자와 그 코호트의 질환 본표 둘입니다. 나머지 표가 없으면 실행되지만 엔진이 '테이블 없음' 으로 보고하므로, 해당 사례가 없더라도 헤더만 있는 빈 파일을 넣는 편이 낫습니다.

입력 양식은 앱에서 내려받습니다: 엑셀 양식(시트당 테이블 + 명세 시트), CSV 양식 묶음(헤더만), 컬럼 명세서(xlsx), 견본 데이터 3종(clean · dirty · good). 견본 데이터는 설치본에 내장되어 있습니다.

**출력**은 실행마다 다섯 파일입니다.

| 파일 | 내용 | 외부 제출 |
|---|---|---|
| report.md | 검증 보고서 (요약, 분류별 집계, 실패 규칙별 건수, 규칙 설정이 표준과 다르면 `## 규칙 설정` 절). 입력 원문 예시·DB 오류 원문 제외 | 가능 |
| findings.csv | 위반 행 목록 (규칙, 테이블, 행 키, 환자 ID, 상세) | 금지 (환자 단위) |
| rule_results.csv | 규칙 전체의 통과·실패·건너뜀·꺼짐과 위반 수. `origin` 컬럼(standard · modified · custom · admin) | 가능 |
| submission.json | 중앙 제출용 집계 (환자 단위 정보 없음) + `rule_set` | 가능 · 중앙에 보내는 유일한 파일 |
| summary.json | 규칙 단위 요약 (규칙마다 `origin`, DB 오류 원문은 정해진 안내로 대체) | 가능 |

"결과 폴더로 내보내기" 가 다섯 파일과 README 를 폴더 하나에 담습니다.

### submission.json 의 rule_set

```json
"rule_set": {
  "standard_hash": "…",      // 표준 규칙 묶음의 SHA-256 (규칙 버전)
  "effective_hash": "…",     // 이 실행이 실제로 쓴 규칙 묶음의 SHA-256
  "admin_mode": false,       // 실행 시점에 관리자 모드가 켜져 있었는지
  "admin_modified": false,   // 관리자 출처 규칙(SQL 교체 · ADM-###)이 하나라도 있으면 true. 모드를 켰다는 사실만으로는 true 가 아님
  "disabled": [],            // 끈 규칙 ID
  "modified": [],            // 심각도·범위·패턴·코드를 바꾼 규칙: { rule_id, change }
  "custom": [],              // 사용자 규칙 USR-###
  "admin": []                // 관리자가 SQL 을 바꾸거나 더한 규칙 ID
}
```

**중앙 집계 규칙:** `origin` 이 `standard` 가 아닌 규칙(disabled·modified·custom·admin 이 비어 있지 않음)이 있는 제출분은 병원 간 비교에 그대로 쓰지 않고 따로 표시합니다. `admin_modified` 가 true 이면 표준 SQL 이 바뀐 제출분이므로 반드시 표시하고, `standard_hash` 가 다르면 규칙 버전이 다른 제출분입니다. 스키마는 `kai-dq-submission/2` 입니다.

## 규칙 편집 (이 PC 의 설정)

**표준 규칙은 바꿀 수 없습니다.** 이 PC 의 설정만 `userData/rule-overrides.json` 에 덧씌워 저장하고, 엔진이 실행할 때마다 표준 규칙 위에 입힙니다. 모든 변경은 `userData/rule-history.jsonl` 에 시각 · 동작 · 규칙 ID · 바꾸기 전과 후 값(SQL 포함)으로 남습니다. 화면은 '검증 규칙 관리' 입니다.

| 수준 | 할 수 있는 일 |
|---|---|
| 1 | 규칙별 켜기·끄기. 끈 규칙은 실행하지 않고 결과에 `꺼짐` 으로 남음 |
| 2 | 규칙별 심각도(오류·경고) 변경, 허용 범위(min·max), 패턴(정규식), 코드표 규칙의 추가 허용 코드 |
| 3 | '사용자 규칙 추가' 서식: 테이블 → 필드 → 검사 유형(필수값 · 값 범위 · 허용 코드 · 패턴 · 미래 날짜 금지) → 값 → 심각도. `USR-001` 부터 번호가 붙음. SQL 은 쓰지 않음 |
| 4 (관리자 모드) | 표준 교차 규칙의 SQL 수정, SQL 규칙 추가 (`ADM-001` …) |

- **표준으로 되돌리기**: 전체, 그리고 규칙 하나씩(`이 규칙만 표준으로 되돌리기`). 전체는 사용자·관리자 규칙도 지웁니다.
- **내보내기 · 가져오기**: 설정을 JSON 으로 내보내고 다른 PC 에서 가져옵니다. 가져오기는 규칙 ID · 값 · SQL 을 검증하고 통과해야만 바꿉니다(통과하지 못하면 지금 설정 그대로). SQL 이 든 파일은 관리자 모드에서만 받습니다.
- **관리자 모드**: 설정 화면의 단추로 켜고 끕니다(비밀번호 없음). 처음 켤 때 'SQL 규칙을 직접 수정할 수 있습니다. 결과물에 기록됩니다' 확인 창이 한 번 뜹니다. 켜 있는 동안 화면 위에 붉은 '관리자 모드' 띠가 계속 보이고, 켜고 끈 시각이 변경 이력에 남습니다. 앱을 다시 열면 꺼진 채 시작합니다. **끈다고 SQL 변경이 되돌아가지 않습니다** — 되돌리려면 '표준으로 되돌리기' 를 씁니다.
- **SQL 시험**: SQL 은 저장하기 전에 내장 견본(clean · dirty)으로 시험합니다. SQL 오류는 그대로 보여 주고 저장을 막으며, clean 에서 위반이 나오면 확인을 한 번 더 받습니다. dirty 에서 0건이면 오류를 못 잡는다고 알립니다. 시험은 고른 규칙 하나만 켜고 나머지를 끈 채 엔진을 별도 프로세스로 돌립니다.
- **SQL 제한**: 규칙 SQL 은 `person_id, row_key, detail` 을 돌려주는 SELECT(또는 WITH) 하나여야 합니다. 세미콜론으로 나눈 여러 문장, 데이터를 바꾸거나 파일·확장을 건드리는 구문(`COPY` `ATTACH` `INSTALL` `CREATE` `DROP` `read_csv` 등)은 저장 단계에서 거절합니다.
- 실행하는 동안 설정을 바꿔도 그 실행은 시작할 때의 설정으로 끝까지 갑니다.
- 저장된 설정 파일이 깨졌거나 맞지 않으면 앱이 알리고 표준으로 시작하며, 깨진 파일은 이름을 바꿔 보관합니다.

실행 이력 DB 에는 규칙 결과마다 `origin`, 실행마다 끈 규칙 수 · 표준 외 규칙 여부 · 관리자 변경 여부를 저장합니다. 규칙 설정 도입 전에 만든 이력 DB 도 그대로 열립니다(없는 컬럼만 더하고 옛 행은 표준 실행으로 봄).

## 화면

| 메뉴 | 내용 |
|---|---|
| 대시보드 | ① 오류 유형별 통계(도넛, 심각도표) ② 질환별 검증 결과(최신 실행, 오류율 신호등) ③ 적용 검증 규칙 ④ 후속 조치 가이드 ⑤ 실행 이력 추이와 상태 요약 |
| 검증 실행 (첫 화면) | ① 코호트와 파일(드래그 앤 드롭·파일·폴더, 양식 내려받기) ② 테이블 대응표와 사전 점검, 미리보기 ③ 실행과 진행률 ④ 결과와 출력물 5종 |
| 검증 규칙 관리 | 규칙 조회·필터(출처 포함)·검색, 규칙 상세, 켜기·끄기, 심각도·값 조정, 사용자 규칙 추가, 표준으로 되돌리기, 설정 내보내기·가져오기, 변경 이력. 관리자 모드에서 SQL 수정·추가와 시험 |
| 오류 현황 조회 | 실행별 위반 행 조회, 규칙·테이블·심각도·검색 필터, 쪽 넘김, CSV 내보내기 |
| 결과 보고서 | 실행 요약, 실패 규칙(출처 표시), Kahn 분류별 집계, 테이블 행 수, 보고서 원문, 다운로드(.md/.csv/.json) |
| 통계 모니터링 | 실행 이력 목록과 위반 건수·오류율 추이, 실행 기록 삭제 |
| 설정 | 명세·규칙 위치, 관리자 모드, 검증 실행일 기본값, 데이터 위치 |

## 구조

```
app/
├─ src/main/
│  ├─ index.ts     창 · IPC · 엔진 워커 실행 · 규칙 설정 적용 · SQL 시험 · 스모크 모드
│  ├─ ruleset.ts   규칙 설정(덧씌우기): 목록 만들기 · 변경 검증·적용 · 저장 · 변경 이력 · rule_set (Electron 없이 시험 가능)
│  ├─ input.ts     파일 인식(CSV·엑셀) · 인코딩 감지 · 자동 대응 · 사전 점검 · 정규화 · 양식 생성
│  ├─ outputs.ts   출력물 5종 정의 · rule_results.csv · submission.json · 묶음 내보내기
│  ├─ worker.ts    utilityProcess 에서 엔진 실행 (화면이 멈추지 않음), 진행률 전송
│  ├─ db.ts        실행 이력 DuckDB (runs · rule_results · findings)
│  └─ config.ts    userData/config.json
├─ src/preload/index.ts   contextBridge 로 window.api 노출
├─ src/shared/            types.ts (IPC 계약) · labels.ts (검사 유형·심각도 이름표, 조치 안내)
├─ src/renderer/src/      React 화면 (pages/ 7개, components/ui.tsx · RuleForms.tsx, styles.css)
└─ electron.vite.config.ts  @engine → ../dq-ts/src 별칭
```

데이터 흐름: 화면 → IPC → 메인이 워커를 fork(규칙 설정 + 관리자 모드 여부를 함께 전달) → 워커가 `runEngine()` 실행, 진행률 postMessage → 완료 시 `userData/runs/<실행 ID>/` 에 findings.csv · summary.json · report.md 저장 → 메인이 rule_results.csv · submission.json 을 더하고 DB 에 적재 → 화면 갱신.

## 개발

```bash
cd app
npm install            # electron 바이너리가 안 풀리면: node node_modules/electron/install.js
npm run dev            # 개발 모드 (핫 리로드)
npm run typecheck
npx vitest run        # 입력 처리 · NA 처리 · 규칙 설정 · 흉내 입력 시험
npm run build          # out/ 생성
npm run smoke          # 빌드 후 자동 점검 (아래)
```

`npm run smoke` 는 번들된 견본 데이터(`synth/output/{clean,dirty,good}`)로 폐암 clean·good, 당뇨 dirty, 림프종 clean, 폐암 dirty 엑셀, 폴더 2곳 입력을 실행해 위반 수를 확인하고(clean·good 은 0, dirty 는 1 이상), 규칙 설정(끄기 · 심각도 · 범위 · 사용자 규칙 · 관리자 SQL 시험 · SQL 교체 · ADM 규칙)을 적용한 실행의 `rule_results.csv` `origin` 컬럼과 `submission.json` `rule_set` 을 확인한 뒤, 되돌리기까지 점검하고 화면을 PNG 로 찍습니다. 실패가 하나라도 있으면 종료 코드 1 입니다. `KAI_SMOKE_OUT=<폴더>` 로 PNG·로그 위치를 지정합니다. 설치본에서도 돌며(`KAI_SMOKE=1 "release/mac-arm64/Quality Validator.app/Contents/MacOS/Quality Validator"`) 이때는 내장 견본을 씁니다.

개발 모드에서는 명세 위치가 저장소 루트(`app/..`)이고, 실행 이력과 규칙 설정은 OS 의 앱 데이터 폴더(`~/Library/Application Support/kai-quality-validator` 또는 `%APPDATA%`)에 저장됩니다.

## 배포 빌드와 릴리스

배포용 빌드는 저장소 루트의 `release.sh` 가 합니다 (macOS 에서 실행, Windows 는 SafeNet 토큰 서명, macOS 는 Developer ID 서명과 공증). 사용법은 루트 README 의 릴리스 절, 단계별 동작은 `docs/reproduce.md` 에 있습니다.

```bash
../release.sh --no-publish   # 빌드·서명·공증·검증 (release/ 에 산출물)
npm run dist:mac             # 서명·공증 포함 macOS 빌드만 (APPLE_KEYCHAIN_PROFILE 필요)
npm run dist:win             # Windows 빌드만 (토큰 서명 훅 build/sign-win.cjs 가 동작)
```

- `build/icon.svg` 가 앱 아이콘 원본이고 `build/icon.png`(1024×1024)를 electron-builder 가 macOS icns 와 Windows ico 로 변환합니다. SVG 를 고치면 `qlmanage -t -s 1024 -o build build/icon.svg && mv build/icon.svg.png build/icon.png` 으로 다시 만듭니다. 색은 K-AIPA 브랜드(남색 `#003B73`, 파랑 `#275BAB`, 청록 `#00C2D1`)를 따릅니다.
- `build/sign-win.cjs` 는 Windows exe 서명 훅, `build/globalsign-*.pem` 은 서명에 첨부하는 중간 인증서와 검증용 루트 인증서입니다.
- `package.json > build.extraResources` 가 `../spec/*.yaml`, `../rules/*.yaml`, 견본 데이터 `../synth/output/{clean,dirty,good}`(CSV, good 은 README.md 포함)를 `resources/kai/` 아래 저장소와 같은 경로(`spec/`, `rules/`, `synth/output/…`)로 복사하므로 설치본은 명세와 견본을 내장합니다. 견본 zip 은 `node build/pack-samples.cjs <출력> <버전>` 으로 만듭니다: `SampleData-<버전>-<COHORT>-<clean|dirty|good>.zip` 18개와 `SampleData-<버전>-all.zip`. good 은 `README.md` 와 위반 0 인 `dq/reports/good_<COHORT>/summary.json` 이 없으면 만들지 않습니다.
- DuckDB 는 네이티브 모듈이라 `asarUnpack` 으로 풀어 둡니다. 설치본에는 대상 플랫폼의 바이너리만 들어가며(`release.sh` 가 교체), Windows 32비트는 바이너리가 없어 만들지 않습니다.

## 이후 할 일

- 실제 Windows 11 PC 에서 설치·실행 확인 (한글 경로·폰트 포함)
- 자동 업데이트
- 파일럿에서 회수한 submission.json 을 모아 보는 중앙용 화면 (`rule_set` 으로 표준 제출분과 변경 제출분을 가르는 집계 포함)
