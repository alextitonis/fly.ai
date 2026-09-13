"""Hermes Multi-Agent Delegation — Holos-inspired agent orchestration.

Modules:
  - registry: Agent lifecycle management and persistent registry
  - delegation_router: Task classification, decomposition, and routing
"""

from .delegation_router import DelegationRouter, TaskClassifier, TaskDecomposer
from .registry import AgentRegistry, AgentRole, AgentStatus, RoutingStrategy

__all__ = [
    "AgentRegistry",
    "AgentRole",
    "AgentStatus",
    "RoutingStrategy",
    "DelegationRouter",
    "TaskClassifier",
    "TaskDecomposer",
]
