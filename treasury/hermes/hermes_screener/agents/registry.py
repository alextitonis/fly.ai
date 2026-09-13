"""Hermes Local Agent Registry — inspired by Holos multi-agent system.

Maintains a registry of local agent profiles (sub-agents) that can be spawned
for delegated tasks. Each agent entry declares its capabilities, allowed tools,
model configuration, and current status. The registry persists to JSON and
supports CRUD operations with validation.

Key concepts from Holos paper:
  - Web-scale multi-agent system with decentralized task routing
  - Agent specialization via capability declarations
  - State tracking for agent lifecycle management
"""

from __future__ import annotations

import json
import os
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, TypedDict


class RegistryStats(TypedDict):
    total_agents: int
    status_breakdown: dict[str, int]
    role_breakdown: dict[str, int]
    total_tasks_processed: int
    overall_success_rate: str
    registry_path: str


# ── Constants ──────────────────────────────────────────────────────────────

HERMES_HOME = os.environ.get(
    "HERMES_HOME",
    os.path.join(os.path.expanduser("~"), ".hermes"),
)
REGISTRY_PATH = Path(HERMES_HOME) / "agents" / "registry_data.json"


# ── Enums ──────────────────────────────────────────────────────────────────


class AgentStatus(str, Enum):
    """Lifecycle states for a registered agent."""

    REGISTERED = "registered"
    IDLE = "idle"
    BUSY = "busy"
    PAUSED = "paused"
    ERROR = "error"
    DECOMMISSIONED = "decommissioned"


class AgentRole(str, Enum):
    """Specialization roles agents can play."""

    GENERAL = "general"
    RESEARCHER = "researcher"
    CODER = "coder"
    REVIEWER = "reviewer"
    PLANNER = "planner"
    ORCHESTRATOR = "orchestrator"
    WEB_AGENT = "web_agent"
    DATA_AGENT = "data_agent"
    SECURITY_AGENT = "security_agent"


class RoutingStrategy(str, Enum):
    """Strategies for selecting an agent for a task."""

    LEAST_LOADED = "least_loaded"
    RANDOM = "random"
    ROUND_ROBIN = "round_robin"
    CAPABILITY_MATCH = "capability_match"
    PERFORMANCE_SCORED = "performance_scored"


# ── Data Classes ───────────────────────────────────────────────────────────


@dataclass
class AgentCapabilities:
    """Declarative capability record for an agent instance."""

    can_browse: bool = False
    can_execute_code: bool = False
    can_manage_files: bool = True
    can_run_terminal: bool = True
    can_use_tools: bool = False
    supports_vision: bool = False
    max_context_length: int = 4096
    supported_toolsets: list[str] = field(default_factory=list)
    language_model: str = ""


@dataclass
class AgentMetrics:
    """Performance tracking for routing decisions."""

    tasks_completed: int = 0
    tasks_failed: int = 0
    total_runtime_seconds: float = 0.0
    avg_task_time_seconds: float = 0.0
    success_rate: float = 1.0
    last_task_at: str = ""
    last_task_status: str = ""
    performance_score: float = 1.0  # Composite: 0.0 - 1.0

    def update(self, success: bool, duration_seconds: float) -> None:
        if success:
            self.tasks_completed += 1
        else:
            self.tasks_failed += 1
        self.total_runtime_seconds += duration_seconds
        total = self.tasks_completed + self.tasks_failed
        self.avg_task_time_seconds = self.total_runtime_seconds / total if total else 0.0
        self.success_rate = self.tasks_completed / total if total else 1.0
        last = datetime.now(timezone.utc).isoformat()
        self.last_task_at = last
        self.last_task_status = "success" if success else "failed"
        self.performance_score = self._calculate_score()

    def _calculate_score(self) -> float:
        """Composite performance score: weighted blend of success rate and volume."""
        volume_weight = min(self.tasks_completed / 20.0, 1.0)  # saturates at 20 tasks
        return self.success_rate * 0.7 + volume_weight * 0.3


@dataclass
class AgentEntry:
    """A single agent registration in the multi-agent system."""

    agent_id: str
    name: str
    role: str  # AgentRole value
    status: str  # AgentStatus value
    capabilities: AgentCapabilities
    metrics: AgentMetrics
    created_at: str
    last_updated: str
    metadata: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def create(
        cls,
        name: str,
        role: str = AgentRole.GENERAL,
        model: str = "",
        capabilities: AgentCapabilities | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AgentEntry:
        now = datetime.now(timezone.utc).isoformat()
        caps = capabilities or AgentCapabilities(language_model=model)
        return cls(
            agent_id=str(uuid.uuid4())[:8],
            name=name,
            role=role,
            status=AgentStatus.REGISTERED,
            capabilities=caps,
            metrics=AgentMetrics(),
            created_at=now,
            last_updated=now,
            metadata=metadata or {},
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> AgentEntry:
        caps_data = data.pop("capabilities", {})
        metrics_data = data.pop("metrics", {})
        caps = AgentCapabilities(**caps_data) if caps_data else AgentCapabilities()
        metrics = AgentMetrics(**metrics_data) if metrics_data else AgentMetrics()
        return cls(
            capabilities=caps,
            metrics=metrics,
            **{k: v for k, v in data.items()},
        )


# ── Registry ───────────────────────────────────────────────────────────────


class AgentRegistry:
    """Persistent registry of local sub-agents for multi-agent delegation.

    Manages the lifecycle of registered agents: creation, status transitions,
    capability queries, and metrics tracking. All state is persisted to JSON.

    Inspired by the Holos architecture pattern for decentralized multi-agent
    task routing with specialized agent registries.
    """

    def __init__(self, registry_path: str | None = None):
        self._path = Path(registry_path) if registry_path else REGISTRY_PATH
        self._agents: dict[str, AgentEntry] = {}
        self._round_robin_index = 0
        self._load()

    # -- Persistence --------------------------------------------------------

    def _load(self) -> None:
        if self._path.exists():
            try:
                with open(self._path) as f:
                    data = json.load(f)
                for entry_data in data.get("agents", []):
                    agent = AgentEntry.from_dict(entry_data)
                    self._agents[agent.agent_id] = agent
                self._round_robin_index = data.get("round_robin_index", 0)
            except (json.JSONDecodeError, KeyError, TypeError):
                self._agents = {}

    def save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "agents": [a.to_dict() for a in self._agents.values()],
            "round_robin_index": self._round_robin_index,
            "last_saved": datetime.now(timezone.utc).isoformat(),
            "total_agents": len(self._agents),
        }
        with open(self._path, "w") as f:
            json.dump(data, f, indent=2)

    # -- CRUD operations ----------------------------------------------------

    def register(
        self,
        name: str,
        role: str = AgentRole.GENERAL,
        model: str = "",
        capabilities: AgentCapabilities | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AgentEntry:
        """Create and register a new agent entry."""
        agent = AgentEntry.create(name, role=role, model=model, capabilities=capabilities, metadata=metadata)
        # Deduplicate by name — replace existing agent with same name
        for existing in list(self._agents.values()):
            if existing.name == name:
                del self._agents[existing.agent_id]
                break
        self._agents[agent.agent_id] = agent
        self.save()
        return agent

    def get(self, agent_id: str) -> AgentEntry | None:
        """Look up an agent by its unique ID."""
        return self._agents.get(agent_id)

    def get_by_name(self, name: str) -> AgentEntry | None:
        """Look up an agent by name."""
        for agent in self._agents.values():
            if agent.name == name:
                return agent
        return None

    def update_status(self, agent_id: str, status: str) -> bool:
        """Transition an agent to a new lifecycle state."""
        agent = self._agents.get(agent_id)
        if not agent:
            return False
        agent.status = status
        agent.last_updated = datetime.now(timezone.utc).isoformat()
        self.save()
        return True

    def update_metrics(self, agent_id: str, success: bool, duration: float) -> bool:
        """Record task completion metrics for an agent."""
        agent = self._agents.get(agent_id)
        if not agent:
            return False
        agent.metrics.update(success, duration)
        agent.last_updated = datetime.now(timezone.utc).isoformat()
        self.save()
        return True

    def remove(self, agent_id: str) -> bool:
        """Mark an agent as decommissioned and hide it from queries."""
        agent = self._agents.get(agent_id)
        if not agent:
            return False
        agent.status = AgentStatus.DECOMMISSIONED
        self.save()
        return True

    def delete(self, agent_id: str) -> bool:
        """Permanently remove an agent entry."""
        return self._agents.pop(agent_id, None) is not None

    # -- Queries ------------------------------------------------------------

    def list_agents(
        self,
        status: str | None = None,
        role: str | None = None,
        active_only: bool = False,
    ) -> list[AgentEntry]:
        """List agents with optional filtering."""
        agents = list(self._agents.values())
        if status:
            agents = [a for a in agents if a.status == status]
        if role:
            agents = [a for a in agents if a.role == role]
        if active_only:
            agents = [
                a
                for a in agents
                if a.status
                not in (
                    AgentStatus.DECOMMISSIONED,
                    AgentStatus.ERROR,
                )
            ]
        return agents

    def find_by_capability(self, capability: str) -> list[AgentEntry]:
        """Find agents that declare a specific capability."""
        results = []
        for agent in self._agents.values():
            caps = agent.capabilities
            if (
                capability in caps.supported_toolsets
                or capability == "browse"
                and caps.can_browse
                or capability == "code"
                and caps.can_execute_code
                or capability == "vision"
                and caps.supports_vision
            ):
                results.append(agent)
        return results

    def list_all(self) -> list[dict[str, Any]]:
        """Return all agents as serializable summary dicts."""
        return [
            {
                "agent_id": a.agent_id,
                "name": a.name,
                "role": a.role,
                "status": a.status,
                "model": a.capabilities.language_model,
                "success_rate": f"{a.metrics.success_rate:.1%}",
                "tasks": a.metrics.tasks_completed + a.metrics.tasks_failed,
                "perf_score": f"{a.metrics.performance_score:.2f}",
            }
            for a in sorted(
                self._agents.values(),
                key=lambda a: a.metrics.tasks_completed,
                reverse=True,
            )
        ]

    # -- Routing helpers ----------------------------------------------------

    def select_agent(
        self,
        strategy: str = RoutingStrategy.LEAST_LOADED,
        role: str | None = None,
        capability: str | None = None,
    ) -> AgentEntry | None:
        """Select an agent for task delegation using a routing strategy.

        Strategies:
          - least_loaded: pick agent with fewest active tasks (idle agents preferred)
          - random: pick a random eligible agent
          - round_robin: cycle through eligible agents
          - capability_match: pick top performer matching required capability
          - performance_scored: pick highest performance score
        """
        import random

        candidates = self.list_agents(active_only=True)
        if role:
            candidates = [a for a in candidates if a.role == role]
        if capability:
            candidates = self.find_by_capability(capability)
            candidates = [a for a in candidates if a.status == AgentStatus.IDLE]

        if not candidates:
            return None

        if strategy == RoutingStrategy.LEAST_LOADED:
            return min(candidates, key=lambda a: a.metrics.tasks_failed)
        elif strategy == RoutingStrategy.RANDOM:
            return random.choice(candidates)
        elif strategy == RoutingStrategy.ROUND_ROBIN:
            idx = self._round_robin_index % len(candidates)
            self._round_robin_index += 1
            self.save()
            return candidates[idx]
        elif strategy == RoutingStrategy.CAPABILITY_MATCH:
            if candidates:
                return max(candidates, key=lambda a: a.metrics.performance_score)
        elif strategy == RoutingStrategy.PERFORMANCE_SCORED:
            return max(candidates, key=lambda a: a.metrics.performance_score)

        return candidates[0]

    # -- Bootstrap helpers --------------------------------------------------

    def bootstrap_default_agents(self) -> list[AgentEntry]:
        """Create a set of default specialized agents if registry is empty."""
        if self._agents:
            return list(self._agents.values())

        defaults = [
            (
                "researcher",
                AgentRole.RESEARCHER,
                "Research and web-based information gathering",
            ),
            ("coder", AgentRole.CODER, "Code generation and implementation tasks"),
            ("reviewer", AgentRole.REVIEWER, "Code review and quality validation"),
            (
                "planner",
                AgentRole.PLANNER,
                "Task decomposition and long-horizon planning",
            ),
            (
                "security",
                AgentRole.SECURITY_AGENT,
                "Security auditing and vulnerability scanning",
            ),
        ]
        created = []
        for name, role, desc in defaults:
            agent = self.register(
                name=name,
                role=role,
                metadata={"description": desc},
            )
            agent.status = AgentStatus.IDLE
            created.append(agent)
        self.save()
        return created

    # -- Statistics ---------------------------------------------------------

    def stats(self) -> dict[str, Any]:
        """Return aggregate statistics about the registry."""
        agents = list(self._agents.values())
        status_counts: dict[str, int] = {}
        role_counts: dict[str, int] = {}
        for a in agents:
            status_counts[a.status] = status_counts.get(a.status, 0) + 1
            role_counts[a.role] = role_counts.get(a.role, 0) + 1

        total_tasks = sum(a.metrics.tasks_completed + a.metrics.tasks_failed for a in agents)
        total_success = sum(a.metrics.tasks_completed for a in agents)
        overall_rate = total_success / total_tasks if total_tasks else 0.0

        return {
            "total_agents": len(agents),
            "status_breakdown": status_counts,
            "role_breakdown": role_counts,
            "total_tasks_processed": total_tasks,
            "overall_success_rate": f"{overall_rate:.1%}",
            "registry_path": str(self._path),
        }


# ── CLI entry point --------------------------------------------------------


def main() -> None:
    """Quick registry management from the command line."""
    import argparse

    parser = argparse.ArgumentParser(description="Hermes Agent Registry CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("list", help="List all registered agents")
    sub.add_parser("stats", help="Show registry statistics")
    sub.add_parser("bootstrap", help="Create default specialized agents")

    p_add = sub.add_parser("add", help="Register a new agent")
    p_add.add_argument("name", help="Agent name")
    p_add.add_argument("--role", default=AgentRole.GENERAL, choices=[r.value for r in AgentRole])
    p_add.add_argument("--model", default="", help="Model identifier")

    p_select = sub.add_parser("select", help="Select an agent for delegation")
    p_select.add_argument(
        "--strategy",
        default=RoutingStrategy.LEAST_LOADED,
        choices=[s.value for s in RoutingStrategy],
    )
    p_select.add_argument("--role", default=None, help="Filter by role")

    args = parser.parse_args()
    registry = AgentRegistry()

    if args.command == "list":
        for entry in registry.list_all():
            print(
                f"  {entry['agent_id']:8s}  {entry['name']:12s}  {entry['role']:15s}"
                f"  {entry['status']:14s}  tasks={entry['tasks']}  "
                f"win={entry['success_rate']}  perf={entry['perf_score']}"
            )

    elif args.command == "stats":
        for k, v in registry.stats().items():
            print(f"  {k}: {v}")

    elif args.command == "bootstrap":
        agents = registry.bootstrap_default_agents()
        print(f"  Bootstrapped {len(agents)} default agents:")
        for a in agents:
            print(f"    {a.agent_id}  {a.name}  ({a.role})")

    elif args.command == "add":
        agent = registry.register(args.name, role=args.role, model=args.model)
        print(f"  Registered: {agent.agent_id}  {agent.name}  ({agent.role})")

    elif args.command == "select":
        agent = registry.select_agent(strategy=args.strategy, role=args.role)
        if agent:
            print(f"  Selected: {agent.agent_id}  {agent.name}  ({agent.role})")
        else:
            print("  No eligible agents found.")


if __name__ == "__main__":
    main()
