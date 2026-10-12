import 'dotenv/config'
import '@nomicfoundation/hardhat-ethers'
import type { HardhatUserConfig } from 'hardhat/config'

const rpcUrl = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz'
const deployerKey = process.env.DEPLOYER_PRIVATE_KEY

const config: HardhatUserConfig = {
  solidity: '0.8.24',
  paths: { sources: './contracts', tests: './contracts/test', cache: './cache', artifacts: './artifacts' },
  networks: {
    hardhat: {},
    monadTestnet: {
      url: rpcUrl,
      chainId: 10143,
      accounts: deployerKey ? [deployerKey] : [],
    },
  },
}

export default config
