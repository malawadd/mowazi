"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import ParticleAccountButton from "@/components/ParticleAccountButton";
import { TradeAccountDrawer } from "./TradeAccountDrawer";
import styles from "./trade-ui.module.css";

export default function TradeShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

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
        <ParticleAccountButton onMagicClick={() => setDrawerOpen(true)} />
      </header>
      {children}
      <TradeAccountDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </main>
  );
}
