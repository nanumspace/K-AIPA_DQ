# Good Sample · 대사이상지방간 (MASLD)

매뉴얼(2026-11-16) 명세의 가상 환자 1명에서 나온 **연결된 모든 행**입니다. 실제 환자 자료가 아닙니다. 코호트별 진단·검사·진료·처방·기록·추적 경과를 여러 테이블로 제출하는 합성 임상 사례입니다. 실제 환자군의 분포나 치료 효과를 재현한 자료가 아니며, 임상의의 감수·승인을 받은 모범 진료 지침도 아닙니다. 한 질환의 모든 환자에게 같은 검사나 치료를 적용한다는 뜻이 아닙니다.

- 환자: 1명 (가상 ID 400020)
- 첫 방문 ~ 마지막 방문: 2023-11-13 ~ 2026-08-01
- 방문 20건, 검사 91건, 약물 51건, 문서 13건
- 사망일: 기록 없음

## 이 가상 사례에 기록된 내용

- 질환 표: `fib4_score=2.14`, `apri_score=0.71`, `bard_score=3`
- 기록 (2023-11-13): Abdomen ultrasonography. Liver: diffusely increased parenchymal echogenicity with mild posterior attenuation, compatible with mild hepatic steatosis. Liver contour smooth. Spleen normal in size. No focal hepatic lesion. Gallbladder and bile ducts unremarkable. Impression: 경도 지방간.
- 기록 (2026-05-29): Follow-up visit, 31 months after diagnosis. Weight 65.8 kg (BMI 24.9; -13.1% from baseline). AST/ALT 35/27 U/L, platelets 203 x10^3/uL, FIB-4 1.82. Semaglutide 2.4 mg SC weekly continued. Lifestyle therapy continued (target weight loss 7-10%).

## 해석과 검토 범위

용량·단위, 요법 구성, 검사·이상사례·처방 변경의 연결을 함께 검토해야 합니다. 앱의 매뉴얼 규칙 통과는 임상적 적절성의 인증이 아닙니다. 체중·체표면적 기반 용량은 환자 측정값과 처방 근거를 함께 확인하고, 산출 근거가 없는 선택 점수는 정상값이나 임의 근삿값으로 채우지 않습니다. 기관별 진료·급여 기준과 실제 어휘 매핑은 별도 확인이 필요합니다. regimen_concept_id=0은 표준 레지멘 코드 미매핑을 뜻하며 요법 이름은 regimen_source_value에 보존합니다. 임상 치료 차수가 단순 요법 시작일 순서와 다른 경우 SEM-SACT-006 경고는 검토 후 해석해야 합니다.

참고 근거와 생성 가정: [가상 임상 사례 문서](https://github.com/nanumspace/K-AIPA_DQ/blob/main/docs/synthetic-data.md).

## 테이블별 행 수

| 테이블 | 행 수 |
|---|---:|
| PERSON | 1 |
| VISIT_OCCURRENCE | 20 |
| PROCEDURE_OCCURRENCE | 4 |
| DRUG_EXPOSURE | 51 |
| CONDITION_OCCURRENCE | 5 |
| MEASUREMENT | 91 |
| OBSERVATION | 8 |
| NOTE | 13 |
| MASLD | 1 |
| ADVERSE_EVENT | 1 |

약물의 화학 구조식(SMILES)은 매뉴얼대로 NOTE 행(note_text, person_id·note_date 비움, note_class_concept_id 0)에 담고 DRUG_EXPOSURE.note_id 가 가리킵니다. 이 환자의 약물이 가리키는 NOTE 만 들어 있습니다. diag_rgst_ymd 는 진단일이 아니라 진단정보 등록일입니다. 원천 시스템 코드·파일 ID 등은 원본이 없는 가상데이터이므로 임의로 꾸며 넣지 않았습니다. 빈 선택 컬럼은 실제 제출 시 해당 자료가 있으면 원천 값을 채우고, 없으면 비워 두어야 합니다. OMOP concept_id의 기관별 Athena 매핑도 확정되지 않았습니다. CSV는 UTF-8, 날짜는 YYYY-MM-DD입니다. 검증 실행일은 2026-09-07로 맞추세요.
