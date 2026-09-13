"""Convert 16 real connectomes to the NPZ format expected by the worker.

Sources (all real published connectome data):
  - netneurotools.datasets.fetch_famous_gmat: celegans, drosophila, human,
    macaque_markov, macaque_modha, mouse, rat
  - ChrisWLynn/Heavy_tailed_connectivity: hemibrain, medulla, mouse_retina,
    platynereis (edge-list CSVs)
  - Netzschleuder (networks.skewed.de): ciona, larva, celegans_herm, celegans_male
  - Existing MaleCNS: malecns (Berg et al. 2025)

Output: /home/terex/fly-data/connectomes/<id>/{weights.npz,brain.npz}
"""
import os
import shutil
import numpy as np
import pandas as pd
from scipy import sparse
from pathlib import Path

OUT = Path(os.environ.get("FLY_DATA", str(Path.home() / "fly-data"))) / "connectomes"
SRC = Path(__file__).parent

# 16 real connectomes
CONNECTOMES = [
    # (id, species, source_type, description)
    ("celegans",       "C. elegans",         "netneurotools", "Varshney et al. 2011"),
    ("drosophila",     "D. melanogaster",    "netneurotools", "Chiang et al. 2011"),
    ("human",          "H. sapiens",         "netneurotools", "Griffa et al. 2019 (scale125)"),
    ("macaque",        "M. mulatta",         "netneurotools", "Markov et al. 2013"),
    ("macaque_modha",  "M. mulatta",         "netneurotools", "Modha & Singh 2010"),
    ("mouse",          "M. musculus",        "netneurotools", "Rubinov et al. 2015"),
    ("rat",            "R. norvegicus",      "netneurotools", "Bota et al. 2015"),
    ("malecns",        "D. melanogaster",    "existing",      "Berg et al. 2025 MaleCNS v1.0"),
    ("hemibrain",      "D. melanogaster",    "edgelist",      "Scheffer et al. 2020 hemibrain"),
    ("medulla",        "D. melanogaster",    "edgelist",      "Takemura et al. 2013 medulla"),
    ("mouse_retina",   "M. musculus",        "edgelist",      "Helmstaedter et al. 2013 retina"),
    ("platynereis",    "P. dumerilii",       "edgelist",      "Randel et al. 2014"),
    ("ciona",          "C. intestinalis",    "netzschleuder", "Ryan et al. 2016"),
    ("larva",          "D. melanogaster",    "netzschleuder", "Drosophila larva 2023"),
    ("celegans_herm",  "C. elegans",         "netzschleuder", "Cook et al. 2019 hermaphrodite"),
    ("celegans_male",  "C. elegans",         "netzschleuder", "Cook et al. 2019 male"),
]


def load_from_netneurotools(name):
    """Load a connectome from netneurotools.datasets.fetch_famous_gmat."""
    from netneurotools.datasets import fetch_famous_gmat
    data = fetch_famous_gmat(name)
    conn = np.array(data["conn"], dtype=np.float32)
    labels = np.array(data["labels"], dtype=str)
    # Binarize weights to signed ±1 based on sign
    conn_signed = np.where(conn != 0, np.sign(conn), 0).astype(np.float32)
    W = sparse.csr_matrix(conn_signed)
    return W, labels, data.get("dist", None)


def load_from_edgelist(csv_path, has_weight=True):
    """Load a connectome from a 3-column edge list CSV (pre, post, weight)."""
    df = pd.read_csv(csv_path, header=None, names=["pre", "post", "weight"] if has_weight else ["pre", "post"])
    if not has_weight:
        df["weight"] = 1.0
    # Determine number of nodes
    n = int(max(df["pre"].max(), df["post"].max())) + 1
    pre = df["pre"].to_numpy(dtype=np.int32)
    post = df["post"].to_numpy(dtype=np.int32)
    w = df["weight"].to_numpy(dtype=np.float32)
    # Normalize weights to [-1, 1]
    w_max = np.abs(w).max()
    if w_max > 0:
        w = w / w_max
    W = sparse.coo_matrix((w, (post, pre)), shape=(n, n)).tocsr()
    W.sum_duplicates()
    labels = np.array([f"n{i}" for i in range(n)], dtype=str)
    return W, labels, None


def load_from_netzschleuder(data_dir):
    """Load a connectome from Netzschleuder CSV format (edges.csv + nodes.csv)."""
    edges = pd.read_csv(data_dir / "edges.csv", comment="#")
    nodes = pd.read_csv(data_dir / "nodes.csv", comment="#")
    # Determine n from max index in edges (nodes.csv header consumes first data row)
    src_col = "source" if "source" in edges.columns else edges.columns[0]
    tgt_col = "target" if "target" in edges.columns else edges.columns[1]
    n = int(max(edges[src_col].max(), edges[tgt_col].max())) + 1
    weight_col = None
    for c in edges.columns:
        if c not in (src_col, tgt_col) and c not in ("etype",):
            weight_col = c
            break
    pre = edges[src_col].to_numpy(dtype=np.int32)
    post = edges[tgt_col].to_numpy(dtype=np.int32)
    if weight_col:
        w = edges[weight_col].to_numpy(dtype=np.float32)
    else:
        w = np.ones(len(pre), dtype=np.float32)
    # Normalize
    w_max = np.abs(w).max()
    if w_max > 0:
        w = w / w_max
    W = sparse.coo_matrix((w, (post, pre)), shape=(n, n)).tocsr()
    W.sum_duplicates()
    # Extract labels from nodes
    label_col = "name" if "name" in nodes.columns else nodes.columns[1] if len(nodes.columns) > 1 else nodes.columns[0]
    labels = nodes[label_col].astype(str).to_numpy()
    # Extract cell type if available
    cell_types = None
    for c in ["cell_type", "node_type", "type"]:
        if c in nodes.columns:
            cell_types = nodes[c].astype(str).to_numpy()
            break
    return W, labels, cell_types


def generate_brain_metadata(W, labels, cell_types=None, species="", seed=42):
    """Generate brain.npz metadata for a connectome."""
    n = W.shape[0]
    rng = np.random.default_rng(seed)

    # Cell types: use provided or infer from connectivity
    if cell_types is None:
        # Infer: nodes with high out-degree = motor, high in-degree = sensory, rest = interneuron
        out_deg = np.array(W.sum(axis=1)).flatten()
        in_deg = np.array(W.sum(axis=0)).flatten()
        cell_type_arr = np.full(n, "interneuron", dtype=object)
        sensory_thresh = np.percentile(in_deg[in_deg > 0], 75) if (in_deg > 0).any() else 0
        motor_thresh = np.percentile(out_deg[out_deg > 0], 75) if (out_deg > 0).any() else 0
        cell_type_arr[in_deg >= sensory_thresh] = "sensory"
        cell_type_arr[out_deg >= motor_thresh] = "motor"
        # Some descending neurons
        desc_mask = (out_deg > 0) & (in_deg > 0) & (out_deg >= motor_thresh * 0.5)
        cell_type_arr[desc_mask] = "descending_neuron"
    else:
        cell_type_arr = cell_types

    # Superclass
    superclass_map = {
        "sensory": "sensory", "interneuron": "interneuron", "motor": "motor",
        "descending_neuron": "descending", "modulatory": "modulatory",
        "PHARYNX": "pharynx", "MUSCLE": "muscle", "NEURON": "neuron",
    }
    superclass = np.array([superclass_map.get(c, "interneuron") for c in cell_type_arr], dtype=object)

    # Side (L/R) — random for now
    side = rng.choice(["L", "R", "center"], p=[0.4, 0.4, 0.2], size=n).astype(str)

    # Visual neurons (subset of sensory)
    sensory_idx = np.where(cell_type_arr == "sensory")[0]
    visual = sensory_idx[:min(len(sensory_idx), max(n // 10, 10))].astype(np.int32)
    azimuth = rng.uniform(-180, 180, len(visual)).astype(np.float32)

    # Positions (3D) — random for now
    positions = rng.normal(0, 100, (n, 3)).astype(np.float32)

    # Motor groups for BUY/SELL/HOLD readouts
    motor_idx = np.where(np.isin(cell_type_arr, ["motor", "descending_neuron"]))[0]
    if len(motor_idx) < 6:
        # Use highest out-degree neurons as motor
        top_motor = np.argsort(out_deg)[-min(12, n):]
        motor_idx = top_motor

    def pick_group(arr, count=2):
        if len(arr) >= count:
            return rng.choice(arr, count, replace=False).astype(np.int32)
        return arr.astype(np.int32) if len(arr) > 0 else np.array([0], dtype=np.int32)

    metadata = {
        "ids": np.arange(n, dtype=np.int64),
        "visual": visual,
        "azimuth": azimuth,
        "cell_type": np.array([str(c) for c in cell_type_arr], dtype="U47"),
        "side": np.array([str(s) for s in side], dtype="U7"),
        "positions": positions,
        "superclass": np.array([str(s) for s in superclass], dtype="U21"),
        "group_forward_L": pick_group(motor_idx, 2),
        "group_forward_R": pick_group(motor_idx, 2),
        "group_escape_L": pick_group(motor_idx, 2),
        "group_escape_R": pick_group(motor_idx, 2),
        "group_backward_L": pick_group(motor_idx, 2),
        "group_backward_R": pick_group(motor_idx, 2),
    }
    return metadata


def save_connectome(cid, W, labels, cell_types=None, species="", seed=42):
    """Save a connectome as weights.npz + brain.npz."""
    out_dir = OUT / cid
    out_dir.mkdir(parents=True, exist_ok=True)

    weights_path = out_dir / "weights.npz"
    brain_path = out_dir / "brain.npz"

    if weights_path.exists() and brain_path.exists():
        print(f"  {cid}: already exists, skipping")
        return

    # Save weights as CSR
    sparse.save_npz(str(weights_path), W)

    # Generate and save metadata
    metadata = generate_brain_metadata(W, labels, cell_types, species, seed)
    np.savez(str(brain_path), **metadata)

    print(f"  {cid}: {W.shape[0]} neurons, {W.nnz} synapses, saved")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    print("Converting 16 real connectomes to NPZ format...")

    for i, (cid, species, source_type, desc) in enumerate(CONNECTOMES):
        seed = hash(cid) % (2**32)
        print(f"\n[{i+1}/16] {cid} ({species}) — {desc}")

        try:
            if cid == "malecns":
                # Copy existing MaleCNS data
                out_dir = OUT / "malecns"
                out_dir.mkdir(parents=True, exist_ok=True)
                if not (out_dir / "weights.npz").exists():
                    shutil.copy2(str(Path.home() / "fly-data" / "weights.npz"), str(out_dir / "weights.npz"))
                    shutil.copy2(str(Path.home() / "fly-data" / "brain.npz"), str(out_dir / "brain.npz"))
                print(f"  malecns: copied from existing data")
                continue

            if source_type == "netneurotools":
                # Map our IDs to netneurotools dataset names
                nn_name = {
                    "celegans": "celegans",
                    "drosophila": "drosophila",
                    "human": "human_struct_scale125",
                    "macaque": "macaque_markov",
                    "macaque_modha": "macaque_modha",
                    "mouse": "mouse",
                    "rat": "rat",
                }[cid]
                W, labels, dist = load_from_netneurotools(nn_name)
                save_connectome(cid, W, labels, species=species, seed=seed)

            elif source_type == "edgelist":
                csv_map = {
                    "hemibrain": SRC / "heavy_tailed_connectivity" / "Drosophila_central_brain.csv",
                    "medulla": SRC / "heavy_tailed_connectivity" / "Drosophila_optic_medulla.csv",
                    "mouse_retina": SRC / "heavy_tailed_connectivity" / "Mouse_retina.csv",
                    "platynereis": SRC / "heavy_tailed_connectivity" / "Platynereis_sensory_motor.csv",
                }
                W, labels, _ = load_from_edgelist(csv_map[cid])
                save_connectome(cid, W, labels, species=species, seed=seed)

            elif source_type == "netzschleuder":
                data_map = {
                    "ciona": SRC / "ciona_data",
                    "larva": SRC / "fly_larva_data",
                    "celegans_herm": SRC / "celegans_2019_data",
                    "celegans_male": SRC / "celegans_male_data",
                }
                W, labels, cell_types = load_from_netzschleuder(data_map[cid])
                save_connectome(cid, W, labels, cell_types, species=species, seed=seed)

        except Exception as e:
            print(f"  ERROR: {e}")
            import traceback
            traceback.print_exc()

    # Summary
    print("\n=== Summary ===")
    for cid, species, _, desc in CONNECTOMES:
        wpath = OUT / cid / "weights.npz"
        if wpath.exists():
            W = sparse.load_npz(str(wpath))
            print(f"  {cid:15s} {W.shape[0]:7d} neurons, {W.nnz:10d} synapses — {desc}")


if __name__ == "__main__":
    main()
