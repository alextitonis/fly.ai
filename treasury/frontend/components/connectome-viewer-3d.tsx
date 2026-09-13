/**
 * ConnectomeViewer3D — renders real neuron positions, synapse edges, and
 * motor group decision tree (BUY/SELL/HOLD) using Three.js buffer geometry.
 * Uses actual brain.npz data from R2 via /api/connectome/:id/brain.
 */
import { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface BrainData {
  id: string;
  species: string;
  n_neurons: number;
  n_synapses: number;
  positions: number[][];
  cell_types: string[];
  sides: string[];
  edges: number[][];
  motor_groups: { buy: number[]; sell: number[]; hold: number[] };
  cell_type_colors: Record<string, string>;
}

const DECISION_COLORS: Record<string, number> = {
  buy: 0x00ff88,
  sell: 0xff4444,
  hold: 0xffaa00,
};

export function ConnectomeViewer3D({ data, decision }: { data: BrainData | null; decision: string | null }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [activeDecision, setActiveDecision] = useState<string | null>(decision);

  useEffect(() => {
    if (!data || !mountRef.current) return;

    const mount = mountRef.current;
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07090c);

    // Camera
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.01, 100);
    camera.position.set(2, 1.5, 2);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;

    // Lights
    scene.add(new THREE.AmbientLight(0x404060, 0.5));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8);
    dl.position.set(5, 5, 5);
    scene.add(dl);

    // === Neurons as Points ===
    const n = data.positions.length;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);

    for (let i = 0; i < n; i++) {
      positions[i * 3] = data.positions[i][0];
      positions[i * 3 + 1] = data.positions[i][1];
      positions[i * 3 + 2] = data.positions[i][2];

      const ct = data.cell_types[i];
      const hex = data.cell_type_colors[ct] || "#9fb4c8";
      const c = new THREE.Color(hex);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    // Size based on neuron count — smaller for large connectomes
    const pointSize = n > 50000 ? 0.008 : n > 5000 ? 0.015 : n > 500 ? 0.025 : 0.04;

    const material = new THREE.PointsMaterial({
      size: pointSize,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // === Synapse edges as LineSegments ===
    const edgeCount = data.edges.length;
    if (edgeCount > 0 && n <= 10000) {
      // Only show edges for smaller connectomes (performance)
      const edgePositions = new Float32Array(edgeCount * 6);
      const edgeColors = new Float32Array(edgeCount * 6);

      for (let i = 0; i < edgeCount; i++) {
        const [pre, post] = data.edges[i];
        if (pre >= n || post >= n) continue;
        edgePositions[i * 6] = data.positions[pre][0];
        edgePositions[i * 6 + 1] = data.positions[pre][1];
        edgePositions[i * 6 + 2] = data.positions[pre][2];
        edgePositions[i * 6 + 3] = data.positions[post][0];
        edgePositions[i * 6 + 4] = data.positions[post][1];
        edgePositions[i * 6 + 5] = data.positions[post][2];

        // Color edges by source neuron type
        const ct = data.cell_types[pre];
        const hex = data.cell_type_colors[ct] || "#444";
        const c = new THREE.Color(hex);
        edgeColors[i * 6] = c.r * 0.3;
        edgeColors[i * 6 + 1] = c.g * 0.3;
        edgeColors[i * 6 + 2] = c.b * 0.3;
        edgeColors[i * 6 + 3] = c.r * 0.15;
        edgeColors[i * 6 + 4] = c.g * 0.15;
        edgeColors[i * 6 + 5] = c.b * 0.15;
      }

      const edgeGeo = new THREE.BufferGeometry();
      edgeGeo.setAttribute("position", new THREE.BufferAttribute(edgePositions, 3));
      edgeGeo.setAttribute("color", new THREE.BufferAttribute(edgeColors, 3));
      const edgeMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.3,
      });
      const lines = new THREE.LineSegments(edgeGeo, edgeMat);
      scene.add(lines);
    }

    // === Motor group decision neurons (BUY/SELL/HOLD) ===
    const groupMeshes: Record<string, THREE.Mesh> = {};
    for (const [action, neuronIds] of Object.entries(data.motor_groups)) {
      const validIds = neuronIds.filter((id) => id < n);
      if (validIds.length === 0) continue;

      const groupGeo = new THREE.BufferGeometry();
      const groupPos = new Float32Array(validIds.length * 3);
      for (let i = 0; i < validIds.length; i++) {
        const idx = validIds[i];
        groupPos[i * 3] = data.positions[idx][0];
        groupPos[i * 3 + 1] = data.positions[idx][1];
        groupPos[i * 3 + 2] = data.positions[idx][2];
      }
      groupGeo.setAttribute("position", new THREE.BufferAttribute(groupPos, 3));

      const color = DECISION_COLORS[action] || 0xffffff;
      const groupMat = new THREE.PointsMaterial({
        size: pointSize * 4,
        color,
        sizeAttenuation: true,
        transparent: true,
        opacity: 1,
      });
      const groupPoints = new THREE.Points(groupGeo, groupMat);
      scene.add(groupPoints);
      groupMeshes[action] = groupPoints as any;

      // Glow spheres for decision neurons
      for (const idx of validIds) {
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(pointSize * 2, 8, 8),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3 })
        );
        sphere.position.set(data.positions[idx][0], data.positions[idx][1], data.positions[idx][2]);
        scene.add(sphere);
      }
    }

    // Highlight active decision
    if (activeDecision && groupMeshes[activeDecision]) {
      // Pulse the active group
      const activeMat = (groupMeshes[activeDecision] as any).material as THREE.PointsMaterial;
      activeMat.size = pointSize * 6;
    }

    // === Animation ===
    let frameId: number;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [data, activeDecision]);

  // Update highlight when decision changes
  useEffect(() => {
    setActiveDecision(decision);
  }, [decision]);

  if (!data) {
    return <div className="flex items-center justify-center h-full text-gray-500 font-mono text-sm">Loading connectome...</div>;
  }

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className="w-full h-full min-h-[400px]" />

      {/* Decision tree overlay */}
      <div className="absolute top-3 left-3 flex gap-2">
        {["buy", "sell", "hold"].map((action) => {
          const color = action === "buy" ? "#00ff88" : action === "sell" ? "#ff4444" : "#ffaa00";
          const isActive = activeDecision === action;
          const count = (data.motor_groups as any)[action]?.filter((id: number) => id < data.n_neurons).length ?? 0;
          return (
            <button
              key={action}
              onClick={() => setActiveDecision(isActive ? null : action)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono backdrop-blur-sm border transition-all ${
                isActive
                  ? "border-2 scale-105"
                  : "border border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white"
              }`}
              style={isActive ? { borderColor: color, color, background: `${color}20` } : {}}
            >
              {action.toUpperCase()} ({count})
            </button>
          );
        })}
      </div>

      {/* Stats overlay */}
      <div className="absolute bottom-3 left-3 text-xs font-mono text-slate-400 bg-slate-800/80 backdrop-blur-sm px-3 py-2 rounded-lg">
        <div className="text-white font-bold">{data.id}</div>
        <div>{data.n_neurons.toLocaleString()} neurons · {data.n_synapses.toLocaleString()} synapses</div>
        <div className="mt-1">
          {Object.entries(data.cell_type_colors).map(([ct, color]) => {
            const count = data.cell_types.filter((t) => t === ct).length;
            if (count === 0) return null;
            return (
              <div key={ct} className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
                <span>{ct}: {count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
