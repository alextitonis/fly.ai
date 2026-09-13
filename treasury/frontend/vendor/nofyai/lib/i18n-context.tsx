'use client';

import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import { zhCN } from '@/locales/zh-CN';
import { enUS } from '@/locales/en-US';
import type { Locale } from '@/locales';

export type LocaleCode = 'zh-CN' | 'en-US';

const locales: Record<LocaleCode, Locale> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

interface I18nContextValue {
  locale: LocaleCode;
  setLocale: (locale: LocaleCode) => void;
  t: Locale;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  // Default to Chinese
  const [locale, setLocaleState] = useState<LocaleCode>('zh-CN');
  const [mounted, setMounted] = useState(false);

  // Load from localStorage after mount (client-side only)
  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('locale') as LocaleCode;
    if (saved && locales[saved]) {
      setLocaleState(saved);
    }
  }, []);

  const setLocale = (newLocale: LocaleCode) => {
    console.log('🌍 Switching language to:', newLocale);
    setLocaleState(newLocale);
    localStorage.setItem('locale', newLocale);
  };

  const value: I18nContextValue = useMemo(() => ({
    locale,
    setLocale,
    t: locales[locale],
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}

// Convenience hook for locale only
export function useLocale() {
  const { locale, setLocale } = useI18n();
  return { locale, setLocale };
}

// Convenience hook for translations only
export function useTranslations() {
  const { t } = useI18n();
  return t;
}
