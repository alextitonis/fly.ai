"""Benchmark flybrain.FlyBrain on this machine's CPU and (if CuPy finds one) NVIDIA GPU.

    pip install flybrain            # plus "flybrain[gpu]" for the GPU rows; psutil optional
    python scripts/bench_flybrain.py [--steps 50] [--device cpu|cuda|both] [--batches 1,8,32]

Reports, per device: brain load time, first-step time (numba compiles on CPU; CuPy loads its
kernels on GPU), ms per step at a low and a high spike load, ms per step at each batch size,
and peak memory. Ends with Markdown table rows you can paste into PACKAGE.md.

Spike loads:
  low  = the brain at rest: background noise only, nothing stimulated.
  high = +1.5 V injected every step into a fixed random 10% of all neurons (seed 0), which makes
         each of them fire every step, plus whatever they drive downstream.
Batch scaling uses the low load. Timings are wall clock, medians over --steps steps after
--warmup steps; GPU timings synchronise the device after every step.

The simulation code is not changed or tuned here; this only measures it.
"""
from __future__ import annotations

import argparse
import gc
import os
import platform
import sys
import time

import numpy as np


# ---- machine info ---------------------------------------------------------------------------

def cpu_name() -> str:
    try:
        if sys.platform == "win32":
            import winreg
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
            return winreg.QueryValueEx(key, "ProcessorNameString")[0].strip()
        if sys.platform == "darwin":
            import subprocess
            return subprocess.check_output(["sysctl", "-n", "machdep.cpu.brand_string"], text=True).strip()
        with open("/proc/cpuinfo") as f:
            for line in f:
                if line.startswith("model name"):
                    return line.split(":", 1)[1].strip()
    except Exception:                                                   # noqa: BLE001
        pass
    return platform.processor() or "unknown CPU"


def peak_rss_mb() -> float | None:
    """Peak resident memory of this process so far, in MB (None if it can't be read)."""
    try:
        import psutil
        info = psutil.Process().memory_info()
        peak = getattr(info, "peak_wset", None)                         # Windows
        if peak:
            return peak / 2**20
    except ImportError:
        pass
    if sys.platform == "win32":
        try:
            import ctypes
            from ctypes import wintypes

            class Counters(ctypes.Structure):
                _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD),
                            ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
                            ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t),
                            ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                            ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                            ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t)]
            c = Counters()
            c.cb = ctypes.sizeof(c)
            kernel32, psapi = ctypes.WinDLL("kernel32"), ctypes.WinDLL("psapi")
            kernel32.GetCurrentProcess.restype = wintypes.HANDLE          # a 64-bit pseudo-handle
            psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(Counters), wintypes.DWORD]
            if psapi.GetProcessMemoryInfo(kernel32.GetCurrentProcess(), ctypes.byref(c), c.cb):
                return c.PeakWorkingSetSize / 2**20
        except Exception:                                               # noqa: BLE001
            return None
        return None
    import resource
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return peak / 2**20 if sys.platform == "darwin" else peak / 2**10   # bytes on macOS, KB on Linux


def versions() -> dict:
    import numba
    import scipy
    import flybrain
    out = {"python": platform.python_version(), "flybrain": flybrain.__version__, "numpy": np.__version__,
           "scipy": scipy.__version__, "numba": numba.__version__}
    try:
        import cupy
        out["cupy"] = cupy.__version__
    except Exception:                                                   # noqa: BLE001
        pass
    return out


# ---- timing ---------------------------------------------------------------------------------

def time_steps(brain, steps: int, warmup: int, inject=()) -> tuple[float, float]:
    """(median ms per step, mean spikes per step per fly) over `steps` steps after `warmup`."""
    sync = (lambda: brain.xp.cuda.Device().synchronize()) if brain.device == "cuda" else (lambda: None)
    for _ in range(warmup):
        brain.step(inject=inject)
    sync()
    times, spikes = [], 0
    for _ in range(steps):
        t = time.perf_counter()
        fired = brain.step(inject=inject)
        sync()
        times.append(time.perf_counter() - t)
        spikes += sum(len(f) for f in fired) / brain.batch if isinstance(fired, list) else len(fired)
    return 1000 * float(np.median(times)), spikes / steps


def bench(device: str, steps: int, warmup: int, batches: list[int]) -> dict:
    from flybrain import FlyBrain

    r = {"device": device}
    t = time.perf_counter()
    brain = FlyBrain(device=device, seed=0)
    r["load_s"] = time.perf_counter() - t

    t = time.perf_counter()
    brain.step()
    if device == "cuda":
        brain.xp.cuda.Device().synchronize()
    r["first_step_s"] = time.perf_counter() - t

    r["low_ms"], r["low_spikes"] = time_steps(brain, steps, warmup)
    high = np.random.default_rng(0).choice(brain.n, brain.n // 10, replace=False)
    brain.reset(0)
    r["high_ms"], r["high_spikes"] = time_steps(brain, steps, warmup, inject=[(high, 1.5)])
    print(f"  [{device}] load {r['load_s']:.1f} s, first step {r['first_step_s']:.2f} s, "
          f"low {r['low_ms']:.2f} ms ({r['low_spikes']:.0f} spikes), "
          f"high {r['high_ms']:.2f} ms ({r['high_spikes']:.0f} spikes)", file=sys.stderr)
    del brain
    gc.collect()

    r["batch_ms"] = {}
    for b in batches:
        brain = FlyBrain(device=device, seed=0, batch=b)
        brain.step()                                                    # compile / warm the kernels for this shape
        n = max(5, steps // max(1, b // 4))                             # fewer steps for the big batches on CPU
        r["batch_ms"][b], _ = time_steps(brain, n if device == "cpu" else steps, warmup)
        print(f"  [{device}] batch {b}: {r['batch_ms'][b]:.2f} ms/step "
              f"({r['batch_ms'][b] / b:.2f} ms per fly)", file=sys.stderr)
        if device == "cuda":
            pool = brain.xp.get_default_memory_pool()
            r["gpu_pool_mb"] = max(r.get("gpu_pool_mb", 0), pool.total_bytes() / 2**20)
        del brain
        gc.collect()
        if device == "cuda":
            import cupy
            cupy.get_default_memory_pool().free_all_blocks()
    r["peak_rss_mb"] = peak_rss_mb()
    return r


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--steps", type=int, default=50, help="timed steps per measurement (default 50)")
    ap.add_argument("--warmup", type=int, default=10)
    ap.add_argument("--device", default="both", choices=["cpu", "cuda", "both"])
    ap.add_argument("--batches", default="1,8,32")
    args = ap.parse_args()
    batches = [int(b) for b in args.batches.split(",")]

    import numba
    from flybrain import cuda_available

    devices = ["cpu", "cuda"] if args.device == "both" else [args.device]
    if "cuda" in devices and not cuda_available():
        print("no CUDA GPU visible to CuPy; skipping the GPU rows", file=sys.stderr)
        devices.remove("cuda")

    gpu = "-"
    if "cuda" in devices:
        import cupy
        gpu = cupy.cuda.runtime.getDeviceProperties(0)["name"].decode()
    info = {"cpu": cpu_name(), "threads": numba.get_num_threads(), "os": f"{platform.system()} {platform.release()}",
            "gpu": gpu, **versions()}
    print("machine: " + ", ".join(f"{k} {v}" for k, v in info.items()), file=sys.stderr)

    results = []
    for d in devices:                                                   # one device at a time, CPU first
        results.append(bench(d, args.steps, args.warmup, batches))

    vers = ", ".join(f"{k} {info[k]}" for k in ("flybrain", "numpy", "numba", "cupy") if k in info)
    header = ("| hardware | device | threads | load (s) | first step (s) | ms/step low | ms/step high | "
              + " | ".join(f"batch {b} ms/step" for b in batches) + " | peak memory | versions |")
    print("\n" + header)
    print("|" + "---|" * (header.count("|") - 1))
    for r in results:
        hw = info["cpu"] if r["device"] == "cpu" else info["gpu"]
        mem = f"{r['peak_rss_mb']:,.0f} MB RAM" if r.get("peak_rss_mb") else "n/a"
        if r["device"] == "cuda":
            mem = f"{r['gpu_pool_mb']:,.0f} MB GPU pool"
        threads = info["threads"] if r["device"] == "cpu" else "-"
        print(f"| {hw}, {info['os']} | {r['device']} | {threads} | {r['load_s']:.1f} | {r['first_step_s']:.2f} | "
              f"{r['low_ms']:.2f} ({r['low_spikes']:,.0f} spk) | {r['high_ms']:.2f} ({r['high_spikes']:,.0f} spk) | "
              + " | ".join(f"{r['batch_ms'][b]:.2f}" for b in batches) + f" | {mem} | {vers} |")


if __name__ == "__main__":
    main()
