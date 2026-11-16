// 릴리스 작업용 CLI. 앱과 같은 생성·검사 코드를 사용한다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCriteriaPackage, stageCriteriaPackage } from './criteria';

const [root, output, version] = process.argv.slice(2);
if (!root || !output || !version) throw new Error('Usage: node packCriteria.js <repository-root> <output.zip> <app-version>');
const bytes = createCriteriaPackage(root, { name: 'K-AIPA 임상 코호트 검증 기준', version, manual: '2026-11-16', publisher: 'K-AI 코호트 구축 TF', minAppVersion: '1.0.1' });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kai-criteria-release-'));
try {
  const staged = stageCriteriaPackage(bytes, temp, root, {}, version);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, bytes);
  console.log(`${output}: ${staged.preview.info.tables} tables, ${staged.preview.info.fields} fields, ${staged.preview.info.rules} rules; ${staged.preview.info.hash}`);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
