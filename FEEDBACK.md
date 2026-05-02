# FEEDBACK.md - Uniswap Trading API Feedback

This file is focused on the Uniswap integration in AgentOS.

AgentOS uses the Uniswap Trading API as the financial rail for ENS-named AI agents. Agents request quotes, prepare approvals, prepare swap calldata, and route the final onchain execution through KeeperHub from a user-owned agent smart wallet.

## What We Built

- OpenAI tool `uniswap_get_quote`
- ERC20 approval check through `/check_approval`
- Quotes through `/quote`
- Swap calldata through `/swap`
- Smart-wallet execution through `AgentSmartWallet.execute(...)`
- KeeperHub-routed settlement for the final approval and swap transactions

Successful latest demo:

- Chain: Sepolia
- Path: `USDC -> WETH`
- Input: `1 USDC`
- Output: `0.000122895544056695 WETH`
- Agent: `tradedemo.agentos.eth`
- Agent wallet: `0x3f962D91813D7a2230580EA11475305FC6Ef6F7E`
- Approval tx: https://sepolia.etherscan.io/tx/0x25d8d843eacb894c9d575d3a770be7fb3dd99aa138a09c9aef02d3f224443b35
- Swap tx: https://sepolia.etherscan.io/tx/0xbc7bdf9a6bd1fe4fe627835b75c13681c65a5d9b30f16321a1b0f65ef2282293

## What Worked Well

### `/quote`

The quote endpoint was reliable for the Sepolia USDC/WETH pair. The route response was detailed enough for an agent to explain expected output, gas, and price impact before asking the user to confirm.

### `/check_approval`

This endpoint is essential for agent-wallet flows. It returns a ready-to-execute approval transaction, which is exactly what an autonomous execution layer needs.

The clean `approval: null` behavior is also helpful because the agent can skip redundant approval calls after allowance exists.

### `/swap`

Once the quote response is passed correctly, `/swap` produces Universal Router calldata that can be wrapped in `AgentSmartWallet.execute(...)` and submitted through KeeperHub.

### `generatePermitAsTransaction`

This option is very useful for agent infrastructure. It avoids requiring a browser EIP-712 signature for Permit2 and makes the flow compatible with relayers/execution services.

## Issues We Hit

### 1. Agent smart wallet needed `/check_approval` before swap

Our first KeeperHub-routed swap failed with:

```txt
Contract call failed: Error(CALL_FAILED)
```

The agent wallet had USDC and KeeperHub was authorized as executor, but USDC allowance from the agent smart wallet to Permit2 was `0`.

The fix was:

```txt
/check_approval
-> AgentSmartWallet.execute(USDC approve Permit2)
-> /swap
-> AgentSmartWallet.execute(Universal Router calldata)
```

After this, the same agent-wallet swap completed successfully.

Suggestion:

Add an "agent smart wallet" guide showing that `/check_approval` must be executed from the same address used as `swapper`, especially when `swapper` is a smart wallet instead of the connected EOA.

### 2. `/swap` request shape is easy to get wrong

The `/swap` endpoint expects the quote response fields at the top level. It does not expect:

```json
{ "quote": { "...": "..." } }
```

The correct pattern is to spread the quote response into the swap request.

Suggestion:

Add a copy-paste TypeScript example showing:

```ts
const swap = await fetch("/swap", {
  method: "POST",
  body: JSON.stringify({
    ...quoteResponse,
    signature
  })
});
```

### 3. Native ETH swaps are harder with execution services

Native ETH paths require `msg.value` to reach the Universal Router call. When the transaction is routed through an execution service or smart wallet wrapper, the developer must make sure value is forwarded at every layer.

Our final successful demo used ERC20 `USDC -> WETH`, because that path avoids payable forwarding issues and works cleanly with Permit2.

Suggestion:

Add docs for native ETH swaps through:

- smart wallets
- relayers
- execution services
- contract-call wrappers

### 4. Sepolia liquidity is inconsistent

Some Sepolia routes returned no quote depending on token pair and amount. USDC/WETH worked best for us.

Suggestion:

Publish a short list of recommended testnet token pairs, token addresses, and known-working amounts.

## Missing Features That Would Help Agents

### Batch quote endpoint

Agents often need to compare multiple routes or rebalance across several assets. A batch `/quotes` endpoint would reduce latency and rate-limit pressure.

### Agent state endpoint

A single endpoint that returns balances, ERC20 approval status, Permit2 status, and suggested next transaction would be very useful.

Example:

```txt
GET /agent-state?wallet=0x...&token=0x...&spender=router
```

### Webhook for order/swap state

Agents should not poll aggressively. A webhook or WebSocket for order status would make agent runtimes cleaner and cheaper.

## Developer Experience Rating

**8/10**

Strong:

- Good quote quality.
- Good transaction preparation.
- `/check_approval` is exactly the right primitive.
- `generatePermitAsTransaction` is very useful for agentic execution.

Could improve:

- More smart-wallet examples.
- More relayer/KeeperHub-style examples.
- Clearer `/swap` request body examples.
- Recommended testnet pairs.

## Final Note

Uniswap worked well as the financial rail for AgentOS. The biggest learning was that the `swapper` address must be treated as the actual execution wallet. In our case, that means the ENS-named agent smart wallet must hold funds and must be the address that approves Permit2 before the Universal Router swap runs.
