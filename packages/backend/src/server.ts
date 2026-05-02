import cors from "cors";
import express from "express";
import { z } from "zod";
import { isAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "./config.js";
import { buildAgentRecords, fullAgentName, resolveAgent } from "./ens.js";
import { keeperHubHealthCheck, submitTransaction } from "./keeperhub.js";
import { executePreparedSwap, runAgent } from "./openai-agent.js";
import { getQuote, prepareSwap } from "./uniswap.js";

const app = express();
app.use(cors({
  origin(origin, callback) {
    if (!origin || config.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin not allowed by AgentOS CORS policy"));
  }
}));
app.use(express.json({ limit: "1mb" }));

function requireBackendSecret(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!config.backendApiSecret) {
    res.status(503).json({ error: "Backend API secret is not configured." });
    return;
  }

  const provided = req.get("x-agentos-api-key");
  if (provided !== config.backendApiSecret) {
    res.status(401).json({ error: "Unauthorized backend execution request." });
    return;
  }

  next();
}

function getExecutorAddress() {
  try {
    return config.agentExecutorPrivateKey
      ? privateKeyToAccount(config.agentExecutorPrivateKey as `0x${string}`).address
      : null;
  } catch {
    return null;
  }
}

app.get("/health", async (_req, res) => {
  const keeperhub = await keeperHubHealthCheck();
  const keeperHubWallet = typeof keeperhub === "object"
    && keeperhub
    && "result" in keeperhub
    && typeof keeperhub.result === "object"
    && keeperhub.result
    && "walletAddress" in keeperhub.result
    && typeof keeperhub.result.walletAddress === "string"
    && isAddress(keeperhub.result.walletAddress)
    ? keeperhub.result.walletAddress
    : undefined;
  res.json({
    ok: true,
    chainId: config.chainId,
    parentEnsName: config.parentEnsName,
    contracts: {
      erc8004IdentityRegistry: config.erc8004IdentityRegistryAddress,
      erc8004ReputationRegistry: config.erc8004ReputationRegistryAddress,
      erc8004ValidationRegistry: config.erc8004ValidationRegistryAddress,
      agentRegistry: config.agentRegistryAddress,
      agentWalletFactory: config.agentWalletFactoryAddress,
      agentSubnameRegistrar: config.agentSubnameRegistrarAddress
    },
    executorAddress: getExecutorAddress(),
    openai: Boolean(config.openAiApiKey),
    uniswap: Boolean(config.uniswapApiKey),
    keeperhub: {
      ok: keeperhub.ok,
      status: "status" in keeperhub ? keeperhub.status : undefined,
      message: "message" in keeperhub ? keeperhub.message : undefined,
      error: "error" in keeperhub ? keeperhub.error : undefined,
      result: keeperHubWallet ? { walletAddress: keeperHubWallet } : undefined
    }
  });
});

app.get("/agents", async (_req, res) => {
  res.json({
    agents: [],
    note: "No seeded agents are returned. Create real agents through the wallet-signed dashboard flow, then resolve them by ENS name."
  });
});

app.get("/agents/:name", async (req, res, next) => {
  try {
    res.json(await resolveAgent(fullAgentName(req.params.name)));
  } catch (error) {
    next(error);
  }
});

app.post("/agents", async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().min(1),
      specialty: z.string().min(1),
      fee: z.string().default("0.001 ETH"),
      preferredToken: z.string().default("USDC"),
      owner: z.string().refine(isAddress),
      smartWallet: z.string().optional()
    }).parse(req.body);

    const endpoint = `${req.protocol}://${req.get("host")}/agents/${body.name}/run`;
    const agent = buildAgentRecords({ ...body, endpoint });
    res.json({
      status: "prepared",
      note: "Use the frontend wallet flow to deploy the smart wallet and write ENS records.",
      agent
    });
  } catch (error) {
    next(error);
  }
});

app.post("/agents/:name/run", requireBackendSecret, async (req, res, next) => {
  try {
    const body = z.object({
      message: z.string().min(1),
      walletAddress: z.string().optional(),
      history: z.array(z.object({
        role: z.enum(["user", "agent", "tool"]),
        text: z.string()
      })).optional()
    }).parse(req.body);
    res.json(await runAgent({
      agentName: String(req.params.name),
      message: body.message,
      walletAddress: body.walletAddress as Address | undefined,
      history: body.history
    }));
  } catch (error) {
    next(error);
  }
});

app.post("/quote", async (req, res, next) => {
  try {
    const body = z.object({
      swapper: z.string().refine(isAddress),
      tokenIn: z.string().refine(isAddress),
      tokenOut: z.string().refine(isAddress),
      amount: z.string().min(1),
      chainId: z.number().default(1)
    }).parse(req.body);
    res.json(await getQuote(body as Parameters<typeof getQuote>[0]));
  } catch (error) {
    next(error);
  }
});

app.post("/swap/prepare", requireBackendSecret, async (req, res, next) => {
  try {
    res.json(await prepareSwap(req.body.quoteResponse, req.body.signature));
  } catch (error) {
    next(error);
  }
});

app.post("/swap/execute", requireBackendSecret, async (req, res, next) => {
  try {
    res.json(await executePreparedSwap(req.body));
  } catch (error) {
    next(error);
  }
});

app.post("/keeperhub/execute", requireBackendSecret, async (req, res, next) => {
  try {
    res.json(await submitTransaction(req.body));
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(400).json({
    error: error instanceof Error ? error.message : String(error)
  });
});

app.listen(config.port, () => {
  console.log(`AgentFi OS Backend running on http://localhost:${config.port}`);
  console.log(`ENS parent: ${config.parentEnsName}`);
});
