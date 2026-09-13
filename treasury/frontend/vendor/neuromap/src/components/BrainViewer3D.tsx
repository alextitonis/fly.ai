import { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { BrainRegion } from '../data/types';

// Atlas-style lobe colors matching Desikan-Killiany parcellation palette
const LOBE_COLORS = {
  frontal:   new THREE.Color('#6a82c8'),
  parietal:  new THREE.Color('#4a8a62'),
  temporal:  new THREE.Color('#b86850'),
  occipital: new THREE.Color('#888840'),
  midline:   new THREE.Color('#8860a8'),
};

function classifyLobe(_x: number, y: number, z: number): THREE.Color {
  const nz = z / 1.2;
  if (nz > 0.45) return LOBE_COLORS.frontal;
  if (nz < -0.5) return LOBE_COLORS.occipital;
  if (y < -0.15) return LOBE_COLORS.temporal;
  if (nz < 0.1) return LOBE_COLORS.parietal;
  return LOBE_COLORS.frontal;
}

const CORTICAL_REGION_IDS = new Set([
  'dep-pfc', 'dep-acc', 'anx-pfc', 'scz-dlpfc',
  'adhd-pfc', 'adhd-acc', 'adhd-cerebellum',
]);

function isSubcortical(regionId: string): boolean {
  return !CORTICAL_REGION_IDS.has(regionId);
}

// Anatomical white-matter connectivity between displayed regions
const REGION_CONNECTIONS: Record<string, string[]> = {
  'dep-pfc':         ['dep-acc', 'dep-amygdala'],
  'dep-amygdala':    ['dep-hippocampus', 'dep-pfc', 'dep-acc'],
  'dep-acc':         ['dep-pfc', 'dep-amygdala'],
  'dep-hippocampus': ['dep-amygdala'],
  'anx-amygdala':    ['anx-pfc', 'anx-bnst', 'anx-insula'],
  'anx-pfc':         ['anx-amygdala', 'anx-insula'],
  'anx-insula':      ['anx-amygdala', 'anx-pfc'],
  'anx-bnst':        ['anx-amygdala'],
  'scz-dlpfc':       ['scz-striatum', 'scz-thalamus', 'scz-stg'],
  'scz-striatum':    ['scz-dlpfc', 'scz-thalamus', 'scz-hippocampus'],
  'scz-hippocampus': ['scz-striatum', 'scz-thalamus'],
  'scz-stg':         ['scz-dlpfc', 'scz-thalamus'],
  'scz-thalamus':    ['scz-dlpfc', 'scz-striatum', 'scz-stg', 'scz-hippocampus'],
  'adhd-pfc':        ['adhd-acc', 'adhd-striatum'],
  'adhd-striatum':   ['adhd-pfc', 'adhd-cerebellum'],
  'adhd-cerebellum': ['adhd-striatum', 'adhd-acc'],
  'adhd-acc':        ['adhd-pfc', 'adhd-cerebellum'],
};

function CerebralHemisphere({ side, opacity }: { side: 'left' | 'right'; opacity: number }) {
  const geo = useMemo(() => {
    const s = side === 'left' ? -1 : 1;
    const g = new THREE.SphereGeometry(1, 96, 96, 0, Math.PI);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);

      v.x *= 0.92;
      v.y *= 0.78;
      v.z *= 1.30;
      v.x += s * 0.07;

      // Frontal lobe — large forward bulge
      const frontal = Math.exp(-((v.z - 1.15) ** 2) * 0.9);
      v.z += frontal * 0.26;
      v.x *= 1 + frontal * 0.10;
      v.y *= 1 + frontal * 0.05;

      // Temporal lobe — pronounced lateral-inferior thumb
      const tempY = Math.exp(-((v.y + 0.52) ** 2) * 3.8);
      const tempZ = Math.exp(-((v.z - 0.05) ** 2) * 0.9);
      const temporal = tempY * tempZ;
      v.x *= 1 + temporal * 0.35;
      v.y -= temporal * 0.20;

      // Occipital — rear protrusion
      const occipital = Math.exp(-((v.z + 1.22) ** 2) * 2.0);
      v.z -= occipital * 0.14;

      // Parietal — slight upward bump
      const parietal = Math.exp(-((v.z - 0.0) ** 2) * 1.5) * Math.max(0, v.y) * 0.08;
      v.y += parietal;

      // ---- SULCI (3 frequencies) ----
      const n = v.clone().normalize();

      const primary =
        Math.sin(v.x * 5.5 + v.z * 2.0) * 0.055 +
        Math.sin(v.z * 6.5 + v.y * 3.5) * 0.05 +
        Math.sin(v.x * 3.5 + v.y * 6.0 + v.z * 1.5) * 0.04;

      const secondary =
        Math.sin(v.x * 10 + v.z * 5 + v.y * 2) * 0.025 +
        Math.sin(v.z * 12 + v.y * 7) * 0.022 +
        Math.sin(v.x * 8 + v.y * 10 + v.z * 4) * 0.018;

      const tertiary =
        Math.sin(v.x * 18 + v.z * 9 + v.y * 5) * 0.010 +
        Math.sin(v.y * 20 + v.z * 12) * 0.008;

      v.add(n.multiplyScalar(primary + secondary + tertiary));

      // ---- NAMED FISSURES ----

      // Lateral (Sylvian) fissure
      const sylvianLine = -0.08 + v.z * 0.12;
      const sylvianDepth = Math.exp(-((v.y - sylvianLine) ** 2) * 55) *
        Math.max(0, 1 - Math.exp(-v.x * v.x * 10));
      const sylvianZmask = Math.exp(-((v.z - 0.2) ** 2) * 0.25);
      const sn = v.clone().normalize();
      v.add(sn.multiplyScalar(-sylvianDepth * sylvianZmask * 0.075));

      // Central sulcus
      const centralPos = 0.38 + v.x * 0.25;
      const centralDepth = Math.exp(-((v.z - centralPos) ** 2) * 45) *
        Math.max(0, v.y * 1.5) * 0.058;
      const cn = v.clone().normalize();
      v.add(cn.multiplyScalar(-centralDepth));

      // Precentral sulcus
      const precentralPos = 0.58 + v.x * 0.2;
      const precentralDepth = Math.exp(-((v.z - precentralPos) ** 2) * 40) *
        Math.max(0, v.y) * 0.03;
      const pn = v.clone().normalize();
      v.add(pn.multiplyScalar(-precentralDepth));

      // Parieto-occipital sulcus
      const poSulcus = Math.exp(-((v.z + 0.55) ** 2) * 35) *
        Math.max(0, v.y) * 0.04;
      const pon = v.clone().normalize();
      v.add(pon.multiplyScalar(-poSulcus));

      // Longitudinal fissure — medial flattening
      const midDist = Math.abs(v.x);
      if (midDist < 0.1) {
        const flatten = (1 - midDist / 0.1);
        v.y *= 1 - flatten * 0.18 * Math.max(0, v.y);
        v.x *= 1 - flatten * 0.3;
      }

      pos.setXYZ(i, v.x, v.y, v.z);

      const col = classifyLobe(v.x, v.y, v.z);
      colors[i * 3]     = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [side]);

  return (
    <mesh geometry={geo} rotation={[0, side === 'left' ? Math.PI : 0, 0]}>
      <meshStandardMaterial
        vertexColors
        roughness={0.68}
        metalness={0.04}
        transparent={opacity < 1}
        opacity={opacity}
        side={THREE.DoubleSide}
        depthWrite={opacity > 0.9}
      />
    </mesh>
  );
}

function CorpusCallosum() {
  const geo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.65, 0);
    shape.quadraticCurveTo(-0.4, 0.15, 0, 0.17);
    shape.quadraticCurveTo(0.4, 0.15, 0.65, 0);
    shape.quadraticCurveTo(0.4, -0.05, 0, -0.04);
    shape.quadraticCurveTo(-0.4, -0.05, -0.65, 0);
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: 0.2, bevelEnabled: true,
      bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3,
    });
    g.center();
    return g;
  }, []);

  return (
    <mesh geometry={geo} position={[0, 0.22, 0]}>
      <meshStandardMaterial color="#e8c8d0" roughness={0.6} />
    </mesh>
  );
}

function Brainstem() {
  const geo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.18, 0.11, 1.1, 20);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const pons = Math.exp(-((v.y + 0.05) ** 2) * 4) * 0.1;
      const medulla = Math.exp(-((v.y - 0.3) ** 2) * 6) * 0.04;
      v.x *= 1 + (pons + medulla);
      v.z *= 1 + (pons + medulla) * 0.8;
      v.z += Math.exp(-(v.y * v.y) * 3) * 0.03;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <group position={[0, -0.95, -0.5]} rotation={[0.2, 0, 0]}>
      <mesh geometry={geo}>
        <meshStandardMaterial color="#c09898" roughness={0.65} />
      </mesh>
    </group>
  );
}

function Cerebellum() {
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(0.52, 40, 40);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      v.x *= 1.45;
      v.y *= 0.55;
      v.z *= 0.88;
      const folia =
        Math.sin(v.y * 22 + v.x * 1.5) * 0.022 +
        Math.sin(v.y * 32) * 0.012 +
        Math.sin(v.y * 45 + v.x * 3) * 0.006;
      const n = v.clone().normalize();
      v.add(n.multiplyScalar(folia));
      const vermis = Math.exp(-v.x * v.x * 25) * 0.07;
      v.z -= vermis;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <mesh geometry={geo} position={[0, -0.82, -0.92]}>
      <meshStandardMaterial color="#b88888" roughness={0.55} />
    </mesh>
  );
}

// fMRI-style hot-colormap activation overlay — layered additive spheres
function ActivationBlob({ position, active }: {
  position: [number, number, number];
  active: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { invalidate } = useThree();

  useFrame(({ clock }) => {
    if (groupRef.current && active) {
      const t = clock.getElapsedTime();
      const pulse = 0.88 + Math.sin(t * 2.8) * 0.12;
      groupRef.current.scale.setScalar(pulse);
      invalidate();
    }
  });

  if (!active) return null;

  return (
    <group ref={groupRef} position={position}>
      {/* Peak — yellow/white */}
      <mesh>
        <sphereGeometry args={[0.09, 10, 10]} />
        <meshBasicMaterial color="#ffff88" transparent opacity={0.95}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* High — orange */}
      <mesh>
        <sphereGeometry args={[0.17, 10, 10]} />
        <meshBasicMaterial color="#ff7700" transparent opacity={0.65}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* Medium — red */}
      <mesh>
        <sphereGeometry args={[0.28, 10, 10]} />
        <meshBasicMaterial color="#cc1100" transparent opacity={0.38}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* Low — dark red fringe */}
      <mesh>
        <sphereGeometry args={[0.42, 10, 10]} />
        <meshBasicMaterial color="#550000" transparent opacity={0.18}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

// Animated connectivity arc with traveling signal pulse
function ConnectivityArc({ fromPos, toPos, color }: {
  fromPos: [number, number, number];
  toPos: [number, number, number];
  color: string;
}) {
  const pulseRef = useRef<THREE.Mesh>(null);
  const { invalidate } = useThree();

  const curve = useMemo(() => {
    const start = new THREE.Vector3(...fromPos);
    const end   = new THREE.Vector3(...toPos);
    const mid   = start.clone().add(end).multiplyScalar(0.5);
    // Arc outward from brain center so the path is always visible
    const outDir = mid.clone().normalize();
    mid.addScaledVector(outDir, 0.55);
    return new THREE.CatmullRomCurve3([start, mid, end]);
  }, [fromPos, toPos]);

  const tubeGeo = useMemo(
    () => new THREE.TubeGeometry(curve, 44, 0.013, 5, false),
    [curve],
  );

  useFrame(({ clock }) => {
    if (pulseRef.current) {
      // Signal travels from start to end in ~2 s
      const t = (clock.getElapsedTime() * 0.45) % 1;
      const pt = curve.getPoint(t);
      pulseRef.current.position.copy(pt);
      invalidate();
    }
  });

  return (
    <group>
      <mesh geometry={tubeGeo}>
        <meshBasicMaterial color={color} transparent opacity={0.38}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* Traveling signal bead */}
      <mesh ref={pulseRef}>
        <sphereGeometry args={[0.038, 7, 7]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.92}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

// --- Region structures ---

const SUBCORTICAL_SHAPES: Record<string, { scale: [number, number, number]; shape: string }> = {
  'dep-pfc':         { scale: [0.55, 0.30, 0.22], shape: 'cortical' },
  'dep-amygdala':    { scale: [0.14, 0.11, 0.16], shape: 'amygdala' },
  'dep-acc':         { scale: [0.15, 0.28, 0.10], shape: 'cortical' },
  'dep-hippocampus': { scale: [0.10, 0.09, 0.32], shape: 'hippocampus' },
  'anx-amygdala':    { scale: [0.14, 0.11, 0.16], shape: 'amygdala' },
  'anx-pfc':         { scale: [0.55, 0.30, 0.22], shape: 'cortical' },
  'anx-insula':      { scale: [0.10, 0.20, 0.26], shape: 'insula' },
  'anx-bnst':        { scale: [0.07, 0.07, 0.09], shape: 'amygdala' },
  'scz-dlpfc':       { scale: [0.30, 0.22, 0.20], shape: 'cortical' },
  'scz-striatum':    { scale: [0.13, 0.22, 0.20], shape: 'striatum' },
  'scz-hippocampus': { scale: [0.10, 0.09, 0.32], shape: 'hippocampus' },
  'scz-stg':         { scale: [0.10, 0.13, 0.36], shape: 'stg' },
  'scz-thalamus':    { scale: [0.20, 0.14, 0.26], shape: 'thalamus' },
  'adhd-pfc':        { scale: [0.55, 0.30, 0.22], shape: 'cortical' },
  'adhd-striatum':   { scale: [0.15, 0.22, 0.20], shape: 'striatum' },
  'adhd-cerebellum': { scale: [0.40, 0.18, 0.30], shape: 'cortical' },
  'adhd-acc':        { scale: [0.15, 0.28, 0.10], shape: 'cortical' },
};

const REGION_POSITIONS: Record<string, [number, number, number]> = {
  'dep-pfc':         [0, 0.42, 1.0],
  'dep-amygdala':    [0.42, -0.38, 0.20],
  'dep-acc':         [0.04, 0.28, 0.42],
  'dep-hippocampus': [0.45, -0.32, -0.15],
  'anx-amygdala':    [0.42, -0.38, 0.20],
  'anx-pfc':         [0, 0.42, 1.0],
  'anx-insula':      [0.60, -0.04, 0.18],
  'anx-bnst':        [0.16, -0.12, 0.20],
  'scz-dlpfc':       [0.36, 0.48, 0.62],
  'scz-striatum':    [0.26, 0.03, 0.22],
  'scz-hippocampus': [0.45, -0.32, -0.15],
  'scz-stg':         [0.62, -0.06, 0.03],
  'scz-thalamus':    [0, 0.0, 0.03],
  'adhd-pfc':        [0, 0.42, 1.0],
  'adhd-striatum':   [0.28, 0.03, 0.22],
  'adhd-cerebellum': [0, -0.82, -0.92],
  'adhd-acc':        [0.04, 0.28, 0.42],
};

function createShapeGeo(shape: string): THREE.BufferGeometry {
  if (shape === 'amygdala') {
    const g = new THREE.SphereGeometry(1, 20, 20);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      v.z *= 1.3; v.x *= 0.85;
      v.x *= 1 - Math.max(0, v.z) * 0.25;
      v.y *= 1 - Math.max(0, v.z) * 0.25;
      v.y += v.z * v.z * 0.08;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); return g;
  }
  if (shape === 'hippocampus') {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0.15, 0.05, -0.5),
      new THREE.Vector3(0.2, 0.08, 0),
      new THREE.Vector3(0.12, 0.05, 0.5),
      new THREE.Vector3(-0.1, -0.05, 0.9),
      new THREE.Vector3(-0.3, -0.12, 1.1),
    ]);
    const g = new THREE.TubeGeometry(curve, 28, 0.35, 12, false);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      v.y *= 0.7;
      const t = (v.z + 1) / 2.1;
      v.x *= 1 - t * 0.4; v.y *= 1 - t * 0.4;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); return g;
  }
  if (shape === 'thalamus') {
    const g = new THREE.SphereGeometry(1, 20, 20);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      v.z *= 1.3; v.y *= 0.75; v.x *= 1 + v.z * 0.1;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); return g;
  }
  if (shape === 'striatum') {
    const g = new THREE.SphereGeometry(1, 20, 20);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      v.y *= 1.3; v.z *= 0.9;
      v.x += Math.sin(v.y * 1.5) * 0.15;
      v.z += Math.cos(v.y * 1.2) * 0.1;
      v.x *= 1 - Math.max(0, -v.y) * 0.2;
      v.z *= 1 - Math.max(0, -v.y) * 0.2;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); return g;
  }
  if (shape === 'insula') {
    const g = new THREE.PlaneGeometry(1, 1, 16, 16);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      v.z = 0.15 * Math.sin(v.x * Math.PI) * Math.sin(v.y * Math.PI * 0.8);
      v.z += Math.sin(v.y * 12) * 0.02;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); return g;
  }
  if (shape === 'stg') {
    const g = new THREE.SphereGeometry(1, 20, 16);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      v.x *= 0.5; v.y *= 0.6; v.z *= 1.4;
      v.x += v.z * v.z * 0.06;
      const n = v.clone().normalize();
      v.add(n.multiplyScalar(Math.sin(v.z * 10) * 0.03 + Math.sin(v.z * 6 + v.y * 4) * 0.02));
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); return g;
  }
  // cortical patch
  const g = new THREE.SphereGeometry(1, 20, 16);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.y *= 0.5;
    const n = v.clone().normalize();
    v.add(n.multiplyScalar(Math.sin(v.x * 8 + v.z * 4) * 0.04 + Math.sin(v.z * 10) * 0.03));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals(); return g;
}

function RegionStructure({ region, isHighlighted, onClick }: {
  region: BrainRegion; isHighlighted: boolean; onClick: () => void;
}) {
  const meshRef  = useRef<THREE.Mesh>(null);
  const matRef   = useRef<THREE.MeshStandardMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const { invalidate } = useThree();
  const config    = SUBCORTICAL_SHAPES[region.id];
  const shapeType = config?.shape || 'cortical';
  const baseScale = config?.scale || [0.15, 0.15, 0.15];
  const pos       = REGION_POSITIONS[region.id] || (region.position as [number, number, number]);
  const geo       = useMemo(() => createShapeGeo(shapeType), [shapeType]);
  const active    = isHighlighted || hovered;
  const scaleMul  = active ? 1.15 : 1;

  useFrame(({ clock }, delta) => {
    if (!meshRef.current || !matRef.current) return;
    // Scale lerp
    const target = new THREE.Vector3(
      baseScale[0] * scaleMul,
      baseScale[1] * scaleMul,
      baseScale[2] * scaleMul,
    );
    const before = meshRef.current.scale.clone();
    meshRef.current.scale.lerp(target, delta * 6);
    const moved = before.distanceTo(meshRef.current.scale) > 0.0001;

    // Emissive pulse on highlighted region
    if (isHighlighted) {
      const pulse = 0.45 + Math.sin(clock.getElapsedTime() * 3.2) * 0.18;
      matRef.current.emissiveIntensity = pulse;
      invalidate();
    } else if (moved) {
      invalidate();
    }
  });

  return (
    <group position={pos}>
      <mesh
        ref={meshRef} geometry={geo} scale={baseScale}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); invalidate(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); invalidate(); document.body.style.cursor = 'default'; }}
      >
        <meshStandardMaterial
          ref={matRef}
          color={region.color}
          emissive={region.color}
          emissiveIntensity={isHighlighted ? 0.5 : hovered ? 0.3 : 0.08}
          roughness={0.35}
          metalness={0.05}
          transparent
          opacity={active ? 0.95 : 0.8}
        />
      </mesh>
      {active && (
        <mesh scale={[baseScale[0] * 1.25, baseScale[1] * 1.25, baseScale[2] * 1.25]} geometry={geo}>
          <meshBasicMaterial color={region.color} transparent opacity={0.15} side={THREE.BackSide} />
        </mesh>
      )}
      {active && (
        <Text
          position={[0, baseScale[1] + 0.14, 0]} fontSize={0.10} color="white"
          anchorX="center" anchorY="bottom"
          outlineWidth={0.014} outlineColor="#000000" maxWidth={1.8}
        >
          {region.name}
        </Text>
      )}
    </group>
  );
}

function SceneContent({
  regions, highlightedRegion, onRegionClick, autoRotate, setAutoRotate, cortexOpacity,
}: {
  regions: BrainRegion[];
  highlightedRegion: string | null;
  onRegionClick: (id: string) => void;
  autoRotate: boolean;
  setAutoRotate: (v: boolean) => void;
  cortexOpacity: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { invalidate } = useThree();

  // Resolve which connected regions are actually present in this disorder's region list
  const connectedIds = useMemo(() => {
    if (!highlightedRegion) return [];
    const ids = REGION_CONNECTIONS[highlightedRegion] || [];
    const presentIds = new Set(regions.map(r => r.id));
    return ids.filter(id => presentIds.has(id));
  }, [highlightedRegion, regions]);

  const highlightedRegionObj = useMemo(
    () => regions.find(r => r.id === highlightedRegion),
    [regions, highlightedRegion],
  );

  const highlightedPos = highlightedRegion
    ? (REGION_POSITIONS[highlightedRegion] || highlightedRegionObj?.position as [number, number, number] | undefined)
    : undefined;

  useFrame((_, delta) => {
    if (groupRef.current && autoRotate) {
      groupRef.current.rotation.y += delta * 0.15;
      invalidate();
    }
  });

  return (
    <>
      {/* Key light — warm, raking across folds */}
      <directionalLight position={[4, 5, 6]}   intensity={1.9} color="#fff5ee" />
      {/* Fill — cool, opposite side */}
      <directionalLight position={[-4, 2, -3]} intensity={0.5} color="#c0d0e8" />
      {/* Rim — silhouette from behind */}
      <directionalLight position={[0, 2, -6]}  intensity={0.6} color="#e0d0e8" />
      <ambientLight intensity={0.38} />
      <pointLight position={[0, -2, 1]} intensity={0.22} color="#d8c0c0" />

      <group ref={groupRef}>
        <CerebralHemisphere side="right" opacity={cortexOpacity} />
        <CerebralHemisphere side="left"  opacity={cortexOpacity} />
        <CorpusCallosum />
        <Brainstem />
        <Cerebellum />

        {/* Activation blobs — fMRI hot-colormap overlay */}
        {regions.map(region => (
          <ActivationBlob
            key={`blob-${region.id}`}
            position={REGION_POSITIONS[region.id] || (region.position as [number, number, number])}
            active={highlightedRegion === region.id}
          />
        ))}

        {/* Connectivity arcs between highlighted region and related regions */}
        {highlightedPos && highlightedRegionObj && connectedIds.map(connId => {
          const connPos = REGION_POSITIONS[connId];
          if (!connPos) return null;
          return (
            <ConnectivityArc
              key={`arc-${highlightedRegion}-${connId}`}
              fromPos={highlightedPos as [number, number, number]}
              toPos={connPos}
              color={highlightedRegionObj.color}
            />
          );
        })}

        {regions.map(region => (
          <RegionStructure
            key={region.id}
            region={region}
            isHighlighted={highlightedRegion === region.id}
            onClick={() => { setAutoRotate(false); onRegionClick(region.id); invalidate(); }}
          />
        ))}
      </group>

      <OrbitControls
        enablePan={false} minDistance={2.5} maxDistance={8}
        enableDamping dampingFactor={0.05}
        onChange={() => invalidate()}
        onStart={() => setAutoRotate(false)}
      />
    </>
  );
}

interface BrainViewer3DProps {
  regions: BrainRegion[];
  highlightedRegion: string | null;
  onRegionClick: (regionId: string) => void;
}

export function BrainViewer3D({ regions, highlightedRegion, onRegionClick }: BrainViewer3DProps) {
  const [autoRotate, setAutoRotate] = useState(true);
  const [viewMode, setViewMode]     = useState<'surface' | 'xray'>('surface');
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

  const cortexOpacity = viewMode === 'xray' ? 0.25 : 1;

  const handleRegionClick = (id: string) => {
    if (isSubcortical(id) && viewMode === 'surface') setViewMode('xray');
    onRegionClick(id);
  };

  return (
    <div
      className="relative w-full rounded-xl overflow-hidden bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700/50"
      style={{ height: 'clamp(320px, 55vh, 550px)' }}
    >
      <Canvas
        camera={{ position: [0, 0.8, 4], fov: 42 }}
        dpr={dpr}
        frameloop="demand"
        gl={{ antialias: true, alpha: true, powerPreference: 'default' }}
      >
        <SceneContent
          regions={regions}
          highlightedRegion={highlightedRegion}
          onRegionClick={handleRegionClick}
          autoRotate={autoRotate}
          setAutoRotate={setAutoRotate}
          cortexOpacity={cortexOpacity}
        />
      </Canvas>

      <div className="absolute bottom-3 left-3 flex gap-2">
        <button
          onClick={() => setAutoRotate(!autoRotate)}
          className="px-3 py-1.5 text-xs bg-slate-800/80 backdrop-blur-sm border border-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors"
        >
          {autoRotate ? 'Pause rotation' : 'Auto-rotate'}
        </button>
        <button
          onClick={() => setViewMode(viewMode === 'surface' ? 'xray' : 'surface')}
          className={`px-3 py-1.5 text-xs backdrop-blur-sm border rounded-lg transition-colors ${
            viewMode === 'xray'
              ? 'bg-neuro-600/80 border-neuro-500 text-white'
              : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white'
          }`}
        >
          {viewMode === 'xray' ? 'X-ray: ON' : 'X-ray'}
        </button>
      </div>

      <div className="absolute top-3 right-3 text-xs text-slate-500 bg-slate-800/80 backdrop-blur-sm px-2 py-1 rounded-md">
        {highlightedRegion
          ? 'Connectivity arcs show related circuits'
          : viewMode === 'xray' ? 'Viewing internal structures' : 'Click regions to explore'}
      </div>
    </div>
  );
}
