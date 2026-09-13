#!/usr/bin/env python3
"""CLI wrapper for hermes_screener.trading.polymarket_complete_set_bot."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from hermes_screener.trading.polymarket_complete_set_bot import main

if __name__ == "__main__":
    main()
