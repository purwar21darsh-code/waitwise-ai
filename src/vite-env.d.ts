/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string
  readonly VITE_NETWORK_NAME?: string
  readonly VITE_CHAIN_ID?: string
  readonly VITE_RPC_URL?: string
  readonly VITE_EXPLORER_BASE_URL?: string
  readonly VITE_FAUCET_URL?: string
  readonly VITE_VAULT_ADDRESS?: string
}

interface ImportMeta { readonly env: ImportMetaEnv }
