"""Quizzes: generated sets of objective and written questions.

Quizzes are personal study aids, like flashcards: any note the caller can see
can be turned into a quiz, but the saved quiz belongs to its creator. Generation
never writes; the client previews and edits before saving. Attempt scoring is
always server-side from the stored questions.
"""

import random
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from ..models import Note, Quiz, QuizAttempt, User
from ..schemas.notes import NoteStudy
from ..schemas.study import (
    GenerateQuizRequest,
    GenerateQuizResponse,
    QuizAnswerIn,
    QuizAttemptIn,
    QuizAttemptOut,
    QuizCreate,
    QuizKind,
    QuizOut,
    QuizQuestion,
    QuizSummaryOut,
)
from ..utils import to_ms
from . import ai_services, file_services, note_services, quizgen
from .errors import InvalidError, NotFoundError

MISSING_QUIZ = "That quiz is gone."
OBJECTIVE_KINDS: tuple[QuizKind, ...] = ("mcq", "true_false")


def _note_uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise InvalidError("That note id is not valid.") from exc


def require_quiz(db: DbSession, user: User, quiz_id: uuid.UUID) -> Quiz:
    quiz = db.get(Quiz, quiz_id)
    if quiz is None or quiz.owner_id != user.id:
        raise NotFoundError(MISSING_QUIZ)
    return quiz


def _questions(quiz: Quiz) -> list[QuizQuestion]:
    return [QuizQuestion.model_validate(item) for item in quiz.questions or []]


def _file_text(db: DbSession, user: User, note: Note) -> str | None:
    """The extracted text of the note's attachment, when the caller can see it."""
    if note.file_id is None:
        return None
    file = file_services.require_visible_file(db, user, note.file_id)
    return file.extracted_text or None


def _summary(quiz: Quiz, note_title: str | None) -> QuizSummaryOut:
    questions = _questions(quiz)
    objective = sum(1 for question in questions if question.kind in OBJECTIVE_KINDS)
    return QuizSummaryOut(
        id=str(quiz.id),
        noteId=str(quiz.note_id),
        noteTitle=note_title,
        title=quiz.title,
        questionCount=len(questions),
        objectiveCount=objective,
        writtenCount=len(questions) - objective,
        createdAt=to_ms(quiz.created_at) or 0,
        updatedAt=to_ms(quiz.updated_at) or 0,
    )


def attempt_out(attempt: QuizAttempt) -> QuizAttemptOut:
    return QuizAttemptOut(
        id=str(attempt.id),
        quizId=str(attempt.quiz_id),
        answers=[QuizAnswerIn.model_validate(item) for item in attempt.answers or []],
        objectiveCorrect=attempt.objective_correct,
        objectiveTotal=attempt.objective_total,
        writtenCovered=attempt.written_covered,
        writtenTotal=attempt.written_total,
        createdAt=to_ms(attempt.created_at) or 0,
    )


def _last_attempt(db: DbSession, user: User, quiz: Quiz) -> QuizAttempt | None:
    return db.scalars(
        select(QuizAttempt)
        .where(QuizAttempt.quiz_id == quiz.id, QuizAttempt.owner_id == user.id)
        .order_by(QuizAttempt.created_at.desc())
        .limit(1)
    ).first()


def quiz_out(db: DbSession, user: User, quiz: Quiz) -> QuizOut:
    note = db.get(Note, quiz.note_id)
    summary = _summary(quiz, note.title if note else None)
    attempt = _last_attempt(db, user, quiz)
    return QuizOut(
        **summary.model_dump(),
        questions=_questions(quiz),
        lastAttempt=attempt_out(attempt) if attempt else None,
    )


def generate_quiz(db: DbSession, user: User, data: GenerateQuizRequest) -> GenerateQuizResponse:
    """Draft questions from the note and its PDF/deck text; never writes rows."""
    note = note_services.require_note(db, user, _note_uuid(data.noteId))
    study = NoteStudy.model_validate(note.study or {})
    highlights = [(item.page, item.quote) for item in study.highlights if item.quote.strip()]
    questions = quizgen.generate(
        note.body or "",
        file_text=_file_text(db, user, note),
        highlights=highlights,
        objective=data.objective,
        subjective=data.subjective,
    )

    refined = False
    configured = False
    notices: list[str] = []
    if data.refine and any(question.kind in ("mcq", "short") for question in questions):
        outcome = ai_services.refine_quiz(questions, note_title=note.title)
        questions, refined, configured = outcome.questions, outcome.refined, outcome.configured
        if not refined:
            notices.append(
                "Elpis did not answer; these are the free rules-based questions."
                if configured
                else "Elpis is not connected; these are the free rules-based questions."
            )

    asked = data.objective + data.subjective
    if len(questions) < asked:
        label = "question" if asked == 1 else "questions"
        notices.append(
            f"Found {len(questions)} of {asked} {label}. "
            "Add definition lines or bullet points, or lower the counts."
        )

    return GenerateQuizResponse(
        noteId=str(note.id),
        noteTitle=note.title,
        title=f"{note.title.strip() or 'Note'} quiz"[:200],
        engine="ai" if refined else "rules",
        refined=refined,
        questions=questions,
        notice=" ".join(notices) or None,
    )


def _prepare_question(question: QuizQuestion) -> QuizQuestion:
    if question.kind == "mcq":
        options = [option.strip() for option in question.options]
        answer_index = question.answerIndex
        if answer_index is None or not (0 <= answer_index < len(options)):
            raise InvalidError("Pick the correct option for every multiple-choice question.")
        correct = options[answer_index]
        random.SystemRandom().shuffle(options)
        return question.model_copy(update={"options": options, "answerIndex": options.index(correct)})
    if question.kind == "true_false":
        return question.model_copy(
            update={"options": ["True", "False"], "answerIndex": 0 if question.answerIndex == 0 else 1}
        )
    return question


def create_quiz(db: DbSession, user: User, data: QuizCreate) -> QuizOut:
    note = note_services.require_note(db, user, _note_uuid(data.noteId))
    prepared = [_prepare_question(question) for question in data.questions]
    quiz = Quiz(
        owner_id=user.id,
        note_id=note.id,
        title=data.title.strip()[:200] or "Quiz",
        questions=[question.model_dump() for question in prepared],
    )
    db.add(quiz)
    db.commit()
    db.refresh(quiz)
    return quiz_out(db, user, quiz)


def list_quizzes(db: DbSession, user: User, *, note_id: str | None = None) -> list[QuizSummaryOut]:
    statement = select(Quiz).where(Quiz.owner_id == user.id)
    if note_id:
        note = note_services.require_note(db, user, _note_uuid(note_id))
        statement = statement.where(Quiz.note_id == note.id)
    statement = statement.order_by(Quiz.updated_at.desc(), Quiz.created_at.desc())
    quizzes = list(db.scalars(statement).all())
    if not quizzes:
        return []
    note_ids = {quiz.note_id for quiz in quizzes}
    titles = {note.id: note.title for note in db.scalars(select(Note).where(Note.id.in_(note_ids))).all()}
    return [_summary(quiz, titles.get(quiz.note_id)) for quiz in quizzes]


def get_quiz(db: DbSession, user: User, quiz_id: uuid.UUID) -> QuizOut:
    quiz = require_quiz(db, user, quiz_id)
    return quiz_out(db, user, quiz)


def delete_quiz(db: DbSession, user: User, quiz_id: uuid.UUID) -> None:
    quiz = require_quiz(db, user, quiz_id)
    db.delete(quiz)
    db.commit()


def submit_attempt(db: DbSession, user: User, quiz_id: uuid.UUID, data: QuizAttemptIn) -> QuizAttemptOut:
    quiz = require_quiz(db, user, quiz_id)
    questions = _questions(quiz)
    by_index: dict[int, QuizAnswerIn] = {}
    for answer in data.answers:
        if not (0 <= answer.index < len(questions)):
            raise InvalidError("That answer is not part of this quiz.")
        if answer.index in by_index:
            raise InvalidError("Each question can only be answered once.")
        by_index[answer.index] = answer

    objective_correct = 0
    objective_total = 0
    written_covered = 0
    written_total = 0
    for index, question in enumerate(questions):
        answer = by_index.get(index)
        if question.kind in OBJECTIVE_KINDS:
            objective_total += 1
            if answer is not None and answer.choice == question.answerIndex:
                objective_correct += 1
            continue
        points = len(question.keyPoints)
        written_total += points
        if answer is not None:
            covered = {value for value in answer.covered if 0 <= value < points}
            written_covered += len(covered)

    attempt = QuizAttempt(
        quiz_id=quiz.id,
        owner_id=user.id,
        answers=[answer.model_dump() for answer in data.answers],
        objective_correct=objective_correct,
        objective_total=objective_total,
        written_covered=written_covered,
        written_total=written_total,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return attempt_out(attempt)
