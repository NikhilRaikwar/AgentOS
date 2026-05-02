// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAgentIdentity8004 {
    function ownerOf(uint256 agentId) external view returns (address);
}

/// @title AgentReputationRegistry8004
/// @notice ERC-8004-style feedback registry with lightweight onchain aggregation.
contract AgentReputationRegistry8004 {
    struct Feedback {
        address client;
        uint256 agentId;
        int8 score;
        string tag;
        string feedbackURI;
        bytes32 contextHash;
        uint256 timestamp;
        bool revoked;
    }

    IAgentIdentity8004 public immutable identityRegistry;
    Feedback[] public feedbacks;
    mapping(uint256 => uint256[]) private feedbacksByAgent;

    event FeedbackSubmitted(
        uint256 indexed feedbackId,
        uint256 indexed agentId,
        address indexed client,
        int8 score,
        string tag,
        string feedbackURI,
        bytes32 contextHash
    );
    event FeedbackRevoked(uint256 indexed feedbackId, uint256 indexed agentId, address indexed client);

    constructor(address identityRegistry_) {
        require(identityRegistry_ != address(0), "IDENTITY_ZERO");
        identityRegistry = IAgentIdentity8004(identityRegistry_);
    }

    function submitFeedback(uint256 agentId, int8 score, string calldata tag, string calldata feedbackURI, bytes32 contextHash)
        external
        returns (uint256 feedbackId)
    {
        require(score >= -100 && score <= 100, "SCORE_RANGE");
        identityRegistry.ownerOf(agentId);

        feedbackId = feedbacks.length;
        feedbacks.push(Feedback({
            client: msg.sender,
            agentId: agentId,
            score: score,
            tag: tag,
            feedbackURI: feedbackURI,
            contextHash: contextHash,
            timestamp: block.timestamp,
            revoked: false
        }));
        feedbacksByAgent[agentId].push(feedbackId);
        emit FeedbackSubmitted(feedbackId, agentId, msg.sender, score, tag, feedbackURI, contextHash);
    }

    function revokeFeedback(uint256 feedbackId) external {
        Feedback storage item = feedbacks[feedbackId];
        require(item.client == msg.sender, "NOT_CLIENT");
        require(!item.revoked, "ALREADY_REVOKED");
        item.revoked = true;
        emit FeedbackRevoked(feedbackId, item.agentId, msg.sender);
    }

    function getAgentFeedback(uint256 agentId) external view returns (uint256[] memory) {
        return feedbacksByAgent[agentId];
    }

    function getSummary(uint256 agentId, string calldata tag)
        external
        view
        returns (uint64 count, int64 averageScore)
    {
        uint256[] memory ids = feedbacksByAgent[agentId];
        int256 total;
        bytes32 tagHash = keccak256(bytes(tag));
        bool filterByTag = bytes(tag).length > 0;

        for (uint256 i = 0; i < ids.length; i++) {
            Feedback storage item = feedbacks[ids[i]];
            if (item.revoked) continue;
            if (filterByTag && keccak256(bytes(item.tag)) != tagHash) continue;
            total += item.score;
            count++;
        }

        if (count > 0) averageScore = int64(total / int256(uint256(count)));
    }
}
