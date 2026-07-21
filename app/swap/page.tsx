"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import StrategyShell from "@/components/StrategyShell";
import { Panel, StatusBadge } from "@/components/strategy-ui";
import { api } from "@/convex/_generated/api";
import { agentRequest } from "@/lib/agentBackend";
import styles from "@/components/agents/agent-portal.module.css";

const TOKENS = {
  USDC: { address: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", decimals: 6 },
  WETH: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
} as const;

type UniswapQuoteResponse = {
  quote?: {
    routing?: string;
    output?: { amount?: string };
    orderInfo?: { outputs?: Array<{ startAmount?: string; endAmount?: string }> };
  };
};

export default function SwapPage() {
  const dashboard = useQuery(api.trade.getTradeDashboard, {});
  const [input, setInput] = useState<keyof typeof TOKENS>("USDC");
  const [amount, setAmount] = useState("100");
  const [result, setResult] = useState<UniswapQuoteResponse | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const output = input === "USDC" ? "WETH" : "USDC";
  const wallet = dashboard?.accountWallet?.ownerAddress;

  const quote = async () => {
    if (!wallet) return setStatus("Connect your managed account wallet before requesting a quote.");
    setBusy(true); setStatus(null); setResult(null);
    try {
      const rawAmount = decimalToUnits(amount, TOKENS[input].decimals);
      const payload = await agentRequest<UniswapQuoteResponse>("v1/swap/quote", {
        method: "POST",
        body: JSON.stringify({
          token_in: TOKENS[input].address, token_out: TOKENS[output].address,
          amount: rawAmount, type: "EXACT_INPUT", token_in_chain_id: 1,
          token_out_chain_id: 1, swapper: wallet,
        }),
      });
      setResult(payload);
      setStatus("Read-only quote received. No approval, signature, or transaction was requested.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  };

  const outputAmount = quoteOutput(result, TOKENS[output].decimals);
  return (
    <StrategyShell title="Trading" subtitle="Uniswap spot quote">
      <div className="two-column-grid">
        <Panel title="Read-only swap" description="Compare an exact-input Uniswap route without moving funds" tone="sky">
          <div className={styles.formGrid}>
            <label className={styles.field}>You send<select value={input} onChange={(event) => { setInput(event.target.value as keyof typeof TOKENS); setResult(null); }}><option>USDC</option><option>WETH</option></select></label>
            <label className={styles.field}>Amount<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
            <div className={`${styles.reviewBox} ${styles.full}`}><span>Estimated receive</span><h3>{outputAmount ?? "—"} {output}</h3><p>Ethereum mainnet · exact input · routing chosen by Uniswap</p></div>
          </div>
          <div className={styles.actions}><button className={styles.primary} type="button" disabled={busy} onClick={() => void quote()}>{busy ? "Quoting…" : "Get live quote"}</button></div>
          {status ? <p className={styles.notice}>{status}</p> : null}
        </Panel>
        <Panel title="Safety boundary" description="This milestone deliberately stops before execution" tone="paper">
          <div className={styles.dataList}>
            <div><span>Quote</span><strong>Enabled</strong></div>
            <div><span>Token approval</span><strong>Not requested</strong></div>
            <div><span>Wallet signature</span><strong>Not requested</strong></div>
            <div><span>Broadcast</span><StatusBadge tone="positive">Blocked</StatusBadge></div>
          </div>
        </Panel>
      </div>
    </StrategyShell>
  );
}

function decimalToUnits(value: string, decimals: number) {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error("Enter a positive decimal amount.");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw new Error(`This asset supports ${decimals} decimal places.`);
  return (BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals))).toString();
}

function quoteOutput(payload: UniswapQuoteResponse | null, decimals: number) {
  const amount = payload?.quote?.routing === "CLASSIC"
    ? payload?.quote?.output?.amount
    : payload?.quote?.orderInfo?.outputs?.[0]?.endAmount ?? payload?.quote?.orderInfo?.outputs?.[0]?.startAmount;
  if (!amount) return null;
  const raw = BigInt(amount); const base = 10n ** BigInt(decimals);
  const fraction = (raw % base).toString().padStart(decimals, "0").replace(/0+$/, "").slice(0, 6);
  return `${raw / base}${fraction ? `.${fraction}` : ""}`;
}
