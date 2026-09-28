"""SM-2 scheduling, deliberately tiny.

Grades map to the classic SM-2 qualities (Again 0, Hard 3, Good 4, Easy 5).
A failed review resets the repetition count, bumps lapses and comes back in
ten minutes; a pass walks 1 day → 6 days → interval × ease.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from ..schemas.study import FlashcardGrade

QUALITY = {"again": 0, "hard": 3, "good": 4, "easy": 5}
MIN_EASE = 1.3
AGAIN_MINUTES = 10


@dataclass
class Schedule:
    ease: float
    interval_days: float
    reps: int
    lapses: int
    due_at: datetime


def review(
    *,
    ease: float,
    interval_days: float,
    reps: int,
    lapses: int,
    grade: FlashcardGrade,
    now: datetime | None = None,
) -> Schedule:
    moment = now or datetime.now(UTC)
    quality = QUALITY[grade]
    next_ease = max(
        MIN_EASE, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    )
    if quality < 3:
        return Schedule(
            ease=next_ease,
            interval_days=0.0,
            reps=0,
            lapses=lapses + 1,
            due_at=moment + timedelta(minutes=AGAIN_MINUTES),
        )
    next_reps = reps + 1
    if next_reps == 1:
        interval = 1.0
    elif next_reps == 2:
        interval = 6.0
    else:
        interval = max(1.0, round(interval_days * next_ease))
    return Schedule(
        ease=next_ease,
        interval_days=interval,
        reps=next_reps,
        lapses=lapses,
        due_at=moment + timedelta(days=interval),
    )
