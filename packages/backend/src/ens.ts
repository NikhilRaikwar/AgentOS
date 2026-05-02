import { createPublicClient, http, isAddress, namehash, type Address } from "viem";
import { sepolia } from "viem/chains";
import { config } from "./config.js";

export type AgentRecord = {
  ensName: string;
  address: Address | null;
  records: Record<string, string | null>;
};

export const AGENT_TEXT_KEYS = [
  "specialty",
  "fee",
  "chains",
  "endpoint",
  "preferred_token",
  "model",
  "reputation",
  "tasks_done",
  "framework",
  "keeperhub",
  "wallet_type"
] as const;

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(config.sepoliaRpcUrl || undefined)
});

export function fullAgentName(name: string) {
  if (name.endsWith(`.${config.parentEnsName}`)) return name;
  return `${name}.${config.parentEnsName}`;
}

export async function resolveAgent(ensName: string): Promise<AgentRecord> {
  const address = await publicClient.getEnsAddress({ name: ensName }).catch(() => null);
  const records: Record<string, string | null> = {};

  await Promise.all(
    AGENT_TEXT_KEYS.map(async (key) => {
      records[key] = await publicClient.getEnsText({ name: ensName, key }).catch(() => null);
    })
  );

  return { ensName, address, records };
}

export function buildAgentRecords(input: {
  name: string;
  specialty: string;
  fee: string;
  preferredToken: string;
  endpoint: string;
  smartWallet?: string;
}) {
  const ensName = fullAgentName(input.name);
  if (input.smartWallet && !isAddress(input.smartWallet)) {
    throw new Error("Invalid smart wallet address");
  }

  return {
    ensName,
    node: namehash(ensName),
    records: {
      specialty: input.specialty,
      fee: input.fee,
      chains: JSON.stringify([config.chainId]),
      endpoint: input.endpoint,
      preferred_token: input.preferredToken,
      model: config.openAiModel,
      reputation: "50",
      tasks_done: "0",
      framework: "agentfi-os/1.0",
      keeperhub: "enabled",
      wallet_type: "smart-wallet"
    }
  };
}

export async function listSeedAgents() {
  const names = ["trade", "research", "orchestrate"].map(fullAgentName);
  return Promise.all(names.map(resolveAgent));
}
