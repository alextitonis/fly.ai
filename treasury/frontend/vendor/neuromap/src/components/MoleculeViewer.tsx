import { useRef, useState, useEffect, useCallback } from 'react';
import { RotateCcw, Eye } from 'lucide-react';

type ViewStyle = 'stick' | 'sphere' | 'cartoon';

interface MoleculeViewerProps {
  pubchemCid?: number;
  pdbId?: string;
  alphafoldId?: string;
  name: string;
  type: 'drug' | 'protein';
}

let globalViewer: any = null;
let globalContainer: HTMLDivElement | null = null;
let currentMountId: number = 0;

function getOrCreateViewer(container: HTMLDivElement): any {
  const $3Dmol = (window as any).$3Dmol;
  if (!$3Dmol) return null;

  if (globalViewer && globalContainer === container) {
    return globalViewer;
  }

  if (globalViewer) {
    globalViewer.clear();
    try { globalViewer.removeAllModels(); } catch {}
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

  globalViewer = $3Dmol.createViewer(container, {
    backgroundColor: '0x1e293b',
    antialias: true,
    devicePixelRatio: dpr,
  });
  globalContainer = container;
  return globalViewer;
}

export function MoleculeViewer({ pubchemCid, pdbId, alphafoldId, name, type }: MoleculeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountId = useRef(++currentMountId);
  const [viewStyle, setViewStyle] = useState<ViewStyle>(type === 'protein' ? 'cartoon' : 'stick');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isDragging = useRef(false);
  const animFrame = useRef<number>(0);

  const stopRenderLoop = useCallback(() => {
    if (animFrame.current) {
      cancelAnimationFrame(animFrame.current);
      animFrame.current = 0;
    }
  }, []);

  const startRenderLoop = useCallback(() => {
    if (animFrame.current) return;
    const loop = () => {
      if (!isDragging.current) {
        stopRenderLoop();
        return;
      }
      if (globalViewer) globalViewer.render();
      animFrame.current = requestAnimationFrame(loop);
    };
    animFrame.current = requestAnimationFrame(loop);
  }, [stopRenderLoop]);

  useEffect(() => {
    let cancelled = false;
    const id = ++currentMountId;
    mountId.current = id;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        let data: string;
        let format: string;

        if (pubchemCid && type === 'drug') {
          const resp = await fetch(
            `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${pubchemCid}/record/SDF/?record_type=3d&response_type=display`
          );
          if (!resp.ok) throw new Error('Failed to fetch from PubChem');
          data = await resp.text();
          format = 'sdf';
        } else if (pdbId) {
          const resp = await fetch(`https://files.rcsb.org/download/${pdbId}.pdb`);
          if (!resp.ok) throw new Error('Failed to fetch from PDB');
          data = await resp.text();
          format = 'pdb';
        } else if (alphafoldId) {
          const resp = await fetch(
            `https://alphafold.ebi.ac.uk/files/${alphafoldId}-model_v4.pdb`
          );
          if (!resp.ok) throw new Error('Failed to fetch from AlphaFold');
          data = await resp.text();
          format = 'pdb';
        } else {
          throw new Error('No structure identifier provided');
        }

        if (cancelled || mountId.current !== id) return;
        if (!containerRef.current) return;

        const viewer = getOrCreateViewer(containerRef.current);
        if (!viewer) {
          setError('3Dmol.js not loaded');
          setLoading(false);
          return;
        }

        viewer.removeAllModels();
        viewer.addModel(data, format);
        applyStyle(viewer, viewStyle, type);
        viewer.zoomTo();
        viewer.render();
        setLoading(false);
      } catch (err) {
        if (!cancelled && mountId.current === id) {
          setError(err instanceof Error ? err.message : 'Failed to load structure');
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
      stopRenderLoop();
    };
  }, [pubchemCid, pdbId, alphafoldId, type]);

  useEffect(() => {
    if (!globalViewer || !globalContainer || globalContainer !== containerRef.current) return;
    applyStyle(globalViewer, viewStyle, type);
    globalViewer.render();
  }, [viewStyle, type]);

  // Render-on-demand: only render during drag interaction
  const handlePointerDown = useCallback(() => {
    isDragging.current = true;
    startRenderLoop();
  }, [startRenderLoop]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
    // Final render after release
    if (globalViewer) globalViewer.render();
  }, []);

  useEffect(() => {
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [handlePointerUp]);

  const resetView = useCallback(() => {
    if (globalViewer && globalContainer === containerRef.current) {
      globalViewer.zoomTo();
      globalViewer.render();
    }
  }, []);

  const styleOptions: { id: ViewStyle; label: string }[] =
    type === 'protein'
      ? [
          { id: 'cartoon', label: 'Ribbon' },
          { id: 'stick', label: 'Ball & Stick' },
          { id: 'sphere', label: 'Space-fill' },
        ]
      : [
          { id: 'stick', label: 'Ball & Stick' },
          { id: 'sphere', label: 'Space-fill' },
        ];

  if (error) {
    return (
      <div className="rounded-lg bg-slate-900/50 border border-slate-700/30 p-6 text-center">
        <p className="text-sm text-slate-500">{name}</p>
        <p className="text-xs text-red-400/60 mt-1">{error}</p>
        <p className="text-xs text-slate-600 mt-2">
          {pdbId && `PDB: ${pdbId}`}
          {pubchemCid && `PubChem CID: ${pubchemCid}`}
          {alphafoldId && `AlphaFold: ${alphafoldId}`}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg overflow-hidden border border-slate-700/30">
      <div
        ref={containerRef}
        className="w-full bg-slate-800 relative touch-none"
        style={{ height: type === 'protein' ? '320px' : '250px' }}
        role="img"
        aria-label={`3D structure of ${name}`}
        onPointerDown={handlePointerDown}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-800 z-10">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-slate-600 border-t-neuro-400 rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-slate-500">Loading {name}...</p>
            </div>
          </div>
        )}
      </div>
      <div className="bg-slate-900/50 px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5 text-slate-500" />
          {styleOptions.map(opt => (
            <button
              key={opt.id}
              onClick={() => setViewStyle(opt.id)}
              className={`text-[10px] px-2 py-1 rounded transition-colors ${
                viewStyle === opt.id
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button onClick={resetView} className="p-1 text-slate-500 hover:text-white transition-colors" title="Reset view">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="bg-slate-900/50 px-3 pb-2">
        <p className="text-[10px] text-slate-600">
          {pdbId && `PDB: ${pdbId}`}
          {pubchemCid && `PubChem CID: ${pubchemCid}`}
          {alphafoldId && (
            <span>
              AlphaFold: {alphafoldId}
              <span className="ml-1 text-amber-500/60">(predicted structure)</span>
            </span>
          )}
          {' — '}{name}
        </p>
      </div>
    </div>
  );
}

function applyStyle(viewer: any, style: ViewStyle, type: 'drug' | 'protein') {
  viewer.setStyle({}, {});
  switch (style) {
    case 'stick':
      viewer.setStyle({}, { stick: { radius: 0.15, colorscheme: 'Jmol' }, sphere: { scale: 0.25, colorscheme: 'Jmol' } });
      break;
    case 'sphere':
      viewer.setStyle({}, { sphere: { colorscheme: 'Jmol' } });
      break;
    case 'cartoon':
      if (type === 'protein') {
        viewer.setStyle({}, { cartoon: { color: 'spectrum' } });
      } else {
        viewer.setStyle({}, { stick: { radius: 0.15, colorscheme: 'Jmol' }, sphere: { scale: 0.25, colorscheme: 'Jmol' } });
      }
      break;
  }
}
