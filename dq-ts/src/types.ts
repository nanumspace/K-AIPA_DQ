// 명세 · 규칙 · 결과 타입

export type FieldType = "integer" | "bigint" | "float" | "varchar" | "text" | "date" | "timestamp";

export interface SpecField {
  name: string;
  type: FieldType;
  required: boolean;
  [k: string]: unknown;
}

export interface SpecTable {
  name: string;
  kor: string;
  category: "core" | "disease" | "vocabulary" | string;
  pk: string;
  /** 매뉴얼 밖 보완 테이블: 없어도 '테이블 없음'이 아니다 */
  optional?: boolean;
  fields: SpecField[];
}

export interface Spec {
  tables: Record<string, SpecTable>;
}

/** 코호트 구성. optional_tables 는 내면 검사하고 없으면 건너뛰는 보완 테이블 */
export interface CohortProfile { kor: string; tables: string[]; optional_tables?: string[] }

export type RuleOrigin = "standard" | "modified" | "admin" | "custom";
export type Severity = "error" | "warning";

/** 수준 2: 표준 규칙의 허용 범위 · 패턴 · 코드를 조정 (min/max 는 range, regex 는 pattern, extraCodes 는 codelist 규칙에 쓴다) */
export interface RuleParamsOverride { min?: number; max?: number; regex?: string; extraCodes?: string[] }

/** 수준 3: 서식(폼)으로 만드는 사용자 규칙. id 는 USR-001 형식 */
export interface CustomRule {
  id: string; name: string; table: string; field: string;
  check: "not_null" | "range" | "codelist" | "pattern" | "not_future";
  severity: Severity; params: { min?: number; max?: number; codes?: string[]; regex?: string }; desc?: string;
}

/** 수준 4(관리자 모드): SQL 로 직접 쓰는 규칙. id 는 ADM-001 형식 */
export interface CustomSqlRule {
  id: string; name: string; category: "Conformance" | "Completeness" | "Plausibility"; severity: Severity;
  scope: "all" | string[]; requires: string[]; sql: string; desc?: string;
}

export interface RuleOverrides {
  disabled?: string[];                               // 수준 1: 끄기
  severity?: Record<string, Severity>;               // 수준 2: 심각도
  params?: Record<string, RuleParamsOverride>;       // 수준 2: 범위/패턴/코드
  sql?: Record<string, string>;                      // 수준 4: 표준 교차 규칙의 SQL 교체
  customRules?: CustomRule[];                        // 수준 3
  customSql?: CustomSqlRule[];                       // 수준 4
}

export interface StructuralRule {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  table: string;
  fields: string[];
  severity: Severity;
  check: string;
  params: Record<string, any>;
  desc?: string;
  scope: "all" | string[];
  /** YAML 원문에서 가져온 range 경계 표기 (Python repr 과 일치시키기 위함) */
  paramText?: { min?: string; max?: string };
  /** 규칙 묶음에서의 출처 (표준 규칙은 "standard") */
  origin: RuleOrigin;
  /** 사용자가 끈 규칙: 실행하지 않고 status "disabled" 로만 기록한다 */
  disabled?: boolean;
}

export interface SemanticRule {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  severity: Severity;
  scope: "all" | string[];
  requires: string[];
  desc?: string;
  sql: string;
  origin: RuleOrigin;
  disabled?: boolean;
}

export interface Finding {
  rule_id: string;
  rule_name: string;
  category: string;
  severity: string;
  table: string;
  field: string;
  row_key: string;
  person_id: string;
  detail: string;
}

export interface RuleStat {
  rule_id: string;
  name: string;
  category: string;
  subcategory: string;
  severity: string;
  table: string;
  fields: string;
  check: string;
  origin: RuleOrigin;
  status: "pass" | "fail" | "skipped" | "error" | "disabled";
  violations: number;
  rows_checked: number;
  note: string;
}

export interface Summary {
  cohort: string;
  run_date: string;
  tables: Record<string, number>;
  rules_total: number;
  rules_failed: number;
  rules_skipped: number;
  rules_error: number;
  rules_disabled: number;
  violations_total: number;
  violations_error: number;
  violations_warning: number;
  by_category: Record<string, { rules: number; failed: number; violations: number }>;
  rules: RuleStat[];
  /** 데이터 충실도 (spec/expected_data.yaml). 규칙 집계와 별개 */
  sufficiency: SufficiencyResult[];
  /** 표준 개념 필드별 매핑률 (위반 아님, 규칙 집계와 별개) */
  mapping_rates: MappingRate[];
}

/** 매핑률 한 필드. 대상 = 정수로 읽히는 값, 미매핑 = 0, 빈 값·정수 아님은 대상에서 빠진다. 환자 단위 값 없음 */
export interface MappingRate {
  table: string; field: string; rows: number; blank: number; invalid: number;
  eligible: number; mapped: number; unmapped: number;
}

export interface SufficiencyResult {
  id: string;
  title: string;
  unit: string;
  status: "ok" | "skipped" | "error";
  note: string;
  eligible: number;
  met: number;
  /** 1인·1년당 횟수 중앙값(소수 첫째 자리 문자열). 밀도 항목이 아니면 null */
  per_year_median: string | null;
  by_age: { band: string; eligible: number; met: number }[];
}

/** 미충족 단위 한 행 (sufficiency.csv, 기관 내부용) */
export interface SufficiencyRow { item_id: string; person_id: string; unit_key: string; detail: string }

export interface ExpectedItem {
  id: string; title: string; scope: "all" | string[]; unit: string; target: string; expect: string; basis: string;
  requires: string[]; sql: string;
}

export interface ExpectedData {
  concept_sets: Record<string, { name: string; [k: string]: unknown }>;
  events: { table: string; concept: string; date: string }[];
  anchors: Record<string, string>;
  setup_requires: string[];
  setup: string[];
  items: ExpectedItem[];
}

/** 열 지향 문자열 테이블. 값은 CSV 원문 그대로이며 NULL 은 빈 문자열이다. */
export interface RawTable {
  columns: string[];
  cols: Map<string, string[]>;
  n: number;
}

export interface Concepts {
  measurements: Record<string, { name: string; plausible: [number, number]; [k: string]: unknown }>;
  drugs: Record<string, { name: string; category?: number | null; [k: string]: unknown }>;
  [k: string]: unknown;
}
