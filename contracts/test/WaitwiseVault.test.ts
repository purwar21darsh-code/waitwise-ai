import { expect } from 'chai'
import { ethers } from 'hardhat'

async function expectRevert(action: () => Promise<unknown>, reason: string) {
  let message = ''
  try { await action() } catch (error) { message = String(error) }
  expect(message, `expected revert containing: ${reason}`).to.include(reason)
}

function decodedEvent(contract: any, receipt: any, eventName: string) {
  return receipt.logs.map((log: any) => {
    try { return contract.interface.parseLog(log) } catch { return null }
  }).find((event: any) => event?.name === eventName)
}

describe('WaitwiseVault', () => {
  async function fixture() {
    const [owner, stranger] = await ethers.getSigners()
    const factory = await ethers.getContractFactory('WaitwiseVault')
    const vault = await factory.deploy()
    await vault.waitForDeployment()
    return { owner, stranger, vault }
  }

  it('creates goals with an owner, target, deadline, and reference hash', async () => {
    const { owner, vault } = await fixture()
    const target = ethers.parseEther('2')
    const deadline = Math.floor(Date.now() / 1000) + 3600
    const tx = await vault.createGoal(target, deadline, ethers.id('study-laptop'))
    const event = decodedEvent(vault, await tx.wait(), 'GoalCreated')
    expect(Array.from(event.args)).to.deep.equal([owner.address, 1n, target, BigInt(deadline), ethers.id('study-laptop')])
    const goal = await vault.getGoal(1)
    expect(goal.owner).to.equal(owner.address)
    expect(goal.targetAmount).to.equal(target)
    expect(await vault.totalGoals()).to.equal(1n)
    expect(await vault.getOwnerGoalIds(owner.address)).to.deep.equal([1n])
  })

  it('rejects zero targets, deadlines that are not in the future, and unknown ids', async () => {
    const { vault } = await fixture()
    await expectRevert(() => vault.createGoal(0, 0, ethers.ZeroHash), 'Target must be positive')
    await expectRevert(() => vault.createGoal(1, 1, ethers.ZeroHash), 'Deadline must be in future')
    await expectRevert(() => vault.getGoal(1), 'Goal does not exist')
  })

  it('accepts native deposits and tracks balance and completion', async () => {
    const { owner, vault } = await fixture()
    const target = ethers.parseEther('0.5')
    await vault.createGoal(target, 0, ethers.ZeroHash)
    const firstDeposit = await vault.deposit(1, { value: ethers.parseEther('0.2') })
    const depositEvent = decodedEvent(vault, await firstDeposit.wait(), 'Deposited')
    expect(Array.from(depositEvent.args)).to.deep.equal([owner.address, 1n, ethers.parseEther('0.2'), ethers.parseEther('0.2')])
    await vault.deposit(1, { value: ethers.parseEther('0.3') })
    expect((await vault.getGoal(1)).balance).to.equal(target)
    expect(await vault.getStatus(1)).to.equal(1n)
  })

  it('rejects unauthorized access, duplicate cancellation, and invalid deposits or withdrawals', async () => {
    const { owner, stranger, vault } = await fixture()
    await vault.createGoal(ethers.parseEther('1'), 0, ethers.ZeroHash)
    await expectRevert(() => vault.connect(stranger).deposit(1, { value: 1 }), 'Not goal owner')
    await expectRevert(() => vault.deposit(1), 'Deposit must be positive')
    const cancel = await vault.cancelGoal(1)
    const cancelEvent = decodedEvent(vault, await cancel.wait(), 'GoalCancelled')
    expect(Array.from(cancelEvent.args)).to.deep.equal([owner.address, 1n])
    await expectRevert(() => vault.cancelGoal(1), 'Goal is not active')
    await expectRevert(() => vault.connect(stranger).withdraw(1, 1), 'Not goal owner')
    await expectRevert(() => vault.withdraw(1, 0), 'Invalid withdrawal amount')
    await expectRevert(() => vault.withdraw(1, 1), 'Invalid withdrawal amount')
  })

  it('enforces deadline boundaries and permits recovery at the deadline', async () => {
    const { owner, vault } = await fixture()
    const latest = await ethers.provider.getBlock('latest')
    const deadline = Number(latest!.timestamp) + 100
    await vault.createGoal(ethers.parseEther('5'), deadline, ethers.ZeroHash)
    await vault.deposit(1, { value: ethers.parseEther('1') })
    await expectRevert(() => vault.connect(owner).withdraw(1, ethers.parseEther('1')), 'Cancel, complete, or wait for deadline')
    await ethers.provider.send('evm_setNextBlockTimestamp', [deadline])
    await expectRevert(() => vault.deposit(1, { value: 1 }), 'Deadline reached')
    expect(await vault.getStatus(1)).to.equal(3n)
    const balanceBefore = await ethers.provider.getBalance(owner.address)
    const tx = await vault.withdraw(1, ethers.parseEther('1'))
    const receipt = await tx.wait()
    const gas = receipt!.gasUsed * receipt!.gasPrice
    expect(await ethers.provider.getBalance(owner.address)).to.equal(balanceBefore + ethers.parseEther('1') - gas)
  })

  it('allows cancellation at any time and partial recovery afterward', async () => {
    const { owner, vault } = await fixture()
    await vault.createGoal(ethers.parseEther('5'), 0, ethers.ZeroHash)
    await vault.deposit(1, { value: ethers.parseEther('2') })
    await vault.cancelGoal(1)
    const partial = await vault.withdraw(1, ethers.parseEther('0.5'))
    const partialEvent = decodedEvent(vault, await partial.wait(), 'Withdrawn')
    expect(Array.from(partialEvent.args)).to.deep.equal([owner.address, 1n, ethers.parseEther('0.5')])
    expect((await vault.getGoal(1)).balance).to.equal(ethers.parseEther('1.5'))
    await vault.withdraw(1, ethers.parseEther('1.5'))
    expect((await vault.getGoal(1)).balance).to.equal(0n)
  })

  it('blocks reentrant withdrawal attempts', async () => {
    const { vault } = await fixture()
    const attackerFactory = await ethers.getContractFactory('ReentrantWithdrawer')
    const attacker = await attackerFactory.deploy(await vault.getAddress())
    await attacker.waitForDeployment()
    await attacker.setUpGoal({ value: ethers.parseEther('1') })
    await attacker.startAttack()
    expect(await attacker.reentered()).to.equal(false)
    expect((await vault.getGoal(1)).balance).to.equal(0n)
  })
})
