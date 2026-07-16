import type { VizGlyphName } from "./vizPaperModel";

export default function VizGlyph({ name, label, className }: { name: VizGlyphName; label?: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 96 96" role="img" aria-label={label ?? name}>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        {shape(name)}
      </g>
    </svg>
  );
}

function shape(name: VizGlyphName) {
  switch (name) {
    case "whale":
      return (
        <>
          <path d="M20 55c10-18 35-23 51-8 7 6 7 18-2 23-18 10-48 4-49-15Z" fill="currentColor" opacity=".18" />
          <path d="M20 55c10-18 35-23 51-8 7 6 7 18-2 23-18 10-48 4-49-15Z" strokeWidth="4" />
          <path d="M70 45c6-8 13-8 18-2-7 1-11 4-13 10" strokeWidth="4" />
          <path d="M37 31c-3-8 2-14 9-18 2 8-1 14-9 18ZM54 31c1-9 8-13 16-13-2 8-7 13-16 13Z" strokeWidth="4" />
          <path d="M43 65c5 6 12 8 20 6" strokeWidth="3" />
          <circle cx="32" cy="51" r="2.5" fill="currentColor" />
        </>
      );
    case "faucet":
      return (
        <>
          <path d="M16 42h20V29h28v13h10c6 0 10 4 10 10v8H67v-7H16Z" fill="currentColor" opacity=".16" />
          <path d="M16 42h20V29h28v13h10c6 0 10 4 10 10v8H67v-7H16Z" strokeWidth="4" />
          <path d="M46 18v11M34 18h24M24 53v22M68 60c-8 9-11 15-11 20 0 6 5 10 11 10s11-4 11-10c0-5-3-11-11-20Z" strokeWidth="4" />
        </>
      );
    case "link":
      return (
        <>
          <path d="M36 34 24 46c-8 8-8 20 0 27s19 7 27 0l10-10" strokeWidth="9" />
          <path d="M60 62 72 50c8-8 8-20 0-27s-19-7-27 0L35 33" strokeWidth="9" />
          <path d="m39 57 18-18" strokeWidth="6" />
        </>
      );
    case "gauge":
      return (
        <>
          <path d="M16 62a32 32 0 0 1 64 0" fill="currentColor" opacity=".14" />
          <path d="M16 62a32 32 0 0 1 64 0H16Z" strokeWidth="4" />
          <path d="M24 61c2-17 12-27 24-27s22 10 24 27M48 62l18-19" strokeWidth="4" />
          <circle cx="48" cy="62" r="6" fill="currentColor" opacity=".2" strokeWidth="4" />
          <path d="M23 52h10M31 35l7 8M48 29v10M65 43l7-8M63 52h10" strokeWidth="3" />
        </>
      );
    case "globe":
      return (
        <>
          <circle cx="48" cy="48" r="32" fill="currentColor" opacity=".13" strokeWidth="4" />
          <circle cx="48" cy="48" r="32" strokeWidth="4" />
          <path d="M16 48h64M48 16c10 9 15 20 15 32S58 71 48 80M48 16C38 25 33 36 33 48s5 23 15 32M21 33h54M21 63h54" strokeWidth="3" />
        </>
      );
    case "lock":
      return (
        <>
          <rect x="22" y="42" width="52" height="38" rx="5" fill="currentColor" opacity=".14" strokeWidth="4" />
          <path d="M33 42V30c0-10 6-17 15-17s15 7 15 17v12" strokeWidth="7" />
          <path d="M48 58v10" strokeWidth="6" />
          <circle cx="48" cy="56" r="5" fill="currentColor" />
        </>
      );
    case "bull":
      return (
        <>
          <path d="M38 33C27 34 18 29 13 18c10 1 18 5 24 12M58 33c11 1 20-4 25-15-10 1-18 5-24 12" strokeWidth="5" />
          <path d="M27 45c0-13 9-22 21-22s21 9 21 22v12c0 16-9 25-21 25s-21-9-21-25Z" fill="currentColor" opacity=".15" strokeWidth="4" />
          <path d="M34 63c4-8 24-8 28 0v9c-7 7-21 7-28 0Z" strokeWidth="4" />
          <path d="M37 47h.1M59 47h.1M42 66h.1M54 66h.1" strokeWidth="5" />
        </>
      );
    case "scales":
      return (
        <>
          <path d="M48 18v58M27 76h42M36 26h24M27 34l-14 26h28L27 34ZM69 34 55 60h28L69 34Z" strokeWidth="4" />
          <path d="M18 60c2 8 15 8 18 0M60 60c2 8 15 8 18 0" strokeWidth="4" />
        </>
      );
    case "bear":
      return (
        <>
          <circle cx="28" cy="27" r="11" fill="currentColor" opacity=".15" strokeWidth="4" />
          <circle cx="68" cy="27" r="11" fill="currentColor" opacity=".15" strokeWidth="4" />
          <path d="M23 54c0-19 10-31 25-31s25 12 25 31S63 82 48 82 23 73 23 54Z" fill="currentColor" opacity=".15" strokeWidth="4" />
          <path d="M39 59c5-4 13-4 18 0M37 46h.1M59 46h.1" strokeWidth="5" />
        </>
      );
    case "rocket":
      return (
        <>
          <path d="M58 12c12 15 14 32 4 49L38 37c5-14 10-21 20-25Z" fill="currentColor" opacity=".14" strokeWidth="4" />
          <path d="m38 37-16 8 13 7M62 61l-8 16-7-13M35 64c-9 4-15 9-18 17 9-3 15-9 18-17Z" strokeWidth="4" />
          <circle cx="56" cy="34" r="6" strokeWidth="4" />
        </>
      );
    case "shield":
      return (
        <>
          <path d="M48 14 76 25v21c0 18-11 29-28 38-17-9-28-20-28-38V25Z" fill="currentColor" opacity=".14" strokeWidth="4" />
          <path d="m34 49 10 10 19-22" strokeWidth="6" />
        </>
      );
    case "coin":
    default:
      return (
        <>
          <circle cx="48" cy="48" r="32" fill="currentColor" opacity=".18" strokeWidth="5" />
          <path d="M48 25v46M35 34h18c8 0 12 3 12 9s-4 9-12 9H35m0 0h21c8 0 12 3 12 9s-4 10-12 10H35" strokeWidth="6" />
        </>
      );
  }
}
