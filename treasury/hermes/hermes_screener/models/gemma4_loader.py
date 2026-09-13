"""
Gemma 4 quantized model loader for local inference.

Supports loading quantized weights (4-bit, 8-bit) for efficient offline inference.
Uses bitsandbytes for quantization and HuggingFace Transformers for model loading.
"""

import logging
import os
from pathlib import Path
from typing import Any

import torch
import yaml
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

logger = logging.getLogger(__name__)


class Gemma4QuantizedLoader:
    """Loader for quantized Gemma 4 models with configurable precision."""

    def __init__(self, config_path: str = "~/.hermes/config/inference.yaml"):
        """
        Initialize loader with inference configuration.

        Args:
            config_path: Path to YAML config file containing model settings
        """
        self.config_path = os.path.expanduser(config_path)
        self.config = self._load_config()
        self.model = None
        self.tokenizer = None
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    def _load_config(self) -> dict[str, Any]:
        """Load inference configuration from YAML file."""
        try:
            with open(self.config_path) as f:
                return yaml.safe_load(f)
        except FileNotFoundError:
            logger.warning(f"Config file not found at {self.config_path}, using defaults")
            return {
                "model": {
                    "name": "google/gemma-4-9b-it",
                    "quantization": "4bit",
                    "cache_dir": "~/.hermes/models",
                    "trust_remote_code": True,
                    "torch_dtype": "auto",
                }
            }

    def _get_quantization_config(self) -> BitsAndBytesConfig:
        """Create quantization config based on settings."""
        quant_config = self.config["model"]["quantization"]

        if quant_config == "4bit":
            return BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.bfloat16,
                bnb_4bit_use_double_quant=True,
            )
        elif quant_config == "8bit":
            return BitsAndBytesConfig(load_in_8bit=True)
        else:
            raise ValueError(f"Unsupported quantization: {quant_config}")

    def load_model(self) -> None:
        """Load quantized Gemma 4 model and tokenizer."""
        model_config = self.config["model"]
        cache_dir = os.path.expanduser(model_config["cache_dir"])

        # Ensure cache directory exists
        Path(cache_dir).mkdir(parents=True, exist_ok=True)

        quantization_config = self._get_quantization_config()

        logger.info(f"Loading quantized Gemma 4 model ({model_config['quantization']})...")

        self.tokenizer = AutoTokenizer.from_pretrained(
            model_config["name"],
            cache_dir=cache_dir,
            trust_remote_code=model_config["trust_remote_code"],
        )

        self.model = AutoModelForCausalLM.from_pretrained(
            model_config["name"],
            quantization_config=quantization_config,
            cache_dir=cache_dir,
            trust_remote_code=model_config["trust_remote_code"],
            torch_dtype=getattr(torch, model_config["torch_dtype"]),
        ).to(self.device)

        logger.info("Model loaded successfully")

    def generate_response(self, prompt: str, **kwargs) -> str:
        """
        Generate response from quantized model.

        Args:
            prompt: Input text prompt
            **kwargs: Additional generation parameters
                - max_new_tokens: Maximum tokens to generate
                - temperature: Sampling temperature
                - top_p: Nucleus sampling probability
                - do_sample: Whether to sample

        Returns:
            Generated text response
        """
        if not self.model or not self.tokenizer:
            raise RuntimeError("Model not loaded. Call load_model() first.")

        generation_kwargs = {
            "max_new_tokens": kwargs.get("max_new_tokens", 512),
            "temperature": kwargs.get("temperature", 0.7),
            "top_p": kwargs.get("top_p", 0.9),
            "do_sample": kwargs.get("do_sample", True),
            "pad_token_id": self.tokenizer.eos_token_id,
        }

        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.device)
        outputs = self.model.generate(**inputs, **generation_kwargs)
        response = self.tokenizer.decode(outputs[0], skip_special_tokens=True)

        # Remove prompt from response if present
        if response.startswith(prompt):
            response = response[len(prompt) :].strip()

        return response

    def get_model_info(self) -> dict[str, str | int]:
        """Get information about the loaded model."""
        if not self.model:
            return {"status": "not_loaded"}

        return {
            "model_name": self.config["model"]["name"],
            "quantization": self.config["model"]["quantization"],
            "device": str(self.device),
            "parameter_count": sum(p.numel() for p in self.model.parameters()),
            "status": "loaded",
        }
