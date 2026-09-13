"""
Prompt template manager for DSPy-inspired optimization in Hermes Agent.

Manages storage, versioning, scoring, and retrieval of prompt templates.
YAML-based persistence with performance tracking.
"""

import os
from datetime import datetime
from pathlib import Path

import yaml

from hermes_screener.types.template_types import TemplateEntry, TemplateMetadata


class TemplateStorage:
    """Manages prompt template files with versioning and performance tracking."""

    def __init__(self, templates_dir: str | None = None):
        if templates_dir is None:
            templates_dir = os.path.expanduser("~/.hermes/skills/prompt_templates")
        self.templates_dir = Path(templates_dir)
        self.templates_dir.mkdir(parents=True, exist_ok=True)

    def _template_path(self, name: str) -> Path:
        """Get the file path for a named template."""
        # Sanitize name to prevent directory traversal
        safe_name = Path(name).name.replace("/", "_").replace("\\", "_")
        return self.templates_dir / f"{safe_name}.yaml"

    def load_template(self, name: str) -> TemplateEntry | None:
        """Load a named template from disk."""
        path = self._template_path(name)
        if not path.exists():
            return None
        with open(path) as f:
            data = yaml.safe_load(f)
        if not data:
            return None
        return {
            "content": data.get("content", data.get("template", "")),
            "metadata": data.get("metadata", {}),
            "scores": data.get("scores", []),
            "variants": data.get("variants", []),
        }

    def save_template(
        self,
        name: str,
        content: str,
        metadata: dict | None = None,
        category: str = "general",
    ) -> str:
        """Save a template with version tracking. Returns the saved path."""
        path = self._template_path(name)
        existing = self.load_template(name)

        now = datetime.now().isoformat()
        version = 1

        if existing:
            version = existing["metadata"].get("version", 0) + 1
            # Archive current as variant
            variants = existing.get("variants", [])
            variants.append(
                {  # type: ignore[typeddict-unknown-key]
                    "version": existing["metadata"].get("version", 0),
                    "content": existing["content"],
                    "archived_at": now,
                    "reason": "replaced_by_optimization",
                }
            )
        else:
            variants = []

        meta: TemplateMetadata = {
            "version": version,
            "created_at": existing["metadata"]["created_at"] if existing else now,
            "updated_at": now,
            "usage_count": existing["metadata"].get("usage_count", 0),
            "avg_score": existing["metadata"].get("avg_score", 0.0),
            "category": category,
            "source": metadata.get("source", "manual") if metadata else "manual",
        }

        data = {
            "content": content,
            "template": content,  # compatibility alias
            "metadata": meta,
            "scores": existing.get("scores", []) if existing else [],
            "variants": variants,
        }

        with open(path, "w") as f:
            yaml.dump(data, f, default_flow_style=False, sort_keys=False)

        return str(path)

    def list_templates(self) -> list[dict]:
        """List all available templates with their metadata."""
        results = []
        for path in sorted(self.templates_dir.glob("*.yaml")):
            with open(path) as f:
                data = yaml.safe_load(f)
            if data:
                meta = data.get("metadata", {})
                results.append(
                    {
                        "name": path.stem,
                        "version": meta.get("version", 0),
                        "category": meta.get("category", "unknown"),
                        "usage_count": meta.get("usage_count", 0),
                        "avg_score": meta.get("avg_score", 0.0),
                        "updated_at": meta.get("updated_at", ""),
                    }
                )
        return results

    def score_template(self, name: str, metric_value: float, metric_name: str = "quality") -> bool:
        """Record a performance score for a template. Returns True if found."""
        entry = self.load_template(name)
        if not entry:
            return False

        scores = entry.get("scores", [])
        scores.append(
            {
                "metric": metric_name,
                "value": metric_value,
                "timestamp": datetime.now().isoformat(),
            }
        )

        # Update average score (across all metrics)
        if scores:
            avg = sum(s["value"] for s in scores) / len(scores)
        else:
            avg = 0.0

        entry["metadata"]["avg_score"] = avg
        entry["scores"] = scores

        # Save back
        path = self._template_path(name)
        with open(path) as f:
            data = yaml.safe_load(f) or {}
        data["scores"] = scores
        data["metadata"]["avg_score"] = avg
        data["metadata"]["updated_at"] = datetime.now().isoformat()
        with open(path, "w") as f:
            yaml.dump(data, f, default_flow_style=False, sort_keys=False)

        return True

    def get_best_template(self, name: str) -> str | None:
        """Get the highest-scoring variant, or the current template if no variants."""
        path = self._template_path(name)
        if not path.exists():
            return None

        with open(path) as f:
            data = yaml.safe_load(f)

        if not data:
            return None

        variants = data.get("variants", [])
        if not variants:
            return data.get("content", data.get("template", ""))

        # Score variants if historical data exists
        best = max(
            variants
            + [
                {
                    "content": data.get("content", ""),
                    "version": data.get("metadata", {}).get("version", 0),
                }
            ],
            key=lambda v: self._estimate_variant_score(v),
        )
        return best.get("content", "")

    def _estimate_variant_score(self, variant: dict) -> float:
        """Heuristic score for a variant based on its position and metadata."""
        # Newer variants generally better (optimistic assumption)
        version = variant.get("version", 0)
        return version * 0.1

    def generate_variant_name(self, base_name: str, index: int) -> str:
        """Generate a standardized variant name."""
        return f"{base_name}_v{index}"

    def copy_as_variant(self, name: str, variant_name: str, modifications: str = "") -> str | None:
        """Copy current template as a new variant with optional modifications note."""
        entry = self.load_template(name)
        if not entry:
            return None

        path = self._template_path(name)
        with open(path) as f:
            data = yaml.safe_load(f) or {}

        variants = data.get("variants", [])
        variants.append(
            {
                "name": variant_name,
                "content": entry["content"],
                "created_at": datetime.now().isoformat(),
                "modifications": modifications,
                "version": entry["metadata"].get("version", 0),
            }
        )

        data["variants"] = variants
        with open(path, "w") as f:
            yaml.dump(data, f, default_flow_style=False, sort_keys=False)

        return variant_name

    def get_template_usage_stats(self, name: str) -> dict:
        """Get usage statistics for a template."""
        entry = self.load_template(name)
        if not entry:
            return {"exists": False}

        meta = entry["metadata"]
        scores = entry.get("scores", [])

        return {
            "exists": True,
            "name": name,
            "version": meta.get("version", 0),
            "usage_count": meta.get("usage_count", 0),
            "avg_score": meta.get("avg_score", 0.0),
            "total_scores_recorded": len(scores),
            "variants_count": len(entry.get("variants", [])),
            "category": meta.get("category", "unknown"),
            "created_at": meta.get("created_at", ""),
            "last_updated": meta.get("updated_at", ""),
        }

    def delete_template(self, name: str) -> bool:
        """Delete a template. Returns True if it existed."""
        path = self._template_path(name)
        if path.exists():
            path.unlink()
            return True
        return False

    def export_all_templates(self) -> dict[str, TemplateEntry]:
        """Export all templates as a dictionary."""
        result = {}
        for path in self.templates_dir.glob("*.yaml"):
            entry = self.load_template(path.stem)
            if entry:
                result[path.stem] = entry
        return result

    def import_templates(self, templates: dict[str, dict]) -> int:
        """Import templates from a dictionary. Returns count imported."""
        count = 0
        for name, data in templates.items():
            content = data.get("content", data.get("template", ""))
            if content:
                self.save_template(
                    name,
                    content,
                    metadata=data.get("metadata", {}),
                    category=data.get("metadata", {}).get("category", "imported"),
                )
                count += 1
        return count


# Default instance for easy import
default_storage = TemplateStorage()
