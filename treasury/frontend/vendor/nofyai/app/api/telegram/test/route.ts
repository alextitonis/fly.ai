import { NextRequest, NextResponse } from 'next/server';
import { getConfigLoader } from '@/lib/config-loader';
import { TelegramNotifier } from '@/lib/telegram-notifier';
import { withAuth } from '@/lib/auth-middleware';

/**
 * POST /api/telegram/test
 * Test Telegram notification configuration
 */
export const POST = withAuth(async (request: NextRequest) => {
  try {
    const configLoader = getConfigLoader();
    const config = configLoader.getConfig();

    if (!config.telegram || !config.telegram.enabled) {
      return NextResponse.json(
        { error: 'Telegram notifications are not enabled in config.json' },
        { status: 400 }
      );
    }

    const notifier = new TelegramNotifier(config.telegram);
    const success = await notifier.testNotification();

    if (success) {
      return NextResponse.json({
        success: true,
        message: 'Test notification sent successfully! Check your Telegram.',
      });
    } else {
      return NextResponse.json(
        { error: 'Failed to send test notification. Check your Telegram configuration.' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error testing Telegram:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
});
