"use client";

import Link from "next/link";
import { LandingActions } from "@/components/landing/LandingActions";
import { LandingLoop } from "@/components/landing/LandingLoop";

const heroSignals = [
  {
    label: "Real UI loops",
    value: "Overview",
    detail: "Rendered from the actual Moeazi shell instead of hand-drawn dashboard art.",
  },
  {
    label: "Venue split",
    value: "3 wallets",
    detail: "Optimism execution, HyperLiquid master, and HyperLiquid agent stay visibly separate.",
  },
  {
    label: "Readable control",
    value: "8 pages",
    detail: "Risk, activity, withdrawals, settings, and emergency stop stay part of the operating story.",
  },
] as const;

const walkthroughSteps = [
  {
    step: "01",
    title: "Provision the account",
    detail: "Generate the managed strategy account and the venue wallet structure behind it.",
  },
  {
    step: "02",
    title: "Fund the rails",
    detail: "Send assets to the separate Optimism and HyperLiquid funding paths.",
  },
  {
    step: "03",
    title: "Approve and enable",
    detail: "Authorize the HyperLiquid agent wallet, then let the strategy become runnable.",
  },
  {
    step: "04",
    title: "Watch the surface",
    detail: "Use risk, activity, and withdrawals as the readable oversight layer once the loop is live.",
  },
] as const;

const trustColumns = [
  {
    label: "Live now",
    tone: "mint",
    title: "Visible control plane",
    detail: "Provisioning, managed wallets, operator controls, alerts, and execution history are already part of the product surface.",
  },
  {
    label: "Partial today",
    tone: "rose",
    title: "Still maturing",
    detail: "Supervisor hardening, withdrawal polish, and some venue validation paths still need more production confidence.",
  },
] as const;

const ctaNotes = [
  "Open the dashboard when the operating model already makes sense to you.",
  "Read the docs when you want the full walkthrough and page-by-page explanation.",
  "Read the risk page before you treat the workflow like finished infrastructure.",
] as const;

export default function HomePage() {
  return (
    <main className="marketing-shell landing-video-shell">
      <section className="landing-module landing-module--hero" data-tone="yellow">
        <div className="landing-module-band" />
        <div className="landing-module-grid">
          <div className="landing-module-copy">
            <div className="landing-kicker">Real Product Tour</div>
            <h1 className="landing-headline">Watch the strategy account work before you ever fund it.</h1>
            <p className="landing-copy">
              Moeazi now leads with the product itself: a real overview surface, a real walkthrough of the operating
              pages, and a clear motion explainer for who decides, who signs, and where the funds actually live.
            </p>
            <p className="landing-inline-note">Silent loops, rendered from deterministic demo routes built from the actual app.</p>
            <div className="landing-signal-grid">
              {heroSignals.map((signal) => (
                <article key={signal.label} className="landing-signal-card">
                  <span>{signal.label}</span>
                  <strong>{signal.value}</strong>
                  <p>{signal.detail}</p>
                </article>
              ))}
            </div>
            <LandingActions />
          </div>

          <div className="landing-module-media">
            <div className="landing-video-frame landing-video-frame--hero">
              <LandingLoop
                src="/landing/hero-overview.mp4"
                poster="/landing/hero-overview-poster.png"
                alt="Animated Moeazi overview demo loop"
                className="landing-video"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="landing-module landing-module--reverse" data-tone="orange">
        <div className="landing-module-band" />
        <div className="landing-module-grid">
          <div className="landing-module-copy">
            <div className="landing-kicker">Walkthrough</div>
            <h2 className="landing-section-title">The product explains itself by moving through the real pages.</h2>
            <p className="landing-copy">
              Instead of describing a workflow in the abstract, Moeazi shows the actual surfaces a user relies on:
              deposits, activity, risk, and withdrawals, each with a clear job in the operating sequence.
            </p>
            <div className="landing-step-grid">
              {walkthroughSteps.map((step) => (
                <article key={step.step} className="landing-step-card">
                  <span>{step.step}</span>
                  <strong>{step.title}</strong>
                  <p>{step.detail}</p>
                </article>
              ))}
            </div>
            <div className="landing-section-actions">
              <Link href="/docs/walkthrough" className="secondary-button">
                Read the walkthrough
              </Link>
            </div>
          </div>

          <div className="landing-module-media">
            <div className="landing-video-frame">
              <LandingLoop
                src="/landing/walkthrough-tour.mp4"
                poster="/landing/walkthrough-tour-poster.png"
                alt="Animated Moeazi walkthrough tour showing deposits, activity, risk, and withdrawals"
                className="landing-video"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="landing-module" data-tone="rose">
        <div className="landing-module-band" />
        <div className="landing-module-grid">
          <div className="landing-module-copy">
            <div className="landing-kicker">Trust Model</div>
            <h2 className="landing-section-title">See who decides, who signs, and what still deserves caution.</h2>
            <p className="landing-copy">
              The trust scene is intentionally diagrammatic because this is where Moeazi needs to be plain: the worker
              watches markets, Convex signs and records actions, and the venue wallets stay separate on purpose.
            </p>
            <div className="landing-trust-grid">
              {trustColumns.map((column) => (
                <article key={column.label} className="landing-trust-card" data-tone={column.tone}>
                  <span>{column.label}</span>
                  <strong>{column.title}</strong>
                  <p>{column.detail}</p>
                </article>
              ))}
            </div>
            <div className="landing-section-actions">
              <Link href="/docs/how-it-works" className="secondary-button">
                Read the system model
              </Link>
              <Link href="/docs/risks-and-limitations" className="secondary-button">
                Read the risks
              </Link>
            </div>
          </div>

          <div className="landing-module-media">
            <div className="landing-video-frame">
              <LandingLoop
                src="/landing/trust-model.mp4"
                poster="/landing/trust-model-poster.png"
                alt="Animated Moeazi trust model diagram showing the worker, Convex, and venue wallets"
                className="landing-video"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="landing-module landing-module--cta" data-tone="lilac">
        <div className="landing-module-band" />
        <div className="landing-cta-body">
          <div className="landing-kicker">Start Using</div>
          <h2 className="landing-section-title">Use the app when the model feels clear, not before.</h2>
          <p className="landing-copy">
            Moeazi is strongest when the visual surface, the trust boundaries, and the operating sequence all make
            sense together. If they do, open the product. If they do not yet, keep reading first.
          </p>
          <LandingActions showRiskLink />
          <div className="landing-cta-note-grid">
            {ctaNotes.map((note) => (
              <article key={note} className="landing-cta-note">
                <span>note</span>
                <p>{note}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
