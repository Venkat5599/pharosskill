// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Minimal ERC-8004-style Reputation Registry. Stores a normalized score in basis
// points (0..10000) per agent address. safeBuy reads scoreOf() to gate providers.
// Production ERC-8004 derives score from recorded feedback/attestations; this
// keeps the read interface identical (scoreOf -> uint256 bps) so the skill is
// unchanged when a richer registry replaces it.

contract ReputationRegistry {
    address public owner;
    mapping(address => uint256) public scoreOf; // basis points, 0..10000

    event ScoreSet(address indexed agent, uint256 bps);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function setScore(address agent, uint256 bps) public onlyOwner {
        require(bps <= 10000, "bps>10000");
        scoreOf[agent] = bps;
        emit ScoreSet(agent, bps);
    }

    function setScores(address[] calldata agents, uint256[] calldata bps) external onlyOwner {
        require(agents.length == bps.length, "len");
        for (uint256 i = 0; i < agents.length; i++) {
            setScore(agents[i], bps[i]);
        }
    }
}
