// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AgentSmartWallet.sol";

contract AgentWalletFactory {
    event AgentWalletCreated(
        string indexed ensName,
        address indexed owner,
        address indexed wallet,
        address executor
    );

    mapping(bytes32 => address) public walletByNode;

    function createAgentWallet(string calldata ensName, bytes32 node, address executor)
        external
        returns (address wallet)
    {
        require(walletByNode[node] == address(0), "AGENT_EXISTS");
        AgentSmartWallet created = new AgentSmartWallet(msg.sender, executor, ensName);
        wallet = address(created);
        walletByNode[node] = wallet;
        emit AgentWalletCreated(ensName, msg.sender, wallet, executor);
    }
}
