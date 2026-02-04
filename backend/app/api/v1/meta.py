"""
Metadata API endpoints for version and build information.

This module provides endpoints that expose metadata about the application,
including version information, build time, and environment details.
"""

import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.config import settings


class VersionResponse(BaseModel):
    """
    Response model for version information.

    Attributes:
        git_sha: The Git commit SHA of the current build, or "unknown" if not available.
        build_time: The timestamp when the application was built, or current time as fallback.
        env_name: The environment name (e.g., "production", "development").
    """

    git_sha: str = Field(
        description="Git commit SHA identifying the current build version"
    )
    build_time: str = Field(
        description="ISO 8601 formatted timestamp of when the application was built"
    )
    env_name: str = Field(description="Environment name (production/development)")

    class Config:
        """Pydantic model configuration."""

        json_schema_extra = {
            "example": {
                "git_sha": "abc123def456",
                "build_time": "2024-01-15T10:30:00",
                "env_name": "production",
            }
        }


router = APIRouter(prefix="/meta", tags=["metadata"])


@router.get(
    "/version",
    response_model=VersionResponse,
    summary="Get application version information",
)
async def get_version() -> VersionResponse:
    """
    Retrieve version and build information for the application.

    This endpoint provides metadata about the current application build, including:
    - The Git commit SHA that identifies this build
    - The build timestamp
    - The environment the application is running in

    Returns:
        VersionResponse: Contains git_sha, build_time, and env_name.

    Example:
        GET /api/v1/meta/version
        Response:
        {
            "git_sha": "abc123def456",
            "build_time": "2024-01-15T10:30:00",
            "env_name": "production"
        }
    """
    # Get git_sha from environment variable, default to "unknown"
    git_sha = os.getenv("GIT_SHA", "unknown")

    # Get build_time from environment variable, default to current time
    build_time_str = os.getenv("BUILD_TIME")
    if build_time_str:
        build_time = build_time_str
    else:
        build_time = datetime.utcnow().isoformat()

    # Get environment name from settings
    env_name = settings.ENV

    return VersionResponse(git_sha=git_sha, build_time=build_time, env_name=env_name)
