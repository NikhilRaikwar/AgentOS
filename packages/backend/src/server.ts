import cors from "cors";
import express from "express";
import { z } from "zod";
import { isAddress, type Address } from "viem";
import { config } from "./config.js";
import { buildAgentRecords, fullAgentName, listSeedAgents, resolveAgent } from "./ens.js";
import { keeperHubHealthCheck, submitTransaction } from "./keeperhub.js";
import { executePreparedSwap, runAgent } from "./openai-agent.js";
import { getQuote, prepareSwap } from "./uniswap.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (_req, res) => {
  const keeperhub = await keeperHubHealthCheck();
  res.json({
    ok: true,
    chainId: config.chainId,
    parentEnsName: config.parentEnsName,
    contracts: {
      erc8004IdentityRegistry: config.erc8004IdentityRegistryAddress,
      erc8004ReputationRegistry: config.erc8004ReputationRegistryAddress,
      erc8004ValidationRegistry: config.erc8004ValidationRegistryAddress,
      agentRegistry: config.agentRegistryAddress,
      agentWalletFactory: config.agentWalletFactoryAddress
    },
    openai: Boolean(config.openAiApiKey),
    uniswap: Boolean(config.uniswapApiKey),
    keeperhub
  });
});

app.get("/agents", async (_req, res, next) => {
  try {
    res.json({ agents: await listSeedAgents() });
  } catch (error) {
    next(error);
  }
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

app.post("/agents/:name/run", async (req, res, next) => {
  try {
    const body = z.object({
      message: z.string().min(1),
      walletAddress: z.string().optional()
    }).parse(req.body);
    res.json(await runAgent({
      agentName: req.params.name,
      message: body.message,
      walletAddress: body.walletAddress as Address | undefined
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

app.post("/swap/prepare", async (req, res, next) => {
  try {
    res.json(await prepareSwap(req.body.quoteResponse, req.body.signature));
  } catch (error) {
    next(error);
  }
});

app.post("/swap/execute", async (req, res, next) => {
  try {
    res.json(await executePreparedSwap(req.body));
  } catch (error) {
    next(error);
  }
});

app.post("/keeperhub/execute", async (req, res, next) => {
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
