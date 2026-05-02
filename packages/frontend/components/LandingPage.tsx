import Link from "next/link";

const stack = [
  ["ENS", "Agent identity, subname hierarchy, capability records, reputation, and discovery.", "identity"],
  ["Uniswap", "Trading API quotes, swaps, UniswapX orders, and any-token agent payments.", "execution"],
  ["KeeperHub", "Reliable onchain execution with retries, gas optimization, private routing, and audit trails.", "reliability"],
  ["OpenAI", "Tool-calling reasoning loop connected to ENS, Uniswap, and KeeperHub.", "agent runtime"],
  ["Smart Wallets", "Each agent has a revocable smart wallet owned by the user, not raw private keys.", "safety"],
  ["Sepolia", "ENS subnames, registry events, and smart-wallet demos on testnet.", "testnet"]
];

export function LandingPage() {
  return (
    <>
      <nav className="landing-nav">
        <Link className="logo" href="/">AgentFi<span>OS</span></Link>
        <div className="nav-links">
          <a href="#how">How it works</a>
          <a href="#stack">Stack</a>
          <a href="#prizes">Prizes</a>
          <Link href="/dashboard" className="nav-cta">Dashboard</Link>
        </div>
      </nav>

      <main>
        <section className="hero">
          <div className="hero-glow" />
          <div className="badge">ETHGlobal OpenAgents 2026</div>
          <h1>
            The Operating System<br />
            <span className="accent-line">for Onchain AI Agents</span><br />
            identity · execution · reputation
          </h1>
          <p className="subtitle">
            Deploy AI agents with ENS names, Uniswap-powered wallets, OpenAI reasoning, and KeeperHub-guaranteed execution.
            Give every agent a name, smart wallet, reputation, and payment rail in under two minutes.
          </p>
          <div className="cta-row">
            <Link className="primary-btn" href="/dashboard">Deploy an Agent</Link>
            <Link className="secondary-btn" href="/dashboard">View Dashboard</Link>
          </div>

          <div className="terminal">
            <div className="term-head"><span className="dot" /><span className="dot" /><span className="dot" /></div>
            <div className="term-body">
              <div className="t-line t-cmd">$ agentfi deploy trade --parent agentos.eth</div>
              <div className="t-line"><span className="t-ens">✓ trade.agentos.eth</span> registered on Sepolia</div>
              <div className="t-line"><span className="t-ens">✓</span> Smart wallet deployed and linked to ENS</div>
              <div className="t-line"><span className="t-ai">✓</span> OpenAI tool runtime initialized</div>
              <div className="t-line"><span className="t-uni">✓</span> Uniswap API connected: /quote /swap /order</div>
              <div className="t-line"><span className="t-kh">✓</span> KeeperHub connected: retries, gas optimization, audit trail</div>
              <div className="t-line t-cmd">$ trade.agentos.eth quote 0.01 ETH to USDC</div>
              <div className="t-line"><span className="t-uni">→</span> Uniswap quote prepared</div>
              <div className="t-line"><span className="t-kh">→</span> KeeperHub execution queued</div>
              <div className="t-line"><span className="t-ens">✓</span> Reputation updated on trade.agentos.eth</div>
            </div>
          </div>
        </section>

        <section id="how" className="section">
          <div className="section-inner">
            <div className="section-label">How it works</div>
            <h2 className="section-title">One OS layer for agent identity, payment, and execution.</h2>
            <div className="steps">
              {[
                ["01", "Get Identity", "Your agent gets an ENS subname at birth, such as trade.agentos.eth.", "ENS subnames"],
                ["02", "Be Discovered", "Capabilities, fee, endpoint, model, reputation, and task count live in ENS text records.", "Text records"],
                ["03", "Pay & Be Paid", "Agents quote and settle payments through Uniswap into each recipient's preferred token.", "Uniswap API"],
                ["04", "Execute Reliably", "KeeperHub handles retries, gas bumps, private routing, and audit logs.", "KeeperHub"]
              ].map(([num, title, text, tag]) => (
                <article className="step-card" key={title}>
                  <div className="step-num">{num}</div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                  <span className="step-tag">{tag}</span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="stack" className="section">
          <div className="section-inner">
            <div className="section-label">Stack</div>
            <h2 className="section-title">Built for the sponsor tracks, not bolted on.</h2>
            <div className="stack-grid">
              {stack.map(([name, desc, tag]) => (
                <article className="card" key={name}>
                  <h3 style={{ color: name === "Uniswap" ? "var(--uni)" : name === "KeeperHub" ? "var(--gold)" : "var(--accent)" }}>{name}</h3>
                  <p>{desc}</p>
                  <span className="card-feat">{tag}</span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="prizes" className="section">
          <div className="section-inner">
            <div className="section-label">Prize Strategy</div>
            <h2 className="section-title">Targets Uniswap, ENS, and KeeperHub together.</h2>
            <div className="prize-grid">
              {[
                ["$5K", "Uniswap Foundation", "Best API Integration: quotes, swaps, orders, and agentic payments."],
                ["$2.5K", "ENS AI Agents", "ENS is the identity, metadata, and discovery layer."],
                ["$2.5K", "ENS Creative", "Reputation and machine-readable capabilities in text records."],
                ["$5K", "KeeperHub", "Reliable execution layer for onchain AI agents."]
              ].map(([amount, sponsor, desc]) => (
                <article className="prize-card" key={sponsor}>
                  <div className="prize-amount">{amount}</div>
                  <div className="prize-sponsor">{sponsor}</div>
                  <div className="prize-desc">{desc}</div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <span>AgentFi OS · OpenAgents 2026</span>
          <span>ENS · Uniswap · KeeperHub · OpenAI</span>
        </div>
      </footer>
    </>
  );
}
