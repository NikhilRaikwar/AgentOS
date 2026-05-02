import { config } from "./config.js";

type KeeperHubPayload = Record<string, unknown>;

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
  const result = await khFetch("/executions", {
    agent: params.agentEnsName,
    transaction: params.tx,
    policy: params.policy || {
      retries: 3,
      gasOptimization: true,
      privateRouting: true,
      auditTrail: true
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
  const encoded = encodeURIComponent(agentEnsName);
  return khFetch(`/executions?agent=${encoded}`, undefined, "GET");
}
