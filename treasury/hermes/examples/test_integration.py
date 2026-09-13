#!/usr/bin/env python3
"""
Example script to test the token integration pipeline.
This demonstrates how to use the token integration system.
"""

import sys
from pathlib import Path

# Add the scripts directory to path
sys.path.insert(0, str(Path(__file__).parent))


def test_basic_functionality():
    """Test basic functionality of the token integration system."""
    print("=== Testing Token Integration Pipeline ===")

    # Test 1: Check if we can import the modules
    print("\n1. Testing imports...")
    try:
        from token_integration import TokenIntegrationPipeline

        print("  ✓ Successfully imported TokenIntegrationPipeline")
    except ImportError as e:
        print(f"  ✗ Failed to import: {e}")
        return False

    # Test 2: Check if we can create a pipeline instance
    print("\n2. Testing pipeline creation...")
    try:
        TokenIntegrationPipeline()
        print("  ✓ Successfully created pipeline instance")
    except Exception as e:
        print(f"  ✗ Failed to create pipeline: {e}")
        return False

    # Test 3: Check if databases exist
    print("\n3. Checking databases...")
    db_paths = [
        Path.home() / ".hermes" / "call_channels.db",
        Path.home() / ".hermes" / "data" / "central_contracts.db",
        Path.home() / ".hermes" / "data" / "integrated_tokens.db",
    ]

    for db_path in db_paths:
        if db_path.exists():
            print(f"  ✓ {db_path.name} exists")
        else:
            print(f"  ✗ {db_path.name} missing")

    # Test 4: Check if scripts are executable
    print("\n4. Checking scripts...")
    scripts = [
        "token_integration.py",
        "enhanced_token_discovery.py",
        "simple_token_discovery.py",
        "weekly_call_channel_discovery.py",
    ]

    for script in scripts:
        script_path = Path(__file__).parent / script
        if script_path.exists():
            print(f"  ✓ {script} exists")
        else:
            print(f"  ✗ {script} missing")

    # Test 5: Check if we can read from databases
    print("\n5. Testing database access...")
    try:
        import sqlite3

        # Test call_channels.db
        db_path = Path.home() / ".hermes" / "call_channels.db"
        if db_path.exists():
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM discovered_tokens")
            count = cursor.fetchone()[0]
            print(f"  ✓ call_channels.db: {count} tokens")
            conn.close()

        # Test integrated_tokens.db
        db_path = Path.home() / ".hermes" / "data" / "integrated_tokens.db"
        if db_path.exists():
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM integrated_tokens")
            count = cursor.fetchone()[0]
            print(f"  ✓ integrated_tokens.db: {count} tokens")
            conn.close()

    except Exception as e:
        print(f"  ✗ Database error: {e}")

    print("\n=== Test Complete ===")
    print("\nTo run the full integration:")
    print("  python3 scripts/token_integration.py")
    print("\nTo run enhanced discovery:")
    print("  python3 scripts/enhanced_token_discovery.py")
    print("\nFor more information, see TOKEN_INTEGRATION_README.md")

    return True


if __name__ == "__main__":
    success = test_basic_functionality()
    sys.exit(0 if success else 1)
