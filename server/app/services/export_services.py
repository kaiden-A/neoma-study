"""Full-account export, import and the demo semester.

Export is a JSON snapshot of everything the user owns (files excluded: only
their metadata travels). Import replaces the user's own data; groups they own
are recreated with members matched by email, and their own copy of every note
is kept.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from ..models import (
    Event,
    FileObject,
    Group,
    GroupKind,
    GroupLink,
    GroupMember,
    GroupRole,
    GroupTopic,
    Note,
    NoteScope,
    NoteType,
    Subject,
    Task,
    TaskLink,
    TaskPriority,
    TaskStatus,
    TaskSubtask,
    User,
)
from ..utils import from_ms, to_ms
from . import access, file_services, storage_services
from .errors import InvalidError

EXPORT_VERSION = 1
MARKERS = ("amber", "mint", "sky", "coral", "violet", "pink")


def export_account(db: DbSession, user: User) -> dict[str, Any]:
    subjects = db.scalars(select(Subject).where(Subject.owner_id == user.id)).all()
    groups = db.scalars(select(Group).where(Group.owner_id == user.id)).all()
    group_ids = [group.id for group in groups]
    member_group_ids = list(
        db.scalars(select(GroupMember.group_id).where(GroupMember.user_id == user.id)).all()
    )
    all_group_ids = set(group_ids) | set(member_group_ids)

    tasks = db.scalars(
        select(Task).where(
            (Task.owner_id == user.id) | (Task.group_id.in_(all_group_ids) if all_group_ids else False)
        )
    ).all()
    notes = db.scalars(
        select(Note).where(
            (Note.owner_id == user.id) | (Note.group_id.in_(all_group_ids) if all_group_ids else False)
        )
    ).all()
    events = db.scalars(
        select(Event).where(
            (Event.owner_id == user.id) | (Event.group_id.in_(all_group_ids) if all_group_ids else False)
        )
    ).all()

    return {
        "app": "neoma",
        "version": EXPORT_VERSION,
        "exportedAt": datetime.now(UTC).isoformat(),
        "note": "Uploaded files are not part of this export; only their metadata is.",
        "data": {
            "profile": {
                "name": user.display_name,
                "email": user.email,
                "program": user.program,
                "color": user.color,
            },
            "subjects": [{"id": str(row.id), "name": row.name, "color": row.color} for row in subjects],
            "groups": [
                {
                    "id": str(group.id),
                    "kind": group.kind,
                    "name": group.name,
                    "subject": group.subject,
                    "color": group.color,
                    "description": group.description,
                    "inviteCode": group.invite_code,
                    "topics": [
                        {"id": str(topic.id), "name": topic.name, "color": topic.color}
                        for topic in db.scalars(
                            select(GroupTopic)
                            .where(GroupTopic.group_id == group.id)
                            .order_by(GroupTopic.position)
                        )
                    ],
                    "links": [
                        {"label": link.label, "url": link.url}
                        for link in db.scalars(
                            select(GroupLink)
                            .where(GroupLink.group_id == group.id)
                            .order_by(GroupLink.position)
                        )
                    ],
                    "members": [
                        member.email
                        for member in db.scalars(
                            select(User)
                            .join(GroupMember, GroupMember.user_id == User.id)
                            .where(GroupMember.group_id == group.id)
                        )
                        if member.email
                    ],
                }
                for group in groups
            ],
            "tasks": [
                {
                    "id": str(task.id),
                    "groupId": str(task.group_id) if task.group_id else None,
                    "title": task.title,
                    "description": task.description,
                    "dueAt": to_ms(task.due_at),
                    "status": task.status,
                    "priority": task.priority,
                    "assignees": [str(row.user_id) for row in task.assignees],
                    "subtasks": [
                        {"title": row.title, "done": row.done}
                        for row in sorted(task.subtasks, key=lambda item: item.position)
                    ],
                    "links": [
                        {"label": row.label, "url": row.url}
                        for row in sorted(task.links, key=lambda item: item.position)
                    ],
                }
                for task in tasks
            ],
            "notes": [
                {
                    "id": str(note.id),
                    "scope": note.scope,
                    "groupId": str(note.group_id) if note.group_id else None,
                    "subjectId": str(note.subject_id) if note.subject_id else None,
                    "topicId": str(note.topic_id) if note.topic_id else None,
                    "type": note.type,
                    "title": note.title,
                    "body": note.body,
                    "url": note.url,
                    "fileId": str(note.file_id) if note.file_id else None,
                    "pinned": note.pinned,
                    "tags": list(note.tags or []),
                    "createdAt": to_ms(note.created_at),
                    "updatedAt": to_ms(note.updated_at),
                }
                for note in notes
            ],
            "events": [
                {
                    "id": str(event.id),
                    "groupId": str(event.group_id) if event.group_id else None,
                    "title": event.title,
                    "type": event.type,
                    "startsAt": to_ms(event.starts_at),
                    "endsAt": to_ms(event.ends_at),
                    "location": event.location,
                    "reminderMinutes": event.reminder_minutes,
                    "notes": event.notes,
                }
                for event in events
            ],
        },
    }


def _uuid(value: Any) -> uuid.UUID | None:
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except ValueError:
        return None


def import_account(
    db: DbSession, user: User, payload: dict[str, Any], *, storage: storage_services.Storage
) -> dict[str, int]:
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        raise InvalidError("That file does not look like a Neoma export.")
    for key in ("groups", "tasks", "notes", "events"):
        if key in data and not isinstance(data[key], list):
            raise InvalidError("That file does not look like a Neoma export.")

    counts = {"subjects": 0, "groups": 0, "tasks": 0, "notes": 0, "events": 0}

    # Wipe the user's own data; memberships in other people's groups survive.
    # Blobs first: a group delete cascades its files rows, and a personal file
    # would be orphaned in R2 forever.
    for group in db.scalars(select(Group).where(Group.owner_id == user.id)):
        file_services.purge_group_files(db, storage, group.id)
    for file in db.scalars(
        select(FileObject).where(FileObject.owner_id == user.id, FileObject.group_id.is_(None))
    ):
        file_services.purge_file(db, storage, file)
    for note in db.scalars(select(Note).where(Note.owner_id == user.id)):
        db.delete(note)
    for task in db.scalars(select(Task).where(Task.owner_id == user.id)):
        db.delete(task)
    for event in db.scalars(select(Event).where(Event.owner_id == user.id)):
        db.delete(event)
    for subject in db.scalars(select(Subject).where(Subject.owner_id == user.id)):
        db.delete(subject)
    for group in db.scalars(select(Group).where(Group.owner_id == user.id)):
        db.delete(group)
    db.flush()

    subject_map: dict[str, uuid.UUID] = {}
    for index, row in enumerate(data.get("subjects", [])):
        subject = Subject(
            owner_id=user.id,
            name=str(row.get("name", "Subject"))[:120],
            color=str(row.get("color") or MARKERS[index % 6]),
            position=index,
        )
        db.add(subject)
        db.flush()
        subject_map[str(row.get("id"))] = subject.id
        counts["subjects"] += 1

    group_map: dict[str, uuid.UUID] = {}
    topic_map: dict[str, uuid.UUID] = {}
    for group_row in data.get("groups", []):
        group = Group(
            kind=GroupKind(group_row.get("kind", "project")),
            name=str(group_row.get("name", "Imported group"))[:160],
            subject=str(group_row.get("subject", ""))[:80],
            color=str(group_row.get("color") or "sky"),
            description=str(group_row.get("description", ""))[:2000],
            invite_code=str(group_row.get("inviteCode") or uuid.uuid4().hex[:8].upper())[:16],
            owner_id=user.id,
        )
        db.add(group)
        db.flush()
        access.add_member(db, group.id, user.id, GroupRole.owner)
        for email in group_row.get("members", []):
            if not isinstance(email, str) or email.lower() == (user.email or "").lower():
                continue
            member = db.scalar(select(User).where(User.email == email.lower()).limit(1))
            if member is not None and not access.is_member(db, group.id, member.id):
                access.add_member(db, group.id, member.id)
        for index, topic_row in enumerate(group_row.get("topics", [])):
            topic = GroupTopic(
                group_id=group.id,
                name=str(topic_row.get("name", "Topic"))[:80],
                color=str(topic_row.get("color") or MARKERS[index % 6]),
                position=index,
            )
            db.add(topic)
            db.flush()
            topic_map[str(topic_row.get("id"))] = topic.id
        for index, link_row in enumerate(group_row.get("links", [])):
            db.add(
                GroupLink(
                    group_id=group.id,
                    label=str(link_row.get("label", ""))[:160] or "Link",
                    url=str(link_row.get("url", ""))[:1000],
                    position=index,
                )
            )
        group_map[str(group_row.get("id"))] = group.id
        counts["groups"] += 1

    for task_row in data.get("tasks", []):
        group_id = group_map.get(str(task_row.get("groupId"))) if task_row.get("groupId") else None
        if task_row.get("groupId") and group_id is None:
            continue  # a group the importer cannot see
        task = Task(
            owner_id=None if group_id else user.id,
            group_id=group_id,
            title=str(task_row.get("title", "Task"))[:300],
            description=str(task_row.get("description", "")),
            due_at=from_ms(task_row.get("dueAt")),
            status=TaskStatus(task_row.get("status", "todo")),
            priority=TaskPriority(task_row.get("priority", "med")),
            created_by=user.id,
        )
        db.add(task)
        db.flush()
        for index, item in enumerate(task_row.get("subtasks", [])):
            db.add(
                TaskSubtask(
                    task_id=task.id,
                    title=str(item.get("title", "Step"))[:300],
                    done=bool(item.get("done")),
                    position=index,
                )
            )
        for index, item in enumerate(task_row.get("links", [])):
            db.add(
                TaskLink(
                    task_id=task.id,
                    label=str(item.get("label", ""))[:160] or "Link",
                    url=str(item.get("url", ""))[:1000],
                    position=index,
                )
            )
        counts["tasks"] += 1

    for note_row in data.get("notes", []):
        group_id = group_map.get(str(note_row.get("groupId"))) if note_row.get("groupId") else None
        scope = NoteScope(note_row.get("scope", "personal"))
        if scope is NoteScope.group and group_id is None:
            continue
        file_id = _uuid(note_row.get("fileId"))
        if file_id is not None:
            owned = db.get(FileObject, file_id)
            if owned is None or owned.owner_id != user.id:
                file_id = None
        note = Note(
            owner_id=None if scope is NoteScope.group else user.id,
            group_id=group_id,
            scope=scope,
            subject_id=subject_map.get(str(note_row.get("subjectId"))) if note_row.get("subjectId") else None,
            topic_id=topic_map.get(str(note_row.get("topicId"))) if note_row.get("topicId") else None,
            type=NoteType(note_row.get("type", "note")),
            title=str(note_row.get("title", "Untitled"))[:300],
            body=str(note_row.get("body", "")),
            url=note_row.get("url") or None,
            file_id=file_id,
            pinned=bool(note_row.get("pinned")),
            tags=[str(tag)[:40] for tag in note_row.get("tags", [])][:30],
            created_by=user.id,
        )
        db.add(note)
        counts["notes"] += 1

    for event_row in data.get("events", []):
        group_id = group_map.get(str(event_row.get("groupId"))) if event_row.get("groupId") else None
        starts_at = from_ms(event_row.get("startsAt"))
        if starts_at is None:
            continue
        db.add(
            Event(
                owner_id=user.id,
                group_id=group_id,
                title=str(event_row.get("title", "Event"))[:300],
                type=event_row.get("type", "personal"),
                starts_at=starts_at,
                ends_at=from_ms(event_row.get("endsAt")),
                location=str(event_row.get("location", ""))[:300],
                reminder_minutes=int(event_row.get("reminderMinutes", 60)),
                notes=str(event_row.get("notes", "")),
            )
        )
        counts["events"] += 1

    db.commit()
    return counts


DEMO_SUBJECTS = [
    ("Thermodynamics", "amber"),
    ("Organic chemistry", "mint"),
    ("Discrete maths", "sky"),
]

DEMO_NOTES = [
    (
        "Big-O cheat sheet",
        "O(1) < O(log n) < O(n) < O(n log n) < O(n²).\nAmortised vs worst case matters for the exam.",
        "sky",
        ["exam", "complexity"],
    ),
    (
        "Redox and titration",
        "Half-equations first, then balance charge.\nPast paper Q4 is the same shape as the lab.",
        "amber",
        ["chem", "lab"],
    ),
    (
        "Week 5 lecture summary",
        "Entropy is a state function; ΔS_universe always increases.",
        "mint",
        ["thermo", "week5"],
    ),
    ("Khan Academy — Recursion", "Call stack walkthrough, good for the tutorial sheet.", "sky", ["video"]),
]


def seed_demo(db: DbSession, user: User) -> dict[str, int]:
    """A small sample semester, owned by the user who asked for it."""
    now = datetime.now(UTC)
    subjects: list[Subject] = []
    for index, (name, color) in enumerate(DEMO_SUBJECTS):
        subject = Subject(owner_id=user.id, name=name, color=color, position=index)
        db.add(subject)
        subjects.append(subject)
    db.flush()

    capstone = Group(
        kind=GroupKind.project,
        name="Capstone — Sensor Dashboard",
        subject="CS301",
        color="sky",
        description="Six-week build: ingest, detect, display. Interim demo in week 6.",
        invite_code=uuid.uuid4().hex[:4].upper() + "-" + uuid.uuid4().hex[:4].upper(),
        owner_id=user.id,
    )
    finals = Group(
        kind=GroupKind.study,
        name="Finals crew",
        subject="",
        color="violet",
        description="Mixed units, one table, too much coffee.",
        invite_code=uuid.uuid4().hex[:4].upper() + "-" + uuid.uuid4().hex[:4].upper(),
        owner_id=user.id,
    )
    db.add_all([capstone, finals])
    db.flush()
    access.add_member(db, capstone.id, user.id, GroupRole.owner)
    access.add_member(db, finals.id, user.id, GroupRole.owner)

    topic_names = ["CS301", "CHEM210", "MATH201"]
    topics: list[GroupTopic] = []
    for index, name in enumerate(topic_names):
        topic = GroupTopic(group_id=finals.id, name=name, color=MARKERS[index % 6], position=index)
        db.add(topic)
        topics.append(topic)
    db.add(
        GroupLink(
            group_id=capstone.id,
            label="Shared drive",
            url="https://drive.example.com/capstone",
            position=0,
        )
    )
    db.flush()

    tasks = [
        (
            capstone.id,
            "Literature review",
            "Summarise 8 papers on acoustic monitoring.",
            2,
            TaskStatus.doing,
            TaskPriority.high,
        ),
        (
            capstone.id,
            "Data pipeline spike",
            "Prototype ingest → clean → features.",
            4,
            TaskStatus.todo,
            TaskPriority.med,
        ),
        (
            capstone.id,
            "Interim demo prep",
            "Slides plus a live demo script.",
            9,
            TaskStatus.todo,
            TaskPriority.med,
        ),
        (None, "Renew library books", "Two are already overdue.", -1, TaskStatus.todo, TaskPriority.low),
        (
            None,
            "Print lab report",
            "Double-sided, staple in the corner.",
            0,
            TaskStatus.todo,
            TaskPriority.med,
        ),
        (None, "Email tutor about the extension", "", 1, TaskStatus.todo, TaskPriority.high),
        (
            None,
            "Draft revision timetable",
            "Block out the two weeks before exams.",
            5,
            TaskStatus.todo,
            TaskPriority.med,
        ),
        (None, "Book dentist appointment", "", None, TaskStatus.todo, TaskPriority.low),
    ]
    for group_id, title, description, days, status, priority in tasks:
        db.add(
            Task(
                owner_id=None if group_id else user.id,
                group_id=group_id,
                title=title,
                description=description,
                due_at=(now + timedelta(days=days)).replace(hour=18, minute=0, second=0, microsecond=0)
                if days is not None
                else None,
                status=status,
                priority=priority,
                created_by=user.id,
            )
        )

    subject_by_name = {subject.name: subject for subject in subjects}
    subject_for_marker = {
        "sky": "Discrete maths",
        "amber": "Thermodynamics",
        "mint": "Organic chemistry",
    }
    for index, (title, body, subject_key, tags) in enumerate(DEMO_NOTES):
        subject = subject_by_name[subject_for_marker.get(subject_key, "Thermodynamics")]
        note = Note(
            owner_id=user.id,
            scope=NoteScope.personal,
            subject_id=subject.id,
            type=NoteType.link if title.startswith("Khan") else NoteType.note,
            title=title,
            body=body,
            url="https://www.khanacademy.org/computing/computer-science/algorithms/recursion"
            if title.startswith("Khan")
            else None,
            tags=tags,
            pinned=index == 0,
            created_by=user.id,
        )
        db.add(note)

    shared = Note(
        group_id=finals.id,
        scope=NoteScope.group,
        topic_id=topics[0].id,
        type=NoteType.note,
        title="Week 5 — state machines",
        body="Finite state machines: states, alphabet, transitions, accept states.",
        tags=["week5"],
        created_by=user.id,
    )
    request = Note(
        group_id=finals.id,
        scope=NoteScope.group,
        topic_id=topics[1].id,
        type=NoteType.request,
        title="Anyone have week 5's slides?",
        body="Missed the Friday lecture.",
        request_open=True,
        created_by=user.id,
    )
    db.add_all([shared, request])

    events = [
        ("CHEM210 midterm", "exam", 5, 9, "Main hall", 1440),
        ("Finals crew session", "session", 2, 19, "Library, floor 3", 60),
        ("Capstone standup", "meeting", 1, 10, "Discord", 15),
        ("Gym", "personal", 0, 18, "", 0),
    ]
    for title, type_, days, hour, location, reminder in events:
        starts = (now + timedelta(days=days)).replace(hour=hour, minute=0, second=0, microsecond=0)
        db.add(
            Event(
                owner_id=user.id,
                group_id=finals.id if type_ == "session" else (capstone.id if type_ == "meeting" else None),
                title=title,
                type=type_,
                starts_at=starts,
                ends_at=starts + timedelta(hours=1),
                location=location,
                reminder_minutes=reminder,
            )
        )

    db.commit()
    return {
        "subjects": len(DEMO_SUBJECTS),
        "groups": 2,
        "tasks": len(tasks),
        "notes": len(DEMO_NOTES) + 2,
        "events": len(events),
    }


def clear_demo(db: DbSession, user: User, *, storage: storage_services.Storage) -> dict[str, int]:
    """Removes everything the user owns. Same as import with an empty payload."""
    return import_account(db, user, {"data": {}}, storage=storage)
