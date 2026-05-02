import { decodeFunctionData, encodeFunctionData, erc20Abi, isAddress, isHex, parseAbi, type Address } from "viem";
import { config } from "./config.js";

type KeeperHubPayload = Record<string, unknown>;

const universalRouterAbi = parseAbi([
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
  "function execute(bytes commands, bytes[] inputs) payable"
]);

const permit2Abi = parseAbi([
  "function approve(address token, address spender, uint160 amount, uint48 expiration)"
]);

const agentSmartWalletAbi = parseAbi([
  "function execute(address target,uint256 value,bytes data) returns (bytes result)"
]);

async function khFetch(path: string, body?: KeeperHubPayload, method = "POST") {
  if (!config.keeperHubApiKey) {
    return {
      mocked: true,
      status: "not_configured",
      auditLog: "KeeperHub API key not configured. Set KEEPERHUB_API_KEY for live execution."
    };
  }

  const res = await fetch(`${config.keeperHubApiBase}${path}`, {
    method,
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
      "authorization": `Bearer ${config.keeperHubApiKey}`
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`KeeperHub ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

export async function keeperHubHealthCheck() {
  try {
    const keyPrefix = config.keeperHubApiKey.slice(0, 3);
    if (keyPrefix && keyPrefix !== "kh_") {
      return {
        ok: false,
        error: "KeeperHub API key must be an organization key with kh_ prefix for REST API/MCP. The current key appears to be a user/webhook key.",
        apiBase: config.keeperHubApiBase,
        mcpUrl: config.keeperHubMcpUrl
      };
    }

    const result = await khFetch("/user", undefined, "GET");
    return { ok: !("mocked" in result), result };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      apiBase: config.keeperHubApiBase,
      mcpUrl: config.keeperHubMcpUrl
    };
  }
}

export async function submitTransaction(params: {
  agentEnsName: string;
  tx: KeeperHubPayload;
  policy?: KeeperHubPayload;
}) {
  const tx = params.tx as { to?: string; data?: string; value?: string | number | bigint; chainId?: number };
  if (!tx.to || !isAddress(tx.to)) throw new Error("KeeperHub execution requires tx.to");
  if (!tx.data || !isHex(tx.data as `0x${string}`)) throw new Error("KeeperHub execution requires hex tx.data");
  const valueWei = normalizeWei(tx.value);

  const decoded = decodeKnownTransaction(tx.data as `0x${string}`);

  const result = await khFetch("/execute/contract-call", {
    network: networkName(tx.chainId || config.chainId),
    contractAddress: tx.to,
    functionName: decoded.functionName,
    functionArgs: JSON.stringify(decoded.args, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    ),
    abi: JSON.stringify(decoded.abi),
    value: valueWei,
    gasLimitMultiplier: "1.25",
    metadata: {
      agent: params.agentEnsName,
      source: "agentos-uniswap-swap",
      policy: params.policy || {
        retries: 3,
        gasOptimization: true,
        privateRouting: true,
        auditTrail: true
      }
    }
  });

  if ("mocked" in result) {
    return {
      mocked: true,
      executionId: `kh-demo-${Date.now()}`,
      status: "queued",
      auditLog: result.auditLog
    };
  }

  return waitForDirectExecution(result);
}

export async function submitAgentWalletTransaction(params: {
  agentEnsName: string;
  agentWallet: Address;
  tx: KeeperHubPayload;
  policy?: KeeperHubPayload;
}) {
  const tx = params.tx as { to?: string; data?: string; value?: string | number | bigint; chainId?: number };
  if (!isAddress(params.agentWallet)) throw new Error("Agent wallet address is invalid");
  if (!tx.to || !isAddress(tx.to)) throw new Error("Agent wallet execution requires tx.to");
  if (!tx.data || !isHex(tx.data as `0x${string}`)) throw new Error("Agent wallet execution requires hex tx.data");

  const wrapped = {
    to: params.agentWallet,
    data: encodeFunctionData({
      abi: agentSmartWalletAbi,
      functionName: "execute",
      args: [tx.to as Address, BigInt(normalizeWei(tx.value)), tx.data as `0x${string}`]
    }),
    value: "0",
    chainId: tx.chainId || config.chainId
  };

  return submitTransaction({
    agentEnsName: params.agentEnsName,
    tx: wrapped,
    policy: {
      ...(params.policy || {}),
      smartWallet: params.agentWallet,
      wrappedTarget: tx.to,
      wrappedValue: normalizeWei(tx.value)
    }
  });
}

export async function getAgentExecutionHistory(agentEnsName: string) {
  return {
    agentEnsName,
    note: "KeeperHub Direct Execution exposes status by executionId. Run a transaction first, then query /execute/{executionId}/status."
  };
}

async function waitForDirectExecution(result: unknown) {
  if (!result || typeof result !== "object" || !("executionId" in result)) return result;
  const executionId = String((result as { executionId?: unknown }).executionId || "");
  if (!executionId) return result;

  let latest: unknown = result;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await sleep(1250);
    latest = await khFetch(`/execute/${executionId}/status`, undefined, "GET");
    const status = typeof latest === "object" && latest && "status" in latest
      ? String((latest as { status?: unknown }).status || "").toLowerCase()
      : "";
    if (status === "completed" || status === "failed") return latest;
  }

  return latest;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function networkName(chainId: number) {
  const networks: Record<number, string> = {
    1: "ethereum",
    11155111: "sepolia",
    8453: "base",
    84532: "base-sepolia",
    42161: "arbitrum",
    137: "polygon",
    130: "unichain",
    1301: "unichain-sepolia"
  };
  return networks[chainId] || "sepolia";
}

function normalizeWei(value: string | number | bigint | undefined) {
  if (value === undefined || value === null || value === "") return "0";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return BigInt(value).toString();
  return BigInt(value).toString();
}

function decodeKnownTransaction(data: `0x${string}`) {
  for (const abi of [agentSmartWalletAbi, universalRouterAbi, permit2Abi, erc20Abi]) {
    try {
      const decoded = decodeFunctionData({ abi, data });
      return { ...decoded, abi };
    } catch {
      // Try the next known ABI.
    }
  }
  throw new Error("KeeperHub execution cannot decode transaction data with known AgentOS ABIs");
}
