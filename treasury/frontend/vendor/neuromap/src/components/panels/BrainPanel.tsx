import { useEffect, useRef } from 'react';
import { MapPin } from 'lucide-react';
import type { Disorder } from '../../data/types';
import { BrainViewer3D } from '../BrainViewer3D';
import { CitationInline, CitationBlock } from '../CitationList';
import { CrossLinkButton } from '../CrossLinkButton';

interface BrainPanelProps {
  disorder: Disorder;
  highlightedRegion: string | null;
  onHighlightRegion: (id: string | null) => void;
  onCrossLink: (type: 'brain' | 'drug' | 'gene', targetId: string) => void;
}

export function BrainPanel({ disorder, highlightedRegion, onHighlightRegion, onCrossLink }: BrainPanelProps) {
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlightedRegion && detailRef.current) {
      const el = detailRef.current.querySelector(`[data-region="${highlightedRegion}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [highlightedRegion]);

  const relatedDrugs = (neurotransmitters: string[]) =>
    disorder.drugs.filter(d =>
      d.relatedNeurotransmitters.some(nt => neurotransmitters.includes(nt))
    );

  return (
    <div className="space-y-6">
      <BrainViewer3D
        regions={disorder.brainRegions}
        highlightedRegion={highlightedRegion}
        onRegionClick={id => onHighlightRegion(highlightedRegion === id ? null : id)}
      />

      {/* Region cards */}
      <div ref={detailRef} className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {disorder.brainRegions.map(region => {
          const isActive = highlightedRegion === region.id;
          const drugs = relatedDrugs(region.relatedNeurotransmitters);

          return (
            <div
              key={region.id}
              data-region={region.id}
              onClick={() => onHighlightRegion(isActive ? null : region.id)}
              className="rounded-2xl p-4 sm:p-5 cursor-pointer transition-all duration-250 group"
              style={{
                background: isActive
                  ? `rgba(${hexToRgb(region.color)}, 0.08)`
                  : 'rgba(255,255,255,0.03)',
                border: isActive
                  ? `1px solid rgba(${hexToRgb(region.color)}, 0.35)`
                  : '1px solid rgba(255,255,255,0.06)',
                boxShadow: isActive
                  ? `0 0 24px rgba(${hexToRgb(region.color)}, 0.12), inset 0 0 0 1px rgba(${hexToRgb(region.color)}, 0.08)`
                  : 'none',
              }}
            >
              <div className="flex items-start gap-3">
                {/* Color dot with glow */}
                <div className="mt-1.5 shrink-0 relative">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: region.color, boxShadow: `0 0 8px ${region.color}` }}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-white mb-0.5">{region.name}</h3>
                  <p className="text-xs text-slate-500 mb-2">{region.description}</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{region.findings}</p>

                  <div className="mt-2">
                    <CitationInline citationIds={region.citations} />
                  </div>

                  {/* NT tags */}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {region.relatedNeurotransmitters.map(nt => (
                      <span
                        key={nt}
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background: `rgba(${hexToRgb(region.color)}, 0.12)`,
                          border: `1px solid rgba(${hexToRgb(region.color)}, 0.25)`,
                          color: region.color,
                        }}
                      >
                        {nt}
                      </span>
                    ))}
                  </div>

                  {/* Cross-links */}
                  {drugs.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/[0.05]">
                      {drugs.map(drug => (
                        <CrossLinkButton
                          key={drug.id}
                          type="drug"
                          label={drug.drugClass.split('(')[0].trim()}
                          targetId={drug.id}
                          onClick={onCrossLink}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Caveat */}
      <div
        className="rounded-xl p-3.5 flex items-start gap-2.5"
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <MapPin className="w-3.5 h-3.5 text-slate-600 shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-600 leading-relaxed">
          Positions are schematic. Activation patterns reflect population-level meta-analytic findings,
          not individual brain scans.
        </p>
      </div>

      <CitationBlock citations={disorder.citations} />
    </div>
  );
}

function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `${r},${g},${b}`;
}
