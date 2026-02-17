from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID, JSONB, ARRAY
from app.core.config import settings

@compiles(PostgreSQLUUID, "sqlite")
def compile_postgresql_uuid_for_sqlite(_type, _compiler, **_kwargs):
    """Allow PostgreSQL UUID columns to be created in SQLite test databases."""
    return "CHAR(36)"


@compiles(JSONB, "sqlite")
def compile_postgresql_jsonb_for_sqlite(_type, _compiler, **_kwargs):
    """Allow PostgreSQL JSONB columns to be created in SQLite test databases."""
    return "JSON"


@compiles(ARRAY, "sqlite")
def compile_postgresql_array_for_sqlite(_type, _compiler, **_kwargs):
    """Allow PostgreSQL ARRAY columns to be created in SQLite test databases."""
    return "JSON"

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    future=True,
)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()
