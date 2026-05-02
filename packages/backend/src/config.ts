import dotenv from "dotenv";
import path from "node:path";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

export const config = {
  port: Number(process.env.PORT || 3001),
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
  erc8004IdentityRegistryAddress: process.env.ERC8004_IDENTITY_REGISTRY_ADDRESS || "",
  erc8004ReputationRegistryAddress: process.env.ERC8004_REPUTATION_REGISTRY_ADDRESS || "",
  erc8004ValidationRegistryAddress: process.env.ERC8004_VALIDATION_REGISTRY_ADDRESS || "",
  agentRegistryAddress: process.env.AGENT_REGISTRY_ADDRESS || "",
  agentWalletFactoryAddress: process.env.AGENT_WALLET_FACTORY_ADDRESS || ""
};

export function requireEnv(name: keyof typeof config) {
  const value = config[name];
  if (!value) throw new Error(`Missing required config: ${name}`);
  return value;
}
