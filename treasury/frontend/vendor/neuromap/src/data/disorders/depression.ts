import type { Disorder } from '../types';
import { citations } from '../citations';

export const depression: Disorder = {
  id: 'depression',
  name: 'Major Depressive Disorder',
  shortDescription: 'A mood disorder characterized by persistent sadness, loss of interest, and cognitive changes.',
  overview:
    'Major depressive disorder (MDD) involves persistent depressed mood or loss of interest, accompanied by changes in sleep, appetite, energy, concentration, and self-worth. Neuroimaging studies consistently associate MDD with altered activity in prefrontal-limbic circuits. The disorder is moderately heritable and highly polygenic, with no single causal gene identified.',
  neurotransmitterSystems: ['Serotonin (5-HT)', 'Norepinephrine (NE)', 'Dopamine (DA)', 'Glutamate'],
  brainRegions: [
    {
      id: 'dep-pfc',
      name: 'Prefrontal Cortex (PFC)',
      description: 'The prefrontal cortex supports executive function, decision-making, and emotional regulation.',
      position: [0, 0.6, 0.8],
      color: '#3b82f6',
      findings:
        'Reduced activity and volume in dorsolateral PFC is consistently associated with MDD. Hypoactivity in this region correlates with impaired concentration and executive dysfunction seen in depression.',
      citations: ['drevets2008', 'price2010'],
      relatedNeurotransmitters: ['Serotonin (5-HT)', 'Norepinephrine (NE)', 'Dopamine (DA)'],
    },
    {
      id: 'dep-amygdala',
      name: 'Amygdala',
      description: 'The amygdala processes emotional stimuli, particularly fear and threat detection.',
      position: [0.35, -0.1, 0.1],
      color: '#ef4444',
      findings:
        'Hyperactivation of the amygdala to negative emotional stimuli is one of the most replicated neuroimaging findings in MDD. This heightened reactivity is associated with negative emotional bias and rumination.',
      citations: ['drevets2008', 'price2010'],
      relatedNeurotransmitters: ['Serotonin (5-HT)', 'Norepinephrine (NE)'],
    },
    {
      id: 'dep-acc',
      name: 'Anterior Cingulate Cortex (ACC)',
      description: 'The ACC is involved in error detection, conflict monitoring, and emotional regulation.',
      position: [0, 0.3, 0.4],
      color: '#f59e0b',
      findings:
        'The subgenual ACC (Brodmann area 25) shows elevated metabolic activity in treatment-resistant depression. Mayberg proposed it as a key node in the limbic-cortical dysregulation model. Its activity often normalizes with successful treatment.',
      citations: ['mayberg1999', 'price2010'],
      relatedNeurotransmitters: ['Serotonin (5-HT)', 'Glutamate'],
    },
    {
      id: 'dep-hippocampus',
      name: 'Hippocampus',
      description: 'The hippocampus is critical for memory formation and contextual processing.',
      position: [0.3, -0.2, -0.1],
      color: '#8b5cf6',
      findings:
        'Reduced hippocampal volume is associated with MDD, particularly in patients with longer illness duration or recurrent episodes. This may relate to stress-induced neurotoxicity via the HPA axis.',
      citations: ['drevets2008', 'price2010'],
      relatedNeurotransmitters: ['Serotonin (5-HT)', 'Glutamate'],
    },
  ],
  drugs: [
    {
      id: 'dep-ssri',
      name: 'Fluoxetine (Prozac)',
      drugClass: 'Selective Serotonin Reuptake Inhibitors (SSRIs)',
      classExamples: ['Fluoxetine', 'Sertraline', 'Escitalopram', 'Paroxetine', 'Citalopram'],
      target: 'Serotonin Transporter (SERT)',
      targetGene: 'SLC6A4',
      targetProtein: 'Sodium-dependent serotonin transporter',
      mechanism:
        'SSRIs block the reuptake of serotonin by SERT, increasing serotonin availability in the synapse. Clinical effects typically emerge after 2-4 weeks, suggesting downstream adaptations in receptor sensitivity and neural plasticity drive the therapeutic response.',
      mechanismDetailed:
        'SSRIs selectively bind to SERT with high affinity, preventing the transporter from clearing serotonin from the synaptic cleft. Acutely, this raises extracellular serotonin. However, autoreceptors (5-HT1A) on the presynaptic neuron initially dampen firing. Over weeks, these autoreceptors desensitize, allowing sustained serotonin signaling. Downstream effects include changes in BDNF expression, hippocampal neurogenesis, and prefrontal-limbic connectivity — thought to mediate clinical improvement.',
      pubchemCid: 3386,
      pdbTargetId: '5I6X',
      citations: ['cipriani2018', 'coleman2016', 'stahl2013'],
      relatedBrainRegions: ['dep-pfc', 'dep-amygdala', 'dep-acc', 'dep-hippocampus'],
      relatedNeurotransmitters: ['Serotonin (5-HT)'],
    },
    {
      id: 'dep-snri',
      name: 'Venlafaxine (Effexor)',
      drugClass: 'Serotonin-Norepinephrine Reuptake Inhibitors (SNRIs)',
      classExamples: ['Venlafaxine', 'Duloxetine', 'Desvenlafaxine'],
      target: 'Serotonin and Norepinephrine Transporters (SERT & NET)',
      targetGene: 'SLC6A4, SLC6A2',
      targetProtein: 'Serotonin and norepinephrine transporters',
      mechanism:
        'SNRIs block reuptake of both serotonin and norepinephrine, increasing the availability of both monoamines in the synapse. The dual action may provide benefit for patients who do not respond to SSRIs alone.',
      mechanismDetailed:
        'At lower doses, venlafaxine primarily inhibits SERT (similar to an SSRI). At higher doses, it also significantly inhibits NET, raising norepinephrine levels. This dose-dependent dual action affects both serotonergic projections from the raphe nuclei and noradrenergic projections from the locus coeruleus. The combined effect on prefrontal-limbic circuits is hypothesized to normalize both the emotional and motivational symptoms of depression.',
      pubchemCid: 5656,
      citations: ['cipriani2018', 'stahl2013'],
      relatedBrainRegions: ['dep-pfc', 'dep-amygdala', 'dep-acc'],
      relatedNeurotransmitters: ['Serotonin (5-HT)', 'Norepinephrine (NE)'],
    },
  ],
  geneAssociations: [
    {
      id: 'dep-bdnf',
      gene: 'BDNF',
      protein: 'Brain-Derived Neurotrophic Factor',
      normalFunction:
        'BDNF supports survival and growth of neurons, promotes synaptic plasticity, and is essential for learning and memory. It is highly expressed in the hippocampus and prefrontal cortex.',
      disorderHypothesis:
        'The neurotrophic hypothesis proposes that reduced BDNF signaling contributes to neuronal atrophy in depression, particularly hippocampal volume loss. Antidepressants increase BDNF expression in animal models. However, GWAS studies have not identified BDNF as a top genome-wide significant locus for MDD, suggesting its role may be downstream of the primary genetic risk architecture.',
      effectSize: 'Not a top GWAS hit; role may be more mechanistic than causal at the genetic level',
      structureSource: 'experimental',
      pdbId: '1BND',
      citations: ['howard2019', 'levinson2014'],
      isDrugTarget: false,
      relatedDrugIds: [],
    },
    {
      id: 'dep-slc6a4',
      gene: 'SLC6A4',
      protein: 'Serotonin Transporter (SERT)',
      normalFunction:
        'SERT clears serotonin from the synaptic cleft by reuptake into the presynaptic neuron, regulating the duration and intensity of serotonergic signaling.',
      disorderHypothesis:
        'SLC6A4 encodes the direct target of SSRIs, making it pharmacologically important. However, the earlier candidate gene hypothesis — that the 5-HTTLPR polymorphism in SLC6A4 is a major depression risk variant — has largely failed to replicate in well-powered GWAS. The gene is a validated drug target but not a confirmed genetic risk locus for MDD.',
      effectSize: 'Not significant in large GWAS; earlier candidate-gene findings did not replicate (Border et al., 2019)',
      structureSource: 'experimental',
      pdbId: '5I6X',
      citations: ['border2019', 'coleman2016', 'howard2019'],
      isDrugTarget: true,
      relatedDrugIds: ['dep-ssri', 'dep-snri'],
    },
  ],
  geneticArchitecture: {
    summary:
      'Major depression is moderately heritable and highly polygenic. Large GWAS have identified over 100 risk loci, each of very small effect. No single gene explains a meaningful fraction of risk.',
    heritability: '~37% from twin studies (Sullivan et al., 2000)',
    isPolygenic: true,
    polygenicNote:
      'MDD is one of the most polygenic psychiatric disorders. The largest GWAS (Howard et al., 2019) identified 102 independent variants but each explains a tiny fraction of variance. The biology implicated spans synaptic function, neurotransmission, and immune pathways.',
    replicationCaveats:
      'Earlier candidate-gene studies, particularly of 5-HTTLPR in SLC6A4 and BDNF Val66Met, produced widely cited positive results. However, these findings have not replicated in large, well-powered samples (Border et al., 2019). The field has moved to genome-wide approaches that do not pre-select candidates.',
  },
  citations: Object.values({
    drevets2008: citations.drevets2008,
    mayberg1999: citations.mayberg1999,
    price2010: citations.price2010,
    cipriani2018: citations.cipriani2018,
    coleman2016: citations.coleman2016,
    border2019: citations.border2019,
    howard2019: citations.howard2019,
    sullivan2000: citations.sullivan2000,
    stahl2013: citations.stahl2013,
    levinson2014: citations.levinson2014,
    wray2018: citations.wray2018,
  }),
};
