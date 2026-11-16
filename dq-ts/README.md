# dq-ts · 검증 엔진 TypeScript 이식

`dq/engine.py`(Python 참조 구현)를 TypeScript 로 옮긴 것입니다. Electron 데스크톱 앱에 넣기 위한 것으로, 명세·코드표·규칙 YAML 과 교차 테이블 SQL 규칙은 수정 없이 그대로 읽습니다.

## 동등성

6개 코호트 × (clean, dirty, good) 18회 실행에서 Python 참조 구현(`dq/engine.py`)과 `findings.csv`·`report.md` 가 글자 단위로, `summary.json` 이 값과 키 순서까지 일치해야 합니다(`test/equivalence.test.ts`). clean · good 은 위반 0 · 규칙 오류 0, dirty 는 주입 오류를 전부 검출해야 합니다. Python 쪽 보고서는 `python3 dq/run_all.py` 로 만듭니다.

명세는 2026-11-16 의뢰사 매뉴얼 하나뿐입니다(`spec/kai_cdm_spec.yaml`, `spec/codelists.yaml`, `spec/cohort_profiles.yaml`, `rules/rules_structural.yaml`, `rules/rules_semantic.yaml`, `spec/concepts.yaml`).

## 실행

```bash
cd dq-ts
npm install

# 코호트 하나 검증 (출력: findings.csv, summary.json, report.md)
npm run engine -- --cohort LUNG_CANCER --data ../synth/output/clean/LUNG_CANCER --out output/reports/clean_LUNG_CANCER --today 2026-09-07

# 전체: 12회 실행 → 검출 성능 평가 → Python 참조와 비교
npm run run-all

# 회귀 시험 (단위 시험 + 위 전체 실행)
npm test
```

입력 형식은 Python 엔진과 같습니다. `<TABLE>.csv`(UTF-8, 헤더 포함, NULL 은 빈 문자열, 날짜 `YYYY-MM-DD`)를 한 디렉터리에 둡니다. 명세에 없는 컬럼은 `extra_columns` 규칙이 경고로 알립니다(컬럼 누락은 `columns` 규칙, error).

## 구조

```
dq-ts/
├─ src/
│  ├─ types.ts        명세 · 규칙 · 결과 타입
│  ├─ load.ts         YAML 로더 (spec/, rules/ 를 저장소 루트에서 읽음)
│  ├─ csv.ts          CSV 읽기/쓰기 (pandas dtype=str, keep_default_na=False 와 같은 의미)
│  ├─ pyrepr.ts       Python repr 흉내 (detail 문자열을 참조 구현과 글자 단위로 맞춤)
│  ├─ rules.ts        규칙 조정(RuleOverrides) 적용 · effectiveRules · ruleSetHash · describeOverrides
│  ├─ structural.ts   구조 규칙 검사기 (원본 문자열 위에서)
│  ├─ semantic.ts     교차 규칙: 명세 타입으로 변환해 DuckDB 적재 → SQL 실행
│  ├─ engine.ts       엔진 본체 (적재 → 구조 → 교차 → 요약 · 보고서)
│  ├─ cli.ts          명령줄 진입점
│  ├─ verify.ts       검출 성능 평가 (dq/verify.py 이식)
│  ├─ compare.ts      Python 참조 출력과의 동등성 비교
│  └─ run_all.ts      전체 실행기
├─ test/
│  ├─ structural.test.ts   보조 함수 단위 시험
│  ├─ equivalence.test.ts  18회 실행 회귀 시험 (오탐 0 · 재현율 1.00 · Python 동등)
│  └─ overrides.test.ts    규칙 조정 시험
└─ output/            실행 결과 (git 제외)
```

## 참조 구현과 맞춘 세부 동작

- **타입 변환**: pandas `to_numeric / to_datetime(errors="coerce")` 는 DuckDB `TRY_CAST` 로 대응합니다. 정수 컬럼의 `"12.0"` 은 12 로, 무효한 날짜는 NULL 로 갑니다.
- **날짜 형식 검사**: 정규식 일치 뒤 실제 달력 날짜인지 확인합니다 (`2023-02-30` 은 형식은 맞지만 무효).
- **정규식 패턴**: Python `re.match` 는 문자열 시작에만 고정되므로 `^(?:...)` 로 감쌉니다.
- **detail 문자열의 수치 표기**: YAML 의 `1.0` 을 Python 은 `1.0`, JavaScript 는 `1` 로 출력하므로, 범위 경계와 코호트 정의 경계는 YAML 원문 표기를 그대로 씁니다.
- **findings 순서**: 규칙 순서 → 행 순서로 같습니다. 환자 불변 검사는 환자 ID 문자열 순입니다.

## 앱 연동 API (`src/index.ts`)

| 함수 | 용도 |
|---|---|
| `runEngine({ cohort, data, out, today, onProgress, overrides, adminMode })` | 한 번 실행. `onProgress` 로 적재·구조·교차·쓰기 단계의 진행률을 받는다 |
| `setRoot(dir)` / `getRoot()` | 명세·규칙 디렉터리 지정. 앱은 설정값 또는 내장 리소스 경로를 넣는다 |
| `loadSpec()`, `loadProfiles()`, `loadStructuralRules()`, `loadSemanticRules()` | 명세와 표준 규칙 읽기 (규칙 관리 화면, 입력 사전 점검에 사용) |
| `effectiveRules(overrides?)` | 표준 + 조정이 반영된 `{ structural, semantic }` (각 규칙에 `origin`, 끈 규칙은 `disabled`) |
| `ruleSetHash(overrides?)` | 규칙·명세·허용 코드 값·보조 concept·코호트 구성의 SHA-256 (`kai-ruleset-hash/2`). `ruleSetHash(undefined)` 가 표준 해시 |
| `describeOverrides(overrides)` | 변경 목록 `{ rule_id, origin, change }[]` (한국어) |
| `readCsv(path)`, `writeCsv(...)`, `csvCell(v)` | CSV 읽기·쓰기 |
| `verify(cohort, reportsDir)`, `compareRun(...)` | 검출 성능 평가와 Python 비교 (개발용) |

### 규칙 조정 (`RuleOverrides`)

| 수준 | 필드 | 내용 | origin |
|---|---|---|---|
| 1 | `disabled` | 규칙 끄기. 통계에는 `status: "disabled"` 로 남고 실행하지 않는다 | modified |
| 2 | `severity`, `params` | 심각도, range 의 min/max, pattern 의 regex, codelist 의 extraCodes | modified |
| 3 | `customRules` | 서식으로 만드는 사용자 규칙 (`USR-000`). 구조 검사기가 그대로 실행 | custom |
| 4 | `sql`, `customSql` | 표준 교차 규칙 SQL 교체, SQL 규칙 추가 (`ADM-000`). 앱에서 편집할 때만 관리자 모드 필요; 저장된 SQL 은 모드를 꺼도 실행 | admin |

모르는 규칙 id, 맞지 않는 params, 잘못된 id 형식은 `Error` 로 알립니다. SQL 이 잘못되면 그 규칙만 `status: "error"` 와 note 로 남고 실행은 계속됩니다. 관리자 SQL 은 `SELECT`/`WITH` 조회문만 받고, 실행 중에는 외부 파일·네트워크 접근을 막습니다. 조정이 있거나 `adminMode` 이면 `report.md` 맨 위(제목 다음)에 `## 규칙 설정` 절이 들어갑니다.

`adminMode` 는 실행 당시 편집 모드 상태를 기록하며 SQL 실행을 막지 않습니다. 비표준 SQL 은 0행이어도 `person_id`, `row_key`, `detail` 세 반환 열을 검사하고 이름으로 매핑합니다. `runEngine()` 의 반환 Summary 는 앱 내부 진단용으로 DB 오류 원문을 보존하지만, 파일 `summary.json` 및 `report.md` 는 원문을 제외합니다. 입력 원문 예시는 `findings.csv` 에만 남습니다.

## Electron 앱으로 갈 때

`app/` 이 이 방식으로 구현되어 있습니다.

- 엔진은 `runEngine()` 한 함수로 호출됩니다. 앱은 Electron 유틸리티 프로세스(`app/src/main/worker.ts`)에서 실행하고 진행률을 IPC 로 보냅니다.
- 앱은 이 디렉터리를 빌드하지 않고 `../dq-ts/src` 를 `@engine` 별칭으로 직접 번들합니다. DuckDB 는 네이티브 모듈이라 앱의 의존성으로 두고 번들에서 제외합니다.
- 명세·규칙 위치는 `setRoot()` 로 넣습니다. 번들된 환경에서는 `import.meta.url` 이 없을 수 있어 `getRoot()` 가 지연 계산하고 실패 시 작업 디렉터리로 대체합니다.
