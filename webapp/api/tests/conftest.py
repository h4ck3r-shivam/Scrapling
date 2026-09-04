"""Pytest configuration: make ``app`` importable."""
from __future__ import annotations

import sys
from pathlib import Path

# Add the webapp/api directory so ``import app.*`` works
_API_DIR = Path(__file__).resolve().parent.parent
if str(_API_DIR) not in sys.path:
    sys.path.insert(0, str(_API_DIR))