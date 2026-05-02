import { ethers } from "hardhat";

async function main() {
  const identity = await ethers.deployContract("AgentIdentityRegistry8004");
  await identity.waitForDeployment();

  const reputation = await ethers.deployContract("AgentReputationRegistry8004", [await identity.getAddress()]);
  await reputation.waitForDeployment();

  const validation = await ethers.deployContract("AgentValidationRegistry8004", [await identity.getAddress()]);
  await validation.waitForDeployment();

  const registry = await ethers.deployContract("AgentRegistry");
  await registry.waitForDeployment();

  const factory = await ethers.deployContract("AgentWalletFactory");
  await factory.waitForDeployment();

  console.log("ERC8004_IDENTITY_REGISTRY_ADDRESS=", await identity.getAddress());
  console.log("ERC8004_REPUTATION_REGISTRY_ADDRESS=", await reputation.getAddress());
  console.log("ERC8004_VALIDATION_REGISTRY_ADDRESS=", await validation.getAddress());
  console.log("AGENT_REGISTRY_ADDRESS=", await registry.getAddress());
  console.log("AGENT_WALLET_FACTORY_ADDRESS=", await factory.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
