"""Import every model here so Alembic autogenerate and Base.metadata see all tables."""
from app.models.user import User, UserRole  # noqa: F401
from app.models.challenge import Challenge  # noqa: F401
from app.models.reference_image import ReferenceImage  # noqa: F401
from app.models.reference_embedding import ReferenceEmbedding  # noqa: F401
from app.models.submission import Submission, SubmissionStatus  # noqa: F401
from app.models.score import Score  # noqa: F401
from app.models.leaderboard import LeaderboardEntry  # noqa: F401
from app.models.audit_log import AuditLog  # noqa: F401
