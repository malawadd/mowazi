export const withdrawalsDemo = {
  fundingAccounts: [
    {
      venueAccountId: "optimism_execution_wallet",
      role: "optimism execution wallet",
      venue: "Optimism / Uniswap",
      walletAddress: "0x1bca20a91e5b9fd0344de1be59f5c12daf8fc2",
      totalWalletHoldingsUsd: 9182.44,
      strategyAssetValueUsd: 9067.61,
      gasReserveValueUsd: 114.83,
      lowGasWarning: {
        asset: "ETH",
        currentBalance: "0.0301",
        message: "Synthetic demo fixture: ETH reserve is below the preferred runway for heavier chain activity.",
      },
      walletAssets: [
        { asset: "USDC", purpose: "strategy", label: "Strategy capital", balance: "6,024.92", valueUsd: 6024.92, availableBalance: "5,820.00", withdrawNote: "A small portion remains reserved for pending onchain work." },
        { asset: "LINK", purpose: "strategy", label: "Inventory buffer", balance: "53.62", valueUsd: 3042.69, availableBalance: "53.62", withdrawNote: "Inventory can stay parked between rebalances." },
        { asset: "ETH", purpose: "gas", label: "Gas reserve", balance: "0.0301", valueUsd: 114.83, availableBalance: "0.0184", withdrawNote: "Gas reserve remains only partly withdrawable." },
      ],
      recentTransfers: [
        { id: "wtx-001", asset: "ETH", purpose: "gas", direction: "out", amount: "0.0006312", balanceAfter: "0.0301", valueUsd: 2.41, observedAt: 1777881621000, detail: "Recent gas-reserve withdrawal settled on Optimism." },
        { id: "wtx-002", asset: "USDC", purpose: "strategy", direction: "in", amount: "450.00", balanceAfter: "6,024.92", valueUsd: 450, observedAt: 1777881021000, detail: "Inventory refresh funding landed before the last rebalance." },
      ],
    },
    {
      venueAccountId: "hyperliquid_master_wallet",
      role: "hyperliquid master wallet",
      venue: "HyperLiquid",
      walletAddress: "0x6f15f4216f10dc884215a5912d607de3d1659de3658a59521707f",
      totalWalletHoldingsUsd: 9230.12,
      strategyAssetValueUsd: 9230.12,
      gasReserveValueUsd: 0,
      lowGasWarning: null,
      walletAssets: [
        { asset: "USDC", purpose: "strategy", label: "Margin capital", balance: "9,230.12", valueUsd: 9230.12, availableBalance: "8,900.00", withdrawNote: "Leave runway if hedge activity may restart soon." },
      ],
      recentTransfers: [
        { id: "wtx-003", asset: "USDC", purpose: "strategy", direction: "out", amount: "125.00", balanceAfter: "9,230.12", valueUsd: 125, observedAt: 1777881521000, detail: "Queued withdrawal is visible in the managed settlement pipeline." },
      ],
    },
  ],
  withdrawals: [
    { _id: "wd-001", venueRole: "optimism execution wallet", asset: "ETH", amount: "0.0006312", destination: "0x21ab9c2838fedbf1b7a601f526816f28871c2", status: "completed", note: "Recent gas-reserve withdrawal completed successfully.", feeEstimateUsd: 0.75, requestedAt: 1777881621000 },
    { _id: "wd-002", venueRole: "hyperliquid master wallet", asset: "USDC", amount: "125.00", destination: "0x31b2c8838fddb1dff5601f536916f23871c3", status: "queued", note: "Margin release pending final live-balance confirmation.", feeEstimateUsd: 0.25, requestedAt: 1777881521000 },
    { _id: "wd-003", venueRole: "optimism execution wallet", asset: "ETH", amount: "0.0006311", destination: "0x41ab9c2838fedbf1b7a601f526816f28871c4", status: "cancelled", note: "Operator cancelled after protecting the LP-side gas reserve.", feeEstimateUsd: 0.75, requestedAt: 1777881421000 },
    { _id: "wd-004", venueRole: "hyperliquid master wallet", asset: "USDC", amount: "240.00", destination: "0x51ab9c2838fedbf1b7a601f526816f28871c5", status: "pending_checks", note: "Waiting for a final venue-state validation pass.", feeEstimateUsd: 0.3, requestedAt: 1777881321000 },
  ],
} as const;
