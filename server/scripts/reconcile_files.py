"""Reconcile the R2 bucket with the files table.

Reports objects no `files` row references (strays from a failed delete or an
abandoned upload) and rows whose objects are missing from R2 (broken previews).
Nothing is deleted unless --delete is passed.

Usage:
  uv run python scripts/reconcile_files.py
  uv run python scripts/reconcile_files.py --delete
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models import FileObject  # noqa: E402
from app.services.storage_services import get_storage  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Reconcile R2 objects with the Neoma files table.")
    parser.add_argument("--delete", action="store_true", help="Delete stray objects from R2.")
    parser.add_argument("--limit", type=int, default=20, help="How many keys to print per list.")
    args = parser.parse_args()

    storage = get_storage()
    if not storage.configured:
        raise SystemExit("R2 is not configured; set the R2_* variables in server/.env.")

    with SessionLocal() as db:
        rows = db.execute(select(FileObject.key, FileObject.thumb_key)).all()
    known = {row[0] for row in rows if row[0]}
    known.update(row[1] for row in rows if row[1])

    remote: set[str] = set()
    paginator = storage.client().get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=storage.bucket):
        for item in page.get("Contents", []):
            remote.add(str(item["Key"]))

    strays = sorted(remote - known)
    missing = sorted(known - remote)

    print(
        f"R2 objects: {len(remote)} · referenced by files: {len(known)}"
        f" · strays: {len(strays)} · referenced but missing: {len(missing)}"
    )
    for key in strays[: args.limit]:
        print(f"  stray: {key}")
    if len(strays) > args.limit:
        print(f"  ... and {len(strays) - args.limit} more strays")
    for key in missing[: args.limit]:
        print(f"  referenced but missing from R2: {key}")
    if len(missing) > args.limit:
        print(f"  ... and {len(missing) - args.limit} more missing")

    if not args.delete:
        print("Dry run. Re-run with --delete to remove the strays.")
        return

    for key in strays:
        storage.delete(key)
    print(f"Deleted {len(strays)} stray objects.")


if __name__ == "__main__":
    main()
