import { Link } from 'react-router-dom';
import { Brain } from 'lucide-react';

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#07101f]/80 backdrop-blur-xl">
      {/* Gradient line at very top */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-neuro-500/60 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">

          <Link to="/" className="flex items-center gap-3 group">
            {/* Animated glow logo */}
            <div className="relative w-8 h-8 shrink-0">
              <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-neuro-500 to-pharma-500 opacity-20 blur-md group-hover:opacity-40 transition-opacity duration-500" />
              <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-neuro-500 to-pharma-500 flex items-center justify-center shadow-lg shadow-neuro-500/20">
                <Brain className="w-4 h-4 text-white" />
              </div>
            </div>
            <div>
              <span className="text-sm font-bold tracking-wide text-white group-hover:text-neuro-300 transition-colors duration-200">
                NeuroMap
              </span>
              <p className="text-[10px] text-slate-500 leading-none tracking-wider uppercase mt-0.5">
                Brain · Drug · Gene
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <span className="hidden sm:flex items-center gap-1.5 text-[10px] tracking-widest uppercase text-slate-500 bg-white/[0.04] border border-white/[0.08] px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-gene-400 animate-pulse" />
              Educational Only
            </span>
          </div>

        </div>
      </div>
    </header>
  );
}
