"""
Continuous Trading AI Training System
======================================
Captures experiences from every pipeline stage, computes real rewards
from trade outcomes, and continuously fine-tunes a local LLM.

Pipeline data flows captured:
  token_discovery -> enrichment -> scoring -> wallet cross-score
  -> ai_trading_brain (decision) -> trade_monitor (outcome)
  -> contract_executor (execution result)

Modules:
  experience_collector  - hooks into pipeline stages, emits Experience objects
  reward_calculator     - converts raw outcomes to scalar rewards
  experience_buffer     - SQLite ring buffer for all experiences
  dataset_builder       - converts buffer to JSONL instruction-tuning data
  fine_tuner            - LoRA fine-tuning via Unsloth / TRL
  model_updater         - hot-swaps updated weights into serving process
  training_loop         - orchestrates the full continuous cycle
"""

from .dataset_builder import DatasetBuilder
from .experience_buffer import ExperienceBuffer
from .experience_collector import Experience, ExperienceCollector, PipelineStage
from .reward_calculator import RewardCalculator

__all__ = [
    "ExperienceBuffer",
    "ExperienceCollector",
    "Experience",
    "PipelineStage",
    "RewardCalculator",
    "DatasetBuilder",
]
