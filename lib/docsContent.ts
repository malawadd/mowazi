import type { Metadata } from "next";

export type DocsPageSlug =
  | "overview"
  | "how-it-works"
  | "walkthrough"
  | "risks-and-limitations";

export type DocsCalloutTone = "info" | "warning";

export type DocsSection = {
  id: string;
  title: string;
  summary: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
};

export type DocsPageDefinition = {
  slug: DocsPageSlug;
  href: "/docs" | "/docs/how-it-works" | "/docs/walkthrough" | "/docs/risks-and-limitations";
  kicker: string;
  title: string;
  summary: string;
  heroTitle: string;
  heroCopy: string;
  alert?: {
    tone: DocsCalloutTone;
    title: string;
    body: string;
  };
  homePreview: {
    kicker: string;
    title: string;
    body: string;
  };
  sections: readonly DocsSection[];
};

export type LandingSurfaceTone = "paper" | "yellow" | "sky" | "mint" | "orange" | "lilac" | "rose";

export type LandingStoryFrameId =
  | "hook"
  | "problem"
  | "system-model"
  | "how-it-works"
  | "trust-model"
  | "operational-surface"
  | "cta";

export type LandingStoryFrame = {
  id: LandingStoryFrameId;
  kicker: string;
  title: string;
  body: string;
  tone: Exclude<LandingSurfaceTone, "paper">;
  bullets?: readonly string[];
};

export type LandingProof = {
  label: string;
  value: string;
  detail: string;
  tone: LandingSurfaceTone;
};

export type LandingSystemNode = {
  label: string;
  title: string;
  body: string;
  tone: LandingSurfaceTone;
};

export type LandingWalkthroughStep = {
  step: string;
  title: string;
  body: string;
  tone: LandingSurfaceTone;
};

export type LandingTrustColumn = {
  id: "live-now" | "partial-today";
  title: string;
  body: string;
  bullets: readonly string[];
  tone: Extract<LandingSurfaceTone, "mint" | "rose">;
};

export type LandingSurfaceCard = {
  id: string;
  title: string;
  question: string;
  body: string;
  tone: LandingSurfaceTone;
};

export const docsPages = [
  {
    slug: "overview",
    href: "/docs",
    kicker: "Docs Hub",
    title: "Docs Overview",
    summary:
      "Start here if you want to understand what Moeazi does, what problem it is trying to solve, and what tradeoffs it makes.",
    heroTitle:
      "Moeazi is trying to make a difficult delta-neutral strategy understandable before it asks anyone to trust it.",
    heroCopy:
      "Concentrated liquidity can earn fees, but it also creates range risk, inventory risk, hedging work, and a constant need for monitoring. Moeazi turns that operational mess into a managed strategy account with clearer boundaries, visible state, and explicit controls.",
    alert: {
      tone: "warning",
      title: "Read the trust model before you fund anything",
      body:
        "Moeazi currently uses app-controlled managed wallets and an external execution worker. It is built to make the workflow easier to follow and operate, not to remove custody or market risk.",
    },
    homePreview: {
      kicker: "Start here",
      title: "What Moeazi is",
      body:
        "Understand the product promise, the problem it addresses, and what it does not claim to solve.",
    },
    sections: [
      {
        id: "problem",
        title: "The problem Moeazi is addressing",
        summary: "Fee generation is only one part of a concentrated LP strategy.",
        paragraphs: [
          "A concentrated LP position can look attractive because it earns fees inside a chosen price range. The harder part is everything around it: keeping the position in range, correcting inventory drift, watching exposure across venues, and reacting before the strategy becomes dead capital.",
          "Most users do not want to operate a mini trading desk just to participate in a delta-neutral LP strategy. They want to understand what the system is doing, what wallets are involved, and what risks remain without babysitting every market move.",
        ],
        bullets: [
          "LP positions can drift out of range and stop earning useful fees.",
          "Inventory can become imbalanced even when the LP thesis still makes sense.",
          "Hedging often happens on a separate venue with different account rules and failure modes.",
          "Manual cross-venue execution and monitoring are hard to sustain around the clock.",
        ],
      },
      {
        id: "intention",
        title: "What Moeazi is trying to make easier",
        summary: "The product goal is operational clarity, not magical abstraction.",
        paragraphs: [
          "Moeazi packages the strategy into a managed account model: one user identity, one strategy account, three venue-specific managed wallets, and a visible record of status, activity, alerts, and controls.",
          "Instead of a browser copilot or a manually operated wallet setup, the system separates responsibilities. The worker watches the market and decides what should happen next, while Convex owns the signing surface and records what the system did.",
        ],
        bullets: [
          "Make the operating model understandable before capital is deposited.",
          "Separate venue responsibilities instead of pretending one wallet does everything.",
          "Expose status, auditability, and emergency controls in the app.",
          "Keep the strategy explainable to curious users without hiding the technical reality from deeper readers.",
        ],
      },
      {
        id: "promise",
        title: "What Moeazi promises and what it does not",
        summary: "The product is meant to reduce confusion, not remove risk.",
        paragraphs: [
          "Moeazi is designed to make a managed strategy legible. That means clearer funding rails, separated wallets, visible events, and a product surface that explains how execution is supposed to work.",
          "It does not promise guaranteed returns, trustless custody, or full automation maturity today. Some parts are fully wired, some are partially scaffolded, and some still need production validation with live funded accounts.",
        ],
        bullets: [
          "Moeazi is built to explain and operate a managed strategy account.",
          "Moeazi is not a guarantee against loss, slippage, downtime, or operational mistakes.",
          "Moeazi exposes the system state so users can see what is happening instead of relying on hidden automation.",
          "Moeazi still depends on operator trust, external services, and venue-level execution behavior.",
        ],
      },
      {
        id: "current-state",
        title: "What exists today",
        summary: "The product already has a real app surface, but it is not complete in every operational dimension.",
        paragraphs: [
          "Today, the app can provision managed strategy accounts, generate and encrypt per-user venue wallets, show deposit instructions, support strategy state changes, record executions, and surface risk and audit information.",
          "The system still has known gaps. Some automation paths are wired but need live validation, some monitoring flows are partial, and not every backend capability has a finished end-user UI yet.",
        ],
        bullets: [
          "Working now: account provisioning, wallet generation, config, enable/pause, emergency stop, activity and risk views.",
          "Partially wired: external supervisor loop, venue execution validation, position syncing, automated deposit confirmation.",
          "Not yet complete: polished withdrawal flow, full production-grade monitoring, and complete end-to-end automation maturity.",
        ],
      },
    ],
  },
  {
    slug: "how-it-works",
    href: "/docs/how-it-works",
    kicker: "System Model",
    title: "How It Works",
    summary:
      "See how Moeazi splits strategy state, wallet custody, market decisions, and signed execution across the stack.",
    heroTitle: "Moeazi splits custody, decisions, and execution into separate responsibilities on purpose.",
    heroCopy:
      "The product uses a managed strategy account model so users can understand where funds live, who signs what, and how the system moves from market observation to recorded execution.",
    alert: {
      tone: "info",
      title: "No omnibus wallet",
      body:
        "Each strategy account is modeled as separate venue identities rather than one catch-all wallet. That separation is part of the product explanation, not just an internal implementation detail.",
    },
    homePreview: {
      kicker: "System model",
      title: "How funds and actions move",
      body:
        "Learn what each wallet is for, what the worker does, and what Convex is responsible for.",
    },
    sections: [
      {
        id: "account-model",
        title: "Managed strategy account model",
        summary: "One Particle account wallet, one strategy account, and three venue-specific managed wallets.",
        paragraphs: [
          "A Moeazi strategy account is the unit the user understands and interacts with. The visible account wallet is the user's Particle Universal Account, while strategy execution still uses separate managed venue wallets so funding, approvals, and execution responsibilities stay legible.",
          "The current strategy uses one Optimism wallet for onchain strategy actions and two HyperLiquid wallets for master control and delegated execution.",
        ],
        bullets: [
          "Optimism execution wallet: holds strategy assets on Optimism, with USDC as strategy capital, LINK as strategy inventory, and ETH as an operational gas reserve.",
          "HyperLiquid master wallet: holds the primary HyperLiquid identity and is used for account-level approvals and withdrawals.",
          "HyperLiquid agent wallet: receives delegated trading authority so the strategy can place hedge orders without using the master wallet for every trade.",
        ],
      },
      {
        id: "responsibilities",
        title: "What Convex does and what the external worker does",
        summary: "The system is intentionally split between control plane and decision loop.",
        paragraphs: [
          "Convex acts as the control plane. It stores users, strategy accounts, wallet metadata, encrypted secrets, configurations, snapshots, alerts, executions, and audit history. It also runs the bounded signing actions that actually broadcast venue-specific trades and approvals.",
          "The external supervisor acts as the live decision loop. It polls runnable strategy accounts, reads market state, decides whether a swap or hedge is needed, acquires a short lease for an account, and calls back into Convex to perform discrete actions.",
        ],
        bullets: [
          "Convex owns wallet generation, encryption, state, and signed execution actions.",
          "The worker owns market observation, lease-based coordination, and decision logic.",
          "The split is meant to reduce key sprawl while still keeping the long-running loop outside the app runtime.",
        ],
      },
      {
        id: "execution-flow",
        title: "Execution flow from funding to recorded action",
        summary: "Moeazi is easier to trust when the steps are explicit.",
        paragraphs: [
          "The system is designed so that each major state change leaves a visible trail. Funding instructions, strategy activation, worker-triggered actions, alerts, and emergency stops are all meant to become inspectable product events rather than hidden background behavior.",
        ],
        bullets: [
          "1. A user signs in and provisions a strategy account.",
          "2. Convex generates the managed venue wallets and stores encrypted wallet secrets.",
          "3. The user funds their Particle Universal Account directly or through a shared deposit link.",
          "4. The user moves funds from the UA into the supported Moeazi strategy funding rails.",
          "5. The HyperLiquid agent wallet is approved by the HyperLiquid master wallet.",
          "6. The strategy is enabled from the app.",
          "7. The external worker acquires a lease, reads markets, and decides whether an action is needed.",
          "8. The worker calls a bounded Convex action such as a Uniswap swap, HyperLiquid order, or pause action.",
          "9. Convex signs and broadcasts the action, then records executions, alerts, and snapshots back into the strategy account state.",
        ],
      },
      {
        id: "visibility",
        title: "How Moeazi keeps the system legible",
        summary: "The app exists to explain the automation as much as to operate it.",
        paragraphs: [
          "The signed-in product pages are not just decoration around the strategy. They are the operational surface users rely on to see deposits, venue readiness, positions, alerts, recent actions, configuration state, and emergency controls.",
          "The system also keeps internal records so the product can surface what happened and why. Executions, alerts, snapshots, leases, and audit events are all part of the control-plane design.",
        ],
        bullets: [
          "Wallet view: shows Particle UA addresses, unified balance, share link controls, and the move-to-strategy action.",
          "Risk view: shows alerts, current snapshot state, and pause conditions.",
          "Activity view: shows executions and audit history.",
          "Settings view: stores strategy guardrails as versioned config.",
          "Emergency stop: lets the operator halt strategy activity and surface a critical alert.",
        ],
      },
      {
        id: "technical-layer",
        title: "Technical deep dive",
        summary: "For readers who want the implementation shape, not just the product story.",
        paragraphs: [
          "Managed wallet keys are generated in Convex Node actions and encrypted with AES-256-GCM before they are stored. The worker never needs the raw key material in plaintext because it calls Convex to perform the actual signed venue action.",
          "The worker uses short-lived execution leases per strategy account so multiple supervisors do not accidentally act on the same account at once. The app then uses structured tables for strategy accounts, venue accounts, executions, snapshots, alerts, and audit events to keep the workflow inspectable.",
        ],
      },
    ],
  },
  {
    slug: "walkthrough",
    href: "/docs/walkthrough",
    kicker: "User Journey",
    title: "Walkthrough",
    summary:
      "Follow the user journey from first visit to account provisioning, funding, activation, and ongoing monitoring.",
    heroTitle: "This is what a user actually does in Moeazi from the first click to ongoing oversight.",
    heroCopy:
      "The walkthrough page is meant to remove mystery from the product. A visitor should be able to understand the sequence of steps, the meaning of each page, and what the system is doing on their behalf.",
    alert: {
      tone: "warning",
      title: "Funding and activation are separate",
      body:
        "Depositing funds does not mean automated strategy activity is already live. Funding, agent approval, and strategy enablement are separate operational steps.",
    },
    homePreview: {
      kicker: "User journey",
      title: "What someone does step by step",
      body:
        "Walk through provisioning, deposits, approvals, activation, and how to read the app once it is running.",
    },
    sections: [
      {
        id: "first-visit",
        title: "Step 1: Learn before funding",
        summary: "A first-time visitor should know what they are trusting before they sign in.",
        paragraphs: [
          "The public landing page and docs hub are there to explain the strategy account model before anyone funds a wallet. The product should make the problem, the intent, and the trust model obvious up front.",
          "A user who is still deciding should be able to answer what Moeazi does, what wallets it creates, what the current strategy is, and what still remains incomplete without leaving the public pages confused.",
        ],
      },
      {
        id: "provision-account",
        title: "Step 2: Create the managed strategy account",
        summary: "Provisioning is the moment the product creates the operational structure.",
        paragraphs: [
          "After sign-in, the dashboard can provision a strategy account. That process creates the strategy record, the venue account records, the wallet secret records, and a default strategy configuration.",
          "The result is one visible strategy account in the app, even though the system underneath it is intentionally split across separate venue wallets.",
        ],
      },
      {
        id: "funding-flow",
        title: "Step 3: Fund the Particle account wallet",
        summary: "The account wallet receives first; strategy rails are funded from it.",
        paragraphs: [
          "The Wallet page shows the user's Particle Universal Account addresses, unified balance, and shared deposit link. Users can deposit EVM assets to the EVM UA address, Solana assets to the Solana UA address, or share a public payment page that routes another payer into the same account wallet.",
          "After funds are in the UA, the user explicitly moves supported assets into Moeazi's strategy funding rails. That keeps the account wallet simple while preserving the operational truth that onchain LP execution and offchain hedge margin are funded separately.",
        ],
        bullets: [
          "Particle UA: receives the user's cross-chain account wallet deposits and public payment-link deposits.",
          "Optimism execution wallet: funded from the UA for Uniswap-side strategy actions and gas.",
          "On that Optimism wallet, ETH is treated as a gas reserve rather than general strategy capital.",
          "HyperLiquid master wallet: funded from the UA for margin and higher-level HyperLiquid account control.",
          "HyperLiquid agent wallet: typically receives delegated authority rather than direct user funding as the primary rail.",
        ],
      },
      {
        id: "approval-and-enable",
        title: "Step 4: Approve the agent wallet and enable the strategy",
        summary: "The product makes the authorization step visible instead of hiding it.",
        paragraphs: [
          "Before the hedge side can operate through the delegated trading wallet, the HyperLiquid master wallet approves the HyperLiquid agent wallet. This creates a clearer boundary between account control and trade placement.",
          "Once venue readiness is in place, the strategy can be enabled from the dashboard. That is the point where the worker is allowed to treat the strategy account as runnable.",
        ],
      },
      {
        id: "reading-the-app",
        title: "How to read each signed-in page",
        summary: "Each page has a specific operational purpose.",
        paragraphs: [
          "The app is designed as an operating surface, not just a marketing wrapper. Each signed-in page answers a different question about the account state and the automation around it.",
        ],
        bullets: [
          "Overview: high-level health, wallet readiness, recent status, and control actions.",
          "Deposits: funding rails, live wallet inventory, and a clear split between strategy assets and operational gas reserve.",
          "Positions: LP-side and hedge-side position records when those records exist.",
          "Risk: alerts, current snapshot values, pause state, and exposure context.",
          "Activity: execution ledger and audit trail of user or worker-driven events.",
          "Withdrawals: live withdrawable balances, recent landed transfers, and the managed settlement pipeline.",
          "Settings: strategy guardrails like thresholds, drawdown settings, and polling intervals.",
          "Emergency Stop: immediate pause path with a recorded reason and critical alert.",
        ],
      },
      {
        id: "ongoing-operation",
        title: "What happens after the strategy is enabled",
        summary: "The product moves into supervised automation, not invisible magic.",
        paragraphs: [
          "Once active, the external supervisor reads runnable accounts, acquires a lease, evaluates whether an action is needed, and asks Convex to perform bounded execution actions. The intent is to keep the market loop external while retaining a clear system of record inside the app.",
          "As the system acts, Moeazi is supposed to surface the resulting state through snapshots, alerts, activity records, and audit events so users and operators are not left guessing.",
        ],
      },
    ],
  },
  {
    slug: "risks-and-limitations",
    href: "/docs/risks-and-limitations",
    kicker: "Before You Fund",
    title: "Risks and Limitations",
    summary:
      "Understand the custody model, current feature maturity, and the operational and market risks that still remain.",
    heroTitle: "Moeazi should be read as a managed system with clear risks, not as finished trustless infrastructure.",
    heroCopy:
      "This page is deliberately direct. If the product asks users to trust app-controlled execution and multiple venue workflows, it should also say exactly where the risk and incompleteness still live.",
    alert: {
      tone: "warning",
      title: "Important limitations are part of the product truth",
      body:
        "Moeazi currently combines app-controlled custody, an external worker, and partially complete automation. That does not make it useless, but it does mean users should understand the boundaries before relying on it.",
    },
    homePreview: {
      kicker: "Before you fund",
      title: "Risks, custody, and current gaps",
      body:
        "Read the trust assumptions, live-vs-partial feature state, and what can still fail operationally.",
    },
    sections: [
      {
        id: "custody",
        title: "Custody and trust assumptions",
        summary: "Moeazi is currently an app-controlled managed-wallet system.",
        paragraphs: [
          "Managed private keys are generated and stored within the Moeazi control plane. They are encrypted before storage, but the custody model is still based on trust in the application stack and operators rather than a user-only signing model.",
          "That means the product should be honest about what users are relying on: secure key handling, correct execution logic, correct worker behavior, and careful operational practices around secrets and deployments.",
        ],
        bullets: [
          "Users are trusting Moeazi to manage execution keys responsibly.",
          "Convex holds the encrypted wallet material and the code path that decrypts it for execution.",
          "The external worker can trigger actions, but it relies on the protected worker route and bounded execution actions.",
        ],
      },
      {
        id: "product-truth",
        title: "What is live today versus still partial",
        summary: "The maturity level is mixed and should be described that way.",
        paragraphs: [
          "Some parts of Moeazi are already real product infrastructure: provisioning, wallet generation, configuration changes, risk and activity views, emergency stop, and structured execution logging.",
          "Other parts are present but still need more production hardening or a more complete UI layer. The product should make that visible instead of pretending the entire operating story is equally mature.",
        ],
        bullets: [
          "Live today: strategy account provisioning, managed wallet generation, config changes, strategy enable/pause, emergency stop, execution records, alerts, and audit logs.",
          "Partial today: supervisor maturity, venue-side validation with real funded accounts, automated deposit confirmation, and position synchronization completeness.",
          "Missing today: a polished withdrawal user flow and end-to-end production confidence across every venue action path.",
        ],
      },
      {
        id: "market-risk",
        title: "Operational and market risks",
        summary: "Clear product explanation does not reduce the underlying trading risk.",
        paragraphs: [
          "Even when the workflow is well explained, the strategy itself still carries market, execution, and operational risk. LP fees can be offset by adverse price moves, hedges can fail or lag, venues can reject or degrade, and operational automation can misfire.",
          "The right posture is to treat Moeazi as a system that makes the workflow more legible and controllable, not as something that makes concentrated liquidity safe by default.",
        ],
        bullets: [
          "Range risk: the LP can move out of range and stop behaving as intended.",
          "Execution risk: swaps, hedge orders, or approvals can fail or settle differently than expected.",
          "Venue risk: Optimism, Uniswap, HyperLiquid, or upstream APIs can degrade or become unavailable.",
          "Automation risk: the worker can stall, make a poor decision, or act on stale context if surrounding safeguards are incomplete.",
        ],
      },
      {
        id: "faq",
        title: "FAQ",
        summary: "Direct answers to the questions a careful visitor is likely to ask.",
        paragraphs: [
          "These answers are intentionally plain. They are meant to help a visitor understand what the product is doing without needing to reverse engineer the stack from the UI.",
        ],
        bullets: [
          "Who controls the funds? Users receive deposits into their Particle Universal Account; funds moved into strategy execution are then held in Moeazi managed venue wallets for that strategy account.",
          "Where do trades happen? Uniswap-side actions happen on Optimism, while hedge-side actions happen on HyperLiquid through the approved agent setup.",
          "Why are there multiple wallets? Because funding, account control, and delegated trade execution are different responsibilities and the product keeps them separate.",
          "What happens if the worker stops? The app still keeps the recorded state, but live market supervision and new automated actions stop until the worker returns.",
          "What does emergency stop do? It pauses strategy activity, records the reason, and surfaces a critical alert in the account state.",
          "What is not automated yet? Automated deposit confirmation, full position syncing maturity, and a polished withdrawal UX are still not complete.",
        ],
      },
    ],
  },
] as const satisfies readonly DocsPageDefinition[];

const docsPageMap = docsPages.reduce<Record<DocsPageSlug, DocsPageDefinition>>((accumulator, page) => {
  accumulator[page.slug] = page;
  return accumulator;
}, {} as Record<DocsPageSlug, DocsPageDefinition>);

export function getDocsPage(slug: DocsPageSlug) {
  return docsPageMap[slug];
}

export function getDocsNeighbors(slug: DocsPageSlug) {
  const currentIndex = docsPages.findIndex((page) => page.slug === slug);
  return {
    previous: currentIndex > 0 ? docsPages[currentIndex - 1] : null,
    next: currentIndex >= 0 && currentIndex < docsPages.length - 1 ? docsPages[currentIndex + 1] : null,
  };
}

export function getDocsMetadata(slug: DocsPageSlug): Metadata {
  const page = getDocsPage(slug);
  return {
    title: `${page.title} | Moeazi`,
    description: page.summary,
  };
}

export const landingStoryFrames = [
  {
    id: "hook",
    kicker: "Managed Delta-Neutral LP",
    title: "Stop running a 24/7 desk just to keep one LP strategy alive.",
    body:
      "Moeazi turns a LINK/USDC delta-neutral workflow into one managed strategy account with separated venue wallets, visible system state, and explicit controls before it asks anyone to fund it.",
    tone: "yellow",
  },
  {
    id: "problem",
    kicker: "Why This Is Hard",
    title: "Fee earning is only half the story.",
    body:
      "The operational burden is what scares ordinary users away: staying in range, correcting inventory drift, funding different venues, and watching the system closely enough to act before the trade turns into dead capital.",
    tone: "sky",
    bullets: [
      "LP positions drift out of range and stop earning useful fees.",
      "Inventory can become imbalanced even when the thesis still looks right.",
      "Hedges happen on a separate venue with different account rules and failure modes.",
      "Cross-venue funding, approvals, and monitoring do not stop at the end of the day.",
    ],
  },
  {
    id: "system-model",
    kicker: "System Model",
    title: "One user surface, three managed wallets, one visible control plane.",
    body:
      "The product account you see in the app is backed by separate venue responsibilities on purpose. Moeazi keeps funding, approvals, hedge execution, and recorded system state legible instead of hiding everything inside one mystery wallet.",
    tone: "mint",
  },
  {
    id: "how-it-works",
    kicker: "How It Works",
    title: "Provision, fund, approve, enable, then monitor the loop with your eyes open.",
    body:
      "The point is not invisible automation. The point is a supervised sequence with readable checkpoints, so the user can see when the account is funded, when permissions exist, when the worker is allowed to act, and what happened after it did.",
    tone: "orange",
  },
  {
    id: "trust-model",
    kicker: "Trust Model",
    title: "Moeazi makes the workflow clearer. It does not pretend the risk disappears.",
    body:
      "This is a managed system with app-controlled execution boundaries, an external worker, and a mixed feature-maturity profile. The landing page should say that directly so the user understands what is already live and what still needs more production confidence.",
    tone: "rose",
  },
  {
    id: "operational-surface",
    kicker: "Operational Surface",
    title: "Every signed-in page answers a specific operating question.",
    body:
      "The product is not just a control panel for background automation. It is the readable surface for deposits, positions, risk, activity, withdrawals, settings, and emergency intervention when something needs a human decision.",
    tone: "lilac",
  },
  {
    id: "cta",
    kicker: "Start With Context",
    title: "Read the model, open the system, and decide with your eyes open.",
    body:
      "If the structure makes sense, move into the dashboard and provision the managed strategy account. If you still need conviction, keep reading the docs and the risk page before you treat the workflow like finished infrastructure.",
    tone: "yellow",
    bullets: [
      "Create the account when you are ready to provision the managed wallets.",
      "Read the docs if you still want the deeper system model and walkthrough.",
      "Read the risk page before you rely on live automation with real capital.",
    ],
  },
] as const satisfies readonly LandingStoryFrame[];

export const landingHeroProofs = [
  {
    label: "Managed account",
    value: "1",
    detail: "One product account per user is the operating surface they actually understand.",
    tone: "yellow",
  },
  {
    label: "Venue wallets",
    value: "3",
    detail: "Optimism execution, HyperLiquid master, and HyperLiquid agent stay operationally separate.",
    tone: "sky",
  },
  {
    label: "Decision split",
    value: "2",
    detail: "An external worker watches markets while Convex signs, records, and exposes system state.",
    tone: "mint",
  },
] as const satisfies readonly LandingProof[];

export const landingSystemNodes = [
  {
    label: "Actor 01",
    title: "User",
    body: "Funds the rails, reads the state, and uses the app-level controls.",
    tone: "paper",
  },
  {
    label: "Actor 02",
    title: "Strategy account",
    body: "The visible Moeazi account that holds config, status, alerts, and history.",
    tone: "mint",
  },
  {
    label: "Venue 01",
    title: "Optimism wallet",
    body: "Holds strategy assets onchain, including LP-side inventory and an ETH gas reserve.",
    tone: "paper",
  },
  {
    label: "Venue 02",
    title: "HyperLiquid master",
    body: "Owns approvals, margin context, and higher-level account control on HyperLiquid.",
    tone: "paper",
  },
  {
    label: "Venue 03",
    title: "HyperLiquid agent",
    body: "Receives delegated hedge authority so trade placement stays separate from master control.",
    tone: "paper",
  },
] as const satisfies readonly LandingSystemNode[];

export const landingWalkthroughSteps = [
  {
    step: "01",
    title: "Provision the account",
    body: "Create the managed strategy account and let Moeazi generate the wallet structure and default config.",
    tone: "orange",
  },
  {
    step: "02",
    title: "Fund the account wallet",
    body: "Receive assets into the Particle Universal Account, then move supported funds into strategy rails.",
    tone: "paper",
  },
  {
    step: "03",
    title: "Approve the agent",
    body: "Authorize the HyperLiquid agent wallet so hedge execution can happen without using the master wallet directly.",
    tone: "paper",
  },
  {
    step: "04",
    title: "Enable the strategy",
    body: "Turn the account into a runnable strategy only after funding and readiness checks are in place.",
    tone: "paper",
  },
  {
    step: "05",
    title: "Monitor the loop",
    body: "Use risk, activity, withdrawals, and emergency stop as the readable oversight surface once automation is live.",
    tone: "paper",
  },
] as const satisfies readonly LandingWalkthroughStep[];

export const landingTrustColumns = [
  {
    id: "live-now",
    title: "Live now",
    body:
      "Some parts already work as real product infrastructure and should be presented that way without hedging.",
    bullets: [
      "Strategy account provisioning and managed wallet generation.",
      "Configuration changes, enable or pause, and emergency stop.",
      "Execution records, alerts, audit history, and the signed-in operating surface.",
    ],
    tone: "mint",
  },
  {
    id: "partial-today",
    title: "Partial today",
    body:
      "Some pieces still need more production validation or a more complete user-facing flow before they should be described as fully mature.",
    bullets: [
      "Live funded-account validation for every Uniswap and HyperLiquid path.",
      "Deposit confirmation maturity, position syncing completeness, and supervisor hardening.",
      "Withdrawal polish and full end-to-end confidence across every operational edge case.",
    ],
    tone: "rose",
  },
] as const satisfies readonly LandingTrustColumn[];

export const landingSurfaceCards = [
  {
    id: "overview",
    title: "Overview",
    question: "Is the account healthy and currently runnable?",
    body: "Read wallet readiness, execution mode, recent balance state, and control actions at a glance.",
    tone: "paper",
  },
  {
    id: "deposits",
    title: "Deposits",
    question: "Where does each asset actually go?",
    body: "See the managed funding rails after account-wallet funds are moved into strategy execution.",
    tone: "paper",
  },
  {
    id: "wallet",
    title: "Wallet",
    question: "How does the account receive cross-chain deposits?",
    body: "Use the Particle account wallet, shared payment link, and move-to-strategy flow.",
    tone: "paper",
  },
  {
    id: "positions",
    title: "Positions",
    question: "What is the LP and hedge side currently holding?",
    body: "Inspect recorded LP and hedge positions when the synced state is available.",
    tone: "paper",
  },
  {
    id: "risk",
    title: "Risk",
    question: "Is something unhealthy, paused, or outside the guardrails?",
    body: "Use alerts, snapshot context, and pause conditions to understand why the system needs attention.",
    tone: "rose",
  },
  {
    id: "activity",
    title: "Activity",
    question: "What happened, who did it, and what did it trigger?",
    body: "Follow the execution ledger and operator audit stream without reverse engineering the worker loop.",
    tone: "lilac",
  },
  {
    id: "withdrawals",
    title: "Withdrawals",
    question: "What is live, landed, and still settling?",
    body: "Read withdrawable balances, transfer history, and the managed settlement path across rails.",
    tone: "mint",
  },
  {
    id: "settings",
    title: "Settings",
    question: "What rules is the strategy following right now?",
    body: "Adjust guardrails like thresholds, intervals, and drawdown assumptions as explicit configuration state.",
    tone: "lilac",
  },
  {
    id: "emergency-stop",
    title: "Emergency stop",
    question: "How do you halt the system when something is wrong?",
    body: "Pause strategy activity immediately, record the reason, and surface a critical alert in the account state.",
    tone: "rose",
  },
] as const satisfies readonly LandingSurfaceCard[];
