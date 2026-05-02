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
        wallet = _createAgentWallet(ensName, node, msg.sender, executor);
    }

    function createAgentWalletFor(string calldata ensName, bytes32 node, address owner, address executor)
        external
        returns (address wallet)
    {
        wallet = _createAgentWallet(ensName, node, owner, executor);
    }

    function _createAgentWallet(string calldata ensName, bytes32 node, address owner, address executor)
        internal
        returns (address wallet)
    {
        require(owner != address(0), "OWNER_ZERO");
        require(walletByNode[node] == address(0), "AGENT_EXISTS");
        AgentSmartWallet created = new AgentSmartWallet(owner, executor, ensName);
        wallet = address(created);
        walletByNode[node] = wallet;
        emit AgentWalletCreated(ensName, owner, wallet, executor);
    }
}
