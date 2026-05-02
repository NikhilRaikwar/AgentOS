import { parseAbi } from "viem";

export const sepoliaContracts = {
  identity: "0xB7dd5B72bF248806F63d645a6bDaFfDb053f4300",
  reputation: "0xe7f6b315cA9d49bA1aEcA516311a043542A2d161",
  validation: "0x3C5E64A4f0fc23C4205AC5a5D281Ecab06Ee57D9",
  registry: "0x4180F328e2600E8b846e13A1EFe85D21690C6e55",
  factory: "0x75C553505C7912377E08e4B9b2c824D722a704CB",
  subnameRegistrar: (process.env.NEXT_PUBLIC_AGENT_SUBNAME_REGISTRAR_ADDRESS ||
    "0x3ccF94F8B4E5Dd6886A7cbcb2f3C52482dA4ff9E") as `0x${string}`
} as const;

export const agentWalletFactoryAbi = parseAbi([
  "event AgentWalletCreated(string indexed ensName,address indexed owner,address indexed wallet,address executor)",
  "function createAgentWalletFor(string ensName, bytes32 node, address owner, address executor) returns (address wallet)",
  "function walletByNode(bytes32 node) view returns (address)"
]);

export const identityRegistryAbi = parseAbi([
  "event Registered(uint256 indexed agentId,string agentURI,address indexed owner)",
  "event AgentWalletSet(uint256 indexed agentId,address indexed wallet)",
  "function registerWithWallet(string agentURI, (string metadataKey, bytes metadataValue)[] metadata, address wallet) returns (uint256 agentId)"
]);

export const agentRegistryAbi = parseAbi([
  "event AgentRegistered(string indexed ensName,address indexed wallet,address indexed owner)",
  "function registerAgent(bytes32 node,string ensName,address wallet,address owner)"
]);

export const agentSubnameRegistrarAbi = parseAbi([
  "event AgentSubnameRegistered(string indexed label,string ensName,bytes32 indexed node,address indexed owner,address wallet)",
  "function register(string label,address owner,address wallet,(string key,string value)[] records) returns (bytes32 node)"
]);
