import { isAddress, isHex, parseUnits, type Address } from "viem";
import { config } from "./config.js";

export const ETH_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
export const TOKENS: Record<string, Address> = {
  ETH: ETH_ADDRESS,
  WETH_MAINNET: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  USDC_MAINNET: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  WETH_SEPOLIA: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14",
  USDC_SEPOLIA: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"
};

type Json = Record<string, unknown>;

const tokenSymbolsByChain: Record<number, Record<string, Address>> = {
  1: {
    ETH: TOKENS.ETH,
    WETH: TOKENS.WETH_MAINNET,
    USDC: TOKENS.USDC_MAINNET
  },
  11155111: {
    ETH: TOKENS.ETH,
    WETH: TOKENS.WETH_SEPOLIA,
    USDC: TOKENS.USDC_SEPOLIA
  }
};

const tokenDecimalsByAddress: Record<string, number> = {
  [TOKENS.ETH.toLowerCase()]: 18,
  [TOKENS.WETH_MAINNET.toLowerCase()]: 18,
  [TOKENS.USDC_MAINNET.toLowerCase()]: 6,
  [TOKENS.WETH_SEPOLIA.toLowerCase()]: 18,
  [TOKENS.USDC_SEPOLIA.toLowerCase()]: 6
};

export function resolveTokenAddress(token: string | undefined, chainId: number, fallback: Address): Address {
  if (!token) return fallback;
  if (isAddress(token)) return token;
  const symbol = token.trim().toUpperCase();
  const resolved = tokenSymbolsByChain[chainId]?.[symbol] || tokenSymbolsByChain[1]?.[symbol];
  if (!resolved) throw new Error(`Unsupported token "${token}" on chain ${chainId}`);
  return resolved;
}

export function normalizeTokenAmount(amount: string, token: Address) {
  const clean = amount.trim();
  if (!clean) throw new Error("Quote amount is required");
  const decimals = tokenDecimalsByAddress[token.toLowerCase()] ?? 18;
  if (clean.includes(".")) return parseUnits(clean, decimals).toString();
  if (!/^\d+$/.test(clean)) throw new Error(`Invalid token amount "${amount}"`);
  if (clean.length <= decimals) return parseUnits(clean, decimals).toString();
  return clean;
}

async function uniswapFetch(path: string, body?: Json, method = "POST") {
  if (!config.uniswapApiKey) throw new Error("UNISWAP_API_KEY is not configured");
  const res = await fetch(`${config.uniswapApiBase}${path}`, {
    method,
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
      "x-api-key": config.uniswapApiKey,
      "x-universal-router-version": "2.0"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof data.detail === "string" ? data.detail : "";
    const errorCode = typeof data.errorCode === "string" ? data.errorCode : "";
    if (path === "/quote" && (errorCode === "ResourceNotFound" || /no quotes available/i.test(detail))) {
      throw new Error(
        "Uniswap could not find a Sepolia route for this quote. Try a funded agent wallet, a smaller amount, or another Sepolia pair; testnet liquidity can disappear."
      );
    }
    throw new Error(`Uniswap API ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

export async function checkApproval(params: {
  walletAddress: Address;
  token: Address;
  amount: string;
  chainId: number;
}) {
  if (params.token === ETH_ADDRESS) return { approval: null };
  return uniswapFetch("/check_approval", params);
}

export async function getQuote(params: {
  swapper: Address;
  tokenIn: Address;
  tokenOut: Address;
  amount: string;
  chainId: number;
  type?: "EXACT_INPUT" | "EXACT_OUTPUT";
}) {
  if (!isAddress(params.swapper) || !isAddress(params.tokenIn) || !isAddress(params.tokenOut)) {
    throw new Error("Invalid quote address");
  }

  return uniswapFetch("/quote", {
    generatePermitAsTransaction: true,
    swapper: params.swapper,
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    tokenInChainId: String(params.chainId),
    tokenOutChainId: String(params.chainId),
    amount: params.amount,
    type: params.type || "EXACT_INPUT",
    protocols: ["V2", "V3", "V4"],
    autoSlippage: "DEFAULT",
    urgency: "urgent"
  });
}

export function prepareSwapRequest(quoteResponse: Json, signature?: string) {
  const { permitData, permitTransaction, ...cleanQuote } = quoteResponse;
  const request: Json = { ...cleanQuote };
  const routing = quoteResponse.routing;
  const isUniswapX = routing === "DUTCH_V2" || routing === "DUTCH_V3" || routing === "PRIORITY";

  if (isUniswapX) {
    if (signature) request.signature = signature;
  } else if (signature && permitData && typeof permitData === "object") {
    request.signature = signature;
    request.permitData = permitData;
  }

  void permitTransaction;
  return request;
}

export function validateSwapTx(tx: Json) {
  if (!tx.data || tx.data === "0x" || !isHex(tx.data as `0x${string}`)) {
    throw new Error("swap.data is empty or invalid");
  }
  if (!tx.to || !isAddress(tx.to as string)) throw new Error("swap.to is invalid");
  if (!tx.from || !isAddress(tx.from as string)) throw new Error("swap.from is invalid");
}

export async function prepareSwap(quoteResponse: Json, signature?: string) {
  const swapRes = await uniswapFetch("/swap", prepareSwapRequest(quoteResponse, signature));
  if (swapRes.swap) validateSwapTx(swapRes.swap);
  return swapRes;
}
