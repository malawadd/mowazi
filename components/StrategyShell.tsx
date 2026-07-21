"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ParticleAccountButton from "@/components/ParticleAccountButton";

const navGroups = [
  { label: "Agent", items: [
    { href: "/agents", label: "My agent" },
    { href: "/agents/approvals", label: "Approvals" },
    { href: "/agents/activity", label: "Agent activity" },
    { href: "/agents/policy", label: "Guardrails" },
    { href: "/credits", label: "Credits" },
  ] },
  { label: "Account", items: [
    { href: "/dashboard", label: "Overview" },
    { href: "/profile/wallet", label: "Wallet" },
    { href: "/deposits", label: "Deposits" },
    { href: "/withdrawals", label: "Withdrawals" },
    { href: "/settings", label: "Settings" },
  ] },
  { label: "Trading", items: [
    { href: "/trade", label: "Terminal" },
    { href: "/swap", label: "Spot swap" },
    { href: "/venues", label: "Venues" },
    { href: "/positions", label: "Positions" },
    { href: "/activity", label: "Execution activity" },
  ] },
  { label: "Safety", items: [
    { href: "/risk", label: "Risk" },
    { href: "/kill", label: "Emergency stop" },
  ] },
];

function shellToneForPathname(pathname: string) {
  if (pathname.startsWith("/deposits")) return "orange";
  if (pathname.startsWith("/withdrawals")) return "mint";
  if (pathname.startsWith("/positions")) return "lilac";
  if (pathname.startsWith("/risk") || pathname.startsWith("/activity") || pathname.startsWith("/kill")) {
    return "rose";
  }
  if (pathname.startsWith("/profile")) return "sky";
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
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="nav-group-label">{group.label}</p>
              {group.items.map((item) => {
                const active = activePathname === item.href
                  || (item.href === "/agents" && activePathname.startsWith("/agents/"));
                return (
                  <Link key={item.href} href={item.href}
                    className={active ? "nav-item nav-item-active" : "nav-item"}>
                    {item.label}
                  </Link>
                );
              })}
            </div>
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
