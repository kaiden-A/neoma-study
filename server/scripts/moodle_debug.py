"""Call each iTa'leem web-service function directly and print status + body.

This is for diagnosing a Moodle HTTP 500. It loads the stored, encrypted token
and never prints it, the request URL or the `wstoken` field.

Usage:
  uv run --directory server python scripts/moodle_debug.py
  uv run --directory server python scripts/moodle_debug.py --email you@example.com
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # noqa: E402
from app.models import MoodleAccount, User  # noqa: E402
from app.services import crypto  # noqa: E402
from app.services.moodle_services import MOODLE_WWWROOT, _flatten  # noqa: E402


def call(
    http: httpx.Client, wwwroot: str, token: str, function: str, params: dict[str, Any]
) -> tuple[int, str]:
    data = {
        "wstoken": token,
        "wsfunction": function,
        "moodlewsrestformat": "json",
        **{key: str(value) for key, value in _flatten(params).items()},
    }
    response = http.post(f"{wwwroot}/webservice/rest/server.php", data=data, timeout=30)
    return response.status_code, response.text


def show(label: str, status: int, body: str) -> None:
    snippet = " ".join(body.split())[:900]
    print(f"\n[{label}] HTTP {status}")
    print(f"  {snippet}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Diagnose iTa'leem web-service calls.")
    parser.add_argument("--email", default="", help="Neoma user email; defaults to the first account.")
    args = parser.parse_args()

    with SessionLocal() as db:
        query = select(MoodleAccount)
        if args.email:
            user = db.scalar(select(User).where(User.email == args.email.lower()))
            if user is None:
                print(f"No Neoma user with email {args.email!r}.")
                return
            query = query.where(MoodleAccount.user_id == user.id)
        account = db.scalar(query.order_by(MoodleAccount.created_at.asc()).limit(1))
        if account is None:
            print("No iTa'leem account is connected.")
            return
        token = crypto.decrypt_secret(account.token_enc, "moodle")
        user = db.get(User, account.user_id)
        wwwroot = account.wwwroot or MOODLE_WWWROOT
        print(f"Account: {user.email if user else account.user_id} ({wwwroot})")
        print(f"Moodle user id: {account.moodle_user_id} · release: {account.release}")

    if not token:
        print("The stored token could not be decrypted (APP_SECRET changed?). Reconnect.")
        return

    with httpx.Client(timeout=30, follow_redirects=True) as http:
        status, body = call(http, wwwroot, token, "core_webservice_get_site_info", {})
        show("site info", status, body)
        if status != 200:
            return
        try:
            info = json.loads(body)
        except ValueError:
            print("Site info did not return JSON; stopping.")
            return

        user_id = int(info.get("userid") or 0)
        courses_status, courses_body = call(
            http, wwwroot, token, "core_enrol_get_users_courses", {"userid": user_id}
        )
        show("courses", courses_status, courses_body)
        try:
            courses = json.loads(courses_body)
        except ValueError:
            courses = []
        course_ids = [int(row["id"]) for row in courses if isinstance(row, dict) and row.get("id")]

        assignments_status, assignments_body = call(
            http, wwwroot, token, "mod_assign_get_assignments", {"courseids": course_ids}
        )
        show("assignments", assignments_status, assignments_body)

        events_status, events_body = call(
            http,
            wwwroot,
            token,
            "core_calendar_get_action_events_by_timesort",
            {"timesortfrom": 0, "limitnum": 50},
        )
        show("action events", events_status, events_body)

        for course_id in course_ids:
            status, body = call(
                http, wwwroot, token, "core_course_get_contents", {"courseid": course_id}
            )
            show(f"contents {course_id}", status, body)


if __name__ == "__main__":
    main()
