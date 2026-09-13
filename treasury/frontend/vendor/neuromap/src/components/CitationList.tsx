import { BookOpen, ExternalLink } from 'lucide-react';
import type { Citation } from '../data/types';
import { citations as allCitations } from '../data/citations';

export function CitationInline({ citationIds }: { citationIds: string[] }) {
  return (
    <span className="inline text-xs text-slate-500">
      {citationIds.map((id, i) => {
        const c = allCitations[id];
        if (!c) return null;
        return (
          <span key={id}>
            {i > 0 && ', '}
            <span className="text-neuro-400/70 hover:text-neuro-300 cursor-help" title={`${c.authors} (${c.year}). ${c.title}. ${c.journal}`}>
              [{c.authors.split(',')[0].split(' ').pop()}, {c.year}]
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function CitationBlock({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;

  return (
    <div className="mt-8 pt-6 border-t border-slate-700/50">
      <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-4">
        <BookOpen className="w-4 h-4" />
        References
      </h3>
      <ol className="space-y-3">
        {citations.map((c, i) => (
          <li key={c.id} className="text-xs text-slate-500 leading-relaxed">
            <span className="text-slate-600 mr-1">{i + 1}.</span>
            {c.authors} ({c.year}). {c.title}. <em>{c.journal}</em>.
            {c.doi && (
              <a
                href={`https://doi.org/${c.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 ml-1 text-neuro-400/60 hover:text-neuro-300"
              >
                DOI <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {c.pmid && (
              <a
                href={`https://pubmed.ncbi.nlm.nih.gov/${c.pmid}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 ml-1 text-neuro-400/60 hover:text-neuro-300"
              >
                PubMed <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
