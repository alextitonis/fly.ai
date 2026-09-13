import type { Disorder } from '../types';
import { citations } from '../citations';

export const schizophrenia: Disorder = {
  id: 'schizophrenia',
  name: 'Schizophrenia',
  shortDescription: 'A disorder involving disruptions in thought, perception, and cognition, including psychosis.',
  overview:
    'Schizophrenia is a severe psychiatric disorder characterized by positive symptoms (hallucinations, delusions), negative symptoms (flat affect, social withdrawal, avolition), and cognitive deficits. Neuroimaging associates it with widespread cortical and subcortical abnormalities. It is highly heritable and polygenic, with the largest GWAS identifying over 200 risk loci. Complement component 4 (C4) stands out as a mechanistic lead linking genetics to synaptic pruning.',
  neurotransmitterSystems: ['Dopamine (DA)', 'Serotonin (5-HT)', 'Glutamate', 'GABA'],
  brainRegions: [
    {
      id: 'scz-dlpfc',
      name: 'Dorsolateral Prefrontal Cortex (DLPFC)',
      description: 'The DLPFC supports working memory, planning, and cognitive control.',
      position: [0.25, 0.55, 0.7],
      color: '#3b82f6',
      findings:
        'Reduced DLPFC activation during working memory tasks is one of the most replicated functional imaging findings in schizophrenia. This hypoactivation correlates with cognitive deficits and negative symptoms.',
      citations: ['anticevic2012', 'glausier2013'],
      relatedNeurotransmitters: ['Dopamine (DA)', 'Glutamate', 'GABA'],
    },
    {
      id: 'scz-striatum',
      name: 'Striatum',
      description: 'The striatum integrates cortical inputs and is central to reward and motor circuits.',
      position: [0.2, 0.1, 0.25],
      color: '#ef4444',
      findings:
        'Elevated presynaptic dopamine synthesis capacity in the striatum is consistently found in schizophrenia, particularly in patients with positive symptoms. This is the basis of the dopamine hypothesis and the target of antipsychotic action.',
      citations: ['howes2009', 'vanrossum1966'],
      relatedNeurotransmitters: ['Dopamine (DA)'],
    },
    {
      id: 'scz-hippocampus',
      name: 'Hippocampus',
      description: 'The hippocampus is essential for memory and contextual processing.',
      position: [0.3, -0.2, -0.1],
      color: '#8b5cf6',
      findings:
        'Reduced hippocampal volume and altered activity are consistently reported in schizophrenia. Disrupted hippocampal-prefrontal connectivity may contribute to memory deficits and disorganized thinking.',
      citations: ['glausier2013'],
      relatedNeurotransmitters: ['Glutamate', 'GABA'],
    },
    {
      id: 'scz-stg',
      name: 'Superior Temporal Gyrus (STG)',
      description: 'The STG is involved in auditory processing and language comprehension.',
      position: [0.55, 0, 0.2],
      color: '#f59e0b',
      findings:
        'Structural and functional changes in the STG are associated with auditory hallucinations in schizophrenia. Reduced gray matter volume and abnormal activation during auditory processing are frequent findings.',
      citations: ['glausier2013'],
      relatedNeurotransmitters: ['Glutamate', 'Dopamine (DA)'],
    },
    {
      id: 'scz-thalamus',
      name: 'Thalamus',
      description: 'The thalamus relays sensory and motor information and acts as a gateway to the cortex.',
      position: [0, 0.05, 0.15],
      color: '#10b981',
      findings:
        'Reduced thalamic volume and disrupted thalamocortical connectivity are reported in schizophrenia. The thalamus acts as a filter for sensory information, and its dysfunction may contribute to the sensory flooding and reality-testing failures seen in psychosis.',
      citations: ['anticevic2012'],
      relatedNeurotransmitters: ['Glutamate', 'GABA', 'Dopamine (DA)'],
    },
  ],
  drugs: [
    {
      id: 'scz-typical',
      name: 'Haloperidol (Haldol)',
      drugClass: 'First-generation (typical) antipsychotics',
      classExamples: ['Haloperidol', 'Chlorpromazine', 'Fluphenazine'],
      target: 'Dopamine D2 Receptor',
      targetGene: 'DRD2',
      targetProtein: 'Dopamine D2 receptor',
      mechanism:
        'Typical antipsychotics are D2 receptor antagonists. They block dopamine signaling in the mesolimbic pathway, reducing positive symptoms (hallucinations, delusions). However, they also block D2 receptors in other pathways, causing motor side effects (extrapyramidal symptoms) and potentially worsening negative symptoms.',
      mechanismDetailed:
        'The dopamine hypothesis, first proposed by Van Rossum (1966), holds that excessive dopaminergic transmission in the mesolimbic pathway drives positive symptoms. Typical antipsychotics competitively antagonize D2 receptors across the brain. In the mesolimbic pathway, this reduces psychotic symptoms. In the nigrostriatal pathway, it causes extrapyramidal symptoms (tremor, rigidity, tardive dyskinesia). In the tuberoinfundibular pathway, it raises prolactin. In the mesocortical pathway, D2 blockade may worsen cognitive and negative symptoms. This non-selective D2 blockade is why typical antipsychotics have a narrower therapeutic window than atypicals.',
      pubchemCid: 3559,
      citations: ['howes2009', 'vanrossum1966', 'stahl2013'],
      relatedBrainRegions: ['scz-striatum', 'scz-dlpfc'],
      relatedNeurotransmitters: ['Dopamine (DA)'],
    },
    {
      id: 'scz-atypical',
      name: 'Clozapine (Clozaril)',
      drugClass: 'Second-generation (atypical) antipsychotics',
      classExamples: ['Clozapine', 'Risperidone', 'Olanzapine', 'Quetiapine', 'Aripiprazole'],
      target: 'Dopamine D2 and Serotonin 5-HT2A Receptors',
      targetGene: 'DRD2, HTR2A',
      targetProtein: 'Dopamine D2 and serotonin 5-HT2A receptors',
      mechanism:
        'Atypical antipsychotics combine D2 antagonism with 5-HT2A antagonism. The serotonin component modulates dopamine release in the cortex, potentially improving negative and cognitive symptoms while reducing the motor side effects of pure D2 blockade. Clozapine is uniquely effective for treatment-resistant schizophrenia.',
      mechanismDetailed:
        'Meltzer (1989) proposed that the atypical profile results from a higher ratio of 5-HT2A to D2 antagonism. 5-HT2A receptors normally inhibit dopamine release in the prefrontal cortex; blocking them disinhibits cortical dopamine, potentially counteracting the mesocortical dopamine deficit hypothesized to underlie negative and cognitive symptoms. The looser D2 binding of most atypicals (they dissociate faster from the receptor) also reduces extrapyramidal side effects. Clozapine additionally acts on muscarinic, histaminergic, and adrenergic receptors, which contributes to both its unique efficacy and its side-effect profile (including agranulocytosis risk requiring monitoring).',
      pubchemCid: 2818,
      citations: ['meltzer1989', 'howes2009', 'stahl2013'],
      relatedBrainRegions: ['scz-striatum', 'scz-dlpfc', 'scz-stg'],
      relatedNeurotransmitters: ['Dopamine (DA)', 'Serotonin (5-HT)'],
    },
  ],
  geneAssociations: [
    {
      id: 'scz-c4',
      gene: 'C4A / C4B',
      protein: 'Complement Component 4',
      normalFunction:
        'C4 is part of the complement system in innate immunity. In the brain, C4A protein tags synapses for elimination during developmental synaptic pruning — a normal process by which excess synapses are refined during adolescence.',
      disorderHypothesis:
        'Sekar et al. (2016) found that structural variants leading to higher C4A expression are associated with increased schizophrenia risk. The hypothesis is that excessive C4A-mediated synaptic pruning during adolescence removes too many synapses, contributing to the cortical thinning and reduced dendritic spines observed in schizophrenia. This provides a mechanistic link between the strongest GWAS signal in the MHC region and the neurodevelopmental model of schizophrenia.',
      effectSize: 'Located in the MHC region, the strongest GWAS signal for schizophrenia; odds ratio per allele ~1.27 for high-C4A haplotypes',
      structureSource: 'experimental',
      pdbId: '4FXK',
      citations: ['sekar2016', 'glausier2013'],
      isDrugTarget: false,
      relatedDrugIds: [],
    },
    {
      id: 'scz-drd2',
      gene: 'DRD2',
      protein: 'Dopamine D2 Receptor',
      normalFunction:
        'The D2 receptor is a G-protein-coupled receptor that mediates inhibitory dopaminergic signaling. It is highly expressed in the striatum and plays key roles in reward, motivation, and motor control.',
      disorderHypothesis:
        'DRD2 is both the primary target of all antipsychotic drugs and a GWAS-significant risk locus for schizophrenia. This convergence of pharmacological and genetic evidence places dopamine D2 signaling at the center of schizophrenia neurobiology. However, the genetic effect size is small, consistent with the polygenic architecture.',
      effectSize: 'Genome-wide significant; small effect (odds ratio ~1.08)',
      structureSource: 'experimental',
      pdbId: '6CM4',
      citations: ['trubetskoy2022', 'howes2009'],
      isDrugTarget: true,
      relatedDrugIds: ['scz-typical', 'scz-atypical'],
    },
    {
      id: 'scz-22q',
      gene: '22q11.2 deletion (COMT, TBX1, DGCR8 and others)',
      protein: 'Multiple genes in the deleted region',
      normalFunction:
        'The 22q11.2 region contains ~30-40 genes involved in neurodevelopment, catecholamine metabolism (COMT), cardiac development, and microRNA processing.',
      disorderHypothesis:
        'The 22q11.2 microdeletion is the strongest known single genetic risk factor for schizophrenia, with carriers having a ~25-30% lifetime risk. This rare structural variant has a large effect but accounts for only ~1% of schizophrenia cases. It illustrates how rare variants of large effect can co-exist with common polygenic risk in the genetic architecture of the disorder.',
      effectSize: '~25-30% lifetime risk of schizophrenia among carriers; very large effect but very rare',
      structureSource: 'predicted',
      alphafoldId: 'AF-P21964-F1',
      citations: ['mcdonaldq112', 'trubetskoy2022'],
      isDrugTarget: false,
      relatedDrugIds: [],
    },
  ],
  geneticArchitecture: {
    summary:
      'Schizophrenia is highly heritable and highly polygenic. The largest GWAS identified 287 distinct risk loci. Complement component 4 (C4) provides a leading mechanistic hypothesis linking genetic risk to synaptic pruning. Rare structural variants such as the 22q11.2 deletion confer high individual risk but account for a small fraction of cases.',
    heritability: '~80% from twin studies (Sullivan et al., 2003)',
    isPolygenic: true,
    polygenicNote:
      'Despite high heritability, most of the genetic risk comes from hundreds of common variants, each of small effect. The PGC3 GWAS (Trubetskoy et al., 2022) identified 287 loci implicating synaptic biology, neuronal signaling, and immune function. The genetic architecture involves both common polygenic risk and rare variants (CNVs, de novo mutations) of larger effect.',
  },
  citations: Object.values({
    howes2009: citations.howes2009,
    vanrossum1966: citations.vanrossum1966,
    sekar2016: citations.sekar2016,
    trubetskoy2022: citations.trubetskoy2022,
    sullivan2003: citations.sullivan2003,
    meltzer1989: citations.meltzer1989,
    glausier2013: citations.glausier2013,
    mcdonaldq112: citations.mcdonaldq112,
    stahl2013: citations.stahl2013,
    anticevic2012: citations.anticevic2012,
  }),
};
