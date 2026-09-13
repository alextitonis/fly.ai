import { ethers } from 'ethers';
import { fetchWithProxy } from './http-client';

// ========================================
// Types
// ========================================

export interface SymbolPrecision {
  pricePrecision: number;
  quantityPrecision: number;
  tickSize: number;
  stepSize: number;
}

export interface AsterConfig {
  user: string; // Main wallet address (0x...)
  signer: string; // API wallet address (0x...)
  privateKey: string; // API wallet private key
  baseURL?: string; // Default: https://fapi.asterdex.com
}

export interface Balance {
  totalWalletBalance: number;
  availableBalance: number;
  totalUnrealizedProfit: number;
}

export interface Position {
  symbol: string;
  side: 'long' | 'short';
  positionAmt: number;
  entryPrice: number;
  markPrice: number;
  unRealizedProfit: number;
  leverage: number;
  liquidationPrice: number;
}

// ========================================
// Aster Trading Client
// ========================================

export class AsterTrader {
  private user: string;
  private signer: string;
  private wallet: ethers.Wallet;
  private baseURL: string;
  private symbolPrecision: Map<string, SymbolPrecision> = new Map();

  constructor(config: AsterConfig) {
    this.user = config.user;
    this.signer = config.signer;
    this.baseURL = config.baseURL || 'https://fapi.asterdex.com';

    // Create wallet from private key (remove 0x prefix if present)
    const pk = config.privateKey.startsWith('0x')
      ? config.privateKey.slice(2)
      : config.privateKey;
    this.wallet = new ethers.Wallet(pk);
  }

  // ========================================
  // Utility Methods
  // ========================================

  private genNonce(): string {
    // Generate microsecond timestamp
    return String(Date.now() * 1000 + Math.floor(Math.random() * 1000));
  }

  private async getPrecision(symbol: string): Promise<SymbolPrecision> {
    if (this.symbolPrecision.has(symbol)) {
      return this.symbolPrecision.get(symbol)!;
    }

    // Fetch exchange info
    const response = await fetchWithProxy(`${this.baseURL}/fapi/v3/exchangeInfo`);
    if (!response.ok) {
      throw new Error(`Failed to fetch exchange info: ${response.statusText}`);
    }

    const data = await response.json();

    // Cache all symbol precisions
    for (const s of data.symbols) {
      let tickSize = 0;
      let stepSize = 0;

      for (const filter of s.filters) {
        if (filter.filterType === 'PRICE_FILTER') {
          tickSize = parseFloat(filter.tickSize);
        } else if (filter.filterType === 'LOT_SIZE') {
          stepSize = parseFloat(filter.stepSize);
        }
      }

      this.symbolPrecision.set(s.symbol, {
        pricePrecision: s.pricePrecision,
        quantityPrecision: s.quantityPrecision,
        tickSize,
        stepSize,
      });
    }

    const precision = this.symbolPrecision.get(symbol);
    if (!precision) {
      throw new Error(`Symbol ${symbol} not found in exchange info`);
    }

    return precision;
  }

  private roundToTickSize(value: number, tickSize: number): number {
    if (tickSize <= 0) return value;
    const steps = value / tickSize;
    const roundedSteps = Math.round(steps);
    return roundedSteps * tickSize;
  }

  private async formatPrice(symbol: string, price: number): Promise<number> {
    const prec = await this.getPrecision(symbol);
    if (prec.tickSize > 0) {
      return this.roundToTickSize(price, prec.tickSize);
    }
    const multiplier = Math.pow(10, prec.pricePrecision);
    return Math.round(price * multiplier) / multiplier;
  }

  private async formatQuantity(symbol: string, quantity: number): Promise<number> {
    const prec = await this.getPrecision(symbol);
    if (prec.stepSize > 0) {
      return this.roundToTickSize(quantity, prec.stepSize);
    }
    const multiplier = Math.pow(10, prec.quantityPrecision);
    return Math.round(quantity * multiplier) / multiplier;
  }

  private formatFloatWithPrecision(value: number, precision: number): string {
    // Format to fixed precision, then remove trailing zeros
    let formatted = value.toFixed(precision);
    formatted = formatted.replace(/\.?0+$/, '');
    return formatted;
  }

  // ========================================
  // Request Signing
  // ========================================

  private normalize(v: any): any {
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      // Object: sort keys and normalize values
      const keys = Object.keys(v).sort();
      const normalized: any = {};
      for (const k of keys) {
        normalized[k] = this.normalize(v[k]);
      }
      return normalized;
    } else if (Array.isArray(v)) {
      // Array: normalize each element
      return v.map(item => this.normalize(item));
    } else if (typeof v === 'number') {
      return String(v);
    } else if (typeof v === 'boolean') {
      return String(v);
    } else {
      return v;
    }
  }

  private async sign(params: Record<string, any>, nonce: string): Promise<Record<string, any>> {
    // Add timestamp and recvWindow
    params.recvWindow = '50000';
    params.timestamp = String(Date.now());

    // Normalize and stringify params
    const normalized = this.normalize(params);
    const jsonStr = JSON.stringify(normalized);

    // ABI encode: (string, address, address, uint256)
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const encoded = abiCoder.encode(
      ['string', 'address', 'address', 'uint256'],
      [jsonStr, this.user, this.signer, BigInt(nonce)]
    );

    // Keccak256 hash
    const hash = ethers.keccak256(encoded);

    // Ethereum signed message prefix
    const messageHash = ethers.hashMessage(ethers.getBytes(hash));

    // ECDSA sign
    const signature = await this.wallet.signMessage(ethers.getBytes(hash));

    // Add signature params
    params.user = this.user;
    params.signer = this.signer;
    params.signature = signature;
    params.nonce = nonce;

    return params;
  }

  // ========================================
  // HTTP Request
  // ========================================

  private async request(
    method: string,
    endpoint: string,
    params: Record<string, any> = {}
  ): Promise<any> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Generate nonce and sign params
        const nonce = this.genNonce();
        const signedParams = await this.sign({ ...params }, nonce);

        const url = `${this.baseURL}${endpoint}`;
        let response: Response;

        if (method === 'POST') {
          // POST: form-encoded body
          const formBody = new URLSearchParams();
          for (const [key, value] of Object.entries(signedParams)) {
            formBody.append(key, String(value));
          }

          response = await fetchWithProxy(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formBody.toString(),
          });
        } else {
          // GET/DELETE: query string
          const queryString = new URLSearchParams();
          for (const [key, value] of Object.entries(signedParams)) {
            queryString.append(key, String(value));
          }

          response = await fetchWithProxy(`${url}?${queryString.toString()}`, {
            method,
          });
        }

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`HTTP ${response.status}: ${text}`);
        }

        return await response.json();
      } catch (error) {
        lastError = error as Error;

        // Retry on timeout/connection errors
        if (
          lastError.message.includes('timeout') ||
          lastError.message.includes('connection reset') ||
          lastError.message.includes('EOF')
        ) {
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
            continue;
          }
        }

        // Other errors: don't retry
        throw error;
      }
    }

    throw new Error(`Request failed after ${maxRetries} retries: ${lastError?.message}`);
  }

  // ========================================
  // Public Trading Methods
  // ========================================

  async getBalance(): Promise<Balance> {
    const balances = await this.request('GET', '/fapi/v3/balance');

    // Find USDT balance
    const usdtBalance = balances.find((b: any) => b.asset === 'USDT');
    if (!usdtBalance) {
      throw new Error('USDT balance not found');
    }

    return {
      totalWalletBalance: parseFloat(usdtBalance.balance),
      availableBalance: parseFloat(usdtBalance.availableBalance),
      totalUnrealizedProfit: parseFloat(usdtBalance.crossUnPnl),
    };
  }

  async getPositions(): Promise<Position[]> {
    const positions = await this.request('GET', '/fapi/v3/positionRisk');

    const result: Position[] = [];
    for (const pos of positions) {
      const posAmt = parseFloat(pos.positionAmt);
      if (posAmt === 0) continue;

      const side = posAmt > 0 ? 'long' : 'short';
      const quantity = Math.abs(posAmt);

      result.push({
        symbol: pos.symbol,
        side,
        positionAmt: quantity,
        entryPrice: parseFloat(pos.entryPrice),
        markPrice: parseFloat(pos.markPrice),
        unRealizedProfit: parseFloat(pos.unRealizedProfit),
        leverage: parseFloat(pos.leverage),
        liquidationPrice: parseFloat(pos.liquidationPrice),
      });
    }

    return result;
  }

  async openLong(symbol: string, quantity: number, leverage: number): Promise<any> {
    // Cancel all pending orders first
    await this.cancelAllOrders(symbol).catch(() => {});

    // Set leverage
    await this.setLeverage(symbol, leverage);

    // Get current price
    const price = await this.getMarketPrice(symbol);
    const limitPrice = price * 1.01; // Slightly higher to ensure fill

    // Format price and quantity
    const formattedPrice = await this.formatPrice(symbol, limitPrice);
    const formattedQty = await this.formatQuantity(symbol, quantity);

    const prec = await this.getPrecision(symbol);
    const priceStr = this.formatFloatWithPrecision(formattedPrice, prec.pricePrecision);
    const qtyStr = this.formatFloatWithPrecision(formattedQty, prec.quantityPrecision);

    console.log(`📏 Open Long ${symbol}: price ${limitPrice.toFixed(8)} -> ${priceStr}, qty ${quantity.toFixed(8)} -> ${qtyStr}`);

    return await this.request('POST', '/fapi/v3/order', {
      symbol,
      positionSide: 'BOTH',
      type: 'LIMIT',
      side: 'BUY',
      timeInForce: 'GTC',
      quantity: qtyStr,
      price: priceStr,
    });
  }

  async openShort(symbol: string, quantity: number, leverage: number): Promise<any> {
    // Cancel all pending orders first
    await this.cancelAllOrders(symbol).catch(() => {});

    // Set leverage
    await this.setLeverage(symbol, leverage);

    // Get current price
    const price = await this.getMarketPrice(symbol);
    const limitPrice = price * 0.99; // Slightly lower to ensure fill

    // Format price and quantity
    const formattedPrice = await this.formatPrice(symbol, limitPrice);
    const formattedQty = await this.formatQuantity(symbol, quantity);

    const prec = await this.getPrecision(symbol);
    const priceStr = this.formatFloatWithPrecision(formattedPrice, prec.pricePrecision);
    const qtyStr = this.formatFloatWithPrecision(formattedQty, prec.quantityPrecision);

    console.log(`📏 Open Short ${symbol}: price ${limitPrice.toFixed(8)} -> ${priceStr}, qty ${quantity.toFixed(8)} -> ${qtyStr}`);

    return await this.request('POST', '/fapi/v3/order', {
      symbol,
      positionSide: 'BOTH',
      type: 'LIMIT',
      side: 'SELL',
      timeInForce: 'GTC',
      quantity: qtyStr,
      price: priceStr,
    });
  }

  async closeLong(symbol: string, quantity?: number): Promise<any> {
    // If quantity not provided, get from position
    if (!quantity || quantity === 0) {
      const positions = await this.getPositions();
      const longPos = positions.find(p => p.symbol === symbol && p.side === 'long');
      if (!longPos) {
        throw new Error(`No long position found for ${symbol}`);
      }
      quantity = longPos.positionAmt;
      console.log(`📊 Found long position quantity: ${quantity}`);
    }

    const price = await this.getMarketPrice(symbol);
    const limitPrice = price * 0.99;

    const formattedPrice = await this.formatPrice(symbol, limitPrice);
    const formattedQty = await this.formatQuantity(symbol, quantity);

    const prec = await this.getPrecision(symbol);
    const priceStr = this.formatFloatWithPrecision(formattedPrice, prec.pricePrecision);
    const qtyStr = this.formatFloatWithPrecision(formattedQty, prec.quantityPrecision);

    console.log(`📏 Close Long ${symbol}: price ${limitPrice.toFixed(8)} -> ${priceStr}, qty ${quantity.toFixed(8)} -> ${qtyStr}`);

    const result = await this.request('POST', '/fapi/v3/order', {
      symbol,
      positionSide: 'BOTH',
      type: 'LIMIT',
      side: 'SELL',
      timeInForce: 'GTC',
      quantity: qtyStr,
      price: priceStr,
    });

    // Cancel all pending orders after closing
    await this.cancelAllOrders(symbol).catch(() => {});

    return result;
  }

  async closeShort(symbol: string, quantity?: number): Promise<any> {
    // If quantity not provided, get from position
    if (!quantity || quantity === 0) {
      const positions = await this.getPositions();
      const shortPos = positions.find(p => p.symbol === symbol && p.side === 'short');
      if (!shortPos) {
        throw new Error(`No short position found for ${symbol}`);
      }
      quantity = shortPos.positionAmt;
      console.log(`📊 Found short position quantity: ${quantity}`);
    }

    const price = await this.getMarketPrice(symbol);
    const limitPrice = price * 1.01;

    const formattedPrice = await this.formatPrice(symbol, limitPrice);
    const formattedQty = await this.formatQuantity(symbol, quantity);

    const prec = await this.getPrecision(symbol);
    const priceStr = this.formatFloatWithPrecision(formattedPrice, prec.pricePrecision);
    const qtyStr = this.formatFloatWithPrecision(formattedQty, prec.quantityPrecision);

    console.log(`📏 Close Short ${symbol}: price ${limitPrice.toFixed(8)} -> ${priceStr}, qty ${quantity.toFixed(8)} -> ${qtyStr}`);

    const result = await this.request('POST', '/fapi/v3/order', {
      symbol,
      positionSide: 'BOTH',
      type: 'LIMIT',
      side: 'BUY',
      timeInForce: 'GTC',
      quantity: qtyStr,
      price: priceStr,
    });

    // Cancel all pending orders after closing
    await this.cancelAllOrders(symbol).catch(() => {});

    return result;
  }

  async setStopLoss(
    symbol: string,
    side: 'LONG' | 'SHORT',
    quantity: number,
    stopPrice: number
  ): Promise<void> {
    const orderSide = side === 'LONG' ? 'SELL' : 'BUY';

    const formattedPrice = await this.formatPrice(symbol, stopPrice);
    const formattedQty = await this.formatQuantity(symbol, quantity);

    const prec = await this.getPrecision(symbol);
    const priceStr = this.formatFloatWithPrecision(formattedPrice, prec.pricePrecision);
    const qtyStr = this.formatFloatWithPrecision(formattedQty, prec.quantityPrecision);

    await this.request('POST', '/fapi/v3/order', {
      symbol,
      positionSide: 'BOTH',
      type: 'STOP_MARKET',
      side: orderSide,
      stopPrice: priceStr,
      quantity: qtyStr,
      timeInForce: 'GTC',
    });
  }

  async setTakeProfit(
    symbol: string,
    side: 'LONG' | 'SHORT',
    quantity: number,
    takeProfitPrice: number
  ): Promise<void> {
    const orderSide = side === 'LONG' ? 'SELL' : 'BUY';

    const formattedPrice = await this.formatPrice(symbol, takeProfitPrice);
    const formattedQty = await this.formatQuantity(symbol, quantity);

    const prec = await this.getPrecision(symbol);
    const priceStr = this.formatFloatWithPrecision(formattedPrice, prec.pricePrecision);
    const qtyStr = this.formatFloatWithPrecision(formattedQty, prec.quantityPrecision);

    await this.request('POST', '/fapi/v3/order', {
      symbol,
      positionSide: 'BOTH',
      type: 'TAKE_PROFIT_MARKET',
      side: orderSide,
      stopPrice: priceStr,
      quantity: qtyStr,
      timeInForce: 'GTC',
    });
  }

  async setLeverage(symbol: string, leverage: number): Promise<void> {
    await this.request('POST', '/fapi/v3/leverage', {
      symbol,
      leverage,
    });
  }

  async getMarketPrice(symbol: string): Promise<number> {
    const response = await fetchWithProxy(`${this.baseURL}/fapi/v3/ticker/price?symbol=${symbol}`);
    if (!response.ok) {
      throw new Error(`Failed to get market price: ${response.statusText}`);
    }
    const data = await response.json();
    return parseFloat(data.price);
  }

  async cancelAllOrders(symbol: string): Promise<void> {
    await this.request('DELETE', '/fapi/v3/allOpenOrders', { symbol });
  }
}
