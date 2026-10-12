import { ethers } from 'hardhat'

async function main() {
  if (!process.env.DEPLOYER_PRIVATE_KEY) throw new Error('Set DEPLOYER_PRIVATE_KEY in your untracked .env file first.')
  const factory = await ethers.getContractFactory('WaitwiseVault')
  const vault = await factory.deploy()
  await vault.waitForDeployment()
  const address = await vault.getAddress()
  console.log(`WaitwiseVault deployed at ${address}`)
  console.log(`Explorer: https://testnet.monadvision.com/address/${address}`)
  console.log(`Set VITE_VAULT_ADDRESS=${address} in your local .env file.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
