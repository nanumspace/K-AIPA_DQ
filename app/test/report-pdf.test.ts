// report.pdf 의 HTML: 보고서에 실린 실행 이름·규칙 설명은 글자 그대로 보여야 하고 마크업으로 해석되면 안 된다.
import { describe, it, expect } from "vitest";
import { reportHtml } from "../src/main/reportPdf";

describe("reportHtml", () => {
  it("Markdown 표는 표로, 본문의 HTML 은 글자로 옮긴다", () => {
    const html = reportHtml("# 보고서\n\n<img src=x onerror=alert(1)> 실행\n\n| 규칙 | 위반 |\n|---|---:|\n| ST-0001 | 3 |\n", "t");
    expect(html).toContain("<table>");
    expect(html).toContain("<td>ST-0001</td>");
    expect(html).not.toMatch(/<img/);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("default-src 'none'");
  });
});
