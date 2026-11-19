# 검증 엔진과 앱

엔진은 두 벌입니다. Python 참조 구현(`dq/`)이 규칙 의미의 기준이고, TypeScript 엔진(`dq-ts/`)이 앱에 들어갑니다. 둘은 같은 명세·규칙 YAML을 읽고, 표준 실행의 출력이 바이트까지 같도록 회귀 시험으로 고정되어 있습니다. 코호트마다 적용되는 규칙 수는 [명세와 규칙 카탈로그](spec-and-rules.md)에 있습니다(폐암 285 · 유방암 294 · 대장암 277 · MASLD 257 · 당뇨병 253 · 림프종 286).

## Python 참조 구현 (`dq/`)

```
python dq/engine.py --cohort <COHORT> --data <csv 디렉터리> --out <보고서 디렉터리> [--today YYYY-MM-DD]
```

1. 코호트 구성(`spec/cohort_profiles.yaml`)에 따라 `<TABLE>.csv`를 문자열 그대로 읽습니다.
2. **구조 규칙**은 원본 문자열 위에서 검사합니다 (타입 오류를 잡기 위해). 컬럼 구성 규칙은 누락된 컬럼만, 명세 외 컬럼 규칙은 추가된 컬럼만 보고하며 컬럼 별칭은 받지 않습니다.
3. **교차 테이블 규칙**은 명세 타입으로 변환한 뒤 DuckDB에 적재해 SQL로 실행합니다. 보조 테이블 `_MEASUREMENT_CONCEPTS`(검사 타당 범위), `_ANTICANCER_DRUGS`를 함께 등록합니다.
4. **데이터 충실도**는 같은 DuckDB 연결에서 교차 테이블 규칙 뒤에 계산합니다(아래 문단).
5. 출력: `findings.csv`(위반 행 단위), `sufficiency.csv`(데이터 충실도 미충족 환자·요법, 환자 단위), `summary.json`(규칙 단위 상태와 위반 수, `sufficiency` 집계), `report.md`(사람용 요약, `## 데이터 충실도` 절 포함).

**데이터 충실도.** 규칙 위반과 별개로 29개 기대 데이터 항목(EXP-*)을 셉니다. SQL은 `spec/expected_data.yaml`, Athena 기반 개념 집합 33개는 `spec/concept_sets.yaml`에 있습니다. Python과 TypeScript는 교차 규칙 뒤에 같은 정의를 실행하며 동등성 시험은 `sufficiency.csv`까지 대조합니다.

규칙 통계 항목의 키는 `rule_id, name, category, subcategory, severity, table, fields, check, origin, status, violations, rows_checked, note` 순서이고, `status` 는 `pass | fail | skipped | error | disabled` 입니다. 표준 실행에서 `origin` 은 모두 `standard`, `summary.json` 의 `rules_disabled` 는 0 입니다.

### 검출 성능 평가 (`dq/verify.py`, `dq/run_all.py`)

`python dq/run_all.py` 가 6개 코호트 전부에 대해 생성 → clean 검증 → 오류 주입 → dirty 검증 → Good Sample 검증 → 정답 대조를 실행하고, 결과를 `dq/reports/verification_<COHORT>.{json,md}` 와 `verification_summary.{json,md}` 에 씁니다. 판정 기준은 다음과 같습니다.

- clean 과 Good Sample: 오류 등급 위반과 규칙 실행 오류는 0건 (검증 실행일 `--today 2026-09-07`). Good Sample 은 위반이 전혀 없어야 합니다. clean 에서는 임상 치료 차수가 단순 시작일 순서와 다를 때의 `SEM-SACT-006` 경고(임상 휴리스틱)가 남을 수 있으며 그대로 출력합니다. 그 외 경고는 생성 파이프라인에서 실패시킵니다.
- dirty: 주입한 오류가 모두 검출. 검출 판정은 "기대 규칙 중 하나가 같은 person_id 또는 같은 pk로 findings에 있음"입니다. 주입 오류의 부수 효과로 함께 발화한 규칙(collateral)은 별도로 기록합니다.

기대 결과 값(적용 규칙 수, 위반 건수 등)은 위 보고서와 `dq/reports/<clean|dirty|good>_<COHORT>/summary.json` 에 있고, 자료실([resources.html](https://nanumspace.github.io/K-AIPA_DQ/resources.html))이 이를 읽어 보여 줍니다.

**해석의 한계.** 위 판정을 통과하는 것은 가상데이터가 규칙을 만족하도록 만들어졌고 오류가 규칙에서 역으로 만들어졌기 때문입니다. 프로그램이 규칙을 정확히 구현했다는 증거이지 **실제 병원 데이터에서의 민감도나 오탐률의 예측이 아닙니다.** Good Sample 은 합성한 자료이며 임상의의 감수를 받지 않았습니다. 실제 병원 데이터의 오탐률과 새 오류 유형은 파일럿에서 측정해 규칙과 주입 카탈로그에 추가하고, 같은 방식으로 회귀 시험합니다.

## TypeScript 엔진 (`dq-ts/`)

Electron 앱에 넣기 위해 엔진을 TypeScript로 옮겼습니다. 명세·규칙 YAML과 SQL 규칙은 그대로 읽고, 구조 규칙 검사기는 TypeScript로 다시 썼으며, 교차 규칙은 DuckDB Node 바인딩으로 실행합니다.

6개 코호트 × clean/dirty 실행에서 Python 참조 구현과 규칙 단위 상태·위반 수·위반 행 내용이 완전히 일치합니다(정렬 후 바이트 단위 동일). `npm test`가 단위 시험과 이 동등성 시험을 회귀 시험으로 고정합니다. 이식 중 맞춰야 했던 세부 동작(Python repr의 수치 표기, 정규식 시작 고정, pandas coerce와 DuckDB TRY_CAST 대응)은 `dq-ts/README.md`에 있습니다.

```bash
cd dq-ts && npm install && npm run run-all    # 6개 코호트 clean/dirty 실행 → 검출 성능 → Python 비교
```

### 규칙 설정 (`dq-ts/src/rules.ts`)

TypeScript 엔진은 `EngineOptions` 의 `overrides`(`RuleOverrides`)와 `adminMode` 를 받아 표준 규칙 묶음을 조정해 실행합니다. 켜고 끄기, 심각도·범위·정규식·허용 코드 조정, 양식으로 만든 사용자 규칙(`USR-###`), 관리자 모드의 SQL 교체와 SQL 규칙(`ADM-###`)을 지원하며, 규칙이 표준에서 얼마나 벗어났는지 `origin`(`standard`·`modified`·`custom`·`admin`)과 규칙 묶음 해시로 남깁니다. 조정이 있거나 관리자 모드를 쓴 실행의 `report.md` 에는 `## 규칙 설정` 절이 붙습니다. 구조와 기록 위치는 [명세와 규칙 카탈로그](spec-and-rules.md#규칙-편집-앱의-규칙-설정)에, 사용법은 [사용자 설명서 6장](../manual/06-rules.md)에 있습니다. Python 참조 구현은 표준 규칙만 실행합니다.

## 데스크톱 앱 K-AIPA DQ (`app/`)

Electron + React + TypeScript로 만든 검증 프로그램입니다. Windows 11과 macOS에서 같은 소스로 빌드하며, 검증 중 병원 DB에 접속하지 않고 입력 데이터를 외부로 보내는 기능이 없습니다. 중앙에 제출하는 것은 사용자가 직접 보내는 집계 파일(`submission.json`)뿐입니다. 앱 이름이 이전 릴리스의 Quality Validator 에서 K-AIPA DQ 로 바뀌었습니다.

**입력.** 코호트 테이블 파일(병원이 직접 채운 질환 본표와 공통 표)을 세 가지 형태로 받습니다: CSV 여러 개(UTF-8 또는 EUC-KR, EUC-KR은 자동 변환), 시트당 테이블 하나인 엑셀 한 파일(날짜 셀은 YYYY-MM-DD로 변환), 또는 파일들이 든 폴더. 파일·시트 이름이 테이블 이름과 달라도 이름 포함 여부와 헤더 유사도(명세 컬럼의 60% 이상)로 자동 대응하고, 대응표에서 직접 바꿀 수 있습니다. 실행 전 사전 점검이 기본키·person_id 누락(오류, 실행 차단), 명세 컬럼 불일치, 날짜 형식 표본(주의)을 알려 줍니다. 실행을 막는 표는 PERSON 과 질환 본표입니다. `NULL`·`NA`·`N/A` 같은 글자는 빈 값으로 읽되, `LYMPHOMA.cell_of_origin` 열의 글자 `NA` 는 매뉴얼이 정한 값이므로 그대로 둡니다.

**출력.** 실행마다 여섯 파일이 실행 폴더에 생깁니다.

| 파일 | 내용 | 외부 제출 |
|---|---|---|
| `report.md` | 검증 보고서 (규칙 조정이 있으면 `## 규칙 설정` 절, `## 데이터 충실도` 절 포함) | 가능 |
| `findings.csv` | 위반 행 목록 (규칙, 테이블, 행 키, 환자 ID, 상세) | 금지 (환자 단위) |
| `sufficiency.csv` | 데이터 충실도 미충족 환자·요법과 사유 | 금지 (환자 단위, 기관 내부 전용) |
| `rule_results.csv` | 코호트에 적용된 규칙의 통과·실패·건너뜀·꺼짐과 위반 수, `origin` 열 | 가능 |
| `submission.json` | 중앙 제출용 집계 (환자 단위 정보 없음), `schema: kai-dq-submission/3`, 규칙 설정 요약 `rule_set` 와 데이터 충실도 `sufficiency` 집계 포함 | 가능, 중앙에 보내는 유일한 파일 |
| `summary.json` | 엔진 원본 요약 (`sufficiency` 포함) | 가능 |

**구조.** 화면(React, 샌드박스)은 preload가 노출한 좁은 API로만 메인 프로세스에 요청합니다. 메인이 파일을 인식·정규화하고 엔진을 Electron 유틸리티 프로세스(워커)에서 실행해 진행률을 전달하며, 실행마다 요약·규칙별 결과·위반 행을 사용자 컴퓨터의 DuckDB 이력 DB에 적재합니다. 화면은 검증 실행(첫 화면, 4단계 마법사), 결과 보고서, 오류 현황 조회, 대시보드, 통계 모니터링, 검증 규칙 관리(규칙 조회와 수준 1~3 편집), 설정(관리자 모드 단추 포함) 7개입니다.

**자동 점검.** `npm run smoke`가 가상데이터로 검증을 자동 실행하고 화면을 PNG로 캡처합니다. 기대값은 CLI 와 같습니다.

세부 구조와 개발 방법은 `app/README.md`에 있습니다.
