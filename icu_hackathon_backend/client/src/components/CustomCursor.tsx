"use client";

import { useEffect, useRef, useState } from "react";

export default function CustomCursor() {
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const targetRef = useRef({ x: -100, y: -100 });
  const currentRef = useRef({ x: -100, y: -100 });
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const media = window.matchMedia("(pointer: fine)");

    const updateMode = () => {
      const active = media.matches;
      setEnabled(active);
      document.body.classList.toggle("custom-cursor-enabled", active);
    };

    const tick = () => {
      rafRef.current = null;

      const current = currentRef.current;
      const target = targetRef.current;

      current.x += (target.x - current.x) * 0.35;
      current.y += (target.y - current.y) * 0.35;

      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate3d(${current.x}px, ${current.y}px, 0) translate(-50%, -50%)`;
      }

      if (Math.abs(target.x - current.x) > 0.1 || Math.abs(target.y - current.y) > 0.1) {
        rafRef.current = window.requestAnimationFrame(tick);
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      targetRef.current = { x: event.clientX, y: event.clientY };

      if (rafRef.current === null) {
        rafRef.current = window.requestAnimationFrame(tick);
      }
    };

    const handleMouseDown = () => {
      cursorRef.current?.classList.add("cursor-dot-active");
    };

    const handleMouseUp = () => {
      cursorRef.current?.classList.remove("cursor-dot-active");
    };

    updateMode();

    media.addEventListener("change", updateMode);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      media.removeEventListener("change", updateMode);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.classList.remove("custom-cursor-enabled");

      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  if (!enabled) {
    return null;
  }

  return <div ref={cursorRef} className="cursor-dot" aria-hidden="true" />;
}
