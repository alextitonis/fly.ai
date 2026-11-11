"""Train models and run batch jobs on the fly.ai compute network from Python.

Browser miners run the jobs; two of them must agree before a job counts, and you pay in $FLYAI only for jobs that
settled. Three things fit the fleet:

* ``evolve``: evolution strategies. You give a fitness (a built-in, or your own WebAssembly ``fitness(params) ->
  score``) and the number of parameters; miners score perturbations, the server takes the step. Only scores travel.
* ``train``: small neural nets (up to 1M parameters) trained on your data shards, DiLoCo style: each miner takes
  K local Adam steps on one shard, the server averages the weight changes. The built-in MLP, or your own model as a
  WebAssembly train step.
* ``complete``: batch text generation with small open models (Qwen2.5 0.5B/1.5B, Llama 3.2 1B) on miners' GPUs.

Quick start::

    from flyai_compute import Fleet, mlp, sphere

    fleet = Fleet()
    run = fleet.evolve(fitness=sphere(target=[1, 2, 3]), dim=3, generations=50, wallet="0xYOU")
    print(run.pay_link)          # open it, pay in $FLYAI with your wallet; the run starts by itself
    for point in run.watch():    # one dict per generation
        print(point["step"], point["center"])
    theta = run.theta()          # the parameters, a list of floats (a numpy array if numpy is installed)

No dependencies beyond the standard library; numpy is used when it's there.
"""

from .client import ApiError, Fleet, Order, Run
from .data import decode_shard, encode_shard
from .specs import brain, mlp, rastrigin, replay, sphere, wasm, wasm_model

__all__ = [
    "ApiError", "Fleet", "Order", "Run", "encode_shard", "decode_shard",
    "sphere", "rastrigin", "brain", "replay", "wasm", "mlp", "wasm_model",
]
__version__ = "0.1.0"
