import json
import os
import sqlite3
from datetime import datetime
from pathlib import Path

import yaml

from hermes_screener.types.template_types import TemplateSuggestion


class DSPOptimizer:
    def __init__(self):
        self.sessions_db = os.path.expanduser("~/.hermes/sessions.db")
        self.templates_dir = os.path.expanduser("~/.hermes/skills/prompt_templates")
        os.makedirs(self.templates_dir, exist_ok=True)

    def _get_execution_history(self, tool_name: str, limit: int = 50) -> list[dict]:
        """Retrieve execution history for a specific tool from sessions database."""
        conn = sqlite3.connect(self.sessions_db)
        cursor = conn.cursor()

        query = """
        SELECT input, output, success, timestamp, tokens_used, parameters
        FROM tool_executions
        WHERE tool_name = ?
        ORDER BY timestamp DESC
        LIMIT ?
        """
        cursor.execute(query, (tool_name, limit))
        rows = cursor.fetchall()
        conn.close()

        history = []
        for row in rows:
            history.append(
                {
                    "input": json.loads(row[0]) if row[0] else {},
                    "output": json.loads(row[1]) if row[1] else {},
                    "success": bool(row[2]),
                    "timestamp": row[3],
                    "tokens_used": row[4],
                    "parameters": json.loads(row[5]) if row[5] else {},
                }
            )
        return history

    def _calculate_metrics(self, history: list[dict]) -> dict[str, float]:
        """Calculate performance metrics from execution history."""
        if not history:
            return {"success_rate": 0.0, "avg_tokens": 0.0, "success_tokens_ratio": 0.0}

        total = len(history)
        successes = sum(1 for h in history if h["success"])
        success_rate = successes / total

        avg_tokens = sum(h["tokens_used"] for h in history) / total
        success_tokens = sum(h["tokens_used"] for h in history if h["success"])
        success_tokens_ratio = (success_tokens / (successes or 1)) / (avg_tokens or 1)

        return {
            "success_rate": success_rate,
            "avg_tokens": avg_tokens,
            "success_tokens_ratio": success_tokens_ratio,
            "sample_size": total,
        }

    def _select_few_shot_examples(self, history: list[dict], n: int = 3) -> list[dict]:
        """Select diverse few-shot examples from execution history."""
        if not history:
            return []

        # Prioritize successful executions with good token efficiency
        scored = []
        for h in history:
            score = (1 if h["success"] else 0) * (1 / (h["tokens_used"] + 1))
            scored.append((score, h))

        scored.sort(reverse=True, key=lambda x: x[0])
        return [h for (_, h) in scored[:n]]

    def _generate_template_variants(self, tool_name: str, current_template: str) -> list[str]:
        """Generate prompt template variants for A/B testing."""
        variants = []

        # Variant 1: More structured output format
        variants.append(
            f"Tool: {tool_name}\n"
            "Parameters:\n"
            "{{parameters}}\n\n"
            "Instructions: Provide your response in the following structured format:\n"
            "1. Analysis: [brief analysis]\n"
            "2. Action: [specific action]\n"
            "3. Justification: [why this approach]\n\n"
            "Current context: {{context}}"
        )

        # Variant 2: Chain-of-thought style
        variants.append(
            f"Let's optimize the use of {tool_name} step by step:\n"
            "1. First, analyze the input parameters: {{parameters}}\n"
            "2. Consider the current context: {{context}}\n"
            "3. Identify potential failure modes\n"
            "4. Propose the most effective approach\n"
            "5. Execute with these refined parameters: [your refined parameters]\n\n"
            "Begin optimization:"
        )

        # Variant 3: Minimalist version
        variants.append(
            f"Tool: {tool_name}\n"
            "Parameters: {{parameters}}\n"
            "Context: {{context}}\n\n"
            "Provide the most effective execution of this tool with these parameters."
        )

        # Add current template as baseline
        variants.append(current_template)

        return variants

    def _score_template(self, template: str, history: list[dict], metrics: dict[str, float]) -> float:
        """Score a template based on historical performance and structure."""
        score = 0.0

        # Base score from metrics
        score += metrics["success_rate"] * 0.4
        score += metrics["success_tokens_ratio"] * 0.3

        # Structural quality
        if "{{parameters}}" in template:
            score += 0.1
        if "{{context}}" in template:
            score += 0.1
        if len(template.split("\n")) > 3:
            score += 0.05  # More detailed templates
        if "analysis" in template.lower() or "step" in template.lower():
            score += 0.05  # Chain-of-thought elements

        return min(score, 1.0)

    def _save_optimized_template(self, tool_name: str, template: str, metadata: dict):
        """Save optimized template to YAML file."""
        template_path = Path(self.templates_dir) / f"{tool_name}.yaml"
        data = {
            "template": template,
            "optimized_at": datetime.now().isoformat(),
            "metrics": metadata.get("metrics", {}),
            "examples": metadata.get("examples", []),
            "rationale": metadata.get("rationale", ""),
        }
        with open(template_path, "w") as f:
            yaml.dump(data, f)

    def optimize_tool(self, tool_name: str, task_id: str | None = None) -> dict:
        """Main optimization method that analyzes and suggests template improvements."""
        # Get current template if exists
        current_template = ""
        template_path = Path(self.templates_dir) / f"{tool_name}.yaml"
        if template_path.exists():
            with open(template_path) as f:
                current_data = yaml.safe_load(f)
                current_template = current_data.get("template", "")

        # Get execution history
        history = self._get_execution_history(tool_name)
        if not history:
            return {
                "status": "error",
                "message": f"No execution history found for tool {tool_name}",
                "suggestions": [],
            }

        # Calculate metrics
        metrics = self._calculate_metrics(history)

        # Generate variants
        variants = self._generate_template_variants(tool_name, current_template)

        # Score variants
        suggestions = []
        examples = self._select_few_shot_examples(history)

        for variant in variants:
            score = self._score_template(variant, history, metrics)
            rationale = self._generate_rationale(variant, metrics, examples)

            suggestions.append(
                TemplateSuggestion(
                    template=variant,
                    score=score,
                    rationale=rationale,
                    examples=examples,  # type: ignore[typeddict-item]
                    metrics=metrics,
                )
            )

        # Sort by score
        suggestions.sort(key=lambda x: x["score"], reverse=True)

        # Save top suggestion
        if suggestions:
            top_suggestion = suggestions[0]
            self._save_optimized_template(
                tool_name,
                top_suggestion["template"],
                {
                    "metrics": metrics,
                    "examples": examples,
                    "rationale": top_suggestion["rationale"],
                },
            )

        return {
            "status": "success",
            "tool_name": tool_name,
            "current_metrics": metrics,
            "suggestions": suggestions,
            "task_id": task_id,
        }

    def _generate_rationale(self, template: str, metrics: dict[str, float], examples: list[dict]) -> str:
        """Generate rationale for why a template might perform well."""
        rationale = []

        if metrics["success_rate"] > 0.7:
            rationale.append("High success rate in historical executions suggests this approach is reliable.")

        if "{{parameters}}" in template:
            rationale.append("Explicit parameter placeholders help ensure all required inputs are considered.")

        if "{{context}}" in template:
            rationale.append("Context placeholders allow for better situational adaptation.")

        if "step" in template.lower() or "analysis" in template.lower():
            rationale.append("Chain-of-thought elements may improve reasoning quality.")

        if len(template.split("\n")) > 5:
            rationale.append("Detailed templates provide clearer guidance for execution.")

        if not rationale:
            rationale.append("This template provides a balanced approach to tool execution.")

        return " ".join(rationale)


def dspy_optimize_tool(tool_name: str, task_id: str | None = None) -> dict:
    """Tool handler for DSPy-inspired prompt optimization."""
    optimizer = DSPOptimizer()
    return optimizer.optimize_tool(tool_name, task_id)
