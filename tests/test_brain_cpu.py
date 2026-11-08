"""pytest tests/test_brain_cpu.py -- FlyBrain dynamics on CPU, on the synthetic fixture brain (conftest.py)."""
import numpy as np
import pytest

from conftest import A, B, DNP01, INH, LC4, N, PHOTO, SENS


def run_steps(brain, steps, **step_kwargs):
    return [set(brain.step(**step_kwargs).tolist()) for _ in range(steps)]


def test_loads_fixture_and_finds_cells(make_brain):
    brain = make_brain()
    assert brain.n == N and brain.device == "cpu"
    assert set(brain.cells(["LC4"], side="L")) == set(LC4["L"])
    assert set(brain.cells(["descending_neuron"])) == set(DNP01.values())     # by superclass
    assert set(brain.cells(["LC4", "DNp01"], side="R")) == {*LC4["R"], DNP01["R"]}
    assert len(brain.cells(["no-such-type"])) == 0
    assert set(brain.groups) == {"escape_L", "escape_R"}


def test_silent_network_stays_silent(make_brain):
    """Tonic drive alone settles below threshold (0.14 / (1 - e^-0.2) = 0.77)."""
    brain = make_brain(noise=False)
    assert all(not f for f in run_steps(brain, 300))
    assert float(brain.v.max()) < 1.0


def test_stimulated_neuron_fires_and_drives_its_target(make_brain):
    brain = make_brain(noise=False)
    brain.stimulate([A], 1.5)
    first, second, third = run_steps(brain, 3)
    assert first == {A}
    assert second == {B, SENS}          # A -> B, A -> SENS, one step later
    assert third == set()


def test_weak_stimulus_does_not_fire(make_brain):
    brain = make_brain(noise=False)
    brain.stimulate([A], 0.5)
    assert all(not f for f in run_steps(brain, 5))


def test_inhibition_cancels_excitation(make_brain):
    brain = make_brain(noise=False)
    brain.stimulate([A, INH], 1.5)
    first, second = run_steps(brain, 2)
    assert first == {A, INH}
    assert B not in second and SENS in second


def test_escape_pathway_is_side_specific(make_brain):
    brain = make_brain(noise=False)
    fired = run_steps(brain, 4, inject=[(LC4["L"], 1.5)])
    assert any(DNP01["L"] in f for f in fired)
    assert not any(DNP01["R"] in f for f in fired)


def test_reset_silences_everything(make_brain):
    brain = make_brain(noise=False)
    brain.stimulate([A], 1.5)
    brain.step()
    brain.reset(1)
    assert brain.steps == 0 and len(brain.fired) == 0 and float(np.abs(brain.v).max()) == 0.0
    assert not brain.step().size       # A's spike before the reset does not reach B


def test_same_seed_same_spikes_different_seed_different(make_brain):
    brain = make_brain()
    brain.noise_amp = 0.5              # tonic 0.77 + 0.5 crosses threshold: noise alone makes spikes

    def spikes(seed):
        brain.reset(seed)
        return [sorted(f) for f in run_steps(brain, 200)]

    a, b, c = spikes(7), spikes(7), spikes(8)
    assert sum(map(len, a)) > 20
    assert a == b
    assert a != c


def test_batch_flies_are_independent(make_brain):
    brain = make_brain(noise=False, batch=3)
    brain.stimulate([A], [1.5, 0.0, 1.5])       # one amount per fly
    fired = brain.step()
    assert isinstance(fired, list) and len(fired) == 3
    assert [set(f.tolist()) for f in fired] == [{A}, set(), {A}]
    fired = brain.step()
    assert [set(f.tolist()) for f in fired] == [{B, SENS}, set(), {B, SENS}]


def test_sensory_input_false_cuts_synapses_onto_sensory_neurons(make_brain):
    brain = make_brain(noise=False, sensory_input=False)
    brain.stimulate([A], 1.5)
    run_steps(brain, 1)
    assert run_steps(brain, 1)[0] == {B}       # SENS (cb_sensory) no longer hears A


def test_eye_drive_reaches_photoreceptors(make_brain):
    brain = make_brain(noise=False)
    drive = np.zeros(len(PHOTO), np.float32)
    drive[:6] = 1.0                              # left eye only, every step
    fired = run_steps(brain, 10, eye_drive=drive)
    seen = set().union(*fired)
    assert set(PHOTO[:6]) <= seen
    assert not seen & set(PHOTO[6:])


def test_refractory_period_caps_firing(make_brain):
    held = make_brain(noise=False, refractory=0.1)            # 5 steps at 20 ms
    free = make_brain(noise=False)
    counts = []
    for brain in (held, free):
        fired = run_steps(brain, 30, inject=[([A], 1.5)])
        counts.append(sum(A in f for f in fired))
    assert counts[1] == 30
    assert counts[0] <= 30 // 5 + 1


def test_dt_rescales_tonic_to_the_same_resting_voltage(make_brain):
    rest = []
    for dt in (0.020, 0.005):
        brain = make_brain(noise=False, dt=dt)
        run_steps(brain, int(3.0 / dt))
        rest.append(float(brain.v[A, 0]))
    assert rest[0] == pytest.approx(rest[1], rel=1e-3)
    assert 0.7 < rest[0] < 0.8


def test_bad_device_is_rejected(brain_dir):
    from flybrain import FlyBrain
    with pytest.raises(ValueError):
        FlyBrain(data=brain_dir, device="tpu")
