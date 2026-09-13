# NeuroMap

An educational 3D visualizer exploring mental health disorders at three connected levels: brain activation patterns, pharmacology, and molecular/genetic basis. Every claim is cited from open peer-reviewed research.

**Not medical advice. For educational use only.**

---

## What It Does

Select a disorder to explore:

- **Brain Map** — Interactive 3D brain with fMRI-style activation overlays, connectivity arcs between related regions, and X-ray toggle to reveal subcortical structures
- **Pharmacology** — Drug mechanisms with 3D molecular structures (PubChem SDF) and protein targets (RCSB PDB / AlphaFold)
- **Molecular Basis** — Gene associations, protein function, genetic architecture (heritability, polygenicity, GWAS findings), with full citation context

Cross-links between panels let you trace a region → drug → gene in a single click.

---

## Disorders Covered

| Disorder | Regions | Drugs | Genes |
|---|---|---|---|
| Major Depressive Disorder | 4 | 2 | 2 |
| Generalized Anxiety Disorder | 4 | 2 | 1 |
| Schizophrenia | 5 | 2 | 3 |
| ADHD | 4 | 2 | 2 |

---

## Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + Vite 8 + TypeScript |
| Styling | Tailwind CSS v4 |
| 3D Brain | React Three Fiber + Three.js |
| Molecular Viewer | 3Dmol.js (CDN) |
| Routing | React Router DOM |
| Icons | Lucide React |
| Fonts | Crimson Pro · Atkinson Hyperlegible |

---

## Running Locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Project Structure

```
src/
├── components/
│   ├── BrainViewer3D.tsx      # Three.js brain with activation blobs + connectivity arcs
│   ├── MoleculeViewer.tsx     # Singleton 3Dmol.js viewer
│   ├── DisorderCard.tsx       # Home page disorder cards
│   ├── Header.tsx
│   └── panels/
│       ├── BrainPanel.tsx
│       ├── PharmacologyPanel.tsx
│       └── MolecularBasisPanel.tsx
├── data/
│   ├── types.ts               # TypeScript interfaces
│   ├── citations.ts           # ~38 academic citations
│   └── disorders/
│       ├── depression.ts
│       ├── anxiety.ts
│       ├── schizophrenia.ts
│       └── adhd.ts
└── pages/
    ├── HomePage.tsx
    └── DisorderPage.tsx
```

---

## Design Decisions

- **Single WebGL context** — 3Dmol.js uses a singleton viewer pattern; accordion ensures only one molecular structure is mounted at a time
- **Render on demand** — React Three Fiber runs `frameloop="demand"`, only rendering when the user interacts
- **DPR cap** — Device pixel ratio capped at 1.5 on mobile to reduce GPU load
- **No NiiVue / volumetric data** — Brain geometry is procedural Three.js (no remote file downloads); keeps load time under 1s
- **X-ray mode** — Cortex opacity drops to 0.25 when a subcortical region is clicked, auto-revealing internal structures

---

## Citations

All neuroscience content is sourced from peer-reviewed publications. Citations are shown inline throughout the app. Key sources include Cipriani et al. (2018), Sekar et al. (2016), Trubetskoy et al. (2022), Demontis et al. (2019), Hoogman et al. (2017), and others listed in `src/data/citations.ts`.

---

## License

MIT — see [LICENSE](LICENSE).
