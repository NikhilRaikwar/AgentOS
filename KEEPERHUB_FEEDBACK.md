# KeeperHub Feedback - AgentOS Integration

AgentOS uses KeeperHub as the execution and reliability layer for ENS-named AI agents. The backend prepares Uniswap Trading API transactions, wraps them in `AgentSmartWallet.execute(...)`, and submits them through KeeperHub Direct Execution.

This feedback is based on the real AgentOS Sepolia integration.

## Integration Summary

What we built:

- KeeperHub MCP login for development/debugging.
- KeeperHub organization API key for REST Direct Execution.
- KeeperHub organization wallet funded on Sepolia.
- Direct contract-call execution.
- Smart-wallet execution path:
  - KeeperHub wallet is configured as the execution caller.
  - The agent smart wallet allowlists Sepolia USDC, Permit2, and Uniswap Universal Router.
  - KeeperHub calls `AgentSmartWallet.execute(target,value,data)`.
- Runtime status polling through:

```text
GET /execute/{executionId}/status
```

Latest successful proof:

- Approval run ID: `gp9i4rbct6i36uv028vav`
- Approval tx: https://sepolia.etherscan.io/tx/0x25d8d843eacb894c9d575d3a770be7fb3dd99aa138a09c9aef02d3f224443b35
- Swap run ID: `u8hg88102bu9wi5u126uw`
- Swap tx: https://sepolia.etherscan.io/tx/0xbc7bdf9a6bd1fe4fe627835b75c13681c65a5d9b30f16321a1b0f65ef2282293

## What Worked Well

### Direct Execution worked for real smart-wallet calls

KeeperHub successfully executed:

```text
AgentSmartWallet.execute(USDC.approve(Permit2))
AgentSmartWallet.execute(UniswapUniversalRouter.execute(...))
```

This is the core value for AgentOS. The AI agent does not need to hold a private key. KeeperHub performs the last-mile execution while the agent smart wallet stays scoped to allowlisted targets.

### MCP helped during debugging

After logging in with:

```text
codex mcp login keeperhub
```

the MCP status tooling helped us inspect failed Direct Execution runs and confirm whether a run failed before broadcast or completed with a transaction hash.

### Status endpoint returns public proof

The REST status endpoint returns the transaction hash after completion. That is important because public users need Etherscan proof, while the KeeperHub dashboard itself is private to the organization.

## UX and UI Friction

### 1. Dashboard run links are private but look shareable

We initially tried to show links like:

```text
https://app.keeperhub.com/executions/{executionId}
```

For users outside the organization, these links can show 404 or no data. This is reasonable from a security perspective, but it is confusing during a public demo.

How we handled it:

- Show Etherscan transaction links as the public proof.
- Show KeeperHub run IDs as operator audit references.
- Add an option to write `agentos.lastExecutionTx` and `agentos.lastKeeperHubRun` into ENS text records.

Actionable suggestion:

Add a public-safe execution proof view:

```text
https://app.keeperhub.com/public/executions/{executionId}
```

It could show only non-sensitive fields:

- status
- network
- transaction hash
- timestamp
- retry count

### 2. It was not obvious which wallet needed funds

KeeperHub has an organization wallet, and AgentOS agents have their own smart wallets. During integration, we had to reason carefully about which wallet pays gas and which wallet holds the token being swapped.

For our working path:

- KeeperHub organization wallet pays execution/gas.
- Agent smart wallet holds USDC.
- Agent smart wallet must authorize allowed targets.
- Agent smart wallet must approve Permit2.

Actionable suggestion:

Add a Direct Execution diagram that separates:

```text
executor wallet
gas funding wallet
asset-holding wallet
target contract
```

This would help teams building agent wallets.

## Reproducible Bugs / Failures We Hit

### 1. `CALL_FAILED` when token allowance was missing

Failure:

```text
Contract call failed: Error(CALL_FAILED)
```

Context:

- Agent smart wallet had USDC.
- KeeperHub wallet was authorized.
- Smart wallet allowed targets were set.
- But USDC allowance from the agent smart wallet to Permit2 was missing.

Fix:

```text
1. Run Uniswap /check_approval
2. Execute returned USDC approval through KeeperHub
3. Retry swap execution
```

Actionable suggestion:

For `CALL_FAILED`, include more diagnostic hints when possible:

- target contract
- function selector
- decoded revert reason if available
- whether the failure occurred during simulation or after broadcast
- inner call target if the call was a smart-wallet wrapper

Even a best-effort message like "inner call reverted in target contract" would save time.

### 2. Direct Execution status tool vs workflow status tool

At first we mixed up workflow status and Direct Execution status. A Direct Execution ID should be checked with the Direct Execution status path/tool, not the workflow status path.

Actionable suggestion:

Add a clear table to the MCP/API docs:

| ID source | Correct status method |
|---|---|
| Workflow run | workflow status |
| Direct contract-call execution | direct execution status |

### 3. Native ETH value forwarding was unclear

Native ETH → token swaps through Universal Router require `msg.value`. When using KeeperHub plus a smart-wallet wrapper, value must be forwarded through each layer.

Our final demo used ERC20 `USDC -> WETH` because that path works cleanly with Direct Execution and avoids payable forwarding ambiguity.

Actionable suggestion:

Add examples for:

- payable Direct Execution calls
- Universal Router native ETH swaps
- wrapper contract calls with value
- `AgentSmartWallet.execute(target,value,data)` style execution

## Documentation Gaps

### Organization API key setup

We needed an organization API key with the correct REST permissions. The difference between MCP login and REST organization API keys should be more explicit.

Suggested setup checklist:

```text
1. Create KeeperHub organization.
2. Fund organization wallet on target testnet.
3. Create organization API key for REST Direct Execution.
4. Confirm /user returns walletAddress.
5. Use MCP login separately for local debugging.
```

### Direct Execution request shape

The Direct Execution API is powerful, but agent developers would benefit from more examples showing ABI, function name, function args, network, and value formatting.

Suggested example:

```json
{
  "network": "sepolia",
  "contractAddress": "0x...",
  "functionName": "execute",
  "functionArgs": "[\"0xTarget\",\"0\",\"0xData\"]",
  "abi": "[...]",
  "value": "0",
  "metadata": {
    "agent": "tradedemo.agentos.eth",
    "source": "agentos"
  }
}
```

## Feature Requests

### Public execution proof endpoint

Useful for hackathon demos and production apps:

```text
GET /public/executions/{executionId}
```

It should expose only safe fields:

- status
- network
- transaction hash
- created/completed time
- retry count

### Better revert diagnostics

For failed simulations, include:

- decoded revert reason
- target contract address
- function selector
- wrapper target if calldata calls a smart-wallet `execute`

### Agent framework examples

An example showing this exact loop would help:

```text
OpenAI tool call
-> prepare calldata
-> KeeperHub execute_contract_call
-> poll status
-> write tx proof to ENS
```

## Developer Experience Rating

**8/10**

Strong:

- Direct Execution works for real transactions.
- MCP helped debugging.
- Organization wallet model is useful for agent infrastructure.
- Status endpoint returns tx hash for public proof.

Could improve:

- More explicit Direct Execution vs Workflow docs.
- Public-safe execution proof links.
- Better revert diagnostics.
- More payable/native ETH examples.
- Clearer setup path for organization API keys.

## Final Note

KeeperHub became the reliability layer for AgentOS. The most important integration pattern is:

```text
AI agent prepares intent
Uniswap prepares calldata
AgentSmartWallet restricts allowed targets
KeeperHub executes and returns tx proof
ENS stores latest execution memory
```

This is a real agent execution loop, not a simulated workflow.
