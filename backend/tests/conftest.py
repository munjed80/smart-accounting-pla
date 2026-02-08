"""
Pytest configuration and fixtures for backend tests.

Provides common test fixtures for async client, database sessions, 
test users, and authentication headers.
"""
import asyncio
import pytest
import pytest_asyncio
import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator, Generator

from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool

from app.main import app
from app.core.database import get_db, Base
from app.models.user import User
from app.core.roles import UserRole
from app.models.administration import Administration, AdministrationMember
from app.core.security import create_access_token, get_password_hash


# Note: Tests require PostgreSQL for UUID column types.
# In-memory SQLite used here for simple unit tests only.
# Integration tests should use PostgreSQL.
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture(scope="function")
async def test_engine():
    """Create a test database engine."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        poolclass=NullPool,
        echo=False,
    )
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    yield engine
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a database session for tests."""
    async_session = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    
    async with async_session() as session:
        yield session


@pytest_asyncio.fixture(scope="function")
async def test_user(db_session: AsyncSession) -> User:
    """Create a test ZZP user."""
    user = User(
        id=uuid.uuid4(),
        email="test-zzp@example.com",
        hashed_password=get_password_hash("TestPassword123"),
        name="Test ZZP User",
        role=UserRole.ZZP.value,
        is_verified=True,
        is_active=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture(scope="function")
async def test_administration(db_session: AsyncSession, test_user: User) -> Administration:
    """Create a test administration for the ZZP user."""
    administration = Administration(
        id=uuid.uuid4(),
        name="Test ZZP Administration",
        company_name="Test Company BV",
        is_active=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db_session.add(administration)
    
    # Create membership
    membership = AdministrationMember(
        id=uuid.uuid4(),
        user_id=test_user.id,
        administration_id=administration.id,
        role="owner",
        created_at=datetime.now(timezone.utc),
    )
    db_session.add(membership)
    
    await db_session.commit()
    await db_session.refresh(administration)
    return administration


@pytest_asyncio.fixture(scope="function")
async def auth_headers(test_user: User) -> dict:
    """Create authentication headers for the test user."""
    token = create_access_token(
        data={"sub": str(test_user.id), "email": test_user.email}
    )
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture(scope="function")
async def async_client(
    db_session: AsyncSession,
    test_user: User,
    test_administration: Administration,
) -> AsyncGenerator[AsyncClient, None]:
    """Create an async test client with database override."""
    
    async def override_get_db():
        yield db_session
    
    app.dependency_overrides[get_db] = override_get_db
    
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as client:
        yield client
    
    app.dependency_overrides.clear()
