"""
Training Loop
=============
Orchestrates the full continuous learning cycle:

  1. Check experience buffer has enough new labelled examples
  2. Build dataset from buffer
  3. Split train/eval
  4. Run fine-tuning pass
  5. Publish new adapter
  6. Mark experiences as used
  7. Log training run to buffer
  8. Sleep until next cycle

Run as a background process:
  python -m hermes_screener.training.training_loop --interval 3600

Or trigger a one-shot pass:
  python -m hermes_screener.training.training_loop --once

Cycle schedule:
  Default: every 1 hour
  Minimum new experiences required: 50 (configurable)
  Max training time per cycle: 30 min (then defers to next cycle)
"""

import argparse
import json
import logging
import time
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("training_loop")

DEFAULT_INTERVAL_S = 3600  # 1 hour
DEFAULT_MIN_NEW_EXP = 50  # minimum new experiences before training
DEFAULT_MAX_TRAIN_TIME = 1800  # 30 min max per cycle
STATE_FILE = Path.home() / ".hermes" / "data" / "training" / "loop_state.json"


def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            pass
    return {"last_run": 0, "total_cycles": 0, "total_examples_trained": 0}


def save_state(state: dict):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2))


def run_cycle(
    min_new_exp: int = DEFAULT_MIN_NEW_EXP,
    max_steps: int = -1,
    adapter_name: str | None = None,
    cfg_overrides: dict | None = None,
) -> dict:
    """
    Run one full training cycle. Returns result dict.
    """
    from .dataset_builder import DatasetBuilder
    from .experience_buffer import ExperienceBuffer
    from .fine_tuner import FineTuner
    from .model_updater import ModelUpdater

    t0 = time.time()
    buf = ExperienceBuffer()
    stats = buf.stats()
    logger.info(f"Buffer stats: {stats}")

    new_labelled = stats["with_reward"] - stats["trained"]
    logger.info(f"New labelled experiences available: {new_labelled}")

    if new_labelled < min_new_exp:
        return {
            "status": "skipped",
            "reason": f"only {new_labelled} new experiences (min={min_new_exp})",
            "stats": stats,
        }

    # Step 1: Build datasets
    logger.info("Building datasets...")
    builder = DatasetBuilder(buffer=buf)
    build_result = builder.build_all(limit=10_000)
    logger.info(f"Dataset build: {build_result['counts']}")

    combined_path = Path(build_result["files"]["combined"])
    if not combined_path.exists() or combined_path.stat().st_size == 0:
        return {"status": "error", "reason": "empty combined dataset"}

    # Step 2: Train/eval split
    train_path, eval_path = builder.split_train_eval(combined_path)
    logger.info(f"Train: {train_path}, Eval: {eval_path}")

    # Step 3: Fine-tune
    tuner_cfg = cfg_overrides or {}
    tuner = FineTuner(cfg=tuner_cfg)
    tag = adapter_name or f"cycle-{int(t0)}"
    logger.info(f"Starting fine-tuning, adapter tag: {tag}")
    train_result = tuner.train(
        dataset_path=train_path,
        eval_path=eval_path,
        adapter_name=tag,
        max_steps=max_steps,
    )
    logger.info(f"Training result: {train_result}")

    if train_result.get("status") != "ok":
        return {"status": "train_failed", "detail": train_result}

    # Step 4: Publish adapter
    updater = ModelUpdater()
    pub_result = updater.publish_adapter(
        adapter_path=train_result["adapter_path"],
        version_tag=tag,
    )
    logger.info(f"Adapter published: {pub_result}")

    # Cleanup old adapters
    updater.cleanup_old_adapters(keep=5)

    # Step 5: Mark experiences as trained
    # We use episode_ids from dataset build (all that were used)
    # For simplicity, mark all experiences that have rewards and haven't been trained
    with buf._conn() as conn:
        ids = [
            r[0]
            for r in conn.execute("SELECT id FROM experiences WHERE reward IS NOT NULL AND used_in_train=0").fetchall()
        ]
    buf.mark_trained(ids)
    logger.info(f"Marked {len(ids)} experiences as trained")

    # Step 6: Log run to buffer
    buf.log_training_run(
        examples_used=train_result["examples"],
        base_model=train_result["base_model"],
        adapter_path=train_result["adapter_path"],
        train_loss=train_result["train_loss"],
        eval_loss=train_result.get("eval_loss") or 0.0,
        started_at=t0,
        notes=f"cycle={tag} backend={train_result['backend']}",
    )

    elapsed = time.time() - t0
    return {
        "status": "ok",
        "cycle_tag": tag,
        "new_experiences": new_labelled,
        "examples_trained": train_result["examples"],
        "train_loss": train_result["train_loss"],
        "eval_loss": train_result.get("eval_loss"),
        "adapter_path": train_result["adapter_path"],
        "reload_method": pub_result.get("reload_method"),
        "elapsed_s": round(elapsed, 1),
    }


def main():
    parser = argparse.ArgumentParser(description="Continuous trading AI training loop")
    parser.add_argument(
        "--interval",
        type=int,
        default=DEFAULT_INTERVAL_S,
        help="Seconds between cycles (default 3600)",
    )
    parser.add_argument(
        "--min-exp",
        type=int,
        default=DEFAULT_MIN_NEW_EXP,
        help="Minimum new experiences required to train",
    )
    parser.add_argument("--max-steps", type=int, default=-1, help="Max training steps (-1 = full epoch)")
    parser.add_argument("--once", action="store_true", help="Run one cycle then exit")
    parser.add_argument("--status", action="store_true", help="Print buffer stats and exit")
    parser.add_argument("--build-only", action="store_true", help="Only build datasets, don't train")
    parser.add_argument("--base-model", type=str, default=None, help="Override base model name")
    args = parser.parse_args()

    # Status check
    if args.status:
        from .experience_buffer import ExperienceBuffer

        buf = ExperienceBuffer()
        stats = buf.stats()
        print(json.dumps(stats, indent=2))
        return

    # Build-only mode
    if args.build_only:
        from .dataset_builder import DatasetBuilder
        from .experience_buffer import ExperienceBuffer

        buf = ExperienceBuffer()
        builder = DatasetBuilder(buffer=buf)
        result = builder.build_all()
        print(json.dumps(result, indent=2))
        return

    cfg_overrides = {}
    if args.base_model:
        cfg_overrides["base_model"] = args.base_model

    state = load_state()
    logger.info(f"Training loop starting. Interval: {args.interval}s, " f"min_exp: {args.min_exp}")

    while True:
        logger.info(f"=== Cycle {state['total_cycles'] + 1} ===")
        try:
            result = run_cycle(
                min_new_exp=args.min_exp,
                max_steps=args.max_steps,
                cfg_overrides=cfg_overrides,
            )
            logger.info(f"Cycle result: {result['status']}")
            if result["status"] == "ok":
                state["total_cycles"] += 1
                state["total_examples_trained"] += result.get("examples_trained", 0)
            state["last_run"] = time.time()
            state["last_result"] = result
            save_state(state)
        except Exception as e:
            logger.exception(f"Cycle failed: {e}")

        if args.once:
            break

        logger.info(f"Sleeping {args.interval}s until next cycle...")
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
