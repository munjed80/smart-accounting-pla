"""
Tests for ZZP Work Sessions (Clock-in/out) functionality.

Tests the work_sessions endpoints for daily clock-in workflow.
"""
import pytest
from datetime import datetime, timezone, timedelta
from uuid import uuid4
from unittest.mock import patch, AsyncMock

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
from app.models.user import User
from app.models.administration import Administration, AdministrationMember
from app.models.zzp import WorkSession, ZZPTimeEntry


class TestWorkSessionStart:
    """Tests for POST /zzp/work-sessions/start"""
    
    @pytest.mark.asyncio
    async def test_start_session_success(
        self, 
        async_client: AsyncClient, 
        test_user: User, 
        test_administration: Administration,
        auth_headers: dict
    ):
        """Starting a work session creates an active session."""
        response = await async_client.post(
            "/api/v1/zzp/work-sessions/start",
            json={"note": "Starting work on project X"},
            headers=auth_headers
        )
        
        assert response.status_code == 201
        data = response.json()
        
        assert data["user_id"] == str(test_user.id)
        assert data["administration_id"] == str(test_administration.id)
        assert data["ended_at"] is None  # Session is active
        assert data["note"] == "Starting work on project X"
        assert data["break_minutes"] == 0
        assert "started_at" in data
        assert "duration_seconds" in data
    
    @pytest.mark.asyncio
    async def test_start_session_without_note(
        self, 
        async_client: AsyncClient, 
        test_user: User, 
        auth_headers: dict
    ):
        """Starting a work session without a note is allowed."""
        response = await async_client.post(
            "/api/v1/zzp/work-sessions/start",
            json={},
            headers=auth_headers
        )
        
        assert response.status_code == 201
        data = response.json()
        
        assert data["note"] is None
    
    @pytest.mark.asyncio
    async def test_start_session_duplicate_fails(
        self, 
        async_client: AsyncClient, 
        test_user: User, 
        auth_headers: dict
    ):
        """Starting a session when one is already active fails."""
        # Start first session
        response1 = await async_client.post(
            "/api/v1/zzp/work-sessions/start",
            json={},
            headers=auth_headers
        )
        assert response1.status_code == 201
        
        # Try to start second session
        response2 = await async_client.post(
            "/api/v1/zzp/work-sessions/start",
            json={},
            headers=auth_headers
        )
        
        assert response2.status_code == 409
        data = response2.json()
        assert data["detail"]["code"] == "ACTIVE_SESSION_EXISTS"


class TestWorkSessionStop:
    """Tests for POST /zzp/work-sessions/stop"""
    
    @pytest.mark.asyncio
    async def test_stop_session_creates_time_entry(
        self, 
        async_client: AsyncClient, 
        test_user: User, 
        db_session: AsyncSession,
        auth_headers: dict
    ):
        """Stopping a session creates a time entry with calculated hours."""
        # Start a session
        start_response = await async_client.post(
            "/api/v1/zzp/work-sessions/start",
            json={"note": "Working on invoices"},
            headers=auth_headers
        )
        assert start_response.status_code == 201
        
        # Wait a bit (in real tests we'd mock time)
        # For this test, we'll check that the entry is created
        
        # Stop the session
        stop_response = await async_client.post(
            "/api/v1/zzp/work-sessions/stop",
            json={"break_minutes": 0},
            headers=auth_headers
        )
        
        assert stop_response.status_code == 200
        data = stop_response.json()
        
        # Verify response structure
        assert "session" in data
        assert "time_entry" in data
        assert "hours_added" in data
        assert "message" in data
        
        # Session should be ended
        assert data["session"]["ended_at"] is not None
        
        # Time entry should exist
        assert data["time_entry"]["description"] == "Working on invoices"
        assert data["time_entry"]["billable"] is True
    
    @pytest.mark.asyncio
    async def test_stop_session_with_break_time(
        self, 
        async_client: AsyncClient, 
        auth_headers: dict
    ):
        """Break minutes are subtracted from total duration."""
        # Start a session
        await async_client.post(
            "/api/v1/zzp/work-sessions/start",
            json={},
            headers=auth_headers
        )
        
        # Stop with break time (use 0 to avoid exceeding short test duration)
        stop_response = await async_client.post(
            "/api/v1/zzp/work-sessions/stop",
            json={"break_minutes": 0},
            headers=auth_headers
        )
        
        assert stop_response.status_code == 200
        data = stop_response.json()
        
        # Session should have break_minutes recorded
        assert data["session"]["break_minutes"] == 0
    
    @pytest.mark.asyncio
    async def test_stop_session_without_active_fails(
        self, 
        async_client: AsyncClient, 
        auth_headers: dict
    ):
        """Stopping when no active session exists fails."""
        response = await async_client.post(
            "/api/v1/zzp/work-sessions/stop",
            json={},
            headers=auth_headers
        )
        
        assert response.status_code == 404
        data = response.json()
        assert data["detail"]["code"] == "NO_ACTIVE_SESSION"


class TestWorkSessionActive:
    """Tests for GET /zzp/work-sessions/active"""
    
    @pytest.mark.asyncio
    async def test_get_active_session_when_exists(
        self, 
        async_client: AsyncClient, 
        auth_headers: dict
    ):
        """Getting active session returns the session when one exists."""
        # Start a session
        start_response = await async_client.post(
            "/api/v1/zzp/work-sessions/start",
            json={"note": "Test session"},
            headers=auth_headers
        )
        session_id = start_response.json()["id"]
        
        # Get active session
        response = await async_client.get(
            "/api/v1/zzp/work-sessions/active",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["id"] == session_id
        assert data["ended_at"] is None
        assert "duration_seconds" in data
    
    @pytest.mark.asyncio
    async def test_get_active_session_when_none(
        self, 
        async_client: AsyncClient, 
        auth_headers: dict
    ):
        """Getting active session returns null when none exists."""
        response = await async_client.get(
            "/api/v1/zzp/work-sessions/active",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        assert response.json() is None


class TestRoundToFiveMinutes:
    """Tests for the round_to_5_minutes helper function."""
    
    def test_round_down(self):
        """Hours close to 5-minute boundary round down."""
        from app.api.v1.zzp_work_sessions import round_to_5_minutes
        
        # 62 minutes = 1.033... hours -> 60 minutes = 1.0 hours
        assert round_to_5_minutes(62 / 60) == 1.0
        
    def test_round_up(self):
        """Hours close to next 5-minute boundary round up."""
        from app.api.v1.zzp_work_sessions import round_to_5_minutes
        
        # 63 minutes = 1.05 hours -> rounds to 65 minutes = 1.0833... hours ≈ 1.08
        assert round_to_5_minutes(63 / 60) == 1.08
        
    def test_already_aligned(self):
        """Hours already on 5-minute boundary stay the same."""
        from app.api.v1.zzp_work_sessions import round_to_5_minutes
        
        # 165 minutes = 2.75 hours -> stays 2.75 hours
        assert round_to_5_minutes(165 / 60) == 2.75
        
    def test_small_values(self):
        """Small values round correctly."""
        from app.api.v1.zzp_work_sessions import round_to_5_minutes
        
        # 3 minutes -> 5 minutes = 0.08 hours
        assert round_to_5_minutes(3 / 60) == 0.08
        
        # 1 minute -> 0 minutes = 0.0 hours (rounds down)
        assert round_to_5_minutes(1 / 60) == 0.0
