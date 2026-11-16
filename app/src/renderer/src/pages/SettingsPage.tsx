import { useEffect, useState } from "react";
import type { AppConfig, CohortInfo } from "@shared/types";
import { api } from "../api";
import { Card } from "../components/ui";

export function SettingsPage() {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [today, setToday] = useState("");
  const [cohorts, setCohorts] = useState<CohortInfo[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = () => {
    window.dispatchEvent(new Event("kai:config"));
    api.getConfig().then((c) => { setCfg(c); setToday(c.defaultToday ?? ""); }).catch((e) => setErr(String(e)));
    api.listCohorts().then(setCohorts).catch((e) => setErr(String(e)));
  };
  useEffect(refresh, []);

  const chooseRoot = async () => {
    const d = await api.chooseDirectory("명세(spec/)와 규칙(rules/)이 있는 디렉터리 선택");
    if (!d) return;
    try { setCfg(await api.setConfig({ root: d })); setMsg("명세 위치를 저장했습니다."); refresh(); } catch (e) { setErr(String(e)); }
  };
  const toggleAdmin = async () => {
    if (!cfg) return;
    try {
      const next = await api.setAdminMode(!cfg.adminMode);
      setCfg(next);
      setMsg(next.adminMode ? "관리자 모드를 켰습니다. 화면 위쪽에 표시됩니다." : cfg.adminMode ? "관리자 모드를 껐습니다. SQL 로 바꾼 규칙은 그대로 남아 있습니다." : null);
      window.dispatchEvent(new Event("kai:config"));
    } catch (e) { setErr(String(e)); }
  };
  const saveToday = async () => {
    try { setCfg(await api.setConfig({ defaultToday: today || null })); setMsg("검증 실행일 기본값을 저장했습니다."); } catch (e) { setErr(String(e)); }
  };

  if (err) return <div className="callout err">{err}</div>;
  if (!cfg) return null;
  return (
    <>
      <div className="page-title"><h1>설정</h1></div>
      {msg && <div className="callout" style={{ marginBottom: 12 }}>{msg}</div>}
      <div className="grid c2">
        <Card title="명세와 규칙" sub="검증 규칙은 이 위치의 spec/ 과 rules/ YAML 에서 읽습니다">
          <div className="form">
            <label>위치
              <div className="row"><input type="text" value={cfg.root} readOnly /><button className="btn" onClick={chooseRoot}>변경</button></div>
            </label>
            <div className="kv">
              <span className="k">명세</span><span>의뢰사 매뉴얼 2026-11-16</span>
              <span className="k">코호트</span><span>{cohorts.length ? cohorts.map((c) => c.kor).join(", ") : "읽을 수 없음 (위치를 확인하세요)"}</span>
              <span className="k">패키징</span><span>{cfg.packaged ? "설치본 (내장 명세)" : "개발 모드 (저장소)"}</span>
            </div>
          </div>
        </Card>
        <Card title="관리자 모드" sub="표준 교차 규칙의 SQL 을 고치거나 SQL 규칙을 추가할 수 있는 모드. 비밀번호는 없으며 쓴 흔적이 남습니다">
          <div className="form">
            <div className="rowflex">
              <span className={`pill ${cfg.adminMode ? "admin" : "gray"}`}>{cfg.adminMode ? "켜짐" : "꺼짐"}</span>
              <button className={`btn ${cfg.adminMode ? "" : "primary"}`} onClick={toggleAdmin}>{cfg.adminMode ? "관리자 모드 끄기" : "관리자 모드 켜기"}</button>
            </div>
            <p className="hint">
              켜 있는 동안 화면 위쪽에 '관리자 모드' 띠가 표시되고, 검증 규칙 관리 화면에서 SQL 을 바꿀 수 있습니다.
              저장 전에 내장 견본(clean · dirty)으로 SQL 을 시험해 오류와 오탐을 확인합니다.
              모드를 켜고 끈 시각과 모든 변경은 이 PC 의 변경 이력(rule-history.jsonl)에 남고, SQL 을 바꾼 규칙이 있으면 검증 결과의 보고서와 제출용 집계에 '관리자 변경'으로 기록됩니다.
              모드를 꺼도 이미 바꾼 SQL 은 되돌아가지 않습니다. 되돌리려면 검증 규칙 관리에서 '표준으로 되돌리기'를 쓰세요. 앱을 다시 열면 꺼진 채로 시작합니다.
            </p>
          </div>
        </Card>
        <Card title="검증 실행일 기본값" sub="비우면 실행 당일. 미래 날짜 판정과 보고서의 검증일에 쓰입니다">
          <div className="form">
            <div className="row"><input type="date" value={today} onChange={(e) => setToday(e.target.value)} /><button className="btn primary" onClick={saveToday}>저장</button><button className="btn" onClick={() => setToday("")}>비우기</button></div>
          </div>
        </Card>
        <Card title="데이터 위치" sub="실행 이력 DB 와 실행별 보고서 파일">
          <div className="kv">
            <span className="k">앱 데이터</span><span className="mono">{cfg.userData}</span>
            <span className="k">이력 DB</span><span className="mono">history.duckdb</span>
            <span className="k">규칙 설정</span><span className="mono">rule-overrides.json · rule-history.jsonl</span>
            <span className="k">실행 결과</span><span className="mono">runs/&lt;실행 ID&gt;/findings.csv · summary.json · report.md</span>
          </div>
          <div style={{ marginTop: 10 }}><button className="btn" onClick={() => api.openPath(cfg.userData)}>폴더 열기</button></div>
        </Card>
        <Card title="정보">
          <div className="kv">
            <span className="k">프로그램</span><span>Quality Validator v{cfg.version}</span>
            <span className="k">엔진</span><span>kai-dq-engine (TypeScript) · DuckDB</span>
            <span className="k">규칙 체계</span><span>Kahn 3축 (적합성 · 완전성 · 타당성) · 심각도 오류/경고</span>
          </div>
        </Card>
      </div>
    </>
  );
}
