"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { CLOUDY_CHAT_MAX_LENGTH, createLocalCloudyChatService, isCloudyAffirmativeReply, normalizeCloudyChatInput, type CloudyChatMessage, type CloudyChatService } from "./cloudy-chat-service";
import { CloudyPortrait } from "./cloudy-portrait";

import { CloudyOwnerAdvisor } from "./cloudy-owner-advisor";
import { ResidentAssistant } from "./resident-assistant";
import type { FilterMode } from "../../lib/cloudy-filter-context";
import { parseCloudyRoomLinks } from "../../lib/cloudy-room-links";

function CloudyMessageText({ text, allowRoomLinks }: { text: string; allowRoomLinks: boolean }) {
  return <>{parseCloudyRoomLinks(text, allowRoomLinks).map((segment, index) => {
    return segment.href || segment.roomId
      ? <a key={index} href={segment.href ?? `/rooms/${segment.roomId}`}>{segment.text} <span aria-hidden="true">→</span></a>
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
type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const resizeDirections: ResizeDirection[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

export function CloudyChatSession({ open, mascotRef, onClose, ownerMode = false, residentMode = false }: { ownerMode?: boolean; residentMode?: boolean; open: boolean; mascotRef: RefObject<HTMLDivElement | null>; onClose: () => void }) {
  const preview = process.env.NODE_ENV === "development";
  const serviceRef = useRef<CloudyChatService | null>(null);
  if (preview && !residentMode && !serviceRef.current) serviceRef.current = createLocalCloudyChatService();
  const [messages, setMessages] = useState<CloudyChatMessage[]>([]);
  const messagesRef = useRef<CloudyChatMessage[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>("new");
  const [hasProposal, setHasProposal] = useState(false);
  const [hasContext, setHasContext] = useState(false);
  const [draft, setDraft] = useState("");
  const [panelWidth, setPanelWidth] = useState(460);
  const [panelHeight, setPanelHeight] = useState(510);
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
    const hadContext = serviceRef.current.hasContext?.() ?? false;
    const confirmedByShortReply = !message.confirmation && (serviceRef.current.hasProposal?.() ?? false) && isCloudyAffirmativeReply(message.text);
    const response = message.confirmation ? serviceRef.current.confirm!(controller.signal) : serviceRef.current.send(message.text, history, controller.signal, message.filterMode ?? "new");
    void response.then((reply) => {
      if (pendingRef.current !== request || controller.signal.aborted) return;
      const cloudyMessage: CloudyChatMessage = { id: `cloudy-${++nextId.current}`, role: "cloudy", text: reply, createdAt: new Date().toISOString() };
      const nextMessages = [...messagesRef.current, cloudyMessage];
      const available = serviceRef.current?.hasContext?.() ?? false;
      if (available && (!hadContext || message.confirmation || confirmedByShortReply) && !(serviceRef.current?.hasProposal?.() ?? false)) nextMessages.push({ id: `cloudy-${++nextId.current}`, role: "cloudy", text: "Bạn muốn lọc tiếp với tiêu chí hiện tại hay lọc lại từ đầu? Trả lời “ok” hoặc “tiếp tục” để giữ tiêu chí cũ; nhập “lọc lại” để bắt đầu mới.", createdAt: new Date().toISOString() });
      messagesRef.current = nextMessages;
      setMessages(messagesRef.current);
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
    const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLocaleLowerCase("vi-VN").replace(/[.!?,…]+$/g, "").trim().replace(/\s+/g, " ");
    if (hasContext && !hasProposal && isCloudyAffirmativeReply(text)) {
      const userMessage: CloudyChatMessage = { id: `user-${++nextId.current}`, role: "user", text, filterMode: "continue", createdAt: new Date().toISOString() };
      const cloudyMessage: CloudyChatMessage = { id: `cloudy-${++nextId.current}`, role: "cloudy", text: "Được, mình sẽ giữ các tiêu chí hiện tại. Bạn gửi điều kiện muốn thêm hoặc thay đổi nhé; ví dụ: “thêm máy lạnh” hoặc “đổi sang khu Thủ Đức”.", createdAt: new Date().toISOString() };
      messagesRef.current = [...messagesRef.current, userMessage, cloudyMessage]; setMessages(messagesRef.current); setDraft(""); setFilterMode("continue"); return;
    }
    const restart = /^(?:loc lai|loc lai tu dau|loc moi|tim moi|bat dau lai)$/.test(normalized);
    const restartWithCriteria = /^(?:loc lai(?: tu dau)?|loc moi|tim moi)\s+/.test(normalized);
    if ((hasContext || hasProposal) && restart) {
      serviceRef.current?.resetContext?.(); setHasContext(false); setFilterMode("new");
      const userMessage: CloudyChatMessage = { id: `user-${++nextId.current}`, role: "user", text, filterMode: "new", createdAt: new Date().toISOString() };
      const cloudyMessage: CloudyChatMessage = { id: `cloudy-${++nextId.current}`, role: "cloudy", text: "Được, mình đã bỏ tiêu chí cũ. Bạn mô tả yêu cầu mới nhé.", createdAt: new Date().toISOString() };
      messagesRef.current = [...messagesRef.current, userMessage, cloudyMessage]; setMessages(messagesRef.current); setDraft(""); return;
    }
    const history = messagesRef.current;
    const nextMode: FilterMode = restartWithCriteria ? "new" : hasContext ? "continue" : "new";
    const message: CloudyChatMessage = { id: `user-${++nextId.current}`, role: "user", text, filterMode: nextMode, createdAt: new Date().toISOString() };
    messagesRef.current = [...history, message];
    setMessages(messagesRef.current);
    setDraft("");
    send(message, history);
  };

  const invalidateProposal = () => { serviceRef.current?.discardProposal?.(); setHasProposal(false); setError(null); };
  const changeDraft = (value: string) => { invalidateProposal(); setDraft(value); };
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
  return <CloudyChatPanel ownerMode={ownerMode} residentMode={residentMode} mascotRef={mascotRef} onClose={handleClose} preview={preview} messages={messages} draft={draft} onDraftChange={changeDraft} onSubmit={submit} status={status} error={error} onRetry={retry} hasProposal={hasProposal} onConfirm={confirmProposal} onEdit={editProposal} panelWidth={panelWidth} panelHeight={panelHeight} setPanelWidth={setPanelWidth} setPanelHeight={setPanelHeight} />;
}

function CloudyChatPanel({ ownerMode, residentMode, mascotRef, onClose, preview, messages, draft, onDraftChange, onSubmit, status, error, onRetry, hasProposal, onConfirm, onEdit, panelWidth, panelHeight, setPanelWidth, setPanelHeight }: {
  ownerMode: boolean;
  residentMode: boolean;
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
  hasProposal: boolean;
  onConfirm: () => void;
  onEdit: () => void;
  panelWidth: number;
  panelHeight: number;
  setPanelWidth: (width: number | ((previous: number) => number)) => void;
  setPanelHeight: (height: number | ((previous: number) => number)) => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);

  const resizePanel = (direction: ResizeDirection, start: DOMRect, deltaX: number, deltaY: number) => {
    const panel = panelRef.current;
    if (!panel) return;
    const safe = safeInsets();
    const minLeft = safe.left + 12;
    const maxRight = window.innerWidth - safe.right - 12;
    const minTop = safe.top + 12;
    const maxBottom = window.innerHeight - safe.bottom - 12;
    const minWidth = Math.min(360, maxRight - minLeft);
    const maxWidth = Math.min(720, maxRight - minLeft);
    const minHeight = Math.min(320, maxBottom - minTop);
    const maxHeight = Math.min(760, maxBottom - minTop);
    let left = start.left;
    let right = start.right;
    let top = start.top;
    let bottom = start.bottom;

    if (direction.includes("w")) left = Math.max(minLeft, Math.min(start.left + deltaX, right - minWidth));
    if (direction.includes("e")) right = Math.min(maxRight, Math.max(start.right + deltaX, left + minWidth));
    if (direction.includes("n")) top = Math.max(minTop, Math.min(start.top + deltaY, bottom - minHeight));
    if (direction.includes("s")) bottom = Math.min(maxBottom, Math.max(start.bottom + deltaY, top + minHeight));

    const nextWidth = Math.min(maxWidth, right - left);
    const nextHeight = Math.min(maxHeight, bottom - top);
    if (direction.includes("w")) left = right - nextWidth;
    else right = left + nextWidth;
    if (direction.includes("n")) top = bottom - nextHeight;
    else bottom = top + nextHeight;

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    setPanelWidth(nextWidth);
    setPanelHeight(nextHeight);
  };

  const startPanelResize = (direction: ResizeDirection, event: ReactPointerEvent<HTMLDivElement>) => {
    if (window.matchMedia("(max-width: 760px)").matches || event.button !== 0) return;
    event.preventDefault();
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const onMove = (move: PointerEvent) => resizePanel(direction, rect, move.clientX - startX, move.clientY - startY);
    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  };

  const resizeHandleKeyDown = (direction: ResizeDirection, event: ReactKeyboardEvent<HTMLDivElement>) => {
    const deltaX = event.key === "ArrowLeft" ? -40 : event.key === "ArrowRight" ? 40 : 0;
    const deltaY = event.key === "ArrowUp" ? -40 : event.key === "ArrowDown" ? 40 : 0;
    if (!deltaX && !deltaY) return;
    event.preventDefault();
    const panel = panelRef.current;
    if (panel) resizePanel(direction, panel.getBoundingClientRect(), deltaX, deltaY);
  };

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
    <section id="cloudy-chat-panel" ref={panelRef} className="cloudy-chat" style={{ "--cloudy-chat-width": `${panelWidth}px`, "--cloudy-chat-height": `${panelHeight}px` } as CSSProperties} role="dialog" aria-labelledby="cloudy-chat-title" aria-describedby={residentMode || ownerMode ? undefined : "cloudy-chat-preview-note"}>
      {resizeDirections.map((direction) => <div key={direction} className={`cloudy-chat__resize-handle cloudy-chat__resize-handle--${direction}`} role="separator" aria-label={`Kéo cạnh ${direction} để đổi kích thước khung chat`} aria-orientation={direction === "e" || direction === "w" ? "vertical" : direction === "n" || direction === "s" ? "horizontal" : undefined} aria-valuenow={Math.round(direction.includes("e") || direction.includes("w") ? panelWidth : panelHeight)} tabIndex={0} onPointerDown={(event) => startPanelResize(direction, event)} onKeyDown={(event) => resizeHandleKeyDown(direction, event)} />)}
      <header className="cloudy-chat__header">
        <CloudyPortrait />
        <div className="cloudy-chat__heading"><h2 id="cloudy-chat-title">Cloudy</h2><span>{residentMode ? "Hỗ trợ khách thuê" : preview ? ownerMode ? "Hỗ trợ quản lý nhà trọ" : "AI được huấn luyện bởi đội ngũ DayOne Studio" : "Đang được hoàn thiện"}</span></div>
        <button ref={closeRef} className="cloudy-chat__close" type="button" onClick={onClose} aria-label="Đóng khung chat Cloudy">×</button>
      </header>
      {residentMode ? <ResidentAssistant /> : ownerMode && preview ? <div className="cloudy-chat__messages"><CloudyOwnerAdvisor /></div> : <>
      <div ref={messagesRef} className="cloudy-chat__messages" role="log" aria-label="Tin nhắn Cloudy" aria-live="off" onScroll={(event) => {
        const node = event.currentTarget;
        nearBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64;
      }}>
        <div className="cloudy-chat__message-row cloudy-chat__message-row--cloudy">
          <CloudyPortrait />
          <div className="cloudy-chat__message cloudy-chat__welcome">
            <p>Chào bạn, mình là Cloudy, trợ lý tìm phòng của Góc Trọ ☁️ Bạn cứ mô tả khu vực, mức giá, diện tích, số người và tiện ích mong muốn. Mình sẽ nhắc lại tiêu chí để bạn xác nhận trước khi tìm phòng phù hợp.</p>
            <p className="cloudy-chat__welcome-note">{preview ? "Ví dụ: “Tìm phòng Long Khánh dưới 4 triệu, có máy lạnh, cho 2 người.”" : "Tính năng tìm phòng qua trò chuyện đang được hoàn thiện."}</p>
          </div>
        </div>
        {messages.map((message) => <div className={`cloudy-chat__message-row cloudy-chat__message-row--${message.role}`} key={message.id}>
          {message.role === "cloudy" && <CloudyPortrait />}
          <p className="cloudy-chat__message"><span className="sr-only">{message.role === "user" ? "Bạn: " : "Cloudy: "}</span><CloudyMessageText text={message.text} allowRoomLinks={message.role === "cloudy"} /></p>
        </div>)}
        {status === "pending" && <div className="cloudy-chat__message-row cloudy-chat__message-row--cloudy"><CloudyPortrait /><p className="cloudy-chat__message cloudy-chat__message--pending"><span>Cloudy đang nghĩ</span><span className="resident-assistant-thinking-dots" aria-hidden="true"><i/><i/><i/></span></p></div>}
        {error && <div className="cloudy-chat__error"><p>{error.text}</p><button type="button" onClick={() => { onRetry(); inputRef.current?.focus(); }} disabled={status === "pending"}>Thử lại</button></div>}
      </div>
      <p className="cloudy-chat__status sr-only" role="status" aria-live="polite">{status === "pending" ? "Cloudy đang trả lời." : status === "error" ? "Phản hồi gặp lỗi. Có thể thử lại." : ""}</p>
      <form className="cloudy-chat__composer" onSubmit={handleSubmit}>
        <p id="cloudy-chat-preview-note">{preview ? "Hãy nhập khu vực, mức giá hoặc tiện ích bạn quan tâm." : "Cloudy đang được hoàn thiện. Chưa thể gửi tin nhắn."}</p>
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
