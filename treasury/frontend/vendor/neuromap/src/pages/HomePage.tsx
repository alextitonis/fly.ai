import { useState } from 'react';
import { Search, Brain, Pill, Dna, Sparkles } from 'lucide-react';
import { searchDisorders } from '../data/disorders';
import { DisorderCard } from '../components/DisorderCard';

const features = [
  {
    icon: Brain,
    label: '3D Brain Maps',
    sub: 'fMRI activation patterns',
    color: 'neuro',
    glow: 'rgba(14,165,233,0.15)',
    border: 'rgba(14,165,233,0.25)',
  },
  {
    icon: Pill,
    label: 'Pharmacology',
    sub: 'Drugs & molecular targets',
    color: 'pharma',
    glow: 'rgba(217,70,239,0.15)',
    border: 'rgba(217,70,239,0.25)',
  },
  {
    icon: Dna,
    label: 'Molecular Basis',
    sub: 'Genes & risk architecture',
    color: 'gene',
    glow: 'rgba(16,185,129,0.15)',
    border: 'rgba(16,185,129,0.25)',
  },
];

export function HomePage() {
  const [query, setQuery] = useState('');
  const filtered = searchDisorders(query);

  return (
    <div className="min-h-[calc(100vh-3.5rem)]">

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        {/* Ambient blobs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full opacity-30"
            style={{
              background: 'radial-gradient(circle, rgba(14,165,233,0.18) 0%, transparent 70%)',
              animation: 'blob-drift 18s ease-in-out infinite',
            }}
          />
          <div
            className="absolute -top-16 right-0 w-[500px] h-[500px] rounded-full opacity-20"
            style={{
              background: 'radial-gradient(circle, rgba(217,70,239,0.18) 0%, transparent 70%)',
              animation: 'blob-drift 24s ease-in-out infinite reverse',
            }}
          />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-14">
          <div className="text-center max-w-3xl mx-auto">

            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-neuro-500/30 bg-neuro-500/10 text-neuro-300 text-xs font-medium tracking-wide mb-8">
              <Sparkles className="w-3.5 h-3.5" />
              Open Research · Every Claim Cited
            </div>

            {/* Headline — Crimson Pro display font per skill typography recommendation */}
            <h1
              className="text-5xl sm:text-6xl font-semibold text-white mb-5 leading-[1.08]"
              style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.03em' }}
            >
              Explore Mental Health
              <br />
              <span
                className="text-transparent bg-clip-text"
                style={{
                  backgroundImage: 'linear-gradient(90deg, #38bdf8, #d946ef, #34d399)',
                  backgroundSize: '200% auto',
                  animation: 'gradient-x 4s ease infinite',
                }}
              >
                at Three Connected Levels
              </span>
            </h1>

            <p className="text-base text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
              Trace the path from brain activation patterns to the drugs that modulate them
              to the genes that shape them — all grounded in peer-reviewed research.
            </p>

            {/* Feature pills */}
            <div className="flex flex-col sm:flex-row justify-center gap-3 mb-12">
              {features.map(f => {
                const Icon = f.icon;
                return (
                  <div
                    key={f.label}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl backdrop-blur-md"
                    style={{ transition: `transform var(--duration-base) var(--ease-out-expo), box-shadow var(--duration-base) var(--ease-out-expo)` }}
                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                    style={{
                      background: f.glow,
                      border: `1px solid ${f.border}`,
                    }}
                  >
                    <Icon className={`w-4.5 h-4.5 text-${f.color}-400 shrink-0`} />
                    <div className="text-left">
                      <p className="text-sm font-semibold text-white">{f.label}</p>
                      <p className="text-xs text-slate-500">{f.sub}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Search */}
            <div className="relative max-w-sm mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search disorders…"
                className="w-full pl-11 pr-4 py-3 rounded-xl text-sm text-white placeholder-slate-600 outline-none transition-all duration-200"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(12px)',
                  boxShadow: query ? '0 0 0 2px rgba(14,165,233,0.4)' : 'none',
                }}
                aria-label="Search disorders"
              />
            </div>

          </div>
        </div>
      </section>

      {/* ── Disorder Grid ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-base font-semibold text-slate-300 tracking-wide uppercase text-[11px] tracking-widest">
            {query ? `Results for "${query}"` : 'Select a Disorder'}
          </h2>
          <span className="text-xs text-slate-600 tabular-nums">
            {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-600">
            <Search className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No disorders matched your search.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-5">
            {filtered.map(d => (
              <DisorderCard key={d.id} disorder={d} />
            ))}
          </div>
        )}

        {/* Disclaimer */}
        <div
          className="mt-14 p-4 rounded-xl text-center"
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <p className="text-[11px] text-slate-600 leading-relaxed max-w-2xl mx-auto">
            <span className="text-slate-500 font-medium">Educational tool only.</span>{' '}
            This presents population-level associations from published research — not diagnoses,
            individual predictions, or medical advice.
          </p>
        </div>
      </section>

    </div>
  );
}
