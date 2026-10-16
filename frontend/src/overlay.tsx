/*
Created at: 2026-10-11 02:10
Updated at: 2026-10-11 02:20
Description: Shared overlay primitives for GozilaSim ID: motion presence, Escape layer stack, focus trap, scroll lock, and the Modal shell.
*/

// ###############################################
// Imports
// ###############################################

import { ReactNode, RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// ###############################################
// Motion Presence
// ###############################################

export type MotionPresenceState = "closed" | "opening" | "open" | "closing";

export const MOTION_FAST_MS = 160;
export const MOTION_BASE_MS = 220;

export function useMotionPresence(open: boolean, duration = MOTION_BASE_MS) {
  const [state, setState] = useState<MotionPresenceState>(() => open ? "open" : "closed");

  useEffect(() => {
    if (open) {
      setState("opening");
      const frame = window.requestAnimationFrame(() => setState("open"));
      return () => window.cancelAnimationFrame(frame);
    }

    if (state === "closed") return;
    setState("closing");
    const timeout = window.setTimeout(() => setState("closed"), duration);
    return () => window.clearTimeout(timeout);
  }, [duration, open]);

  return {
    mounted: state !== "closed",
    state
  };
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ###############################################
// Escape Layer Stack
// ###############################################

// Every open popover, menu, and dialog registers here so Escape closes only the topmost one.
type DismissLayer = { close: () => void };

const dismissLayers: DismissLayer[] = [];
let dismissListenerAttached = false;

function closeTopLayerOnEscape(event: KeyboardEvent) {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  const top = dismissLayers[dismissLayers.length - 1];
  if (!top) return;
  event.preventDefault();
  top.close();
}

export function useDismissLayer(active: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const layer: DismissLayer = { close: () => closeRef.current() };
    dismissLayers.push(layer);
    if (!dismissListenerAttached) {
      document.addEventListener("keydown", closeTopLayerOnEscape);
      dismissListenerAttached = true;
    }
    return () => {
      const index = dismissLayers.indexOf(layer);
      if (index >= 0) dismissLayers.splice(index, 1);
    };
  }, [active]);
}

export function useOutsideClick(ref: RefObject<HTMLElement>, active: boolean, onOutside: () => void) {
  const handlerRef = useRef(onOutside);
  handlerRef.current = onOutside;

  useEffect(() => {
    if (!active) return;
    function handleMouseDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (ref.current && !ref.current.contains(target)) handlerRef.current();
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [active, ref]);
}

// ###############################################
// Scroll Lock
// ###############################################

let scrollLockCount = 0;

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    scrollLockCount += 1;
    if (scrollLockCount === 1) {
      const scrollbarWidth = window.innerWidth - root.clientWidth;
      root.style.setProperty("overflow", "hidden");
      if (scrollbarWidth > 0) root.style.setProperty("padding-right", `${scrollbarWidth}px`);
    }
    return () => {
      scrollLockCount -= 1;
      if (scrollLockCount === 0) {
        root.style.removeProperty("overflow");
        root.style.removeProperty("padding-right");
      }
    };
  }, [active]);
}

// ###############################################
// Focus Trap
// ###############################################

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(", ");

export function useFocusTrap(ref: RefObject<HTMLElement>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableItems = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((item) => item.getClientRects().length > 0);

    if (!container.contains(document.activeElement)) {
      const preferred = container.querySelector<HTMLElement>("[data-autofocus]");
      (preferred ?? focusableItems()[0] ?? container).focus({ preventScroll: true });
    }

    function keepFocusInside(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const items = focusableItems();
      if (items.length === 0) {
        event.preventDefault();
        container?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || current === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    }

    container.addEventListener("keydown", keepFocusInside);
    return () => {
      container.removeEventListener("keydown", keepFocusInside);
      // Hand focus back to whatever opened the dialog, when it is still on the page.
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus({ preventScroll: true });
    };
  }, [active, ref]);
}

// ###############################################
// Modal
// ###############################################

export function Modal({
  open,
  onClose,
  label,
  className = "",
  dismissable = true,
  children
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  className?: string;
  dismissable?: boolean;
  children: ReactNode;
}) {
  const presence = useMotionPresence(open, MOTION_BASE_MS);
  const cardRef = useRef<HTMLDivElement>(null);
  const dismiss = () => {
    if (dismissable) onClose();
  };

  useDismissLayer(open, dismiss);
  useScrollLock(presence.mounted);
  useFocusTrap(cardRef, presence.mounted);

  if (!presence.mounted) return null;

  return createPortal(
    <div
      className="modal-overlay"
      data-state={presence.state}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div ref={cardRef} className={`modal-card ${className}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        {children}
      </div>
    </div>,
    document.body
  );
}
