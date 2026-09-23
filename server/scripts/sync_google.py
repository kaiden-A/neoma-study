"""Push/pull every connected Google Calendar from a scheduler or a terminal.

Usage:
  uv run python scripts/sync_google.py --dry-run
  uv run python scripts/sync_google.py
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # noqa: E402
from app.services import google_services  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync Neoma with Google Calendar.")
    parser.add_argument("--dry-run", action="store_true", help="Count changes without writing.")
    args = parser.parse_args()

    with SessionLocal() as db:
        result = google_services.sync_all(db, dry_run=args.dry_run)
    print(result)


if __name__ == "__main__":
    main()
