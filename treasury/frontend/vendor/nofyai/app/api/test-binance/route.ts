import { NextResponse } from 'next/server';
import { fetchWithProxy, testProxyConnection, getProxyUrl, isProxyConfigured } from '@/lib/http-client';

export async function GET() {
  try {
    const proxyConfigured = isProxyConfigured();
    const proxyUrl = getProxyUrl();

    console.log('🧪 [Test Binance] Starting connectivity test...');
    console.log(`   Proxy configured: ${proxyConfigured}`);
    if (proxyUrl) {
      console.log(`   Proxy URL: ${proxyUrl}`);
    }

    // Test 1: Binance ping endpoint
    const pingTest = await testProxyConnection();

    // Test 2: Fetch BTCUSDT price
    let priceTest = false;
    let btcPrice = null;
    try {
      const url = 'https://fapi.binance.com/fapi/v1/ticker/price?symbol=BTCUSDT';
      console.log(`🧪 [Test Binance] Fetching BTC price from ${url}...`);
      const response = await fetchWithProxy(url);

      if (response.ok) {
        const data = await response.json();
        btcPrice = parseFloat(data.price);
        priceTest = true;
        console.log(`✅ [Test Binance] BTC price: $${btcPrice.toFixed(2)}`);
      } else {
        console.error(`❌ [Test Binance] Price fetch failed: ${response.status}`);
      }
    } catch (error) {
      console.error(`❌ [Test Binance] Price fetch error:`, error);
    }

    // Test 3: Fetch klines data
    let klinesTest = false;
    let klinesCount = 0;
    try {
      const url = 'https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1h&limit=5';
      console.log(`🧪 [Test Binance] Fetching klines from ${url}...`);
      const response = await fetchWithProxy(url);

      if (response.ok) {
        const data = await response.json();
        klinesCount = data.length;
        klinesTest = true;
        console.log(`✅ [Test Binance] Fetched ${klinesCount} klines`);
      } else {
        console.error(`❌ [Test Binance] Klines fetch failed: ${response.status}`);
      }
    } catch (error) {
      console.error(`❌ [Test Binance] Klines fetch error:`, error);
    }

    const allTestsPassed = pingTest && priceTest && klinesTest;

    return NextResponse.json({
      success: allTestsPassed,
      proxy: {
        configured: proxyConfigured,
        url: proxyUrl || 'None',
      },
      tests: {
        ping: {
          passed: pingTest,
          description: 'Binance API ping endpoint',
        },
        price: {
          passed: priceTest,
          description: 'Fetch BTCUSDT price',
          data: btcPrice ? `$${btcPrice.toFixed(2)}` : null,
        },
        klines: {
          passed: klinesTest,
          description: 'Fetch historical klines',
          data: klinesCount ? `${klinesCount} candles` : null,
        },
      },
      summary: allTestsPassed
        ? '✅ All tests passed! Binance API is accessible.'
        : '❌ Some tests failed. Check logs for details.',
    });
  } catch (error) {
    console.error('❌ [Test Binance] Test failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
