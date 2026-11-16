// 접근 가능한 대화 상자와 '저장하지 않은 변경' 보호 부품
import { useEffect, useId, useRef, type MutableRefObject, type ReactNode } from "react";

export const DISCARD_MESSAGE = "저장하지 않은 변경이 있습니다. 변경을 버리고 계속할까요?\n(취소를 누르면 입력한 내용이 그대로 남습니다.)";

/** 저장하지 않은 변경이 있으면 버려도 되는지 묻는다. 버려도 되면 true. */
export function confirmDiscard(dirty: boolean): boolean {
  return !dirty || window.confirm(DISCARD_MESSAGE);
}

/** 이 화면에 저장 안 된 변경이 있는지를 페이지의 가드(kai:before-nav)가 볼 수 있게 ref 에 반영한다. */
export function useDirtyRef(ref: MutableRefObject<boolean>, dirty: boolean): void {
  useEffect(() => {
    ref.current = dirty;
    return () => { ref.current = false; };
  }, [ref, dirty]);
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const focusables = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);

/** 열려 있는 대화 상자 순서. 맨 위 것만 Esc · Tab 에 반응해서 겹친 대화 상자도 막히지 않는다. */
const stack: symbol[] = [];

/**
 * role=dialog 대화 상자. 제목으로 이름이 붙고, 처음 열면 첫 입력에 초점이 가며,
 * Tab 은 안에서만 돌고, 닫으면 열기 전 초점으로 돌아간다.
 * 배경 · Esc · 닫기 단추는 모두 dirty 일 때 버릴지 묻는 같은 경로로 닫는다.
 */
export function Modal({ title, onClose, children, wide, dirty = false }: {
  title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean;
  /** 저장하지 않은 입력이 있으면 true: 닫기 전에 확인한다 */
  dirty?: boolean;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const requestClose = useRef(() => undefined as void);
  requestClose.current = () => { if (confirmDiscard(dirty)) onClose(); };

  useEffect(() => {
    const token = Symbol("modal");
    stack.push(token);
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current!;
    (contentRef.current && focusables(contentRef.current)[0] || focusables(dialog)[0] || dialog).focus();

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== token) return;
      if (e.key === "Escape") {
        if (e.defaultPrevented) return;
        e.preventDefault();
        requestClose.current();
      } else if (e.key === "Tab") {
        const items = focusables(dialog);
        if (items.length === 0) { e.preventDefault(); dialog.focus(); return; }
        const first = items[0], last = items[items.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (!active || !dialog.contains(active)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && (active === first || active === dialog)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const i = stack.indexOf(token);
      if (i >= 0) stack.splice(i, 1);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <div className="modal" onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose.current(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`modal-body ${wide ? "" : "narrow"}`}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h2 id={titleId} className="modal-title" style={{ fontSize: 15, color: "var(--navy)", margin: 0 }}>{title}</h2>
          <button type="button" className="btn sm" onClick={() => requestClose.current()}>닫기</button>
        </div>
        <div ref={contentRef} style={{ display: "contents" }}>{children}</div>
      </div>
    </div>
  );
}
