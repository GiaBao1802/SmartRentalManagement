"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { CLOUDY_CHAT_MAX_LENGTH, createLocalCloudyChatService, normalizeCloudyChatInput, type CloudyChatMessage, type CloudyChatService } from "./cloudy-chat-service";

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

export function CloudyChatSession({ open, mascotRef, onClose }: { open: boolean; mascotRef: RefObject<HTMLDivElement | null>; onClose: () => void }) {
  const preview = process.env.NODE_ENV === "development";
  const serviceRef = useRef<CloudyChatService | null>(null);
  if (preview && !serviceRef.current) serviceRef.current = createLocalCloudyChatService();
  const [messages, setMessages] = useState<CloudyChatMessage[]>([]);
  const messagesRef = useRef<CloudyChatMessage[]>([]);
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
    void serviceRef.current.send(message.text, history, controller.signal).then((reply) => {
      if (pendingRef.current !== request || controller.signal.aborted) return;
      const cloudyMessage: CloudyChatMessage = { id: `cloudy-${++nextId.current}`, role: "cloudy", text: reply, createdAt: new Date().toISOString() };
      messagesRef.current = [...messagesRef.current, cloudyMessage];
      setMessages(messagesRef.current);
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
    const message: CloudyChatMessage = { id: `user-${++nextId.current}`, role: "user", text, createdAt: new Date().toISOString() };
    messagesRef.current = [...history, message];
    setMessages(messagesRef.current);
    setDraft("");
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
  return <CloudyChatPanel mascotRef={mascotRef} onClose={handleClose} preview={preview} messages={messages} draft={draft} onDraftChange={setDraft} onSubmit={submit} status={status} error={error} onRetry={retry} />;
}

function CloudyChatPanel({ mascotRef, onClose, preview, messages, draft, onDraftChange, onSubmit, status, error, onRetry }: {
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
        const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), textarea:not(:disabled)") ?? []);
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
        <div className="cloudy-chat__heading"><h2 id="cloudy-chat-title">Cloudy</h2><span>{preview ? "AI local · Phòng giả lập" : "Đang được hoàn thiện"}</span></div>
        <button ref={closeRef} className="cloudy-chat__close" type="button" onClick={onClose} aria-label="Đóng khung chat Cloudy">×</button>
      </header>
      <div ref={messagesRef} className="cloudy-chat__messages" role="log" aria-label="Tin nhắn Cloudy" aria-live="off" onScroll={(event) => {
        const node = event.currentTarget;
        nearBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64;
      }}>
        <div className="cloudy-chat__message-row cloudy-chat__message-row--cloudy">
          <CloudyPortrait />
          <p className="cloudy-chat__message">Xin chào! Mình là Cloudy. {preview ? "Mình giúp tìm trong 300 phòng giả lập. Hãy gửi đủ điều kiện trong mỗi tin nhắn; mình chưa hiểu câu nối tiếp như ‘rẻ hơn nữa’. Ví dụ: Phòng ở Bến Nắng dưới 4 triệu có máy lạnh." : "Khung trò chuyện đang được chuẩn bị."}</p>
        </div>
        {messages.map((message) => <div className={`cloudy-chat__message-row cloudy-chat__message-row--${message.role}`} key={message.id}>
          {message.role === "cloudy" && <CloudyPortrait />}
          <p className="cloudy-chat__message"><span className="sr-only">{message.role === "user" ? "Bạn: " : "Cloudy: "}</span>{message.text}</p>
        </div>)}
        {status === "pending" && <div className="cloudy-chat__message-row cloudy-chat__message-row--cloudy"><CloudyPortrait /><p className="cloudy-chat__message cloudy-chat__message--pending">Cloudy đang trả lời…</p></div>}
        {error && <div className="cloudy-chat__error"><p>{error.text}</p><button type="button" onClick={() => { onRetry(); inputRef.current?.focus(); }} disabled={status === "pending"}>Thử lại</button></div>}
      </div>
      <p className="cloudy-chat__status sr-only" role="status" aria-live="polite">{status === "pending" ? "Cloudy đang trả lời." : status === "error" ? "Phản hồi gặp lỗi. Có thể thử lại." : ""}</p>
      <form className="cloudy-chat__composer" onSubmit={handleSubmit}>
        <p id="cloudy-chat-preview-note">{preview ? "Qwen3 1.7B · 300 phòng giả lập, không phải tin thật. Mỗi tin nhắn là một yêu cầu riêng." : "Cloudy đang được hoàn thiện. Chưa thể gửi tin nhắn."}</p>
        <div className="cloudy-chat__composer-controls">
          <textarea ref={inputRef} aria-label="Tin nhắn cho Cloudy" aria-describedby={preview ? "cloudy-chat-preview-note cloudy-chat-limit" : "cloudy-chat-preview-note"} placeholder={preview ? "Nhập tin nhắn…" : "Trò chuyện chưa khả dụng"} rows={1} value={draft} maxLength={CLOUDY_CHAT_MAX_LENGTH} onChange={(event) => onDraftChange(event.target.value)} onKeyDown={handleInputKeyDown} disabled={!preview} />
          <button type="submit" disabled={!preview || status === "pending" || !normalizeCloudyChatInput(draft)} aria-label={preview ? "Gửi tin nhắn" : "Gửi tin nhắn chưa khả dụng"}>Gửi</button>
        </div>
        {preview && <span id="cloudy-chat-limit" className="cloudy-chat__limit">{draft.length}/{CLOUDY_CHAT_MAX_LENGTH} ký tự · Enter gửi, Shift+Enter xuống dòng</span>}
      </form>
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
