import { ethers } from "hardhat";

async function main() {
  const ensRegistry = process.env.ENS_REGISTRY_ADDRESS || "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
  const parentName = process.env.PARENT_ENS_NAME || "agentos.eth";
  const resolver = process.env.ENS_RESOLVER_ADDRESS;

  if (!resolver) {
    throw new Error("Missing ENS_RESOLVER_ADDRESS. Set it to the Public Resolver used by agentos.eth on Sepolia.");
  }

  const registrar = await ethers.deployContract("AgentSubnameRegistrar", [
    ensRegistry,
    resolver,
    ethers.namehash(parentName),
    parentName
  ]);
  await registrar.waitForDeployment();

  console.log("AGENT_SUBNAME_REGISTRAR_ADDRESS=", await registrar.getAddress());
  console.log("PARENT_ENS_NAME=", parentName);
  console.log("ENS_REGISTRY_ADDRESS=", ensRegistry);
  console.log("ENS_RESOLVER_ADDRESS=", resolver);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
