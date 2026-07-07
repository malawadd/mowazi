"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import ParticleAccountButton from "@/components/ParticleAccountButton";
import styles from "./trade-ui.module.css";

const navItems = [
  { href: "/trade", label: "Trade" },
  { href: "/profile/wallet", label: "Wallet" },
  { href: "/dashboard", label: "Strategy app" },
  { href: "/activity", label: "Activity" },
  { href: "/settings", label: "Settings" },
];

export default function TradeShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <p className="brand-kicker">Perp Router</p>
          <h1 className={styles.brandTitle}>Moeazi</h1>
          <p className="brand-copy">
            Market-only perp intents routed by all-in execution cost across CLOB and on-chain venues.
          </p>
        </div>

        <nav className={styles.nav} aria-label="Trade">
          {navItems.map((item) => (
            <Link
              key={item.href}
              className={`${styles.navItem} ${item.href === "/trade" ? styles.activeNav : ""}`}
              href={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className={styles.sidebarNote}>
          <p>USDC collateral stays in your account until execution is enabled.</p>
          <p>V1 queues signed-in trade intents only.</p>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <p className="page-kicker">Trade</p>
            <h2 className={styles.title}>Perp execution router</h2>
          </div>
          <ParticleAccountButton />
        </header>
        {children}
      </main>
    </div>
  );
}
