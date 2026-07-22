"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import StrategyShell from "@/components/StrategyShell";
import { Panel, StatusBadge } from "@/components/strategy-ui";
import { api } from "@/convex/_generated/api";
import { useOwnerSigner } from "@/hooks/useOwnerSigner";
import { agentRequest } from "@/lib/agentBackend";
import { ARBITRUM_CHAIN_ID, ARBITRUM_TOKENS, type ArbitrumTokenSymbol } from "@/lib/trade/arbitrumRegistry";
import styles from "@/components/agents/agent-portal.module.css";

type ApiTransaction = { to: string; from?: string; data: string; value?: string; chainId?: number };
type QuoteResponse = {
  routing?: string;
  permitData?: Record<string, unknown> | null;
  quote?: { routing?: string; output?: { amount?: string }; orderInfo?: { outputs?: Array<{ startAmount?: string; endAmount?: string }> }; gasFeeUSD?: string };
  moeazi: { chainId: "42161"; quotedAt: number };
};
type PreparedSwap = {
  transaction: ApiTransaction;
  routing: string;
  simulation: { success: boolean; reason: string };
  broadcastAllowed: boolean;
};

export default function SwapPage() {
  const dashboard = useQuery(api.trade.getTradeDashboard, {});
  const signer = useOwnerSigner();
  const [input, setInput] = useState<ArbitrumTokenSymbol>("USDC");
  const [output, setOutput] = useState<ArbitrumTokenSymbol>("WETH");
  const [amount, setAmount] = useState("100");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [approval, setApproval] = useState<ApiTransaction | null>(null);
  const [prepared, setPrepared] = useState<PreparedSwap | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wallet = dashboard?.accountWallet?.evmUaAddress ?? signer.uaAddress;

  const verify = async (symbol: ArbitrumTokenSymbol) => {
    const response = await fetch(`/api/arbitrum/token-registry?symbol=${symbol}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok || !body.verified) throw new Error(body.error ?? `${symbol} failed Arbitrum verification.`);
  };

  const requestQuote = async () => {
    if (!wallet) return setStatus("Sync your Particle or Magic Universal Account before requesting a quote.");
    if (input === output) return setStatus("Choose two different assets.");
    setBusy(true); setStatus(null); setQuote(null); setPrepared(null);
    try {
      await Promise.all([verify(input), verify(output)]);
      const tokenIn = ARBITRUM_TOKENS[input];
      const rawAmount = decimalToUnits(amount, tokenIn.decimals);
      const approvalResult = await agentRequest<{ approval?: ApiTransaction | null }>("v1/swap/check-approval", {
        method: "POST",
        body: JSON.stringify({ wallet_address: wallet, token: tokenIn.address, amount: rawAmount, chain_id: ARBITRUM_CHAIN_ID }),
      });
      if (approvalResult.approval) {
        setApproval(approvalResult.approval);
        setStatus("A mainnet token approval is required. Review and sign it before quoting.");
        return;
      }
      const payload = await agentRequest<QuoteResponse>("v1/swap/quote", {
        method: "POST",
        body: JSON.stringify({
          token_in: tokenIn.address,
          token_out: ARBITRUM_TOKENS[output].address,
          amount: rawAmount,
          type: "EXACT_INPUT",
          token_in_chain_id: String(ARBITRUM_CHAIN_ID),
          token_out_chain_id: String(ARBITRUM_CHAIN_ID),
          swapper: wallet,
          slippage_tolerance: 0.5,
        }),
      });
      setQuote(payload);
      setStatus("Fresh Arbitrum quote received. It expires in 30 seconds.");
    } catch (error) { setStatus(message(error)); } finally { setBusy(false); }
  };

  const submitApproval = async () => {
    if (!approval) return;
    const confirmed = window.confirm(`Approve ${input} for this Arbitrum route? This is a real mainnet transaction and may spend gas.`);
    if (!confirmed) return;
    setBusy(true); setStatus(null);
    try {
      const transaction = await signer.createCall({ chainId: ARBITRUM_CHAIN_ID, expectTokens: [], transactions: [{ to: approval.to, data: approval.data, value: approval.value ?? "0" }] });
      const result = await signer.send(transaction);
      setApproval(null);
      setStatus(`Approval submitted (${transactionReference(result)}). Request a fresh quote after confirmation.`);
    } catch (error) { setStatus(message(error)); } finally { setBusy(false); }
  };

  const prepare = async () => {
    if (!quote || !wallet) return;
    setBusy(true); setStatus(null);
    try {
      const signature = quote.permitData ? await signer.signTypedData(quote.permitData as never) : undefined;
      const result = await agentRequest<PreparedSwap>("v1/swap/prepare", {
        method: "POST",
        body: JSON.stringify({ quote_response: quote, expected_sender: wallet, quoted_at: quote.moeazi.quotedAt, signature }),
      });
      setPrepared(result);
      setStatus(result.simulation.success ? "Transaction validated and simulated on Arbitrum." : `Simulation blocked: ${result.simulation.reason}`);
    } catch (error) { setStatus(message(error)); } finally { setBusy(false); }
  };

  const execute = async () => {
    if (!prepared?.broadcastAllowed) return;
    const confirmed = window.confirm(`Swap ${amount} ${input} for ${output} on Arbitrum mainnet? Review the fresh quote, gas, slippage, and recipient before continuing.`);
    if (!confirmed) return;
    setBusy(true); setStatus(null);
    try {
      const tx = prepared.transaction;
      const universal = await signer.createCall({ chainId: ARBITRUM_CHAIN_ID, expectTokens: [], transactions: [{ to: tx.to, data: tx.data, value: tx.value ?? "0" }] });
      const result = await signer.send(universal);
      setStatus(`Swap submitted (${transactionReference(result)}). Receipt reconciliation is now required.`);
      setQuote(null); setPrepared(null);
    } catch (error) { setStatus(message(error)); } finally { setBusy(false); }
  };

  const outputAmount = quoteOutput(quote, ARBITRUM_TOKENS[output].decimals);
  return (
    <StrategyShell title="Trading" subtitle="Spot swap">
      <div className="two-column-grid">
        <Panel title="Arbitrum swap" description="Routes may use Uniswap V2, V3, V4, or UniswapX" tone="sky">
          <div className={styles.formGrid}>
            <label className={styles.field}>You send<select value={input} onChange={(event) => { setInput(event.target.value as ArbitrumTokenSymbol); setQuote(null); }}>
              {Object.keys(ARBITRUM_TOKENS).map((symbol) => <option key={symbol}>{symbol}</option>)}
            </select></label>
            <label className={styles.field}>You receive<select value={output} onChange={(event) => { setOutput(event.target.value as ArbitrumTokenSymbol); setQuote(null); }}>
              {Object.keys(ARBITRUM_TOKENS).map((symbol) => <option key={symbol}>{symbol}</option>)}
            </select></label>
            <label className={styles.field}>Amount<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
            <div className={`${styles.reviewBox} ${styles.full}`}><span>Estimated receive</span><h3>{outputAmount ?? "—"} {output}</h3><p>Arbitrum 42161 · {quote?.routing ?? quote?.quote?.routing ?? "best route"} · 0.5% max slippage</p></div>
          </div>
          <div className={styles.actions}>
            {!approval ? <button className={styles.primary} disabled={busy} onClick={() => void requestQuote()}>{busy ? "Checking…" : "Check approval + quote"}</button> : null}
            {approval ? <button className={styles.primary} disabled={busy} onClick={() => void submitApproval()}>Review mainnet approval</button> : null}
            {quote && !prepared ? <button className={styles.secondary} disabled={busy} onClick={() => void prepare()}>Validate + simulate</button> : null}
            {prepared?.broadcastAllowed ? <button className={styles.primary} disabled={busy} onClick={() => void execute()}>Review + execute</button> : null}
          </div>
          {status ? <p className={styles.notice}>{status}</p> : null}
        </Panel>
        <Panel title="Execution boundary" description="The UA remains the sender and owner" tone="paper">
          <div className={styles.dataList}>
            <div><span>Signer</span><strong>{wallet ? signer.provider : "Not connected"}</strong></div>
            <div><span>Strategy owner</span><strong>{short(wallet)}</strong></div>
            <div><span>Network</span><StatusBadge tone="positive">Arbitrum 42161</StatusBadge></div>
            <div><span>Simulation</span><strong>{prepared ? prepared.simulation.success ? "Passed" : "Failed" : "Required"}</strong></div>
            <div><span>Live broadcast</span><StatusBadge tone={prepared?.broadcastAllowed ? "warning" : "positive"}>{prepared?.broadcastAllowed ? "Requires confirmation" : "Environment blocked"}</StatusBadge></div>
            <div><span>WETH unwrap</span><strong>Explicit amount only · never automatic</strong></div>
          </div>
        </Panel>
      </div>
    </StrategyShell>
  );
}

function decimalToUnits(value: string, decimals: number) {
  if (!/^\d+(\.\d+)?$/.test(value) || Number(value) <= 0) throw new Error("Enter a positive decimal amount.");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw new Error(`This asset supports ${decimals} decimal places.`);
  return (BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals))).toString();
}

function quoteOutput(payload: QuoteResponse | null, decimals: number) {
  const routing = payload?.routing ?? payload?.quote?.routing;
  const amount = routing === "CLASSIC" ? payload?.quote?.output?.amount
    : payload?.quote?.orderInfo?.outputs?.[0]?.endAmount ?? payload?.quote?.orderInfo?.outputs?.[0]?.startAmount;
  if (!amount) return null;
  const raw = BigInt(amount); const base = 10n ** BigInt(decimals);
  const fraction = (raw % base).toString().padStart(decimals, "0").replace(/0+$/, "").slice(0, 6);
  return `${raw / base}${fraction ? `.${fraction}` : ""}`;
}
function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
function short(value?: string | null) { return value ? `${value.slice(0, 8)}…${value.slice(-6)}` : "Not synced"; }
function transactionReference(value: unknown) {
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return String(row.transactionId ?? row.hash ?? row.txHash ?? "submitted");
  }
  return String(value ?? "submitted");
}
