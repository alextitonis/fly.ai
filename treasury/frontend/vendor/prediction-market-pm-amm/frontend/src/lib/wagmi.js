import { http, createConfig } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

// RPC URL - using Alchemy Sepolia
const ALCHEMY_RPC = 'https://eth-sepolia.g.alchemy.com/v2/li4OnJ2X49q4tjD1XWg0fCvYwOHXnVDc'

export const config = createConfig({
    chains: [sepolia],
    connectors: [
        injected(),
    ],
    transports: {
        [sepolia.id]: http(ALCHEMY_RPC),
    },
})

// Deployed Contract Addresses on Sepolia
export const ROUTER = '0x9cac07fd1a2196caf7c79932cf473bf0fb72ba9b';
export const MOCK_USD = '0x2296fa2947a3f59d1fbf5d43e97498c0120e1347';
