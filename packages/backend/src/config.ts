import dotenv from "dotenv";
import path from "node:path";

[
  ".env",
  "../../.env",
  "../../../.env",
  "../.env"
].forEach((envPath) => {
  dotenv.config({ path: path.resolve(process.cwd(), envPath), override: true });
});

export const config = {
  port: Number(process.env.PORT || 3001),
  corsOrigins: (process.env.CORS_ORIGINS || "https://agentos.nikhilraikwar.me,http://localhost:3000,http://127.0.0.1:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  backendApiSecret: process.env.BACKEND_API_SECRET || "",
  parentEnsName: process.env.PARENT_ENS_NAME || "agentos.eth",
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 11155111),
  sepoliaRpcUrl: process.env.SEPOLIA_RPC_URL || "",
  uniswapApiBase: process.env.UNISWAP_API_BASE || "https://trade-api.gateway.uniswap.org/v1",
  uniswapApiKey: process.env.UNISWAP_API_KEY || "",
  keeperHubApiBase: process.env.KEEPERHUB_API_BASE || "https://app.keeperhub.com/api",
  keeperHubMcpUrl: process.env.KEEPERHUB_MCP_URL || "https://app.keeperhub.com/mcp",
  keeperHubApiKey: process.env.KEEPERHUB_API_KEY || "",
  openAiApiKey: process.env.OPENAI_API_KEY || "",
  openAiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  agentExecutorPrivateKey: process.env.AGENT_EXECUTOR_PRIVATE_KEY || "",
  erc8004IdentityRegistryAddress: process.env.ERC8004_IDENTITY_REGISTRY_ADDRESS || "",
  erc8004ReputationRegistryAddress: process.env.ERC8004_REPUTATION_REGISTRY_ADDRESS || "",
  erc8004ValidationRegistryAddress: process.env.ERC8004_VALIDATION_REGISTRY_ADDRESS || "",
  agentRegistryAddress: process.env.AGENT_REGISTRY_ADDRESS || "",
  agentWalletFactoryAddress: process.env.AGENT_WALLET_FACTORY_ADDRESS || "",
  agentSubnameRegistrarAddress: process.env.AGENT_SUBNAME_REGISTRAR_ADDRESS || process.env.NEXT_PUBLIC_AGENT_SUBNAME_REGISTRAR_ADDRESS || ""
};

export function requireEnv(name: keyof typeof config) {
  const value = config[name];
  if (!value) throw new Error(`Missing required config: ${name}`);
  return value;
}
