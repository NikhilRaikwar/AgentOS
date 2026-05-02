import OpenAI from "openai";
import { type Address } from "viem";
import { config } from "./config.js";
import { fullAgentName, resolveAgent } from "./ens.js";
import { getAgentExecutionHistory, submitAgentWalletTransaction, submitTransaction } from "./keeperhub.js";
import { checkApproval, getQuote, normalizeTokenAmount, prepareSwap, resolveTokenAddress, TOKENS } from "./uniswap.js";

const openai = new OpenAI({ apiKey: config.openAiApiKey || "missing" });
const lastQuotes = new Map<string, Record<string, unknown>>();
const confirmedQuotes = new Set<string>();

type ChatHistoryItem = {
  role: "user" | "agent" | "tool";
  text: string;
};

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "ens_discover_agent",
      description: "Resolve an ENS-named agent and read its capability/reputation text records.",
      parameters: {
        type: "object",
        properties: { ens_name: { type: "string" } },
        required: ["ens_name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "uniswap_get_quote",
      description: "Get a Uniswap Trading API quote. Always call before execution.",
      parameters: {
        type: "object",
        properties: {
          swapper: { type: "string" },
          tokenIn: { type: "string" },
          tokenOut: { type: "string" },
          amount: { type: "string" },
          chainId: { type: "number" }
        },
        required: ["tokenIn", "tokenOut", "amount"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "keeperhub_get_history",
      description: "Fetch KeeperHub execution history and audit trail for an agent.",
      parameters: {
        type: "object",
        properties: { agent_ens_name: { type: "string" } },
        required: ["agent_ens_name"]
      }
    }
  }
];

function quoteCacheKey(agentEnsName: string, walletAddress?: Address) {
  return `${agentEnsName}:${walletAddress?.toLowerCase() || "anonymous"}`;
}

function isConfirmationMessage(message: string) {
  return /^(yes|yep|yeah|confirm|confirmed|proceed|execute|do it|go ahead|swap)$/i.test(message.trim());
}

function executionSummary(label: string, value: unknown) {
  if (!value || typeof value !== "object") return `${label}: not required`;
  const result = value as { executionId?: string; status?: string; txHash?: string; transactionHash?: string; hash?: string; error?: string; message?: string };
  const status = result.status || "submitted";
  const id = result.executionId;
  const txHash = result.txHash || result.transactionHash || result.hash;
  const parts = [`${label}: ${status}`];
  if (id) parts.push(`KeeperHub run ID ${id}`);
  if (txHash) parts.push(`Etherscan https://sepolia.etherscan.io/tx/${txHash}`);
  if (result.error || result.message) parts.push(result.error || result.message || "");
  return parts.join(" - ");
}

function executionProof(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const result = value as { executionId?: string; txHash?: string; transactionHash?: string; hash?: string };
  const txHash = result.txHash || result.transactionHash || result.hash;
  if (!result.executionId && !txHash) return null;
  return {
    keeperHubRunId: result.executionId || "",
    txHash: txHash || ""
  };
}

function extractQuoteInput(quoteResponse: Record<string, unknown>) {
  const quote = quoteResponse.quote as Record<string, unknown> | undefined;
  const input = quote?.input as Record<string, unknown> | undefined;
  const chainId = Number(quote?.chainId || quoteResponse.chainId || config.chainId || 11155111);
  const token = String(input?.token || "");
  const amount = String(input?.amount || "");
  if (!token || !amount) throw new Error("Could not read input token/amount from cached Uniswap quote.");
  return { chainId, token: token as Address, amount };
}

function formatExecutionResponse(execution: { approvalExecution: unknown; permitExecution: unknown; swapExecution: unknown }) {
  const approval = executionSummary("Token approval step", execution.approvalExecution);
  const permit = executionSummary("Permit/approval step", execution.permitExecution);
  const swap = executionSummary("Swap step", execution.swapExecution);
  const swapStatus = execution.swapExecution && typeof execution.swapExecution === "object"
    ? String((execution.swapExecution as { status?: string }).status || "")
    : "";
  const header = swapStatus.toLowerCase() === "completed"
    ? "Swap execution completed through the agent smart wallet."
    : "Swap execution was submitted through the agent smart wallet, but the swap step did not complete yet.";
  return `${header}\n\n${approval}\n${permit}\n${swap}\n\nOpen KeeperHub and search the run ID in Workflow Runs/Direct Execution. If the swap step failed, check the agent wallet USDC balance, approval tx, and smart-wallet transaction links in Wallet Activity.`;
}

async function runTool(name: string, args: Record<string, unknown>, agentEnsName: string, walletAddress?: Address) {
  if (name === "ens_discover_agent") {
    return resolveAgent(String(args.ens_name));
  }
  if (name === "uniswap_get_quote") {
    const chainId = Number(args.chainId || config.chainId || 11155111);
    const tokenIn = resolveTokenAddress(String(args.tokenIn || "USDC"), chainId, TOKENS.USDC_SEPOLIA);
    const tokenOut = resolveTokenAddress(String(args.tokenOut || "WETH"), chainId, TOKENS.WETH_SEPOLIA);
    const swapper = String(args.swapper || walletAddress || "").trim();
    if (!swapper) throw new Error("Connect a wallet before requesting a Uniswap quote.");
    const quote = await getQuote({
      swapper: swapper as Address,
      tokenIn,
      tokenOut,
      amount: normalizeTokenAmount(String(args.amount), tokenIn),
      chainId
    });
    const cacheKey = quoteCacheKey(agentEnsName, walletAddress);
    lastQuotes.set(cacheKey, quote as Record<string, unknown>);
    confirmedQuotes.delete(cacheKey);
    return quote;
  }
  if (name === "keeperhub_get_history") {
    return getAgentExecutionHistory(String(args.agent_ens_name || agentEnsName));
  }
  throw new Error(`Unknown tool: ${name}`);
}

export async function runAgent(params: {
  agentName: string;
  message: string;
  walletAddress?: Address;
  history?: ChatHistoryItem[];
}) {
  const agentEnsName = fullAgentName(params.agentName);
  const cacheKey = quoteCacheKey(agentEnsName, params.walletAddress);
  const cachedQuote = lastQuotes.get(cacheKey);

  if (isConfirmationMessage(params.message) && cachedQuote) {
    if (confirmedQuotes.has(cacheKey)) {
      return {
        response: "This quote is already confirmed and execution has already been attempted for this quote. Request a fresh quote before executing again.",
        toolCallsMade: ["awaiting_wallet_execution"],
        agentEnsName
      };
    }
    confirmedQuotes.add(cacheKey);
    if (!params.walletAddress) throw new Error("Agent wallet address is required for confirmed execution.");
    try {
      const execution = await executePreparedSwap({
        agentEnsName,
        quoteResponse: cachedQuote,
        agentWallet: params.walletAddress
      });
      return {
        response: formatExecutionResponse(execution),
        toolCallsMade: ["uniswap_get_quote_cached", "agent_wallet_execute", "keeperhub_direct_execution"],
        executionProof: {
          agentEnsName,
          approval: executionProof(execution.approvalExecution),
          permit: executionProof(execution.permitExecution),
          swap: executionProof(execution.swapExecution)
        },
        agentEnsName
      };
    } catch (error) {
      return {
        response: `Quote confirmed, but execution failed before I can claim success: ${error instanceof Error ? error.message : String(error)}. Check Wallet Activity: the agent wallet must be funded and Authorize Execution must be completed for USDC, Permit2, and Universal Router.`,
        toolCallsMade: ["uniswap_get_quote_cached", "agent_wallet_execute_failed"],
        agentEnsName
      };
    }
  }

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are ${agentEnsName}, an AgentFi OS onchain AI agent.
Use ENS for identity/discovery, Uniswap for quotes/swaps/payments, and KeeperHub for reliable execution.
For Sepolia demo quotes, prefer USDC to WETH on chainId 11155111. You may pass token symbols like USDC and WETH; the tool resolves them.
Never claim an execution succeeded unless a tool result proves it.
Always show a Uniswap quote before any transaction and require confirmation before value movement.`
    },
    ...((params.history || []).slice(-8).map((item) => ({
      role: item.role === "user" ? "user" as const : "assistant" as const,
      content: item.text
    }))),
    { role: "user", content: params.message }
  ];

  if (!config.openAiApiKey) {
    return {
      response: `OpenAI is not configured yet. Set OPENAI_API_KEY to run ${agentEnsName}.`,
      toolCallsMade: [],
      agentEnsName
    };
  }

  const first = await openai.chat.completions.create({
    model: config.openAiModel,
    messages,
    tools,
    tool_choice: "auto"
  });

  const assistant = first.choices[0]?.message;
  const toolCallsMade: string[] = [];
  if (!assistant?.tool_calls?.length) {
    return { response: assistant?.content || "", toolCallsMade, agentEnsName };
  }

  messages.push(assistant);
  for (const call of assistant.tool_calls) {
    const args = JSON.parse(call.function.arguments || "{}");
    const result = await runTool(call.function.name, args, agentEnsName, params.walletAddress);
    toolCallsMade.push(call.function.name);
    messages.push({
      role: "tool",
      tool_call_id: call.id,
      content: JSON.stringify(result)
    });
  }

  const final = await openai.chat.completions.create({
    model: config.openAiModel,
    messages
  });

  return {
    response: final.choices[0]?.message.content || "",
    toolCallsMade,
    agentEnsName
  };
}

export async function executePreparedSwap(params: {
  agentEnsName: string;
  quoteResponse: Record<string, unknown>;
  signature?: string;
  agentWallet?: Address;
}) {
  let approvalExecution: unknown = null;
  if (params.agentWallet) {
    const input = extractQuoteInput(params.quoteResponse);
    const approvalCheck = await checkApproval({
      walletAddress: params.agentWallet,
      token: input.token,
      amount: input.amount,
      chainId: input.chainId
    }) as { approval?: Record<string, unknown> | null };

    if (approvalCheck.approval) {
      approvalExecution = await submitAgentWalletTransaction({
        agentEnsName: params.agentEnsName,
        agentWallet: params.agentWallet,
        tx: approvalCheck.approval,
        policy: {
          retries: 3,
          gasOptimization: true,
          privateRouting: true,
          auditTrail: true,
          purpose: "uniswap-check-approval"
        }
      });
    }
  }

  let permitExecution: unknown = null;
  const permitTransaction = params.quoteResponse.permitTransaction;
  if (permitTransaction && typeof permitTransaction === "object") {
    const policy = {
        retries: 3,
        gasOptimization: true,
        privateRouting: true,
        auditTrail: true,
        purpose: "uniswap-permit-transaction"
    };
    permitExecution = params.agentWallet
      ? await submitAgentWalletTransaction({
        agentEnsName: params.agentEnsName,
        agentWallet: params.agentWallet,
        tx: permitTransaction as Record<string, unknown>,
        policy
      })
      : await submitTransaction({
        agentEnsName: params.agentEnsName,
        tx: permitTransaction as Record<string, unknown>,
        policy
      });
  }

  const swap = await prepareSwap(params.quoteResponse, params.signature);
  const swapPolicy = {
      retries: 3,
      gasOptimization: true,
      privateRouting: true,
      auditTrail: true,
      purpose: "uniswap-swap"
  };
  const swapExecution = params.agentWallet
    ? await submitAgentWalletTransaction({
      agentEnsName: params.agentEnsName,
      agentWallet: params.agentWallet,
      tx: swap.swap || swap,
      policy: swapPolicy
    })
    : await submitTransaction({
      agentEnsName: params.agentEnsName,
      tx: swap.swap || swap,
      policy: swapPolicy
    });

  return { approvalExecution, permitExecution, swapExecution };
}
