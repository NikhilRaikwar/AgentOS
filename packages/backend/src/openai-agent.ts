import OpenAI from "openai";
import { type Address } from "viem";
import { config } from "./config.js";
import { fullAgentName, resolveAgent } from "./ens.js";
import { getAgentExecutionHistory, submitTransaction } from "./keeperhub.js";
import { getQuote, prepareSwap, TOKENS } from "./uniswap.js";

const openai = new OpenAI({ apiKey: config.openAiApiKey || "missing" });

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
        required: ["swapper", "tokenIn", "tokenOut", "amount", "chainId"]
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

async function runTool(name: string, args: Record<string, unknown>, agentEnsName: string) {
  if (name === "ens_discover_agent") {
    return resolveAgent(String(args.ens_name));
  }
  if (name === "uniswap_get_quote") {
    return getQuote({
      swapper: String(args.swapper) as Address,
      tokenIn: String(args.tokenIn || TOKENS.ETH) as Address,
      tokenOut: String(args.tokenOut || TOKENS.USDC_MAINNET) as Address,
      amount: String(args.amount),
      chainId: Number(args.chainId || 1)
    });
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
}) {
  const agentEnsName = fullAgentName(params.agentName);
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are ${agentEnsName}, an AgentFi OS onchain AI agent.
Use ENS for identity/discovery, Uniswap for quotes/swaps/payments, and KeeperHub for reliable execution.
Never claim an execution succeeded unless a tool result proves it.
Always show a Uniswap quote before any transaction and require confirmation before value movement.`
    },
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
    const result = await runTool(call.function.name, args, agentEnsName);
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
}) {
  let permitExecution: unknown = null;
  const permitTransaction = params.quoteResponse.permitTransaction;
  if (permitTransaction && typeof permitTransaction === "object") {
    permitExecution = await submitTransaction({
      agentEnsName: params.agentEnsName,
      tx: permitTransaction as Record<string, unknown>,
      policy: {
        retries: 3,
        gasOptimization: true,
        privateRouting: true,
        auditTrail: true,
        purpose: "uniswap-permit-transaction"
      }
    });
  }

  const swap = await prepareSwap(params.quoteResponse, params.signature);
  const swapExecution = await submitTransaction({
    agentEnsName: params.agentEnsName,
    tx: swap.swap || swap,
    policy: {
      retries: 3,
      gasOptimization: true,
      privateRouting: true,
      auditTrail: true,
      purpose: "uniswap-swap"
    }
  });

  return { permitExecution, swapExecution };
}
