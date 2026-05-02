// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";

/// @title AgentIdentityRegistry8004
/// @notice ERC-8004-style identity registry for AgentFi OS agents.
contract AgentIdentityRegistry8004 is ERC721URIStorage, EIP712 {
    using ECDSA for bytes32;

    struct MetadataEntry {
        string metadataKey;
        bytes metadataValue;
    }

    uint256 public nextAgentId = 1;

    mapping(uint256 => mapping(string => bytes)) private metadataByAgent;
    mapping(uint256 => address) private agentWalletById;

    bytes32 private constant AGENT_WALLET_TYPEHASH =
        keccak256("SetAgentWallet(uint256 agentId,address newWallet,uint256 deadline)");
    bytes4 private constant ERC1271_MAGICVALUE = 0x1626ba7e;

    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);
    event MetadataSet(
        uint256 indexed agentId,
        string indexed indexedMetadataKey,
        string metadataKey,
        bytes metadataValue
    );
    event AgentWalletSet(uint256 indexed agentId, address indexed wallet);
    event AgentWalletUnset(uint256 indexed agentId);

    constructor() ERC721("AgentFi OS ERC-8004 Identity", "AFOS8004") EIP712("AgentFiOS8004", "1") {}

    function register(string calldata agentURI, MetadataEntry[] calldata metadata)
        external
        returns (uint256 agentId)
    {
        agentId = _register(agentURI);
        for (uint256 i = 0; i < metadata.length; i++) {
            _setMetadata(agentId, metadata[i].metadataKey, metadata[i].metadataValue);
        }
    }

    function register(string calldata agentURI) external returns (uint256 agentId) {
        agentId = _register(agentURI);
    }

    function register() external returns (uint256 agentId) {
        agentId = _register("");
    }

    function registerWithWallet(string calldata agentURI, MetadataEntry[] calldata metadata, address wallet)
        external
        returns (uint256 agentId)
    {
        require(wallet != address(0), "WALLET_ZERO");
        agentId = nextAgentId++;
        _safeMint(msg.sender, agentId);
        if (bytes(agentURI).length > 0) _setTokenURI(agentId, agentURI);
        agentWalletById[agentId] = wallet;
        emit Registered(agentId, agentURI, msg.sender);
        emit AgentWalletSet(agentId, wallet);
        emit MetadataSet(agentId, "agentWallet", "agentWallet", abi.encode(wallet));
        for (uint256 i = 0; i < metadata.length; i++) {
            _setMetadata(agentId, metadata[i].metadataKey, metadata[i].metadataValue);
        }
    }

    function registerFor(address owner, string calldata agentURI, MetadataEntry[] calldata metadata)
        external
        returns (uint256 agentId)
    {
        require(owner != address(0), "OWNER_ZERO");
        agentId = _registerFor(owner, agentURI);
        for (uint256 i = 0; i < metadata.length; i++) {
            _setMetadata(agentId, metadata[i].metadataKey, metadata[i].metadataValue);
        }
    }

    function setAgentURI(uint256 agentId, string calldata newURI) external {
        require(_isAuthorized(ownerOf(agentId), msg.sender, agentId), "NOT_AUTHORIZED");
        _setTokenURI(agentId, newURI);
        emit URIUpdated(agentId, newURI, msg.sender);
    }

    function getMetadata(uint256 agentId, string memory metadataKey) external view returns (bytes memory) {
        _requireOwned(agentId);
        return metadataByAgent[agentId][metadataKey];
    }

    function setMetadata(uint256 agentId, string memory metadataKey, bytes memory metadataValue) external {
        require(_isAuthorized(ownerOf(agentId), msg.sender, agentId), "NOT_AUTHORIZED");
        _setMetadata(agentId, metadataKey, metadataValue);
    }

    function getAgentWallet(uint256 agentId) external view returns (address) {
        _requireOwned(agentId);
        return agentWalletById[agentId];
    }

    function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes calldata signature) external {
        require(_isAuthorized(ownerOf(agentId), msg.sender, agentId), "NOT_AUTHORIZED");
        require(block.timestamp <= deadline, "SIGNATURE_EXPIRED");
        require(newWallet != address(0), "WALLET_ZERO");

        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(AGENT_WALLET_TYPEHASH, agentId, newWallet, deadline))
        );

        if (newWallet.code.length == 0) {
            require(digest.recover(signature) == newWallet, "BAD_EOA_SIGNATURE");
        } else {
            require(IERC1271(newWallet).isValidSignature(digest, signature) == ERC1271_MAGICVALUE, "BAD_1271_SIGNATURE");
        }

        agentWalletById[agentId] = newWallet;
        emit AgentWalletSet(agentId, newWallet);
        emit MetadataSet(agentId, "agentWallet", "agentWallet", abi.encode(newWallet));
    }

    function unsetAgentWallet(uint256 agentId) external {
        require(_isAuthorized(ownerOf(agentId), msg.sender, agentId), "NOT_AUTHORIZED");
        delete agentWalletById[agentId];
        emit AgentWalletUnset(agentId);
    }

    function _register(string memory agentURI) private returns (uint256 agentId) {
        agentId = _registerFor(msg.sender, agentURI);
    }

    function _registerFor(address owner, string memory agentURI) private returns (uint256 agentId) {
        agentId = nextAgentId++;
        _safeMint(owner, agentId);
        if (bytes(agentURI).length > 0) _setTokenURI(agentId, agentURI);
        agentWalletById[agentId] = owner;
        emit Registered(agentId, agentURI, owner);
        emit MetadataSet(agentId, "agentWallet", "agentWallet", abi.encode(owner));
    }

    function _setMetadata(uint256 agentId, string memory metadataKey, bytes memory metadataValue) private {
        require(keccak256(bytes(metadataKey)) != keccak256("agentWallet"), "RESERVED_METADATA_KEY");
        _requireOwned(agentId);
        metadataByAgent[agentId][metadataKey] = metadataValue;
        emit MetadataSet(agentId, metadataKey, metadataKey, metadataValue);
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address previousOwner) {
        previousOwner = super._update(to, tokenId, auth);
        if (previousOwner != address(0) && to != previousOwner) {
            delete agentWalletById[tokenId];
            emit AgentWalletUnset(tokenId);
        }
    }
}
