"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shared 60-second send-code countdown used by the register page and the
 * Zovii link panel.
 */
export function useSendCodeCountdown() {
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, []);

  function startCountdown(seconds: number) {
    setCountdown(seconds);
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          if (timerRef.current !== null) window.clearInterval(timerRef.current);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }

  return { countdown, startCountdown };
}
