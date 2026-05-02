import dotenv from "dotenv";
import path from "node:path";
import {
  decodeFunctionData,
  erc20Abi,
  formatEther,
  formatUnits,
  parseAbi,
  createPublicClient,
  http
} from "viem";

[
  ".env",
  "../../.env",
  "../../../.env",
  "../.env"
].forEach((envPath) => dotenv.config({ path: path.resolve(process.cwd(), envPath), override: false }));

const API_BASE = process.env.UNISWAP_API_BASE || "https://trade-api.gateway.uniswap.org/v1";
const KH_BASE = process.env.KEEPERHUB_API_BASE || "https://app.keeperhub.com/api";
const UNISWAP_API_KEY = process.env.UNISWAP_API_KEY;
const KEEPERHUB_API_KEY = process.env.KEEPERHUB_API_KEY;
const RPC = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

const CHAIN_ID = 11155111;
const WALLET = "0x924CAF4F0FDAfea9eF3653374D2f93F56059c7e5";
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const WETH = "0xfff9976782d46cc05630d1f6ebab18b2324d6b14";
const AMOUNT = "1000000"; // 1 Sepolia USDC

const permit2Abi = parseAbi([
  "function approve(address token, address spender, uint160 amount, uint48 expiration)"
]);

const universalRouterAbi = parseAbi([
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
  "function execute(bytes commands, bytes[] inputs) payable"
]);

if (!UNISWAP_API_KEY) throw new Error("Missing UNISWAP_API_KEY");
if (!KEEPERHUB_API_KEY) throw new Error("Missing KEEPERHUB_API_KEY");

async function uniswap(pathname, body) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-api-key": UNISWAP_API_KEY,
      "x-universal-router-version": "2.0"
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Uniswap ${pathname} ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function keeperhub(pathname, body, method = "POST") {
  const res = await fetch(`${KH_BASE}${pathname}`, {
    method,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${KEEPERHUB_API_KEY}`
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`KeeperHub ${pathname} ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function executeContractCall({ contractAddress, functionName, functionArgs, abi, value = "0", metadata }) {
  const result = await keeperhub("/execute/contract-call", {
    network: "sepolia",
    contractAddress,
    functionName,
    functionArgs: JSON.stringify(functionArgs, (_key, val) => typeof val === "bigint" ? val.toString() : val),
    abi: JSON.stringify(abi),
    value,
    gasLimitMultiplier: "1.25",
    metadata
  });
  return result;
}

async function pollExecution(executionId) {
  for (let i = 0; i < 24; i += 1) {
    const status = await keeperhub(`/execute/${executionId}/status`, undefined, "GET");
    if (status.status !== "pending" && status.status !== "running") return status;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return keeperhub(`/execute/${executionId}/status`, undefined, "GET");
}

function decodeApproval(tx) {
  try {
    const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data });
    if (decoded.functionName === "approve") {
      return { abi: erc20Abi, functionName: decoded.functionName, functionArgs: decoded.args };
    }
  } catch {}

  const decoded = decodeFunctionData({ abi: permit2Abi, data: tx.data });
  return { abi: permit2Abi, functionName: decoded.functionName, functionArgs: decoded.args };
}

function decodeKnownTx(tx) {
  try {
    const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data });
    return { abi: erc20Abi, functionName: decoded.functionName, functionArgs: decoded.args };
  } catch {}

  try {
    const decoded = decodeFunctionData({ abi: permit2Abi, data: tx.data });
    return { abi: permit2Abi, functionName: decoded.functionName, functionArgs: decoded.args };
  } catch {}

  const decoded = decodeFunctionData({ abi: universalRouterAbi, data: tx.data });
  return { abi: universalRouterAbi, functionName: decoded.functionName, functionArgs: decoded.args };
}

async function balances(label) {
  const client = createPublicClient({ transport: http(RPC) });
  const [eth, usdc] = await Promise.all([
    client.getBalance({ address: WALLET }),
    client.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [WALLET] })
  ]);
  console.log(`${label}: ETH=${formatEther(eth)} USDC=${formatUnits(usdc, 6)}`);
}

await balances("before");

const approval = await uniswap("/check_approval", {
  walletAddress: WALLET,
  token: USDC,
  amount: AMOUNT,
  chainId: CHAIN_ID
});

if (approval.approval) {
  const decoded = decodeApproval(approval.approval);
  const approvalRun = await executeContractCall({
    contractAddress: approval.approval.to,
    functionName: decoded.functionName,
    functionArgs: decoded.functionArgs,
    abi: decoded.abi,
    value: "0",
    metadata: { source: "agentos-uniswap-approval", agent: "keeperhub.agentos.eth" }
  });
  console.log("approval execution:", approvalRun);
  const approvalStatus = await pollExecution(approvalRun.executionId);
  console.log("approval status:", approvalStatus);
  if (approvalStatus.status !== "completed") process.exit(2);
} else {
  console.log("approval: already approved");
}

const quote = await uniswap("/quote", {
  generatePermitAsTransaction: true,
  swapper: WALLET,
  tokenIn: USDC,
  tokenOut: WETH,
  tokenInChainId: String(CHAIN_ID),
  tokenOutChainId: String(CHAIN_ID),
  amount: AMOUNT,
  type: "EXACT_INPUT",
  routingPreference: "BEST_PRICE",
  autoSlippage: "DEFAULT",
  urgency: "urgent"
});
console.log("quote:", {
  routing: quote.routing,
  output: quote.quote?.output?.amount,
  hasPermitTransaction: Boolean(quote.permitTransaction),
  hasPermitData: Boolean(quote.permitData)
});

if (quote.permitTransaction) {
  const tx = quote.permitTransaction;
  const decoded = decodeKnownTx(tx);
  const permitRun = await executeContractCall({
    contractAddress: tx.to,
    functionName: decoded.functionName,
    functionArgs: decoded.functionArgs,
    abi: decoded.abi,
    value: tx.value ? BigInt(tx.value).toString() : "0",
    metadata: { source: "agentos-uniswap-permit-transaction", agent: "keeperhub.agentos.eth" }
  });
  console.log("permit execution:", permitRun);
  const permitStatus = await pollExecution(permitRun.executionId);
  console.log("permit status:", permitStatus);
  if (permitStatus.status !== "completed") process.exit(3);
}

const { permitData, permitTransaction, ...quoteWithoutUnsignedPermit } = quote;
void permitData;
void permitTransaction;
const swap = await uniswap("/swap", quoteWithoutUnsignedPermit);
const tx = swap.swap || swap;
const decodedSwap = decodeFunctionData({ abi: universalRouterAbi, data: tx.data });
const swapRun = await executeContractCall({
  contractAddress: tx.to,
  functionName: decodedSwap.functionName,
  functionArgs: decodedSwap.args,
  abi: universalRouterAbi,
  value: "0",
  metadata: { source: "agentos-uniswap-usdc-swap", agent: "keeperhub.agentos.eth" }
});
console.log("swap execution:", swapRun);
const swapStatus = await pollExecution(swapRun.executionId);
console.log("swap status:", swapStatus);

await balances("after");
