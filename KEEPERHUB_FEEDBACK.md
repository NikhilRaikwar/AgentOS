# KeeperHub Feedback - AgentOS Integration

AgentOS uses KeeperHub as the execution and reliability layer for ENS-named AI agents. The backend prepares Uniswap Trading API transactions, wraps them in `AgentSmartWallet.execute(...)`, and submits them to KeeperHub Direct Execution.

## What We Built

- KeeperHub MCP login and tool usage.
- KeeperHub organization API key configured for REST Direct Execution.
- Direct contract-call execution from KeeperHub.
- Smart-wallet execution path:
  - KeeperHub wallet is set as the agent smart-wallet executor.
  - The smart wallet allowlists Sepolia USDC, Permit2, and Uniswap Universal Router.
  - KeeperHub calls `AgentSmartWallet.execute(target,value,data)`.
- Runtime status polling through:

```txt
GET /execute/{executionId}/status
```

Latest successful proof:

- Approval run ID: `gp9i4rbct6i36uv028vav`
- Approval tx: https://sepolia.etherscan.io/tx/0x25d8d843eacb894c9d575d3a770be7fb3dd99aa138a09c9aef02d3f224443b35
- Swap run ID: `u8hg88102bu9wi5u126uw`
- Swap tx: https://sepolia.etherscan.io/tx/0xbc7bdf9a6bd1fe4fe627835b75c13681c65a5d9b30f16321a1b0f65ef2282293

## What Worked Well

### MCP tools were useful for debugging

The `get_direct_execution_status` MCP tool was very useful. It showed:

```txt
status: failed
error: Contract call failed: Error(CALL_FAILED)
transactionHash: null
```

That told us the failure happened before a transaction landed onchain.

### Direct Execution worked for real smart-wallet calls

KeeperHub successfully executed:

- `AgentSmartWallet.execute(USDC.approve(Permit2))`
- `AgentSmartWallet.execute(UniswapUniversalRouter.execute(...))`

This is the core value for AgentOS: the AI agent does not need a private key to broadcast the final transaction. KeeperHub performs the last-mile execution while the agent wallet stays scoped to allowlisted targets.

### Status endpoint is practical

The REST status endpoint:

```txt
/execute/{executionId}/status
```

returns the transaction hash after completion. This is important because public proof should be the Etherscan transaction, not a private KeeperHub dashboard page.

## Issues We Hit

### 1. Dashboard execution links are private

The app link format:

```txt
https://app.keeperhub.com/executions/{executionId}
```

can 404 for users who are not part of the KeeperHub organization. This is expected for a private operator dashboard, but it is confusing in a public demo.

Our fix:

- Show the KeeperHub run ID as an operator audit reference.
- Show Etherscan transaction links as public proof.
- Store the latest tx hash and KeeperHub run ID in ENS text records.

Suggestion:

Document that dashboard links are private and recommend how apps should expose public proof:

```txt
executionId + status + txHash + explorer link
```

### 2. Workflow status tool and Direct Execution status tool are different

At first we tried `get_execution_status` for a Direct Execution ID and got a 404. The correct MCP tool is `get_direct_execution_status`.

Suggestion:

In MCP docs, add a clear table:

| ID source | Correct status tool |
|---|---|
| `execute_workflow` | `get_execution_status` |
| `execute_contract_call` / Direct Execution | `get_direct_execution_status` |

### 3. CALL_FAILED does not expose revert detail

When the swap failed, KeeperHub returned:

```txt
Contract call failed: Error(CALL_FAILED)
```

That was accurate, but the root cause was inside the called contract path. In our case, USDC allowance to Permit2 was missing.

We diagnosed it by manually checking:

- agent wallet USDC balance
- smart-wallet executor
- smart-wallet allowed targets
- USDC allowance to Permit2
- Permit2 allowance to Universal Router

Suggestion:

If possible, include decoded revert data or call trace hints for failed simulations. Even a best-effort note like "inner call reverted inside target" would help.

### 4. Native ETH value forwarding needs clearer guidance

Native ETH swaps through Universal Router require `msg.value`. When using wrapper contracts or execution services, value must be forwarded through each layer.

Our final demo uses ERC20 `USDC -> WETH` because it works cleanly with Direct Execution and avoids native value forwarding problems.

Suggestion:

Add examples for:

- payable `execute_contract_call`
- smart-wallet wrapper with value
- Universal Router ETH swap through KeeperHub

### 5. API base and key type should be clearer

We needed an organization API key with the correct prefix and REST permissions. It would help to show the exact key type needed for Direct Execution vs. MCP login.

Suggestion:

Add setup checklist:

```txt
1. Create organization.
2. Fund organization wallet on target testnet.
3. Create organization API key.
4. Confirm /user returns walletAddress.
5. Use MCP login for CLI debugging.
```

## Feature Requests

### Public execution proof endpoint

A public read-only endpoint for execution status would be useful:

```txt
https://app.keeperhub.com/public/executions/{executionId}
```

It could show non-sensitive fields:

- status
- network
- tx hash
- created/completed time
- retry count

### Better revert diagnostics

For `CALL_FAILED`, return:

- decoded revert reason if available
- target contract address
- function selector
- whether failure happened in simulation or after broadcast

### Agent framework examples

An example showing:

```txt
OpenAI tool call -> prepare calldata -> KeeperHub execute_contract_call -> poll status -> write tx proof
```

would match exactly what agent builders need.

## Developer Experience Rating

**8/10**

Strong:

- Direct Execution works for real transactions.
- MCP status tool helped debugging.
- Organization wallet model is useful for agent infrastructure.
- Status endpoint returns tx hash for public proof.

Could improve:

- More explicit Direct Execution vs. Workflow docs.
- Public-safe execution proof links.
- Better revert diagnostics.
- More payable/native ETH examples.

## Final Note

KeeperHub became the reliability layer for AgentOS. The most important integration pattern is:

```txt
AI agent prepares intent
Uniswap prepares calldata
AgentSmartWallet restricts allowed targets
KeeperHub executes and returns tx proof
ENS stores latest execution memory
```

This is a real agent execution loop, not just a simulated workflow.
