/* the one place viem is imported: everything loxley needs from it, in one object, bundled by `npm run vendor`
   into vendor/viem.js so that a clone runs with no npm install at all */
const core = require('viem');
const accounts = require('viem/accounts');
const bip39 = require('@scure/bip39');
const { wordlist } = require('@scure/bip39/wordlists/english');
module.exports = {
  createPublicClient: core.createPublicClient, createWalletClient: core.createWalletClient, custom: core.custom, http: core.http, defineChain: core.defineChain,
  parseAbi: core.parseAbi, encodeAbiParameters: core.encodeAbiParameters, decodeAbiParameters: core.decodeAbiParameters, encodePacked: core.encodePacked,
  encodeFunctionData: core.encodeFunctionData, decodeFunctionData: core.decodeFunctionData, encodeFunctionResult: core.encodeFunctionResult, decodeFunctionResult: core.decodeFunctionResult,
  decodeEventLog: core.decodeEventLog, parseEventLogs: core.parseEventLogs, keccak256: core.keccak256, toFunctionSelector: core.toFunctionSelector, toEventSelector: core.toEventSelector,
  formatEther: core.formatEther, parseEther: core.parseEther, formatUnits: core.formatUnits, parseUnits: core.parseUnits,
  getAddress: core.getAddress, isAddress: core.isAddress, isAddressEqual: core.isAddressEqual,
  maxUint48: core.maxUint48, maxUint128: core.maxUint128, maxUint160: core.maxUint160, maxUint256: core.maxUint256,
  parseTransaction: core.parseTransaction, serializeTransaction: core.serializeTransaction, recoverTransactionAddress: core.recoverTransactionAddress,
  accounts: { privateKeyToAccount: accounts.privateKeyToAccount, mnemonicToAccount: accounts.mnemonicToAccount, generateMnemonic: accounts.generateMnemonic, generatePrivateKey: accounts.generatePrivateKey, english: accounts.english },
  bip39: { validateMnemonic: bip39.validateMnemonic, wordlist },
  version: require('viem/package.json').version
};
