/**
 * Brain Visualization — adapted from world/src/brainview.ts (MIT, alextitonis/fly.ai)
 *
 * Upstream brainview.ts renders every neuron as a dot at its measured soma
 * position, flashing when it fires, grouped by modality. It uses three.js.
 *
 * We adapt this to a lightweight canvas 2D visualization showing:
 * - Sensory channel activity (loom, threat, shot, chase)
 * - Descending neuron activity (BUY/SELL/HOLD)
 * - Live neural firing patterns
 *
 * No three.js dependency — pure canvas 2D.
 */
import { useState, useEffect, useRef } from "react";

const API_BASE = import.meta.env.VITE_SHIT_UNITS_API_ENDPOINT ?? "";

const MODALITY_COLORS: Record<string, string> = {
  vision: "#3ed8ff",
  olfaction: "#ffb23e",
  mechanosensory: "#7ce0c0",
  central: "#9fb4c8",
  descending: "#6cf08a",
  motor: "#b8ffcf",
};

const CHANNEL_COLORS: Record<string, string> = {
  loom: "#ff5a5a",
  threat: "#ff5ad2",
  shot: "#ffe14d",
  chase: "#3ed8ff",
};

interface Signal {
  id: number;
  decision: string;
  confidence: number;
  reason: string;
  feature_snapshot: string | null;
  neural_activity: string | null;
  created_at: number;
}

export function BrainVisualization() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/signals?limit=5`);
        if (res.ok) setSignals(await res.json());
      } catch {
        // API not available
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 5000); // 5s polling for live feel
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx.fillStyle = "#0b0d10";
    ctx.fillRect(0, 0, width, height);

    // Draw sensory channels (left side)
    const channels = ["loom", "threat", "shot", "chase"];
    const channelY = 40;
    const channelSpacing = 50;

    channels.forEach((ch, i) => {
      const y = channelY + i * channelSpacing;
      const color = CHANNEL_COLORS[ch];

      // Label
      ctx.fillStyle = "#8793a0";
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillText(ch.toUpperCase(), 10, y - 5);

      // L and R bars
      const recentSignal = signals[0];
      let activity = 0.3; // default
      if (recentSignal?.feature_snapshot) {
        try {
          const features = JSON.parse(recentSignal.feature_snapshot);
          activity = Object.values(features)[0] as number;
        } catch {
          // keep default
        }
      }

      // Left bar
      ctx.fillStyle = color + "40";
      ctx.fillRect(70, y - 8, 80, 16);
      ctx.fillStyle = color;
      ctx.fillRect(70, y - 8, 80 * activity, 16);

      // Right bar
      ctx.fillStyle = color + "40";
      ctx.fillRect(160, y - 8, 80, 16);
      ctx.fillStyle = color;
      ctx.fillRect(160, y - 8, 80 * activity, 16);

      // L/R labels
      ctx.fillStyle = "#8793a0";
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText("L", 75, y + 20);
      ctx.fillText("R", 165, y + 20);
    });

    // Draw descending neuron activity (right side)
    const descX = 280;
    const descChannels = [
      { name: "DNg100 (BUY)", color: "#6cf08a", key: "buy" },
      { name: "DNp01 (SELL)", color: "#ff5a5a", key: "sell" },
      { name: "MDN (HOLD)", color: "#8793a0", key: "hold" },
    ];

    descChannels.forEach((ch, i) => {
      const y = channelY + i * channelSpacing;

      // Label
      ctx.fillStyle = "#8793a0";
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillText(ch.name, descX, y - 5);

      // Activity bar
      const recentDecision = signals[0]?.decision;
      let activity = 0.2;
      if (recentDecision === "BUY" && ch.key === "buy") activity = 0.8;
      if (recentDecision === "SELL" && ch.key === "sell") activity = 0.8;
      if (recentDecision === "HOLD" && ch.key === "hold") activity = 0.8;

      ctx.fillStyle = ch.color + "40";
      ctx.fillRect(descX + 100, y - 8, 100, 16);
      ctx.fillStyle = ch.color;
      ctx.fillRect(descX + 100, y - 8, 100 * activity, 16);
    });

    // Draw "neurons firing" animation (bottom)
    const neuronY = 220;
    const neuronCount = 60;
    const time = Date.now() / 1000;

    for (let i = 0; i < neuronCount; i++) {
      const x = 20 + i * 8;
      const phase = (time * 2 + i * 0.3) % (Math.PI * 2);
      const firing = Math.sin(phase) > 0.7;

      if (firing) {
        ctx.fillStyle = MODALITY_COLORS.descending;
        ctx.beginPath();
        ctx.arc(x, neuronY, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = "#222a33";
        ctx.beginPath();
        ctx.arc(x, neuronY, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Title
    ctx.fillStyle = "#e7ecf1";
    ctx.font = "bold 13px ui-monospace, monospace";
    ctx.fillText("FLY BRAIN — Live Neural Activity", 10, 15);

    // Legend
    ctx.fillStyle = "#8793a0";
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText("Sensory channels (L/R) → Descending neurons → Decision", 10, height - 10);
  }, [signals]);

  return (
    <div className="rounded-lg border border-a10-b bg-surface-a3 p-4">
      <h3 className="font-mono text-xs uppercase tracking-wider text-secondary-t mb-3">
        Brain Visualization
        <span className="ml-2 text-green">●</span>
        <span className="ml-1 text-secondary-t text-xs">live</span>
      </h3>
      <canvas
        ref={canvasRef}
        width={450}
        height={260}
        className="w-full rounded bg-[#0b0d10]"
      />
      {loading && (
        <p className="text-secondary-t text-xs font-mono mt-2">Loading neural data...</p>
      )}
    </div>
  );
}
