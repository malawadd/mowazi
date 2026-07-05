"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type LandingLoopProps = {
  src: string;
  poster: string;
  alt: string;
  className?: string;
};

export function LandingLoop({ src, poster, alt, className }: LandingLoopProps) {
  const [shouldAnimate, setShouldAnimate] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      setShouldAnimate(true);
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setShouldAnimate(!mediaQuery.matches);

    updatePreference();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updatePreference);
      return () => mediaQuery.removeEventListener("change", updatePreference);
    }

    mediaQuery.addListener(updatePreference);
    return () => mediaQuery.removeListener(updatePreference);
  }, []);

  if (!shouldAnimate) {
    return <Image src={poster} alt={alt} width={1920} height={1080} className={className} />;
  }

  return (
    <video
      className={className}
      aria-label={alt}
      autoPlay
      loop
      muted
      playsInline
      poster={poster}
      preload="metadata"
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}
