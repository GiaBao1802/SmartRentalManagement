"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "./auth-provider";
import { ResidentAssistant } from "./resident-assistant";
import { CloudyChatSession } from "./cloudy-chat-panel";
import { cloudyChatSessionKey } from "./cloudy-chat-session-key";
import { cloudySuggestionSource, validateCloudySuggestion, type CloudySuggestion, type CloudySuggestionScope } from "./cloudy-suggestion-source";

const ASSET_ROOT = "/mascot/cloudy-2d";
const POSITION_KEY = "cloudy-2d-position";
const DRAG_THRESHOLD = 6;
const SUGGESTION_KEY = "cloudy-2d-suggestions-seen";
const SUGGESTION_IDLE_MS = 5000;
const SUGGESTION_VISIBLE_MS = 6000;

type Position = { x: number; y: number };
type Drag = { id: number; startX: number; startY: number; x: number; y: number; original: Position | null; dragging: boolean };
type SuggestionView = { key: string; value: CloudySuggestion };

function safeInsets() {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const insets = { top: parseFloat(style.paddingTop) || 0, right: parseFloat(style.paddingRight) || 0, bottom: parseFloat(style.paddingBottom) || 0, left: parseFloat(style.paddingLeft) || 0 };
  probe.remove();
  return insets;
}

function accountCloudyHue(accountId: string | null) {
  if (!accountId) return undefined;
  const numericId = Number(accountId);
  if (Number.isSafeInteger(numericId) && numericId > 0) {
    return `${((numericId - 1) * 137.508) % 360}deg`;
  }
  let hash = 2166136261;
  for (let index = 0; index < accountId.length; index += 1) {
    hash ^= accountId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${(hash >>> 0) % 360}deg`;
}

function clampPosition(position: Position, element: HTMLElement): Position {
  const safe = safeInsets();
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  const minX = safe.left + 8;
  const maxX = Math.max(minX, window.innerWidth - safe.right - width - 8);
  const minY = safe.top + 8;
  // Leave room for the reset button below the illustration.
  const maxY = Math.max(minY, window.innerHeight - safe.bottom - height - 34);
  return { x: Math.min(maxX, Math.max(minX, position.x)), y: Math.min(maxY, Math.max(minY, position.y)) };
}

function isAllowedRoute(pathname: string, authenticated: boolean) {
  if (pathname === "/" || pathname === "/tim-phong" || pathname === "/landing" || pathname === "/rooms" || pathname.startsWith("/rooms/")) return true;
  if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/tenant" || pathname.startsWith("/tenant/")) return authenticated;
  return false;
}

export function Cloudy2D() {
  const pathname = usePathname();
  const { status, user } = useAuth();
  const visible = isAllowedRoute(pathname, status === "authenticated");
  const isExplorer = pathname === "/" || pathname === "/rooms";
  const accountId = status === "authenticated" ? user?.account.account_id ?? null : null;
  const cloudyHue = accountCloudyHue(accountId);
  const role = status === "authenticated" ? user?.account.role : null;
  const suggestionScope: CloudySuggestionScope | null = pathname === "/admin" || pathname.startsWith("/admin/")
    ? role === "admin" ? "admin" : null
    : pathname === "/tenant" || pathname.startsWith("/tenant/")
      ? role === "resident" ? "resident" : null
      : visible ? "public" : null;
  const suggestionKey = `${pathname}|${suggestionScope ?? "none"}|${accountId ?? "anonymous"}`;
  const chatScopeKey = cloudyChatSessionKey(suggestionScope, status, accountId, role);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const eyesRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const dismissSuggestionRef = useRef<() => void>(() => {});
  const dragRef = useRef<Drag | null>(null);
  const suppressClickRef = useRef(false);
  const chatOpenRef = useRef(false);
  const restoreFocusRef = useRef(false);
  const positionRef = useRef<Position | null>(null);
  const [moved, setMoved] = useState(false);
  const [eyesClosed, setEyesClosed] = useState(false);
  const [suggestionView, setSuggestionView] = useState<SuggestionView | null>(null);
  const [suggestionShowing, setSuggestionShowing] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const closeChat = useCallback(() => {
    chatOpenRef.current = false;
    restoreFocusRef.current = true;
    setChatOpen(false);
  }, []);

  useEffect(() => {
    if (!chatOpen && restoreFocusRef.current && visible) {
      restoreFocusRef.current = false;
      triggerRef.current?.focus();
    }
  }, [chatOpen, visible]);

  useEffect(() => {
    chatOpenRef.current = false;
    restoreFocusRef.current = false;
    setChatOpen(false);
  }, [chatScopeKey, visible]);

  const positionBubble = useCallback(() => {
    const root = rootRef.current;
    const bubble = bubbleRef.current;
    if (!root || !bubble || getComputedStyle(root).visibility !== "visible") return false;
    const safe = safeInsets();
    const mascot = root.getBoundingClientRect();
    const width = bubble.offsetWidth;
    const height = bubble.offsetHeight;
    const margin = 8;
    const candidates = [
      { x: mascot.left - width - 12, y: mascot.top + (mascot.height - height) / 2 },
      { x: mascot.left + (mascot.width - width) / 2, y: mascot.top - height - 12 },
      { x: mascot.left + (mascot.width - width) / 2, y: mascot.bottom + 12 },
      { x: mascot.right + 12, y: mascot.top + (mascot.height - height) / 2 },
    ];
    const blocked = document.querySelectorAll("header, nav, form, button, a, input, textarea, select, [role='button'], [role='navigation'], [role='dialog'], .explore-camera-controls, .explore-results.is-expanded");
    for (const candidate of candidates) {
      const x = Math.min(window.innerWidth - safe.right - width - margin, Math.max(safe.left + margin, candidate.x));
      const y = Math.min(window.innerHeight - safe.bottom - height - margin, Math.max(safe.top + margin, candidate.y));
      const box = { left: x, top: y, right: x + width, bottom: y + height };
      if (box.left < safe.left + margin || box.top < safe.top + margin || box.right > window.innerWidth - safe.right - margin || box.bottom > window.innerHeight - safe.bottom - margin) continue;
      const overlaps = (other: { left: number; right: number; top: number; bottom: number }) => box.left < other.right + 6 && box.right > other.left - 6 && box.top < other.bottom + 6 && box.bottom > other.top - 6;
      if (overlaps(mascot) || Array.from(blocked).some((element) => !root.contains(element) && overlaps(element.getBoundingClientRect()))) continue;
      bubble.style.left = `${x - mascot.left}px`;
      bubble.style.top = `${y - mascot.top}px`;
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    setSuggestionView(null);
    setSuggestionShowing(false);
    if (!visible || !suggestionScope) return;

    let active = true;
    let candidate: CloudySuggestion | null = null;
    let shown = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const seen = () => {
      try {
        const value: unknown = JSON.parse(sessionStorage.getItem(SUGGESTION_KEY) ?? "[]");
        return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string").slice(-50) : [];
      } catch { return []; }
    };
    const dismiss = () => {
      clearTimeout(idleTimer);
      clearTimeout(hideTimer);
      setSuggestionShowing(false);
    };
    dismissSuggestionRef.current = dismiss;
    const schedule = () => {
      clearTimeout(idleTimer);
      if (!candidate || shown || document.hidden || dragRef.current || chatOpenRef.current) return;
      idleTimer = setTimeout(() => {
        if (!active || !candidate || document.hidden || dragRef.current || chatOpenRef.current) return;
        if (Date.parse(candidate.expiresAt) <= Date.now() || !positionBubble()) return;
        shown = true;
        try { sessionStorage.setItem(SUGGESTION_KEY, JSON.stringify([...new Set([...seen(), candidate.id])].slice(-50))); } catch { /* Session storage can be unavailable. */ }
        setSuggestionShowing(true);
        hideTimer = setTimeout(dismiss, Math.min(SUGGESTION_VISIBLE_MS, Date.parse(candidate.expiresAt) - Date.now()));
      }, SUGGESTION_IDLE_MS);
    };
    const onActivity = () => { if (!shown) schedule(); };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
      else onActivity();
    };
    const onVisibility = () => {
      if (document.hidden) { clearTimeout(idleTimer); dismiss(); }
      else schedule();
    };
    window.addEventListener("pointermove", onActivity, { passive: true });
    window.addEventListener("pointerdown", onActivity, { passive: true });
    window.addEventListener("wheel", onActivity, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("visibilitychange", onVisibility);

    void Promise.resolve(cloudySuggestionSource({ pathname, scope: suggestionScope, accountId }))
      .then((value) => {
        if (!active) return;
        candidate = validateCloudySuggestion(value, suggestionScope);
        if (!candidate || seen().includes(candidate.id)) return;
        setSuggestionView({ key: suggestionKey, value: candidate });
        schedule();
      })
      .catch(() => { /* No suggestion is a valid fallback. */ });

    return () => {
      active = false;
      clearTimeout(idleTimer);
      clearTimeout(hideTimer);
      dismissSuggestionRef.current = () => {};
      window.removeEventListener("pointermove", onActivity);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("wheel", onActivity);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [visible, suggestionScope, suggestionKey, pathname, accountId, positionBubble]);

  const applyPosition = (position: Position) => {
    const root = rootRef.current;
    if (!root) return;
    const next = clampPosition(position, root);
    positionRef.current = next;
    root.style.left = `${next.x}px`;
    root.style.top = `${next.y}px`;
    root.style.right = "auto";
    root.style.bottom = "auto";
    if (bubbleRef.current && !positionBubble()) dismissSuggestionRef.current();
  };

  useEffect(() => {
    if (!visible) return;
    try {
      const stored = sessionStorage.getItem(POSITION_KEY);
      if (stored) {
        const value: unknown = JSON.parse(stored);
        if (value && typeof value === "object" && "x" in value && "y" in value && typeof value.x === "number" && typeof value.y === "number" && Number.isFinite(value.x) && Number.isFinite(value.y)) {
          applyPosition({ x: value.x, y: value.y });
          setMoved(true);
        }
      }
    } catch { /* Storage may be unavailable in private browsing. */ }
    const onResize = () => {
      if (positionRef.current) applyPosition(positionRef.current);
      else if (bubbleRef.current && !positionBubble()) dismissSuggestionRef.current();
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, [visible]);

  const openChat = () => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    if (chatOpenRef.current) return;
    dismissSuggestionRef.current();
    chatOpenRef.current = true;
    setChatOpen(true);
  };

  const onDragStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    const root = rootRef.current;
    if (!root) return;
    suppressClickRef.current = false;
    dismissSuggestionRef.current();
    const bounds = root.getBoundingClientRect();
    dragRef.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: bounds.left, y: bounds.top, original: positionRef.current, dragging: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onDragMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.dragging = true;
    applyPosition({ x: drag.x + dx, y: drag.y + dy });
  };

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    if (drag.dragging || cancelled) suppressClickRef.current = true;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (cancelled && drag.dragging) {
      if (drag.original) applyPosition(drag.original);
      else {
        positionRef.current = null;
        const root = rootRef.current;
        for (const property of ["left", "top", "right", "bottom"]) root?.style.removeProperty(property);
      }
      return;
    }
    if (drag.dragging && positionRef.current) {
      setMoved(true);
      try { sessionStorage.setItem(POSITION_KEY, JSON.stringify(positionRef.current)); } catch { /* Storage may be unavailable. */ }
    }
  };

  const resetPosition = () => {
    dragRef.current = null;
    positionRef.current = null;
    const root = rootRef.current;
    if (root) {
      root.style.removeProperty("left");
      root.style.removeProperty("top");
      root.style.removeProperty("right");
      root.style.removeProperty("bottom");
    }
    try { sessionStorage.removeItem(POSITION_KEY); } catch { /* Storage may be unavailable. */ }
    setMoved(false);
  };

  useEffect(() => {
    if (!visible) return;

    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 761px)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let lastFrameTime = 0;
    let currentX = 0;
    let currentY = 0;
    let targetX = 0;
    let targetY = 0;
    let mouthTimer: ReturnType<typeof setTimeout> | undefined;
    let lastPointer: Position | null = null;
    let curious = false;

    const showMouth = (nextCurious: boolean) => {
      if (curious === nextCurious) return;
      curious = nextCurious;
      rootRef.current?.classList.toggle("is-curious", nextCurious);
    };
    const idleMouth = () => {
      clearTimeout(mouthTimer);
      mouthTimer = undefined;
      showMouth(false);
    };

    const paintEyes = (time: number) => {
      frame = 0;
      const delta = lastFrameTime ? Math.min(48, time - lastFrameTime) : 16;
      lastFrameTime = time;
      const ease = 1 - Math.exp(-delta / 95);
      currentX += (targetX - currentX) * ease;
      currentY += (targetY - currentY) * ease;
      if (Math.abs(targetX - currentX) < 0.04 && Math.abs(targetY - currentY) < 0.04) {
        currentX = targetX;
        currentY = targetY;
      }
      if (eyesRef.current) eyesRef.current.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
      if (currentX !== targetX || currentY !== targetY) frame = window.requestAnimationFrame(paintEyes);
      else lastFrameTime = 0;
    };
    const queueEyes = (x: number, y: number) => {
      targetX = x;
      targetY = y;
      if (!frame && (currentX !== targetX || currentY !== targetY)) frame = window.requestAnimationFrame(paintEyes);
    };
    const centerEyes = () => queueEyes(0, 0);
    const centerImmediately = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
      lastFrameTime = 0;
      currentX = targetX = 0;
      currentY = targetY = 0;
      if (eyesRef.current) eyesRef.current.style.transform = "translate3d(0px, 0px, 0)";
    };
    const onPointerMove = (event: PointerEvent) => {
      if (dragRef.current) { idleMouth(); lastPointer = null; return; }
      if (event.pointerType !== "mouse") return;
      if (!finePointer.matches || reducedMotion.matches || document.hidden) { idleMouth(); lastPointer = null; return; }
      if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY) || event.clientX < 0 || event.clientY < 0 || event.clientX > window.innerWidth || event.clientY > window.innerHeight) {
        centerEyes();
        idleMouth();
        lastPointer = null;
        return;
      }
      if (lastPointer && Math.hypot(event.clientX - lastPointer.x, event.clientY - lastPointer.y) >= 3) {
        showMouth(true);
        clearTimeout(mouthTimer);
        mouthTimer = setTimeout(idleMouth, 900);
      }
      lastPointer = { x: event.clientX, y: event.clientY };
      const bounds = rootRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const dx = event.clientX - (bounds.left + bounds.width / 2);
      const dy = event.clientY - (bounds.top + bounds.height / 2);
      const distance = Math.hypot(dx, dy);
      // Ignore tiny movements near Cloudy and keep the eye pair inside the face.
      const strength = Math.min(1, Math.max(0, (distance - 26) / 230));
      queueEyes(
        (dx / (distance || 1)) * 3 * strength,
        (dy / (distance || 1)) * 2.5 * strength,
      );
    };
    const onPointerOut = (event: MouseEvent) => {
      if (!event.relatedTarget) {
        centerEyes();
        idleMouth();
        lastPointer = null;
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) { centerEyes(); idleMouth(); lastPointer = null; }
    };
    const onMediaChange = () => {
      if (reducedMotion.matches || !finePointer.matches) { centerImmediately(); idleMouth(); lastPointer = null; }
      else centerEyes();
    };
    const onBlur = () => { centerEyes(); idleMouth(); lastPointer = null; };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("mouseout", onPointerOut);
    window.addEventListener("blur", onBlur);
    window.addEventListener("resize", centerEyes, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    finePointer.addEventListener("change", onMediaChange);
    reducedMotion.addEventListener("change", onMediaChange);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("mouseout", onPointerOut);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", centerEyes);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      finePointer.removeEventListener("change", onMediaChange);
      reducedMotion.removeEventListener("change", onMediaChange);
      window.cancelAnimationFrame(frame);
      clearTimeout(mouthTimer);
      rootRef.current?.classList.remove("is-curious");
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let blinkTimer: ReturnType<typeof setTimeout> | undefined;
    let reopenTimer: ReturnType<typeof setTimeout> | undefined;
    let blinkCount = 0;

    const scheduleBlink = () => {
      blinkTimer = setTimeout(() => {
        if (document.hidden || reducedMotion.matches) return;
        setEyesClosed(true);
        reopenTimer = setTimeout(() => {
          setEyesClosed(false);
          blinkCount += 1;
          scheduleBlink();
        }, 140);
      }, 8000 + (blinkCount % 3) * 1700);
    };
    const restart = () => {
      clearTimeout(blinkTimer);
      clearTimeout(reopenTimer);
      setEyesClosed(false);
      if (!document.hidden && !reducedMotion.matches) scheduleBlink();
    };
    document.addEventListener("visibilitychange", restart);
    reducedMotion.addEventListener("change", restart);
    restart();
    return () => {
      clearTimeout(blinkTimer);
      clearTimeout(reopenTimer);
      document.removeEventListener("visibilitychange", restart);
      reducedMotion.removeEventListener("change", restart);
    };
  }, [visible]);

  if (!visible) return null;

  return <>
    <div ref={rootRef} className={`cloudy-2d${isExplorer ? " cloudy-2d--explorer" : ""}`} role="group" aria-label="Cloudy, linh vật đám mây">
      <img className="cloudy-2d__layer" src={`${ASSET_ROOT}/cloud-body.png`} width="1254" height="1254" alt="" draggable={false} style={cloudyHue ? { filter: `hue-rotate(${cloudyHue}) saturate(1.35)` } : undefined} />
      <span ref={eyesRef} className="cloudy-2d__eye-pair" aria-hidden="true">
        <img className={`cloudy-2d__layer cloudy-2d__eye cloudy-2d__eye--left cloudy-2d__eyes${eyesClosed ? " is-closed" : ""}`} src={`${ASSET_ROOT}/cloud-eyes-open.png`} width="1254" height="1254" alt="" draggable={false} />
        <img className={`cloudy-2d__layer cloudy-2d__eye cloudy-2d__eye--right cloudy-2d__eyes${eyesClosed ? " is-closed" : ""}`} src={`${ASSET_ROOT}/cloud-eyes-open.png`} width="1254" height="1254" alt="" draggable={false} />
        <img className={`cloudy-2d__layer cloudy-2d__eye cloudy-2d__eye--left cloudy-2d__eyes-closed${eyesClosed ? " is-closed" : ""}`} src={`${ASSET_ROOT}/cloud-eyes-closed.png`} width="1254" height="1254" alt="" draggable={false} />
        <img className={`cloudy-2d__layer cloudy-2d__eye cloudy-2d__eye--right cloudy-2d__eyes-closed${eyesClosed ? " is-closed" : ""}`} src={`${ASSET_ROOT}/cloud-eyes-closed.png`} width="1254" height="1254" alt="" draggable={false} />
      </span>
      <img className="cloudy-2d__layer cloudy-2d__nose" src={`${ASSET_ROOT}/cloud-nose.png`} width="1254" height="1254" alt="" draggable={false} />
      <img className="cloudy-2d__layer cloudy-2d__mouth-idle" src={`${ASSET_ROOT}/cloud-mouth-idle.png`} width="1254" height="1254" alt="" draggable={false} />
      <button ref={triggerRef} type="button" className="cloudy-2d__drag-handle" aria-label="Mở khung chat Cloudy" aria-expanded={chatOpen} aria-controls={chatOpen ? "cloudy-chat-panel" : undefined} onPointerEnter={() => dismissSuggestionRef.current()} onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={(event) => finishDrag(event, false)} onPointerCancel={(event) => finishDrag(event, true)} onLostPointerCapture={(event) => finishDrag(event, true)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") suppressClickRef.current = false; }} onClick={openChat} />
      {moved && <button type="button" className="cloudy-2d__reset" onClick={resetPosition} aria-label="Đưa Cloudy về vị trí mặc định" title="Đưa Cloudy về vị trí mặc định">↶</button>}
      {suggestionView?.key === suggestionKey && <div ref={bubbleRef} className="cloudy-2d__thought" style={{ visibility: suggestionShowing ? "visible" : "hidden" }} role="status" aria-live="polite" aria-hidden={!suggestionShowing}>
        {suggestionView.value.id.startsWith("preview:") && <strong>MÔ PHỎNG · CLOUDY</strong>}
        <span>{suggestionView.value.text}</span>
      </div>}
    </div>
    {status === "authenticated" && role === "resident" ? (chatOpen && <ResidentAssistant key={chatScopeKey} onClose={closeChat} />) : <CloudyChatSession ownerMode={role === "admin"} key={chatScopeKey} open={chatOpen} mascotRef={rootRef} onClose={closeChat} />}
  </>;
}
