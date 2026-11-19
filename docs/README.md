# 문서 목차

이 폴더는 프로젝트의 공개 설계 문서입니다. 병원 담당자용 사용 안내는 [`../manual/`](../manual/README.md)에 따로 있습니다.

| 문서 | 내용 |
|---|---|
| [overview.md](overview.md) | 배경, 코호트 DB 구조, 설계 원칙 세 가지, 5단계 계획과 현재 상태 |
| [spec-and-rules.md](spec-and-rules.md) | 의뢰사 매뉴얼 2026-11-16 의 기계 판독 명세, 매뉴얼 해석, 심각도 원칙, 규칙 카탈로그(433개), 규칙 편집 구조와 기록 |
| [synthetic-data.md](synthetic-data.md) | 가상데이터(clean·dirty·good) 생성 프레임워크, 환자 여정 시나리오, 오류 주입과 정답 manifest, 한계 |
| [vocabulary.md](vocabulary.md) | 표준 용어 방침: 사용 어휘, 필드별 허용 용어, 앱 반영 계획, 의뢰사 확인 사항 |
| [data-sufficiency.md](data-sufficiency.md) | 데이터 충실도(있어야 할 기록이 실제로 있는가) 선행 근거와 6개 질환 기대 데이터 항목(22개). 1.0.4 부터 엔진·앱에 구현, 규칙 위반과 별개 축, 비율만 보고 |
| [engine.md](engine.md) | 검증 엔진 세 층(Python · TypeScript · 앱), 검출 성능과 해석의 한계, 앱 구조 |
| [reproduce.md](reproduce.md) | 환경 준비, 전체 파이프라인 재현, 앱 개발·빌드·배포, CI |
| [`../manual/06-rules.md`](../manual/06-rules.md) | 병원 담당자용 규칙 편집 안내(수준 1~4) |

`index.html`과 `img/`는 GitHub Pages 소개 페이지(https://nanumspace.github.io/K-AIPA_DQ/)의 원본입니다. main 에 push 해도 배포되지 않고, `.github/workflows/deploy-pages.yml` 이 공개된 정식 릴리스의 태그를 배포합니다. 그래서 사이트는 `main` 의 개발 중인 내용이 아니라 **릴리스된 v1.0.0 자산**과 같은 기준을 보여 줍니다.

`resources.html`은 자료실 페이지입니다. 코호트별 입력 양식(엑셀·CSV), 컬럼 명세서, 검증 규칙 목록, 견본 데이터 기대 결과를 담습니다. 이 페이지가 읽는 `docs/resources/` 는 저장소에 넣지 않습니다. 배포할 때 `python docs/build_resources.py` 가 해당 릴리스 태그의 명세(`spec/kai_cdm_spec.yaml`, `spec/codelists.yaml`, `spec/cohort_profiles.yaml`)와 규칙(`rules/rules_structural.yaml`, `rules/rules_semantic.yaml`), 견본 보고서 요약(`dq/reports/{clean,dirty,good}_<COHORT>/summary.json`)에서 만듭니다. 생성기는 엔진과 같은 기준으로 코호트별 규칙 수를 세고, 그 수가 견본 보고서와 다르면 실패합니다. 의뢰사 원본 자료(`raw/`)는 싣지 않습니다. 로컬에서 미리 보려면 `python docs/build_resources.py` 를 실행한 뒤 `python -m http.server --directory docs` 를 띄웁니다.

릴리스별 변경 사항은 [`release-notes/v1.0.0.md`](release-notes/v1.0.0.md)부터 `release-notes/` 에 있습니다. v0.3.x·v0.4.0 노트는 당시 앱(Quality Validator)에 대한 기록 그대로 보존합니다.

각 하위 폴더의 README(`app/README.md`, `dq-ts/README.md`)는 그 구성 요소의 세부 사항을 다룹니다.
