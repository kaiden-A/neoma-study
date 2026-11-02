from typing import Literal

from pydantic import BaseModel, Field, model_validator

from ..models.enums import NoteType

FlashcardGrade = Literal["again", "hard", "good", "easy"]
FlashcardKind = Literal["basic", "cloze", "choice"]


class FlashcardOut(BaseModel):
    id: str
    noteId: str
    noteTitle: str | None
    front: str
    back: str
    kind: FlashcardKind
    options: list[str]
    answerIndex: int | None
    sourceHighlightId: str | None
    dueAt: int
    intervalDays: float
    ease: float
    reps: int
    lapses: int
    suspended: bool
    createdAt: int
    updatedAt: int


class FlashcardDraft(BaseModel):
    """A card the client has not saved yet.

    `source` is the note text the card came from and `duplicate` is computed
    against the user's existing deck; neither is stored on the flashcard row.
    """

    front: str = Field(min_length=1, max_length=1000)
    back: str = Field(default="", max_length=2000)
    kind: FlashcardKind = "basic"
    source: str = Field(default="", max_length=2000)
    page: int | None = Field(default=None, ge=1)
    duplicate: bool = False
    # Wrong options proposed by the AI refine pass; the answer itself is never
    # model-written. Empty until quiz cards land.
    distractors: list[str] = Field(default_factory=list, max_length=3)


class GenerateCardsRequest(BaseModel):
    noteId: str
    count: int = Field(default=10, ge=1, le=30)
    refine: bool = False
    quiz: bool = False


class GenerateCardsResponse(BaseModel):
    noteId: str
    noteTitle: str
    engine: Literal["rules", "ai"]
    refined: bool
    cards: list[FlashcardDraft]
    notice: str | None = None


class BulkCardsRequest(BaseModel):
    noteId: str
    cards: list[FlashcardDraft] = Field(min_length=1, max_length=50)


class FlashcardCreate(BaseModel):
    noteId: str
    front: str = Field(min_length=1, max_length=1000)
    back: str = Field(default="", max_length=2000)
    sourceHighlightId: str | None = Field(default=None, max_length=64)


class FlashcardPatch(BaseModel):
    front: str | None = Field(default=None, min_length=1, max_length=1000)
    back: str | None = Field(default=None, max_length=2000)
    suspended: bool | None = None


class GradeRequest(BaseModel):
    grade: FlashcardGrade


class StudySessionOut(BaseModel):
    id: str
    noteId: str | None
    noteTitle: str | None
    subjectId: str | None
    startedAt: int
    endedAt: int | None
    seconds: int
    source: str


class StudySessionCreate(BaseModel):
    noteId: str | None = None
    subjectId: str | None = None
    startedAt: int
    endedAt: int | None = None
    seconds: int = Field(ge=1, le=86400)
    source: Literal["timer", "manual"] = "timer"


class SubjectStudyStats(BaseModel):
    subjectId: str
    name: str
    color: str
    notes: int
    files: int
    cardsDue: int
    minutesThisWeek: int
    lastStudiedAt: int | None


class ContinueStudy(BaseModel):
    noteId: str
    title: str
    subjectId: str | None
    type: NoteType
    page: int
    videoSeconds: float | None
    lastAt: int


class StudyOverview(BaseModel):
    streakDays: int
    minutesThisWeek: int
    subjects: list[SubjectStudyStats]
    continueStudy: ContinueStudy | None


QuizKind = Literal["mcq", "true_false", "short"]


class QuizQuestion(BaseModel):
    """One saved quiz question.

    MCQ and true/false use `options` + `answerIndex`; short answer uses
    `modelAnswer` + `keyPoints` (the checklist the reader ticks after revealing
    the model answer). The shape is validated here so both the preview and the
    saved row reject half-built questions.
    """

    kind: QuizKind
    term: str = Field(default="", max_length=200)
    prompt: str = Field(min_length=1, max_length=1000)
    options: list[str] = Field(default_factory=list, max_length=4)
    answerIndex: int | None = Field(default=None, ge=0, le=3)
    modelAnswer: str = Field(default="", max_length=2000)
    keyPoints: list[str] = Field(default_factory=list, max_length=8)
    explanation: str = Field(default="", max_length=1000)
    source: str = Field(default="", max_length=2000)
    page: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def _validate_shape(self) -> "QuizQuestion":
        if self.kind in ("mcq", "true_false"):
            if not (2 <= len(self.options) <= 4):
                raise ValueError("A choice question needs two to four options.")
            if any(not option.strip() for option in self.options):
                raise ValueError("Every option needs text.")
            keys = [option.strip().lower() for option in self.options]
            if len(set(keys)) != len(keys):
                raise ValueError("Options must be distinct.")
            if self.answerIndex is None or not (0 <= self.answerIndex < len(self.options)):
                raise ValueError("Pick the correct option.")
        if self.kind == "true_false" and [option.strip().lower() for option in self.options] != [
            "true",
            "false",
        ]:
            raise ValueError("True/false questions use True and False.")
        if self.kind == "short":
            if not self.modelAnswer.strip():
                raise ValueError("A short-answer question needs a model answer.")
            if not (2 <= len(self.keyPoints) <= 8):
                raise ValueError("A short-answer question needs at least two key points.")
            if any(not point.strip() for point in self.keyPoints):
                raise ValueError("Every key point needs text.")
        return self


class QuizCreate(BaseModel):
    noteId: str
    title: str = Field(min_length=1, max_length=200)
    questions: list[QuizQuestion] = Field(min_length=1, max_length=50)


class GenerateQuizRequest(BaseModel):
    noteId: str
    objective: int = Field(default=8, ge=0, le=20)
    subjective: int = Field(default=3, ge=0, le=10)
    refine: bool = False

    @model_validator(mode="after")
    def _validate_counts(self) -> "GenerateQuizRequest":
        total = self.objective + self.subjective
        if total <= 0:
            raise ValueError("Ask for at least one question.")
        if total > 30:
            raise ValueError("Keep the quiz to 30 questions or fewer.")
        return self


class GenerateQuizResponse(BaseModel):
    noteId: str
    noteTitle: str
    title: str
    engine: Literal["rules", "ai"]
    refined: bool
    questions: list[QuizQuestion]
    notice: str | None = None


class QuizSummaryOut(BaseModel):
    id: str
    noteId: str
    noteTitle: str | None
    title: str
    questionCount: int
    objectiveCount: int
    writtenCount: int
    createdAt: int
    updatedAt: int


class QuizAnswerIn(BaseModel):
    index: int = Field(ge=0, le=49)
    choice: int | None = Field(default=None, ge=0, le=3)
    text: str = Field(default="", max_length=4000)
    covered: list[int] = Field(default_factory=list, max_length=8)


class QuizAttemptIn(BaseModel):
    answers: list[QuizAnswerIn] = Field(default_factory=list, max_length=50)


class QuizAttemptOut(BaseModel):
    id: str
    quizId: str
    answers: list[QuizAnswerIn]
    objectiveCorrect: int
    objectiveTotal: int
    writtenCovered: int
    writtenTotal: int
    createdAt: int


class QuizOut(QuizSummaryOut):
    questions: list[QuizQuestion]
    lastAttempt: QuizAttemptOut | None = None
