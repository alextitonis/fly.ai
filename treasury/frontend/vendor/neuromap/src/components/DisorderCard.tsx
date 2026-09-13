import { Link } from 'react-router-dom';
import { Brain, Pill, Dna, ArrowUpRight } from 'lucide-react';
import type { Disorder } from '../data/types';

const DISORDER_THEME: Record<string, {
  gradient: string;
  glow: string;
  border: string;
  accent: string;
}> = {
  depression:    { gradient: 'from-blue-500 to-indigo-600',   glow: 'rgba(99,102,241,0.2)',  border: 'rgba(99,102,241,0.35)',  accent: '#818cf8' },
  anxiety:       { gradient: 'from-amber-500 to-orange-600',  glow: 'rgba(245,158,11,0.2)',  border: 'rgba(245,158,11,0.35)',  accent: '#fbbf24' },
  schizophrenia: { gradient: 'from-purple-500 to-pink-600',   glow: 'rgba(168,85,247,0.2)',  border: 'rgba(168,85,247,0.35)',  accent: '#c084fc' },
  adhd:          { gradient: 'from-emerald-500 to-teal-600',  glow: 'rgba(16,185,129,0.2)',  border: 'rgba(16,185,129,0.35)', accent: '#34d399' },
};

const DEFAULT_THEME = {
  gradient: 'from-neuro-500 to-pharma-500',
  glow: 'rgba(14,165,233,0.2)',
  border: 'rgba(14,165,233,0.3)',
  accent: '#38bdf8',
};

export function DisorderCard({ disorder }: { disorder: Disorder }) {
  const theme = DISORDER_THEME[disorder.id] ?? DEFAULT_THEME;

  return (
    <Link
      to={`/disorder/${disorder.id}`}
      className="group relative flex flex-col rounded-2xl p-5 cursor-pointer"
      style={{
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: `1px solid ${theme.border}`,
        boxShadow: 'none',
        transition: `transform var(--duration-base) var(--ease-out-expo), box-shadow var(--duration-base) var(--ease-out-expo)`,
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = 'translateY(-4px)';
        el.style.boxShadow = `0 12px 40px ${theme.glow}, 0 0 0 1px ${theme.border}`;
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = 'translateY(0)';
        el.style.boxShadow = 'none';
      }}
    >
      {/* Subtle gradient top edge */}
      <div
        className="absolute top-0 left-6 right-6 h-px rounded-full"
        style={{ background: `linear-gradient(90deg, transparent, ${theme.accent}60, transparent)` }}
      />

      {/* Icon + arrow */}
      <div className="flex items-start justify-between mb-5">
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${theme.gradient} flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-110`}
          style={{ boxShadow: `0 4px 16px ${theme.glow}` }}>
          <Brain className="w-5 h-5 text-white" />
        </div>
        <ArrowUpRight
          className="w-4 h-4 text-slate-600 group-hover:text-slate-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        />
      </div>

      {/* Name + description */}
      <h3 className="text-base font-semibold text-white mb-1.5 group-hover:text-slate-100 transition-colors">
        {disorder.name}
      </h3>
      <p className="text-xs text-slate-500 leading-relaxed mb-5 line-clamp-2 flex-1">
        {disorder.shortDescription}
      </p>

      {/* Stats row */}
      <div className="flex items-center gap-4 pt-4 border-t border-white/[0.06]">
        <Stat icon={Brain} value={disorder.brainRegions.length} label="regions" color={theme.accent} />
        <Stat icon={Pill}  value={disorder.drugs.length}         label="drugs"   color={theme.accent} />
        <Stat icon={Dna}   value={disorder.geneAssociations.length} label="genes" color={theme.accent} />
      </div>
    </Link>
  );
}

function Stat({ icon: Icon, value, label, color }: {
  icon: typeof Brain; value: number; label: string; color: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="w-3 h-3" style={{ color }} />
      <span className="text-xs font-semibold text-slate-300">{value}</span>
      <span className="text-[10px] text-slate-600">{label}</span>
    </div>
  );
}
