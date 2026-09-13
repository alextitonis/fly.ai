"""Detect circular imports - fixed version."""
import ast
from pathlib import Path
from collections import defaultdict

ROOT = Path("/root/hermes-token-screener/hermes_screener")
PKG = "hermes_screener"

def module_path_to_name(path: Path) -> str:
    rel = path.relative_to(ROOT.parent)
    return ".".join(rel.with_suffix("").parts)

def parse_imports(path: Path) -> list:
    try:
        tree = ast.parse(path.read_text())
    except SyntaxError:
        return []
    imports = []
    module_name = module_path_to_name(path)

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.startswith(PKG):
                    imports.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.module is None:
                continue
            if node.level > 0:
                parts = module_name.split(".")
                base = parts[:-(node.level)]
                full = ".".join(base) + ("." + node.module if node.module else "")
                imports.append(full)
            elif node.module.startswith(PKG):
                imports.append(node.module)
    return list(set(imports))

graph: dict = defaultdict(list)
all_modules: set = set()

for py_file in ROOT.rglob("*.py"):
    mod = module_path_to_name(py_file)
    all_modules.add(mod)
    deps = parse_imports(py_file)
    graph[mod] = [d for d in deps if d != mod]  # remove self-loops separately

# Report self-loops
print("=== Self-import issues ===")
for py_file in ROOT.rglob("*.py"):
    mod = module_path_to_name(py_file)
    deps = parse_imports(py_file)
    if mod in deps:
        print(f"  SELF-IMPORT: {mod}")

# Normalize graph: map import targets to known modules
def resolve(dep):
    if dep in all_modules:
        return dep
    for m in all_modules:
        if m == dep or m.startswith(dep + "."):
            return m
    return None

norm_graph = {}
for mod in all_modules:
    resolved_deps = set()
    for dep in graph[mod]:
        r = resolve(dep)
        if r and r != mod:
            resolved_deps.add(r)
    norm_graph[mod] = list(resolved_deps)

# Cycle detection with proper backtracking
visited = set()
path_set = set()
cycles = []

def dfs(node, path):
    visited.add(node)
    path_set.add(node)
    for neighbor in norm_graph.get(node, []):
        if neighbor in path_set:
            idx = path.index(neighbor)
            cycles.append(path[idx:] + [neighbor])
        elif neighbor not in visited:
            dfs(neighbor, path + [node])
    path_set.discard(node)

for mod in sorted(all_modules):
    if mod not in visited:
        dfs(mod, [])

print("\n=== Circular Import Cycles ===")
if cycles:
    seen = set()
    for cycle in cycles:
        key = tuple(sorted(cycle))
        if key not in seen:
            seen.add(key)
            print("  CYCLE: " + " -> ".join(cycle))
else:
    print("  None found - import graph is a DAG.")
