"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  decodeEventLog,
  isAddress,
  namehash,
  stringToHex,
  type Address,
  type Hex
} from "viem";
import { sepolia } from "wagmi/chains";
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import {
  agentRegistryAbi,
  agentSubnameRegistrarAbi,
  agentWalletFactoryAbi,
  identityRegistryAbi,
  sepoliaContracts
} from "../lib/contracts";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const parentEnsName = process.env.NEXT_PUBLIC_PARENT_ENS_NAME || "agentos.eth";

type Health = {
  chainId: number;
  parentEnsName: string;
  executorAddress: Address | null;
  openai: boolean;
  uniswap: boolean;
  keeperhub: { ok: boolean; status?: number; message?: string };
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
  identityTx: Hex;
  factoryTx: Hex;
  registryTx: Hex;
  ensTx?: Hex;
};

type DashboardPage = "dashboard" | "agents" | "executions" | "ens";

const initialSteps: DeployStep[] = [
  { label: "Create user-owned agent smart wallet", status: "idle" },
  { label: "Mint real ENS subname under agentos.eth", status: "idle" },
  { label: "Mint ERC-8004 identity with wallet binding", status: "idle" },
  { label: "Register agent in AgentFi registry", status: "idle" }
];

function txLink(hash?: Hex) {
  return hash ? `https://sepolia.etherscan.io/tx/${hash}` : "#";
}

function shortAddress(value?: string | null) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "Not connected";
}

function cleanName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32);
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
  const [healthError, setHealthError] = useState("");
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
  const [page, setPage] = useState<DashboardPage>("dashboard");
  const [storageReady, setStorageReady] = useState(false);

  const selectedCreatedAgent = createdAgents.find((item) => item.ensName === agent) || createdAgents[0];
  const selectedRecords = selectedCreatedAgent?.records || {};
  const selectedAgentLabel = selectedCreatedAgent
    ? selectedCreatedAgent.ensName.replace(`.${parentEnsName}`, "")
    : cleanName(deployName) || "agent";
  const agentName = `${cleanName(deployName) || "agent"}.${parentEnsName}`;

  const metrics = useMemo(() => [
    ["Real Agents", `${createdAgents.length}`, "wallet-owned deployments in this browser"],
    ["ENS Namespace", parentEnsName, "subnames resolve capabilities and wallets"],
    ["Runtime Tools", "3", "ENS discovery, Uniswap quote, KeeperHub execution"],
    ["Owner Wallet", address ? shortAddress(address) : "Connect", "new agents are owned by the connected wallet"]
  ], [address, createdAgents.length]);

  const titleByPage: Record<DashboardPage, string> = {
    dashboard: "Dashboard",
    agents: "Agent Directory",
    executions: "Execution Feed",
    ens: "ENS Records"
  };

  useEffect(() => {
    if (!isConnected) router.push("/");
  }, [isConnected, router]);

  useEffect(() => {
    const saved = window.localStorage.getItem("agentos.createdAgents");
    if (!saved) {
      setStorageReady(true);
      return;
    }
    try {
      const parsed = JSON.parse(saved) as CreatedAgent[];
      setCreatedAgents(parsed);
      if (parsed[0]?.ensName) {
        setAgent(parsed[0].ensName);
        setMessages([{ role: "agent", text: `Runtime loaded for ${parsed[0].ensName}. I can resolve ENS records, request Uniswap quotes, and prepare KeeperHub execution.` }]);
      }
    } catch {
      window.localStorage.removeItem("agentos.createdAgents");
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem("agentos.createdAgents", JSON.stringify(createdAgents));
  }, [createdAgents, storageReady]);

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

  async function sendMessage(text = input) {
    if (!text.trim()) return;
    if (!selectedCreatedAgent) {
      setMessages((prev) => [...prev, { role: "agent", text: "Create a real agent first. The runtime is intentionally disabled until there is an ENS subname and smart wallet to operate as." }]);
      return;
    }
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);

    try {
      const res = await fetch(`${apiUrl}/agents/${selectedAgentLabel}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, walletAddress: address })
      });
      const data = await res.json();
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
    setMessages([{ role: "agent", text: `I am ${next.ensName}. My ENS records say specialty=${next.specialty}, fee=${next.fee}, preferred token=${next.preferredToken}.` }]);
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
      setCreatedAgents((prev) => [{
        ...createdAgent
      }, ...prev]);
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
            ["deploy", "+", "Deploy Agent"],
            ["executions", "X", "Executions"],
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
          <div className="nav-section-label">AgentOS</div>
          <button className="nav-item" onClick={() => setPage("agents")}>
            <span className="nav-icon" aria-hidden="true">S</span>
            Search agents
          </button>
          <button className="nav-item" onClick={() => setPage("executions")}>
            <span className="nav-icon" aria-hidden="true">R</span>
            Runtime logs
          </button>
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
                {createdAgents.length === 0 ? (
                  <button className="agent-tab active" onClick={() => setModalOpen(true)}>
                    Create real agent
                  </button>
                ) : createdAgents.map((created) => (
                  <button className={`agent-tab ${selectedCreatedAgent?.ensName === created.ensName ? "active" : ""}`} key={created.registryTx} onClick={() => selectAgent(created)}>
                    {created.ensName}
                  </button>
                ))}
              </div>
              <div className="chat-messages" aria-live="polite">
                {messages.map((msg, idx) => (
                  <div className={`msg ${msg.role}`} key={`${msg.role}-${idx}`}>
                    <div className="msg-bubble">{msg.text}</div>
                    <div className="msg-meta">{msg.role === "user" ? "you" : selectedCreatedAgent?.ensName || "agentos"} on Sepolia</div>
                  </div>
                ))}
              </div>
              <div className="suggestions">
                {[
                  "Get a quote to swap 0.01 ETH to USDC",
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
                  <article className="agent-card" key={created.registryTx}>
                    <div className="agent-ens">{created.ensName}</div>
                    <div className="agent-desc">Wallet {shortAddress(created.smartWallet)} owned by {shortAddress(created.owner)}</div>
                    <div className="tx-row">
                      <a href={txLink(created.factoryTx)} target="_blank" rel="noreferrer">Factory tx</a>
                      {created.ensTx ? <a href={txLink(created.ensTx)} target="_blank" rel="noreferrer">ENS tx</a> : null}
                      <a href={txLink(created.identityTx)} target="_blank" rel="noreferrer">Identity tx</a>
                      <a href={txLink(created.registryTx)} target="_blank" rel="noreferrer">Registry tx</a>
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
                  <span>Resolve your deployed name.agentos.eth, read its text records, inspect specialty and endpoint, then call or pay that agent using its preferred token.</span>
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
                  <article className="agent-directory-card" key={created.registryTx}>
                    <div className="agent-ens">{created.ensName}</div>
                    <p>Wallet {shortAddress(created.smartWallet)} is owned by {shortAddress(created.owner)}.</p>
                    <div className="agent-tags">
                      <span className="tag tag-active">user-owned</span>
                      <span className="tag tag-ens">ENS minted</span>
                      <span className="tag tag-res">{created.preferredToken}</span>
                    </div>
                    <button className="secondary-inline" onClick={() => { selectAgent(created); setPage("dashboard"); }}>Open runtime</button>
                    <div className="tx-row">
                      {created.ensTx ? <a href={txLink(created.ensTx)} target="_blank" rel="noreferrer">ENS tx</a> : null}
                      <a href={txLink(created.registryTx)} target="_blank" rel="noreferrer">Registry tx</a>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {page === "executions" ? (
          <section className="content-panel">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Execution feed</p>
                  <h2>Uniswap and KeeperHub runtime</h2>
                </div>
              </div>
              {healthError ? <div className="error-box">{healthError}</div> : null}
              {[
                ["Uniswap quote", "Live agent requests call the backend Trading API tool before swap preparation.", health?.uniswap ? "configured" : "needs API key"],
                ["KeeperHub route", "Prepared transactions can be submitted to KeeperHub Direct Execution for retries and audit trails.", health?.keeperhub?.ok ? "authenticated" : health?.keeperhub?.message || "checking"],
                ["Owner model", "Agent smart wallets are deployed for the connected wallet owner, not a server deployer key.", address ? shortAddress(address) : "connect wallet"],
                ["Registry proof", "Successful deployments write factory, ENS, identity, and registry transaction hashes.", `${createdAgents.length} user agents`]
              ].map(([title, desc, status]) => (
                <div className="activity" key={title}>
                  <div className="act-title">{title}</div>
                  <div className="act-desc">{desc}</div>
                  <div className="act-meta"><span>{status}</span></div>
                </div>
              ))}
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
                    <option value={created.ensName} key={created.registryTx}>{created.ensName}</option>
                  ))}
                </select>
              ) : null}
              <div className="records records-wide">
                <div className="record-title">{selectedCreatedAgent?.ensName || `No ${parentEnsName} agent deployed yet`}</div>
                {Object.entries(selectedRecords).length > 0 ? Object.entries(selectedRecords).map(([key, value]) => (
                  <div className="record-row" key={key}>
                    <span className="record-key">{key}</span>
                    <span className="record-val">{value}</span>
                  </div>
                )) : <div className="empty-state"><strong>No records yet.</strong><span>Deploy an agent to write real ENS text records.</span></div>}
              </div>
              <div className="empty-state">
                <strong>How the orchestrator chooses agents</strong>
                <span>The orchestrator resolves ENS, reads specialty, fee, endpoint, preferred_token, and reputation, then routes the task to the matching agent. Research tasks go to research agents; swap and payment tasks go to trade agents.</span>
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
              <h2 id="deploy-title">Create Agent</h2>
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
          </div>
          <div className="modal-footer">
            <button className="btn-cancel" onClick={() => setModalOpen(false)} disabled={deploying}>Cancel</button>
            <button className="btn-deploy" onClick={deployAgent} disabled={deploying || !isConnected}>
              {deploying ? "Deploying..." : isConnected ? "Sign and deploy" : "Connect wallet first"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
