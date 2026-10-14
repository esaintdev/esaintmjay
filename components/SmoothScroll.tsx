"use client";

import { useEffect } from "react";
import { ReactLenis } from "lenis/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

function ScrollMotionObserver() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Enable scroll-motion styles progressively on client
    document.documentElement.classList.add("has-scroll-motion");

    const selector = [
      ".work-card",
      ".service",
      ".section-heading",
      ".editorial-list > article",
      ".award-list > article",
      ".article-list > a",
      ".journal-card",
      ".about-section > div",
      ".contact-layout > div",
      ".contact-form",
      ".specialty-list > div",
    ].join(", ");

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: "0px 0px -40px 0px",
      },
    );

    function scan() {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => {
        if (!el.classList.contains("is-revealed")) {
          const rect = el.getBoundingClientRect();
          // Reveal immediately if already in view near the top of viewport
          if (rect.top < window.innerHeight - 50 && rect.bottom > 0) {
            el.classList.add("is-revealed");
          } else {
            observer.observe(el);
          }
        }
      });
    }

    scan();

    // Re-scan when elements are added or category filter changes
    const mutationObserver = new MutationObserver(() => scan());
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
    };
  }, [pathname]);

  return null;
}

export default function SmoothScroll({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname ? pathname.startsWith("/admin") : false;

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <ReactLenis
      root
      options={{
        lerp: 0.08,
        duration: 1.4,
        smoothWheel: true,
        wheelMultiplier: 0.9,
        touchMultiplier: 1.5,
        infinite: false,
      }}
    >
      <ScrollMotionObserver />
      {children}
    </ReactLenis>
  );
}
