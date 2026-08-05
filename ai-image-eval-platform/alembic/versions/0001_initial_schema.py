"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-08-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    user_role = postgresql.ENUM("admin", "participant", "judge", name="user_role")
    challenge_status = postgresql.ENUM("draft", "active", "closed", name="challenge_status")
    submission_status = postgresql.ENUM(
        "pending", "processing", "scored", "rejected_watermark", "failed", name="submission_status"
    )
    bind = op.get_bind()
    user_role.create(bind, checkfirst=True)
    challenge_status.create(bind, checkfirst=True)
    submission_status.create(bind, checkfirst=True)

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("role", user_role, nullable=False, server_default="participant"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_index("ix_users_role", "users", ["role"])

    op.create_table(
        "challenges",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("status", challenge_status, nullable=False, server_default="draft"),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
    )
    op.create_index("ix_challenges_status", "challenges", ["status"])

    op.create_table(
        "reference_images",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "challenge_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("challenges.id"),
            nullable=False,
            unique=True,
        ),
        sa.Column("original_storage_key", sa.String(512), nullable=False),
        sa.Column("watermarked_storage_key", sa.String(512), nullable=False),
        sa.Column("width", sa.Integer, nullable=True),
        sa.Column("height", sa.Integer, nullable=True),
        sa.Column("content_hash", sa.String(64), nullable=False),
    )
    op.create_index("ix_reference_images_challenge_id", "reference_images", ["challenge_id"])
    op.create_index("ix_reference_images_content_hash", "reference_images", ["content_hash"])

    op.create_table(
        "reference_embeddings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "reference_image_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("reference_images.id"),
            nullable=False,
            unique=True,
        ),
        sa.Column("model_name", sa.String(128), nullable=False),
        sa.Column("vector", postgresql.ARRAY(sa.Float), nullable=False),
        sa.Column("dimension", sa.Integer, nullable=False),
    )
    op.create_index("ix_reference_embeddings_reference_image_id", "reference_embeddings", ["reference_image_id"])

    op.create_table(
        "submissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("challenge_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("challenges.id"), nullable=False),
        sa.Column("participant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("storage_key", sa.String(512), nullable=False),
        sa.Column("status", submission_status, nullable=False, server_default="pending"),
        sa.Column("watermark_detected", sa.Boolean, nullable=True),
        sa.Column("watermark_confidence", sa.Float, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("processing_time_ms", sa.Integer, nullable=True),
    )
    op.create_index("ix_submissions_challenge_id", "submissions", ["challenge_id"])
    op.create_index("ix_submissions_participant_id", "submissions", ["participant_id"])
    op.create_index("ix_submissions_status", "submissions", ["status"])

    op.create_table(
        "scores",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "submission_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("submissions.id"), nullable=False, unique=True
        ),
        sa.Column("similarity", sa.Float, nullable=False),
        sa.Column("final_score", sa.Float, nullable=False),
        sa.Column("model_used", sa.String(128), nullable=False),
    )
    op.create_index("ix_scores_submission_id", "scores", ["submission_id"])
    op.create_index("ix_scores_final_score", "scores", ["final_score"])

    op.create_table(
        "leaderboard_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("challenge_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("challenges.id"), nullable=False),
        sa.Column("participant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("best_submission_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("submissions.id"), nullable=False),
        sa.Column("best_score", sa.Float, nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("rank", sa.Integer, nullable=True),
        sa.UniqueConstraint("challenge_id", "participant_id", name="uq_leaderboard_participant"),
    )
    op.create_index("ix_leaderboard_challenge_id", "leaderboard_entries", ["challenge_id"])
    op.create_index("ix_leaderboard_participant_id", "leaderboard_entries", ["participant_id"])
    op.create_index("ix_leaderboard_best_score", "leaderboard_entries", ["best_score"])
    op.create_index("ix_leaderboard_rank", "leaderboard_entries", ["rank"])

    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("resource_type", sa.String(100), nullable=False),
        sa.Column("resource_id", sa.String(64), nullable=True),
        sa.Column("meta", sa.JSON, nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
    )
    op.create_index("ix_audit_logs_actor_id", "audit_logs", ["actor_id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("leaderboard_entries")
    op.drop_table("scores")
    op.drop_table("submissions")
    op.drop_table("reference_embeddings")
    op.drop_table("reference_images")
    op.drop_table("challenges")
    op.drop_table("users")
    for enum_name in ("submission_status", "challenge_status", "user_role"):
        op.execute(f"DROP TYPE IF EXISTS {enum_name}")
