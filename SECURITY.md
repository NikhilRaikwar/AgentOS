# Security

AgentFi OS is a hackathon project. Do not use production funds or mainnet private keys with this repository.

## Secrets

Never commit `.env`, private keys, API keys, wallet export files, or service tokens.

Required local secrets belong in `.env`:

- `OPENAI_API_KEY`
- `UNISWAP_API_KEY`
- `KEEPERHUB_API_KEY`
- `SEPOLIA_RPC_URL`
- `DEPLOYER_PRIVATE_KEY`
- `AGENT_EXECUTOR_PRIVATE_KEY`

## Wallet Model

Agents use smart wallets controlled by the user with a scoped executor. Raw per-agent private keys are intentionally avoided.

## Reporting

Open a private issue or contact the repository owner if you find a vulnerability.
