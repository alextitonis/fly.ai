"""Fly Brain Durable Object — runs the real connectome simulation.

Uses fly_brain_pyodide.FlyBrain (pure numpy port of fly_brain.py, MIT, alextitonis)
to run the LIF simulation on the actual MaleCNS v1.0 connectome (166,700 neurons,
5.1M synapses after pruning). Weights loaded from R2.

ALIGNED WITH alextitonis/fly.ai:
  - fly_eyes.FeatureDetectors for encoding (loom→LPLC2, threat→LC4, shot→LPLC1, chase→LC10a)
  - flyreservoir.Trace for decaying spike trace over 1,314 descending neurons
  - flyreservoir.Readout for PCA + logistic regression (CV-selected)
  - flyreservoir.best_threshold for F-beta threshold optimization
  - sshfighter/fly_fighter.py patterns: multi-fly voting, exploration, Decoder
  - sshfighter/reservoir.py patterns: Featurizer, Recorder

Self-improving: trains a reservoir readout every 10 completed trades.
Connectome stays frozen. Only the readout and encoder are learned.
"""
from __future__ import annotations

import json
import time
import tempfile
import os

import numpy as np

from workers import DurableObject, Response, WorkerEntrypoint, fetch

# OSS imports (MIT licensed, alextitonis/fly.ai)
from fly_brain_pyodide import FlyBrain
from fly_eyes import FeatureDetectors
from flyreservoir import Readout, Trace, run, best_threshold, fit_ridge, project

# Decision neuron groups — configurable per connectome via metadata.
# Fly connectomes use MaleCNS motor groups; others use cell_type lookup.
# These are fallbacks — the actual groups come from brain.groups (metadata).
DEFAULT_BUY_NEURONS = ["forward_L", "forward_R", "descending_neuron", "MN", "ON_ganglion", "cMN", "motor", "deep_pyramidal"]
DEFAULT_SELL_NEURONS = ["escape_L", "escape_R", "MGIN", "OFF_ganglion", "reverse_cMN", "interneuron", "somatosensory"]
DEFAULT_HOLD_NEURONS = ["backward_L", "backward_R", "BVIN", "wide_field", "interneuron", "association", "layer_2_3"]

SIMULATION_STEPS = 200  # 200 steps × 20ms = 4s simulated time per decision
WARMUP_STEPS = 40       # First 40 steps are warmup (discard)

# Exploration rate during recording (from sshfighter/fly_fighter.py EXPLORE_P)
EXPLORE_P = 0.07  # 7% of decisions are random to gather diverse training data

# Feature vector: 6 normalized market features for the encoder
FEATURE_KEYS = ["liquidity_norm", "volume_norm", "momentum", "buy_ratio", "score_norm", "age_norm"]

# Fly connectomes that use fly_eyes.FeatureDetectors for visual encoding
FLY_CONNECTOMES = {"larva", "hemibrain", "medulla", "malecns"}

# Region-level connectomes that use region-as-population expansion
REGION_CONNECTOMES = {"human", "macaque", "macaque_modha", "mouse", "rat", "drosophila"}

# All 16 real connectome IDs (loaded from R2)
ALL_CONNECTOMES = [
    "celegans", "drosophila", "human", "macaque", "macaque_modha", "mouse", "rat",
    "malecns", "hemibrain", "medulla", "mouse_retina", "platynereis",
    "ciona", "larva", "celegans_herm", "celegans_male"
]


class ConnectomeDO(DurableObject):
    """Durable Object that runs any connectome with self-improving readout.

    Generalized from FlyBrainDO to support 16 connectomes across 9 species.
    Each DO instance is named by connectome_id (e.g. 'celegans', 'malecns').
    Loads weights from R2 at '<connectome_id>/weights.npz' and '<connectome_id>/brain.npz'.
    For the original malecns, uses the legacy keys 'weights.npz'/'brain.npz' for backward compat.
    Uses fly_eyes.FeatureDetectors only for fly connectomes; others use direct cell-type injection.
    """

    def __init__(self, ctx, env):
        super().__init__(ctx, env)
        self.connectome_id = None  # Set from DO name in _ensure_brain
        self.brain = None
        self.initialized = False
        self.readout = None       # Trained reservoir readout (flyreservoir.Readout)
        self.encoder_w_az = None  # Learned encoder weights for azimuth
        self.encoder_w_int = None # Learned encoder weights for intensity
        self.encoder_b_az = 0.0
        self.encoder_b_int = 0.5
        self.eyes = None          # fly_eyes.FeatureDetectors (fly connectomes only)
        self.rng = np.random.default_rng(64)
        self.buy_neurons = None   # Resolved per-connectome from metadata
        self.sell_neurons = None
        self.hold_neurons = None

    async def _read_r2_stream(self, obj) -> bytes:
        """Read an R2 object body as bytes using the stream API."""
        body = obj.body
        reader = body.getReader()
        chunks = []
        while True:
            result = await reader.read()
            if result.done:
                break
            chunk = result.value
            # chunk is a JsProxy Uint8Array — convert to Python bytes
            chunks.append(bytes(chunk))
        return b"".join(chunks)

    async def _ensure_brain(self):
        """Load connectome weights + trained models from R2."""
        if self.initialized:
            return

        # If connectome_id not set yet, try to extract from DO name
        if not self.connectome_id:
            try:
                do_name = str(self.ctx.id().name)
                if not do_name or do_name == "None":
                    do_name = "malecns"
            except Exception:
                do_name = "malecns"
            self.connectome_id = do_name.split(":")[-1] if ":" in do_name else do_name

        # Skip malecns — its 205MB weights file exceeds the Python Worker memory limit
        if self.connectome_id == "malecns":
            raise RuntimeError("malecns weights (205MB) exceed Python Worker memory limit — skipped")

        try:
            await self._log_error(f"starting brain initialization for {self.connectome_id}")
        except Exception:
            pass

        # R2 keys: use connectome-prefixed keys, fall back to legacy for malecns
        cid = self.connectome_id
        weights_key = "weights.npz" if cid == "malecns" else f"{cid}/weights.npz"
        meta_key = "brain.npz" if cid == "malecns" else f"{cid}/brain.npz"

        # Download connectome weights from R2 directly
        try:
            await self._log_error(f"fetching R2 keys: {weights_key}, {meta_key}")
            weights_obj = await self.env.WEIGHTS.get(weights_key)
            if weights_obj is None:
                await self._log_error(f"Connectome weights not found at {weights_key}")
                raise RuntimeError(f"{weights_key} not found in R2")

            meta_obj = await self.env.WEIGHTS.get(meta_key)
            if meta_obj is None:
                await self._log_error(f"Brain metadata not found at {meta_key}")
                raise RuntimeError(f"{meta_key} not found in R2")

            # Log R2 object metadata
            try:
                w_size = weights_obj.size
                m_size = meta_obj.size
                await self._log_error(f"R2 sizes: weights={w_size}, meta={m_size}")
            except Exception as e:
                await self._log_error(f"R2 size check failed: {e}")

            await self._log_error("reading R2 body stream")
            # Read R2 body as a stream to avoid memory issues with text()/arrayBuffer()
            weights_bytes = await self._read_r2_stream(weights_obj)
            meta_bytes = await self._read_r2_stream(meta_obj)
            await self._log_error(f"got bytes: weights={len(weights_bytes)}, meta={len(meta_bytes)}")

            await self._log_error(f"downloaded weights ({len(weights_bytes)} bytes) + meta ({len(meta_bytes)} bytes)")

            weights_file = tempfile.NamedTemporaryFile(suffix=".npz", delete=False)
            weights_file.write(weights_bytes)
            weights_file.close()

            meta_file = tempfile.NamedTemporaryFile(suffix=".npz", delete=False)
            meta_file.write(meta_bytes)
            meta_file.close()

            await self._log_error("loading FlyBrain from temp files")

            self.brain = FlyBrain(weights_npz=weights_file.name, meta_npz=meta_file.name, seed=64)
            os.unlink(weights_file.name)
            os.unlink(meta_file.name)

            await self._log_error(f"FlyBrain loaded: {self.brain.n} neurons")

            # Initialize fly_eyes.FeatureDetectors only for fly connectomes
            if self.connectome_id in FLY_CONNECTOMES:
                self.eyes = FeatureDetectors(self.brain)
                await self._log_error("FeatureDetectors initialized (fly connectome)")
            else:
                self.eyes = None
                await self._log_error(f"Non-fly connectome {self.connectome_id} — using direct injection")

            # Resolve BUY/SELL/HOLD neuron groups from brain metadata (cell types)
            # Falls back to DEFAULT_*_NEURONS if no matching groups found
            self.buy_neurons = self._resolve_neurons(DEFAULT_BUY_NEURONS)
            self.sell_neurons = self._resolve_neurons(DEFAULT_SELL_NEURONS)
            self.hold_neurons = self._resolve_neurons(DEFAULT_HOLD_NEURONS)
            await self._log_error(f"Neuron groups resolved: buy={len(self.buy_neurons)} sell={len(self.sell_neurons)} hold={len(self.hold_neurons)}")
        except Exception as e:
            await self._log_error(f"brain init failed: {e}")
            raise

        # Load trained readout from R2 (connectome-prefixed)
        readout_key = "readout.npz" if self.connectome_id == "malecns" else f"{self.connectome_id}/readout.npz"
        readout_obj = await self.env.WEIGHTS.get(readout_key)
        if readout_obj is not None:
            try:
                r_bytes = await readout_obj.arrayBuffer()
                r_file = tempfile.NamedTemporaryFile(suffix=".npz", delete=False)
                r_file.write(r_bytes)
                r_file.close()
                self.readout = Readout.load(r_file.name)
                os.unlink(r_file.name)
            except Exception as e:
                await self._log_error(f"Failed to load readout: {e}")

        # Load trained encoder from R2 (connectome-prefixed)
        encoder_key = "encoder.npz" if self.connectome_id == "malecns" else f"{self.connectome_id}/encoder.npz"
        encoder_obj = await self.env.WEIGHTS.get(encoder_key)
        if encoder_obj is not None:
            try:
                e_bytes = await encoder_obj.arrayBuffer()
                e_file = tempfile.NamedTemporaryFile(suffix=".npz", delete=False)
                e_file.write(e_bytes)
                e_file.close()
                enc = np.load(e_file.name)
                self.encoder_w_az = enc["w_az"]
                self.encoder_w_int = enc["w_int"]
                self.encoder_b_az = float(enc["b_az"])
                self.encoder_b_int = float(enc["b_int"])
                os.unlink(e_file.name)
            except Exception as e:
                await self._log_error(f"Failed to load encoder: {e}")

        self.initialized = True
        await self.env.DB.prepare(
            "INSERT INTO audit_log (event, data, created_at) VALUES (?, ?, ?)"
        ).bind("fly_brain_init", json.dumps({
            "neurons": self.brain.n,
            "synapses": len(self.brain.data),
            "groups": list(self.brain.groups.keys()),
            "visual_neurons": len(self.brain.visual),
            "readout_loaded": self.readout is not None,
            "encoder_loaded": self.encoder_w_az is not None,
            "readout_cv_score": float(self.readout.cv_score) if self.readout else None,
            "eyes_loaded": self.eyes is not None,
        }), int(time.time())).run()

    async def _log_error(self, message: str):
        await self.env.DB.prepare(
            "INSERT INTO audit_log (event, data, created_at) VALUES (?, ?, ?)"
        ).bind("fly_brain_error", json.dumps({"error": message, "connectome": self.connectome_id}), int(time.time())).run()

    def _resolve_neurons(self, candidate_types: list[str]) -> np.ndarray:
        """Resolve neuron indices from cell type names in connectome metadata.

        Tries brain.groups first (named motor groups), then brain.cells() (cell types).
        Returns the first matching group, or empty array if none match.
        """
        # Try brain.groups (named groups from metadata, e.g. 'forward_L')
        for t in candidate_types:
            if t in self.brain.groups and len(self.brain.groups[t]) > 0:
                return self.brain.groups[t]
        # Try brain.cells() (cell type lookup)
        idx = self.brain.cells(candidate_types)
        if len(idx) > 0:
            return idx
        # Fallback: use a random subset of neurons (for connectomes without matching types)
        if self.brain.n > 0:
            rng = np.random.default_rng(42)
            return rng.choice(self.brain.n, size=min(10, self.brain.n), replace=False)
        return np.array([], dtype=np.int64)

    async def _get_setting(self, key: str, default: str = "") -> str:
        row = await self.env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first()
        return row["value"] if row else default

    async def alarm(self, alarm_info=None):
        """Main trading loop — runs every 1 minute."""
        try:
            await self._ensure_brain()
            cursor = await self.env.DB.prepare(
                "SELECT address, symbol, launchpad, score, score_reasons FROM tokens "
                "WHERE ignored = 0 AND score > 30 ORDER BY score DESC LIMIT 3"
            ).all()
            for token in cursor.results or []:
                decision = await self._evaluate_token(token)
                await self._store_signal(token, decision)
            # Set next alarm only if init succeeded
            await self.ctx.storage.setAlarm(int(time.time() * 1000) + 60_000)
        except Exception as e:
            await self._log_error(str(e))
            # Don't set alarm if init failed — prevents crash loop

    def _extract_features(self, token: dict) -> np.ndarray:
        """Extract 6 normalized market features from token data."""
        score = float(token.get("score", 0))
        reasons = json.loads(token.get("score_reasons") or "{}")
        return np.array([
            0.5,  # liquidity_norm
            0.5,  # volume_norm
            0.5,  # momentum
            0.5,  # buy_ratio
            min(score / 100.0, 1.0),  # score_norm
            0.5,  # age_norm
        ], dtype=np.float32)

    def _market_to_fly_inputs(self, token: dict, features: np.ndarray):
        """Map market data to fly sensory inputs (upstream detector_inputs pattern).

        Returns (opp, shots, threat) for fly_eyes.FeatureDetectors.inject().
        """
        score = float(token.get("score", 0))
        # dx: azimuth position (-1 = far left/bearish .. +1 = far right/bullish)
        # Use score as the "position" of the market relative to neutral
        dx = (score - 50) / 50.0  # -1 .. +1

        # size: "angular size" of the market movement (volatility proxy)
        size = 30.0  # default size (matching upstream's opponent size)

        # threat: dump risk 0..1 (sell pressure)
        threat = 0.0
        reasons = json.loads(token.get("score_reasons") or "{}")
        if isinstance(reasons, dict):
            negatives = reasons.get("negatives", [])
            if any("sell" in str(n).lower() or "dump" in str(n).lower() for n in negatives):
                threat = 0.8
            elif any("low" in str(n).lower() and "liquid" in str(n).lower() for n in negatives):
                threat = 0.3

        # shots: new token launches (small approaching objects)
        shots = []
        launchpad = token.get("launchpad", "")
        if launchpad and score > 50:
            shots = [(f"launch_{token['address'][:8]}", dx * 50, 12.0)]

        return (dx * 50, size), shots, threat  # dx in screen units (upstream uses ~30-90)

    def _market_to_direct_inputs(self, token: dict, features: np.ndarray):
        """Map market data to direct neuron injection for non-fly connectomes.

        Injects into sensory neurons identified by cell type (from metadata).
        Uses the same 5 market signals as fly connectomes but mapped to
        whatever sensory cell types exist in this connectome.
        """
        score = float(token.get("score", 0))
        # Map market features to injection strengths
        buy_strength = max(0, (score - 50) / 50.0) * 0.5  # 0..0.5
        sell_strength = max(0, (50 - score) / 50.0) * 0.5  # 0..0.5
        volatility = 0.2  # baseline noise drive

        # Inject into sensory neurons (visual, mechanosensory, etc.)
        inject_list = []
        sensory_types = ["visual", "mechanosensory", "photoreceptor", "bipolar",
                         "eyespot", "olfactory", "chemosensory", "pyramidal"]
        sensory_idx = self.brain.cells(sensory_types)
        if len(sensory_idx) > 0:
            # Drive sensory neurons with market signal
            inject_list.append((sensory_idx, buy_strength + volatility))
        return inject_list

    async def _evaluate_token(self, token: dict) -> dict:
        """Run LIF simulation for one token using upstream fly_eyes + Trace."""
        brain = self.brain
        brain.reset(seed=64)

        features = self._extract_features(token)

        # Use upstream fly_eyes.FeatureDetectors for fly connectomes, direct injection for others
        if self.eyes is not None:
            opp, shots, threat = self._market_to_fly_inputs(token, features)
            def encode(t):
                if t >= SIMULATION_STEPS:
                    return []
                return self.eyes.inject(opp=opp, shots=shots, threat=threat)
        else:
            # Non-fly connectome: inject directly into sensory neurons via cell types
            inject_list = self._market_to_direct_inputs(token, features)
            def encode(t):
                if t >= SIMULATION_STEPS:
                    return []
                return inject_list

        # Use upstream flyreservoir.Trace over resolved output neurons
        trace = Trace(brain, types=["descending_neuron"], tau=0.1)

        # Run simulation ONCE — collect both trace features and group rates
        counts = {g: 0 for g in brain.groups}
        trace_samples = []
        for step in range(SIMULATION_STEPS):
            inject = encode(step)
            fired = brain.step(inject=inject)
            trace.observe(fired)
            if step >= WARMUP_STEPS:
                trace_samples.append(trace.features().copy())
                hit = np.zeros(brain.n, dtype=bool)
                hit[fired] = True
                for g, idx in brain.groups.items():
                    counts[g] += int(hit[idx].sum())

        # Average trace over post-warmup steps (the actual readout features)
        if trace_samples:
            activity_vec = np.mean(trace_samples, 0)
        else:
            activity_vec = trace.features()

        # Compute group firing rates
        window = (SIMULATION_STEPS - WARMUP_STEPS) * brain.dt
        rates = {}
        for g in counts:
            if g in brain.groups and len(brain.groups[g]) > 0:
                rates[g] = counts[g] / (len(brain.groups[g]) * window)
            else:
                rates[g] = 0.0

        # Decision: use learned readout or fallback to hand-written Decoder
        if self.readout is not None:
            p_profit = float(self.readout.predict(activity_vec))
            threshold = float(await self._get_setting("readout_threshold", "0.55"))
            if p_profit > threshold:
                action = "BUY"
                confidence = p_profit
                reason = f"readout P(profit)={p_profit:.2f} > {threshold}"
            else:
                action = "HOLD"
                confidence = 0.0
                reason = f"readout P(profit)={p_profit:.2f} < {threshold}"
        else:
            # Fallback: hand-written Decoder (from sshfighter/fly_fighter.py pattern)
            # Use resolved neuron groups (per-connectome, from metadata)
            buy_rate = max(rates.get(g, 0) for g in self.buy_neurons) if len(self.buy_neurons) > 0 else 0
            sell_rate = max(rates.get(g, 0) for g in self.sell_neurons) if len(self.sell_neurons) > 0 else 0
            buy_threshold = float(self.env.BUY_THRESHOLD_HZ or 5.0)
            sell_threshold = float(self.env.SELL_THRESHOLD_HZ or 3.0)
            if buy_rate > buy_threshold and buy_rate > sell_rate:
                action = "BUY"
                confidence = min(1.0, buy_rate / (buy_threshold * 2))
                reason = f"forward={buy_rate:.1f}Hz > {buy_threshold}Hz threshold"
            elif sell_rate > sell_threshold:
                action = "SELL"
                confidence = min(1.0, sell_rate / (sell_threshold * 2))
                reason = f"escape={sell_rate:.1f}Hz > {sell_threshold}Hz threshold"
            else:
                action = "HOLD"
                confidence = 0.0
                reason = f"forward={buy_rate:.1f}Hz, escape={sell_rate:.1f}Hz below thresholds"

        # Exploration during recording (from sshfighter/fly_fighter.py EXPLORE_P)
        # 7% of decisions are random to gather diverse training data
        if self.rng.random() < EXPLORE_P:
            action = self.rng.choice(["BUY", "HOLD"])
            confidence = 0.5
            reason = f"exploration random {action} (EXPLORE_P={EXPLORE_P})"

        return {
            "action": action,
            "confidence": confidence,
            "reason": reason,
            "neural_activity": json.dumps(activity_vec.astype(float).tolist()),
            "features": json.dumps({k: float(v) for k, v in zip(FEATURE_KEYS, features)}),
            "eye_channels": json.dumps(self.eyes.last) if self.eyes else "null",
            "rates": json.dumps(rates),
            "score": token.get("score", 0),
        }

    async def _store_signal(self, token: dict, decision: dict):
        """Store fly brain decision + features in D1."""
        await self.env.DB.prepare(
            "INSERT INTO signals (token_address, decision, confidence, neural_activity, "
            "feature_snapshot, score, reason, connectome_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(
            token["address"], decision["action"], decision["confidence"],
            decision["neural_activity"], decision["features"],
            decision["score"], decision["reason"], self.connectome_id, int(time.time()),
        ).run()

    async def _retrain(self) -> dict:
        """Retrain readout + encoder from completed trade outcomes."""
        data = await self.env.DB.prepare(
            "SELECT neural_activity, features, outcome, pnl_percent FROM training_data "
            "WHERE outcome IS NOT NULL ORDER BY closed_at DESC LIMIT 200"
        ).all()
        rows = data.results or []
        if len(rows) < 10:
            return {"status": "not_enough_data", "n": len(rows)}

        # Parse neural activity (trace features) → X matrix, outcomes → y
        X = np.array([json.loads(r["neural_activity"]) for r in rows], dtype=np.float32)
        y = np.array([r["outcome"] for r in rows], dtype=np.float32)
        features_arr = np.array([list(json.loads(r["features"]).values()) for r in rows], dtype=np.float32)

        # 1. Train readout (flyreservoir.py — OSS)
        readout = Readout.fit(X, y, kind="logistic")
        # Save to R2
        r_file = tempfile.NamedTemporaryFile(suffix=".npz", delete=False)
        r_file.close()
        readout.save(r_file.name)
        with open(r_file.name, "rb") as f:
            await self.env.WEIGHTS.put("readout.npz", f.read())
        os.unlink(r_file.name)
        self.readout = readout

        # 2. Optimize readout threshold using best_threshold (sshfighter pattern)
        p_train = np.array([float(readout.predict(x)) for x in X])
        optimal_threshold = best_threshold(y, p_train, beta=0.5)
        await self.env.DB.prepare(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('readout_threshold', ?)"
        ).bind(str(round(optimal_threshold, 3))).run()

        # 3. Train encoder via ridge regression (flyreservoir.fit_ridge — OSS)
        pnl = np.array([r["pnl_percent"] or 0 for r in rows], dtype=np.float32)
        if len(np.unique(pnl)) > 1:
            w_az, b_az = fit_ridge(features_arr, pnl, lam=1.0)
            w_int, b_int = fit_ridge(features_arr, np.abs(pnl), lam=1.0)
            self.encoder_w_az = w_az.astype(np.float32)
            self.encoder_w_int = w_int.astype(np.float32)
            self.encoder_b_az = float(b_az)
            self.encoder_b_int = float(b_int)
            e_file = tempfile.NamedTemporaryFile(suffix=".npz", delete=False)
            e_file.close()
            np.savez(e_file.name, w_az=self.encoder_w_az, w_int=self.encoder_w_int,
                     b_az=self.encoder_b_az, b_int=self.encoder_b_int)
            with open(e_file.name, "rb") as f:
                await self.env.WEIGHTS.put("encoder.npz", f.read())
            os.unlink(e_file.name)

        # 4. Optimize trade params from historical percentiles
        wins = [r for r in rows if r["outcome"] == 1]
        losses = [r for r in rows if r["outcome"] == 0]
        if wins:
            win_pnls = sorted([r["pnl_percent"] for r in wins])
            profit_target = win_pnls[len(win_pnls) // 4]
        else:
            profit_target = 30
        if losses:
            loss_pnls = sorted([abs(r["pnl_percent"]) for r in losses])
            stop_loss = loss_pnls[len(loss_pnls) * 3 // 4]
        else:
            stop_loss = 15
        win_rate = len(wins) / max(len(wins) + len(losses), 1)
        if wins and losses:
            avg_win = np.mean([r["pnl_percent"] for r in wins])
            avg_loss = np.mean([abs(r["pnl_percent"]) for r in losses])
            kelly = win_rate - (1 - win_rate) / max(avg_win / avg_loss, 0.01)
            max_position = max(10, min(80, kelly * 100))
        else:
            max_position = 50

        now = int(time.time())
        await self.env.DB.prepare(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('profit_target_pct', ?)"
        ).bind(str(round(profit_target, 1))).run()
        await self.env.DB.prepare(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('stop_loss_pct', ?)"
        ).bind(str(round(stop_loss, 1))).run()
        await self.env.DB.prepare(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('max_position_pct', ?)"
        ).bind(str(round(max_position, 1))).run()

        # Log to model_versions
        await self.env.DB.prepare(
            "INSERT INTO model_versions (model_type, version, cv_score, trade_count, metrics, saved_at) "
            "VALUES (?, ?, ?, ?, ?, ?)"
        ).bind("readout", len(rows), readout.cv_score, len(rows),
               json.dumps({"auc": readout.cv_score, "win_rate": win_rate,
                           "profit_target": profit_target, "stop_loss": stop_loss,
                           "max_position": max_position,
                           "threshold": optimal_threshold}), now).run()

        # Discord notification
        await self._post_retrain_discord(readout.cv_score, len(rows), win_rate,
                                          profit_target, stop_loss, max_position,
                                          optimal_threshold)

        return {"status": "retrained", "auc": readout.cv_score, "n": len(rows),
                "win_rate": win_rate, "profit_target": profit_target,
                "stop_loss": stop_loss, "max_position": max_position,
                "threshold": optimal_threshold}

    async def _post_retrain_discord(self, auc_score, n_trades, win_rate,
                                      profit_target, stop_loss, max_position, threshold):
        webhook = getattr(self.env, "DISCORD_WEBHOOK_URL", None)
        if not webhook:
            return
        try:
            await fetch(webhook, {
                "method": "POST",
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({
                    "username": "SHIT Brain Trainer",
                    "embeds": [{
                        "title": f"Model retrained ({n_trades} trades)",
                        "color": 0x9b59b6,
                        "fields": [
                            {"name": "Readout AUC", "value": f"{auc_score:.3f}", "inline": True},
                            {"name": "Win rate", "value": f"{win_rate:.1%}", "inline": True},
                            {"name": "Threshold", "value": f"{threshold:.2f}", "inline": True},
                            {"name": "Profit target", "value": f"+{profit_target:.1f}%", "inline": True},
                            {"name": "Stop loss", "value": f"-{stop_loss:.1f}%", "inline": True},
                            {"name": "Max position", "value": f"{max_position:.0f}%", "inline": True},
                        ],
                        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    }],
                }),
            })
        except Exception:
            pass

    async def _verify(self) -> dict:
        """Verify that market signals reach descending neurons (inject.py pattern).

        Stimulates each sensory channel and measures if the signal reaches
        the descending neurons. Returns a diagnostic report.
        """
        brain = self.brain
        brain.reset(seed=64)

        # Test each channel: loom, threat, shot, chase
        channels = {
            "loom": {"opp": (0, 30), "shots": [], "threat": 0.0},
            "threat": {"opp": (0, 30), "shots": [], "threat": 1.0},
            "shot": {"opp": None, "shots": [("test", 0, 12)], "threat": 0.0},
            "chase": {"opp": (50, 30), "shots": [], "threat": 0.0},
        }

        results = {}
        for name, inputs in channels.items():
            brain.reset(seed=64)
            trace = Trace(brain, types=["descending_neuron"], tau=0.1)
            for step in range(50):  # Reduced from 200 to 50 for fetch handler timeout
                inject = self.eyes.inject(opp=inputs["opp"], shots=inputs["shots"],
                                          threat=inputs["threat"])
                fired = brain.step(inject=inject)
                trace.observe(fired)
            activity = trace.features()
            results[name] = {
                "mean_activity": float(np.mean(activity)),
                "max_activity": float(np.max(activity)),
                "active_neurons": int(np.sum(activity > 0)),
            }

        return {"status": "verified", "channels": results}

    async def fetch(self, request):
        """Manual trigger, status check, retrain, or verify."""
        url = request.url
        # Extract connectome_id from URL path or query param
        if not self.connectome_id:
            # Check query param first
            if "?" in url:
                query = url.split("?")[1]
                for param in query.split("&"):
                    if param.startswith("cid="):
                        self.connectome_id = param.split("=")[1]
                        break
            # Then check URL path
            if not self.connectome_id:
                parts = url.rstrip("/").split("/")
                for p in parts:
                    if p in ALL_CONNECTOMES:
                        self.connectome_id = p
                        break
        if url.endswith("/trigger") or "/trigger?" in url:
            # Initialize and process tokens synchronously
            try:
                await self._ensure_brain()
                cursor = await self.env.DB.prepare(
                    "SELECT address, symbol, launchpad, score, score_reasons FROM tokens "
                    "WHERE ignored = 0 AND score > 30 ORDER BY score DESC LIMIT 3"
                ).all()
                signals_made = 0
                for token in cursor.results or []:
                    decision = await self._evaluate_token(token)
                    await self._store_signal(token, decision)
                    signals_made += 1
                # Set alarm for next cycle
                await self.ctx.storage.setAlarm(int(time.time() * 1000) + 60_000)
                return Response.json({"status": "ok", "initialized": self.initialized, "signals": signals_made})
            except Exception as e:
                # Don't set alarm if init failed — prevents crash loop
                if "exceed Python Worker memory limit" in str(e):
                    return Response.json({"status": "skipped", "reason": str(e), "initialized": False})
                try:
                    await self._log_error(f"trigger failed: {e}")
                except Exception:
                    pass
                return Response.json({"status": "error", "error": str(e), "initialized": self.initialized})
        elif "/r2test" in url:
            # Diagnostic: test R2 access
            try:
                obj = await self.env.WEIGHTS.get("celegans/weights.npz")
                if obj is None:
                    return Response.json({"r2": "object not found"})
                size = obj.size
                return Response.json({"r2": "ok", "size": size})
            except Exception as e:
                return Response.json({"r2": "error", "error": str(e)})
        elif "/clear" in url:
            # Clear alarm — useful for stopping crash loops
            await self.ctx.storage.deleteAlarm()
            return Response.json({"status": "alarm_cleared"})
        elif "/retrain" in url:
            result = await self._retrain()
            return Response.json(result)
        elif "/verify" in url:
            await self._ensure_brain()
            result = await self._verify()
            return Response.json(result)
        elif "/status" in url:
            return Response.json({
                "initialized": self.initialized,
                "n_neurons": self.brain.n if self.brain else 0,
                "n_synapses": len(self.brain.data) if self.brain else 0,
                "n_groups": len(self.brain.groups) if self.brain else 0,
                "groups": list(self.brain.groups.keys()) if self.brain else [],
                "readout_loaded": self.readout is not None,
                "readout_cv_score": float(self.readout.cv_score) if self.readout else None,
                "encoder_loaded": self.encoder_w_az is not None,
                "eyes_loaded": self.eyes is not None,
            })
        return Response.json({"error": "unknown endpoint"})


class Default(WorkerEntrypoint):
    """Entry point — routes requests to the correct Connectome DO.

    URL path determines which connectome DO to use:
      /<connectome_id>/trigger  -> e.g. /celegans/trigger
      /<connectome_id>/status
      /trigger                  -> defaults to malecns (backward compat)
    """

    async def fetch(self, request):
        url = request.url
        path = url.rstrip("/").split("/")
        
        # Handle /all/trigger — trigger all 16 connectomes
        if "all" in path and "trigger" in path:
            results = []
            for cid in ALL_CONNECTOMES:
                do_id = self.env.FLY_BRAIN.idFromName(f"connectome:{cid}")
                do_stub = self.env.FLY_BRAIN.get(do_id)
                try:
                    # Pass connectome_id as query param
                    trigger_url = f"https://do/{cid}/trigger?cid={cid}"
                    await do_stub.fetch(trigger_url)
                    results.append({"connectome": cid, "status": "triggered"})
                except Exception as e:
                    results.append({"connectome": cid, "status": "error", "error": str(e)})
            return Response.json({"status": "alarm_set", "results": results})
        
        # Extract connectome_id from URL path or default to malecns
        connectome_id = "malecns"  # backward compat
        for p in path:
            if p in ALL_CONNECTOMES:
                connectome_id = p
                break
        
        # Also check query params
        if "?" in url:
            query = url.split("?")[1]
            for param in query.split("&"):
                if param.startswith("cid="):
                    connectome_id = param.split("=")[1]
        
        do_id = self.env.FLY_BRAIN.idFromName(f"connectome:{connectome_id}")
        do_stub = self.env.FLY_BRAIN.get(do_id)
        # Pass connectome_id as query param so the DO can extract it
        do_url = request.url + (f"&cid={connectome_id}" if "?" in request.url else f"?cid={connectome_id}")
        return await do_stub.fetch(do_url)

    async def scheduled(self, event):
        """Cron trigger — kick all 16 connectome DOs."""
        for cid in ALL_CONNECTOMES:
            do_id = self.env.FLY_BRAIN.idFromName(f"connectome:{cid}")
            do_stub = self.env.FLY_BRAIN.get(do_id)
            try:
                await do_stub.fetch("https://do/trigger")
            except Exception:
                pass  # Some connectomes may not have weights yet

# Backward-compatible alias
FlyBrainDO = ConnectomeDO
