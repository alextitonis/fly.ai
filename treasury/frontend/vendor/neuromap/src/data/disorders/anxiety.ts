import type { Disorder } from '../types';
import { citations } from '../citations';

export const anxiety: Disorder = {
  id: 'anxiety',
  name: 'Generalized Anxiety Disorder',
  shortDescription: 'A disorder characterized by persistent, excessive worry about everyday situations.',
  overview:
    'Generalized anxiety disorder (GAD) involves chronic, excessive worry and apprehension about multiple life domains. It is associated with altered threat-processing circuits, particularly heightened amygdala reactivity and reduced prefrontal regulatory control. GAD is moderately heritable, highly polygenic, and shares substantial genetic overlap with major depression.',
  neurotransmitterSystems: ['GABA', 'Serotonin (5-HT)', 'Norepinephrine (NE)'],
  brainRegions: [
    {
      id: 'anx-amygdala',
      name: 'Amygdala',
      description: 'The amygdala is central to processing threats and generating fear responses.',
      position: [0.35, -0.1, 0.1],
      color: '#ef4444',
      findings:
        'Hyperactivation of the amygdala to threat-related stimuli is one of the most consistent findings across anxiety disorders. In GAD, the amygdala shows heightened responses even to ambiguous or mildly negative cues, reflecting a generalized threat bias.',
      citations: ['etkin2007', 'shin2010'],
      relatedNeurotransmitters: ['GABA', 'Serotonin (5-HT)', 'Norepinephrine (NE)'],
    },
    {
      id: 'anx-pfc',
      name: 'Prefrontal Cortex (PFC)',
      description: 'The PFC provides top-down regulation of emotional responses, particularly fear circuits.',
      position: [0, 0.6, 0.8],
      color: '#3b82f6',
      findings:
        'In GAD, the ventromedial and dorsolateral PFC often show reduced capacity to downregulate amygdala activity. This impaired prefrontal control is associated with difficulty suppressing worry and reappraising negative thoughts.',
      citations: ['etkin2007', 'shin2010'],
      relatedNeurotransmitters: ['GABA', 'Serotonin (5-HT)'],
    },
    {
      id: 'anx-insula',
      name: 'Insula',
      description: 'The insula integrates interoceptive signals and contributes to subjective feeling states.',
      position: [0.45, 0.1, 0.3],
      color: '#f97316',
      findings:
        'The anterior insula shows increased activation in anxiety disorders and is thought to contribute to heightened awareness of bodily arousal (heart rate, breathing) that accompanies anxiety. It may also mediate anticipatory anxiety.',
      citations: ['etkin2007'],
      relatedNeurotransmitters: ['GABA', 'Serotonin (5-HT)'],
    },
    {
      id: 'anx-bnst',
      name: 'Bed Nucleus of the Stria Terminalis (BNST)',
      description: 'The BNST is sometimes called the "extended amygdala" and mediates sustained anxiety states.',
      position: [0.15, 0, 0.15],
      color: '#ec4899',
      findings:
        'The BNST is implicated in sustained, diffuse anxiety rather than acute fear. Unlike the amygdala, which responds to specific threats, the BNST is active during uncertain or unpredictable threat — a core feature of GAD.',
      citations: ['shin2010'],
      relatedNeurotransmitters: ['GABA', 'Norepinephrine (NE)'],
    },
  ],
  drugs: [
    {
      id: 'anx-benzo',
      name: 'Diazepam (Valium)',
      drugClass: 'Benzodiazepines',
      classExamples: ['Diazepam', 'Alprazolam', 'Lorazepam', 'Clonazepam'],
      target: 'GABA-A Receptor',
      targetGene: 'GABRA1, GABRG2 (multiple subunit genes)',
      targetProtein: 'Gamma-aminobutyric acid type A receptor',
      mechanism:
        'Benzodiazepines are positive allosteric modulators of the GABA-A receptor. They bind at the interface between the alpha and gamma subunits and enhance the effect of GABA (the brain\'s main inhibitory neurotransmitter), increasing the frequency of chloride channel opening. This produces anxiolytic, sedative, and muscle-relaxant effects.',
      mechanismDetailed:
        'GABA-A receptors are ligand-gated chloride channels. When GABA binds, the channel opens and chloride flows in, hyperpolarizing the neuron. Benzodiazepines bind at a distinct allosteric site (between alpha and gamma-2 subunits) and do not open the channel alone. Instead, they increase the affinity of the receptor for GABA, enhancing inhibitory neurotransmission. This rapid potentiation of GABAergic signaling in the amygdala and cortex underlies the fast anxiolytic effect. Tolerance and dependence develop with chronic use, limiting their role to short-term treatment.',
      pubchemCid: 3016,
      pdbTargetId: '6X3X',
      citations: ['sigel2012', 'stahl2013', 'katzung2018'],
      relatedBrainRegions: ['anx-amygdala', 'anx-pfc', 'anx-bnst'],
      relatedNeurotransmitters: ['GABA'],
    },
    {
      id: 'anx-ssri',
      name: 'Escitalopram (Lexapro)',
      drugClass: 'Selective Serotonin Reuptake Inhibitors (SSRIs)',
      classExamples: ['Escitalopram', 'Sertraline', 'Paroxetine'],
      target: 'Serotonin Transporter (SERT)',
      targetGene: 'SLC6A4',
      targetProtein: 'Sodium-dependent serotonin transporter',
      mechanism:
        'SSRIs are first-line pharmacotherapy for GAD. They block serotonin reuptake, gradually enhancing serotonergic tone in prefrontal-limbic circuits. Unlike benzodiazepines, therapeutic effects take weeks to develop but carry lower risk of dependence.',
      mechanismDetailed:
        'In anxiety, serotonergic projections from the dorsal raphe to the amygdala and PFC modulate threat processing. SSRIs increase serotonin availability in these circuits. Over weeks, downstream adaptations — including 5-HT1A autoreceptor desensitization and changes in amygdala reactivity — are thought to reduce pathological worry and threat sensitivity. This mechanism overlaps with their antidepressant action, consistent with the high comorbidity and genetic overlap between GAD and depression.',
      pubchemCid: 146570,
      pdbTargetId: '5I6X',
      citations: ['stahl2013', 'katzung2018'],
      relatedBrainRegions: ['anx-amygdala', 'anx-pfc', 'anx-insula'],
      relatedNeurotransmitters: ['Serotonin (5-HT)'],
    },
  ],
  geneAssociations: [
    {
      id: 'anx-gabra-cluster',
      gene: 'GABRA2 / GABRG1 cluster',
      protein: 'GABA-A receptor subunits',
      normalFunction:
        'GABA-A receptor subunits form the pentameric chloride channel responsible for fast inhibitory neurotransmission. Different subunit combinations create receptor subtypes with distinct pharmacological properties and brain distribution.',
      disorderHypothesis:
        'Variants near GABA-A receptor subunit genes have shown suggestive associations with anxiety traits in some GWAS, but no single variant reaches strong genome-wide significance for GAD specifically. This is consistent with a polygenic architecture where many variants of small effect contribute.',
      effectSize: 'Suggestive associations; no single genome-wide significant hit for GAD',
      structureSource: 'experimental',
      pdbId: '6X3X',
      citations: ['otowa2016', 'sigel2012'],
      isDrugTarget: true,
      relatedDrugIds: ['anx-benzo'],
    },
  ],
  geneticArchitecture: {
    summary:
      'GAD is moderately heritable and polygenic, with substantial genetic overlap with major depression. No single gene of large effect has been identified. The genetic architecture mirrors the clinical overlap with depressive disorders.',
    heritability: '~30% from twin studies (Hettema et al., 2001)',
    isPolygenic: true,
    polygenicNote:
      'GWAS for anxiety disorders have been smaller than for depression or schizophrenia, and fewer genome-wide significant loci have been identified. The genetic signal is spread across many variants of small effect. Earlier candidate gene studies (e.g., COMT, SLC6A4) have not consistently replicated in large samples. The largest meta-analyses suggest shared genetic liability between GAD and depression, consistent with their clinical co-occurrence.',
    replicationCaveats:
      'As with depression, earlier candidate gene findings for anxiety (5-HTTLPR, COMT Val158Met) have not held up in well-powered GWAS. The field is moving toward larger, better-powered genome-wide studies.',
  },
  citations: Object.values({
    etkin2007: citations.etkin2007,
    shin2010: citations.shin2010,
    sigel2012: citations.sigel2012,
    otowa2016: citations.otowa2016,
    hettema2001: citations.hettema2001,
    stahl2013: citations.stahl2013,
    katzung2018: citations.katzung2018,
  }),
};
