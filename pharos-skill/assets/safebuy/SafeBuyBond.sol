// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

// SafeBuyBond — provider stake + buyer refund-by-slash.
//
// A provider posts a collateral bond in the settlement token. When a paid
// delivery fails the buyer's schema check, the safeBuy arbiter slashes the
// provider's bond to refund the buyer on-chain. This makes "auto-refund" real:
// x402 payment is final, but the buyer is made whole from the provider's stake.
//
// `stakeFor` lets anyone post a bond on a provider's behalf (handy for demos /
// onboarding). `arbiter` is the address authorized to slash — in production this
// is replaced by an optimistic dispute window + on-chain verification proof.

contract SafeBuyBond {
    IERC20 public immutable token;
    address public arbiter;
    mapping(address => uint256) public stakeOf;

    event Staked(address indexed provider, address indexed from, uint256 amount);
    event Slashed(address indexed provider, address indexed buyer, uint256 amount);
    event Withdrawn(address indexed provider, uint256 amount);

    constructor(address token_, address arbiter_) {
        token = IERC20(token_);
        arbiter = arbiter_;
    }

    /// Post a bond for `provider`, pulling tokens from the caller.
    function stakeFor(address provider, uint256 amount) external {
        require(token.transferFrom(msg.sender, address(this), amount), "transferFrom");
        stakeOf[provider] += amount;
        emit Staked(provider, msg.sender, amount);
    }

    /// Refund `buyer` from `provider`'s bond after a failed delivery.
    function slash(address provider, address buyer, uint256 amount) external {
        require(msg.sender == arbiter, "not arbiter");
        require(stakeOf[provider] >= amount, "insufficient stake");
        stakeOf[provider] -= amount;
        require(token.transfer(buyer, amount), "transfer");
        emit Slashed(provider, buyer, amount);
    }

    /// A provider reclaims its remaining bond.
    function withdraw(uint256 amount) external {
        require(stakeOf[msg.sender] >= amount, "insufficient stake");
        stakeOf[msg.sender] -= amount;
        require(token.transfer(msg.sender, amount), "transfer");
        emit Withdrawn(msg.sender, amount);
    }
}
