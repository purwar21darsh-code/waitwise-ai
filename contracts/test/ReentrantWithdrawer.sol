// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IWaitwiseVault {
    function createGoal(uint256 targetAmount, uint64 deadline, bytes32 referenceHash) external returns (uint256);
    function deposit(uint256 goalId) external payable;
    function cancelGoal(uint256 goalId) external;
    function withdraw(uint256 goalId, uint256 amount) external;
    function totalGoals() external view returns (uint256);
}

contract ReentrantWithdrawer {
    IWaitwiseVault public immutable vault;
    uint256 public goalId;
    bool public reentered;

    constructor(address vaultAddress) { vault = IWaitwiseVault(vaultAddress); }

    function setUpGoal() external payable {
        vault.createGoal(2 ether, 0, bytes32(0));
        goalId = vault.totalGoals();
        vault.deposit{value: msg.value}(goalId);
        vault.cancelGoal(goalId);
    }

    function startAttack() external { vault.withdraw(goalId, 1 ether); }

    receive() external payable {
        (bool success, ) = address(vault).call(abi.encodeCall(IWaitwiseVault.withdraw, (goalId, 1 ether)));
        if (success) reentered = true;
    }
}
