"""Dump the iTa'leem web-service shapes Neoma mirrors.

This is the Phase A spike: it proves the token works and captures the exact
JSON the sync code must parse. It never writes the token to disk.

Usage:
  uv run --directory server python scripts/moodle_spike.py --token <32 chars>
  uv run --directory server python scripts/moodle_spike.py --link "neoma://token=..."
  MOODLE_TOKEN=... uv run --directory server python scripts/moodle_spike.py --download

Get the token from the connect page while signed in:
  https://italeemc.iium.edu.my/admin/tool/mobile/launch.php
    ?service=moodle_mobile_app&passport=123456&urlscheme=neoma&confirmed=1
Right-click "click here to launch the app" -> Copy link, then pass that link.
"""

import argparse
import json
import os
import re
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services import moodle_services  # noqa: E402

FIXTURE_DIR = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "moodle"


def _save(name: str, payload: object, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    (out / name).write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect the iTa'leem mobile web service.")
    parser.add_argument("--token", default=os.environ.get("MOODLE_TOKEN", ""))
    parser.add_argument("--link", default="", help="A neoma://token=... connect link.")
    parser.add_argument("--out", type=Path, default=FIXTURE_DIR)
    parser.add_argument("--download", action="store_true", help="Download the first file found.")
    parser.add_argument("--all-courses", action="store_true", help="Fetch assignments for every course.")
    args = parser.parse_args()

    raw = args.link or args.token
    if not raw:
        parser.error("pass --link, --token, or set MOODLE_TOKEN")

    token = moodle_services.parse_token(raw)
    api = moodle_services.client(token)
    site = api.site_info()
    functions = [str(row.get("name")) for row in site.get("functions") or [] if isinstance(row, dict)]
    print(f"Site: {site.get('sitename')} ({site.get('release')})")
    print(f"User: {site.get('username')} (id {site.get('userid')})")
    print(f"Functions: {len(functions)}")
    for needed in (
        "core_enrol_get_users_courses",
        "mod_assign_get_assignments",
        "core_course_get_contents",
        "core_calendar_get_action_events_by_timesort",
        "gradereport_user_get_grade_items",
    ):
        print(f"  {'ok ' if needed in functions else 'MISSING'} {needed}")

    courses = api.courses(int(site.get("userid") or 0))
    print(f"Courses: {len(courses)}")
    selected = courses if args.all_courses else courses[:3]
    assignments = api.assignments([int(row["id"]) for row in selected])
    assignment_count = sum(
        len(row.get("assignments") or []) for row in assignments.get("courses") or []
    )
    print(f"Assignments: {assignment_count}")

    submission: dict = {}
    first_assignment = next(
        (
            row
            for course in assignments.get("courses") or []
            for row in course.get("assignments") or []
        ),
        None,
    )
    if first_assignment is not None and site.get("userid"):
        submission = api.submission_status(int(first_assignment["id"]), int(site["userid"]))
        state = ((submission.get("lastattempt") or {}).get("submission") or {}).get("status")
        print(f"First submission status: {state or 'not submitted'}")

    outline: list[dict] = []
    if selected:
        course = selected[0]
        print(f"Outline: {course.get('shortname')} (id {course.get('id')})")
        outline = api.course_contents(int(course["id"]))
        print(f"  sections: {len(outline)}")

    events = api.action_events(datetime.now(UTC) - timedelta(days=1), datetime.now(UTC) + timedelta(days=120))
    print(f"Action events: {len(events)}")

    _save("site.json", site, args.out)
    _save("courses.json", courses, args.out)
    _save("assignments.json", assignments, args.out)
    _save("submission.json", submission, args.out)
    _save("outline.json", outline, args.out)
    _save("events.json", events, args.out)
    print(f"Fixtures: {args.out}")

    if args.download:
        for section in outline:
            for module in section.get("modules") or []:
                for content in module.get("contents") or []:
                    if content.get("type") == "file" and content.get("fileurl"):
                        data, content_type = api.download(str(content["fileurl"]))
                        safe = re.sub(r"[^A-Za-z0-9._-]+", "_", str(content.get("filename") or "file"))
                        target = args.out / "sample" / safe
                        target.parent.mkdir(parents=True, exist_ok=True)
                        target.write_bytes(data)
                        print(f"Downloaded {safe} ({len(data)} bytes, {content_type})")
                        return
        print("No downloadable file found in the first course.")


if __name__ == "__main__":
    main()
