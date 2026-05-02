// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAgentIdentityOwner8004 {
    function ownerOf(uint256 agentId) external view returns (address);
}

/// @title AgentValidationRegistry8004
/// @notice ERC-8004-style request/response registry for independent validation.
contract AgentValidationRegistry8004 {
    enum Response {
        Unknown,
        Accepted,
        Rejected,
        Inconclusive
    }

    struct ValidationStatus {
        address validatorAddress;
        uint256 agentId;
        Response response;
        bytes32 responseHash;
        string tag;
        uint256 lastUpdate;
        string requestURI;
    }

    IAgentIdentityOwner8004 public immutable identityRegistry;
    mapping(bytes32 => ValidationStatus) private statuses;
    mapping(uint256 => bytes32[]) private requestsByAgent;
    mapping(address => bytes32[]) private requestsByValidator;

    event ValidationRequested(
        bytes32 indexed requestHash,
        address indexed validatorAddress,
        uint256 indexed agentId,
        string requestURI
    );
    event ValidationResponded(
        bytes32 indexed requestHash,
        address indexed validatorAddress,
        uint256 indexed agentId,
        Response response,
        bytes32 responseHash,
        string tag
    );

    constructor(address identityRegistry_) {
        require(identityRegistry_ != address(0), "IDENTITY_ZERO");
        identityRegistry = IAgentIdentityOwner8004(identityRegistry_);
    }

    function getIdentityRegistry() external view returns (address) {
        return address(identityRegistry);
    }

    function validationRequest(address validatorAddress, uint256 agentId, string calldata requestURI, bytes32 requestHash)
        external
    {
        require(validatorAddress != address(0), "VALIDATOR_ZERO");
        require(identityRegistry.ownerOf(agentId) == msg.sender, "NOT_AGENT_OWNER");
        require(statuses[requestHash].lastUpdate == 0, "REQUEST_EXISTS");

        statuses[requestHash] = ValidationStatus({
            validatorAddress: validatorAddress,
            agentId: agentId,
            response: Response.Unknown,
            responseHash: bytes32(0),
            tag: "",
            lastUpdate: block.timestamp,
            requestURI: requestURI
        });
        requestsByAgent[agentId].push(requestHash);
        requestsByValidator[validatorAddress].push(requestHash);
        emit ValidationRequested(requestHash, validatorAddress, agentId, requestURI);
    }

    function validationResponse(bytes32 requestHash, Response response, bytes32 responseHash, string calldata tag)
        external
    {
        ValidationStatus storage status = statuses[requestHash];
        require(status.lastUpdate != 0, "UNKNOWN_REQUEST");
        require(status.validatorAddress == msg.sender, "NOT_VALIDATOR");

        status.response = response;
        status.responseHash = responseHash;
        status.tag = tag;
        status.lastUpdate = block.timestamp;
        emit ValidationResponded(requestHash, msg.sender, status.agentId, response, responseHash, tag);
    }

    function getValidationStatus(bytes32 requestHash)
        external
        view
        returns (
            address validatorAddress,
            uint256 agentId,
            uint8 response,
            bytes32 responseHash,
            string memory tag,
            uint256 lastUpdate
        )
    {
        ValidationStatus storage status = statuses[requestHash];
        return (
            status.validatorAddress,
            status.agentId,
            uint8(status.response),
            status.responseHash,
            status.tag,
            status.lastUpdate
        );
    }

    function getAgentValidations(uint256 agentId) external view returns (bytes32[] memory) {
        return requestsByAgent[agentId];
    }

    function getValidatorRequests(address validatorAddress) external view returns (bytes32[] memory) {
        return requestsByValidator[validatorAddress];
    }

    function getSummary(uint256 agentId, address[] calldata validatorAddresses, string calldata tag)
        external
        view
        returns (uint64 count, uint8 averageResponse)
    {
        bytes32[] memory ids = requestsByAgent[agentId];
        bytes32 tagHash = keccak256(bytes(tag));
        bool filterByTag = bytes(tag).length > 0;
        uint256 total;

        for (uint256 i = 0; i < ids.length; i++) {
            ValidationStatus storage status = statuses[ids[i]];
            if (status.response == Response.Unknown) continue;
            if (filterByTag && keccak256(bytes(status.tag)) != tagHash) continue;
            if (!_validatorAllowed(status.validatorAddress, validatorAddresses)) continue;
            total += uint8(status.response);
            count++;
        }

        if (count > 0) averageResponse = uint8(total / count);
    }

    function _validatorAllowed(address validator, address[] calldata validators) private pure returns (bool) {
        if (validators.length == 0) return true;
        for (uint256 i = 0; i < validators.length; i++) {
            if (validators[i] == validator) return true;
        }
        return false;
    }
}
