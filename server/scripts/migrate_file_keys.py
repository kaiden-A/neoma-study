"""Give existing R2 keys an extension so Office files preview.

Older uploads stored `users/{id}/{file_id}` with no extension. The online
Office viewer detects the file type from the URL path, so those decks and
documents show "no preview". This copies each such object to a key carrying
its sanitized extension (thumbs move with it), updates the row and deletes the
old object. Only keys without an extension are touched, so it is safe to run
twice.

Dry-run by default; --apply performs the copies.

Usage:
  uv run python scripts/migrate_file_keys.py
  uv run python scripts/migrate_file_keys.py --apply
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models import FileObject  # noqa: E402
from app.services import file_services  # noqa: E402
from app.services.storage_services import get_storage  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Add file extensions to existing R2 keys.")
    parser.add_argument("--apply", action="store_true", help="Perform the copies (default: dry run).")
    args = parser.parse_args()

    storage = get_storage()
    if not storage.configured:
        raise SystemExit("R2 is not configured; set the R2_* variables in server/.env.")

    candidates = 0
    with SessionLocal() as db:
        for record in db.scalars(select(FileObject).order_by(FileObject.created_at)):
            if Path(record.key).suffix:
                continue
            new_key = file_services.file_key(record.key, record.name)
            if new_key == record.key:
                continue
            candidates += 1
            print(f"{record.key} -> {new_key}")
            if not args.apply:
                continue
            if storage.head(record.key) is None and storage.head(new_key) is None:
                print("  skipped: object is missing from R2")
                continue
            if storage.head(new_key) is None:
                storage.copy(record.key, new_key)
            if record.thumb_key:
                new_thumb = f"{new_key}-thumb"
                if storage.head(new_thumb) is None and storage.head(record.thumb_key) is not None:
                    storage.copy(record.thumb_key, new_thumb)
                record.thumb_key = new_thumb
            storage.delete(record.key)
            record.key = new_key
        if args.apply:
            db.commit()

    if args.apply:
        print(f"Updated {candidates} file keys.")
    else:
        print(f"Dry run: {candidates} file keys would change. Re-run with --apply.")


if __name__ == "__main__":
    main()
