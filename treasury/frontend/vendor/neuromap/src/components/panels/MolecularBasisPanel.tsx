import { useState, useEffect, useRef } from 'react';
import { Dna, AlertTriangle, TrendingUp, FlaskConical, ChevronDown, ChevronUp } from 'lucide-react';

import type { Disorder } from '../../data/types';
import { CitationInline, CitationBlock } from '../CitationList';
import { CrossLinkButton } from '../CrossLinkButton';
import { MoleculeViewer } from '../MoleculeViewer';

interface MolecularBasisPanelProps {
  disorder: Disorder;
  highlightedGene: string | null;
  onHighlightGene: (id: string | null) => void;
  onCrossLink: (type: 'brain' | 'drug' | 'gene', targetId: string) => void;
}

export function MolecularBasisPanel({ disorder, highlightedGene, onHighlightGene, onCrossLink }: MolecularBasisPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeStructure, setActiveStructure] = useState<string | null>(null);

  useEffect(() => {
    if (highlightedGene && containerRef.current) {
      const el = containerRef.current.querySelector(`[data-gene="${highlightedGene}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [highlightedGene]);

  const toggleStructure = (geneId: string) => {
    setActiveStructure(prev => (prev === geneId ? null : geneId));
  };

  const { geneticArchitecture: ga } = disorder;

  return (
    <div className="space-y-6" ref={containerRef}>
      {/* Genetic architecture overview */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-gene-600/20 flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5 text-gene-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">Genetic Architecture</h3>
            <p className="text-sm text-slate-300 leading-relaxed">{ga.summary}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/30">
                <p className="text-xs text-slate-500 uppercase tracking-wider">Heritability</p>
                <p className="text-sm text-white font-medium mt-0.5">{ga.heritability}</p>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/30">
                <p className="text-xs text-slate-500 uppercase tracking-wider">Architecture</p>
                <p className="text-sm text-white font-medium mt-0.5">
                  {ga.isPolygenic ? 'Highly polygenic' : 'Mixed'}
                </p>
              </div>
            </div>
            {ga.isPolygenic && (
              <div className="mt-3 p-3 bg-gene-900/10 border border-gene-800/20 rounded-lg">
                <p className="text-xs text-gene-300/80 leading-relaxed">
                  <strong className="text-gene-300">No single causal gene.</strong> {ga.polygenicNote}
                </p>
              </div>
            )}
            {ga.replicationCaveats && (
              <div className="mt-3 p-3 bg-amber-900/10 border border-amber-800/20 rounded-lg">
                <p className="text-xs text-amber-300/80 leading-relaxed flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span><strong className="text-amber-300">Replication note:</strong> {ga.replicationCaveats}</span>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Visual distinction note */}
      <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-4">
        <p className="text-xs text-slate-500 leading-relaxed">
          <strong className="text-slate-400">Reading guide:</strong> Entries below are marked as either
          <span className="inline-flex items-center mx-1 px-1.5 py-0.5 rounded bg-pharma-900/50 text-pharma-300 text-[10px]">drug target</span>
          (a well-defined pharmacological object) or
          <span className="inline-flex items-center mx-1 px-1.5 py-0.5 rounded bg-gene-900/50 text-gene-300 text-[10px]">risk gene</span>
          (a probabilistic association in a polygenic picture). These are different kinds of claims.
        </p>
      </div>

      {/* Gene entries */}
      {disorder.geneAssociations.map(gene => {
        const isActive = highlightedGene === gene.id;
        const relatedDrugs = disorder.drugs.filter(d => gene.relatedDrugIds.includes(d.id));
        const showStructure = activeStructure === gene.id;
        const hasStructure = !!(gene.pdbId || gene.alphafoldId);

        return (
          <div
            key={gene.id}
            data-gene={gene.id}
            className={`rounded-xl border transition-all duration-200 overflow-hidden ${
              isActive
                ? 'bg-slate-800 border-gene-500/50 shadow-lg shadow-gene-900/20 ring-1 ring-gene-500/20'
                : 'bg-slate-800/30 border-slate-700/50'
            }`}
          >
            <div
              className="p-4 sm:p-5 cursor-pointer"
              onClick={() => onHighlightGene(isActive ? null : gene.id)}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-gene-600/20 flex items-center justify-center shrink-0">
                  <Dna className="w-5 h-5 text-gene-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-semibold text-white font-mono">{gene.gene}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                      gene.isDrugTarget
                        ? 'bg-pharma-900/50 text-pharma-300 border border-pharma-800/30'
                        : 'bg-gene-900/50 text-gene-300 border border-gene-800/30'
                    }`}>
                      {gene.isDrugTarget ? 'drug target' : 'risk gene'}
                    </span>
                  </div>
                  <p className="text-sm text-gene-300/80">{gene.protein}</p>
                </div>
              </div>
            </div>

            <div className="px-4 sm:px-5 pb-5 space-y-4">
              <div>
                <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">Normal Function</h4>
                <p className="text-sm text-slate-300 leading-relaxed">{gene.normalFunction}</p>
              </div>

              <div>
                <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                  Hypothesized Role in {disorder.name}
                </h4>
                <p className="text-sm text-slate-300 leading-relaxed">{gene.disorderHypothesis}</p>
              </div>

              <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/30">
                <p className="text-xs text-slate-500 uppercase tracking-wider">Effect Size / Strength of Association</p>
                <p className="text-sm text-white mt-1">{gene.effectSize}</p>
              </div>

              {/* 3D structure — accordion, one at a time */}
              {hasStructure && (
                <div>
                  <button
                    onClick={() => toggleStructure(gene.id)}
                    className="w-full text-left text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5 hover:text-slate-200 transition-colors"
                  >
                    <FlaskConical className="w-3.5 h-3.5" />
                    Protein Structure
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      gene.structureSource === 'experimental'
                        ? 'bg-green-900/50 text-green-300'
                        : 'bg-amber-900/50 text-amber-300'
                    }`}>
                      {gene.structureSource === 'experimental' ? 'Experimental (PDB)' : 'Predicted (AlphaFold)'}
                    </span>
                    {showStructure ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
                  </button>
                  {showStructure && (
                    <MoleculeViewer
                      pdbId={gene.pdbId}
                      alphafoldId={gene.alphafoldId}
                      name={gene.protein}
                      type="protein"
                    />
                  )}
                </div>
              )}

              <div className="mt-2">
                <CitationInline citationIds={gene.citations} />
              </div>

              {relatedDrugs.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-700/30">
                  <span className="text-xs text-slate-500 self-center">Targeted by:</span>
                  {relatedDrugs.map(drug => (
                    <CrossLinkButton
                      key={drug.id}
                      type="drug"
                      label={drug.name}
                      targetId={drug.id}
                      onClick={onCrossLink}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}

      <CitationBlock citations={disorder.citations} />
    </div>
  );
}
