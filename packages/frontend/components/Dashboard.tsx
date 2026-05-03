"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  decodeEventLog,
  decodeFunctionData,
  formatEther,
  formatUnits,
  isAddress,
  namehash,
  parseAbiItem,
  parseEther,
  parseUnits,
  stringToHex,
  type Address,
  type Hex
} from "viem";
import { sepolia } from "wagmi/chains";
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import {
  agentRegistryAbi,
  agentSmartWalletAbi,
  agentSubnameRegistrarAbi,
  agentWalletFactoryAbi,
  ensPublicResolverAbi,
  identityRegistryAbi,
  sepoliaContracts
} from "../lib/contracts";

const apiUrl = "/api/backend";
const parentEnsName = process.env.NEXT_PUBLIC_PARENT_ENS_NAME || "agentos.eth";
const logLookbackBlocks = BigInt(process.env.NEXT_PUBLIC_AGENT_LOG_LOOKBACK_BLOCKS || "5000");
const logChunkSize = BigInt(process.env.NEXT_PUBLIC_AGENT_LOG_CHUNK_BLOCKS || "5000");
const sepoliaUsdc = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const;
const permit2Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;
const universalRouterSepolia = "0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b" as const;
const erc20TransferAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
] as const;

type Health = {
  chainId: number;
  parentEnsName: string;
  executorAddress: Address | null;
  openai: boolean;
  uniswap: boolean;
  keeperhub: {
    ok: boolean;
    status?: number;
    message?: string;
    error?: string;
    result?: { walletAddress?: Address };
  };
  contracts: Record<string, Address>;
};

type DeployStep = {
  label: string;
  status: "idle" | "active" | "done" | "error";
  hash?: Hex;
  detail?: string;
};

type CreatedAgent = {
  ensName: string;
  smartWallet: Address;
  owner: Address;
  specialty: string;
  fee: string;
  preferredToken: string;
  endpoint: string;
  records: Record<string, string>;
  identityTx?: Hex;
  factoryTx?: Hex;
  registryTx?: Hex;
  ensTx?: Hex;
};

type AgentRegistrarLog = Awaited<ReturnType<NonNullable<ReturnType<typeof usePublicClient>>["getLogs"]>>[number];
type WalletActivity = {
  txHash: Hex;
  target: Address;
  value: string;
  action: string;
  detail: string;
};

type ExecutionProof = {
  agentEnsName: string;
  approval?: { keeperHubRunId?: string; txHash?: Hex } | null;
  permit?: { keeperHubRunId?: string; txHash?: Hex } | null;
  swap?: { keeperHubRunId?: string; txHash?: Hex } | null;
};

type DashboardPage = "dashboard" | "agents" | "search" | "activity" | "ens";

const initialSteps: DeployStep[] = [
  { label: "Create user-owned agent smart wallet", status: "idle" },
  { label: "Mint real ENS subname under agentos.eth", status: "idle" },
  { label: "Mint ERC-8004 identity with wallet binding", status: "idle" },
  { label: "Register agent in AgentFi registry", status: "idle" }
];

const agentSubnameRegisteredEvent = parseAbiItem(
  "event AgentSubnameRegistered(string indexed label,string ensName,bytes32 indexed node,address indexed owner,address wallet)"
);

const agentSmartWalletExecutedEvent = parseAbiItem(
  "event Executed(address indexed target,uint256 value,bytes data,bytes result)"
);

const erc20ApproveAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
] as const;

const permit2ApproveAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" }
    ],
    outputs: []
  }
] as const;

const universalRouterExecuteAbi = [
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      { name: "commands", type: "bytes" },
      { name: "inputs", type: "bytes[]" },
      { name: "deadline", type: "uint256" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      { name: "commands", type: "bytes" },
      { name: "inputs", type: "bytes[]" }
    ],
    outputs: []
  }
] as const;

const agentRecordKeys = [
  "specialty",
  "fee",
  "preferred_token",
  "endpoint",
  "model",
  "reputation",
  "tasks_done",
  "framework",
  "keeperhub",
  "wallet_type",
  "agentos.owner",
  "agentos.wallet",
  "agentos.framework",
  "agentos.lastExecutionTx",
  "agentos.lastKeeperHubRun",
  "agentos.reputation"
];

function txLink(hash?: Hex) {
  return hash ? `https://sepolia.etherscan.io/tx/${hash}` : "#";
}

function ensAppLink(name: string) {
  return `https://sepolia.app.ens.domains/${encodeURIComponent(name)}`;
}

function proofCacheKey(owner?: Address) {
  return `agentos.proofs.${owner?.toLowerCase() || "anonymous"}`;
}

function readProofCache(owner?: Address) {
  if (typeof window === "undefined") return {} as Record<string, Partial<CreatedAgent>>;
  try {
    return JSON.parse(window.localStorage.getItem(proofCacheKey(owner)) || "{}") as Record<string, Partial<CreatedAgent>>;
  } catch {
    return {} as Record<string, Partial<CreatedAgent>>;
  }
}

function writeProofCache(owner: Address | undefined, agents: CreatedAgent[]) {
  if (typeof window === "undefined") return;
  const existing = readProofCache(owner);
  const next = { ...existing };
  agents.forEach((created) => {
    next[created.ensName] = {
      factoryTx: created.factoryTx || next[created.ensName]?.factoryTx,
      ensTx: created.ensTx || next[created.ensName]?.ensTx,
      identityTx: created.identityTx || next[created.ensName]?.identityTx,
      registryTx: created.registryTx || next[created.ensName]?.registryTx
    };
  });
  window.localStorage.setItem(proofCacheKey(owner), JSON.stringify(next));
}

function displayRecordKey(key: string) {
  return key === "endpoint" ? "runtime_endpoint" : key;
}

function displayRecordValue(key: string, value: string) {
  if (key !== "endpoint") return value;
  try {
    const url = new URL(value);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return "Local runtime endpoint configured";
    }
    return `${url.origin}/...`;
  } catch {
    return "Runtime endpoint configured";
  }
}

function renderMessageText(text: string) {
  const urlPattern = /(https?:\/\/[^\s)]+)/g;
  return text.split("\n").map((line, lineIndex) => (
    <span key={`line-${lineIndex}`}>
      {line.split(urlPattern).map((part, partIndex) => {
        if (urlPattern.test(part)) {
          urlPattern.lastIndex = 0;
          return <a className="proof-link" href={part} target="_blank" rel="noreferrer" key={`${lineIndex}-${partIndex}`}>{part}</a>;
        }
        urlPattern.lastIndex = 0;
        return part;
      })}
      {lineIndex < text.split("\n").length - 1 ? <br /> : null}
    </span>
  ));
}

function shortAddress(value?: string | null) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "Not connected";
}

function cleanName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32);
}

function describeWalletActivity(target: Address, data: Hex, value: string) {
  const targetLower = target.toLowerCase();
  const valueLabel = value === "0" ? "No native ETH value" : `${value} wei native value`;

  if (targetLower === sepoliaUsdc.toLowerCase()) {
    try {
      const decoded = decodeFunctionData({ abi: erc20ApproveAbi, data });
      if (decoded.functionName === "approve") {
        const spender = decoded.args[0];
        const spenderName = spender.toLowerCase() === permit2Address.toLowerCase()
          ? "Permit2"
          : shortAddress(spender);
        return {
          action: "USDC approval for Permit2",
          detail: `Approved ${spenderName} to spend Sepolia USDC from this agent wallet`
        };
      }
    } catch {
      // Fall through to the generic target label.
    }
    return { action: "Sepolia USDC contract call", detail: valueLabel };
  }

  if (targetLower === permit2Address.toLowerCase()) {
    try {
      const decoded = decodeFunctionData({ abi: permit2ApproveAbi, data });
      if (decoded.functionName === "approve") {
        const token = decoded.args[0];
        const spender = decoded.args[1];
        const tokenName = token.toLowerCase() === sepoliaUsdc.toLowerCase() ? "USDC" : shortAddress(token);
        const spenderName = spender.toLowerCase() === universalRouterSepolia.toLowerCase()
          ? "Universal Router"
          : shortAddress(spender);
        return {
          action: "Permit2 router approval",
          detail: `Approved ${spenderName} to route ${tokenName} for this agent`
        };
      }
    } catch {
      // Fall through to the generic target label.
    }
    return { action: "Permit2 contract call", detail: valueLabel };
  }

  if (targetLower === universalRouterSepolia.toLowerCase()) {
    try {
      const decoded = decodeFunctionData({ abi: universalRouterExecuteAbi, data });
      if (decoded.functionName === "execute") {
        return {
          action: "Uniswap swap execution",
          detail: "Universal Router executed the prepared Uniswap swap calldata"
        };
      }
    } catch {
      // Fall through to the generic target label.
    }
    return { action: "Uniswap Universal Router call", detail: valueLabel };
  }

  return {
    action: `Smart-wallet call to ${shortAddress(target)}`,
    detail: valueLabel
  };
}

function updateStep(steps: DeployStep[], index: number, patch: Partial<DeployStep>) {
  return steps.map((step, i) => (i === index ? { ...step, ...patch } : step));
}

export function Dashboard() {
  const router = useRouter();
  const { address, isConnected, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: sepolia.id });
  const { switchChainAsync } = useSwitchChain();
  const [health, setHealth] = useState<Health | null>(null);
  const [, setHealthError] = useState("");
  const [agent, setAgent] = useState("");
  const [messages, setMessages] = useState([{ role: "agent", text: "Deploy or select a real ENS-named agent to start the OpenAI + Uniswap + KeeperHub runtime." }]);
  const [input, setInput] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [deployName, setDeployName] = useState("trade");
  const [specialty, setSpecialty] = useState("trading,defi,rebalancing");
  const [fee, setFee] = useState("0.001 ETH");
  const [preferredToken, setPreferredToken] = useState("USDC");
  const [deployError, setDeployError] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [deploySteps, setDeploySteps] = useState(initialSteps);
  const [createdAgents, setCreatedAgents] = useState<CreatedAgent[]>([]);
  const [discoveredAgents, setDiscoveredAgents] = useState<CreatedAgent[]>([]);
  const [page, setPage] = useState<DashboardPage>("dashboard");
  const [agentSearch, setAgentSearch] = useState("");
  const [agentSearchStatus, setAgentSearchStatus] = useState("");
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsLoadError, setAgentsLoadError] = useState("");
  const [fundEthAmount, setFundEthAmount] = useState("0.005");
  const [fundUsdcAmount, setFundUsdcAmount] = useState("1");
  const [fundStatus, setFundStatus] = useState("");
  const [authorizeStatus, setAuthorizeStatus] = useState("");
  const [authorizing, setAuthorizing] = useState(false);
  const [executionAuthorized, setExecutionAuthorized] = useState(false);
  const [agentEthBalance, setAgentEthBalance] = useState("");
  const [agentUsdcBalance, setAgentUsdcBalance] = useState("");
  const [walletActivities, setWalletActivities] = useState<WalletActivity[]>([]);
  const [walletActivityError, setWalletActivityError] = useState("");
  const [lastExecutionProof, setLastExecutionProof] = useState<ExecutionProof | null>(null);
  const [ensProofStatus, setEnsProofStatus] = useState("");

  const allAgents = useMemo(() => {
    const byName = new Map<string, CreatedAgent>();
    [...discoveredAgents, ...createdAgents].forEach((created) => byName.set(created.ensName, created));
    return [...byName.values()];
  }, [createdAgents, discoveredAgents]);

  const selectedCreatedAgent = allAgents.find((item) => item.ensName === agent) || allAgents[0];
  const selectedRecords = selectedCreatedAgent?.records || {};
  const selectedAgentLabel = selectedCreatedAgent
    ? selectedCreatedAgent.ensName.replace(`.${parentEnsName}`, "")
    : cleanName(deployName) || "agent";
  const agentName = `${cleanName(deployName) || "agent"}.${parentEnsName}`;
  const deployComplete = deploySteps.every((step) => step.status === "done");

  const metrics = useMemo(() => [
    ["Real Agents", `${createdAgents.length}`, "loaded from Sepolia logs + ENS records"],
    ["ENS Namespace", parentEnsName, "subnames resolve capabilities and wallets"],
    ["Runtime Tools", "3", "ENS discovery, Uniswap quote, KeeperHub execution"],
    ["Owner Wallet", address ? shortAddress(address) : "Connect", "new agents are owned by the connected wallet"]
  ], [address, createdAgents.length]);

  const filteredAgents = useMemo(() => {
    const query = agentSearch.trim().toLowerCase();
    if (!query) return allAgents;
    return allAgents.filter((created) => {
      const haystack = [
        created.ensName,
        created.specialty,
        created.preferredToken,
        created.fee,
        created.owner,
        created.smartWallet,
        ...Object.entries(created.records).flat()
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [agentSearch, allAgents]);

  const normalizedSearchName = (() => {
    const value = agentSearch.trim().toLowerCase();
    if (!value) return "";
    if (value.endsWith(`.${parentEnsName}`)) return value;
    if (/^[a-z0-9-]+$/.test(value)) return `${value}.${parentEnsName}`;
    return "";
  })();

  const titleByPage: Record<DashboardPage, string> = {
    dashboard: "Dashboard",
    agents: "Agent Directory",
    search: "Search Agents",
    activity: "Wallet Activity",
    ens: "ENS Records"
  };

  useEffect(() => {
    if (!isConnected || !address) router.replace("/");
  }, [address, isConnected, router]);

  async function readAgentTextRecords(ensName: string) {
    const entries = await Promise.all(agentRecordKeys.map(async (key) => {
      try {
        const value = await publicClient?.getEnsText({ name: ensName, key });
        return value ? [key, value] as const : null;
      } catch {
        return null;
      }
    }));
    return Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, string]>);
  }

  async function fetchEnsAgent(name = normalizedSearchName) {
    if (!publicClient || !name) {
      setAgentSearchStatus("Enter a valid agent name like tradedemo.agentos.eth.");
      return;
    }
    if (!name.endsWith(`.${parentEnsName}`)) {
      setAgentSearchStatus(`Only ${parentEnsName} subnames are supported in this demo.`);
      return;
    }
    setAgentSearchStatus(`Resolving ${name} from ENS records...`);
    try {
      const [resolvedAddress, records] = await Promise.all([
        publicClient.getEnsAddress({ name }),
        readAgentTextRecords(name)
      ]);
      const walletFromRecord = records["agentos.wallet"] || records.wallet || resolvedAddress;
      if (!walletFromRecord || !isAddress(walletFromRecord)) {
        setAgentSearchStatus(`${name} does not resolve to an agent wallet.`);
        return;
      }
      const ownerFromRecord = records["agentos.owner"];
      const discovered = {
        ensName: name,
        smartWallet: walletFromRecord,
        owner: ownerFromRecord && isAddress(ownerFromRecord) ? ownerFromRecord : walletFromRecord,
        specialty: records.specialty || "unknown",
        fee: records.fee || "not set",
        preferredToken: records.preferred_token || "not set",
        endpoint: records.endpoint || `${apiUrl}/agents/${name.replace(`.${parentEnsName}`, "")}/run`,
        records
      } satisfies CreatedAgent;
      setDiscoveredAgents((agents) => [discovered, ...agents.filter((created) => created.ensName !== name)]);
      setAgent(discovered.ensName);
      setAgentSearchStatus(`${name} loaded from ENS. You can inspect its records and proofs. Runtime execution requires the owner wallet.`);
    } catch (error) {
      setAgentSearchStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function loadAgentsFromChain() {
    if (!address || !publicClient) {
      setCreatedAgents([]);
      return;
    }

    setAgentsLoading(true);
    setAgentsLoadError("");
    try {
      const latestBlock = await publicClient.getBlockNumber();
      const startBlock = latestBlock > logLookbackBlocks ? latestBlock - logLookbackBlocks : 0n;
      const logs: AgentRegistrarLog[] = [];

      for (let fromBlock = startBlock; fromBlock <= latestBlock; fromBlock += logChunkSize + 1n) {
        const toBlock = fromBlock + logChunkSize > latestBlock ? latestBlock : fromBlock + logChunkSize;
        const chunk = await publicClient.getLogs({
          address: sepoliaContracts.subnameRegistrar,
          event: agentSubnameRegisteredEvent,
          args: { owner: address },
          fromBlock,
          toBlock
        });
        logs.push(...chunk);
      }

      const agents = await Promise.all(logs.reverse().map(async (log) => {
        const decoded = decodeEventLog({
          abi: agentSubnameRegistrarAbi,
          data: log.data,
          topics: log.topics
        });
        if (decoded.eventName !== "AgentSubnameRegistered") return null;
        const records = await readAgentTextRecords(decoded.args.ensName);
        return {
          ensName: decoded.args.ensName,
          smartWallet: decoded.args.wallet,
          owner: decoded.args.owner,
          specialty: records.specialty || "unknown",
          fee: records.fee || "not set",
          preferredToken: records.preferred_token || "not set",
          endpoint: records.endpoint || `${apiUrl}/agents/${decoded.args.ensName.replace(`.${parentEnsName}`, "")}/run`,
          records,
          ensTx: log.transactionHash || undefined
        } satisfies CreatedAgent;
      }));

      const cachedProofs = readProofCache(address);
      const nextAgents = (agents.filter(Boolean) as CreatedAgent[]).map((created) => {
        const cached = cachedProofs[created.ensName] || {};
        return {
          ...created,
          factoryTx: (cached.factoryTx as Hex | undefined) || created.factoryTx,
          ensTx: (cached.ensTx as Hex | undefined) || created.ensTx,
          identityTx: (cached.identityTx as Hex | undefined) || created.identityTx,
          registryTx: (cached.registryTx as Hex | undefined) || created.registryTx
        };
      });
      setCreatedAgents(nextAgents);
      if (nextAgents[0]?.ensName && !agent) {
        setAgent(nextAgents[0].ensName);
        setMessages([{ role: "agent", text: `Runtime loaded for ${nextAgents[0].ensName} from Sepolia ENS records. I can resolve ENS, request Uniswap quotes, and prepare KeeperHub execution.` }]);
      }
    } catch (error) {
      setAgentsLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setAgentsLoading(false);
    }
  }

  useEffect(() => {
    loadAgentsFromChain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, publicClient]);

  useEffect(() => {
    let cancelled = false;
    async function loadHealth() {
      try {
        const res = await fetch(`${apiUrl}/health`);
        const data = await res.json();
        if (!cancelled) setHealth(data);
      } catch (error) {
        if (!cancelled) setHealthError(error instanceof Error ? error.message : String(error));
      }
    }
    loadHealth();
    const timer = setInterval(loadHealth, 12000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function checkAuthorization() {
      setExecutionAuthorized(false);
      if (!publicClient || !selectedCreatedAgent) return;
      const executionCaller = health?.keeperhub?.result?.walletAddress && isAddress(health.keeperhub.result.walletAddress)
        ? health.keeperhub.result.walletAddress
        : health?.executorAddress;
      if (!executionCaller || !isAddress(executionCaller)) return;

      try {
        const [currentExecutor, usdcAllowed, permitAllowed, routerAllowed] = await Promise.all([
          publicClient.readContract({
            address: selectedCreatedAgent.smartWallet,
            abi: agentSmartWalletAbi,
            functionName: "executor"
          }),
          publicClient.readContract({
            address: selectedCreatedAgent.smartWallet,
            abi: agentSmartWalletAbi,
            functionName: "allowedTargets",
            args: [sepoliaUsdc]
          }),
          publicClient.readContract({
            address: selectedCreatedAgent.smartWallet,
            abi: agentSmartWalletAbi,
            functionName: "allowedTargets",
            args: [permit2Address]
          }),
          publicClient.readContract({
            address: selectedCreatedAgent.smartWallet,
            abi: agentSmartWalletAbi,
            functionName: "allowedTargets",
            args: [universalRouterSepolia]
          })
        ]);
        const ok = currentExecutor.toLowerCase() === executionCaller.toLowerCase()
          && usdcAllowed
          && permitAllowed
          && routerAllowed;
        if (!cancelled) {
          setExecutionAuthorized(ok);
          if (ok) setAuthorizeStatus("Execution authorized. KeeperHub can route confirmed swaps through this agent wallet.");
        }
      } catch {
        if (!cancelled) setExecutionAuthorized(false);
      }
    }
    checkAuthorization();
    return () => {
      cancelled = true;
    };
  }, [health, publicClient, selectedCreatedAgent]);

  useEffect(() => {
    let cancelled = false;
    async function loadWalletActivity() {
      setWalletActivityError("");
      setWalletActivities([]);
      setAgentEthBalance("");
      setAgentUsdcBalance("");
      if (!publicClient || !selectedCreatedAgent) return;

      try {
        const [ethBalance, usdcBalance, latestBlock] = await Promise.all([
          publicClient.getBalance({ address: selectedCreatedAgent.smartWallet }),
          publicClient.readContract({
            address: sepoliaUsdc,
            abi: erc20TransferAbi,
            functionName: "balanceOf",
            args: [selectedCreatedAgent.smartWallet]
          }),
          publicClient.getBlockNumber()
        ]);

        const startBlock = latestBlock > logLookbackBlocks ? latestBlock - logLookbackBlocks : 0n;
        const logs: AgentRegistrarLog[] = [];
        for (let fromBlock = startBlock; fromBlock <= latestBlock; fromBlock += logChunkSize + 1n) {
          const toBlock = fromBlock + logChunkSize > latestBlock ? latestBlock : fromBlock + logChunkSize;
          const chunk = await publicClient.getLogs({
            address: selectedCreatedAgent.smartWallet,
            event: agentSmartWalletExecutedEvent,
            fromBlock,
            toBlock
          });
          logs.push(...chunk);
        }

        const activities = logs.reverse().map((log) => {
          if (!log.transactionHash) return null;
          const decoded = decodeEventLog({
            abi: agentSmartWalletAbi,
            data: log.data,
            topics: log.topics
          });
          if (decoded.eventName !== "Executed") return null;
          const description = describeWalletActivity(
            decoded.args.target,
            decoded.args.data as Hex,
            decoded.args.value.toString()
          );
          return {
            txHash: log.transactionHash,
            target: decoded.args.target,
            value: decoded.args.value.toString(),
            action: description.action,
            detail: description.detail
          } satisfies WalletActivity;
        }).filter(Boolean) as WalletActivity[];

        if (!cancelled) {
          setAgentEthBalance(`${Number(formatEther(ethBalance)).toFixed(5)} ETH`);
          setAgentUsdcBalance(`${Number(formatUnits(usdcBalance, 6)).toFixed(4)} USDC`);
          setWalletActivities(activities);
        }
      } catch (error) {
        if (!cancelled) setWalletActivityError(error instanceof Error ? error.message : String(error));
      }
    }
    loadWalletActivity();
    const timer = setInterval(loadWalletActivity, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [publicClient, selectedCreatedAgent]);

  async function sendMessage(text = input) {
    if (!text.trim()) return;
    if (!selectedCreatedAgent) {
      setMessages((prev) => [...prev, { role: "agent", text: "Create a real agent first. The runtime is intentionally disabled until there is an ENS subname and smart wallet to operate as." }]);
      return;
    }
    const ownsSelectedAgent = createdAgents.some((created) => created.ensName === selectedCreatedAgent.ensName);
    if (!ownsSelectedAgent) {
      setMessages((prev) => [...prev, { role: "agent", text: `${selectedCreatedAgent.ensName} was discovered from ENS, but this connected wallet does not own it. You can inspect its records, wallet, and latest proofs. To execute swaps from an agent wallet, connect the owner wallet or create your own agent.` }]);
      return;
    }
    const priorMessages = messages;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);

    try {
      const res = await fetch(`${apiUrl}/agents/${selectedAgentLabel}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: text,
          walletAddress: selectedCreatedAgent?.smartWallet || address,
          history: priorMessages.slice(-8).map((msg) => ({
            role: msg.role,
            text: msg.text
          }))
        })
      });
      const data = await res.json();
      if (data.executionProof?.swap?.txHash) {
        setLastExecutionProof(data.executionProof as ExecutionProof);
        setEnsProofStatus("Swap proof is ready. Write it to ENS so the agent name carries public execution memory.");
      }
      setMessages((prev) => [
        ...prev,
        {
          role: "tool",
          text: data.toolCallsMade?.length ? `Tools used: ${data.toolCallsMade.join(", ")}` : "OpenAI tool runtime"
        },
        { role: "agent", text: data.response || JSON.stringify(data, null, 2) }
      ]);
    } catch (error) {
      setMessages((prev) => [...prev, { role: "agent", text: error instanceof Error ? error.message : String(error) }]);
    }
  }

  function selectAgent(next: CreatedAgent) {
    setAgent(next.ensName);
    setFundStatus("");
    setAuthorizeStatus("");
    setEnsProofStatus("");
    setLastExecutionProof(null);
    setExecutionAuthorized(false);
    setMessages([{ role: "agent", text: `I am ${next.ensName}. My ENS records say specialty=${next.specialty}, fee=${next.fee}, preferred token=${next.preferredToken}.` }]);
  }

  async function ensureSepolia() {
    if (chainId !== sepolia.id) await switchChainAsync({ chainId: sepolia.id });
  }

  async function fundAgentEth() {
    if (!walletClient || !publicClient || !selectedCreatedAgent) return;
    setFundStatus("Waiting for wallet signature to fund agent with Sepolia ETH...");
    try {
      await ensureSepolia();
      const hash = await walletClient.sendTransaction({
        to: selectedCreatedAgent.smartWallet,
        value: parseEther(fundEthAmount)
      });
      setFundStatus(`ETH funding submitted: ${hash}`);
      await publicClient.waitForTransactionReceipt({ hash });
      setFundStatus(`ETH funding confirmed: ${hash}`);
    } catch (error) {
      setFundStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function fundAgentUsdc() {
    if (!walletClient || !publicClient || !selectedCreatedAgent) return;
    setFundStatus("Waiting for wallet signature to transfer Sepolia USDC...");
    try {
      await ensureSepolia();
      const hash = await walletClient.writeContract({
        address: sepoliaUsdc,
        abi: erc20TransferAbi,
        functionName: "transfer",
        args: [selectedCreatedAgent.smartWallet, parseUnits(fundUsdcAmount, 6)]
      });
      setFundStatus(`USDC funding submitted: ${hash}`);
      await publicClient.waitForTransactionReceipt({ hash });
      setFundStatus(`USDC funding confirmed: ${hash}`);
    } catch (error) {
      setFundStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function authorizeExecution() {
    if (!walletClient || !publicClient || !selectedCreatedAgent) return;
    if (executionAuthorized) {
      setAuthorizeStatus("Already authorized. No more wallet signatures needed for this agent unless you change executor or contracts.");
      return;
    }
    const executionCaller = health?.keeperhub?.result?.walletAddress && isAddress(health.keeperhub.result.walletAddress)
      ? health.keeperhub.result.walletAddress
      : health?.executorAddress;
    if (!executionCaller || !isAddress(executionCaller)) {
      setAuthorizeStatus("No KeeperHub or executor wallet is available from backend health.");
      return;
    }

    setAuthorizing(true);
    setAuthorizeStatus("Switching to Sepolia and preparing agent wallet permissions...");
    try {
      await ensureSepolia();

      setAuthorizeStatus(`Setting agent executor to ${shortAddress(executionCaller)}...`);
      const executorTx = await walletClient.writeContract({
        address: selectedCreatedAgent.smartWallet,
        abi: agentSmartWalletAbi,
        functionName: "setExecutor",
        args: [executionCaller]
      });
      await publicClient.waitForTransactionReceipt({ hash: executorTx });

      const targets = [
        ["Sepolia USDC", sepoliaUsdc],
        ["Permit2", permit2Address],
        ["Universal Router", universalRouterSepolia]
      ] as const;

      for (const [label, target] of targets) {
        setAuthorizeStatus(`Authorizing ${label} target...`);
        const tx = await walletClient.writeContract({
          address: selectedCreatedAgent.smartWallet,
          abi: agentSmartWalletAbi,
          functionName: "setAllowedTarget",
          args: [target, true]
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });
      }

      setExecutionAuthorized(true);
      setAuthorizeStatus("Execution authorized. The next confirmed quote can be routed through the agent smart wallet.");
    } catch (error) {
      setAuthorizeStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthorizing(false);
    }
  }

  async function writeExecutionProofToEns() {
    if (!walletClient || !publicClient || !selectedCreatedAgent || !lastExecutionProof?.swap?.txHash) return;
    const swapTx = lastExecutionProof.swap.txHash;
    const runId = lastExecutionProof.swap.keeperHubRunId || "";
    const currentRep = Number(selectedCreatedAgent.records.reputation || "50");
    const nextRep = String(Math.min(100, currentRep + 1));
    const node = namehash(selectedCreatedAgent.ensName);

    setEnsProofStatus("Waiting for wallet signatures to write latest execution proof into ENS text records...");
    try {
      await ensureSepolia();
      const records = [
        ["agentos.lastExecutionTx", swapTx],
        ["agentos.lastKeeperHubRun", runId],
        ["agentos.reputation", nextRep],
        ["reputation", nextRep]
      ] as const;

      for (const [key, value] of records) {
        if (!value) continue;
        const hash = await walletClient.writeContract({
          address: sepoliaContracts.resolver,
          abi: ensPublicResolverAbi,
          functionName: "setText",
          args: [node, key, value]
        });
        setEnsProofStatus(`Writing ${key} to ENS: ${hash}`);
        await publicClient.waitForTransactionReceipt({ hash });
      }

      setCreatedAgents((agents) => agents.map((created) => created.ensName === selectedCreatedAgent.ensName
        ? {
          ...created,
          records: {
            ...created.records,
            "agentos.lastExecutionTx": swapTx,
            "agentos.lastKeeperHubRun": runId,
            "agentos.reputation": nextRep,
            reputation: nextRep
          }
        }
        : created
      ));
      setEnsProofStatus(`ENS updated: ${selectedCreatedAgent.ensName} now stores the latest swap tx, KeeperHub run ID, and reputation ${nextRep}.`);
    } catch (error) {
      setEnsProofStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function deployAgent() {
    setDeployError("");
    setDeploySteps(initialSteps);

    if (!address || !isConnected) {
      setDeployError("Connect a wallet before deploying an agent.");
      return;
    }
    if (!walletClient || !publicClient) {
      setDeployError("Wallet client is not ready yet. Try again in a moment.");
      return;
    }
    const safeName = cleanName(deployName);
    if (!safeName) {
      setDeployError("Enter a lowercase agent name.");
      return;
    }
    if (chainId !== sepolia.id) {
      await switchChainAsync({ chainId: sepolia.id });
    }

    const executor = health?.executorAddress && isAddress(health.executorAddress)
      ? health.executorAddress
      : address;
    const ensName = `${safeName}.${parentEnsName}`;
    const node = namehash(ensName);
    const endpoint = `${apiUrl}/agents/${safeName}/run`;
    const agentUri = `agentfi://${ensName}`;
    const textRecords = [
      { key: "specialty", value: specialty },
      { key: "fee", value: fee },
      { key: "preferred_token", value: preferredToken },
      { key: "endpoint", value: endpoint },
      { key: "model", value: "OpenAI" },
      { key: "reputation", value: "50" },
      { key: "tasks_done", value: "0" },
      { key: "framework", value: "agentos/1.0" },
      { key: "keeperhub", value: "enabled" },
      { key: "wallet_type", value: "user-owned-smart-wallet" }
    ];
    const metadata = [
      { metadataKey: "ensName", metadataValue: stringToHex(ensName) },
      { metadataKey: "specialty", metadataValue: stringToHex(specialty) },
      { metadataKey: "fee", metadataValue: stringToHex(fee) },
      { metadataKey: "preferredToken", metadataValue: stringToHex(preferredToken) },
      { metadataKey: "endpoint", metadataValue: stringToHex(endpoint) },
      { metadataKey: "framework", metadataValue: stringToHex("agentfi-os/1.0") },
      { metadataKey: "ownerModel", metadataValue: stringToHex("connected-wallet") }
    ];

    setDeploying(true);
    try {
      setDeploySteps((steps) => updateStep(steps, 0, { status: "active" }));
      const factoryTx = await walletClient.writeContract({
        address: sepoliaContracts.factory,
        abi: agentWalletFactoryAbi,
        functionName: "createAgentWalletFor",
        args: [ensName, node, address, executor]
      });
      setDeploySteps((steps) => updateStep(steps, 0, { status: "active", hash: factoryTx }));
      const factoryReceipt = await publicClient.waitForTransactionReceipt({ hash: factoryTx });

      let smartWallet: Address | null = null;
      for (const log of factoryReceipt.logs) {
        if (log.address.toLowerCase() !== sepoliaContracts.factory.toLowerCase()) continue;
        try {
          const decoded = decodeEventLog({
            abi: agentWalletFactoryAbi,
            data: log.data,
            topics: log.topics
          });
          if (decoded.eventName === "AgentWalletCreated") {
            smartWallet = decoded.args.wallet;
            break;
          }
        } catch {
          continue;
        }
      }
      if (!smartWallet) throw new Error("Factory transaction mined, but wallet event was not found.");
      setDeploySteps((steps) => updateStep(steps, 0, {
        status: "done",
        hash: factoryTx,
        detail: `Wallet ${shortAddress(smartWallet)} owned by ${shortAddress(address)}`
      }));

      if (!sepoliaContracts.subnameRegistrar) {
        setDeploySteps((steps) => updateStep(steps, 1, {
          status: "error",
          detail: "Set NEXT_PUBLIC_AGENT_SUBNAME_REGISTRAR_ADDRESS after deploying the registrar."
        }));
        throw new Error("Agent subname registrar is not configured yet.");
      }

      setDeploySteps((steps) => updateStep(steps, 1, { status: "active" }));
      const ensTx = await walletClient.writeContract({
        address: sepoliaContracts.subnameRegistrar,
        abi: agentSubnameRegistrarAbi,
        functionName: "register",
        args: [safeName, address, smartWallet, textRecords]
      });
      setDeploySteps((steps) => updateStep(steps, 1, { status: "active", hash: ensTx }));
      await publicClient.waitForTransactionReceipt({ hash: ensTx });
      setDeploySteps((steps) => updateStep(steps, 1, {
        status: "done",
        hash: ensTx,
        detail: `${ensName} resolves to ${shortAddress(smartWallet)}`
      }));

      setDeploySteps((steps) => updateStep(steps, 2, { status: "active" }));
      const identityTx = await walletClient.writeContract({
        address: sepoliaContracts.identity,
        abi: identityRegistryAbi,
        functionName: "registerWithWallet",
        args: [agentUri, metadata, smartWallet]
      });
      setDeploySteps((steps) => updateStep(steps, 2, { status: "active", hash: identityTx }));
      await publicClient.waitForTransactionReceipt({ hash: identityTx });
      setDeploySteps((steps) => updateStep(steps, 2, {
        status: "done",
        hash: identityTx,
        detail: "ERC-8004 identity minted to connected wallet"
      }));

      setDeploySteps((steps) => updateStep(steps, 3, { status: "active" }));
      const registryTx = await walletClient.writeContract({
        address: sepoliaContracts.registry,
        abi: agentRegistryAbi,
        functionName: "registerAgent",
        args: [node, ensName, smartWallet, address]
      });
      setDeploySteps((steps) => updateStep(steps, 3, { status: "active", hash: registryTx }));
      await publicClient.waitForTransactionReceipt({ hash: registryTx });
      setDeploySteps((steps) => updateStep(steps, 3, {
        status: "done",
        hash: registryTx,
        detail: "Agent indexed for discovery"
      }));

      const records = Object.fromEntries(textRecords.map((record) => [record.key, record.value]));
      const createdAgent = {
        ensName,
        smartWallet,
        owner: address,
        specialty,
        fee,
        preferredToken,
        endpoint,
        records,
        factoryTx,
        identityTx,
        registryTx,
        ensTx
      };
      setCreatedAgents((prev) => {
        const nextAgents = [createdAgent, ...prev.filter((item) => item.ensName !== ensName)];
        writeProofCache(address, nextAgents);
        return nextAgents;
      });
      await loadAgentsFromChain();
      setAgent(ensName);
      setMessages([{ role: "agent", text: `${ensName} is live. ENS records are written and this runtime can now request quotes and prepare execution for that real agent.` }]);
    } catch (error) {
      setDeployError(error instanceof Error ? error.message : String(error));
      setDeploySteps((steps) => {
        const active = steps.findIndex((step) => step.status === "active");
        return active >= 0 ? updateStep(steps, active, { status: "error" }) : steps;
      });
    } finally {
      setDeploying(false);
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Link className="wordmark" href={isConnected ? "/dashboard" : "/"}>Agent<span>OS</span></Link>
          <div className="network-badge">Sepolia testnet</div>
        </div>
        <nav className="sidebar-nav" aria-label="Dashboard navigation">
          <div className="nav-section-label">Workspace</div>
          {[
            ["dashboard", "D", "Dashboard"],
            ["agents", "A", "Agents"],
            ["search", "S", "Search Agents"],
            ["deploy", "+", "Deploy Agent"],
            ["activity", "W", "Wallet Activity"],
            ["ens", "E", "ENS Records"]
          ].map(([key, icon, label]) => (
            <button
              className={`nav-item ${page === key ? "active" : ""}`}
              key={key}
              onClick={() => key === "deploy" ? setModalOpen(true) : setPage(key as DashboardPage)}
            >
              <span className="nav-icon" aria-hidden="true">{icon}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="wallet-pill">
            <div className="wallet-name">Connected owner</div>
            <div className="wallet-addr">{shortAddress(address)}</div>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">AgentOS workspace</p>
            <h1>{titleByPage[page]}</h1>
          </div>
          <div className="topbar-actions">
            <ConnectButton />
          </div>
        </div>

        <div className="metrics-row">
          {metrics.map(([label, value, sub]) => (
            <div className="metric-card" key={label}>
              <div className="metric-label">{label}</div>
              <div className="metric-value">{value}</div>
              <div className="metric-sub">{sub}</div>
            </div>
          ))}
        </div>

        {page === "dashboard" ? (
          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Agent runtime</p>
                  <h2>Talk to your deployed agent</h2>
                </div>
                <span className="small-badge">OpenAI tools</span>
              </div>
              <div className="agent-tabs">
                {allAgents.length === 0 ? (
                  <button className="agent-tab active" onClick={() => setModalOpen(true)}>
                    {agentsLoading ? "Loading onchain agents..." : "Create real agent"}
                  </button>
                ) : allAgents.map((created) => (
                  <button className={`agent-tab ${selectedCreatedAgent?.ensName === created.ensName ? "active" : ""}`} key={created.ensName} onClick={() => selectAgent(created)}>
                    {created.ensName}
                  </button>
                ))}
              </div>
              {agentsLoadError ? (
                <div className="notice-box">
                  Onchain agent scan is rate-limited by the current RPC. You can still deploy a new real agent; after deployment it appears here immediately.
                </div>
              ) : null}
              <div className="chat-messages" aria-live="polite">
                {messages.map((msg, idx) => (
                  <div className={`msg ${msg.role}`} key={`${msg.role}-${idx}`}>
                    <div className="msg-bubble">{renderMessageText(msg.text)}</div>
                    <div className="msg-meta">{msg.role === "user" ? "you" : selectedCreatedAgent?.ensName || "agentos"} on Sepolia</div>
                  </div>
                ))}
              </div>
              <div className="suggestions">
                {[
                  "Get a quote to swap 1 USDC to WETH",
                  `Resolve ${selectedCreatedAgent?.ensName || "my agent"} capabilities`,
                  "Show KeeperHub execution history",
                  "Prepare payment using preferred_token"
                ].map((suggestion) => (
                  <button className="suggestion-btn" key={suggestion} onClick={() => sendMessage(suggestion)}>{suggestion}</button>
                ))}
              </div>
              <div className="chat-input-row">
                <label className="sr-only" htmlFor="agent-chat-input">Message agent</label>
                <input
                  id="agent-chat-input"
                  className="chat-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  placeholder={selectedCreatedAgent ? `Message ${selectedCreatedAgent.ensName}` : "Create a real agent first"}
                  autoComplete="off"
                />
                <button className="send-btn" onClick={() => sendMessage()}>Send</button>
              </div>
            </section>

            <div className="right-column">
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">Real deployment</p>
                    <h2>Your agents</h2>
                  </div>
                  <button className="tiny-btn" onClick={() => setModalOpen(true)}>New</button>
                </div>
                {createdAgents.length === 0 ? (
                  <div className="empty-state">
                    <strong>No user agents yet.</strong>
                    <span>Deploy one with your connected wallet to create a smart wallet, ENS subname, ERC-8004 identity, and registry record.</span>
                  </div>
                ) : createdAgents.map((created) => (
                  <article className="agent-card" key={created.ensName}>
                    <a className="agent-ens proof-link" href={ensAppLink(created.ensName)} target="_blank" rel="noreferrer">{created.ensName}</a>
                    <div className="agent-desc">Wallet {shortAddress(created.smartWallet)} owned by {shortAddress(created.owner)}</div>
                    <div className="tx-row">
                      <a href={ensAppLink(created.ensName)} target="_blank" rel="noreferrer">ENS profile</a>
                      <button className="link-button" onClick={() => { selectAgent(created); setPage("activity"); }}>Wallet activity</button>
                      {created.factoryTx ? <a href={txLink(created.factoryTx)} target="_blank" rel="noreferrer">Factory tx</a> : null}
                      {created.ensTx ? <a href={txLink(created.ensTx)} target="_blank" rel="noreferrer">ENS tx</a> : null}
                      {created.identityTx ? <a href={txLink(created.identityTx)} target="_blank" rel="noreferrer">Identity tx</a> : null}
                      {created.registryTx ? <a href={txLink(created.registryTx)} target="_blank" rel="noreferrer">Registry tx</a> : null}
                    </div>
                  </article>
                ))}
              </section>

              <section className="panel">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">How agents are used</p>
                    <h2>Discovery model</h2>
                  </div>
                </div>
                <div className="empty-state">
                  <strong>Anyone can discover your agent by ENS name.</strong>
                  <span>Resolve your deployed name.agentos.eth, read its text records, inspect specialty and runtime endpoint, then call or pay that agent using its preferred token.</span>
                </div>
              </section>
            </div>
          </div>
        ) : null}

        {page === "agents" ? (
          <section className="content-panel">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Public agent directory</p>
                  <h2>Agents discoverable through ENS</h2>
                </div>
                <button className="tiny-btn" onClick={() => setModalOpen(true)}>New</button>
              </div>
              <div className="directory-grid">
                {createdAgents.length === 0 ? (
                  <div className="empty-state directory-empty">
                    <strong>No real agents yet.</strong>
                    <span>Click Deploy Agent to create the first wallet-owned ENS agent. No seeded demo agents are shown here.</span>
                    <button className="secondary-inline" onClick={() => setModalOpen(true)}>Deploy Agent</button>
                  </div>
                ) : null}
                {createdAgents.map((created) => (
                  <article className="agent-directory-card" key={created.ensName}>
                    <a className="agent-ens proof-link" href={ensAppLink(created.ensName)} target="_blank" rel="noreferrer">{created.ensName}</a>
                    <p>Wallet {shortAddress(created.smartWallet)} is owned by {shortAddress(created.owner)}.</p>
                    <div className="agent-tags">
                      <span className="tag tag-active">user-owned</span>
                      <span className="tag tag-ens">ENS minted</span>
                      <span className="tag tag-res">{created.preferredToken}</span>
                    </div>
                    <button className="secondary-inline" onClick={() => { selectAgent(created); setPage("dashboard"); }}>Open runtime</button>
                    <div className="tx-row">
                      <a href={ensAppLink(created.ensName)} target="_blank" rel="noreferrer">ENS profile</a>
                      {created.ensTx ? <a href={txLink(created.ensTx)} target="_blank" rel="noreferrer">ENS tx</a> : null}
                      {created.registryTx ? <a href={txLink(created.registryTx)} target="_blank" rel="noreferrer">Registry tx</a> : null}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {page === "search" ? (
          <section className="content-panel">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">ENS discovery</p>
                  <h2>Search agentos.eth agents</h2>
                </div>
                <a className="tiny-btn" href="https://sepolia.app.ens.domains/agentos.eth?tab=subnames" target="_blank" rel="noreferrer">Subnames</a>
              </div>
              <div className="search-panel">
                <label className="field-label" htmlFor="agent-search">Search by ENS name, specialty, token, wallet, or text record</label>
                <div className="search-row">
                  <input
                    id="agent-search"
                    className="field"
                    value={agentSearch}
                    onChange={(event) => setAgentSearch(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && fetchEnsAgent()}
                    placeholder="tradedemo, trading, USDC, wallet address..."
                    autoComplete="off"
                  />
                  {normalizedSearchName ? (
                    <a className="secondary-inline" href={ensAppLink(normalizedSearchName)} target="_blank" rel="noreferrer">Open ENS</a>
                  ) : null}
                  <button className="secondary-inline" onClick={() => fetchEnsAgent()} disabled={!normalizedSearchName}>Fetch Agent</button>
                </div>
                <div className="notice-box">
                  Public discovery is ENS-first. Type a name like <code>tradedemo.agentos.eth</code>, fetch its text records, and inspect what the agent is built for. Swap execution stays tied to the agent owner wallet.
                </div>
                {agentSearchStatus ? <div className="notice-box">{agentSearchStatus}</div> : null}
              </div>
              <div className="directory-grid">
                {filteredAgents.length === 0 ? (
                  <div className="empty-state directory-empty">
                    <strong>{allAgents.length === 0 ? "No agents loaded yet." : "No matching loaded agents."}</strong>
                    <span>Type an exact agentos.eth name and click Fetch Agent, or open the public agentos.eth subnames page to inspect names created by other wallets.</span>
                    <div className="tx-row">
                      <button className="secondary-inline" onClick={() => setModalOpen(true)}>Deploy Agent</button>
                      <a className="secondary-inline" href="https://sepolia.app.ens.domains/agentos.eth?tab=subnames" target="_blank" rel="noreferrer">Open Subnames</a>
                    </div>
                  </div>
                ) : null}
                {filteredAgents.map((created) => (
                  <article className="agent-directory-card" key={created.ensName}>
                    <a className="agent-ens proof-link" href={ensAppLink(created.ensName)} target="_blank" rel="noreferrer">{created.ensName}</a>
                    <p>{created.specialty} agent. Fee {created.fee}. Preferred token {created.preferredToken}.</p>
                    <div className="agent-tags">
                      <span className="tag tag-active">ENS discoverable</span>
                      <span className="tag tag-ens">{created.preferredToken}</span>
                      <span className="tag tag-res">rep {created.records.reputation || created.records["agentos.reputation"] || "new"}</span>
                    </div>
                    {createdAgents.some((owned) => owned.ensName === created.ensName) ? (
                      <button className="secondary-inline" onClick={() => { selectAgent(created); setPage("dashboard"); }}>Use in runtime</button>
                    ) : (
                      <button className="secondary-inline" onClick={() => { selectAgent(created); setPage("ens"); }}>Inspect records</button>
                    )}
                    <div className="tx-row">
                      <a href={ensAppLink(created.ensName)} target="_blank" rel="noreferrer">ENS profile</a>
                      <a href={`https://sepolia.etherscan.io/address/${created.smartWallet}`} target="_blank" rel="noreferrer">Agent wallet</a>
                      {created.records["agentos.lastExecutionTx"] ? <a href={txLink(created.records["agentos.lastExecutionTx"] as `0x${string}`)} target="_blank" rel="noreferrer">Latest tx</a> : null}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {page === "activity" ? (
          <section className="content-panel">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Autonomous wallet controls</p>
                  <h2>Agent wallet activity</h2>
                </div>
                {selectedCreatedAgent ? (
                  <a className="tiny-btn" href={`https://sepolia.etherscan.io/address/${selectedCreatedAgent.smartWallet}`} target="_blank" rel="noreferrer">Open wallet</a>
                ) : null}
              </div>

              {selectedCreatedAgent ? (
                <>
                  <div className="records records-wide">
                    <div className="record-title">
                      <a className="proof-link" href={ensAppLink(selectedCreatedAgent.ensName)} target="_blank" rel="noreferrer">{selectedCreatedAgent.ensName}</a>
                    </div>
                    <div className="record-row">
                      <span className="record-key">agent_wallet</span>
                      <span className="record-val">
                        <a className="proof-link" href={`https://sepolia.etherscan.io/address/${selectedCreatedAgent.smartWallet}`} target="_blank" rel="noreferrer">{selectedCreatedAgent.smartWallet}</a>
                      </span>
                    </div>
                    <div className="record-row">
                      <span className="record-key">owner</span>
                      <span className="record-val">{selectedCreatedAgent.owner}</span>
                    </div>
                    <div className="record-row">
                      <span className="record-key">ens_profile</span>
                      <span className="record-val"><a className="proof-link" href={ensAppLink(selectedCreatedAgent.ensName)} target="_blank" rel="noreferrer">Open on Sepolia ENS</a></span>
                    </div>
                    <div className="record-row">
                      <span className="record-key">eth_balance</span>
                      <span className="record-val">{agentEthBalance || "Loading..."}</span>
                    </div>
                    <div className="record-row">
                      <span className="record-key">usdc_balance</span>
                      <span className="record-val">{agentUsdcBalance || "Loading..."}</span>
                    </div>
                  </div>

                  <div className="activity">
                    <div className="act-title">Fund Agent Wallet</div>
                    <div className="act-desc">Send Sepolia ETH for gas or Sepolia USDC for the demo swap path. Funds move from the connected owner wallet to the selected agent smart wallet.</div>
                    <div className="fund-grid">
                      <label>
                        <span>Sepolia ETH</span>
                        <input className="field" value={fundEthAmount} onChange={(e) => setFundEthAmount(e.target.value)} inputMode="decimal" />
                      </label>
                      <button className="secondary-inline" onClick={fundAgentEth} disabled={!walletClient}>Send ETH</button>
                      <label>
                        <span>Sepolia USDC</span>
                        <input className="field" value={fundUsdcAmount} onChange={(e) => setFundUsdcAmount(e.target.value)} inputMode="decimal" />
                      </label>
                      <button className="secondary-inline" onClick={fundAgentUsdc} disabled={!walletClient}>Send USDC</button>
                    </div>
                    {fundStatus ? <div className="notice-box">{fundStatus}</div> : null}
                  </div>

                  <div className="activity">
                    <div className="act-title">Authorize Execution</div>
                    <div className="act-desc">
                      Allows the configured execution caller to run this agent wallet against Sepolia USDC, Permit2, and the Uniswap Universal Router. This is required before a chat confirmation can route a prepared swap through the smart wallet.
                    </div>
                    <div className="auth-row">
                      <span className={`proof-chip ${executionAuthorized ? "proof-chip-ok" : ""}`}>USDC {shortAddress(sepoliaUsdc)}</span>
                      <span className={`proof-chip ${executionAuthorized ? "proof-chip-ok" : ""}`}>Permit2 {shortAddress(permit2Address)}</span>
                      <span className={`proof-chip ${executionAuthorized ? "proof-chip-ok" : ""}`}>Router {shortAddress(universalRouterSepolia)}</span>
                      <button className={`secondary-inline auth-button ${executionAuthorized ? "authorized-btn" : ""}`} onClick={authorizeExecution} disabled={!walletClient || authorizing || executionAuthorized}>
                        {executionAuthorized ? "Authorized" : authorizing ? "Authorizing..." : "Authorize KeeperHub Execution"}
                      </button>
                      {authorizeStatus ? <span className={`auth-status ${executionAuthorized ? "auth-status-ok" : ""}`}>{authorizeStatus}</span> : null}
                    </div>
                  </div>

                  <div className="activity">
                    <div className="act-title">Deployment transaction links</div>
                    <div className="act-desc">These links prove the selected agent was created, named, given an ERC-8004 identity, and registered for discovery.</div>
                    <div className="tx-row">
                      {selectedCreatedAgent.factoryTx ? <a href={txLink(selectedCreatedAgent.factoryTx)} target="_blank" rel="noreferrer">Factory wallet tx</a> : null}
                      {selectedCreatedAgent.ensTx ? <a href={txLink(selectedCreatedAgent.ensTx)} target="_blank" rel="noreferrer">ENS registration tx</a> : null}
                      {selectedCreatedAgent.identityTx ? <a href={txLink(selectedCreatedAgent.identityTx)} target="_blank" rel="noreferrer">ERC-8004 identity tx</a> : null}
                      {selectedCreatedAgent.registryTx ? <a href={txLink(selectedCreatedAgent.registryTx)} target="_blank" rel="noreferrer">Registry tx</a> : null}
                    </div>
                    {!selectedCreatedAgent.factoryTx && !selectedCreatedAgent.ensTx && !selectedCreatedAgent.identityTx && !selectedCreatedAgent.registryTx ? (
                      <div className="notice-box">No deployment proof hashes are cached for this browser session. Deploy a fresh agent to capture all four links here.</div>
                    ) : null}
                  </div>

                  <div className="activity">
                    <div className="act-title">Agent wallet transaction links</div>
                    <div className="act-desc">Live transactions emitted by this smart wallet when KeeperHub or the executor calls AgentSmartWallet.execute.</div>
                    {walletActivityError ? <div className="notice-box">{walletActivityError}</div> : null}
                    {walletActivities.length > 0 ? (
                      <div className="activity-list">
                          {walletActivities.map((item) => (
                            <div className="activity-row" key={item.txHash}>
                              <div>
                                <strong>{item.action}</strong>
                                <span>{item.detail}</span>
                                <small>Target {shortAddress(item.target)}</small>
                              </div>
                              <a className="proof-link" href={txLink(item.txHash)} target="_blank" rel="noreferrer">Open tx</a>
                            </div>
                        ))}
                      </div>
                    ) : (
                      <div className="notice-box">No AgentSmartWallet.execute transactions found in the current log window yet. Run a confirmed swap after funding and authorization to populate this list.</div>
                    )}
                  </div>

                  <div className="activity">
                    <div className="act-title">ENS execution memory</div>
                    <div className="act-desc">
                      Write the latest successful swap proof back to ENS so anyone resolving this agent can see its last transaction, KeeperHub run ID, and updated reputation.
                    </div>
                    <div className="proof-grid">
                      <div>
                        <span>Last swap tx</span>
                        {lastExecutionProof?.swap?.txHash ? (
                          <a className="proof-link" href={txLink(lastExecutionProof.swap.txHash)} target="_blank" rel="noreferrer">{shortAddress(lastExecutionProof.swap.txHash)}</a>
                        ) : (
                          <strong>Run a swap first</strong>
                        )}
                      </div>
                      <div>
                        <span>KeeperHub run</span>
                        <strong>{lastExecutionProof?.swap?.keeperHubRunId || "Not ready"}</strong>
                      </div>
                      <div>
                        <span>Next reputation</span>
                        <strong>{Math.min(100, Number(selectedCreatedAgent.records.reputation || "50") + 1)}</strong>
                      </div>
                    </div>
                    <button
                      className="secondary-inline"
                      onClick={writeExecutionProofToEns}
                      disabled={!walletClient || !lastExecutionProof?.swap?.txHash}
                    >
                      Write Proof to ENS
                    </button>
                    {ensProofStatus ? <div className="notice-box">{ensProofStatus}</div> : null}
                  </div>
                </>
              ) : (
                <div className="empty-state directory-empty">
                  <strong>No selected agent wallet.</strong>
                  <span>Deploy or select a real ENS-named agent first, then fund its smart wallet here.</span>
                  <button className="secondary-inline" onClick={() => setModalOpen(true)}>Deploy Agent</button>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {page === "ens" ? (
          <section className="content-panel">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">ENS resolver data</p>
                  <h2>Capability text records</h2>
                </div>
              </div>
              {createdAgents.length > 0 ? (
                <select className="select records-select" value={selectedCreatedAgent?.ensName || ""} onChange={(e) => setAgent(e.target.value)} aria-label="Select deployed agent">
                  {createdAgents.map((created) => (
                    <option value={created.ensName} key={created.ensName}>{created.ensName}</option>
                  ))}
                </select>
              ) : null}
              <div className="records records-wide">
                <div className="record-title">
                  {selectedCreatedAgent ? (
                    <a className="proof-link" href={ensAppLink(selectedCreatedAgent.ensName)} target="_blank" rel="noreferrer">{selectedCreatedAgent.ensName}</a>
                  ) : `No ${parentEnsName} agent deployed yet`}
                </div>
                {Object.entries(selectedRecords).length > 0 ? Object.entries(selectedRecords).map(([key, value]) => (
                  <div className="record-row" key={key}>
                    <span className="record-key">{displayRecordKey(key)}</span>
                    <span className="record-val" title={key === "endpoint" ? value : undefined}>{displayRecordValue(key, value)}</span>
                  </div>
                )) : <div className="empty-state"><strong>No records yet.</strong><span>Deploy an agent to write real ENS text records.</span></div>}
              </div>
              <div className="empty-state">
                <strong>How the orchestrator chooses agents</strong>
                <span>The orchestrator resolves ENS, reads specialty, fee, runtime_endpoint, preferred_token, and reputation, then routes the task to the matching agent. Research tasks go to research agents; swap and payment tasks go to trade agents.</span>
              </div>
            </div>
          </section>
        ) : null}
      </main>

      <div className={`modal-backdrop ${modalOpen ? "open" : ""}`} onClick={(e) => e.currentTarget === e.target && !deploying && setModalOpen(false)}>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="deploy-title">
          <div className="modal-head">
            <div>
              <p className="eyebrow">Wallet-signed deployment</p>
              <h2 id="deploy-title">{deployComplete ? "Agent Ready" : "Create Agent"}</h2>
            </div>
            <button className="icon-btn" onClick={() => setModalOpen(false)} disabled={deploying} aria-label="Close deploy dialog">x</button>
          </div>
          <div className="modal-body">
            <div className="form-grid">
              <label>
                <span>Agent name</span>
                <input className="field" value={deployName} onChange={(e) => setDeployName(cleanName(e.target.value))} placeholder="trade" autoComplete="off" />
              </label>
              <label>
                <span>Preferred token</span>
                <select className="select" value={preferredToken} onChange={(e) => setPreferredToken(e.target.value)}>
                  <option>USDC</option>
                  <option>ETH</option>
                  <option>WETH</option>
                </select>
              </label>
            </div>
            <label>
              <span>Specialty</span>
              <input className="field" value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="trading,defi,rebalancing" autoComplete="off" />
            </label>
            <label>
              <span>Fee</span>
              <input className="field" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0.001 ETH" autoComplete="off" />
            </label>
            <div className="ens-preview">
              <span>Agent name</span>
              <strong>{agentName}</strong>
            </div>
            <div className="owner-preview">
              <span>Smart wallet owner</span>
              <strong>{shortAddress(address)}</strong>
            </div>
            <div className="deploy-steps">
              {deploySteps.map((step) => (
                <div className={`deploy-step ${step.status}`} key={step.label}>
                  <span className="step-dot" />
                  <div>
                    <strong>{step.label}</strong>
                    {step.detail ? <small>{step.detail}</small> : null}
                    {step.hash ? <a href={txLink(step.hash)} target="_blank" rel="noreferrer">View transaction</a> : null}
                  </div>
                </div>
              ))}
            </div>
            {deployError ? <div className="error-box">{deployError}</div> : null}
            {deployComplete ? (
              <div className="notice-box">
                Agent deployed successfully. Close this window and use the runtime for {agent || agentName}.
              </div>
            ) : null}
          </div>
          <div className="modal-footer">
            {deployComplete ? (
              <button className="btn-deploy" onClick={() => setModalOpen(false)}>
                Use agent
              </button>
            ) : (
              <>
                <button className="btn-cancel" onClick={() => setModalOpen(false)} disabled={deploying}>Cancel</button>
                <button className="btn-deploy" onClick={deployAgent} disabled={deploying || !isConnected}>
                  {deploying ? "Deploying..." : isConnected ? "Sign and deploy" : "Connect wallet first"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
