import { decodeFunctionData, isAddress, isHex, parseAbi } from "viem";
import { config } from "./config.js";

type KeeperHubPayload = Record<string, unknown>;

const universalRouterAbi = parseAbi([
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
  "function execute(bytes commands, bytes[] inputs) payable"
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

  const decoded = decodeFunctionData({
    abi: universalRouterAbi,
    data: tx.data as `0x${string}`
  });

  const result = await khFetch("/execute/contract-call", {
    network: networkName(tx.chainId || config.chainId),
    contractAddress: tx.to,
    functionName: decoded.functionName,
    functionArgs: JSON.stringify(decoded.args, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    ),
    abi: JSON.stringify(universalRouterAbi),
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

  return result;
}

export async function getAgentExecutionHistory(agentEnsName: string) {
  return {
    agentEnsName,
    note: "KeeperHub Direct Execution exposes status by executionId. Run a transaction first, then query /execute/{executionId}/status."
  };
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
