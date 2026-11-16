import { useEffect, useState } from "react";
import { api } from "./api";
import { Dashboard } from "./pages/Dashboard";
import { RunPage } from "./pages/RunPage";
import { RulesPage } from "./pages/RulesPage";
import { FindingsPage } from "./pages/FindingsPage";
import { ReportPage } from "./pages/ReportPage";
import { MonitorPage } from "./pages/MonitorPage";
import { SettingsPage } from "./pages/SettingsPage";

export type Page = "dashboard" | "run" | "rules" | "findings" | "report" | "monitor" | "settings";

const MENU: { id: Page; label: string; icon: string }[] = [
  { id: "run", label: "검증 실행", icon: "▶" },
  { id: "report", label: "결과 보고서", icon: "▤" },
  { id: "findings", label: "오류 현황 조회", icon: "⌕" },
  { id: "dashboard", label: "대시보드", icon: "⌂" },
  { id: "monitor", label: "통계 모니터링", icon: "▥" },
  { id: "rules", label: "검증 규칙 관리", icon: "☰" },
  { id: "settings", label: "설정", icon: "⚙" },
];

export interface Nav { page: Page; runId?: string; go: (page: Page, runId?: string) => void }

export function App() {
  const [page, setPage] = useState<Page>("run");
  const [runId, setRunId] = useState<string | undefined>();
  const [version, setVersion] = useState(0); // 실행 완료 시 증가 → 목록 갱신
  // 꼬리말은 명세(매뉴얼 2026-11-16)의 실제 규모를 적는다. 규칙 수는 이 PC 의 설정(사용자·관리자 규칙 포함)을 따른다.
  const [foot, setFoot] = useState("");
  const [admin, setAdmin] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  useEffect(() => {
    const load = () => Promise.all([api.listRules(), api.listCohorts(), api.getConfig()])
      .then(([rs, cs, cfg]) => {
        setFoot(`매뉴얼 2026-11-16 · 규칙 ${rs.length.toLocaleString("ko-KR")}개 · 코호트 ${cs.length}개`);
        setAdmin(cfg.adminMode);
        setAppVersion(cfg.version);
      })
      .catch(() => setFoot(""));
    load();
    window.addEventListener("kai:config", load);
    return () => window.removeEventListener("kai:config", load);
  }, []);

  const go = (p: Page, r?: string) => { setPage(p); if (r !== undefined) setRunId(r); };
  useEffect(() => api.onNav((p) => setPage(p as Page)), []);
  useEffect(() => api.onProgress((p) => { if (p.stage === "done") setVersion((v) => v + 1); }), []);

  const adminOff = async () => { await api.setAdminMode(false); window.dispatchEvent(new Event("kai:config")); };

  const nav: Nav = { page, runId, go };
  return (
    <div className="shell">
      {admin && (
        <div className="adminbar" role="status">
          <b>관리자 모드</b>
          <span>SQL 규칙을 직접 수정할 수 있습니다. 바꾼 내용은 이 PC 의 변경 이력과 검증 결과물(보고서 · 제출용 집계)에 기록됩니다. 인증·권한 통제가 아니라 기록용 표시입니다.</span>
          <button className="btn sm" onClick={adminOff}>관리자 모드 끄기</button>
        </div>
      )}
      <div className="app">
        <aside className="sidebar">
          <div className="brand">K-AIPA DQ<small>K-AIPA 임상 데이터 품질검증</small></div>
          {MENU.map((m) => (
            <button key={m.id} className={page === m.id ? "active" : ""} onClick={() => setPage(m.id)}>
              <span className="icon">{m.icon}</span>{m.label}
            </button>
          ))}
          <div className="foot">{foot}<br />{appVersion && `v${appVersion}`}</div>
        </aside>
        <main className="main">
          {page === "dashboard" && <Dashboard key={version} nav={nav} />}
          {page === "run" && <RunPage nav={nav} />}
          {page === "rules" && <RulesPage />}
          {page === "findings" && <FindingsPage key={`${version}-${runId ?? ""}`} nav={nav} />}
          {page === "report" && <ReportPage key={`${version}-${runId ?? ""}`} nav={nav} />}
          {page === "monitor" && <MonitorPage key={version} nav={nav} />}
          {page === "settings" && <SettingsPage />}
        </main>
      </div>
    </div>
  );
}
