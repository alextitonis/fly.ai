import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Brain, Pill, Dna, Info } from 'lucide-react';
import { getDisorderById } from '../data/disorders';
import { BrainPanel } from '../components/panels/BrainPanel';
import { PharmacologyPanel } from '../components/panels/PharmacologyPanel';
import { MolecularBasisPanel } from '../components/panels/MolecularBasisPanel';

type TabId = 'brain' | 'pharmacology' | 'molecular';

const tabs: {
  id: TabId;
  label: string;
  icon: typeof Brain;
  accent: string;
  glow: string;
}[] = [
  { id: 'brain',        label: 'Brain Map',      icon: Brain, accent: '#38bdf8', glow: 'rgba(14,165,233,0.25)' },
  { id: 'pharmacology', label: 'Pharmacology',    icon: Pill,  accent: '#e879f9', glow: 'rgba(217,70,239,0.25)' },
  { id: 'molecular',    label: 'Molecular Basis', icon: Dna,   accent: '#34d399', glow: 'rgba(16,185,129,0.25)' },
];

export function DisorderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const disorder = getDisorderById(id || '');
  const [activeTab, setActiveTab] = useState<TabId>('brain');
  const [highlightedRegion, setHighlightedRegion] = useState<string | null>(null);
  const [highlightedDrug,   setHighlightedDrug]   = useState<string | null>(null);
  const [highlightedGene,   setHighlightedGene]   = useState<string | null>(null);

  if (!disorder) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <p className="text-slate-500 mb-4">Disorder not found.</p>
        <Link to="/" className="text-sm text-neuro-400 hover:text-neuro-300 transition-colors">
          ← Return home
        </Link>
      </div>
    );
  }

  const handleCrossLink = (type: 'brain' | 'drug' | 'gene', targetId: string) => {
    if (type === 'brain')       { setActiveTab('brain');        setHighlightedRegion(targetId); }
    else if (type === 'drug')   { setActiveTab('pharmacology'); setHighlightedDrug(targetId);   }
    else                        { setActiveTab('molecular');    setHighlightedGene(targetId);    }
  };

  const activeTabData = tabs.find(t => t.id === activeTab)!;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

      {/* Back + Title */}
      <div className="flex items-start gap-4 mb-7">
        <button
          onClick={() => navigate('/')}
          aria-label="Go back"
          className="mt-1 w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-white transition-all duration-200 shrink-0"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{disorder.name}</h1>
          <p className="text-sm text-slate-500 mt-1">{disorder.shortDescription}</p>
        </div>
      </div>

      {/* Overview */}
      <div
        className="rounded-2xl p-5 mb-7"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-neuro-500/15 flex items-center justify-center shrink-0 mt-0.5">
            <Info className="w-3.5 h-3.5 text-neuro-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-slate-300 leading-relaxed">{disorder.overview}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {disorder.neurotransmitterSystems.map(nt => (
                <span
                  key={nt}
                  className="text-[11px] px-2.5 py-1 rounded-full text-slate-400 font-medium"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.09)',
                  }}
                >
                  {nt}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1.5 mb-7 p-1 rounded-2xl overflow-x-auto"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              aria-selected={isActive}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap"
              style={isActive ? {
                background: `rgba(${hexToRgb(tab.accent)}, 0.12)`,
                border: `1px solid rgba(${hexToRgb(tab.accent)}, 0.3)`,
                color: tab.accent,
                boxShadow: `0 0 16px ${tab.glow}`,
              } : {
                background: 'transparent',
                border: '1px solid transparent',
                color: '#64748b',
              }}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Panel */}
      <div role="tabpanel">
        {activeTab === 'brain' && (
          <BrainPanel
            disorder={disorder}
            highlightedRegion={highlightedRegion}
            onHighlightRegion={setHighlightedRegion}
            onCrossLink={handleCrossLink}
          />
        )}
        {activeTab === 'pharmacology' && (
          <PharmacologyPanel
            disorder={disorder}
            highlightedDrug={highlightedDrug}
            onHighlightDrug={setHighlightedDrug}
            onCrossLink={handleCrossLink}
          />
        )}
        {activeTab === 'molecular' && (
          <MolecularBasisPanel
            disorder={disorder}
            highlightedGene={highlightedGene}
            onHighlightGene={setHighlightedGene}
            onCrossLink={handleCrossLink}
          />
        )}
      </div>

      {/* Subtle active tab indicator in corner */}
      <div
        className="fixed bottom-5 right-5 text-[10px] tracking-widest uppercase px-3 py-1.5 rounded-full pointer-events-none"
        style={{
          background: `rgba(${hexToRgb(activeTabData.accent)}, 0.1)`,
          border: `1px solid rgba(${hexToRgb(activeTabData.accent)}, 0.2)`,
          color: activeTabData.accent,
        }}
      >
        {activeTabData.label}
      </div>

    </div>
  );
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}
