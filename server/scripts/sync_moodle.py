"""Refresh every connected iTa'leem mirror from a scheduler or a terminal.

Usage:
  uv run python scripts/sync_moodle.py --dry-run
  uv run python scripts/sync_moodle.py
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # noqa: E402
from app.services import moodle_services  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync Neoma with iTa'leem.")
    parser.add_argument("--dry-run", action="store_true", help="Count accounts without writing.")
    parser.add_argument(
        "--notify",
        action="store_true",
        help="Scan announcements, files and grades and email new items.",
    )
    args = parser.parse_args()

    with SessionLocal() as db:
        result = moodle_services.sync_all(db, dry_run=args.dry_run, notify=args.notify)
    print(result)


if __name__ == "__main__":
    main()
