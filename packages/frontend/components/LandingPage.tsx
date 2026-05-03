"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";

const stack = [
  {
    name: "ENS",
    role: "Identity, Discovery, Reputation",
    accent: "acc-green",
    desc: "ENS Sepolia subnames under agentos.eth give agents persistent human-readable identities. Text records store machine-readable capability manifests.",
    features: [
      "Real subnames via AgentSubnameRegistrar",
      "Text records: specialty, fee, endpoint, reputation",
      "ERC-8004 identity NFT bound to smart wallet",
      "Discoverable through ENS, not a central database"
    ]
  },
  {
    name: "Uniswap",
    role: "Quotes, Swaps, Settlement",
    accent: "acc-pink",
    desc: "The Uniswap Trading API powers agent financial operations. Agents call quote before execution and prepare Universal Router calldata.",
    features: [
      "Trading API quote and swap preparation",
      "UniswapX-ready order path",
      "Agent-to-agent payments in preferred token",
      "Routing transparency before execution"
    ]
  },
  {
    name: "KeeperHub",
    role: "Execution, Retries, Audit Trails",
    accent: "acc-gold",
    desc: "KeeperHub is the reliability layer. Prepared transactions route through Direct Execution for retry logic, gas optimization, and auditability.",
    features: [
      "Direct Execution via contract-call",
      "Retry and gas bump policy",
      "Private routing for safer settlement",
      "Per-execution audit trail"
    ]
  },
  {
    name: "ERC-8004",
    role: "Onchain Agent Standard",
    accent: "acc-blue",
    desc: "Identity, reputation, and validation registries give agents trust primitives beyond chat or wallet automation.",
    features: [
      "ERC-721 identity registry",
      "Feedback and reputation registry",
      "Validation registry for third-party attestations",
      "Sepolia deployed contracts"
    ]
  },
  {
    name: "OpenAI",
    role: "Agent Reasoning, Tool Calling",
    accent: "acc-ink",
    desc: "The backend runtime uses OpenAI tool calls to resolve agents, fetch Uniswap quotes, and inspect KeeperHub status.",
    features: [
      "Tool-calling agent loop",
      "ENS discovery tool",
      "Uniswap quote tool",
      "KeeperHub history tool"
    ]
  },
  {
    name: "Infra",
    role: "Deployment, Wallet Security",
    accent: "acc-faint",
    desc: "The connected wallet signs deployments. The server never owns user agents and only exposes scoped execution adapters.",
    features: [
      "No server custody",
      "User-owned smart wallets",
      "Scoped executor address",
      "Full build verification"
    ]
  }
];

const contractLinks = [
  ["AgentSubnameRegistrar", "Mints real name.agentos.eth subnames and ENS text records", "0x3ccF94F8B4E5Dd6886A7cbcb2f3C52482dA4ff9E"],
  ["AgentWalletFactory", "Creates user-owned smart wallets for new agents", "0x75C553505C7912377E08e4B9b2c824D722a704CB"],
  ["AgentRegistry", "Indexes created agents for onchain discovery", "0x4180F328e2600E8b846e13A1EFe85D21690C6e55"]
] as const;

const etherscanAddress = (address: string) => `https://sepolia.etherscan.io/address/${address}`;

export function LandingPage() {
  const { isConnected } = useAccount();
  const router = useRouter();

  useEffect(() => {
    if (isConnected) router.push("/dashboard");
  }, [isConnected, router]);

  return (
    <>
      <nav className="landing-nav">
        <Link className="nav-logo" href="/">Agent<em>OS</em></Link>
        <div className="nav-right">
          <a href="#how">How it works</a>
          <a href="#stack">Stack</a>
          <a href="#proof">Proof</a>
          <ConnectButton.Custom>
            {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
              const ready = mounted;
              const connected = ready && account && chain;
              if (!connected) return <button type="button" className="nav-cta" disabled={!ready} onClick={() => openConnectModal?.()}>Connect Wallet</button>;
              if (chain.unsupported) return <button type="button" className="nav-cta" onClick={() => openChainModal?.()}>Wrong Network</button>;
              return <button type="button" className="nav-cta" onClick={() => openAccountModal?.()}>{account.displayName}</button>;
            }}
          </ConnectButton.Custom>
        </div>
      </nav>

      <main>
        <section className="hero">
          <div className="hero-left">
            <div className="hero-announcement fade-up d1">AgentOS - ETHGlobal Open Agents 2026 · Live on Sepolia</div>
            <h1 className="fade-up d2">
              The operating system<br />for <em>onchain AI agents</em>
            </h1>

            <p className="hero-desc fade-up d3">
              ENS gives agents persistent identity and discovery.
              Uniswap gives them financial rails.
              KeeperHub gives them reliable execution and audit trails.
            </p>

            <div className="hero-actions fade-up d4">
              <ConnectButton.Custom>
                {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
                  const ready = mounted;
                  const connected = ready && account && chain;
                  if (!connected) return <button type="button" className="btn-primary" disabled={!ready} onClick={() => openConnectModal?.()}>Connect Wallet</button>;
                  if (chain.unsupported) return <button type="button" className="btn-primary" onClick={() => openChainModal?.()}>Switch Network</button>;
                  return <button type="button" className="btn-primary" onClick={() => openAccountModal?.()}>Connected: {account.displayName}</button>;
                }}
              </ConnectButton.Custom>
              <a href="#how" className="btn-outline">See how it works</a>
            </div>

            <p className="hero-tagline fade-up d5">No server custody. Real ENS subnames. Verifiable onchain actions.</p>

            <div className="sponsor-row fade-up d5">
              <span className="sponsor-label">Powered by</span>
              <span className="sponsor-pill">ENS Sepolia</span>
              <span className="sponsor-pill">Uniswap API</span>
              <span className="sponsor-pill">KeeperHub</span>
              <span className="sponsor-pill">ERC-8004</span>
            </div>
          </div>

          <div className="hero-card fade-up d3">
            <div className="card-header">
              <div className="card-header-dots"><div className="hdot" /><div className="hdot" /><div className="hdot" /></div>
              <span className="card-title">live public proof</span>
            </div>
            <div className="card-body">
              <div className="proof-title">tradedemo.agentos.eth</div>
              <p className="stack-desc">
                Real ENS identity, user-owned smart wallet, latest KeeperHub-routed Uniswap swap,
                and execution proof written back to ENS text records.
              </p>
              <div className="tx-row">
                <a className="proof-link" href="https://sepolia.app.ens.domains/tradedemo.agentos.eth" target="_blank" rel="noreferrer">Open ENS identity</a>
                <a className="proof-link" href="https://sepolia.etherscan.io/tx/0x591e614aa5c0eea004fffb79d0ab818ecf5999186cd3d916c530c159a0b31bbe" target="_blank" rel="noreferrer">Latest swap tx</a>
                <a className="proof-link" href="https://sepolia.etherscan.io/address/0x3f962D91813D7a2230580EA11475305FC6Ef6F7E" target="_blank" rel="noreferrer">Agent wallet</a>
              </div>
              <hr className="divider-line" />
              <div className="record-row">
                <span className="record-key">last tx</span>
                <span className="record-val">0x591e614aa5c0eea004fffb79d0ab818ecf5999186cd3d916c530c159a0b31bbe</span>
              </div>
              <div className="record-row">
                <span className="record-key">KeeperHub run</span>
                <span className="record-val">xgni3xqq3n0vvcdds0p96</span>
              </div>
              <div className="record-row">
                <span className="record-key">swap</span>
                <span className="record-val">1 USDC to 0.000123697808408471 WETH on Sepolia</span>
              </div>
            </div>
          </div>
        </section>

        <hr className="section-rule" />

        <section className="section" id="how">
          <span className="kicker">User flow</span>
          <h2 className="section-title">From wallet to<br /><em>working onchain agent</em><br />in four steps.</h2>
          <p className="section-desc">No server holds the user private key. No centralized agent registry. The connected wallet signs every deployment step directly.</p>
          <div className="steps-grid">
            {[
              ["01", "Connect Wallet", "A new user connects a Sepolia wallet. The connected wallet becomes the owner of the new agent.", "User-signed", "tag-ai"],
              ["02", "Deploy Agent Wallet", "The wallet signs createAgentWalletFor on the AgentWalletFactory. The smart wallet is owned by the user.", "ENS-linked", "tag-ens"],
              ["03", "Register Identity", "The wallet mints a real agentos.eth subname, writes text records, and mints ERC-8004 identity.", "ENS + ERC-8004", "tag-ens"],
              ["04", "Execute and Settle", "Agents reason with OpenAI tools, quote via Uniswap, and route final execution through KeeperHub.", "Uniswap + KeeperHub", "tag-uni"]
            ].map(([num, title, desc, tag, cls]) => (
              <div className="step" key={title}>
                <div className="step-num">{num}</div>
                <h3 className="step-title">{title}</h3>
                <p className="step-desc">{desc}</p>
                <span className={`step-tag ${cls}`}>{tag}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="section-full" id="stack">
          <div className="section-full-inner">
            <span className="kicker">Sponsor stack</span>
            <h2 className="section-title">Every integration<br />does <em>real work.</em></h2>
            <p className="section-desc">No cosmetic add-ons. Each sponsor API is a load-bearing layer of the architecture.</p>
            <div className="stack-grid">
              {stack.map((item) => (
                <div className="stack-card" key={item.name}>
                  <div className={`stack-accent ${item.accent}`} />
                  <div className="stack-logo">{item.name}</div>
                  <div className="stack-role">{item.role}</div>
                  <p className="stack-desc">{item.desc}</p>
                  <ul className="stack-features">
                    {item.features.map((feature) => <li key={feature}>{feature}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>

        <section className="section" id="proof">
          <span className="kicker">Working proof</span>
          <h2 className="section-title">A real agent launchpad,<br /><em>not a static demo.</em></h2>
          <p className="section-desc">
            AgentOS proves the full path from connected wallet to discoverable agent:
            user-owned wallet deployment, ENS subname registration, machine-readable
            capabilities, and execution-ready Uniswap/KeeperHub rails.
          </p>
          <div className="proof-grid">
            {[
              ["01", "Wallet-owned agents", "The connected wallet signs the agent wallet deployment and remains the owner. The server never receives a user private key.", "green"],
              ["02", "ENS as discovery", "Each agent gets a real agentos.eth subname. Other apps and agents can resolve the name and read capability records.", "blue"],
              ["03", "Capability routing", "Specialty, fee, preferred token, endpoint, model, and reputation are written as structured records so orchestrators know which agent to use.", "gold"],
              ["04", "Execution-ready finance", "Agents call Uniswap for quotes and prepare execution through the KeeperHub adapter with an audit-friendly runtime path.", "pink"]
            ].map(([index, title, desc, color]) => (
              <div className="proof-card" key={title}>
                <div className={`proof-index proof-${color}`}>{index}</div>
                <div className="proof-title">{title}</div>
                <p className="proof-desc">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="section-full" id="contracts">
          <div className="section-full-inner">
            <span className="kicker">Sepolia contracts</span>
            <h2 className="section-title">Public proof for<br /><em>AgentOS agents.</em></h2>
            <p className="section-desc">
              These are the contracts needed to prove the main flow:
              mint an ENS agent name, create its user-owned wallet, and register it for discovery.
            </p>
            <div className="proof-grid">
              {contractLinks.map(([name, desc, address], index) => (
                <div className="proof-card" key={address}>
                  <div className={`proof-index ${index % 4 === 0 ? "proof-green" : index % 4 === 1 ? "proof-blue" : index % 4 === 2 ? "proof-gold" : "proof-pink"}`}>{String(index + 1).padStart(2, "0")}</div>
                  <div className="proof-title">{name}</div>
                  <p className="proof-desc">{desc}</p>
                  <div className="tx-row">
                    <a className="proof-link" href={etherscanAddress(address)} target="_blank" rel="noreferrer">
                      {address.slice(0, 8)}...{address.slice(-6)}
                    </a>
                  </div>
                </div>
              ))}
              <div className="proof-card">
                <div className="proof-index proof-green">ENS</div>
                <div className="proof-title">agentos.eth namespace</div>
                <p className="proof-desc">View the parent ENS name and open the Subnames tab to see minted agents under agentos.eth.</p>
                <div className="tx-row">
                  <a className="proof-link" href="https://sepolia.app.ens.domains/agentos.eth" target="_blank" rel="noreferrer">Open agentos.eth</a>
                  <a className="proof-link" href="https://sepolia.app.ens.domains/agentos.eth?tab=subnames" target="_blank" rel="noreferrer">Subnames view</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer>
        <div className="footer-inner">
          <Link href="/" className="footer-logo">Agent<em>OS</em></Link>
          <div className="footer-links">
            <a href="https://github.com/NikhilRaikwar/AgentOS">GitHub</a>
            <a href="#contracts">Contracts</a>
            <a href="https://sepolia.app.ens.domains/agentos.eth">ENS Namespace</a>
            <a href="https://docs.ens.domains">ENS Docs</a>
            <a href="https://developers.uniswap.org">Uniswap API</a>
            <a href="https://docs.keeperhub.com">KeeperHub</a>
          </div>
          <span className="footer-right">ETHGlobal Open Agents 2026 - Sepolia Testnet</span>
        </div>
      </footer>
    </>
  );
}
