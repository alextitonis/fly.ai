import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, FlaskConical, Target, Pill, AlertTriangle } from 'lucide-react';
import type { Disorder } from '../../data/types';
import { CitationInline, CitationBlock } from '../CitationList';
import { CrossLinkButton } from '../CrossLinkButton';
import { MoleculeViewer } from '../MoleculeViewer';

interface PharmacologyPanelProps {
  disorder: Disorder;
  highlightedDrug: string | null;
  onHighlightDrug: (id: string | null) => void;
  onCrossLink: (type: 'brain' | 'drug' | 'gene', targetId: string) => void;
}

type ActiveViewer = { drugId: string; viewerType: 'drug' | 'target' } | null;

export function PharmacologyPanel({ disorder, highlightedDrug, onHighlightDrug, onCrossLink }: PharmacologyPanelProps) {
  const [expandedMechanism, setExpandedMechanism] = useState<string | null>(null);
  const [activeViewer, setActiveViewer] = useState<ActiveViewer>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlightedDrug && containerRef.current) {
      const el = containerRef.current.querySelector(`[data-drug="${highlightedDrug}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [highlightedDrug]);

  const toggleViewer = (drugId: string, viewerType: 'drug' | 'target') => {
    setActiveViewer(prev =>
      prev && prev.drugId === drugId && prev.viewerType === viewerType ? null : { drugId, viewerType }
    );
  };

  return (
    <div className="space-y-6" ref={containerRef}>
      <div className="bg-pharma-900/10 border border-pharma-800/30 rounded-xl p-4">
        <p className="text-xs text-pharma-300/80 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          This section explains pharmacology for educational purposes. It does not recommend, compare, or advise
          on any treatment. Drug selection depends on individual factors and should involve a qualified healthcare provider.
        </p>
      </div>

      {disorder.drugs.map(drug => {
        const isActive = highlightedDrug === drug.id;
        const isExpanded = expandedMechanism === drug.id;
        const relatedGenes = disorder.geneAssociations.filter(g => g.relatedDrugIds.includes(drug.id));
        const showDrugViewer = activeViewer?.drugId === drug.id && activeViewer.viewerType === 'drug';
        const showTargetViewer = activeViewer?.drugId === drug.id && activeViewer.viewerType === 'target';

        return (
          <div
            key={drug.id}
            data-drug={drug.id}
            className={`rounded-xl border transition-all duration-200 overflow-hidden ${
              isActive
                ? 'bg-slate-800 border-pharma-500/50 shadow-lg shadow-pharma-900/20 ring-1 ring-pharma-500/20'
                : 'bg-slate-800/30 border-slate-700/50'
            }`}
          >
            <div
              className="p-4 sm:p-5 cursor-pointer"
              onClick={() => onHighlightDrug(isActive ? null : drug.id)}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-pharma-600/20 flex items-center justify-center shrink-0">
                  <Pill className="w-5 h-5 text-pharma-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">{drug.name}</h3>
                  <p className="text-sm text-pharma-300/80 font-medium">{drug.drugClass}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {drug.classExamples.map(ex => (
                      <span
                        key={ex}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-pharma-900/30 text-pharma-300/70 border border-pharma-800/30"
                      >
                        {ex}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-4 sm:px-5 pb-5 space-y-5">
              {/* 3D drug structure — accordion toggle, only one viewer mounted at a time */}
              {drug.pubchemCid && (
                <div>
                  <button
                    onClick={() => toggleViewer(drug.id, 'drug')}
                    className="w-full text-left text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5 hover:text-slate-200 transition-colors"
                  >
                    <FlaskConical className="w-3.5 h-3.5" />
                    3D Molecular Structure
                    {showDrugViewer ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
                  </button>
                  {showDrugViewer && (
                    <MoleculeViewer
                      pubchemCid={drug.pubchemCid}
                      name={drug.name}
                      type="drug"
                    />
                  )}
                </div>
              )}

              {/* Target */}
              <div>
                <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5" />
                  Molecular Target
                </h4>
                <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/30">
                  <p className="text-sm text-white font-medium">{drug.target}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Gene: <span className="text-pharma-400/80 font-mono">{drug.targetGene}</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Protein: {drug.targetProtein}
                  </p>
                </div>
              </div>

              {/* Mechanism */}
              <div>
                <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Mechanism of Action</h4>
                <p className="text-sm text-slate-300 leading-relaxed">{drug.mechanism}</p>

                <button
                  onClick={() => setExpandedMechanism(isExpanded ? null : drug.id)}
                  className="flex items-center gap-1 mt-2 text-xs text-pharma-400 hover:text-pharma-300 transition-colors"
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className="w-3.5 h-3.5" /> Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" /> Show detailed mechanism
                    </>
                  )}
                </button>

                {isExpanded && (
                  <div className="mt-3 p-3 bg-slate-900/50 rounded-lg border border-slate-700/30">
                    <p className="text-sm text-slate-400 leading-relaxed">{drug.mechanismDetailed}</p>
                  </div>
                )}

                <div className="mt-2">
                  <CitationInline citationIds={drug.citations} />
                </div>
              </div>

              {/* Target protein 3D — accordion toggle */}
              {drug.pdbTargetId && (
                <div>
                  <button
                    onClick={() => toggleViewer(drug.id, 'target')}
                    className="w-full text-left text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5 hover:text-slate-200 transition-colors"
                  >
                    <FlaskConical className="w-3.5 h-3.5" />
                    Target Protein Structure
                    {showTargetViewer ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
                  </button>
                  {showTargetViewer && (
                    <MoleculeViewer
                      pdbId={drug.pdbTargetId}
                      name={drug.target}
                      type="protein"
                    />
                  )}
                </div>
              )}

              {/* Cross-links */}
              <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-700/30">
                {drug.relatedBrainRegions.map(regionId => {
                  const region = disorder.brainRegions.find(r => r.id === regionId);
                  if (!region) return null;
                  return (
                    <CrossLinkButton
                      key={regionId}
                      type="brain"
                      label={region.name}
                      targetId={regionId}
                      onClick={onCrossLink}
                    />
                  );
                })}
                {relatedGenes.map(gene => (
                  <CrossLinkButton
                    key={gene.id}
                    type="gene"
                    label={gene.gene}
                    targetId={gene.id}
                    onClick={onCrossLink}
                    isDrugTarget={gene.isDrugTarget}
                  />
                ))}
              </div>
            </div>
          </div>
        );
      })}

      <CitationBlock citations={disorder.citations} />
    </div>
  );
}
