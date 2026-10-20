"use client";

import { useEffect, useRef, type ReactNode } from "react";

export default function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      element.animate(
        [
          { opacity: 0, transform: "translateY(22px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 560, delay, easing: "cubic-bezier(.2,.75,.25,1)", fill: "both" },
      );
      observer.unobserve(element);
    }, { threshold: 0.14 });

    observer.observe(element);
    return () => observer.disconnect();
  }, [delay]);

  return <div ref={ref} className={className}>{children}</div>;
}
