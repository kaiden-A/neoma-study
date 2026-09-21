"""Send the reminder digest (or a dry run) from a scheduler or a terminal.

Usage:
  uv run python scripts/send_reminders.py --dry-run
  uv run python scripts/send_reminders.py
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # noqa: E402
from app.services import reminder_services  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Send Neoma reminder digests.")
    parser.add_argument("--dry-run", action="store_true", help="Count recipients without sending.")
    args = parser.parse_args()

    with SessionLocal() as db:
        result = reminder_services.send_reminders(db, dry_run=args.dry_run)
    print(result)


if __name__ == "__main__":
    main()
