"""A tiny synthetic brain, so the CPU tests run without the ~260 MB MaleCNS download.

It is written in the same format `flybrain build` produces (brain.npz + weights.npz, rows of
the weight matrix = postsynaptic neurons) and loaded through the normal `FlyBrain(data=...)`
path, so the tests exercise the real loading code.

Layout (60 neurons):
    0..11   R1-6 photoreceptors (superclass ol_sensory), 6 per eye, azimuth -0.9..-0.1 / 0.1..0.9
    12..15  LC4, 2 per side (visual_projection)
    16..17  DNp01 L, R (descending_neuron); LC4 on each side excites its own side's DNp01 only
    18      A (cb_intrinsic)  -> 19 B  with weight +0.5  (gain 3 -> +1.5 V: B fires the next step)
    20      INH (cb_intrinsic) -> 19 B with weight -0.5  (B silenced if INH fires with A)
    21      SENS (cb_sensory), fed by A with weight +0.5 (removed when sensory_input=False)
    22..59  filler (cb_intrinsic), no synapses
"""
import numpy as np
import pytest
from scipy import sparse

N = 60
PHOTO = np.arange(12)
LC4 = {"L": np.array([12, 13]), "R": np.array([14, 15])}
DNP01 = {"L": 16, "R": 17}
A, B, INH, SENS = 18, 19, 20, 21


def write_brain(folder):
    cell_type = np.array(["filler"] * N, dtype="<U16")
    superclass = np.array(["cb_intrinsic"] * N, dtype="<U24")
    side = np.array([""] * N, dtype="<U2")

    cell_type[PHOTO] = "R1-6"
    superclass[PHOTO] = "ol_sensory"
    side[PHOTO[:6]], side[PHOTO[6:]] = "L", "R"
    azimuth = np.r_[np.linspace(-0.9, -0.1, 6), np.linspace(0.1, 0.9, 6)].astype(np.float32)
    for s in "LR":
        cell_type[LC4[s]] = "LC4"
        superclass[LC4[s]] = "visual_projection"
        side[LC4[s]] = s
        cell_type[DNP01[s]] = "DNp01"
        superclass[DNP01[s]] = "descending_neuron"
        side[DNP01[s]] = s
    cell_type[[A, B, INH]] = ["A", "B", "INH"]
    cell_type[SENS] = "SENS"
    superclass[SENS] = "cb_sensory"

    post, pre, w = [], [], []
    def connect(src, dst, weight):
        pre.append(src); post.append(dst); w.append(weight)
    for s in "LR":
        for lc in LC4[s]:
            connect(lc, DNP01[s], 0.5)          # both LC4s together: 2 * 0.5 * 3 = 3 V
    connect(A, B, 0.5)
    connect(INH, B, -0.5)
    connect(A, SENS, 0.5)
    for k, p in enumerate(PHOTO):              # photoreceptors -> their eye's LC4, weakly
        connect(p, LC4["L" if k < 6 else "R"][0], 0.05)
    W = sparse.csr_matrix((np.array(w, np.float32), (post, pre)), shape=(N, N))

    sparse.save_npz(folder / "weights.npz", W, compressed=False)
    np.savez(folder / "brain.npz", ids=np.arange(N, dtype=np.int64), visual=PHOTO.astype(np.int32),
             azimuth=azimuth, cell_type=cell_type, side=side, superclass=superclass,
             positions=np.zeros((N, 3), np.float32),
             group_escape_L=np.array([DNP01["L"]], np.int32), group_escape_R=np.array([DNP01["R"]], np.int32))
    return folder


@pytest.fixture(scope="session")
def brain_dir(tmp_path_factory):
    return write_brain(tmp_path_factory.mktemp("fixture-brain"))


@pytest.fixture
def make_brain(brain_dir):
    """make_brain(**kwargs) -> a CPU FlyBrain on the fixture. noise=False turns background noise off."""
    from flybrain import FlyBrain

    def make(noise=True, **kwargs):
        kwargs.setdefault("device", "cpu")
        brain = FlyBrain(data=brain_dir, **kwargs)
        if not noise:
            brain.noise_hz = 0.0
        return brain
    return make
