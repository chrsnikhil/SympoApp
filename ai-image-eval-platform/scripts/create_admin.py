"""
One-off script to create the first admin user, since /auth/register always
creates a PARTICIPANT. Run inside the backend container:

    docker compose exec backend python scripts/create_admin.py \\
        --email admin@example.com --password "changeme123" --name "Admin"
"""
from __future__ import annotations

import argparse
import asyncio

from app.database.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.core.security import hash_password
from sqlalchemy import select


async def create_admin(email: str, password: str, name: str) -> None:
    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(User).where(User.email == email))
        if existing.scalar_one_or_none() is not None:
            print(f"User {email} already exists.")
            return

        admin = User(
            email=email,
            hashed_password=hash_password(password),
            display_name=name,
            role=UserRole.ADMIN,
        )
        db.add(admin)
        await db.commit()
        print(f"Admin created: {email}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--name", required=True)
    args = parser.parse_args()
    asyncio.run(create_admin(args.email, args.password, args.name))
