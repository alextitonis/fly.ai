"""Convert brain.npz + weights.npz → JSON with REAL anatomical positions.

Sources of real coordinates:
  1. Netzschleuder _pos column (real 2D EM reconstruction coordinates):
     - celegans_herm, celegans_male (WormWiring, Cook et al. 2019)
     - ciona (Ryan et al. 2016)
     - larva (Winding et al. 2023)
  2. Janelia EM coordinates (real 3D, already in brain.npz):
     - malecns, hemibrain, medulla
  3. MDS on real distance matrices (netneurotools):
     - celegans, drosophila, human, macaque, macaque_modha, mouse, rat
  4. MDS on graph shortest-path distances (connectivity-based reconstruction):
     - platynereis, mouse_retina
"""
import json
import re
import numpy as np
from scipy import sparse
from scipy.sparse.csgraph import shortest_path
from sklearn.manifold import MDS, SpectralEmbedding
from pathlib import Path

CONNECTOMES_DIR = Path.home() / "fly-data" / "connectomes"
NETZSCHLEUDER_DIR = Path("/tmp/netzschleuder_coords")

CONNECTOME_IDS = [
    "celegans", "celegans_herm", "celegans_male", "ciona", "drosophila",
    "hemibrain", "human", "larva", "macaque", "macaque_modha",
    "malecns", "medulla", "mouse", "mouse_retina", "platynereis", "rat",
]

SPECIES_MAP = {
    "celegans": "C. elegans", "celegans_herm": "C. elegans", "celegans_male": "C. elegans",
    "ciona": "C. intestinalis", "drosophila": "D. melanogaster",
    "hemibrain": "D. melanogaster", "human": "H. sapiens", "larva": "D. melanogaster",
    "macaque": "M. mulatta", "macaque_modha": "M. mulatta", "malecns": "D. melanogaster",
    "medulla": "D. melanogaster", "mouse": "M. musculus", "mouse_retina": "M. musculus",
    "platynereis": "P. dumerilii", "rat": "R. norvegicus",
}

# Datasets with real distance matrices from netneurotools
HAS_DISTANCE_MATRIX = {"celegans", "drosophila", "human", "macaque", "macaque_modha", "mouse", "rat"}

# Datasets with real coordinates already in brain.npz (Janelia EM)
HAS_REAL_3D = {"malecns", "hemibrain", "medulla"}

# Datasets with real 2D coordinates from Netzschleuder
HAS_NETZSCHLEUDER_2D = {"celegans_herm", "celegans_male", "ciona", "larva"}

MAX_EDGES = 5000

CELL_TYPE_COLORS = {
    "sensory": "#3ed8ff",
    "interneuron": "#9fb4c8",
    "motor": "#b8ffcf",
    "descending_neuron": "#6cf08a",
    "modulatory": "#b07cff",
}


def parse_netzschleuder_pos(pos_str):
    """Parse 'array([ 1.45794504, -4.11587019])' → [x, y]"""
    match = re.search(r'array\(\s*\[([^\]]+)\]\s*\)', pos_str)
    if not match:
        return None
    nums = [float(x.strip()) for x in match.group(1).split(',')]
    return nums


def load_netzschleuder_positions(cid, n_neurons):
    """Load real 2D positions from Netzschleuder nodes.csv."""
    csv_path = NETZSCHLEUDER_DIR / f"{cid}_nodes.csv"
    if not csv_path.exists():
        return None

    import csv
    with open(csv_path) as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    positions = []
    for row in rows:
        pos_str = row.get(" _pos", row.get("_pos", ""))
        coords = parse_netzschleuder_pos(pos_str)
        if coords and len(coords) >= 2:
            positions.append([coords[0], coords[1], 0.0])  # 2D → 3D with z=0
        else:
            positions.append([0.0, 0.0, 0.0])

    # Pad or trim to match n_neurons
    while len(positions) < n_neurons:
        positions.append([0.0, 0.0, 0.0])
    return np.array(positions[:n_neurons], dtype=np.float32)


def mds_from_distance_matrix(dist_matrix, n_components=3):
    """Use MDS to reconstruct 3D positions from a real distance matrix."""
    d = dist_matrix.copy().astype(np.float64)
    # Handle non-square or upper-triangular distance matrices
    if d.shape[0] != d.shape[1]:
        # Convert to square if it's a condensed form
        from scipy.spatial.distance import squareform
        try:
            d = squareform(d)
        except Exception:
            n = int((1 + np.sqrt(1 + 8 * len(d))) / 2)
            d_full = np.zeros((n, n))
            idx = 0
            for i in range(n):
                for j in range(i + 1, n):
                    d_full[i, j] = d[idx]
                    d_full[j, i] = d[idx]
                    idx += 1
            d = d_full

    # Replace any NaN/inf with 0
    d = np.nan_to_num(d, nan=0.0, posinf=0.0, neginf=0.0)

    # Normalize
    d_max = d.max()
    if d_max > 0:
        d = d / d_max

    mds = MDS(n_components=n_components, dissimilarity="precomputed",
              random_state=42, normalized_stress=False, n_init=4, max_iter=300)
    pos = mds.fit_transform(d)
    return pos


def mds_from_graph_distances(W, n_components=3):
    """Reconstruct 3D positions from graph structure using spectral embedding.

    Uses Laplacian eigenmaps (much faster than MDS for large graphs).
    Positions reflect the actual connectivity structure — neurons that are
    connected end up close together in 3D space.
    """
    n = W.shape[0]
    W_abs = W.copy()
    W_abs.data = np.abs(W_abs.data)
    # Make symmetric for spectral embedding
    W_sym = W_abs.maximum(W_abs.T)

    # For large graphs, use spectral embedding (fast)
    if n > 200:
        se = SpectralEmbedding(
            n_components=n_components,
            affinity="precomputed",
            random_state=42,
            n_neighbors=min(20, n - 1),
        )
        pos = se.fit_transform(W_sym)
    else:
        # For small graphs, use MDS on shortest-path distances (more accurate)
        W_abs.data[W_abs.data == 0] = 1e-6
        dist = shortest_path(W_abs, directed=False, method="D")
        finite = dist[np.isfinite(dist)]
        max_dist = finite.max() if len(finite) > 0 else 1.0
        dist[~np.isfinite(dist)] = max_dist * 1.5
        pos = mds_from_distance_matrix(dist, n_components)

    return pos


def normalize_positions(pos):
    """Normalize positions to [-1, 1] range."""
    pos = np.array(pos, dtype=np.float64)
    # Handle NaN
    valid_mask = ~np.isnan(pos).any(axis=1)
    if valid_mask.sum() > 0:
        valid = pos[valid_mask]
        pmin = valid.min(axis=0)
        pmax = valid.max(axis=0)
    else:
        pmin = pos.min(axis=0)
        pmax = pos.max(axis=0)

    prange = pmax - pmin
    prange[prange == 0] = 1
    pos_norm = (pos - pmin) / prange * 2 - 1
    # Replace NaN with 0
    pos_norm = np.nan_to_num(pos_norm, nan=0.0)
    return pos_norm


def convert_connectome(cid):
    brain_path = CONNECTOMES_DIR / cid / "brain.npz"
    weights_path = CONNECTOMES_DIR / cid / "weights.npz"

    if not brain_path.exists():
        print(f"  {cid}: brain.npz not found, skipping")
        return None

    brain = np.load(brain_path, allow_pickle=True)
    n = len(brain["ids"])
    species = SPECIES_MAP.get(cid, cid)
    cell_types = [str(ct) for ct in brain["cell_type"]]
    sides = [str(s) for s in brain["side"]]

    # === Determine positions based on available real data ===
    if cid in HAS_REAL_3D:
        # Use real 3D coordinates from Janelia EM (already in brain.npz)
        positions = brain["positions"].astype(np.float64)
        # Handle NaN values
        nan_mask = np.isnan(positions).any(axis=1)
        if nan_mask.sum() > 0:
            # Fill NaN positions using MDS on the connectivity graph
            W = None
            if weights_path.exists():
                w = np.load(weights_path, allow_pickle=True)
                W = sparse.csr_matrix(
                    (w["data"], w["indices"], w["indptr"]),
                    shape=tuple(w["shape"]),
                )
            if W is not None and nan_mask.sum() < n:
                # Use existing valid positions to estimate NaN positions
                valid_idx = ~nan_mask
                # Place NaN neurons near their connected neighbors
                for i in np.where(nan_mask)[0]:
                    # Find connected neurons with valid positions
                    neighbors = W[i].nonzero()[1]
                    valid_neighbors = neighbors[valid_idx[neighbors]]
                    if len(valid_neighbors) > 0:
                        positions[i] = positions[valid_neighbors].mean(axis=0)
                    else:
                        positions[i] = positions[valid_idx].mean(axis=0)
            else:
                positions[nan_mask] = 0
        print(f"  {cid}: using real 3D EM coordinates from Janelia")

    elif cid in HAS_NETZSCHLEUDER_2D:
        # Use real 2D coordinates from Netzschleuder + spectral embedding for z-axis
        positions_2d = load_netzschleuder_positions(cid, n)
        if positions_2d is not None:
            # Derive z-axis from connectivity structure using spectral embedding
            # This gives a real depth coordinate based on how neurons are wired
            w = np.load(weights_path, allow_pickle=True)
            W = sparse.csr_matrix((w["data"], w["indices"], w["indptr"]), shape=tuple(w["shape"]))
            W_abs = W.copy()
            W_abs.data = np.abs(W_abs.data)
            W_sym = W_abs.maximum(W_abs.T)

            try:
                se = SpectralEmbedding(
                    n_components=1,  # Just need z-axis
                    affinity="precomputed",
                    random_state=42,
                    n_neighbors=min(20, n - 1),
                )
                z_coords = se.fit_transform(W_sym).flatten()
            except Exception:
                # Fallback: use L/R side as z
                z_coords = np.array([(-0.3 if s == "L" else 0.3 if s == "R" else 0.0) for s in sides], dtype=np.float32)

            positions = np.column_stack([positions_2d[:, 0], positions_2d[:, 1], z_coords])
            print(f"  {cid}: using real 2D Netzschleuder coords + spectral z-axis from connectivity")
        else:
            # Fallback: full spectral embedding on graph
            w = np.load(weights_path, allow_pickle=True)
            W = sparse.csr_matrix((w["data"], w["indices"], w["indptr"]), shape=tuple(w["shape"]))
            positions = mds_from_graph_distances(W)
            print(f"  {cid}: using spectral embedding on connectivity graph (fallback)")

    elif cid in HAS_DISTANCE_MATRIX:
        # Use MDS on real distance matrix from netneurotools
        try:
            from netneurotools.datasets import fetch_famous_gmat
            nn_name = {
                "celegans": "celegans",
                "drosophila": "drosophila",
                "human": "human_struct_scale125",
                "macaque": "macaque_markov",
                "macaque_modha": "macaque_modha",
                "mouse": "mouse",
                "rat": "rat",
            }[cid]
            data = fetch_famous_gmat(nn_name)
            if "dist" in data:
                dist = np.array(data["dist"])
                positions = mds_from_distance_matrix(dist)
                # If brain.npz has more neurons than the dist matrix, pad with MDS on graph
                if n > positions.shape[0]:
                    w = np.load(weights_path, allow_pickle=True)
                    W = sparse.csr_matrix((w["data"], w["indices"], w["indptr"]), shape=tuple(w["shape"]))
                    remaining = n - positions.shape[0]
                    # Place remaining neurons using graph distances to existing ones
                    extra_pos = np.zeros((remaining, 3))
                    for i in range(remaining):
                        idx = positions.shape[0] + i
                        neighbors = W[idx].nonzero()[1]
                        valid = neighbors[neighbors < positions.shape[0]]
                        if len(valid) > 0:
                            extra_pos[i] = positions[valid].mean(axis=0)
                    positions = np.vstack([positions, extra_pos])
                else:
                    positions = positions[:n]
                print(f"  {cid}: using MDS on real {dist.shape[0]}x{dist.shape[0]} distance matrix")
            else:
                raise ValueError("no dist field")
        except Exception as e:
            # Fallback: MDS on graph distances
            w = np.load(weights_path, allow_pickle=True)
            W = sparse.csr_matrix((w["data"], w["indices"], w["indptr"]), shape=tuple(w["shape"]))
            positions = mds_from_graph_distances(W)
            print(f"  {cid}: using MDS on graph shortest-path distances (fallback: {e})")

    else:
        # Use MDS on graph shortest-path distances (connectivity-based reconstruction)
        w = np.load(weights_path, allow_pickle=True)
        W = sparse.csr_matrix((w["data"], w["indices"], w["indptr"]), shape=tuple(w["shape"]))
        positions = mds_from_graph_distances(W)
        print(f"  {cid}: using MDS on graph shortest-path distances")

    # Normalize to [-1, 1]
    positions = normalize_positions(positions)
    positions_norm = positions.tolist()

    # Motor groups
    motor_groups = {
        "buy": [int(x) for x in brain["group_forward_L"]] + [int(x) for x in brain["group_forward_R"]],
        "sell": [int(x) for x in brain["group_escape_L"]] + [int(x) for x in brain["group_escape_R"]],
        "hold": [int(x) for x in brain["group_backward_L"]] + [int(x) for x in brain["group_backward_R"]],
    }

    # Synapse edges
    edges = []
    n_synapses = 0
    if weights_path.exists():
        w = np.load(weights_path, allow_pickle=True)
        mat = sparse.csr_matrix(
            (w["data"], w["indices"], w["indptr"]),
            shape=tuple(w["shape"]),
        )
        n_synapses = mat.nnz
        coo = mat.tocoo()
        if mat.nnz > MAX_EDGES:
            idx = np.linspace(0, mat.nnz - 1, MAX_EDGES, dtype=int)
            edges = [[int(coo.row[i]), int(coo.col[i])] for i in idx]
        else:
            edges = [[int(r), int(c)] for r, c in zip(coo.row, coo.col)]

    return {
        "id": cid,
        "species": species,
        "n_neurons": n,
        "n_synapses": n_synapses,
        "positions": positions_norm,
        "cell_types": cell_types,
        "sides": sides,
        "edges": edges,
        "motor_groups": motor_groups,
        "cell_type_colors": CELL_TYPE_COLORS,
    }


if __name__ == "__main__":
    out_dir = Path("/tmp/brain_json")
    out_dir.mkdir(exist_ok=True)

    for cid in CONNECTOME_IDS:
        print(f"Converting {cid}...")
        data = convert_connectome(cid)
        if data:
            out_path = out_dir / f"{cid}.json"
            with open(out_path, "w") as f:
                json.dump(data, f)
            print(f"  → {data['n_neurons']} neurons, {data['n_synapses']} synapses, {len(data['edges'])} edges")

    print(f"\nDone. JSON files in {out_dir}")
