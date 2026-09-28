"""Extract text for files uploaded before extraction existed.

Best-effort: a parser failure skips the row and is logged, never fatal. Files
that already have text are left alone unless --force is passed.

Dry-run by default; --apply writes the extracted text.

Usage:
  uv run python scripts/reindex_text.py
  uv run python scripts/reindex_text.py --apply
  uv run python scripts/reindex_text.py --apply --force
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models import FileObject  # noqa: E402
from app.services import extract_services  # noqa: E402
from app.services.storage_services import get_storage  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract searchable text for existing files.")
    parser.add_argument("--apply", action="store_true", help="Write the extracted text (default: dry run).")
    parser.add_argument("--force", action="store_true", help="Re-extract files that already have text.")
    args = parser.parse_args()

    storage = get_storage()
    if not storage.configured:
        raise SystemExit("R2 is not configured; set the R2_* variables in server/.env.")

    candidates = 0
    extracted = 0
    with SessionLocal() as db:
        rows = db.scalars(select(FileObject).order_by(FileObject.created_at)).all()
        for record in rows:
            if not extract_services.supports(record.content_type):
                continue
            if record.extracted_text and not args.force:
                continue
            if record.size > extract_services.MAX_EXTRACT_BYTES:
                print(f"skip (too large): {record.name}")
                continue
            candidates += 1
            print(f"{record.content_type:60s} {record.name}")
            if args.apply and extract_services.extract_file_text(db, storage, record):
                extracted += 1

    if args.apply:
        print(f"Extracted text for {extracted} of {candidates} candidate files.")
    else:
        print(f"Dry run: {candidates} files would be indexed. Re-run with --apply.")


if __name__ == "__main__":
    main()
