# 기여 안내

## 저장소 구성

| 폴더 | 내용 | 바꿀 때 다시 해야 하는 것 |
|---|---|---|
| `raw/` | 의뢰사 매뉴얼(엑셀) | 명세 재생성 → 구조 규칙 재생성 → 가상데이터 재생성 → 검증 |
| `spec/` | 명세, 코드표, 코호트 구성, 값 제약(`constraints.yaml`), concept | 구조 규칙 재생성 → 가상데이터 재생성 → 검증 |
| `rules/` | 구조 규칙(자동 생성), 교차 테이블 SQL 규칙(수동) | 가상데이터로 검증, 필요하면 오류 주입 유형 추가 |
| `synth/` | 생성 프레임워크, 시나리오, 오류 주입기, Good Sample 생성기 | 전체 파이프라인 재실행 |
| `dq/` | Python 참조 엔진, 검출 성능 평가 | `dq-ts` 동등성 시험 |
| `dq-ts/` | TypeScript 엔진 | `npm test` |
| `app/` | 데스크톱 앱 | `npm run typecheck`, `npm run build`, `npm run smoke` |
| `docs/`, `manual/`, `pilot/` | 공개 문서, 사용자 설명서, 파일럿 키트 | 화면이나 출력물이 바뀌면 설명서를 같이 고침 |

검증 기준은 의뢰사 매뉴얼 2026-11-16 하나입니다. 판을 나누거나 매뉴얼에 없는 표·열을 더하지 않습니다.

## 규칙을 추가하거나 고치기

**구조 규칙**은 직접 편집하지 않습니다. 매뉴얼이 정하는 것(표, 필드, 타입, PK/FK, 필수, 설명 속의 코드표)은 `raw/`의 엑셀이 원천이고, 그 밖의 값 제약(범위, 정규식, OMOP 대표 코드, 제출 범위 밖 FK)은 `spec/constraints.yaml`에 손으로 적습니다. 둘을 고친 뒤 명세와 구조 규칙을 차례로 다시 만듭니다.

```bash
python spec/build_spec.py                    # 매뉴얼 + constraints.yaml → spec/*.yaml
python rules/generate_structural_rules.py    # 명세 → rules/rules_structural.yaml
```

`build_spec.py`는 `constraints.yaml`에 매뉴얼에 없는 필드가 있으면 멈춥니다(매뉴얼이 바뀐 것을 놓치지 않기 위해).

**심각도 원칙.** 매뉴얼에 적힌 것의 위반은 **error**, 임상 상식 범위·OMOP 대표 코드 집합·명세에 없는 추가 열 같은 매뉴얼 밖 제약은 **warning**입니다. 새 규칙의 심각도도 이 기준으로 정합니다. 매뉴얼에 근거 문장이 있으면 규칙의 `desc`에 인용합니다.

**교차 테이블 규칙**은 `rules/rules_semantic.yaml`에 DuckDB SQL로 추가합니다. 규칙 하나는 id(`SEM-<그룹>-<번호>`), 이름, Kahn 분류, 심각도, 적용 코호트(`scope`: `all` 또는 코호트 목록), 필요한 표(`requires`), 설명, SQL을 가집니다. SQL은 위반 행을 `person_id`, `row_key`, `detail` 세 컬럼으로 반환해야 하며, 코호트별 치환자(`{TODAY}`, `{DISEASE}`, `{DISEASE_PK}`)를 쓸 수 있습니다. 보조 표 `_MEASUREMENT_CONCEPTS`, `_ANTICANCER_DRUGS`(`spec/concepts.yaml`)를 쓸 수 있습니다. 기존 규칙을 본떠 작성하면 됩니다.

규칙을 추가했으면 다음 순서로 확인합니다.

1. clean 가상데이터에서 새 규칙의 위반이 0건인지 봅니다. 위반이 있으면 규칙이 틀렸거나 시나리오가 매뉴얼과 다른 것이므로 어느 쪽인지 판단합니다.
2. `synth/inject_faults.py`에 그 규칙이 잡아야 할 오류 주입 유형을 추가하고 `expected_rules`에 규칙 id를 적습니다.
3. 전체 파이프라인을 다시 돌려 주입 오류가 전부 검출되는지 봅니다.

```bash
python dq/run_all.py
cd dq-ts && npm test
```

Python과 TypeScript 엔진은 같은 YAML을 읽으므로 규칙 YAML만 고치면 두 엔진에 같이 반영됩니다. 구조 규칙의 검사 유형을 새로 만드는 경우에만 `dq/engine.py`와 `dq-ts/src/structural.ts` 양쪽을 고치고 동등성 시험을 통과시켜야 합니다. 표준 실행의 `summary.json`·`report.md`는 두 엔진이 바이트까지 같아야 합니다.

### 표준 규칙과 사용자 규칙은 다릅니다

위의 YAML이 **표준 규칙**입니다. 병원이 앱에서 켜고 끄거나, 값을 조정하거나, 양식(USR-###)·SQL(ADM-###, 관리자 모드)로 보탠 규칙은 표준 규칙이 아니며 앱의 규칙 설정에만 있습니다. 앱은 표준 규칙 묶음과 실제로 쓴 규칙 묶음의 해시를 `submission.json`의 `rule_set`에 싣습니다. 규칙 설정 기능(`dq-ts/src/rules.ts`의 `effectiveRules`, `ruleSetHash`, `describeOverrides`)을 고칠 때는 표준 실행의 출력이 한 글자도 달라지지 않아야 합니다. 사용자 관점의 설명은 [manual/06-rules.md](manual/06-rules.md), 구조는 [docs/spec-and-rules.md](docs/spec-and-rules.md)에 있습니다.

## 코드 규약

- Python은 3.10 이상, TypeScript는 strict 모드입니다.
- 커밋 전에 `cd dq-ts && npm test`와 `cd app && npm run typecheck`가 통과해야 합니다. CI가 같은 것을 실행합니다.
- 병원 데이터나 환자 정보를 절대 저장소에 넣지 않습니다. 시험 데이터는 `synth/`의 가상데이터만 씁니다.

## 문제 보고

GitHub Issues에 다음을 적어 주세요.

- 코호트, 사용한 파일 형태(CSV/엑셀/폴더), 운영체제
- 기대한 결과와 실제 결과
- 가능하면 `summary.json` 또는 `rule_results.csv`. `findings.csv`는 환자 단위 정보이므로 첨부하지 않습니다.
