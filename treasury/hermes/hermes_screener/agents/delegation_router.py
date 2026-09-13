"""Hermes Dynamic Task Delegation Router — inspired by Holos multi-agent system.

Routes incoming user tasks to specialized sub-agents based on task classification,
agent capabilities, and performance metrics. Implements the Holos pattern of
decentralized task routing with dynamic agent selection.

Integrates with the AgentRegistry to discover available agents and select the
best match for each task. Tasks are decomposed into sub-tasks when they exceed
complexity thresholds.

Key concepts from Holos paper:
  - Spatially-grounded task decomposition (break tasks by domain/space)
  - Dynamic routing based on agent state and performance
  - Multi-agent orchestration for complex workflows
"""

from __future__ import annotations

import json
import logging
import os
import textwrap
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import TypedDict
from urllib import request as urllib_request

from .registry import (
    AgentEntry,
    AgentRegistry,
    AgentRole,
    RoutingStrategy,
)
from hermes_screener import tor_config  # noqa: F401

logger = logging.getLogger(__name__)

# ── TypedDicts for structured return types ─────────────────────────────────


class ClassificationResult(TypedDict, total=False):
    primary: str
    all_matches: list[str]
    method: str
    confidence: float
    keywords: list[str]
    complexity: str


class AssignmentEntry(TypedDict):
    subtask_id: str
    subtask: str
    category: str
    agent_id: str | None
    agent_name: str | None
    agent_role: str | None
    status: str


class RouteResult(TypedDict):
    classification: ClassificationResult
    subtasks: int
    assignments: list[AssignmentEntry]
    is_decomposed: bool
    routed_at: str


class TaskLogEntry(TypedDict, total=False):
    classification: ClassificationResult
    subtasks: int
    assignments: list[AssignmentEntry]
    is_decomposed: bool
    routed_at: str


class DelegationState(TypedDict):
    registry_stats: dict[str, object]
    recent_tasks: int
    active_tasks: int
    task_log_path: str


# ── Constants ──────────────────────────────────────────────────────────────

HERMES_HOME = os.environ.get(
    "HERMES_HOME",
    os.path.join(os.path.expanduser("~"), ".hermes"),
)
TASK_LOG_PATH = Path(HERMES_HOME) / "agents" / "task_log.json"
DELEGATION_STATE_PATH = Path(HERMES_HOME) / "agents" / "delegation_state.json"


# ── Task Classification ────────────────────────────────────────────────────


class TaskCategory(str, Enum):
    """Recognized task categories for agent routing."""

    RESEARCH = "research"
    CODING = "coding"
    DEBUGGING = "debugging"
    REVIEW = "review"
    PLANNING = "planning"
    DATA_ANALYSIS = "data_analysis"
    SECURITY = "security"
    WEB_BROWSING = "web_browsing"
    VISUAL = "visual"
    GENERAL = "general"


# Keywords that map user intent to task categories
CATEGORY_KEYWORDS: dict[TaskCategory, list[str]] = {
    TaskCategory.RESEARCH: [
        "research",
        "search",
        "find information",
        "look up",
        "discover",
        "compare",
        "investigate",
        "study",
        "survey",
        "benchmark",
        "papers",
        "articles",
        "documentation",
        "read",
    ],
    TaskCategory.CODING: [
        "implement",
        "create",
        "write code",
        "build",
        "develop",
        "add feature",
        "implement",
        "script",
        "function",
        "class",
        "refactor",
        "generate code",
        "python",
        "javascript",
    ],
    TaskCategory.DEBUGGING: [
        "debug",
        "fix",
        "troubleshoot",
        "error",
        "broken",
        "not working",
        "exception",
        "traceback",
        "bug",
        "crash",
        "fails",
    ],
    TaskCategory.REVIEW: [
        "review",
        "audit",
        "check code",
        "code review",
        "quality",
        "security review",
        "best practices",
        "lint",
        "static analysis",
    ],
    TaskCategory.PLANNING: [
        "plan",
        "design",
        "architect",
        "spec",
        "roadmap",
        "break down",
        "decompose",
        "strategy",
        "approach",
    ],
    TaskCategory.DATA_ANALYSIS: [
        "analyze data",
        "data",
        "csv",
        "dataset",
        "statistics",
        "chart",
        "graph",
        "visualization",
        "plot",
        "report",
    ],
    TaskCategory.SECURITY: [
        "security",
        "vulnerability",
        "scan",
        "audit",
        "exploit",
        "penetration",
        "secret",
        "credential",
        "auth",
        "token",
    ],
    TaskCategory.WEB_BROWSING: [
        "browse",
        "website",
        "webpage",
        "click",
        "navigate",
        "scrape",
        "extract from page",
        "fill form",
        "screenshot",
    ],
    TaskCategory.VISUAL: [
        "image",
        "screenshot",
        "photo",
        "picture",
        "visual",
        "diagram",
        "chart",
        "draw",
        "design",
    ],
}

# Map task categories to preferred agent roles
CATEGORY_TO_ROLE: dict[TaskCategory, AgentRole] = {
    TaskCategory.RESEARCH: AgentRole.RESEARCHER,
    TaskCategory.CODING: AgentRole.CODER,
    TaskCategory.DEBUGGING: AgentRole.CODER,
    TaskCategory.REVIEW: AgentRole.REVIEWER,
    TaskCategory.PLANNING: AgentRole.PLANNER,
    TaskCategory.DATA_ANALYSIS: AgentRole.DATA_AGENT,
    TaskCategory.SECURITY: AgentRole.SECURITY_AGENT,
    TaskCategory.WEB_BROWSING: AgentRole.WEB_AGENT,
    TaskCategory.VISUAL: AgentRole.RESEARCHER,
    TaskCategory.GENERAL: AgentRole.GENERAL,
}


# ── LLM helpers ────────────────────────────────────────────────────────────


def _get_models() -> list:
    """Load model list from config.yaml (same pattern as rss_improvement_executor)."""
    import yaml  # noqa: E800  # pyyaml is available in Hermes venv

    cfg_path = os.path.join(os.path.expanduser("~"), ".hermes", "config.yaml")
    if not os.path.isfile(cfg_path):
        key = os.environ.get("OPENROUTER_API_KEY", "")
        return [("qwen/qwen3.6-plus:free", "https://openrouter.ai/api/v1", key)] if key else []
    with open(cfg_path) as f:
        cfg = yaml.safe_load(f)
    if not isinstance(cfg, dict):
        return []
    m = cfg.get("model", {})
    if not isinstance(m, dict):
        return []
    providers = []
    pk = os.environ.get(m.get("api_key_env", "OPENROUTER_API_KEY"), "")
    if pk:
        providers.append((m["default"], m.get("base_url", "https://openrouter.ai/api/v1"), pk))
    for fb in cfg.get("fallback_providers", []):
        key = os.environ.get(fb.get("api_key_env", ""), "")
        if key:
            providers.append((fb["model"], fb["base_url"], key))
    return providers


_MODELS = _get_models()


def _call_llm(prompt: str, system_prompt: str = "", timeout: int = 60) -> str | None:
    """Make an LLM API call using the configured model + fallback chain."""
    for model_id, base_url, api_key in _MODELS:
        try:
            payload = {
                "model": model_id,
                "messages": [],
                "max_tokens": 4096,
                "temperature": 0.2,
            }
            if system_prompt:
                payload["messages"].append({"role": "system", "content": system_prompt})
            payload["messages"].append({"role": "user", "content": prompt})

            req_data = json.dumps(payload).encode()
            req = urllib_request.Request(
                f"{base_url}/chat/completions",
                data=req_data,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
            )
            with urllib_request.urlopen(req, timeout=timeout) as resp:
                result = json.loads(resp.read().decode())
            return result["choices"][0]["message"]["content"]
        except Exception:
            continue
    return None


# ── Task Data Classes ──────────────────────────────────────────────────────


@dataclass
class SubTask:
    """A decomposed sub-task from a larger request."""

    task_id: str
    description: str
    category: str
    assigned_agent: str | None = None
    status: str = "pending"
    result: str = ""
    created_at: str = ""
    started_at: str = ""
    completed_at: str = ""

    @classmethod
    def create(cls, description: str, category: str = "") -> SubTask:
        import uuid

        now = datetime.now(timezone.utc).isoformat()
        return cls(
            task_id=str(uuid.uuid4())[:8],
            description=description,
            category=category or TaskCategory.GENERAL.value,
            created_at=now,
        )


@dataclass
class DelegationResult:
    """The outcome of a delegated task."""

    task_description: str
    assigned_to: str
    agent_id: str
    status: str
    result: str = ""
    subtasks: list[SubTask] = field(default_factory=list)
    duration_seconds: float = 0.0
    completed_at: str = ""


# ── Classifier ─────────────────────────────────────────────────────────────


class TaskClassifier:
    """Classifies raw user text into task categories using keyword heuristics
    and (optionally) LLM-based refinement."""

    @staticmethod
    def classify_keyword(text: str) -> list[TaskCategory]:
        """Score-based keyword matching. Returns categories sorted by relevance."""
        text_lower = text.lower()
        scores: dict[TaskCategory, int] = {}
        for category, keywords in CATEGORY_KEYWORDS.items():
            score = sum(1 for kw in keywords if kw in text_lower)
            if score > 0:
                scores[category] = score
        return sorted(scores, key=scores.get, reverse=True)

    def classify_llm(self, text: str) -> ClassificationResult:
        """Use LLM to classify the task and extract key parameters."""
        prompt = textwrap.dedent(
            f"""\
            Classify this user task into categories. Available categories:
            research, coding, debugging, review, planning, data_analysis,
            security, web_browsing, visual, general

            Task: {text}

            Respond as JSON:
            {{"primary": "main category", "confidence": 0.0-1.0, "keywords": ["key terms"], "complexity": "low/medium/high"}}"""
        )

        raw = _call_llm(prompt)
        if raw:
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                logger.warning("LLM classify_llm returned non-JSON response; falling back to empty result")
        return {}

    def classify(self, text: str) -> ClassificationResult:
        """Hybrid classification: keyword first, LLM optional for enrichment."""
        kw_results = self.classify_keyword(text)
        primary = kw_results[0] if kw_results else TaskCategory.GENERAL
        result: ClassificationResult = {
            "primary": primary.value,
            "all_matches": [c.value for c in kw_results],
            "method": "keyword",
        }
        # Only call LLM if no keyword matches (ambiguous text)
        if not kw_results:
            llm = self.classify_llm(text)
            if llm:
                result.update(llm)
                result["method"] = "llm"
        return result


# ── Task Decomposer ────────────────────────────────────────────────────────


class TaskDecomposer:
    """Breaks complex tasks into delegable sub-tasks.

    Inspired by the Holos spatially-grounded planning approach: tasks are
    decomposed by domain, dependency, and complexity rather than just
    splitting into N equal chunks.
    """

    def __init__(self):
        self.classifier = TaskClassifier()

    def should_decompose(self, text: str, classification: ClassificationResult) -> bool:
        """Decide whether a task should be broken into sub-tasks."""
        complexity = classification.get("complexity", "").lower()
        if complexity == "high":
            return True

        # Heuristic: many category matches suggests multi-domain task
        categories = classification.get("all_matches", [])
        if len(categories) >= 3:
            return True

        # Heuristic: very long descriptions suggest complexity
        if len(text.split()) > 100:
            return True

        return False

    def decompose_llm(self, text: str) -> list[dict[str, str]]:
        """Use LLM to decompose a complex task into sub-tasks."""
        categories = self.classifier.classify(text)
        prompt = textwrap.dedent(f"""\
            Decompose this complex task into 2-5 specific, independent sub-tasks
            that can each be handled by a specialized agent.

            Task: {text}
            Identified categories: {', '.join(categories.get('all_matches', ['general']))}

            Respond as JSON array:
            [
              {{"description": "sub-task 1", "category": "coding", "dependencies": []}},
              {{"description": "sub-task 2", "category": "review", "dependencies": ["task-1"]}}
            ]""")

        raw = _call_llm(prompt)
        if raw:
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                logger.warning("LLM decompose_llm returned non-JSON response; falling back to empty subtask list")
        return []

    def decompose_keyword(self, text: str, categories: list[str]) -> list[dict[str, str]]:
        """Fallback: create one sub-task per identified category."""
        subtasks = []
        for cat in categories[:3]:  # Max 3 sub-tasks from keywords
            subtasks.append(
                {
                    "description": f"[{cat}] {text}",
                    "category": cat,
                    "dependencies": [],
                }
            )
        return subtasks if len(subtasks) > 1 else []

    def decompose(self, text: str) -> list[SubTask]:
        """Decompose a task into sub-tasks. Returns empty list if no decomposition needed."""
        classification = self.classifier.classify(text)
        if not self.should_decompose(text, classification):
            return [SubTask.create(text, classification.get("primary"))]

        # Try LLM decomposition, fallback to keyword-based
        raw_subtasks = self.decompose_llm(text)
        if not raw_subtasks:
            categories = classification.get("all_matches", [TaskCategory.GENERAL.value])
            raw_subtasks = self.decompose_keyword(text, categories)
        if not raw_subtasks:
            return [SubTask.create(text, classification.get("primary"))]

        return [SubTask.create(st["description"], st["category"]) for st in raw_subtasks]


# ── Delegation Router ──────────────────────────────────────────────────────


class DelegationRouter:
    """Main entry point for multi-agent task delegation.

    Receives a task, classifies it, optionally decomposes it, selects the best
    agent(s), and routes the work. Integrates with AgentRegistry for agent
    discovery and TaskDecomposer for task splitting.

    Usage:
        router = DelegationRouter()
        result = router.route("research the latest on RAG architectures")
    """

    def __init__(self, registry: AgentRegistry | None = None):
        self.registry = registry or AgentRegistry()
        self.classifier = TaskClassifier()
        self.decomposer = TaskDecomposer()
        self._task_log: list[TaskLogEntry] = []
        self._load_task_log()

    def _load_task_log(self) -> None:
        if TASK_LOG_PATH.exists():
            try:
                with open(TASK_LOG_PATH) as f:
                    data = json.load(f)
                self._task_log = data.get("tasks", [])
            except (json.JSONDecodeError, KeyError):
                self._task_log = []

    def _save_task_log(self) -> None:
        TASK_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(TASK_LOG_PATH, "w") as f:
            json.dump(
                {"tasks": self._task_log[-500:], "total": len(self._task_log)},
                f,
                indent=2,
            )

    def classify_task(self, text: str) -> ClassificationResult:
        """Classify a task into categories without routing it."""
        return self.classifier.classify(text)

    def select_agent_for_task(
        self,
        text: str,
        classification: ClassificationResult | None = None,
    ) -> AgentEntry | None:
        """Find the best agent for a task based on classification and routing."""
        if classification is None:
            classification = self.classifier.classify(text)

        category = classification.get("primary", TaskCategory.GENERAL.value)
        preferred_role = CATEGORY_TO_ROLE.get(TaskCategory(category), AgentRole.GENERAL)

        # Try role-specific agent first
        agent = self.registry.select_agent(
            strategy=RoutingStrategy.PERFORMANCE_SCORED,
            role=preferred_role,
        )
        if agent:
            return agent

        # Fallback: any idle agent
        return self.registry.select_agent(
            strategy=RoutingStrategy.LEAST_LOADED,
        )

    def route(
        self,
        task_text: str,
        dry_run: bool = False,
        on_assign: Callable[[SubTask, AgentEntry], None] | None = None,
    ) -> RouteResult:
        """Route a task to the best available agent(s).

        Args:
            task_text: The user's task description.
            dry_run: If True, just show the routing plan without dispatching.
            on_assign: Optional callback(task, agent) called for each assignment.

        Returns:
            Dict with classification, subtasks, agent assignments, and status.
        """
        classification = self.classifier.classify(task_text)
        subtasks = self.decomposer.decompose(task_text)

        assignments = []
        for subtask in subtasks:
            agent = self.select_agent_for_task(
                subtask.description,
                {"primary": subtask.category},
            )
            if agent:
                subtask.assigned_agent = agent.agent_id
                subtask.status = "assigned"
                if not dry_run and on_assign:
                    on_assign(subtask, agent)
                assignments.append(
                    {
                        "subtask_id": subtask.task_id,
                        "subtask": subtask.description,
                        "category": subtask.category,
                        "agent_id": agent.agent_id,
                        "agent_name": agent.name,
                        "agent_role": agent.role,
                        "status": subtask.status,
                    }
                )
            else:
                subtask.status = "unassigned"
                assignments.append(
                    {
                        "subtask_id": subtask.task_id,
                        "subtask": subtask.description,
                        "category": subtask.category,
                        "agent_id": None,
                        "agent_name": None,
                        "agent_role": None,
                        "status": "unassigned_no_agents",
                    }
                )

        result = {
            "classification": classification,
            "subtasks": len(subtasks),
            "assignments": assignments,
            "is_decomposed": len(subtasks) > 1,
            "routed_at": datetime.now(timezone.utc).isoformat(),
        }

        self._task_log.append(result)
        self._save_task_log()
        return result

    def get_task_log(self, limit: int = 20) -> list[TaskLogEntry]:
        """Get recent task routing history."""
        return self._task_log[-limit:]

    def get_delegation_state(self) -> DelegationState:
        """Return a summary of the current delegation system state."""
        active_tasks = sum(1 for log in self._task_log for a in log.get("assignments", []) if a.get("status") is None)
        return {  # type: ignore[typeddict-item,typeddict-unknown-key]
            "registry_stats": self.registry.stats(),
            "recent_tasks": len(self._task_log),
            "active_assignments": active_tasks,
            "decomposition_enabled": True,
            "classifiers": ["keyword", "llm"],
            "routing_strategies": [s.value for s in RoutingStrategy],
        }


# ── CLI entry point ────────────────────────────────────────────────────────


def main() -> None:
    """CLI interface for task delegation."""
    import argparse

    parser = argparse.ArgumentParser(description="Hermes Delegation Router CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    p_classify = sub.add_parser("classify", help="Classify a task")
    p_classify.add_argument("text", nargs="+", help="Task description")

    p_route = sub.add_parser("route", help="Route a task to agents")
    p_route.add_argument("text", nargs="+", help="Task description")
    p_route.add_argument("--dry-run", action="store_true", help="Show plan without dispatching")

    p_state = sub.add_parser("state", help="Show delegation system state")
    p_log = sub.add_parser("log", help="Show recent task routing log")
    p_log.add_argument("--limit", type=int, default=10)

    args = parser.parse_args()
    router = DelegationRouter()

    if args.command == "classify":
        text = " ".join(args.text)
        result = router.classify_task(text)
        print(json.dumps(result, indent=2))

    elif args.command == "route":
        text = " ".join(args.text)
        result = router.route(text, dry_run=getattr(args, "dry_run", False))
        print(json.dumps(result, indent=2))

    elif args.command == "state":
        state = router.get_delegation_state()
        print(json.dumps(state, indent=2))

    elif args.command == "log":
        log = router.get_task_log(limit=args.limit)
        print(json.dumps(log, indent=2))


if __name__ == "__main__":
    main()
