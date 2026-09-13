'use client';

import { ConfigViewer } from '@/components/config/ConfigViewer';
import { useTranslations } from '@/lib/i18n-context';

export default function ConfigPage() {
  const t = useTranslations();

  return (
    <div className="w-full px-4 md:px-6 py-4 md:py-8">
      {/* Page Header */}
      <div className="mb-6 md:mb-8">
        <div className="flex items-center gap-3 md:gap-4 mb-3 md:mb-4">
          <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-gradient-to-br from-accent-blue via-accent-purple to-accent-cyan flex items-center justify-center text-3xl md:text-4xl shadow-lg">
            ⚙️
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-text-primary">
              {t.config.pageTitle}
            </h1>
            <p className="text-text-secondary text-xs md:text-sm mt-1">
              {t.config.pageDescription}
            </p>
          </div>
        </div>
      </div>

      {/* Configuration Viewer */}
      <ConfigViewer />
    </div>
  );
}
