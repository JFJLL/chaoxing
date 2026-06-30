"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

function clearPendingElement(element: HTMLElement | null) {
  if (!element) return;
  element.removeAttribute("data-cx-pending");
  element.removeAttribute("aria-busy");
}

function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

function shouldIgnoreAnchor(anchor: HTMLAnchorElement) {
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || anchor.target === "_blank" || anchor.hasAttribute("download")) return true;

  try {
    const url = new URL(anchor.href);
    return url.origin !== window.location.origin || url.href === window.location.href;
  } catch {
    return true;
  }
}

export function InteractionFeedback() {
  const pathname = usePathname();
  const progressRef = useRef<HTMLDivElement | null>(null);
  const clickedElementRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const clear = () => {
      progressRef.current?.setAttribute("data-active", "false");
      clearPendingElement(clickedElementRef.current);
      clickedElementRef.current = null;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    clear();
  }, [pathname]);

  useEffect(() => {
    function markPending(element: HTMLElement, timeoutMs: number) {
      clearPendingElement(clickedElementRef.current);
      clickedElementRef.current = element;
      element.setAttribute("data-cx-pending", "true");
      element.setAttribute("aria-busy", "true");
      progressRef.current?.setAttribute("data-active", "true");

      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        progressRef.current?.setAttribute("data-active", "false");
        clearPendingElement(clickedElementRef.current);
        clickedElementRef.current = null;
        timerRef.current = null;
      }, timeoutMs);
    }

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || isModifiedClick(event)) return;
      const target = event.target instanceof Element ? event.target : null;
      const element = target?.closest<HTMLElement>("a[href],button,[role='button'],input[type='submit']");
      if (!element) return;
      if (element.matches("[disabled],[aria-disabled='true']")) return;

      if (element instanceof HTMLAnchorElement) {
        if (shouldIgnoreAnchor(element)) return;
        markPending(element, 12_000);
        return;
      }

      markPending(element, 1_200);
    }

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      clearPendingElement(clickedElementRef.current);
    };
  }, []);

  return <div ref={progressRef} className="cx-route-progress" data-active="false" aria-hidden="true" />;
}
