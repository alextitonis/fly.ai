import { ArrowRight, Brain, Pill, Dna } from 'lucide-react';

const iconMap = {
  brain: Brain,
  drug: Pill,
  gene: Dna,
};

const colorMap = {
  brain: 'text-neuro-400 hover:bg-neuro-900/30 border-neuro-800/50',
  drug: 'text-pharma-400 hover:bg-pharma-900/30 border-pharma-800/50',
  gene: 'text-gene-400 hover:bg-gene-900/30 border-gene-800/50',
};

interface CrossLinkButtonProps {
  type: 'brain' | 'drug' | 'gene';
  label: string;
  targetId: string;
  onClick: (type: 'brain' | 'drug' | 'gene', targetId: string) => void;
  isDrugTarget?: boolean;
}

export function CrossLinkButton({ type, label, targetId, onClick, isDrugTarget }: CrossLinkButtonProps) {
  const Icon = iconMap[type];
  return (
    <button
      onClick={() => onClick(type, targetId)}
      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${colorMap[type]}`}
      title={`View in ${type === 'brain' ? 'Brain Map' : type === 'drug' ? 'Pharmacology' : 'Molecular Basis'}`}
    >
      <Icon className="w-3 h-3" />
      <span className="truncate max-w-[120px]">{label}</span>
      {isDrugTarget !== undefined && (
        <span className={`text-[10px] px-1 py-0.5 rounded ${isDrugTarget ? 'bg-pharma-900/50 text-pharma-300' : 'bg-gene-900/50 text-gene-300'}`}>
          {isDrugTarget ? 'drug target' : 'risk gene'}
        </span>
      )}
      <ArrowRight className="w-3 h-3 opacity-50" />
    </button>
  );
}
