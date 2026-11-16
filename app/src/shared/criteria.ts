import type { RuleInfo, RuleOverrides, SpecTableInfo } from './types';

export const CRITERIA_FILES = ['spec/kai_cdm_spec.yaml', 'spec/cohort_profiles.yaml', 'spec/codelists.yaml', 'spec/concepts.yaml', 'spec/constraints.yaml', 'rules/rules_structural.yaml', 'rules/rules_semantic.yaml'] as const;
export interface CriteriaManifest { schema: 'kai-criteria/1'; name: string; version: string; manual: string; publisher: string; minAppVersion: string; files: Record<string, string> }
export interface CriteriaInfo { manifest: CriteriaManifest; hash: string; source: 'builtin' | 'imported'; tables: number; fields: number; rules: number; cohorts: string[] }
export interface CriteriaPreview { token: string; info: CriteriaInfo; changes: string[]; conflicts: string[]; hasOverrides: boolean }
export interface CriteriaSnapshot { schema: 'kai-criteria-snapshot/1'; createdAt: string; criteria: CriteriaInfo; standardHash: string; effectiveHash: string; adminMode: boolean; today: string; overrides: RuleOverrides; tables: SpecTableInfo[]; rules: RuleInfo[] }
