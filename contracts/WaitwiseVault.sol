// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title WaitwiseVault
/// @notice Non-custodial, non-yielding native MON goal vault for Monad Testnet demos.
/// Funds can be withdrawn by their owner after cancellation, goal completion, or deadline.
contract WaitwiseVault {
    enum Status { Active, Completed, Cancelled, Expired }

    struct Goal {
        address owner;
        uint256 targetAmount;
        uint256 balance;
        uint64 deadline;
        Status storedStatus;
        bytes32 referenceHash;
    }

    uint256 public totalGoals;
    mapping(uint256 => Goal) private goals;
    mapping(address => uint256[]) private ownerGoals;
    uint256 private entered = 1;

    event GoalCreated(address indexed owner, uint256 indexed goalId, uint256 targetAmount, uint64 deadline, bytes32 referenceHash);
    event Deposited(address indexed owner, uint256 indexed goalId, uint256 amount, uint256 newBalance);
    event GoalCancelled(address indexed owner, uint256 indexed goalId);
    event Withdrawn(address indexed owner, uint256 indexed goalId, uint256 amount);

    modifier nonReentrant() {
        require(entered == 1, "Reentrancy");
        entered = 2;
        _;
        entered = 1;
    }

    function createGoal(uint256 targetAmount, uint64 deadline, bytes32 referenceHash) external returns (uint256 goalId) {
        require(targetAmount > 0, "Target must be positive");
        require(deadline == 0 || deadline > block.timestamp, "Deadline must be in future");
        goalId = ++totalGoals;
        goals[goalId] = Goal({
            owner: msg.sender,
            targetAmount: targetAmount,
            balance: 0,
            deadline: deadline,
            storedStatus: Status.Active,
            referenceHash: referenceHash
        });
        ownerGoals[msg.sender].push(goalId);
        emit GoalCreated(msg.sender, goalId, targetAmount, deadline, referenceHash);
    }

    function deposit(uint256 goalId) external payable {
        Goal storage goal = _goal(goalId);
        require(goal.owner == msg.sender, "Not goal owner");
        require(goal.storedStatus == Status.Active, "Goal is not active");
        require(goal.deadline == 0 || block.timestamp < goal.deadline, "Deadline reached");
        require(msg.value > 0, "Deposit must be positive");
        goal.balance += msg.value;
        if (goal.balance >= goal.targetAmount) goal.storedStatus = Status.Completed;
        emit Deposited(msg.sender, goalId, msg.value, goal.balance);
    }

    function cancelGoal(uint256 goalId) external {
        Goal storage goal = _goal(goalId);
        require(goal.owner == msg.sender, "Not goal owner");
        require(goal.storedStatus == Status.Active, "Goal is not active");
        goal.storedStatus = Status.Cancelled;
        emit GoalCancelled(msg.sender, goalId);
    }

    function withdraw(uint256 goalId, uint256 amount) external nonReentrant {
        Goal storage goal = _goal(goalId);
        require(goal.owner == msg.sender, "Not goal owner");
        require(_isWithdrawable(goal), "Cancel, complete, or wait for deadline");
        require(amount > 0 && amount <= goal.balance, "Invalid withdrawal amount");
        goal.balance -= amount;
        emit Withdrawn(msg.sender, goalId, amount);
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");
    }

    function getGoal(uint256 goalId) external view returns (Goal memory) {
        return _goal(goalId);
    }

    function getStatus(uint256 goalId) external view returns (Status) {
        return _visibleStatus(_goal(goalId));
    }

    function getOwnerGoalIds(address owner) external view returns (uint256[] memory) {
        return ownerGoals[owner];
    }

    function _isWithdrawable(Goal storage goal) private view returns (bool) {
        return goal.storedStatus != Status.Active || (goal.deadline != 0 && block.timestamp >= goal.deadline);
    }

    function _visibleStatus(Goal storage goal) private view returns (Status) {
        if (goal.storedStatus == Status.Active && goal.deadline != 0 && block.timestamp >= goal.deadline) return Status.Expired;
        return goal.storedStatus;
    }

    function _goal(uint256 goalId) private view returns (Goal storage goal) {
        require(goalId > 0 && goalId <= totalGoals, "Goal does not exist");
        return goals[goalId];
    }
}
