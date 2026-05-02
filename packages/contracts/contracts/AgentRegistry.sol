// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AgentRegistry {
    struct Agent {
        string ensName;
        address wallet;
        address owner;
        uint256 createdAt;
    }

    event AgentRegistered(string indexed ensName, address indexed wallet, address indexed owner);
    event ReputationSnapshot(string indexed ensName, uint256 reputation, uint256 tasksDone);

    mapping(bytes32 => Agent) public agents;
    bytes32[] public nodes;

    function registerAgent(bytes32 node, string calldata ensName, address wallet, address owner) external {
        require(wallet != address(0), "WALLET_ZERO");
        require(owner != address(0), "OWNER_ZERO");
        require(agents[node].wallet == address(0), "AGENT_EXISTS");

        agents[node] = Agent({
            ensName: ensName,
            wallet: wallet,
            owner: owner,
            createdAt: block.timestamp
        });
        nodes.push(node);
        emit AgentRegistered(ensName, wallet, owner);
    }

    function snapshotReputation(bytes32 node, uint256 reputation, uint256 tasksDone) external {
        Agent memory agent = agents[node];
        require(agent.wallet != address(0), "UNKNOWN_AGENT");
        require(msg.sender == agent.owner || msg.sender == agent.wallet, "NOT_AUTHORIZED");
        emit ReputationSnapshot(agent.ensName, reputation, tasksDone);
    }

    function agentCount() external view returns (uint256) {
        return nodes.length;
    }
}
