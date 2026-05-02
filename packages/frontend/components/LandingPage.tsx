"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useAccount } from "wagmi";

const stack = [
  ["ENS", "Persistent agent names, capability metadata, reputation, and decentralized discovery.", "identity"],
  ["Uniswap", "Trading API quotes, swaps, UniswapX-ready settlement, and any-token agent payments.", "execution"],
  ["KeeperHub", "Retries, gas optimization, private routing, and audit trails for agent transactions.", "reliability"],
  ["OpenAI", "Tool-calling runtime that can reason over ENS records and prepare Uniswap actions.", "agent runtime"]
];

const flow = [
  ["Connect", "A new user connects a Sepolia wallet. No server custody is required."],
  ["Create", "The wallet signs factory deployment for a user-owned agent smart wallet."],
  ["Register", "The wallet mints ERC-8004 identity and indexes the agent under agentos.eth."],
  ["Execute", "Agents quote with Uniswap and route reliable settlement through KeeperHub."]
];

export function LandingPage() {
  const { isConnected } = useAccount();

  return (
    <>
      <nav className="landing-nav">
        <Link className="logo" href="/">Agent<span>OS</span></Link>
        <div className="nav-links">
          <a href="#flow">Flow</a>
          <a href="#stack">Stack</a>
          <a href="#demo">Demo</a>
          <Link href="/dashboard" className="nav-cta">Dashboard</Link>
        </div>
      </nav>

      <main>
        <section className="hero">
          <div className="badge">ETHGlobal Open Agents 2026</div>
          <h1>
            Launch named AI agents<br />
            that can pay, trade, and prove trust.
          </h1>
          <p className="subtitle">
            AgentOS is a deployment layer for onchain agents: ENS gives each agent identity,
            Uniswap gives it financial execution, and KeeperHub makes the final transaction reliable.
          </p>
          <div className="landing-wallet">
            <ConnectButton />
            <Link className="primary-btn" href="/dashboard">
              {isConnected ? "Open Dashboard" : "Preview Dashboard"}
            </Link>
          </div>

          <div className="product-shell" id="demo">
            <div className="product-top">
              <span>agentos.eth deployment console</span>
              <span>Sepolia</span>
            </div>
            <div className="product-grid">
              <div className="product-panel">
                <p className="eyebrow">New agent</p>
                <h2>trade.agentos.eth</h2>
                <div className="product-row"><span>Owner</span><strong>Connected wallet</strong></div>
                <div className="product-row"><span>Wallet</span><strong>Factory deployed</strong></div>
                <div className="product-row"><span>Identity</span><strong>ERC-8004 minted</strong></div>
                <div className="product-row"><span>Execution</span><strong>KeeperHub ready</strong></div>
              </div>
              <div className="product-panel accent-panel">
                <p className="eyebrow">Agent command</p>
                <div className="command-card">Quote 0.01 ETH to USDC, validate route, and prepare reliable execution.</div>
                <div className="route-line"><span>ENS</span><i /> <span>OpenAI</span><i /> <span>Uniswap</span><i /> <span>KeeperHub</span></div>
              </div>
            </div>
          </div>
        </section>

        <section id="flow" className="section">
          <div className="section-inner">
            <div className="section-label">User flow</div>
            <h2 className="section-title">A real new user can create an agent without giving us a private key.</h2>
            <div className="steps">
              {flow.map(([title, text], index) => (
                <article className="step-card" key={title}>
                  <div className="step-num">{String(index + 1).padStart(2, "0")}</div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="stack" className="section">
          <div className="section-inner">
            <div className="section-label">Sponsor stack</div>
            <h2 className="section-title">Every integration is part of the product surface.</h2>
            <div className="stack-grid">
              {stack.map(([name, desc, tag]) => (
                <article className="card" key={name}>
                  <h3>{name}</h3>
                  <p>{desc}</p>
                  <span className="card-feat">{tag}</span>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <span>AgentOS for Open Agents</span>
          <span>ENS, Uniswap, KeeperHub, OpenAI</span>
        </div>
      </footer>
    </>
  );
}
