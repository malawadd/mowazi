"use client";

import { useEffect, useRef } from "react";

export function useStoryReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) {
      return;
    }

    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (targets.length === 0) {
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    targets.forEach((target, index) => {
      const rect = target.getBoundingClientRect();
      const delay = target.dataset.delay ?? `${Math.min(index * 45, 240)}ms`;
      target.style.setProperty("--reveal-delay", delay);
      if (reducedMotion || rect.top <= window.innerHeight * 0.88) {
        target.classList.add("is-visible");
      }
    });

    root.classList.add("story-motion-ready");

    if (reducedMotion) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      {
        rootMargin: "0px 0px -10% 0px",
        threshold: 0.18,
      },
    );

    targets.forEach((target) => observer.observe(target));

    return () => observer.disconnect();
  }, []);

  return ref;
}
