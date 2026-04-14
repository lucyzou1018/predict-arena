# Predict Arena Deployment Notes

## Base Sepolia contract

- `BtcPredictArena`: `0xB9817976711542185ec410BBBD1e784D9fB67e29`
- `USDC`: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Network: `Base Sepolia` (`chainId = 84532`)

## Required env updates

### Client

Set these in the frontend deployment environment:

- `VITE_CONTRACT_ADDRESS=0xB9817976711542185ec410BBBD1e784D9fB67e29`
- `VITE_USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e`

### Server

Set these in the backend deployment environment:

- `CONTRACT_ADDRESS=0xB9817976711542185ec410BBBD1e784D9fB67e29`
- `USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- `RPC_URL=<base sepolia rpc>`
- `ORACLE_PRIVATE_KEY=<owner wallet for the deployed contract>`

## Why this redeploy was needed

The previous test contract pointed to the Base mainnet USDC address, so `approve` could succeed while `payForGame` could not complete on Base Sepolia. The new contract is deployed against the correct Base Sepolia USDC address and includes owner-managed create/join helpers so the server can create and fill chain games before users pay.
