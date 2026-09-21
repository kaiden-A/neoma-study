"""Dev smoke helper: mint a real session for manual API checks, then clean up.

Usage:
  uv run python scripts/smoke_session.py mint
  uv run python scripts/smoke_session.py clean
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models import Group, GroupMember, User  # noqa: E402
from app.services import auth_services  # noqa: E402

EMAIL = "smoke@neoma.test"


def main() -> None:
    action = sys.argv[1] if len(sys.argv) > 1 else "mint"
    settings = get_settings()
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == EMAIL))
        if action == "clean":
            if user is not None:
                db.delete(user)
            placeholder = db.scalar(select(User).where(User.email == "maya@student.edu"))
            if placeholder is not None:
                db.delete(placeholder)
            db.commit()
            print("cleaned")
            return
        if user is None:
            user = User(
                email=EMAIL,
                display_name="Smoke Tester",
                color="mint",
                zitadel_sub="smoke-sub",
                idp_issuer=settings.zitadel_issuer.rstrip("/"),
            )
            db.add(user)
            db.commit()
        token = auth_services.create_session(db, user, settings=settings)
        groups = db.scalars(select(Group).where(Group.owner_id == user.id)).all()
        memberships = db.scalars(select(GroupMember).where(GroupMember.user_id == user.id)).all()
        print(token)
        print(f"user={user.id} groups={len(groups)} memberships={len(memberships)}")


if __name__ == "__main__":
    main()
