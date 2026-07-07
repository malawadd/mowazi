"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import ParticleAccountButton from "@/components/ParticleAccountButton";
import styles from "./trade-ui.module.css";

export default function TradeShell({ children }: { children: ReactNode }) {
  return (
    <main className={styles.shell}>
      <header className={styles.appbar} data-route-tone="sky">
        <Link className={styles.logoLockup} href="/">
          <span className={styles.kicker}>Perp router</span>
          <strong>Moeazi</strong>
        </Link>
        <nav className={styles.topNav} aria-label="Moeazi">
          <Link className={styles.navPillActive} href="/trade/BTC">
            Trade
          </Link>
          <Link className={styles.navPill} href="/dashboard">
            Agentic Portal
          </Link>
        </nav>
        <ParticleAccountButton />
      </header>
      {children}
    </main>
  );
}
