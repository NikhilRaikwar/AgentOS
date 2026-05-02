# Uniswap Trading API Feedback - AgentOS

AgentOS uses the Uniswap Trading API as the financial rail for ENS-named AI agents. Agents request quotes, check approvals, prepare swap calldata, and route final execution through KeeperHub from a user-owned agent smart wallet.

This feedback is based on the real AgentOS Sepolia integration, not a mock flow.

## Integration Summary

What we built:

- OpenAI tool: `uniswap_get_quote`
- ERC20 approval check through `/check_approval`
- Quotes through `/quote`
- Swap calldata through `/swap`
- Smart-wallet wrapping through `AgentSmartWallet.execute(...)`
- KeeperHub-routed approval and swap execution
- Public Etherscan proof surfaced in the AgentOS dashboard

Successful demo path:

- Chain: Sepolia
- Agent: `tradedemo.agentos.eth`
- Agent wallet: `0x3f962D91813D7a2230580EA11475305FC6Ef6F7E`
- Path: `USDC -> WETH`
- Input: `1 USDC`
- Output: `0.000122895544056695 WETH`
- Approval tx: https://sepolia.etherscan.io/tx/0x25d8d843eacb894c9d575d3a770be7fb3dd99aa138a09c9aef02d3f224443b35
- Swap tx: https://sepolia.etherscan.io/tx/0xbc7bdf9a6bd1fe4fe627835b75c13681c65a5d9b30f16321a1b0f65ef2282293

## What Worked Well

### `/quote`

The quote endpoint worked well for the Sepolia USDC/WETH pair. The response gave enough information for the AI agent to explain:

- expected output
- price impact
- estimated gas
- route details

This is important for agentic finance because the agent should explain the trade before asking the user to confirm execution.

### `/check_approval`

This was the most important endpoint for our smart-wallet flow. It returned a ready-to-execute approval transaction, which we could wrap through:

```text
AgentSmartWallet.execute(USDC, 0, approve(Permit2, amount))
```

The `approval: null` behavior is also useful because the agent can skip redundant approvals once allowance already exists.

### `/swap`

Once we passed the quote response correctly, `/swap` produced Universal Router calldata that could be submitted through the agent smart wallet and KeeperHub.

### `generatePermitAsTransaction`

This is very useful for agent infrastructure. Browser-based EIP-712 signatures are not always a good fit for automated agents, relayers, or execution services. Returning a Permit2 transaction makes the flow easier to compose with execution infrastructure.

## Bugs and Issues We Hit

### 1. Smart-wallet approval had to happen from the exact `swapper`

Our first KeeperHub-routed swap failed with:

```text
Contract call failed: Error(CALL_FAILED)
```

The agent wallet had USDC, and KeeperHub was authorized as the executor, but the USDC allowance from the agent smart wallet to Permit2 was `0`.

The working sequence was:

```text
1. /check_approval
2. AgentSmartWallet.execute(USDC approve Permit2)
3. /quote
4. /swap
5. AgentSmartWallet.execute(Universal Router calldata)
```

Actionable suggestion:

Add an "agent smart wallet / contract wallet" guide that makes this rule explicit:

```text
The address passed as swapper must be the same address that owns funds and sets approval.
```

This matters a lot for agents because the connected EOA, smart wallet, relayer, and execution wallet may all be different addresses.

### 2. `/swap` request body shape was easy to get wrong

At first, we wrapped the quote response like this:

```json
{
  "quoteResponse": {
    "...": "..."
  }
}
```

That did not match the expected `/swap` body. The correct approach is to pass the quote response fields at the top level.

Actionable suggestion:

Add a copy-paste TypeScript example:

```ts
const swapResponse = await fetch(`${UNISWAP_API_BASE}/swap`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-api-key": UNISWAP_API_KEY
  },
  body: JSON.stringify({
    ...quoteResponse,
    signature
  })
});
```

### 3. Native ETH swaps are harder through execution wrappers

Native ETH routes require `msg.value` to reach Universal Router. When the transaction passes through an execution service or a smart-wallet wrapper, value must be forwarded through every layer.

Our final successful demo used ERC20 `USDC -> WETH` because the ERC20 path works cleanly with Permit2 and avoids native value forwarding ambiguity.

Actionable suggestion:

Add examples for native ETH swaps through:

- contract wallets
- relayers
- execution services
- wrapper contracts such as `AgentSmartWallet.execute(target,value,data)`

### 4. Sepolia liquidity is inconsistent

Some Sepolia token pairs returned "No quotes available." USDC/WETH worked reliably for us after testing amounts.

Actionable suggestion:

Publish a small "known-working testnet pairs" table:

| Chain | Pair | Suggested amount |
|---|---|---|
| Sepolia | USDC/WETH | 1 USDC |

This would save hackathon teams time.

## Documentation Gaps

The docs are strong for standard app swaps, but agentic execution needs more examples for:

- smart-wallet `swapper` addresses
- Permit2 approval from contract wallets
- relayer/execution service flows
- how to store and reuse quote state safely between "quote" and "yes, execute"
- recommended testnet token pairs

## Feature Requests

### Agent state endpoint

Agents need to know the full execution readiness of a wallet before preparing transactions.

Suggested endpoint:

```text
GET /agent-state?wallet=0x...&token=0x...&spender=0x...
```

Useful response:

```json
{
  "balance": "...",
  "erc20Allowance": "...",
  "permit2Allowance": "...",
  "needsApproval": true,
  "recommendedNextAction": "check_approval"
}
```

### Batch quote endpoint

Agents often compare multiple assets or payment routes. A batch quote endpoint would reduce latency and rate-limit pressure.

### Webhook or stream for execution/order state

Agents should not need aggressive polling. A webhook or WebSocket for swap/order state would make agent runtimes cleaner.

## Developer Experience Rating

**8/10**

Strong:

- Good quote quality.
- Good transaction preparation.
- `/check_approval` is exactly the right primitive.
- `generatePermitAsTransaction` is very useful for agent execution.

Could improve:

- More smart-wallet examples.
- More relayer/KeeperHub-style examples.
- Clearer `/swap` body examples.
- Recommended testnet pairs.

## Final Note

Uniswap worked well as the financial rail for AgentOS. The key learning was that the `swapper` address must be treated as the actual execution wallet. In AgentOS, that means the ENS-named agent smart wallet must hold funds and must approve Permit2 before the Universal Router swap can execute.
