// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

/// @title Bucky
/// @notice Stablecoin contract for SHIT Protocol, based on DSS Dai (AGPL-3.0-or-later)
/// @dev Forks the MakerDAO Dai contract with configurable name/symbol.
///      Mint/burn gated by `wards` (auth) — DaiJoin is authorized to mint via rely().
///      Compatible with DssVat, DaiJoin, and the rest of the DSS stack.
contract Bucky {
    // --- Auth ---
    mapping(address => uint256) public wards;
    function rely(address guy) external auth { wards[guy] = 1; }
    function deny(address guy) external auth { wards[guy] = 0; }
    modifier auth {
        require(wards[msg.sender] == 1, "Bucky/not-authorized");
        _;
    }

    // --- ERC20 Data ---
    string public name;
    string public symbol;
    string public constant version = "1";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => uint256) public nonces;

    event Approval(address indexed src, address indexed guy, uint256 wad);
    event Transfer(address indexed src, address indexed dst, uint256 wad);

    constructor(string memory name_, string memory symbol_, uint256 chainId_) {
        name = name_;
        symbol = symbol_;
        wards[msg.sender] = 1;
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes(name)),
            keccak256(bytes(version)),
            chainId_,
            address(this)
        ));
    }

    // --- EIP712 ---
    bytes32 public DOMAIN_SEPARATOR;
    bytes32 public constant PERMIT_TYPEHASH =
        0xea2aa0a1be11a07ed86d755c93467f4f82362b452371d1ba94d1715123511acb;

    // --- Token ---
    function transfer(address dst, uint256 wad) external returns (bool) {
        return transferFrom(msg.sender, dst, wad);
    }

    function transferFrom(address src, address dst, uint256 wad) public returns (bool) {
        require(balanceOf[src] >= wad, "Bucky/insufficient-balance");
        if (src != msg.sender && allowance[src][msg.sender] != type(uint256).max) {
            require(allowance[src][msg.sender] >= wad, "Bucky/insufficient-allowance");
            allowance[src][msg.sender] -= wad;
        }
        balanceOf[src] -= wad;
        balanceOf[dst] += wad;
        emit Transfer(src, dst, wad);
        return true;
    }

    function mint(address usr, uint256 wad) external auth {
        balanceOf[usr] += wad;
        totalSupply += wad;
        emit Transfer(address(0), usr, wad);
    }

    function burn(address usr, uint256 wad) external {
        require(balanceOf[usr] >= wad, "Bucky/insufficient-balance");
        if (usr != msg.sender && allowance[usr][msg.sender] != type(uint256).max) {
            require(allowance[usr][msg.sender] >= wad, "Bucky/insufficient-allowance");
            allowance[usr][msg.sender] -= wad;
        }
        balanceOf[usr] -= wad;
        totalSupply -= wad;
        emit Transfer(usr, address(0), wad);
    }

    function approve(address usr, uint256 wad) external returns (bool) {
        allowance[msg.sender][usr] = wad;
        emit Approval(msg.sender, usr, wad);
        return true;
    }

    // --- Permit ---
    function permit(
        address holder,
        address spender,
        uint256 nonce,
        uint256 expiry,
        bool allowed,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(PERMIT_TYPEHASH, holder, spender, nonce, expiry, allowed))
            )
        );
        require(holder != address(0), "Bucky/invalid-address-0");
        require(holder == ecrecover(digest, v, r, s), "Bucky/invalid-permit");
        require(expiry == 0 || block.timestamp <= expiry, "Bucky/permit-expired");
        require(nonce == nonces[holder]++, "Bucky/invalid-nonce");
        uint256 wad = allowed ? type(uint256).max : 0;
        allowance[holder][spender] = wad;
        emit Approval(holder, spender, wad);
    }
}
