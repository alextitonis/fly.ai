'use client';

import { useTranslations } from '@/lib/i18n-context';

export function Footer() {
  const t = useTranslations();

  return (
    <footer className="mt-16 border-t border-border bg-white">
      <div className="w-full px-6 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-text-secondary text-sm">
              {t.footer.description}
            </p>
            <p className="text-text-tertiary text-xs mt-1">
              {t.footer.riskWarning}
            </p>
          </div>
          <div className="flex items-center gap-6">
            <a href="https://github.com/osbrain/nofyai/blob/master/README.md" target="_blank" rel="noopener noreferrer" className="text-sm text-text-secondary hover:text-primary transition-colors">
              {t.nav.documentation}
            </a>
            <a href="/api" className="text-sm text-text-secondary hover:text-primary transition-colors">
              {t.nav.api}
            </a>
            <a
              href="https://github.com/osbrain/nofyai"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open GitHub repository"
              className="p-1.5 rounded-lg text-text-secondary hover:text-primary hover:bg-primary/10 transition-colors"
              title="GitHub"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="w-5 h-5" fill="currentColor">
                <path d="M12 2C6.475 2 2 6.475 2 12c0 4.425 2.875 8.175 6.85 9.5.5.1.675-.225.675-.5 0-.25-.01-1.075-.015-1.95-2.788.605-3.375-1.19-3.375-1.19-.455-1.155-1.11-1.465-1.11-1.465-.905-.62.07-.61.07-.61 1 .07 1.525 1.03 1.525 1.03.89 1.525 2.34 1.085 2.91.83.09-.645.35-1.085.635-1.335-2.225-.25-4.565-1.115-4.565-4.955 0-1.095.39-1.99 1.03-2.69-.105-.25-.45-1.27.1-2.645 0 0 .84-.27 2.75 1.025A9.57 9.57 0 0 1 12 6.845c.85.005 1.705.115 2.505.34 1.91-1.295 2.75-1.025 2.75-1.025.55 1.375.205 2.395.1 2.645.64.7 1.03 1.595 1.03 2.69 0 3.85-2.345 4.7-4.575 4.95.36.31.685.915.685 1.85 0 1.335-.015 2.41-.015 2.74 0 .275.175.605.68.5C19.13 20.175 22 16.425 22 12c0-5.525-4.475-10-10-10Z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
