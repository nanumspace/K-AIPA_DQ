import { it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { setRoot, loadSpec, loadProfiles } from "@engine/index.js";
import { writeCsvTemplateZip } from "../src/main/input";

it("each cohort ZIP contains its complete header-only templates and guide", () => {
  setRoot(path.resolve(__dirname, "../.."));
  const spec = loadSpec();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kai-template-test-"));
  try {
    for (const [id, profile] of Object.entries(loadProfiles())) {
      const file = path.join(dir, `${id}.zip`);
      writeCsvTemplateZip(profile.tables, spec, file);
      const entries = unzipSync(fs.readFileSync(file));
      expect(Object.keys(entries).sort()).toEqual([...profile.tables.map((t) => `${t}.csv`), "README.txt"].sort());
      for (const table of profile.tables) {
        const bytes = entries[`${table}.csv`];
        expect([...bytes.slice(0, 3)]).toEqual([239, 187, 191]);
        expect(strFromU8(bytes).replace(/^\uFEFF/, "")).toBe(spec.tables[table].fields.map((f) => f.name).join(",") + "\n");
      }
      expect(strFromU8(entries["README.txt"])).toContain("UTF-8");
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
