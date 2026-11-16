# Good Sample · 대장암 (COLORECTAL_CANCER)

매뉴얼(2026-11-16) 명세의 가상 환자 1명에서 나온 **연결된 모든 행**입니다. 실제 환자 자료가 아닙니다. 코호트별 진단·검사·진료·처방·기록·추적 경과를 여러 테이블로 제출할 때의 구조 예시입니다. 한 질환의 모든 환자에게 필요한 검사나 치료를 뜻하지 않습니다.

- 환자: 1명 (가상 ID 300001)
- 첫 방문 ~ 마지막 방문: 2019-06-25 ~ 2025-01-01
- 방문 32건, 검사 104건, 약물 35건, 문서 8건, 요법 1건
- 사망일: 기록 없음

## 이 환자에게 실제로 기록된 내용

- 질환 표: `diag_rgst_ymd=2019-06-25`, `anes_mthd_etc_cont=Intracorporeal side-to-side stapled anastomosis`, `inva_dgre_nm=Subserosa / perirectal fat`, `radi_rsmg_invl_yn_spnm=침범 없음`
- 요법: FOLFOX + Bevacizumab (2021-09-10 ~ 2022-01-28, line 1)
- 기록 (2019-06-25): Colonoscopy: Ulceroinfiltrative mass at Ascending colon, 4.7 cm in size, occupying about 79% of the lumen. Multiple biopsies taken. Impression: Ascending colon cancer, r/o adenocarcinoma. Biopsy pending.
- 기록 (2021-08-14): CT abdomen and pelvis: new bone lesion, suspicious for recurrence.

## 테이블별 행 수

| 테이블 | 행 수 |
|---|---:|
| PERSON | 1 |
| VISIT_OCCURRENCE | 32 |
| PROCEDURE_OCCURRENCE | 18 |
| DRUG_EXPOSURE | 35 |
| CONDITION_OCCURRENCE | 9 |
| MEASUREMENT | 104 |
| OBSERVATION | 1 |
| NOTE | 8 |
| COLORECTAL_CANCER | 1 |
| ADVERSE_EVENT | 8 |
| SACT | 1 |

약물의 화학 구조식(SMILES)은 매뉴얼대로 NOTE 행(note_text, person_id·note_date 비움, note_class_concept_id 0)에 담고 DRUG_EXPOSURE.note_id 가 가리킵니다. 이 환자의 약물이 가리키는 NOTE 만 들어 있습니다. diag_rgst_ymd 는 진단일이 아니라 진단정보 등록일입니다. 원천 시스템 코드·파일 ID 등은 원본이 없는 가상데이터이므로 임의로 꾸며 넣지 않았습니다. 빈 선택 컬럼은 실제 제출 시 해당 자료가 있으면 원천 값을 채우고, 없으면 비워 두어야 합니다. OMOP concept_id의 기관별 Athena 매핑도 확정되지 않았습니다. CSV는 UTF-8, 날짜는 YYYY-MM-DD입니다. 검증 실행일은 2026-09-07로 맞추세요.
