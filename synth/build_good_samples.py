# -*- coding: utf-8 -*-
"""Export one connected, synthetic patient journey per cohort from reviewed clean samples.

    python synth/build_good_samples.py
    python synth/build_good_samples.py --clean /path/to/clean --out /path/to/good

These are complete *patient extracts*, not a promise that every optional field or every
clinical presentation is represented. Source-system identifiers are left blank where
no authentic source mapping exists; we do not disguise a concept_id as a source code.
"""
import argparse
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
PROFILES = yaml.safe_load((ROOT / "spec/cohort_profiles.yaml").read_text(encoding="utf-8"))["cohorts"]
CLINICAL = ("VISIT_OCCURRENCE", "PROCEDURE_OCCURRENCE", "CONDITION_OCCURRENCE",
            "DRUG_EXPOSURE", "MEASUREMENT", "OBSERVATION", "NOTE", "ADVERSE_EVENT", "SACT")


def load_csv(path):
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ValueError(f"Missing CSV header: {path}")
        return reader.fieldnames, list(reader)


def select_patient(tables, disease):
    """Prefer a linked, longitudinal example with treatment and an adverse event.

    All candidates are genuine rows of the deterministic generator; do not fabricate
    filler events merely to make a table non-empty. Ties resolve by synthetic ID.
    """
    counts = defaultdict(Counter)
    for table, (_, rows) in tables.items():
        for row in rows:
            if row.get("person_id"):
                counts[row["person_id"]][table] += 1
    required = {"PERSON", "VISIT_OCCURRENCE", "PROCEDURE_OCCURRENCE", "CONDITION_OCCURRENCE",
                "DRUG_EXPOSURE", "MEASUREMENT", "OBSERVATION", "NOTE", disease}
    if "SACT" in tables:
        required.add("SACT")
    eligible = [(pid, n) for pid, n in counts.items() if required.issubset({t for t, k in n.items() if k})]
    if not eligible:
        raise ValueError(f"No patient has all required clinical tables for {disease}")
    # Resected cancer examples demonstrate diagnosis → operation → treatment → follow-up,
    # rather than selecting a terminal patient solely by row volume.
    preferred_procedures = {
        "LUNG_CANCER": {"4070879"},
        "BREAST_CANCER": {"4275911", "37164749"},
    }.get(disease)
    if preferred_procedures:
        operated = {row["person_id"] for row in tables["PROCEDURE_OCCURRENCE"][1]
                    if row["procedure_concept_id"] in preferred_procedures}
        selected = [(pid, n) for pid, n in eligible if pid in operated]
        if not selected:
            raise ValueError(f"No treated surgical example for {disease}")
        eligible = selected
    if disease == "MASLD":
        # The exemplar covers metabolic management, not transplant immunosuppression.
        transplanted = {row["person_id"] for row in tables["PROCEDURE_OCCURRENCE"][1]
                        if row["procedure_concept_id"] == "4076862"}
        eligible = [(pid, n) for pid, n in eligible if pid not in transplanted]
        if not eligible:
            raise ValueError("No non-transplant MASLD clinical example")
    if disease == "LYMPHOMA":
        # CAR-T is outside this exemplar: its ancillary drugs are not fully coded.
        cellular_therapy = {row["person_id"] for row in tables["SACT"][1]
                            if "CAR-T" in row["regimen_source_value"]}
        eligible = [(pid, n) for pid, n in eligible if pid not in cellular_therapy]
        if not eligible:
            raise ValueError("No non-CAR-T lymphoma clinical example")
    alive = {row["person_id"] for row in tables["PERSON"][1] if not row["death_date"]}
    # Breadth first, then enough repeated follow-up without selecting solely by row volume.
    def quality(item):
        pid, n = item
        breadth = sum(n[t] > 0 for t in CLINICAL if t in tables)
        followup = min(n["VISIT_OCCURRENCE"], 16)
        events = sum(min(n[t], 4) for t in ("PROCEDURE_OCCURRENCE", "CONDITION_OCCURRENCE", "NOTE", "DRUG_EXPOSURE"))
        return (pid in alive, breadth, followup, events, -int(pid))
    return max(eligible, key=quality)[0]


def write_csv(path, fields, rows):
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def export_one(cohort, source, target):
    profile = PROFILES[cohort]
    tables = {table: load_csv(source / cohort / f"{table}.csv") for table in profile["tables"]}
    disease = next(t for t in profile["tables"] if t not in
                   {"PERSON", "VISIT_OCCURRENCE", "PROCEDURE_OCCURRENCE", "DRUG_EXPOSURE",
                    "CONDITION_OCCURRENCE", "MEASUREMENT", "OBSERVATION", "NOTE", "ADVERSE_EVENT", "SACT"})
    pid = select_patient(tables, disease)
    extracted = {table: [row for row in rows if row.get("person_id") == pid] for table, (_, rows) in tables.items()}
    # 약물 구조식(SMILES) NOTE 는 person_id 가 비어 있으므로 이 환자의 약물이 가리키는 것만 따로 가져온다.
    note_ids = {row["note_id"] for row in extracted["DRUG_EXPOSURE"] if row["note_id"]}
    extracted["NOTE"] += [row for row in tables["NOTE"][1] if row["note_id"] in note_ids and not row["person_id"]]
    visit_ids = {row["visit_occurrence_id"] for row in extracted["VISIT_OCCURRENCE"]}
    sact_ids = {row["sact_id"] for row in extracted.get("SACT", [])}
    assert len(extracted["PERSON"]) == len(extracted[disease]) == 1
    assert all(row["visit_occurrence_id"] in visit_ids for table, rows in extracted.items()
               for row in rows if table != "PERSON" and row.get("visit_occurrence_id"))
    assert all(not row["sact_id"] or row["sact_id"] in sact_ids for row in extracted["DRUG_EXPOSURE"])
    assert all(any(row["sact_id"] == drug["sact_id"] for drug in extracted["DRUG_EXPOSURE"])
               for row in extracted.get("SACT", []))
    assert all(row["note_id"] in {n["note_id"] for n in extracted["NOTE"]} for row in extracted["DRUG_EXPOSURE"] if row["note_id"])
    dest = target / cohort
    dest.mkdir(parents=True, exist_ok=True)
    counts = {}
    for table in profile["tables"]:
        fields, _ = tables[table]
        write_csv(dest / f"{table}.csv", fields, extracted[table])
        counts[table] = len(extracted[table])
    person = extracted["PERSON"][0]
    dates = [row["visit_start_date"] for row in extracted["VISIT_OCCURRENCE"]]
    disease_fields = [(k, v) for k, v in extracted[disease][0].items()
                      if v and k not in (f"{disease.lower()}_id", "dm_id", "person_id", "visit_occurrence_id")]
    clinical_summary = "## 이 가상 사례에 기록된 내용\n\n"
    clinical_summary += "- 질환 표: " + ", ".join(f"`{k}={v}`" for k, v in disease_fields) + "\n"
    for regimen in extracted.get("SACT", []):
        clinical_summary += (f"- 요법: {regimen['regimen_source_value']} "
                             f"({regimen['regimen_start_date']} ~ {regimen['regimen_end_date']}, "
                             f"치료 차수: {regimen['line_of_therapy'] or '미지정'})\n")
    own_notes = [row for row in extracted["NOTE"] if row["person_id"]]
    for event in (own_notes[:1] + own_notes[-1:]):
        clinical_summary += f"- 기록 ({event['note_date']}): {event['note_text'].replace(chr(10), ' ')}\n"
    if disease == "LUNG_CANCER":
        clinical_summary += "- clinical_stage는 최초 진단 시 병기이며 stage_iv_diagnosis_date는 추적 중 IV기 진단일일 수 있습니다.\n"
    if disease == "BREAST_CANCER":
        clinical_summary += ("- HER2 양성 선행치료 경로는 병리학적 완전반응(pCR) 사례를 의도적으로 구성합니다. "
                             "이는 생성기에서 선택한 경과이지 실제 치료 반응률이 아닙니다. "
                             "잔존암에 대한 별도 치료 경로는 이 사례로 설명하지 않습니다.\n")
    clinical_summary += "\n"
    note = (
        f"# Good Sample · {profile['kor']} ({cohort})\n\n"
        "매뉴얼(2026-11-16) 명세의 가상 환자 1명에서 나온 **연결된 모든 행**입니다. 실제 환자 자료가 아닙니다. "
        "코호트별 진단·검사·진료·처방·기록·추적 경과를 여러 테이블로 제출하는 합성 임상 사례입니다. "
        "실제 환자군의 분포나 치료 효과를 재현한 자료가 아니며, 임상의의 감수·승인을 받은 모범 진료 지침도 아닙니다. "
        "한 질환의 모든 환자에게 같은 검사나 치료를 적용한다는 뜻이 아닙니다.\n\n"
        f"- 환자: 1명 (가상 ID {pid})\n"
        f"- 첫 방문 ~ 마지막 방문: {min(dates)} ~ {max(dates)}\n"
        f"- 방문 {counts['VISIT_OCCURRENCE']}건, 검사 {counts['MEASUREMENT']}건, "
        f"약물 {counts['DRUG_EXPOSURE']}건, 문서 {counts['NOTE']}건"
        + (f", 요법 {counts['SACT']}건" if "SACT" in counts else "") + "\n"
        f"- 사망일: {'기록됨' if person['death_date'] else '기록 없음'}\n\n"
        + clinical_summary
        + "## 해석과 검토 범위\n\n"
        "용량·단위, 요법 구성, 검사·이상사례·처방 변경의 연결을 함께 검토해야 합니다. "
        "앱의 매뉴얼 규칙 통과는 임상적 적절성의 인증이 아닙니다. "
        "체중·체표면적 기반 용량은 환자 측정값과 처방 근거를 함께 확인하고, "
        "산출 근거가 없는 선택 점수는 정상값이나 임의 근삿값으로 채우지 않습니다. "
        "기관별 진료·급여 기준과 실제 어휘 매핑은 별도 확인이 필요합니다. "
        "regimen_concept_id=0은 표준 레지멘 코드 미매핑을 뜻하며 요법 이름은 regimen_source_value에 보존합니다. "
        "임상 치료 차수가 단순 요법 시작일 순서와 다른 경우 SEM-SACT-006 경고는 검토 후 해석해야 합니다.\n\n"
        "참고 근거와 생성 가정: [가상 임상 사례 문서](https://github.com/nanumspace/K-AIPA_DQ/blob/main/docs/synthetic-data.md).\n\n"
        + "## 테이블별 행 수\n\n| 테이블 | 행 수 |\n|---|---:|\n"
        + "".join(f"| {table} | {counts[table]} |\n" for table in profile["tables"])
        + "\n약물의 화학 구조식(SMILES)은 매뉴얼대로 NOTE 행(note_text, person_id·note_date 비움, note_class_concept_id 0)에 담고 "
        "DRUG_EXPOSURE.note_id 가 가리킵니다. 이 환자의 약물이 가리키는 NOTE 만 들어 있습니다. "
        "diag_rgst_ymd 는 진단일이 아니라 진단정보 등록일입니다. "
        "원천 시스템 코드·파일 ID 등은 원본이 없는 가상데이터이므로 임의로 꾸며 넣지 않았습니다. "
        "빈 선택 컬럼은 실제 제출 시 해당 자료가 있으면 원천 값을 채우고, 없으면 비워 두어야 합니다. "
        "concept_id는 기준 어휘 OHDSI v20260829의 표준 개념입니다. 병원 원천 코드를 어느 개념으로 매핑할지는 병원 ETL이 정합니다. "
        "CSV는 UTF-8, 날짜는 YYYY-MM-DD입니다. 검증 실행일은 2026-09-07로 맞추세요.\n"
    )
    (dest / "README.md").write_text(note, encoding="utf-8")
    return counts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clean", type=Path, default=ROOT / "synth/output/clean")
    ap.add_argument("--out", type=Path, default=ROOT / "synth/output/good")
    args = ap.parse_args()
    all_counts = {c: export_one(c, args.clean, args.out) for c in PROFILES}
    (args.out / "_counts.json").write_text(json.dumps(all_counts, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for c, n in all_counts.items():
        print(f"{c}: patient=1, visits={n['VISIT_OCCURRENCE']}, measurement={n['MEASUREMENT']}")


if __name__ == "__main__":
    main()
