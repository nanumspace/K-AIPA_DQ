// YAML 명세 · 코드표 · concept · 규칙 로더
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse, parseDocument, isMap, isSeq, isScalar } from "yaml";
import type { Spec, StructuralRule, SemanticRule, Concepts } from "./types.js";

let rootOverride: string | undefined;

/**
 * 명세(spec/)와 규칙(rules/)이 있는 디렉터리.
 * 우선순위: setRoot() > 환경변수 KAI_ROOT > 이 파일 기준 저장소 루트(dq-ts 의 상위).
 * 번들된 환경(Electron)에서는 import.meta.url 이 없을 수 있어 지연 계산한다.
 */
export function getRoot(): string {
  if (rootOverride) return rootOverride;
  if (process.env.KAI_ROOT) return process.env.KAI_ROOT;
  try {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  } catch {
    return process.cwd();
  }
}

export function setRoot(p: string | undefined): void {
  rootOverride = p;
}

function readText(rel: string): string {
  return fs.readFileSync(path.join(getRoot(), rel), "utf-8");
}

export function loadYaml<T = any>(rel: string): T {
  return parse(readText(rel)) as T;
}

export function loadSpec(): Spec {
  return loadYaml<Spec>("spec/kai_cdm_spec.yaml");
}

/** codelists.yaml 의 모든 절(embedded/common/omop)을 합쳐 코드표명 → 허용 코드 문자열 집합 */
export function loadCodelists(): Map<string, Set<string>> {
  const cl = loadYaml<Record<string, Record<string, Record<string, unknown>>>>("spec/codelists.yaml");
  const out = new Map<string, Set<string>>();
  for (const sect of Object.values(cl)) {
    for (const [name, codes] of Object.entries(sect)) {
      out.set(name, new Set(Object.keys(codes ?? {}).map(String)));
    }
  }
  return out;
}

export function loadConcepts(): Concepts {
  return loadYaml<Concepts>("spec/concepts.yaml");
}

export function loadProfiles(): Record<string, { kor: string; tables: string[] }> {
  return loadYaml<{ cohorts: Record<string, { kor: string; tables: string[] }> }>("spec/cohort_profiles.yaml").cohorts;
}

/**
 * 구조 규칙. range 규칙의 min/max 는 YAML 원문 표기(예: 10.0)를 함께 보관해
 * Python 참조 구현의 detail 문자열("범위 [10.0,70.0] 밖")과 같은 출력을 만든다.
 */
export function loadStructuralRules(): StructuralRule[] {
  const src = readText("rules/rules_structural.yaml");
  const doc = parseDocument(src, { keepSourceTokens: true });
  const rules = (doc.toJS() as { rules: StructuralRule[] }).rules;
  const rulesNode = doc.get("rules");
  if (isSeq(rulesNode)) {
    rulesNode.items.forEach((item, i) => {
      if (!isMap(item)) return;
      const params = item.get("params");
      if (!isMap(params)) return;
      const text: { min?: string; max?: string } = {};
      for (const k of ["min", "max"] as const) {
        const node = params.get(k, true);
        if (isScalar(node)) {
          const tok = (node as any).srcToken;
          if (tok && typeof tok.source === "string") text[k] = tok.source;
        }
      }
      if (text.min !== undefined || text.max !== undefined) rules[i].paramText = text;
    });
  }
  for (const r of rules) {
    r.fields = r.fields ?? [];
    r.params = r.params ?? {};
    r.scope = r.scope ?? "all";
    r.origin = "standard";
  }
  return rules;
}

export function loadSemanticRules(): SemanticRule[] {
  const rules = loadYaml<{ rules: SemanticRule[] }>("rules/rules_semantic.yaml").rules;
  for (const r of rules) {
    r.requires = r.requires ?? [];
    r.scope = r.scope ?? "all";
    r.origin = "standard";
  }
  return rules;
}
