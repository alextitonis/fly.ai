export interface Citation {
  id: string;
  authors: string;
  year: number;
  title: string;
  journal: string;
  doi?: string;
  pmid?: string;
}

export interface BrainRegion {
  id: string;
  name: string;
  description: string;
  position: [number, number, number]; // normalized 3D position in brain model
  color: string;
  findings: string;
  citations: string[];
  relatedNeurotransmitters: string[];
}

export interface Drug {
  id: string;
  name: string;
  drugClass: string;
  classExamples: string[];
  target: string;
  targetGene: string;
  targetProtein: string;
  mechanism: string;
  mechanismDetailed: string;
  pubchemCid?: number;
  pdbTargetId?: string;
  citations: string[];
  relatedBrainRegions: string[];
  relatedNeurotransmitters: string[];
}

export interface GeneAssociation {
  id: string;
  gene: string;
  protein: string;
  normalFunction: string;
  disorderHypothesis: string;
  effectSize: string;
  structureSource: 'experimental' | 'predicted';
  pdbId?: string;
  alphafoldId?: string;
  citations: string[];
  isDrugTarget: boolean;
  relatedDrugIds: string[];
}

export interface GeneticArchitecture {
  summary: string;
  heritability: string;
  isPolygenic: boolean;
  polygenicNote: string;
  replicationCaveats?: string;
}

export interface Disorder {
  id: string;
  name: string;
  shortDescription: string;
  overview: string;
  brainRegions: BrainRegion[];
  drugs: Drug[];
  geneAssociations: GeneAssociation[];
  geneticArchitecture: GeneticArchitecture;
  citations: Citation[];
  neurotransmitterSystems: string[];
}
