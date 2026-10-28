"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { CLOUDY_CHAT_MAX_LENGTH, createLocalCloudyChatService, normalizeCloudyChatInput, type CloudyChatMessage, type CloudyChatService } from "./cloudy-chat-service";

import { CloudyOwnerAdvisor } from "./cloudy-owner-advisor";
import type { FilterMode } from "../../lib/cloudy-filter-context";
import { parseCloudyRoomLinks } from "../../lib/cloudy-room-links";

const ASSET_ROOT = "/mascot/cloudy-2d";

function CloudyPortrait() {
  return <span className="cloudy-chat__avatar" aria-hidden="true">
    <img className="cloudy-2d__layer" src={`${ASSET_ROOT}/cloud-body.png`} alt="" />
    <span className="cloudy-2d__eye-pair">
      <img className="cloudy-2d__layer cloudy-2d__eye cloudy-2d__eye--left" src={`${ASSET_ROOT}/cloud-eyes-open.png`} alt="" />
      <img className="cloudy-2d__layer cloudy-2d__eye cloudy-2d__eye--right" src={`${ASSET_ROOT}/cloud-eyes-open.png`} alt="" />
    </span>
    <img className="cloudy-2d__layer cloudy-2d__nose" src={`${ASSET_ROOT}/cloud-nose.png`} alt="" />
    <img className="cloudy-2d__layer cloudy-2d__mouth-idle" src={`${ASSET_ROOT}/cloud-mouth-idle.png`} alt="" />
  </span>;
}

function CloudyMessageText({ text, allowRoomLinks }: { text: string; allowRoomLinks: boolean }) {
  return <>{parseCloudyRoomLinks(text, allowRoomLinks).map((segment, index) => {
    return segment.roomId
      ? <a key={index} href={`/rooms/${segment.roomId}`}>{segment.text} <span aria-hidden="true">→</span></a>
      : <Fragment key={index}>{segment.text}</Fragment>;
  })}</>;
}

function safeInsets() {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const insets = { top: parseFloat(style.paddingTop) || 0, right: parseFloat(style.paddingRight) || 0, bottom: parseFloat(style.paddingBottom) || 0, left: parseFloat(style.paddingLeft) || 0 };
  probe.remove();
  return insets;
}

type ChatStatus = "idle" | "pending" | "error";
type ChatError = { messageId: string; text: string } | null;

export function CloudyChatSession({ open, mascotRef, onClose, ownerMode = false }: { ownerMode?: boolean; open: boolean; mascotRef: RefObject<HTMLDivElement | null>; onClose: () => void }) {
  const preview = process.env.NODE_ENV === "development";
  const serviceRef = useRef<CloudyChatService | null>(null);
  if (preview && !serviceRef.current) serviceRef.current = createLocalCloudyChatService();
  const [messages, setMessages] = useState<CloudyChatMessage[]>([]);
  const messagesRef = useRef<CloudyChatMessage[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>("new");
  const [hasProposal, setHasProposal] = useState(false);
  const [hasContext, setHasContext] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState<ChatError>(null);
  const pendingRef = useRef<{ controller: AbortController; messageId: string } | null>(null);
  const nextId = useRef(0);

  const cancelPending = (showRetry: boolean) => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    pending.controller.abort();
    if (showRetry) {
      setStatus("error");
      setError({ messageId: pending.messageId, text: "Phản hồi đã dừng. Bạn có thể thử lại." });
    }
  };

  useEffect(() => {
    if (!open) cancelPending(true);
  }, [open]);

  useEffect(() => () => {
    pendingRef.current?.controller.abort();
    pendingRef.current = null;
  }, []);

  const send = (message: CloudyChatMessage, history: readonly CloudyChatMessage[]) => {
    if (!preview || !serviceRef.current || pendingRef.current) return;
    const controller = new AbortController();
    const request = { controller, messageId: message.id };
    pendingRef.current = request;
    setStatus("pending");
    setError(null);
    const response = message.confirmation ? serviceRef.current.confirm!(controller.signal) : serviceRef.current.send(message.text, history, controller.signal, message.filterMode ?? "new");
    void response.then((reply) => {
      if (pendingRef.current !== request || controller.signal.aborted) return;
      const cloudyMessage: CloudyChatMessage = { id: `cloudy-${++nextId.current}`, role: "cloudy", text: reply, createdAt: new Date().toISOString() };
      messagesRef.current = [...messagesRef.current, cloudyMessage];
      setMessages(messagesRef.current);
      const available = serviceRef.current?.hasContext?.() ?? false;
      setHasContext(available);
      setHasProposal(serviceRef.current?.hasProposal?.() ?? false);
      setFilterMode(available ? "continue" : "new");
      setStatus("idle");
      pendingRef.current = null;
    }).catch((cause: unknown) => {
      if (pendingRef.current !== request || controller.signal.aborted) return;
      setStatus("error");
      setError({ messageId: message.id, text: cause instanceof Error ? cause.message : "Không nhận được phản hồi AI. Hãy thử lại." });
      pendingRef.current = null;
    });
  };

  const submit = () => {
    if (!preview || pendingRef.current) return;
    const text = normalizeCloudyChatInput(draft);
    if (!text) return;
    const history = messagesRef.current;
    const message: CloudyChatMessage = { id: `user-${++nextId.current}`, role: "user", text, filterMode, createdAt: new Date().toISOString() };
    messagesRef.current = [...history, message];
    setMessages(messagesRef.current);
    setDraft("");
    send(message, history);
  };

  const invalidateProposal = () => { serviceRef.current?.discardProposal?.(); setHasProposal(false); setError(null); };
  const changeDraft = (value: string) => { invalidateProposal(); setDraft(value); };
  const changeMode = (mode: FilterMode) => { invalidateProposal(); setFilterMode(mode); };
  const editProposal = () => {
    const previous = [...messagesRef.current].reverse().find(m => m.role === "user" && !m.confirmation);
    invalidateProposal();
    if (previous) { setDraft(previous.text); setFilterMode(previous.filterMode ?? "new"); }
  };
  const confirmProposal = () => {
    if (!hasProposal || pendingRef.current || draft.trim()) return;
    const message: CloudyChatMessage = { id: `user-${++nextId.current}`, role: "user", text: "Đúng rồi, tìm phòng", confirmation: true, createdAt: new Date().toISOString() };
    const history = messagesRef.current;
    messagesRef.current = [...history, message]; setMessages(messagesRef.current);
    send(message, history);
  };

  const retry = () => {
    if (!error || pendingRef.current) return;
    const index = messagesRef.current.findIndex((message) => message.id === error.messageId);
    if (index < 0) return;
    send(messagesRef.current[index], messagesRef.current.slice(0, index));
  };

  const handleClose = () => {
    cancelPending(true);
    onClose();
  };

  if (!open) return null;
  return <CloudyChatPanel ownerMode={ownerMode} mascotRef={mascotRef} onClose={handleClose} preview={preview} messages={messages} draft={draft} onDraftChange={changeDraft} onSubmit={submit} status={status} error={error} onRetry={retry} filterMode={filterMode} onFilterModeChange={changeMode} hasContext={hasContext} hasProposal={hasProposal} onConfirm={confirmProposal} onEdit={editProposal} />;
}

function CloudyChatPanel({ ownerMode, mascotRef, onClose, preview, messages, draft, onDraftChange, onSubmit, status, error, onRetry, filterMode, onFilterModeChange, hasContext, hasProposal, onConfirm, onEdit }: {
  ownerMode: boolean;
  mascotRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  preview: boolean;
  messages: readonly CloudyChatMessage[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  status: ChatStatus;
  error: ChatError;
  onRetry: () => void;
  filterMode: FilterMode;
  onFilterModeChange: (mode: FilterMode) => void;
  hasContext: boolean;
  hasProposal: boolean;
  onConfirm: () => void;
  onEdit: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);

  useLayoutEffect(() => {
    const container = messagesRef.current;
    if (container && nearBottomRef.current) container.scrollTop = container.scrollHeight;
  }, [messages.length, status]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const mascot = mascotRef.current;
    if (!panel || !mascot) return;
    const mobile = window.matchMedia("(max-width: 760px)");
    const previousOverflow = document.body.style.overflow;
    const place = () => {
      const viewport = window.visualViewport;
      if (mobile.matches) {
        document.body.style.overflow = "hidden";
        panel.setAttribute("aria-modal", "true");
        const keyboardOffset = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
        panel.style.setProperty("--cloudy-keyboard-offset", `${keyboardOffset}px`);
        panel.style.setProperty("--cloudy-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
        panel.style.removeProperty("left");
        panel.style.removeProperty("top");
      } else {
        document.body.style.overflow = previousOverflow;
        panel.setAttribute("aria-modal", "false");
        const safe = safeInsets();
        const anchor = mascot.getBoundingClientRect();
        const width = panel.offsetWidth;
        const height = panel.offsetHeight;
        const left = anchor.left - width - 14;
        const right = anchor.right + 14;
        const x = left >= safe.left + 12 ? left : Math.min(right, window.innerWidth - safe.right - width - 12);
        const y = Math.max(safe.top + 12, Math.min(anchor.bottom - height, window.innerHeight - safe.bottom - height - 12));
        panel.style.left = `${Math.max(safe.left + 12, x)}px`;
        panel.style.top = `${y}px`;
        panel.style.removeProperty("--cloudy-keyboard-offset");
        panel.style.removeProperty("--cloudy-viewport-height");
      }
      panel.style.visibility = "visible";
    };
    const observer = new MutationObserver(place);
    observer.observe(mascot, { attributes: true, attributeFilter: ["style"] });
    const resize = () => place();
    window.addEventListener("resize", resize, { passive: true });
    viewportAdd(window.visualViewport, resize);
    mobile.addEventListener("change", resize);
    place();
    let focusFrame = 0;
    let focusAttempts = 0;
    const focusWhenReady = () => {
      if (!panel.isConnected || focusAttempts++ >= 120) return;
      if (getComputedStyle(panel).visibility === "visible") closeRef.current?.focus();
      if (document.activeElement !== closeRef.current) focusFrame = requestAnimationFrame(focusWhenReady);
    };
    focusFrame = requestAnimationFrame(focusWhenReady);
    return () => {
      cancelAnimationFrame(focusFrame);
      observer.disconnect();
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("resize", resize);
      viewportRemove(window.visualViewport, resize);
      mobile.removeEventListener("change", resize);
    };
  }, [mascotRef]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key === "Tab" && window.matchMedia("(max-width: 760px)").matches) {
        const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), textarea:not(:disabled), select:not(:disabled), input:not(:disabled)") ?? []);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;
        if (!panelRef.current?.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
    inputRef.current?.focus();
  };
  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onSubmit();
    }
  };

  return createPortal(<>
    <div className="cloudy-chat__backdrop" aria-hidden="true" onClick={onClose} />
    <section id="cloudy-chat-panel" ref={panelRef} className="cloudy-chat" role="dialog" aria-labelledby="cloudy-chat-title" aria-describedby="cloudy-chat-preview-note">
      <header className="cloudy-chat__header">
        <CloudyPortrait />
        <div className="cloudy-chat__heading"><h2 id="cloudy-chat-title">Cloudy</h2><span>{preview ? ownerMode ? "Tư vấn chủ trọ · Dữ liệu quản lý" : "AI local · Database phòng công khai" : "Đang được hoàn thiện"}</span></div>
        <button ref={closeRef} className="cloudy-chat__close" type="button" onClick={onClose} aria-label="Đóng khung chat Cloudy">×</button>
      </header>
      {ownerMode && preview ? <div className="cloudy-chat__messages"><CloudyOwnerAdvisor /></div> : <>
      <div ref={messagesRef} className="cloudy-chat__messages" role="log" aria-label="Tin nhắn Cloudy" aria-live="off" onScroll={(event) => {
        const node = event.currentTarget;
        nearBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64;
      }}>
        <div className="cloudy-chat__message-row cloudy-chat__message-row--cloudy">
          <CloudyPortrait />
          <p className="cloudy-chat__message">Xin chào! Mình là Cloudy. {preview ? "Mình sẽ nhắc lại nhu cầu để bạn xác nhận trước khi tìm trong tin phòng công khai. Chọn Lọc mới để bắt đầu, hoặc Lọc tiếp để giữ điều kiện trước và thay đổi điều bạn muốn. Ví dụ: tìm cho 2 người, dưới 3 triệu, hoặc bỏ giới hạn giá." : "Khung trò chuyện đang được chuẩn bị."}</p>
        </div>
        {messages.map((message) => <div className={`cloudy-chat__message-row cloudy-chat__message-row--${message.role}`} key={message.id}>
          {message.role === "cloudy" && <CloudyPortrait />}
          <p className="cloudy-chat__message"><span className="sr-only">{message.role === "user" ? "Bạn: " : "Cloudy: "}</span>{message.role === "user" && <small className="cloudy-chat__mode-label">{message.confirmation ? "Xác nhận" : message.filterMode === "continue" ? "Lọc tiếp" : "Lọc mới"} · </small>}<CloudyMessageText text={message.text} allowRoomLinks={message.role === "cloudy"} /></p>
        </div>)}
        {status === "pending" && <div className="cloudy-chat__message-row cloudy-chat__message-row--cloudy"><CloudyPortrait /><p className="cloudy-chat__message cloudy-chat__message--pending">Cloudy đang trả lời…</p></div>}
        {error && <div className="cloudy-chat__error"><p>{error.text}</p><button type="button" onClick={() => { onRetry(); inputRef.current?.focus(); }} disabled={status === "pending"}>Thử lại</button></div>}
      </div>
      <p className="cloudy-chat__status sr-only" role="status" aria-live="polite">{status === "pending" ? "Cloudy đang trả lời." : status === "error" ? "Phản hồi gặp lỗi. Có thể thử lại." : ""}</p>
      <form className="cloudy-chat__composer" onSubmit={handleSubmit}>
        <p id="cloudy-chat-preview-note">{preview ? "Qwen3 1.7B · Dữ liệu phòng công khai; Cloudy sẽ hỏi xác nhận trước khi tìm." : "Cloudy đang được hoàn thiện. Chưa thể gửi tin nhắn."}</p>
        {preview && <div className="cloudy-chat__filter-mode" role="group" aria-label="Bạn muốn lọc tiếp hay lọc mới?">
          <span>Bạn muốn lọc tiếp hay lọc mới?</span>
          <div>
            <button type="button" aria-pressed={filterMode === "continue"} disabled={!hasContext || status === "pending"} onClick={() => onFilterModeChange("continue")}>Lọc tiếp</button>
            <button type="button" aria-pressed={filterMode === "new"} disabled={status === "pending"} onClick={() => onFilterModeChange("new")}>Lọc mới</button>
          </div>
          <small>{filterMode === "continue" ? "Giữ điều kiện cũ; điều kiện bạn đổi sẽ thay thế điều kiện cùng loại." : "Bắt đầu từ đầu, không dùng điều kiện cũ."}</small>
        </div>}
        {preview && hasProposal && <div className="cloudy-chat__filter-mode" role="group" aria-label="Xác nhận nhu cầu tìm phòng">
          <span>Cloudy đã hiểu đúng ý bạn chưa?</span>
          <div>
            <button type="button" onClick={onConfirm} disabled={status === "pending" || !!draft.trim()}>Đúng rồi, tìm phòng</button>
            <button type="button" onClick={onEdit} disabled={status === "pending"}>Sửa yêu cầu</button>
          </div>
        </div>}
        <div className="cloudy-chat__composer-controls">
          <textarea ref={inputRef} aria-label="Tin nhắn cho Cloudy" aria-describedby={preview ? "cloudy-chat-preview-note cloudy-chat-limit" : "cloudy-chat-preview-note"} placeholder={preview ? "Nhập tin nhắn…" : "Trò chuyện chưa khả dụng"} rows={1} value={draft} maxLength={CLOUDY_CHAT_MAX_LENGTH} onChange={(event) => onDraftChange(event.target.value)} onKeyDown={handleInputKeyDown} disabled={!preview || status === "pending"} />
          <button type="submit" disabled={!preview || status === "pending" || !normalizeCloudyChatInput(draft)} aria-label={preview ? "Gửi tin nhắn" : "Gửi tin nhắn chưa khả dụng"}>Gửi</button>
        </div>
        {preview && <span id="cloudy-chat-limit" className="cloudy-chat__limit">{draft.length}/{CLOUDY_CHAT_MAX_LENGTH} ký tự · Enter gửi, Shift+Enter xuống dòng</span>}
      </form>
      </>}
    </section>
  </>, document.body);
}

function viewportAdd(viewport: VisualViewport | null, listener: () => void) {
  viewport?.addEventListener("resize", listener);
  viewport?.addEventListener("scroll", listener);
}

function viewportRemove(viewport: VisualViewport | null, listener: () => void) {
  viewport?.removeEventListener("resize", listener);
  viewport?.removeEventListener("scroll", listener);
}
