import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWriteContract, useWaitForTransactionReceipt, useAccount, usePublicClient } from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { useEffect, useRef } from 'react'
import { RouterABI, LvrMarketABI, MockUSDABI, ERC20ABI, MARKET_STATES } from '../lib/contracts'
import { ROUTER, MOCK_USD } from '../lib/wagmi'

// Cache key prefixes
const CACHE_KEYS = {
    MARKETS: 'markets',
    MARKET_DETAILS: 'market-details',
    MUSD_BALANCE: 'musd-balance',
    USER_BALANCES: 'user-balances',
    ALLOWANCE: 'allowance',
}

// Clear localStorage cache
const clearCache = () => {
    Object.values(CACHE_KEYS).forEach(key => {
        localStorage.removeItem(key)
    })
}

// Hook to check mUSD allowance for Router
export function useAllowance() {
    const { address: userAddress } = useAccount()
    const publicClient = usePublicClient()

    return useQuery({
        queryKey: [CACHE_KEYS.ALLOWANCE, userAddress],
        queryFn: async () => {
            if (!userAddress) return '0'

            const allowance = await publicClient.readContract({
                address: MOCK_USD,
                abi: ERC20ABI,
                functionName: 'allowance',
                args: [userAddress, ROUTER],
            })

            return formatEther(allowance)
        },
        enabled: !!userAddress,
        staleTime: 10 * 1000,
        refetchInterval: 15 * 1000,
    })
}

// Hook to get all markets
export function useMarkets() {
    const publicClient = usePublicClient()

    return useQuery({
        queryKey: [CACHE_KEYS.MARKETS],
        queryFn: async () => {
            if (!ROUTER || ROUTER === '0x0000000000000000000000000000000000000000') {
                return []
            }

            const marketAddresses = await publicClient.readContract({
                address: ROUTER,
                abi: RouterABI,
                functionName: 'getAllMarkets',
            })

            if (!marketAddresses || marketAddresses.length === 0) {
                return []
            }

            // Fetch details for each market
            const markets = await Promise.all(
                marketAddresses.map(async (address, index) => {
                    try {
                        const [, marketId] = await publicClient.readContract({
                            address: ROUTER,
                            abi: RouterABI,
                            functionName: 'getMarketAtIndex',
                            args: [BigInt(index)],
                        })

                        const metadata = await publicClient.readContract({
                            address: ROUTER,
                            abi: RouterABI,
                            functionName: 'getMarketMetadata',
                            args: [marketId],
                        })

                        const details = await publicClient.readContract({
                            address: address,
                            abi: LvrMarketABI,
                            functionName: 'getMarketDetails',
                        })

                        return {
                            address,
                            marketId,
                            title: metadata[2],
                            description: metadata[3],
                            resolutionSource: metadata[4],
                            liquidity: formatEther(details[3]), // Use actual liquidity from market, not initial
                            state: MARKET_STATES[details[0]] || 'UNKNOWN',
                            deadline: Number(details[1]),
                            outcome: Number(details[2]),
                            priceYes: Number(formatEther(details[6])),
                            priceNo: Number(formatEther(details[7])),
                        }
                    } catch (e) {
                        console.error('Error fetching market:', e)
                        return null
                    }
                })
            )

            return markets.filter(m => m !== null)
        },
        staleTime: 30 * 1000, // 30 seconds
        gcTime: 5 * 60 * 1000, // 5 minutes
    })
}

// Hook to get single market details
export function useMarketDetails(marketAddress) {
    const publicClient = usePublicClient()

    return useQuery({
        queryKey: [CACHE_KEYS.MARKET_DETAILS, marketAddress],
        queryFn: async () => {
            if (!marketAddress) return null

            // 1. Fetch Basic LvrMarket details
            const detailsPromise = publicClient.readContract({
                address: marketAddress,
                abi: LvrMarketABI,
                functionName: 'getMarketDetails',
            })

            // 2. Fetch Admin
            const adminPromise = publicClient.readContract({
                address: marketAddress,
                abi: LvrMarketABI,
                functionName: 'i_admin',
            }).catch(() => null)

            // 2.1 Fetch Tokens
            const [yesTokenPromise, noTokenPromise] = [
                publicClient.readContract({
                    address: marketAddress,
                    abi: LvrMarketABI,
                    functionName: 'yesToken',
                }),
                publicClient.readContract({
                    address: marketAddress,
                    abi: LvrMarketABI,
                    functionName: 'noToken',
                })
            ]

            // 3. Fetch Metadata from Router
            const metadataPromise = (async () => {
                try {
                    // Get all market addresses to find index
                    const allMarkets = await publicClient.readContract({
                        address: ROUTER,
                        abi: RouterABI,
                        functionName: 'getAllMarkets',
                    })

                    const index = allMarkets.findIndex(a => a.toLowerCase() === marketAddress.toLowerCase())

                    if (index === -1) return { title: "Unknown", description: "" }

                    const [, marketId] = await publicClient.readContract({
                        address: ROUTER,
                        abi: RouterABI,
                        functionName: 'getMarketAtIndex',
                        args: [BigInt(index)],
                    })

                    const meta = await publicClient.readContract({
                        address: ROUTER,
                        abi: RouterABI,
                        functionName: 'getMarketMetadata',
                        args: [marketId],
                    })

                    return {
                        title: meta[2],
                        description: meta[3],
                        resolutionSource: meta[4]
                    }
                } catch (e) {
                    console.error("Metadata fetch error", e)
                    return { title: "Untitled Market", description: "" }
                }
            })()

            const [details, admin, metadata, yesToken, noToken] = await Promise.all([detailsPromise, adminPromise, metadataPromise, yesTokenPromise, noTokenPromise])

            return {
                state: MARKET_STATES[details[0]] || 'UNKNOWN',
                deadline: Number(details[1]),
                outcome: Number(details[2]),
                liquidity: formatEther(details[3]),
                reserveYes: formatEther(details[4]),
                reserveNo: formatEther(details[5]),
                priceYes: Number(formatEther(details[6])),
                priceNo: Number(formatEther(details[7])),
                admin: admin,
                yesToken: yesToken,
                noToken: noToken,
                title: metadata.title,
                description: metadata.description,
                resolutionSource: metadata.resolutionSource
            }
        },
        enabled: !!marketAddress,
        staleTime: 10 * 1000,
    })
}

// Hook to get mUSD balance only (no market required)
export function useMUSDBalance() {
    const { address: userAddress } = useAccount()
    const publicClient = usePublicClient()

    return useQuery({
        queryKey: [CACHE_KEYS.MUSD_BALANCE, userAddress],
        queryFn: async () => {
            if (!userAddress) return '0'

            const balance = await publicClient.readContract({
                address: MOCK_USD,
                abi: ERC20ABI,
                functionName: 'balanceOf',
                args: [userAddress],
            })

            return formatEther(balance)
        },
        enabled: !!userAddress,
        staleTime: 5 * 1000, // 5 seconds - refresh more often
        refetchInterval: 10 * 1000, // Auto-refresh every 10s
    })
}

// LocalStorage helper for tracking user purchases per market
const LOCAL_PURCHASES_KEY = 'user_purchases'

function getLocalPurchases() {
    try {
        const data = localStorage.getItem(LOCAL_PURCHASES_KEY)
        return data ? JSON.parse(data) : {}
    } catch {
        return {}
    }
}

function saveLocalPurchases(purchases) {
    localStorage.setItem(LOCAL_PURCHASES_KEY, JSON.stringify(purchases))
}

export function addLocalPurchase(marketAddress, outcome, amount) {
    const purchases = getLocalPurchases()
    const key = marketAddress?.toLowerCase()
    if (!purchases[key]) {
        purchases[key] = { yes: 0, no: 0 }
    }
    if (outcome === 'yes') {
        purchases[key].yes += parseFloat(amount)
    } else {
        purchases[key].no += parseFloat(amount)
    }
    saveLocalPurchases(purchases)
}

export function getLocalPurchase(marketAddress) {
    const purchases = getLocalPurchases()
    const key = marketAddress?.toLowerCase()
    return purchases[key] || { yes: 0, no: 0 }
}

// Hook to get user token balances for a specific market (fetches real on-chain balances)
export function useUserBalances(marketAddress) {
    const { address: userAddress } = useAccount()
    const publicClient = usePublicClient()

    return useQuery({
        queryKey: [CACHE_KEYS.USER_BALANCES, marketAddress, userAddress],
        queryFn: async () => {
            if (!marketAddress || !userAddress) return null

            try {
                // 1. Get token addresses from the market
                const [yesTokenAddr, noTokenAddr] = await Promise.all([
                    publicClient.readContract({
                        address: marketAddress,
                        abi: LvrMarketABI,
                        functionName: 'yesToken',
                    }),
                    publicClient.readContract({
                        address: marketAddress,
                        abi: LvrMarketABI,
                        functionName: 'noToken',
                    })
                ])

                // 2. Get user balances for these tokens
                const [yesBalance, noBalance] = await Promise.all([
                    publicClient.readContract({
                        address: yesTokenAddr,
                        abi: ERC20ABI,
                        functionName: 'balanceOf',
                        args: [userAddress],
                    }),
                    publicClient.readContract({
                        address: noTokenAddr,
                        abi: ERC20ABI,
                        functionName: 'balanceOf',
                        args: [userAddress],
                    })
                ])

                return {
                    yes: formatEther(yesBalance),
                    no: formatEther(noBalance),
                    yesRaw: yesBalance.toString(),
                    noRaw: noBalance.toString(),
                    mUSD: '0', // This is handled by useMUSDBalance
                }
            } catch (error) {
                console.error('Error fetching user balances:', error)
                return { yes: '0', no: '0', mUSD: '0' }
            }
        },
        enabled: !!marketAddress && !!userAddress,
        staleTime: 5000, // 5 seconds
    })
}

// Hook to buy Yes/No tokens
export function useTrade() {
    const queryClient = useQueryClient()
    const { writeContract, data: hash, isPending, reset } = useWriteContract()
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

    // Track the current pending trade info with proper ref
    const pendingTradeRef = useRef(null)

    useEffect(() => {
        if (isSuccess && pendingTradeRef.current) {
            // Add the purchase to local storage
            const { marketAddress, outcome, shares } = pendingTradeRef.current
            addLocalPurchase(marketAddress, outcome, shares)
            pendingTradeRef.current = null

            clearCache()
            queryClient.invalidateQueries({ queryKey: [CACHE_KEYS.MARKETS] })
            queryClient.invalidateQueries({ queryKey: [CACHE_KEYS.MARKET_DETAILS] })
            queryClient.invalidateQueries({ queryKey: [CACHE_KEYS.USER_BALANCES] })
            queryClient.invalidateQueries({ queryKey: [CACHE_KEYS.MUSD_BALANCE] })
        }
    }, [isSuccess, queryClient])

    // Simple calculation: shares = amount / price
    // Example: If YES is at 50% ($0.50) and you spend $10, you get 20 shares
    const calculateShares = (amountIn, priceOfToken) => {
        const amount = parseFloat(amountIn)
        // Price is between 0 and 1 (e.g., 0.5 = 50%)
        const price = Math.max(priceOfToken || 0.5, 0.05) // Floor at 5% to avoid huge numbers
        return amount / price
    }

    const buyYes = (marketAddress, amount, priceYes) => {
        const estimatedShares = calculateShares(amount, priceYes)
        pendingTradeRef.current = { marketAddress, outcome: 'yes', shares: estimatedShares }
        writeContract({
            address: ROUTER,
            abi: RouterABI,
            functionName: 'buyYes',
            args: [marketAddress, parseEther(amount.toString())],
            gas: 500000n,
        })
    }

    const buyNo = (marketAddress, amount, priceNo) => {
        const estimatedShares = calculateShares(amount, priceNo)
        pendingTradeRef.current = { marketAddress, outcome: 'no', shares: estimatedShares }
        writeContract({
            address: ROUTER,
            abi: RouterABI,
            functionName: 'buyNo',
            args: [marketAddress, parseEther(amount.toString())],
            gas: 500000n,
        })
    }

    return { buyYes, buyNo, isPending, isConfirming, isSuccess, hash, reset }
}

// Hook to mint Mock USD
export function useMintMockUSD() {
    const { address } = useAccount()
    const queryClient = useQueryClient()
    const { writeContract, data: hash, isPending, reset } = useWriteContract()
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

    useEffect(() => {
        if (isSuccess) {
            clearCache()
            queryClient.invalidateQueries({ queryKey: [CACHE_KEYS.MUSD_BALANCE] })
            queryClient.invalidateQueries({ queryKey: [CACHE_KEYS.USER_BALANCES] })
        }
    }, [isSuccess, queryClient])

    const mint = (amount = '1000') => {
        if (!address) return
        writeContract({
            address: MOCK_USD,
            abi: MockUSDABI,
            functionName: 'mint',
            args: [address, parseEther(amount)],
        })
    }

    return { mint, isPending, isConfirming, isSuccess, hash, reset }
}

// Hook to create a new market
export function useCreateMarket() {
    const queryClient = useQueryClient()
    const { writeContract, data: hash, isPending, reset } = useWriteContract()
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

    useEffect(() => {
        if (isSuccess) {
            clearCache()
            queryClient.invalidateQueries({ queryKey: [CACHE_KEYS.MARKETS] })
            queryClient.invalidateQueries({ queryKey: [CACHE_KEYS.MUSD_BALANCE] })
        }
    }, [isSuccess, queryClient])

    const createMarket = ({ title, description, resolutionSource, isDynamic, duration, collateral }) => {
        let durationSeconds = 0n;

        if (typeof duration === 'object') {
            const { days = 0, hours = 0, minutes = 0 } = duration;
            durationSeconds = BigInt(
                (parseInt(days) * 24 * 60 * 60) +
                (parseInt(hours) * 60 * 60) +
                (parseInt(minutes) * 60)
            );
        } else {
            // Fallback for legacy calls or direct seconds
            durationSeconds = BigInt(duration) * 24n * 60n * 60n;
        }

        // Minimum duration check (e.g. 1 hour) could be added here or in UI
        if (durationSeconds < 60n) {
            console.error("Duration too short");
            return;
        }

        writeContract({
            address: ROUTER,
            abi: RouterABI,
            functionName: 'create',
            args: [title, description, resolutionSource, isDynamic, durationSeconds, parseEther(collateral.toString())],
        })
    }

    return { createMarket, isPending, isConfirming, isSuccess, hash, reset }
}

// Hook to approve mUSD spending
export function useApproveMUSD() {
    const queryClient = useQueryClient()
    const { writeContract, data: hash, isPending, reset } = useWriteContract()
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

    useEffect(() => {
        if (isSuccess) {
            queryClient.invalidateQueries({ queryKey: [CACHE_KEYS.ALLOWANCE] })
        }
    }, [isSuccess, queryClient])

    const approve = (amount) => {
        writeContract({
            address: MOCK_USD,
            abi: ERC20ABI,
            functionName: 'approve',
            args: [ROUTER, parseEther(amount.toString())],
        })
    }

    return { approve, isPending, isConfirming, isSuccess, hash, reset }
}

// Hook to resolve market (Admin only)
export function useAdminResolve() {
    const queryClient = useQueryClient()
    const { writeContract, data: hash, isPending, reset } = useWriteContract()
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

    useEffect(() => {
        if (isSuccess) {
            queryClient.invalidateQueries({ queryKey: [CACHE_KEYS.MARKET_DETAILS] })
            queryClient.invalidateQueries({ queryKey: [CACHE_KEYS.MARKETS] })
        }
    }, [isSuccess, queryClient])

    const resolve = (marketAddress, outcome) => {
        writeContract({
            address: marketAddress,
            abi: LvrMarketABI,
            functionName: 'adminResolve',
            args: [BigInt(outcome)],
            gas: 500000n,
        })
    }

    return { resolve, isPending, isConfirming, isSuccess, hash, reset }
}

// Hook to check allowance for any token (YES/NO tokens specificially)
export function useTokenAllowance(tokenAddress) {
    const { address: userAddress } = useAccount()
    const publicClient = usePublicClient()

    return useQuery({
        queryKey: [CACHE_KEYS.ALLOWANCE, tokenAddress, userAddress],
        queryFn: async () => {
            if (!userAddress || !tokenAddress) return { value: '0', valueRaw: '0' }

            const allowance = await publicClient.readContract({
                address: tokenAddress,
                abi: ERC20ABI,
                functionName: 'allowance',
                args: [userAddress, ROUTER],
            })

            return {
                value: formatEther(allowance),
                valueRaw: allowance.toString()
            }
        },
        enabled: !!userAddress && !!tokenAddress,
        staleTime: 10 * 1000,
    })
}

// Hook to approve any token
export function useApproveToken() {
    const queryClient = useQueryClient()
    const { writeContract, data: hash, isPending, reset } = useWriteContract()
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

    useEffect(() => {
        if (isSuccess) {
            queryClient.invalidateQueries({ queryKey: [CACHE_KEYS.ALLOWANCE] })
        }
    }, [isSuccess, queryClient])

    const approve = (tokenAddress, amount) => {
        const val = (typeof amount === 'bigint' || (typeof amount === 'string' && amount.length > 20))
            ? BigInt(amount.toString())
            : parseEther(amount.toString())

        writeContract({
            address: tokenAddress,
            abi: ERC20ABI,
            functionName: 'approve',
            args: [ROUTER, val],
        })
    }

    return { approve, isPending, isConfirming, isSuccess, hash, reset }
}

// Hook to redeem collateral
export function useRedeem() {
    const queryClient = useQueryClient()
    const { writeContract, data: hash, isPending, reset } = useWriteContract()
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

    useEffect(() => {
        if (isSuccess) {
            queryClient.invalidateQueries({ queryKey: [CACHE_KEYS.USER_BALANCES] })
            queryClient.invalidateQueries({ queryKey: [CACHE_KEYS.MUSD_BALANCE] })
        }
    }, [isSuccess, queryClient])

    const redeem = (marketAddress, amountYes, amountNo) => {
        // Strict Check: If it's a BigInt, use it (assumed RAW WEI).
        // If it's a string, we parse it as Ether (user input "10.5").
        // To be safe for callers passing stringified raw ints, we can check for that too, but strict typing is better.

        const yesVal = typeof amountYes === 'bigint' ? amountYes : parseEther(amountYes.toString());
        const noVal = typeof amountNo === 'bigint' ? amountNo : parseEther(amountNo.toString());

        writeContract({
            address: ROUTER,
            abi: RouterABI,
            functionName: 'redeem',
            args: [marketAddress, yesVal, noVal],
            gas: 500000n,
        })
    }

    return { redeem, isPending, isConfirming, isSuccess, hash, reset }
}

// Hook to get user portfolio data across all markets
export function usePortfolio() {
    const { address: userAddress } = useAccount()
    const publicClient = usePublicClient()
    const { data: markets, isLoading: isMarketsLoading } = useMarkets()

    return useQuery({
        queryKey: [CACHE_KEYS.USER_BALANCES, 'portfolio', userAddress, markets?.length],
        queryFn: async () => {
            if (!userAddress || !markets || markets.length === 0) {
                return {
                    portfolioValue: 0,
                    activePositions: 0,
                    positions: []
                }
            }

            // Fetch balances for all markets
            // Note: Optimally this would use multicall, but for simplicity we'll do parallel requests
            // or improved fetching. For now, doing parallel fetches.
            const positions = await Promise.all(
                markets.map(async (market) => {
                    try {
                        // Get token addresses
                        const [yesTokenAddr, noTokenAddr] = await Promise.all([
                            publicClient.readContract({
                                address: market.address,
                                abi: LvrMarketABI,
                                functionName: 'yesToken',
                            }),
                            publicClient.readContract({
                                address: market.address,
                                abi: LvrMarketABI,
                                functionName: 'noToken',
                            })
                        ])

                        // Get balances
                        const [yesBalance, noBalance] = await Promise.all([
                            publicClient.readContract({
                                address: yesTokenAddr,
                                abi: ERC20ABI,
                                functionName: 'balanceOf',
                                args: [userAddress],
                            }),
                            publicClient.readContract({
                                address: noTokenAddr,
                                abi: ERC20ABI,
                                functionName: 'balanceOf',
                                args: [userAddress],
                            })
                        ])

                        const yesBal = parseFloat(formatEther(yesBalance))
                        const noBal = parseFloat(formatEther(noBalance))

                        if (yesBal === 0 && noBal === 0) return null

                        // Calculate value
                        const yesValue = yesBal * market.priceYes
                        const noValue = noBal * market.priceNo
                        const totalValue = yesValue + noValue

                        return {
                            market: market,
                            yesShares: yesBal,
                            noShares: noBal,
                            yesValue,
                            noValue,
                            totalValue,
                        }
                    } catch (e) {
                        console.error('Error fetching position for market:', market.address, e)
                        return null
                    }
                })
            )

            const active = positions.filter(p => p !== null)
            const totalValue = active.reduce((sum, p) => sum + p.totalValue, 0)

            return {
                portfolioValue: totalValue,
                activePositions: active.length,
                positions: active
            }
        },
        enabled: !!userAddress && !!markets && markets.length > 0,
        staleTime: 10 * 1000,
    })
}
