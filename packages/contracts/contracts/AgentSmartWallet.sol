// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AgentSmartWallet
/// @notice Minimal hackathon smart wallet for ENS-named AI agents.
contract AgentSmartWallet {
    address public owner;
    address public executor;
    string public ensName;
    bool public paused;

    mapping(address => bool) public allowedTargets;

    event OwnerChanged(address indexed previousOwner, address indexed newOwner);
    event ExecutorChanged(address indexed previousExecutor, address indexed newExecutor);
    event TargetAllowed(address indexed target, bool allowed);
    event Paused(bool paused);
    event Executed(address indexed target, uint256 value, bytes data, bytes result);

    modifier onlyOwner() {
        require(msg.sender == owner, "ONLY_OWNER");
        _;
    }

    modifier onlyAuthorized() {
        require(msg.sender == owner || msg.sender == executor, "NOT_AUTHORIZED");
        _;
    }

    constructor(address initialOwner, address initialExecutor, string memory initialEnsName) {
        require(initialOwner != address(0), "OWNER_ZERO");
        owner = initialOwner;
        executor = initialExecutor;
        ensName = initialEnsName;
    }

    receive() external payable {}

    function setOwner(address newOwner) external onlyOwner {
        require(newOwner != address(0), "OWNER_ZERO");
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }

    function setExecutor(address newExecutor) external onlyOwner {
        emit ExecutorChanged(executor, newExecutor);
        executor = newExecutor;
    }

    function setAllowedTarget(address target, bool allowed) external onlyOwner {
        allowedTargets[target] = allowed;
        emit TargetAllowed(target, allowed);
    }

    function setPaused(bool nextPaused) external onlyOwner {
        paused = nextPaused;
        emit Paused(nextPaused);
    }

    function execute(address target, uint256 value, bytes calldata data)
        external
        onlyAuthorized
        returns (bytes memory result)
    {
        require(!paused, "PAUSED");
        require(target != address(0), "TARGET_ZERO");
        if (msg.sender == executor) {
            require(allowedTargets[target], "TARGET_NOT_ALLOWED");
        }

        (bool ok, bytes memory response) = target.call{value: value}(data);
        require(ok, "CALL_FAILED");
        emit Executed(target, value, data, response);
        return response;
    }
}
