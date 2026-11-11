"""Building blocks for run specs: fitness functions and models. Each returns the plain dict the server takes.

Uploads (WebAssembly modules, replay data) are given as paths or bytes here; ``Fleet`` uploads them for you.
"""

from typing import Any, Dict, List, Optional, Sequence, Union

PathOrBytes = Union[str, bytes]


def sphere(target: Optional[Sequence[float]] = None) -> Dict[str, Any]:
    """-(sum of squared distances to target): a smoke test, best is 0."""
    return {"builtin": "sphere", **({"target": list(target)} if target is not None else {})}


def rastrigin(target: Optional[Sequence[float]] = None) -> Dict[str, Any]:
    """The Rastrigin function (many local optima), negated: best is 0 at the target."""
    return {"builtin": "rastrigin", **({"target": list(target)} if target is not None else {})}


def wasm(path_or_bytes: PathOrBytes) -> Dict[str, Any]:
    """Your own fitness as WebAssembly (see mine/examples/es-cartpole): input u32 episode, u32 dim, f64 params[dim];
    output one f64 score. It must be deterministic: the same input, the same 8 bytes."""
    return {"wasm": path_or_bytes}


def brain(inputs: List[Dict[str, Any]], targets: List[Dict[str, Any]], steps: int = 150, gain: float = 3,
          tonic: float = 0.14, cost: float = 0) -> Dict[str, Any]:
    """The fly connectome as the fitness: one parameter per input group (its drive, -2..2 volts a step), and the
    score adds weight x spikes of the target cells (descending or wing motor neurons).

        brain(inputs=[{"types": ["LC4"]}, {"types": ["LPLC2"]}], targets=[{"types": ["DNp01"], "weight": 1}])
    """
    return {"builtin": "brain", "inputs": inputs, "targets": targets, "steps": steps, "gain": gain, "tonic": tonic, "cost": cost}


def replay(data: PathOrBytes, rule: Dict[str, Any], keys: List[Dict[str, Any]], block: int = 96, fee: float = 0.003,
           usd: float = 2500, every: int = 64) -> Dict[str, Any]:
    """A trading rule replayed on recorded prices (fly.ai's desk format): the parameters are rule numbers squashed
    into [lo, hi]; the score is the log growth of the book on reshuffled paths (block = bars per shuffled block)."""
    return {"builtin": "replay", "data": data, "setting": {"rule": rule, "fee": fee, "usd": usd, "every": every}, "keys": keys, "block": block}


def mlp(layers: Sequence[int], activation: str = "relu", loss: str = "xent") -> Dict[str, Any]:
    """The built-in MLP: layers [inputs, hidden..., outputs], ReLU (or tanh), cross-entropy (labels) or mse (floats)."""
    return {"mlp": {"layers": list(layers), "activation": activation, "loss": loss}}


def wasm_model(path_or_bytes: PathOrBytes, params: int) -> Dict[str, Any]:
    """Your own model as a WebAssembly train step (see mine/examples/train-logreg). Needs theta0 in Fleet.train."""
    return {"wasm": path_or_bytes, "params": params}
