// OI (Open Interest) History Cache
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

interface OIRecord {
  timestamp: number;
  oiValue: number;      // OI价值（百万美元）
  oiQuantity: number;   // OI数量（合约数量）
}

interface OICache {
  [symbol: string]: OIRecord[];
}

class OIHistoryCache {
  private cachePath: string;
  private cache: OICache = {}; // 初始化为空对象
  private retentionHours: number = 72; // 保留72小时

  constructor() {
    const cacheDir = resolve(process.cwd(), '.cache');
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }
    this.cachePath = resolve(cacheDir, 'oi-history.json');
    this.loadCache();
  }

  /**
   * 加载缓存文件
   */
  private loadCache() {
    try {
      if (existsSync(this.cachePath)) {
        const data = readFileSync(this.cachePath, 'utf-8');
        this.cache = JSON.parse(data);
        this.cleanOldData();
        console.log(`[OI Cache] Loaded ${Object.keys(this.cache).length} symbols from cache`);
      } else {
        this.cache = {};
        console.log('[OI Cache] Starting with empty cache');
      }
    } catch (error) {
      console.warn('[OI Cache] Failed to load cache, starting fresh:', error);
      this.cache = {};
    }
  }

  /**
   * 保存缓存到文件
   */
  private saveCache() {
    try {
      writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2), 'utf-8');
    } catch (error) {
      console.error('[OI Cache] Failed to save cache:', error);
    }
  }

  /**
   * 清理超过保留时长的旧数据
   */
  private cleanOldData() {
    const cutoffTime = Date.now() - this.retentionHours * 60 * 60 * 1000;
    let cleaned = 0;

    for (const symbol in this.cache) {
      const beforeCount = this.cache[symbol].length;
      this.cache[symbol] = this.cache[symbol].filter(
        record => record.timestamp > cutoffTime
      );
      cleaned += beforeCount - this.cache[symbol].length;

      // 如果某个币种没有数据了，删除该键
      if (this.cache[symbol].length === 0) {
        delete this.cache[symbol];
      }
    }

    if (cleaned > 0) {
      console.log(`[OI Cache] Cleaned ${cleaned} old records (> ${this.retentionHours}h)`);
    }
  }

  /**
   * 添加新的OI记录
   */
  addRecord(symbol: string, oiValue: number, oiQuantity: number) {
    const now = Date.now();

    if (!this.cache[symbol]) {
      this.cache[symbol] = [];
    }

    // 检查是否已有最近1小时内的记录（防止重复添加）
    const lastRecord = this.cache[symbol][this.cache[symbol].length - 1];
    if (lastRecord && now - lastRecord.timestamp < 60 * 60 * 1000) {
      // 更新最新记录而不是添加新记录
      lastRecord.timestamp = now;
      lastRecord.oiValue = oiValue;
      lastRecord.oiQuantity = oiQuantity;
    } else {
      // 添加新记录
      this.cache[symbol].push({
        timestamp: now,
        oiValue,
        oiQuantity,
      });
    }

    this.cleanOldData();
    this.saveCache();
  }

  /**
   * 计算OI变化率（对比N小时前）
   * @param symbol 交易对
   * @param currentOI 当前OI价值（百万美元）
   * @param hoursAgo 对比几小时前（默认4小时）
   */
  calculateChange(symbol: string, currentOI: number, hoursAgo: number = 4): number {
    if (!this.cache[symbol] || this.cache[symbol].length === 0) {
      return 0; // 无历史数据
    }

    const targetTime = Date.now() - hoursAgo * 60 * 60 * 1000;

    // 找到最接近目标时间的记录
    let closestRecord: OIRecord | null = null;
    let minDiff = Infinity;

    for (const record of this.cache[symbol]) {
      const diff = Math.abs(record.timestamp - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestRecord = record;
      }
    }

    if (!closestRecord) {
      return 0;
    }

    // 如果找到的记录时间差超过2小时，认为数据不可靠
    if (minDiff > 2 * 60 * 60 * 1000) {
      // console.warn(
      //   `[OI Cache] No reliable data for ${symbol} at ${hoursAgo}h ago (found ${(minDiff / 3600000).toFixed(1)}h ago)`
      // );
      return 0;
    }

    const previousOI = closestRecord.oiValue;
    if (previousOI === 0) return 0;

    const changePct = ((currentOI - previousOI) / previousOI) * 100;

    return changePct;
  }

  /**
   * 获取某个币种的历史记录数量
   */
  getRecordCount(symbol: string): number {
    return this.cache[symbol]?.length || 0;
  }

  /**
   * 获取缓存对象（用于测试）
   */
  getCacheForTesting(): OICache {
    return this.cache;
  }
}

// 单例模式
let instance: OIHistoryCache | null = null;

export function getOICache(): OIHistoryCache {
  if (!instance) {
    instance = new OIHistoryCache();
  }
  return instance;
}
