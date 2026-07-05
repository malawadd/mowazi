"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ParticleAccountButton from "@/components/ParticleAccountButton";

const navItems = [
  { href: "/dashboard", label: "Overview" },
  { href: "/deposits", label: "Deposits" },
  { href: "/withdrawals", label: "Withdrawals" },
  { href: "/positions", label: "Positions" },
  { href: "/risk", label: "Risk" },
  { href: "/activity", label: "Activity" },
  { href: "/settings", label: "Settings" },
  { href: "/kill", label: "Emergency Stop" },
];

function shellToneForPathname(pathname: string) {
  if (pathname.startsWith("/deposits")) return "orange";
  if (pathname.startsWith("/withdrawals")) return "mint";
  if (pathname.startsWith("/positions")) return "lilac";
  if (pathname.startsWith("/risk") || pathname.startsWith("/activity") || pathname.startsWith("/kill")) {
    return "rose";
  }
  if (pathname.startsWith("/settings")) return "lilac";
  return "sky";
}

export default function StrategyShell({
  title,
  subtitle,
  children,
  pathnameOverride,
  showUserButton = true,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  pathnameOverride?: string;
  showUserButton?: boolean;
}) {
  const pathname = usePathname();
  const activePathname = pathnameOverride ?? pathname;
  const routeTone = shellToneForPathname(activePathname);

  return (
    <div className="app-shell" data-route-tone={routeTone}>
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <p className="brand-kicker">Managed Strategy</p>
          <h1 className="brand-title">Moeazi</h1>
          <p className="brand-copy">
            LINK/USDC delta-neutral execution across Optimism Uniswap and HyperLiquid.
          </p>
        </div>

        <nav className="app-nav" aria-label="Primary">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={activePathname === item.href ? "nav-item nav-item-active" : "nav-item"}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footnote">
          <p>Convex owns key custody.</p>
          <p>External worker owns the live decision loop.</p>
        </div>
      </aside>

      <main className="app-main">
        <header className="topbar" data-route-tone={routeTone}>
          <div>
            <p className="page-kicker">{title}</p>
            <h2 className="page-title">{subtitle}</h2>
          </div>
          {showUserButton ? (
            <div className="topbar-actions">
              <ParticleAccountButton />
            </div>
          ) : null}
        </header>
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}
