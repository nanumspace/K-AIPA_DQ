// report.md 를 그대로 옮긴 A4 PDF (report.pdf). 내용의 원본은 report.md 하나다.
// 숨긴 창(스크립트·네트워크 차단)에서 HTML 로 그린 뒤 Chromium 의 printToPDF 로 저장한다.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BrowserWindow } from "electron";
import { Marked } from "marked";

export const REPORT_MD = "report.md";
export const REPORT_PDF = "report.pdf";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// 보고서에 들어간 실행 이름·규칙 설명 등은 HTML 로 해석하지 않고 글자 그대로 보인다.
const md = new Marked({ gfm: true, renderer: { html: ({ text }) => esc(text) } });

const CSS = `
@page { size: A4; margin: 16mm 14mm 18mm; }
html { font-family: "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif; font-size: 9.5pt; color: #1b1f24; line-height: 1.5; }
h1 { font-size: 16pt; margin: 0 0 6pt; border-bottom: 1.5pt solid #1b1f24; padding-bottom: 4pt; }
h2 { font-size: 12.5pt; margin: 14pt 0 5pt; break-after: avoid; }
h3 { font-size: 11pt; margin: 10pt 0 4pt; break-after: avoid; }
p, ul, ol { margin: 0 0 6pt; }
table { border-collapse: collapse; width: 100%; margin: 0 0 8pt; font-size: 8.5pt; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th, td { border: 0.5pt solid #b8bec6; padding: 2.5pt 4pt; vertical-align: top; word-break: keep-all; overflow-wrap: break-word; }
th { background: #eef1f4; text-align: left; }
code { font-family: Menlo, Consolas, monospace; font-size: 8.5pt; }
pre { white-space: pre-wrap; background: #f5f6f8; padding: 6pt; font-size: 8pt; }
blockquote { margin: 0 0 6pt; padding-left: 8pt; border-left: 2pt solid #b8bec6; color: #4a525c; }
`;

export function reportHtml(markdown: string, title: string): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${esc(title)}</title><style>${CSS}</style></head><body>${md.parse(markdown) as string}</body></html>`;
}

/** report.pdf 가 없거나 report.md 보다 오래되었으면 다시 만든다. report.md 가 없으면 null. */
export async function ensureReportPdf(runDir: string): Promise<string | null> {
  const src = path.join(runDir, REPORT_MD), out = path.join(runDir, REPORT_PDF);
  if (!fs.existsSync(src)) return null;
  if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) return out;
  const runId = path.basename(runDir);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kai-report-"));
  const html = path.join(tmp, "report.html");
  fs.writeFileSync(html, reportHtml(fs.readFileSync(src, "utf-8"), `K-AIPA DQ 검증 보고서 · ${runId}`), "utf-8");
  const w = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true, nodeIntegration: false, contextIsolation: true } });
  try {
    await w.loadFile(html);
    const pdf = await w.webContents.printToPDF({
      pageSize: "A4", printBackground: true, displayHeaderFooter: true, margins: { marginType: "custom", top: 0.6, bottom: 0.7, left: 0.55, right: 0.55 },
      headerTemplate: `<div style="font-size:7pt;color:#6b7380;width:100%;padding:0 14mm;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif">K-AIPA DQ 검증 보고서 · ${esc(runId)}</div>`,
      footerTemplate: `<div style="font-size:7pt;color:#6b7380;width:100%;text-align:center;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
    });
    fs.writeFileSync(`${out}.tmp`, pdf);
    fs.renameSync(`${out}.tmp`, out);
    return out;
  } finally {
    w.destroy();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
