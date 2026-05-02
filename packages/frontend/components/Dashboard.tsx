"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useMemo, useState } from "react";
import { useAccount } from "wagmi";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const ensData = {
  trade: {
    specialty: "trading,defi,rebalancing",
    fee: "0.001 ETH",
    chains: "[11155111]",
    endpoint: "https://api.agentfi.io/agents/trade",
    preferred_token: "USDC",
    model: "OpenAI",
    reputation: "78",
    tasks_done: "6",
    framework: "agentfi-os/1.0",
    wallet_type: "smart-wallet"
  },
  research: {
    specialty: "research,analysis,defi-data",
    fee: "0.001 ETH",
    chains: "[11155111]",
    endpoint: "https://api.agentfi.io/agents/research",
    preferred_token: "USDC",
    model: "OpenAI",
    reputation: "91",
    tasks_done: "12",
    framework: "agentfi-os/1.0",
    wallet_type: "smart-wallet"
  },
  orchestrate: {
    specialty: "orchestration,multi-agent,coordination",
    fee: "0.002 ETH",
    chains: "[11155111]",
    endpoint: "https://api.agentfi.io/agents/orchestrate",
    preferred_token: "ETH",
    model: "OpenAI",
    reputation: "65",
    tasks_done: "4",
    framework: "agentfi-os/1.0",
    wallet_type: "smart-wallet"
  }
} as const;

type AgentKey = keyof typeof ensData;

const greetings: Record<AgentKey, string> = {
  trade: "I'm trade.agentos.eth, your onchain trading agent. I can get Uniswap quotes, prepare swaps through KeeperHub, pay other agents, and show execution history.",
  research: "I'm research.agentos.eth, your DeFi research agent. Other agents discover me through ENS and pay me in USDC via Uniswap routing.",
  orchestrate: "I'm orchestrate.agentos.eth, the multi-agent orchestrator. I resolve agents via ENS, read their capabilities, hire them, and pay them through Uniswap."
};

export function Dashboard() {
  const { address } = useAccount();
  const [agent, setAgent] = useState<AgentKey>("trade");
  const [messages, setMessages] = useState([{ role: "agent", text: greetings.trade }]);
  const [input, setInput] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [deployName, setDeployName] = useState("");
  const records = ensData[agent];

  const metrics = useMemo(() => [
    ["Active Agents", "3", "under agentos.eth"],
    ["Swaps Executed", "18", "via Uniswap API"],
    ["KH Executions", "24", "full audit trail"],
    ["ENS Records", "33", "capabilities + reputation"]
  ], []);

  async function sendMessage(text = input) {
    if (!text.trim()) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);

    try {
      const res = await fetch(`${apiUrl}/agents/${agent}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, walletAddress: address })
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "tool", text: data.toolCallsMade?.length ? `Tools: ${data.toolCallsMade.join(", ")}` : "OpenAI agent response" },
        { role: "agent", text: data.response || JSON.stringify(data, null, 2) }
      ]);
    } catch (error) {
      setMessages((prev) => [...prev, { role: "agent", text: error instanceof Error ? error.message : String(error) }]);
    }
  }

  function selectAgent(next: AgentKey) {
    setAgent(next);
    setMessages([{ role: "agent", text: greetings[next] }]);
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="wordmark">AgentFi<span>OS</span></div>
          <div className="network-badge">● Sepolia</div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section-label">Main</div>
          {["Dashboard", "Agents", "Chat", "Swap", "Deploy Agent", "Executions", "ENS Records"].map((item, idx) => (
            <button className={`nav-item ${idx === 0 ? "active" : ""}`} key={item} onClick={() => item === "Deploy Agent" && setModalOpen(true)}>
              <span className="nav-icon">{["⌘","◎","✦","◐","+","⚙","◇"][idx]}</span>{item}
            </button>
          ))}
          <div className="nav-section-label">Docs</div>
          <a className="nav-item" href="https://docs.keeperhub.com" target="_blank">⚙ KeeperHub</a>
          <a className="nav-item" href="https://developers.uniswap.org" target="_blank">🦄 Uniswap API</a>
          <a className="nav-item" href="https://docs.ens.domains" target="_blank">◇ ENS Docs</a>
        </nav>
        <div className="sidebar-bottom">
          <div className="wallet-pill">
            <div className="wallet-name">agentos.eth</div>
            <div className="wallet-addr">{address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Connect wallet"}</div>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <h1>Dashboard</h1>
            <div className="status-row">
              <span className="status-pill">KeeperHub: Connected</span>
              <span className="status-pill">Uniswap API: Active</span>
              <span className="status-pill">OpenAI: Tool runtime</span>
            </div>
          </div>
          <div className="status-row">
            <ConnectButton />
            <button className="primary-btn" onClick={() => setModalOpen(true)}>+ Deploy Agent</button>
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

        <div className="dashboard-grid">
          <section className="panel">
            <h2>Agent Chat</h2>
            <div className="agent-tabs">
              {(["trade", "research", "orchestrate"] as AgentKey[]).map((key) => (
                <button className={`agent-tab ${agent === key ? "active" : ""}`} key={key} onClick={() => selectAgent(key)}>
                  {key}.agentos.eth
                </button>
              ))}
            </div>
            <div className="chat-messages">
              {messages.map((msg, idx) => (
                <div className={`msg ${msg.role}`} key={idx}>
                  <div className="msg-bubble">{msg.text}</div>
                  <div className="msg-meta">{msg.role === "user" ? "you" : `${agent}.agentos.eth`} · Sepolia</div>
                </div>
              ))}
            </div>
            <div className="suggestions">
              {[
                "Get me a quote to swap 0.01 ETH to USDC",
                "Who is research.agentos.eth and what do they charge?",
                "Show my execution history from KeeperHub",
                "Pay research.agentos.eth 0.001 ETH for a report"
              ].map((s) => <button className="suggestion-btn" key={s} onClick={() => sendMessage(s)}>{s}</button>)}
            </div>
            <div className="chat-input-row">
              <input className="chat-input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} placeholder={`Message ${agent}.agentos.eth...`} />
              <button className="send-btn" onClick={() => sendMessage()}>Send</button>
            </div>
          </section>

          <div style={{ display: "grid", gap: 18 }}>
            <section className="panel">
              <h2>Live Agents</h2>
              {(["trade", "research", "orchestrate"] as AgentKey[]).map((key) => (
                <button className="agent-card" style={{ width: "100%", textAlign: "left" }} key={key} onClick={() => selectAgent(key)}>
                  <div className="agent-ens">{key}.agentos.eth</div>
                  <div className="agent-desc">{ensData[key].specialty} · reputation {ensData[key].reputation}/100 · {ensData[key].wallet_type}</div>
                </button>
              ))}
            </section>

            <section className="panel">
              <h2>Execution Feed</h2>
              {[
                ["KeeperHub executed swap", "0 retries · MEV-protected", "hi-kh"],
                ["Uniswap quote prepared", "ETH → USDC · BEST_PRICE", "hi-uni"],
                ["ENS reputation updated", `${agent}.agentos.eth`, "hi-ens"],
                ["Orchestrator resolved research.agentos.eth", "ENS text records", "hi-ens"]
              ].map(([title, meta, cls]) => (
                <div className="activity" key={title}>
                  <div className="act-title"><span className={cls}>{title}</span></div>
                  <div className="act-meta"><span>{meta}</span><span>Sepolia</span></div>
                </div>
              ))}
            </section>

            <section className="panel">
              <h2>ENS Text Records</h2>
              <select className="select" value={agent} onChange={(e) => setAgent(e.target.value as AgentKey)}>
                <option value="trade">trade.agentos.eth</option>
                <option value="research">research.agentos.eth</option>
                <option value="orchestrate">orchestrate.agentos.eth</option>
              </select>
              <div className="records">
                <div style={{ color: "var(--accent2)", marginBottom: 12, fontWeight: 700 }}>{agent}.agentos.eth</div>
                {Object.entries(records).map(([key, value]) => (
                  <div className="record-row" key={key}>
                    <span className="record-key">{key}</span>
                    <span className="record-val">{value}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>

      <div className={`modal-backdrop ${modalOpen ? "open" : ""}`} onClick={(e) => e.currentTarget === e.target && setModalOpen(false)}>
        <div className="modal">
          <div className="modal-head"><h2>Deploy Agent</h2></div>
          <div className="modal-body">
            <label>Agent Name</label>
            <input className="field" value={deployName} onChange={(e) => setDeployName(e.target.value)} placeholder="alpha" />
            <div className="ens-preview">ENS Name: <strong style={{ color: "var(--accent2)" }}>{deployName || "__"}.agentos.eth</strong></div>
            <label>Specialty</label>
            <input className="field" defaultValue="trading,defi" />
            <label>Preferred Payment Token</label>
            <select className="select" defaultValue="USDC"><option>USDC</option><option>ETH</option></select>
            <p style={{ color: "var(--muted)", fontSize: 12 }}>Deploys a smart wallet, links ENS, writes capability records, connects Uniswap, and registers KeeperHub execution policy.</p>
          </div>
          <div className="modal-footer">
            <button className="btn-cancel" onClick={() => setModalOpen(false)}>Cancel</button>
            <button className="btn-deploy" onClick={() => setModalOpen(false)}>Deploy on Sepolia →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
