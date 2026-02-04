"""
Tests for OpenAPI route existence and endpoint registration.

These tests verify that critical routes are properly registered in the FastAPI
application and appear in the OpenAPI schema. This catches issues where routes
might be defined but not included in the main app.
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app


class TestOpenAPIRouteExistence:
    """Tests that verify routes exist in OpenAPI spec."""

    @pytest.fixture
    def client(self):
        """Create a test client for the FastAPI app."""
        return TestClient(app)

    def test_openapi_schema_available(self, client):
        """OpenAPI schema should be accessible."""
        response = client.get("/openapi.json")
        assert response.status_code == 200
        assert "paths" in response.json()

    def test_bank_transactions_route_exists_in_openapi(self, client):
        """
        Verify /api/v1/accountant/bank/transactions exists in OpenAPI.
        
        This ensures the bank router is properly included in the FastAPI app.
        The route returning 404 in production indicates it wasn't mounted.
        """
        response = client.get("/openapi.json")
        assert response.status_code == 200
        
        openapi = response.json()
        paths = openapi.get("paths", {})
        
        # Check that the bank transactions endpoint is registered
        bank_transactions_path = "/api/v1/accountant/bank/transactions"
        assert bank_transactions_path in paths, (
            f"Route {bank_transactions_path} not found in OpenAPI. "
            f"Available /accountant/bank paths: "
            f"{[p for p in paths.keys() if '/bank' in p]}"
        )
        
        # Verify it has GET method
        assert "get" in paths[bank_transactions_path], (
            f"GET method not defined for {bank_transactions_path}"
        )

    def test_bank_import_route_exists_in_openapi(self, client):
        """Verify /api/v1/accountant/bank/import exists in OpenAPI."""
        response = client.get("/openapi.json")
        assert response.status_code == 200
        
        openapi = response.json()
        paths = openapi.get("paths", {})
        
        bank_import_path = "/api/v1/accountant/bank/import"
        assert bank_import_path in paths, (
            f"Route {bank_import_path} not found in OpenAPI"
        )

    def test_meta_version_route_exists_in_openapi(self, client):
        """Verify /api/v1/meta/version exists in OpenAPI."""
        response = client.get("/openapi.json")
        assert response.status_code == 200
        
        openapi = response.json()
        paths = openapi.get("paths", {})
        
        meta_version_path = "/api/v1/meta/version"
        assert meta_version_path in paths, (
            f"Route {meta_version_path} not found in OpenAPI"
        )


class TestBankRouteAuthentication:
    """Tests that verify bank routes require authentication."""

    @pytest.fixture
    def client(self):
        """Create a test client for the FastAPI app."""
        return TestClient(app)

    def test_bank_transactions_returns_401_or_403_when_unauthenticated(self, client):
        """
        Bank transactions should return 401 or 403 when unauthenticated, not 404.
        
        This verifies the route exists and authentication is enforced.
        A 404 response would indicate the route isn't mounted at all.
        """
        response = client.get(
            "/api/v1/accountant/bank/transactions",
            params={"administration_id": "00000000-0000-0000-0000-000000000000"}
        )
        
        # Should return 401 (Unauthorized) or 403 (Forbidden), NOT 404
        assert response.status_code in (401, 403), (
            f"Expected 401 or 403, got {response.status_code}. "
            f"A 404 means the route is not mounted. "
            f"Response: {response.json() if response.status_code != 500 else 'Internal Server Error'}"
        )

    def test_bank_import_returns_401_or_403_when_unauthenticated(self, client):
        """Bank import should return 401 or 403 when unauthenticated."""
        response = client.post(
            "/api/v1/accountant/bank/import",
            params={"administration_id": "00000000-0000-0000-0000-000000000000"}
        )
        
        # Should return 401 or 403, NOT 404
        assert response.status_code in (401, 403, 422), (
            f"Expected 401, 403, or 422 (validation), got {response.status_code}"
        )


class TestMetaVersionEndpoint:
    """Tests for the /meta/version endpoint."""

    @pytest.fixture
    def client(self):
        """Create a test client for the FastAPI app."""
        return TestClient(app)

    def test_meta_version_returns_200(self, client):
        """
        Meta version endpoint should be accessible without authentication.
        
        This allows deployment verification without credentials.
        """
        response = client.get("/api/v1/meta/version")
        
        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}"
        )

    def test_meta_version_returns_expected_fields(self, client):
        """Meta version should return git_sha, build_time, env_name."""
        response = client.get("/api/v1/meta/version")
        assert response.status_code == 200
        
        data = response.json()
        assert "git_sha" in data
        assert "build_time" in data
        assert "env_name" in data
        
        # Values should be strings
        assert isinstance(data["git_sha"], str)
        assert isinstance(data["build_time"], str)
        assert isinstance(data["env_name"], str)


# Run tests with pytest
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
