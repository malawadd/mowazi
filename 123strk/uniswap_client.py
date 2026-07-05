"""Uniswap client — pool state via QuickNode, quotes via Uniswap Trading API."""

import requests
from web3 import Web3
import config

LINK_DECIMALS = 18
USDC_DECIMALS = 6

POOL_ABI = [
    {
        "inputs": [],
        "name": "slot0",
        "outputs": [
            {"internalType": "uint160", "name": "sqrtPriceX96", "type": "uint160"},
            {"internalType": "int24", "name": "tick", "type": "int24"},
            {"internalType": "uint16", "name": "observationIndex", "type": "uint16"},
            {"internalType": "uint16", "name": "observationCardinality", "type": "uint16"},
            {"internalType": "uint16", "name": "observationCardinalityNext", "type": "uint16"},
            {"internalType": "uint8", "name": "feeProtocol", "type": "uint8"},
            {"internalType": "bool", "name": "unlocked", "type": "bool"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "liquidity",
        "outputs": [{"internalType": "uint128", "name": "", "type": "uint128"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "token0",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "token1",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function",
    },
]

ERC20_ABI = [
    {
        "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    }
]

AGGREGATOR_V3_ABI = [
    {
        "inputs": [],
        "name": "latestRoundData",
        "outputs": [
            {"internalType": "uint80", "name": "roundId", "type": "uint80"},
            {"internalType": "int256", "name": "answer", "type": "int256"},
            {"internalType": "uint256", "name": "startedAt", "type": "uint256"},
            {"internalType": "uint256", "name": "updatedAt", "type": "uint256"},
            {"internalType": "uint80", "name": "answeredInRound", "type": "uint80"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "decimals",
        "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}],
        "stateMutability": "view",
        "type": "function",
    },
]


class UniswapV3Client:
    def __init__(self):
        self.w3 = Web3(Web3.HTTPProvider(config.QUICKNODE_HTTP))
        self.pool = self.w3.eth.contract(
            address=Web3.to_checksum_address(config.POOL_ADDRESS),
            abi=POOL_ABI,
        )
        # Cache token ordering
        token0 = self.pool.functions.token0().call().lower()
        self.link_is_token0 = token0 == config.LINK_ADDRESS.lower()

        # Uniswap Trading API
        self.api_url = config.UNISWAP_API_URL
        self.api_headers = {
            "x-api-key": config.UNISWAP_API_KEY,
            "Content-Type": "application/json",
        }
        self.wallet_address = None
        if config.PRIVATE_KEY:
            from eth_account import Account
            self.wallet_address = Account.from_key(config.PRIVATE_KEY).address

        # API call counters
        self.api_calls = 0
        self.api_errors = 0
        self.link_contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(config.LINK_ADDRESS),
            abi=ERC20_ABI,
        )
        self.usdc_contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(config.USDC_ADDRESS),
            abi=ERC20_ABI,
        )
        self.eth_usd_feed = self.w3.eth.contract(
            address=Web3.to_checksum_address(config.ETH_USD_FEED_ADDRESS),
            abi=AGGREGATOR_V3_ABI,
        )

    def get_eth_price_usd(self) -> float:
        """Read the ETH / USD price from the configured Chainlink feed."""
        decimals = self.eth_usd_feed.functions.decimals().call()
        _, answer, _, updated_at, _ = self.eth_usd_feed.functions.latestRoundData().call()
        if answer <= 0:
            raise ValueError("ETH/USD oracle returned a non-positive answer")
        return float(answer) / (10 ** decimals)

    def get_pool_price(self) -> dict:
        """Get current pool state via QuickNode RPC (slot0 + liquidity)."""
        slot0 = self.pool.functions.slot0().call()
        sqrt_price_x96 = slot0[0]
        tick = slot0[1]
        liquidity = self.pool.functions.liquidity().call()

        price_raw = (sqrt_price_x96 / (2**96)) ** 2
        if self.link_is_token0:
            price_usdc_per_link = price_raw * (10 ** (LINK_DECIMALS - USDC_DECIMALS))
        else:
            price_usdc_per_link = (1 / price_raw) * (10 ** (LINK_DECIMALS - USDC_DECIMALS))

        return {
            "sqrtPriceX96": sqrt_price_x96,
            "tick": tick,
            "price": price_usdc_per_link,
            "liquidity": liquidity,
            "link_is_token0": self.link_is_token0,
        }

    def quote_swap(self, amount_in_usd: float, buy_link: bool) -> dict:
        """Get a real quote from Uniswap Trading API (routed across all pools).

        Args:
            amount_in_usd: Amount in USD to swap (or LINK amount if selling).
            buy_link: True = USDC -> LINK, False = LINK -> USDC.

        Returns dict with:
          - amount_in: input amount (human units)
          - amount_out: output amount (human units)
          - effective_price: USDC per LINK after slippage/routing
          - price_impact: percentage vs pool mid price
          - routing: routing type from API
          - gas_estimate_usd: gas fee estimate from API
        """
        pool = self.get_pool_price()
        mid_price = pool["price"]

        if buy_link:
            token_in = config.USDC_ADDRESS
            token_out = config.LINK_ADDRESS
            amount_raw = int(amount_in_usd * (10**USDC_DECIMALS))
            in_decimals = USDC_DECIMALS
            out_decimals = LINK_DECIMALS
        else:
            token_in = config.LINK_ADDRESS
            token_out = config.USDC_ADDRESS
            amount_raw = int(amount_in_usd * (10**LINK_DECIMALS))
            in_decimals = LINK_DECIMALS
            out_decimals = USDC_DECIMALS

        try:
            payload = {
                "type": "EXACT_INPUT",
                "amount": str(amount_raw),
                "tokenIn": token_in,
                "tokenOut": token_out,
                "tokenInChainId": 10,
                "tokenOutChainId": 10,
                "swapper": self.wallet_address,
                "slippageTolerance": config.SLIPPAGE_TOLERANCE,
            }
            self.api_calls += 1
            resp = requests.post(
                f"{self.api_url}/quote",
                json=payload,
                headers=self.api_headers,
                timeout=10,
            )

            if resp.status_code != 200:
                self.api_errors += 1
                print(f"[Uniswap API] Quote failed ({resp.status_code}): {resp.text[:200]}")
                return None

            data = resp.json()
            quote = data.get("quote", {})
            routing = data.get("routing", "UNKNOWN")

            amount_out_raw = int(quote.get("output", {}).get("amount", 0))
            amount_in_human = amount_raw / (10**in_decimals)
            amount_out_human = amount_out_raw / (10**out_decimals)

            if amount_out_human <= 0:
                return None

            if buy_link:
                effective_price = amount_in_human / amount_out_human
            else:
                effective_price = amount_out_human / amount_in_human

            price_impact = abs(effective_price - mid_price) / mid_price * 100

            # Gas estimate from API (in wei, convert to USD)
            gas_fee_wei = int(data.get("gasFee", 0))

            return {
                "amount_in": amount_in_human,
                "amount_out": amount_out_human,
                "effective_price": effective_price,
                "price_impact": price_impact,
                "routing": routing,
                "gas_fee_wei": gas_fee_wei,
            }
        except Exception as e:
            print(f"[Uniswap API] Quote error: {e}")
            return None

    def read_wallet_balances(self, address: str, link_price_usd: float | None = None) -> dict:
        """Read wallet balances for the managed Optimism execution wallet."""
        checksum = Web3.to_checksum_address(address)
        link_price = link_price_usd or self.get_pool_price()["price"]
        eth_price = self.get_eth_price_usd()

        eth_raw = self.w3.eth.get_balance(checksum)
        usdc_raw = self.usdc_contract.functions.balanceOf(checksum).call()
        link_raw = self.link_contract.functions.balanceOf(checksum).call()

        eth_amount = float(Web3.from_wei(eth_raw, "ether"))
        usdc_amount = usdc_raw / (10 ** USDC_DECIMALS)
        link_amount = link_raw / (10 ** LINK_DECIMALS)

        balances = [
            {
                "asset": "ETH",
                "amount": f"{eth_amount:.8f}",
                "valueUsd": round(eth_amount * eth_price, 2),
                "purpose": "gas",
                "includedInStrategyEquity": False,
                "label": "Gas reserve",
            },
            {
                "asset": "USDC",
                "amount": f"{usdc_amount:.6f}",
                "valueUsd": round(usdc_amount, 2),
                "purpose": "capital",
                "includedInStrategyEquity": True,
                "label": "Strategy capital",
            },
            {
                "asset": "LINK",
                "amount": f"{link_amount:.8f}",
                "valueUsd": round(link_amount * link_price, 2),
                "purpose": "inventory",
                "includedInStrategyEquity": True,
                "label": "Strategy inventory",
            },
        ]
        strategy_value_usd = round(
            sum(item["valueUsd"] for item in balances if item["includedInStrategyEquity"]),
            2,
        )
        gas_value_usd = round(
            sum(item["valueUsd"] for item in balances if item["purpose"] == "gas"),
            2,
        )

        return {
            "balances": balances,
            "strategy_value_usd": strategy_value_usd,
            "gas_value_usd": gas_value_usd,
            "total_value_usd": round(sum(item["valueUsd"] for item in balances), 2),
            "eth_price_usd": round(eth_price, 2),
            "link_price_usd": round(link_price, 6),
        }
