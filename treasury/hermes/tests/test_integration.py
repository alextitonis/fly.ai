"""Integration tests: verify scripts import hermes_screener modules correctly."""

import ast
import os
from pathlib import Path

import pytest

os.environ.setdefault("HERMES_HOME", "/tmp/test_hermes")
# Clear env keys that leak into settings
for key in [
    "COINGECKO_API_KEY",
    "ETHERSCAN_API_KEY",
    "GMGN_API_KEY",
    "SURF_API_KEY",
    "DEFI_API_KEY",
    "ZERION_API_KEY",
    "LOG_LEVEL",
]:
    os.environ.pop(key, None)

SCRIPTS_DIR = Path(__file__).parent.parent / "scripts"
SCRIPT_NAMES = [
    "token_enricher.py",
    "wallet_tracker.py",
    "telegram_scraper.py",
    "token_discovery.py",
    "smart_money_research.py",
    "db_maintenance.py",
]


def _parse_script(name: str) -> ast.Module:
    """Parse a script file into an AST."""
    path = SCRIPTS_DIR / name
    assert path.exists(), f"Script not found: {path}"
    return ast.parse(path.read_text(), filename=str(path))


def _get_imports(tree: ast.Module) -> list[str]:
    """Extract all import module names from AST."""
    imports = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.append(alias.name)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imports.append(node.module)
    return imports


def _get_call_names(tree: ast.Module) -> list[str]:
    """Extract all function call names from AST."""
    calls = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute):
                calls.append(ast.dump(node.func))
            elif isinstance(node.func, ast.Name):
                calls.append(node.func.id)
    return calls


@pytest.mark.parametrize("script", SCRIPT_NAMES)
def test_script_imports_hermes_config(script):
    """Every script imports hermes_screener.config."""
    tree = _parse_script(script)
    imports = _get_imports(tree)
    assert "hermes_screener.config" in imports, f"{script} missing hermes_screener.config import"


@pytest.mark.parametrize("script", SCRIPT_NAMES)
def test_script_imports_hermes_logging(script):
    """Every script imports hermes_screener.logging."""
    tree = _parse_script(script)
    imports = _get_imports(tree)
    assert "hermes_screener.logging" in imports, f"{script} missing hermes_screener.logging import"


@pytest.mark.parametrize("script", SCRIPT_NAMES)
def test_script_imports_hermes_metrics(script):
    """Every script imports hermes_screener.metrics."""
    tree = _parse_script(script)
    imports = _get_imports(tree)
    assert "hermes_screener.metrics" in imports, f"{script} missing hermes_screener.metrics import"


@pytest.mark.parametrize("script", SCRIPT_NAMES)
def test_script_no_load_dotenv(script):
    """No script imports dotenv or calls load_dotenv."""
    tree = _parse_script(script)
    imports = _get_imports(tree)
    assert "dotenv" not in imports, f"{script} still imports dotenv"
    # Check for load_dotenv calls
    source = (SCRIPTS_DIR / script).read_text()
    assert "load_dotenv" not in source, f"{script} still calls load_dotenv"


@pytest.mark.parametrize("script", SCRIPT_NAMES)
def test_script_no_os_getenv(script):
    """No script uses os.getenv() for configuration."""
    source = (SCRIPTS_DIR / script).read_text()
    assert "os.getenv" not in source, f"{script} still uses os.getenv"


@pytest.mark.parametrize("script", SCRIPT_NAMES)
def test_script_no_stdlib_logging(script):
    """No script uses stdlib logging.basicConfig or logging.getLogger."""
    source = (SCRIPTS_DIR / script).read_text()
    assert "logging.basicConfig" not in source, f"{script} still uses logging.basicConfig"
    assert "logging.getLogger" not in source, f"{script} still uses logging.getLogger"
    assert "import logging" not in source, f"{script} still imports logging"


@pytest.mark.parametrize("script", SCRIPT_NAMES)
def test_script_calls_start_metrics(script):
    """Every script calls start_metrics_server()."""
    source = (SCRIPTS_DIR / script).read_text()
    assert "start_metrics_server()" in source, f"{script} missing start_metrics_server() call"


@pytest.mark.parametrize("script", SCRIPT_NAMES)
def test_script_uses_get_logger(script):
    """Every script calls get_logger()."""
    source = (SCRIPTS_DIR / script).read_text()
    assert "get_logger(" in source, f"{script} missing get_logger() call"


@pytest.mark.parametrize("script", SCRIPT_NAMES)
def test_script_uses_settings(script):
    """Every script references settings.* for config."""
    source = (SCRIPTS_DIR / script).read_text()
    assert "settings." in source, f"{script} missing settings.* references"
