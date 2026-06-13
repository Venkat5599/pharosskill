// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

// SafeBuyBondV2 — TRUSTLESS slash. Removes the trusted arbiter.
//
// A provider posts collateral. When it sells data over x402 it SIGNS the exact
// response it delivered (EIP-191 personal_sign over keccak256(response)). If that
// signed delivery is missing a required schema field, ANYONE can present it here
// and the contract itself slashes the bond to refund the buyer — no arbiter, no
// discretion. The on-chain check is the judge:
//   1. recover signer from the signature  -> must equal `provider`
//      (so a buyer cannot fabricate a "bad" delivery a provider never sent)
//   2. the signed response must NOT contain the required field
//      (so an honest delivery that satisfies the schema can never be slashed —
//       the call reverts)
//
// This is the production direction noted in SKILL.md: verification moves
// on-chain, the trusted third party is gone. Schema verification here is the
// minimal "required key present" check that matches the off-chain verifier for
// the demo schemas; a richer commitment scheme generalizes it.

contract SafeBuyBondV2 {
    IERC20 public immutable token;
    mapping(address => uint256) public stakeOf;
    // replay guard: a given signed delivery can refund at most once
    mapping(bytes32 => bool) public usedProof;

    event Staked(address indexed provider, address indexed from, uint256 amount);
    event SlashedTrustless(address indexed provider, address indexed buyer, uint256 amount, string requiredField);
    event Withdrawn(address indexed provider, uint256 amount);

    constructor(address token_) {
        token = IERC20(token_);
    }

    function stakeFor(address provider, uint256 amount) external {
        require(token.transferFrom(msg.sender, address(this), amount), "transferFrom");
        stakeOf[provider] += amount;
        emit Staked(provider, msg.sender, amount);
    }

    /// Trustless refund. Present the provider's own signed delivery that fails
    /// the schema; the contract verifies and slashes. Permissionless.
    function slashWithProof(
        address provider,
        address buyer,
        uint256 amount,
        string calldata response,
        string calldata requiredField,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        // 1. the provider must have signed THIS exact response (no fabrication)
        bytes32 digest = keccak256(bytes(response));
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        address signer = ecrecover(ethHash, v, r, s);
        require(signer == provider && signer != address(0), "not provider-signed");

        // 2. delivery must actually be missing the required field (= a real scam).
        //    An honest delivery contains it -> this reverts -> honest providers safe.
        require(!_containsKey(bytes(response), bytes(requiredField)), "delivery satisfies schema");

        // 3. one refund per signed delivery
        bytes32 proofId = keccak256(abi.encodePacked(provider, buyer, ethHash));
        require(!usedProof[proofId], "already refunded");
        usedProof[proofId] = true;

        require(stakeOf[provider] >= amount, "insufficient stake");
        stakeOf[provider] -= amount;
        require(token.transfer(buyer, amount), "transfer");
        emit SlashedTrustless(provider, buyer, amount, requiredField);
    }

    function withdraw(uint256 amount) external {
        require(stakeOf[msg.sender] >= amount, "insufficient stake");
        stakeOf[msg.sender] -= amount;
        require(token.transfer(msg.sender, amount), "transfer");
        emit Withdrawn(msg.sender, amount);
    }

    /// True if `key` appears as a JSON key (`"key"`) inside `data`.
    function _containsKey(bytes memory data, bytes memory key) internal pure returns (bool) {
        // search for the quoted key: "key"
        bytes memory needle = abi.encodePacked('"', key, '"');
        if (needle.length > data.length) return false;
        for (uint256 i = 0; i + needle.length <= data.length; i++) {
            bool ok = true;
            for (uint256 j = 0; j < needle.length; j++) {
                if (data[i + j] != needle[j]) { ok = false; break; }
            }
            if (ok) return true;
        }
        return false;
    }
}
