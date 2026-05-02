// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IENSRegistry {
    function setSubnodeRecord(bytes32 node, bytes32 label, address owner, address resolver, uint64 ttl) external;
    function setOwner(bytes32 node, address owner) external;
}

interface IPublicResolver {
    function setAddr(bytes32 node, address addr) external;
    function setText(bytes32 node, string calldata key, string calldata value) external;
}

contract AgentSubnameRegistrar {
    struct TextRecord {
        string key;
        string value;
    }

    IENSRegistry public immutable registry;
    IPublicResolver public immutable resolver;
    bytes32 public immutable parentNode;
    string public parentName;

    event AgentSubnameRegistered(
        string indexed label,
        string ensName,
        bytes32 indexed node,
        address indexed owner,
        address wallet
    );

    constructor(address ensRegistry, address publicResolver, bytes32 parent, string memory name) {
        require(ensRegistry != address(0), "REGISTRY_ZERO");
        require(publicResolver != address(0), "RESOLVER_ZERO");
        registry = IENSRegistry(ensRegistry);
        resolver = IPublicResolver(publicResolver);
        parentNode = parent;
        parentName = name;
    }

    function register(string calldata label, address owner, address wallet, TextRecord[] calldata records)
        external
        returns (bytes32 node)
    {
        require(owner == msg.sender, "OWNER_MUST_SIGN");
        require(wallet != address(0), "WALLET_ZERO");
        _validateLabel(label);

        bytes32 labelHash = keccak256(bytes(label));
        node = keccak256(abi.encodePacked(parentNode, labelHash));
        string memory ensName = string.concat(label, ".", parentName);

        registry.setSubnodeRecord(parentNode, labelHash, address(this), address(resolver), 0);
        resolver.setAddr(node, wallet);
        resolver.setText(node, "agentos.owner", _addressToString(owner));
        resolver.setText(node, "agentos.wallet", _addressToString(wallet));
        resolver.setText(node, "agentos.framework", "agentos/1.0");

        for (uint256 i = 0; i < records.length; i++) {
            resolver.setText(node, records[i].key, records[i].value);
        }

        registry.setOwner(node, owner);
        emit AgentSubnameRegistered(label, ensName, node, owner, wallet);
    }

    function _validateLabel(string calldata label) private pure {
        bytes calldata raw = bytes(label);
        require(raw.length > 0 && raw.length <= 32, "BAD_LABEL_LENGTH");
        require(raw[0] != bytes1("-") && raw[raw.length - 1] != bytes1("-"), "BAD_HYPHEN");

        for (uint256 i = 0; i < raw.length; i++) {
            bytes1 c = raw[i];
            bool lower = c >= bytes1("a") && c <= bytes1("z");
            bool number = c >= bytes1("0") && c <= bytes1("9");
            bool hyphen = c == bytes1("-");
            require(lower || number || hyphen, "BAD_LABEL_CHAR");
        }
    }

    function _addressToString(address account) private pure returns (string memory) {
        bytes20 value = bytes20(account);
        bytes16 symbols = "0123456789abcdef";
        bytes memory buffer = new bytes(42);
        buffer[0] = "0";
        buffer[1] = "x";
        for (uint256 i = 0; i < 20; i++) {
            buffer[2 + i * 2] = symbols[uint8(value[i] >> 4)];
            buffer[3 + i * 2] = symbols[uint8(value[i] & 0x0f)];
        }
        return string(buffer);
    }
}
