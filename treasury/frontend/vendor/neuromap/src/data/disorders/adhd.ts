import type { Disorder } from '../types';
import { citations } from '../citations';

export const adhd: Disorder = {
  id: 'adhd',
  name: 'Attention-Deficit/Hyperactivity Disorder',
  shortDescription: 'A neurodevelopmental disorder characterized by inattention, hyperactivity, and impulsivity.',
  overview:
    'ADHD is a neurodevelopmental disorder with onset in childhood that frequently persists into adulthood. Core symptoms include difficulty sustaining attention, hyperactivity, and impulsive behavior. Neuroimaging consistently associates ADHD with reduced prefrontal cortex and basal ganglia volumes, and altered fronto-striatal-cerebellar circuits. The disorder is highly heritable and polygenic, with the largest GWAS identifying 12 genome-wide significant loci.',
  neurotransmitterSystems: ['Dopamine (DA)', 'Norepinephrine (NE)'],
  brainRegions: [
    {
      id: 'adhd-pfc',
      name: 'Prefrontal Cortex (PFC)',
      description: 'The PFC supports executive functions including attention, planning, working memory, and impulse control.',
      position: [0, 0.45, 0.95],
      color: '#3b82f6',
      findings:
        'Reduced PFC volume and hypoactivation during attention and inhibition tasks is one of the most replicated findings in ADHD. The right inferior frontal gyrus, critical for response inhibition, is particularly affected. These deficits correlate with impaired executive function.',
      citations: ['cortese2012', 'castellanos2012'],
      relatedNeurotransmitters: ['Dopamine (DA)', 'Norepinephrine (NE)'],
    },
    {
      id: 'adhd-striatum',
      name: 'Striatum (Caudate & Putamen)',
      description: 'The striatum is central to reward processing, motivation, and motor control via dopaminergic circuits.',
      position: [0.28, 0.03, 0.22],
      color: '#ef4444',
      findings:
        'Reduced caudate and putamen volumes are among the most robust structural findings in ADHD, particularly in children. The ENIGMA mega-analysis (Hoogman et al., 2017) confirmed smaller caudate, putamen, and nucleus accumbens volumes. These regions are dense with dopamine receptors and are the primary target of stimulant medications.',
      citations: ['hoogman2017', 'volkow2009', 'castellanos2012'],
      relatedNeurotransmitters: ['Dopamine (DA)'],
    },
    {
      id: 'adhd-cerebellum',
      name: 'Cerebellum',
      description: 'Beyond motor coordination, the cerebellum contributes to timing, attention, and cognitive processing.',
      position: [0, -0.82, -0.92],
      color: '#10b981',
      findings:
        'Reduced cerebellar volume, particularly in the posterior inferior vermis, is consistently reported in ADHD. The cerebellum participates in fronto-cerebellar circuits involved in timing and attention. Its involvement supports the view that ADHD affects distributed networks, not just prefrontal cortex.',
      citations: ['castellanos2012', 'cortese2012'],
      relatedNeurotransmitters: ['Dopamine (DA)', 'Norepinephrine (NE)'],
    },
    {
      id: 'adhd-acc',
      name: 'Anterior Cingulate Cortex (ACC)',
      description: 'The ACC monitors for errors, detects conflict, and helps allocate attention.',
      position: [0.04, 0.28, 0.42],
      color: '#f59e0b',
      findings:
        'Hypoactivation of the dorsal ACC during tasks requiring error monitoring and cognitive control is frequently reported in ADHD. This is thought to contribute to difficulties with sustained attention and performance monitoring.',
      citations: ['cortese2012'],
      relatedNeurotransmitters: ['Dopamine (DA)', 'Norepinephrine (NE)'],
    },
  ],
  drugs: [
    {
      id: 'adhd-stimulant',
      name: 'Methylphenidate (Ritalin)',
      drugClass: 'Stimulants — Dopamine/Norepinephrine Reuptake Inhibitors',
      classExamples: ['Methylphenidate', 'Amphetamine (Adderall)', 'Lisdexamfetamine (Vyvanse)', 'Dexmethylphenidate'],
      target: 'Dopamine Transporter (DAT) and Norepinephrine Transporter (NET)',
      targetGene: 'SLC6A3 (DAT1), SLC6A2 (NET)',
      targetProtein: 'Dopamine and norepinephrine transporters',
      mechanism:
        'Stimulants block the reuptake of dopamine and norepinephrine by their respective transporters, increasing catecholamine availability in the synapse. At therapeutic doses, they preferentially enhance signaling in the prefrontal cortex, improving attention and executive function.',
      mechanismDetailed:
        'Methylphenidate primarily blocks DAT and NET, while amphetamines both block reuptake and promote active release of dopamine and norepinephrine from presynaptic terminals. At therapeutic doses (much lower than recreational), the primary effect is in the PFC, where baseline catecholamine tone is suboptimal in ADHD. Arnsten (2006) showed that moderate increases in PFC dopamine and norepinephrine strengthen signal-to-noise in prefrontal networks, improving working memory and impulse control. The inverted-U dose-response means too much catecholamine impairs rather than improves PFC function.',
      pubchemCid: 4158,
      citations: ['arnsten2006', 'volkow2009', 'stahl2013'],
      relatedBrainRegions: ['adhd-pfc', 'adhd-striatum', 'adhd-acc'],
      relatedNeurotransmitters: ['Dopamine (DA)', 'Norepinephrine (NE)'],
    },
    {
      id: 'adhd-nonstim',
      name: 'Atomoxetine (Strattera)',
      drugClass: 'Non-stimulant — Selective Norepinephrine Reuptake Inhibitor',
      classExamples: ['Atomoxetine', 'Viloxazine'],
      target: 'Norepinephrine Transporter (NET)',
      targetGene: 'SLC6A2',
      targetProtein: 'Norepinephrine transporter',
      mechanism:
        'Atomoxetine selectively blocks NET, increasing norepinephrine in the synapse. In the prefrontal cortex, where DAT density is low and NET handles much of the dopamine clearance, this also indirectly raises prefrontal dopamine levels. Effects develop gradually over weeks, unlike the rapid onset of stimulants.',
      mechanismDetailed:
        'The PFC has low DAT expression, so NET is the primary transporter clearing both norepinephrine and dopamine in this region. By blocking NET, atomoxetine raises both catecholamines specifically in the PFC without significantly affecting dopamine levels in the striatum or nucleus accumbens. This PFC-selective profile explains why atomoxetine improves attention and executive function without the reinforcing (abuse) potential associated with striatal dopamine elevation. It is a first-line option when stimulants are contraindicated or not tolerated.',
      pubchemCid: 54841,
      citations: ['arnsten2006', 'stahl2013'],
      relatedBrainRegions: ['adhd-pfc', 'adhd-acc'],
      relatedNeurotransmitters: ['Norepinephrine (NE)', 'Dopamine (DA)'],
    },
  ],
  geneAssociations: [
    {
      id: 'adhd-slc6a3',
      gene: 'SLC6A3 (DAT1)',
      protein: 'Dopamine Transporter',
      normalFunction:
        'DAT clears dopamine from the synaptic cleft by reuptake into the presynaptic neuron. It is the primary mechanism of dopamine inactivation in the striatum and the direct target of stimulant medications.',
      disorderHypothesis:
        'A variable number tandem repeat (VNTR) in the 3\' UTR of SLC6A3 was one of the earliest candidate gene findings in ADHD, but its effect size is very small and results have been inconsistent across studies. SLC6A3 is pharmacologically important as the direct target of methylphenidate and amphetamine, but its role as a genetic risk locus is modest in the polygenic context.',
      effectSize: 'Small; candidate gene association inconsistent across samples. Not a top GWAS hit.',
      structureSource: 'experimental',
      pdbId: '4XP1',
      citations: ['faraone2005', 'demontis2019'],
      isDrugTarget: true,
      relatedDrugIds: ['adhd-stimulant'],
    },
    {
      id: 'adhd-foxp2',
      gene: 'FOXP2',
      protein: 'Forkhead Box Protein P2',
      normalFunction:
        'FOXP2 is a transcription factor involved in neurodevelopment, particularly in the development of cortico-striatal and cortico-cerebellar circuits involved in motor learning, sequencing, and procedural memory.',
      disorderHypothesis:
        'FOXP2 reached genome-wide significance in the largest ADHD GWAS (Demontis et al., 2019). It is expressed in the striatum and cerebellum — regions consistently implicated in ADHD. The finding connects ADHD genetics to neurodevelopmental circuitry rather than to a single neurotransmitter deficit.',
      effectSize: 'Genome-wide significant; small per-allele effect (OR ~1.05)',
      structureSource: 'predicted',
      alphafoldId: 'AF-O15409-F1',
      citations: ['demontis2019'],
      isDrugTarget: false,
      relatedDrugIds: [],
    },
  ],
  geneticArchitecture: {
    summary:
      'ADHD is highly heritable (~74% from twin studies) and polygenic. The first genome-wide significant loci were identified in 2019, with 12 risk loci. Like other psychiatric disorders, common variants of small effect account for most genetic risk, with no single gene explaining more than a tiny fraction.',
    heritability: '~74% from twin studies (Faraone et al., 2005)',
    isPolygenic: true,
    polygenicNote:
      'The largest GWAS (Demontis et al., 2019, N > 50,000) identified 12 genome-wide significant loci implicating neurodevelopmental pathways. SNP-based heritability is ~22%, indicating that many common variants of small effect contribute. Earlier candidate gene studies of DRD4, DRD5, SLC6A3, and others produced small, inconsistently replicated effects consistent with this polygenic architecture.',
    replicationCaveats:
      'Earlier candidate gene studies of dopamine system genes (DRD4 7-repeat, DAT1 VNTR) were widely cited but produced small, variable effects. The GWAS era has shown that these explain only a small fraction of genetic risk. The field has moved to unbiased genome-wide approaches.',
  },
  citations: Object.values({
    castellanos2012: citations.castellanos2012,
    cortese2012: citations.cortese2012,
    volkow2009: citations.volkow2009,
    faraone2015: citations.faraone2015,
    demontis2019: citations.demontis2019,
    faraone2005: citations.faraone2005,
    hoogman2017: citations.hoogman2017,
    arnsten2006: citations.arnsten2006,
    stahl2013: citations.stahl2013,
  }),
};
