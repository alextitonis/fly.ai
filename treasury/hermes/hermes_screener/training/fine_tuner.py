"""
Fine Tuner
==========
LoRA fine-tuning on the local model using Unsloth (fast) or HuggingFace TRL
(fallback). Trains on the JSONL datasets produced by DatasetBuilder.

Supports:
  - 4-bit quantized LoRA fine-tuning (Unsloth preferred for 2-5x speedup)
  - Gradient checkpointing for memory efficiency
  - Automatic adapter saving under ~/.hermes/models/trading-lora/
  - Evaluation on held-out split after each run

The fine-tuned adapter is saved separately from the base model so it can be
hot-swapped into inference without reloading everything.

Hardware requirements:
  - Minimum: 8GB VRAM (7B 4-bit + LoRA)
  - Recommended: 16GB+ VRAM for comfortable training
  - CPU fallback: extremely slow but functional
"""

import json
import logging
import time
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_ADAPTER_BASE = Path.home() / ".hermes" / "models" / "trading-lora"
DEFAULT_DATASET_DIR = Path.home() / ".hermes" / "data" / "training" / "datasets"

# Default training config
DEFAULT_TRAIN_CFG = {
    "base_model": "google/gemma-2-2b-it",  # small, fits 8GB
    "max_seq_length": 2048,
    "load_in_4bit": True,
    "lora_r": 16,
    "lora_alpha": 32,
    "lora_dropout": 0.05,
    "lora_target_modules": [
        "q_proj",
        "k_proj",
        "v_proj",
        "o_proj",
        "gate_proj",
        "up_proj",
        "down_proj",
    ],
    "learning_rate": 2e-4,
    "num_train_epochs": 1,
    "per_device_train_batch_size": 2,
    "gradient_accumulation_steps": 4,
    "warmup_ratio": 0.03,
    "lr_scheduler_type": "cosine",
    "fp16": False,
    "bf16": True,
    "logging_steps": 10,
    "save_steps": 100,
    "eval_steps": 100,
    "dataset_text_field": "text",
    "max_steps": -1,  # -1 = full epochs
}


from trl import SFTTrainer  # noqa: E402, I001, F401
from transformers import TrainingArguments  # noqa: E402, I001, F401


class FineTuner:

    def __init__(self, cfg: dict | None = None):
        self.cfg = {**DEFAULT_TRAIN_CFG, **(cfg or {})}

    def _try_unsloth(self):
        """Returns (FastLanguageModel, tokenizer) or raises ImportError."""
        from unsloth import FastLanguageModel

        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=self.cfg["base_model"],
            max_seq_length=self.cfg["max_seq_length"],
            load_in_4bit=self.cfg["load_in_4bit"],
            dtype=None,
        )
        model = FastLanguageModel.get_peft_model(
            model,
            r=self.cfg["lora_r"],
            lora_alpha=self.cfg["lora_alpha"],
            lora_dropout=self.cfg["lora_dropout"],
            target_modules=self.cfg["lora_target_modules"],
            bias="none",
            use_gradient_checkpointing="unsloth",
            random_state=42,
        )
        return model, tokenizer, "unsloth"

    def _try_hf_peft(self):
        """Returns (model, tokenizer) using HuggingFace PEFT as fallback."""
        import torch
        from peft import LoraConfig, TaskType, get_peft_model
        from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

        bnb_config = (
            BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.bfloat16,
                bnb_4bit_use_double_quant=True,
            )
            if self.cfg["load_in_4bit"]
            else None
        )

        tokenizer = AutoTokenizer.from_pretrained(self.cfg["base_model"])
        tokenizer.pad_token = tokenizer.eos_token

        model = AutoModelForCausalLM.from_pretrained(
            self.cfg["base_model"],
            quantization_config=bnb_config,
            device_map="auto",
            torch_dtype=torch.bfloat16,
        )
        lora_config = LoraConfig(
            r=self.cfg["lora_r"],
            lora_alpha=self.cfg["lora_alpha"],
            lora_dropout=self.cfg["lora_dropout"],
            target_modules=self.cfg["lora_target_modules"],
            bias="none",
            task_type=TaskType.CAUSAL_LM,
        )
        model = get_peft_model(model, lora_config)
        model.enable_input_require_grads()
        return model, tokenizer, "hf_peft"

    def _load_model(self):
        try:
            return self._try_unsloth()
        except ImportError:
            logger.info("Unsloth not available, falling back to HuggingFace PEFT")
            return self._try_hf_peft()

    def _jsonl_to_hf_dataset(self, jsonl_path: Path, tokenizer):
        """Convert JSONL chat format to HuggingFace Dataset."""
        from datasets import Dataset

        samples = []
        with open(jsonl_path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                obj = json.loads(line)
                messages = obj.get("messages", [])
                # Apply chat template to get a single text string
                try:
                    text = tokenizer.apply_chat_template(
                        messages,
                        tokenize=False,
                        add_generation_prompt=False,
                    )
                except Exception:
                    # Fallback: concatenate manually
                    parts = []
                    for m in messages:
                        role = m.get("role", "")
                        content = m.get("content", "")
                        parts.append(f"<|{role}|>\n{content}\n")
                    text = "".join(parts)
                samples.append({"text": text, "reward": obj.get("reward", 0.0)})
        return Dataset.from_list(samples)

    def train(  # type: ignore[return]
        self,
        dataset_path: Path | None = None,
        eval_path: Path | None = None,
        adapter_name: str = "latest",
        max_steps: int = -1,
    ) -> dict:
        """
        Run one fine-tuning pass. Returns dict with train/eval loss + adapter path.
        """

        if dataset_path is None:
            # Prefer the merged initial training dataset (external + pipeline)
            for candidate in [
                DEFAULT_DATASET_DIR / "initial_training_train.jsonl",
                DEFAULT_DATASET_DIR / "combined_dataset_train.jsonl",
                DEFAULT_DATASET_DIR / "initial_training_dataset.jsonl",
                DEFAULT_DATASET_DIR / "combined_dataset.jsonl",
            ]:
                if candidate.exists() and candidate.stat().st_size > 0:
                    dataset_path = candidate
                    break

            if not Path(dataset_path).exists():
                return {"status": "no_dataset", "path": str(dataset_path)}

            t0 = time.time()
            logger.info(f"Loading model: {self.cfg['base_model']}")
            model, tokenizer, backend = self._load_model()
            logger.info(f"Model loaded via {backend}")

            train_dataset = self._jsonl_to_hf_dataset(dataset_path, tokenizer)
            eval_dataset = (
                self._jsonl_to_hf_dataset(eval_path, tokenizer) if eval_path and Path(eval_path).exists() else None
            )

            adapter_path = DEFAULT_ADAPTER_BASE / adapter_name
            adapter_path.mkdir(parents=True, exist_ok=True)

            effective_max_steps = max_steps if max_steps > 0 else self.cfg["max_steps"]

            training_args = TrainingArguments(
                output_dir=str(adapter_path / "checkpoints"),
                num_train_epochs=self.cfg["num_train_epochs"],
                per_device_train_batch_size=self.cfg["per_device_train_batch_size"],
                gradient_accumulation_steps=self.cfg["gradient_accumulation_steps"],
                warmup_ratio=self.cfg["warmup_ratio"],
                learning_rate=self.cfg["learning_rate"],
                fp16=self.cfg["fp16"],
                bf16=self.cfg["bf16"],
                lr_scheduler_type=self.cfg["lr_scheduler_type"],
                logging_steps=self.cfg["logging_steps"],
                save_steps=self.cfg["save_steps"],
                eval_steps=self.cfg["eval_steps"] if eval_dataset else None,
                evaluation_strategy="steps" if eval_dataset else "no",
                max_steps=effective_max_steps,
                report_to="none",
                dataloader_num_workers=0,
                remove_unused_columns=False,
            )

            trainer = SFTTrainer(
                model=model,
                tokenizer=tokenizer,
                train_dataset=train_dataset,
                eval_dataset=eval_dataset,
                dataset_text_field="text",
                max_seq_length=self.cfg["max_seq_length"],
                args=training_args,
            )

            logger.info(f"Starting training: {len(train_dataset)} examples")
            train_result = trainer.train()
            train_loss = train_result.training_loss

            eval_loss = None
            if eval_dataset:
                eval_result = trainer.evaluate()
                eval_loss = eval_result.get("eval_loss")

            # Save adapter
            model.save_pretrained(str(adapter_path))
            tokenizer.save_pretrained(str(adapter_path))

            elapsed = time.time() - t0
            result = {
                "status": "ok",
                "backend": backend,
                "base_model": self.cfg["base_model"],
                "adapter_path": str(adapter_path),
                "train_loss": round(train_loss, 4),
                "eval_loss": round(eval_loss, 4) if eval_loss else None,
                "examples": len(train_dataset),
                "elapsed_s": round(elapsed, 1),
            }
            logger.info(f"Training complete: {result}")
            return result
