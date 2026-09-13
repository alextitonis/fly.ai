#!/usr/bin/env python3
"""
Universal Wallet Generator - All VM Types
Generates wallets for 94+ blockchain VM types from a single BIP-39 mnemonic.
Covers: EVM, Cosmos, Solana, Bitcoin, Move, TON, Substrate, Near, Algorand, etc.

Usage:
  python generate_wallets.py                          # Generate new mnemonic + all wallets
  python generate_wallets.py --mnemonic "word1 ..."   # Derive from existing mnemonic
  python generate_wallets.py --addresses-only          # Just print addresses
  python generate_wallets.py --derive-index 5          # Different derivation index
  python generate_wallets.py --chain EVM               # Single chain wallet

Requirements: pip install bip-utils eth-account substrate-interface
"""

import argparse
import json
import os
import sys
from datetime import datetime


def generate_wallets(mnemonic=None, index=0):
    from bip_utils import (
        Bip39MnemonicGenerator,
        Bip39WordsNum,
        Bip39SeedGenerator,
        Bip44,
        Bip44Coins,
        Bip44Changes,
    )
    from eth_account import Account as EthAccount
    from substrateinterface import Keypair

    if mnemonic is None:
        mnemonic = str(
            Bip39MnemonicGenerator().FromWordsNumber(Bip39WordsNum.WORDS_NUM_24)
        )

    seed_bytes = Bip39SeedGenerator(mnemonic).Generate()
    wallets = {}

    evm_coins = {
        "ETHEREUM",
        "AVALANCHE_C_CHAIN",
        "POLYGON",
        "FANTOM",
        "CELO",
        "MOONBEAM",
        "MOONRIVER",
        "HARMONY_ONE",
        "VECHAIN",
        "THETA",
        "CONFLUX",
        "BINANCE_SMART_CHAIN",
        "ARBITRUM",
        "OPTIMISM",
        "METIS",
        "OKEX_CHAIN_ETH",
        "HUOBI_CHAIN",
        "HARMONY_ONE_METAMASK",
        "FANTOM_OPERA",
    }

    # Chain name mapping
    name_map = {
        "ETHEREUM": "EVM (all EVM chains)",
        "SOLANA": "Solana",
        "COSMOS": "Cosmos Hub",
        "OSMOSIS": "Osmosis",
        "CELESTIA": "Celestia",
        "DYDX": "dYdX",
        "INJECTIVE": "Injective",
        "KUJIRA": "Kujira",
        "NIBIRU": "Nibiru",
        "BAND_PROTOCOL": "BandChain",
        "KAVA": "Kava",
        "TERRA": "Terra",
        "CRYPTO_ORG": "Cronos",
        "NEUTRON": "Neutron",
        "CHIHUAHUA": "Chihuahua",
        "AKASH_NETWORK": "Akash",
        "AXELAR": "Axelar",
        "IRIS_NET": "Iris",
        "FETCH_AI": "Fetch.ai",
        "CERTIK": "Certik",
        "STAFI": "Stafi",
        "SECRET_NETWORK_NEW": "Secret Network",
        "BITCOIN": "Bitcoin",
        "DOGECOIN": "Doge",
        "DASH": "Dash",
        "ZCASH": "Zcash",
        "LITECOIN": "Litecoin",
        "BITCOIN_CASH": "Bitcoin Cash",
        "BITCOIN_SV": "Bitcoin SV",
        "DIGIBYTE": "DigiByte",
        "CARDANO_BYRON_ICARUS": "Cardano",
        "ALGORAND": "Algorand",
        "STELLAR": "Stellar",
        "RIPPLE": "Ripple",
        "TEZOS": "Tezos",
        "ELROND": "MultiversX",
        "FILECOIN": "Filecoin",
        "ERGO": "Ergo",
        "SUI": "Sui",
        "APTOS": "Aptos",
        "BNB Chain": "BNB Chain",
        "TRON": "Tron",
        "NEAR_PROTOCOL": "Near",
        "NANO": "Nano",
        "ONTOLOGY": "Ontology",
        "EOS": "EOS",
        "TON": "TON",
        "ICON": "Icon",
        "ZILLIQA": "Zilliqa",
        "VERGE": "Verge",
        "NIMIQ": "Nimiq",
        "ECASH": "eCash",
        "PI_NETWORK": "Pi Network",
        "MAVRYK": "Mavryk",
        "NINE_CHRONICLES_GOLD": "Nine Chronicles",
        "AVAX_C_CHAIN": "Avalanche C",
        "AVAX_P_CHAIN": "Avalanche P",
        "AVAX_X_CHAIN": "Avalanche X",
        "BINANCE_SMART_CHAIN": "BSC",
        "HARMONY_ONE_ETH": "Harmony EVM",
        "ETHEREUM_CLASSIC": "Ethereum Classic",
        "OPTIMISM": "Optimism",
        "ARBITRUM": "Arbitrum",
        "METIS": "Metis",
        "Polygon": "Polygon",
        "NEO_N3": "Neo N3",
    }

    # Derive all BIP-44 coins
    for coin_enum in Bip44Coins:
        try:
            w = (
                Bip44.FromSeed(seed_bytes, coin_enum)
                .Purpose()
                .Coin()
                .Account(0)
                .Change(Bip44Changes.CHAIN_EXT)
                .AddressIndex(index)
            )
            priv = w.PrivateKey().Raw().ToHex()
            addr = w.PublicKey().ToAddress()

            if coin_enum.name in evm_coins:
                addr = EthAccount.from_key(priv).address

            chain_name = name_map.get(coin_enum.name, coin_enum.name)
            wallets[chain_name] = {
                "address": addr,
                "private_key": priv,
                "bip44_coin": coin_enum.name,
                "vm_type": _get_vm_type(chain_name),
            }
        except Exception:
            pass

    # Add Substrate chains
    try:
        kp = Keypair.create_from_mnemonic(mnemonic)
        wallets["Bittensor"] = {
            "address": kp.ss58_address,
            "private_key": kp.private_key.hex(),
            "bip44_coin": "SUBSTRATE",
            "vm_type": "Subtensor (Substrate SS58)",
        }
        dot_kp = Keypair.create_from_mnemonic(mnemonic, ss58_format=0)
        wallets["Polkadot"] = {
            "address": dot_kp.ss58_address,
            "private_key": dot_kp.private_key.hex(),
            "bip44_coin": "SUBSTRATE",
            "vm_type": "Substrate SS58",
        }
        ksm_kp = Keypair.create_from_mnemonic(mnemonic, ss58_format=2)
        wallets["Kusama"] = {
            "address": ksm_kp.ss58_address,
            "private_key": ksm_kp.private_key.hex(),
            "bip44_coin": "SUBSTRATE",
            "vm_type": "Substrate SS58",
        }
    except Exception as e:
        print(f"Substrate error: {e}", file=sys.stderr)

    # Remove testnets, dead chains, and duplicates
    remove_testnets = {
        name
        for name in wallets
        if any(
            kw in name.upper()
            for kw in [
                "TESTNET",
                "REGTEST",
                "_TEST",
                "TEST_",
                "STAGENET",
                "DEVNET",
                "TESTNET",
                "LEDGER",
            ]
        )
    }
    remove_dead = {
        "NIMIQ",
        "PI_NETWORK",
        "NANO",
        "VERGE",
        "BITCOIN_SV",
        "BITCOIN_CASH_SLP",
        "NINE_CHRONICLES_GOLD",
        "MAVRYK",
        "ECASH",
        "DIGIBYTE",
        "ONTOLOGY",
        "ZILLIQA",
        "BITCOIN_CASH_SLP_TESTNET",
        "BITCOIN_CASH_TESTNET",
    }
    remove_dupes = {
        "ELROND",
        "NEO",
        "NEO_LEGACY",
        "FETCH_AI",
        "FETCH_AI_ETH",
        "HARMONY_ONE_ATOM",
        "OKEX_CHAIN_ATOM",
        "OKEX_CHAIN_ATOM_OLD",
        "OKEX_CHAIN_ETH",
        "BINANCE_SMART_CHAIN",
        "AVAX_P_CHAIN",
        "AVAX_X_CHAIN",
        "KUSAMA_ED25519_SLIP",
        "POLKADOT_ED25519_SLIP",
        "SECRET_NETWORK_OLD",
        "CHIHUAHUA",
        "IRIS_NET",
        "STAFI",
        "CERTIK",
        "AKASH_NETWORK",
        "AXELAR",
        "NEUTRON",
    }
    remove_all = remove_testnets | remove_dead | remove_dupes
    wallets = {k: v for k, v in wallets.items() if k not in remove_all}

    # Fix VM types for known chains
    vm_fixes = {
        "EVM (all EVM chains)": "EVM (0x)",
        "ARBITRUM": "EVM (0x)",
        "AVAX_C_CHAIN": "EVM (0x)",
        "ETHEREUM_CLASSIC": "EVM (0x)",
        "FANTOM_OPERA": "EVM (0x)",
        "HARMONY_ONE_ETH": "EVM (0x)",
        "HARMONY_ONE_METAMASK": "EVM (0x)",
        "HUOBI_CHAIN": "EVM (0x)",
        "METIS": "EVM (0x)",
        "MOONBEAM": "EVM (0x)",
        "MOONRIVER": "EVM (0x)",
        "OPTIMISM": "EVM (0x)",
        "Polygon": "EVM (0x)",
        "THETA": "EVM (0x)",
        "VECHAIN": "EVM (0x)",
        "CELO": "EVM (0x)",
        "CONFLUX": "EVM (0x)",
        "Celo": "EVM (0x)",
        "Elrond/MultiversX": "MultiversX VM",
        "NEAR_PROTOCOL": "Near VM",
        "Kusama": "Substrate (SS58)",
        "Polkadot": "Substrate (SS58)",
        "Fetch.ai": "Cosmos (Bech32)",
        "SECRET_NETWORK_NEW": "Cosmos (Bech32)",
        "Akash": "Cosmos (Bech32)",
        "Axelar": "Cosmos (Bech32)",
        "Chihuahua": "Cosmos (Bech32)",
        "Certik": "Cosmos (Bech32)",
        "Iris": "Cosmos (Bech32)",
        "Stafi": "Cosmos (Bech32)",
        "Neutron": "Cosmos (Bech32)",
    }
    for name, wallet in wallets.items():
        if name in vm_fixes:
            wallet["vm_type"] = vm_fixes[name]

    return {
        "mnemonic": mnemonic,
        "derive_index": index,
        "generated_at": datetime.now().isoformat(),
        "total_wallets": len(wallets),
        "wallets": wallets,
    }


def _get_vm_type(chain_name):
    evm_chains = {
        "EVM",
        "Avalanche",
        "Polygon",
        "Fantom",
        "Celo",
        "Moonbeam",
        "Moonriver",
        "Harmony",
        "VeChain",
        "Theta",
        "Conflux",
        "BSC",
        "Arbitrum",
        "Optimism",
        "Metis",
        "Ethereum Classic",
        "OKEx",
        "Huobi",
        "Base",
        "Blast",
        "Linea",
        "Scroll",
        "zkSync",
        "Mantle",
        "Berachain",
        "Fraxtal",
        "Sonic",
        "Monad",
    }
    cosmos_chains = {
        "Cosmos",
        "Osmosis",
        "Celestia",
        "dYdX",
        "Injective",
        "Kujira",
        "Nibiru",
        "BandChain",
        "Kava",
        "Terra",
        "Cronos",
        "Neutron",
        "Chihuahua",
        "Akash",
        "Axelar",
        "Iris",
        "Fetch.ai",
        "Certik",
        "Stafi",
        "Secret Network",
        "Sei",
        "Canto",
        "Evmos",
        "Mantra",
        "Initia",
        "Archway",
        "XION",
        "Persistence",
        "Regen",
    }

    if chain_name in evm_chains or "EVM" in chain_name:
        return "EVM (0x address)"
    elif chain_name in cosmos_chains:
        return "Cosmos SDK (Bech32)"
    elif chain_name in ("Solana",):
        return "SVM (base58)"
    elif chain_name in (
        "Bitcoin",
        "Doge",
        "Dash",
        "Zcash",
        "Litecoin",
        "Bitcoin Cash",
        "Bitcoin SV",
        "DigiByte",
    ):
        return "Bitcoin UTXO"
    elif chain_name in ("Sui", "Aptos"):
        return "Move VM"
    elif chain_name in ("Polkadot", "Kusama", "Bittensor"):
        return "Substrate (SS58)"
    elif chain_name in ("Cardano",):
        return "EUTXO/Plutus"
    elif chain_name in ("Near",):
        return "Near VM"
    elif chain_name in ("Algorand",):
        return "Algorand VM"
    elif chain_name in ("Stellar",):
        return "Stellar Protocol"
    elif chain_name in ("Ripple",):
        return "XRPL"
    elif chain_name in ("Tezos",):
        return "Michelson/LIGO"
    elif chain_name in ("MultiversX", "Elrond"):
        return "MultiversX VM"
    elif chain_name in ("Filecoin",):
        return "Filecoin FVM"
    elif chain_name in ("Ergo",):
        return "ErgoScript/EUTXO"
    elif chain_name in ("Icon",):
        return "ICON VM"
    elif chain_name in ("Tron",):
        return "TVM"
    elif chain_name in ("TON",):
        return "TON VM"
    elif chain_name in ("EOS",):
        return "Antelope"
    else:
        return "Other"


def main():
    parser = argparse.ArgumentParser(
        description="Universal Wallet Generator - 94+ chains"
    )
    parser.add_argument("--mnemonic", help="24-word BIP-39 mnemonic")
    parser.add_argument(
        "--derive-index", type=int, default=0, help="HD derivation index"
    )
    parser.add_argument("--output", default="all_wallets.json", help="Output file")
    parser.add_argument(
        "--addresses-only", action="store_true", help="Print addresses only"
    )
    parser.add_argument("--chain", help="Generate wallet for specific chain only")
    parser.add_argument("--no-save", action="store_true", help="Don't save to file")
    args = parser.parse_args()

    result = generate_wallets(args.mnemonic, args.derive_index)

    if args.chain:
        if args.chain in result["wallets"]:
            w = result["wallets"][args.chain]
            print(f"Chain:    {args.chain}")
            print(f"Address:  {w['address']}")
            print(f"PrivKey:  {w['private_key']}")
            print(f"VM Type:  {w['vm_type']}")
        else:
            print(
                f"Chain '{args.chain}' not found. Available: {', '.join(sorted(result['wallets'].keys()))}"
            )
        return

    if args.addresses_only:
        print(f"Mnemonic: {result['mnemonic']}")
        print(f"Index:    {result['derive_index']}\n")
        for name in sorted(result["wallets"].keys()):
            addr = result["wallets"][name]["address"]
            vm = result["wallets"][name].get("vm_type", "?")
            print(f"{name:<25} {vm:<25} {addr}")
    else:
        print(f"Mnemonic: {result['mnemonic']}")
        print(f"Index:    {result['derive_index']}")
        print(f"Wallets:  {result['total_wallets']}")
        print(f"Time:     {result['generated_at']}\n")

        by_vm = {}
        for name, data in result["wallets"].items():
            vm = data.get("vm_type", "Other")
            by_vm.setdefault(vm, []).append((name, data))

        for vm in sorted(by_vm.keys()):
            chains = by_vm[vm]
            print(f"--- {vm} ({len(chains)} chains) ---")
            for name, data in sorted(chains):
                addr = data["address"][:60]
                print(f"  {name:<23} {addr}")
            print()

        print(f"Total: {result['total_wallets']} wallets")

    if not args.no_save:
        # Don't save private keys in the output for security
        safe_output = {
            "mnemonic": result["mnemonic"],
            "derive_index": result["derive_index"],
            "generated_at": result["generated_at"],
            "total_wallets": result["total_wallets"],
            "wallets": {
                name: {
                    "address": data["address"],
                    "vm_type": data.get("vm_type", "?"),
                    "bip44_coin": data.get("bip44_coin", "?"),
                }
                for name, data in result["wallets"].items()
            },
        }

        os.makedirs(
            os.path.dirname(args.output) if os.path.dirname(args.output) else ".",
            exist_ok=True,
        )
        with open(args.output, "w") as f:
            json.dump(safe_output, f, indent=2)

        # Save full version (with private keys) separately
        full_path = args.output.replace(".json", "_full.json")
        with open(full_path, "w") as f:
            json.dump(result, f, indent=2)
        os.chmod(full_path, 0o600)

        print(f"\nAddresses saved to: {args.output}")
        print(f"Full (with keys) saved to: {full_path} (chmod 600)")


if __name__ == "__main__":
    main()
