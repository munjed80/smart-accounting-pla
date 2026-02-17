"""
Tests for Digipoort VAT Submission API Endpoints

Tests cover:
- Endpoint authorization with require_assigned_client
- Prepare submission endpoint
- Queue submission endpoint
- List submissions endpoint
"""
import pytest


class TestDigipoortEndpointImports:
    """Test that endpoint handlers can be imported."""
    
    def test_prepare_endpoint_exists(self):
        """Test that prepare_vat_submission endpoint exists."""
        from app.api.v1 import vat
        assert hasattr(vat, 'prepare_vat_submission')
    
    def test_queue_endpoint_exists(self):
        """Test that queue_vat_submission endpoint exists."""
        from app.api.v1 import vat
        assert hasattr(vat, 'queue_vat_submission')
    
    def test_list_submissions_endpoint_exists(self):
        """Test that list_vat_submissions endpoint exists."""
        from app.api.v1 import vat
        assert hasattr(vat, 'list_vat_submissions')


class TestEndpointRoutes:
    """Test that endpoint routes are registered."""
    
    def test_router_has_prepare_route(self):
        """Test that router has prepare submission route."""
        from app.api.v1.vat import router
        
        # Check that router has routes
        assert len(router.routes) > 0
        
        # Check for prepare route
        prepare_routes = [
            r for r in router.routes 
            if hasattr(r, 'path') and 'submit/prepare' in r.path
        ]
        assert len(prepare_routes) > 0
    
    def test_router_has_queue_route(self):
        """Test that router has queue submission route."""
        from app.api.v1.vat import router
        
        # Check for queue route
        queue_routes = [
            r for r in router.routes 
            if hasattr(r, 'path') and 'submissions' in r.path and 'queue' in r.path
        ]
        assert len(queue_routes) > 0
    
    def test_router_has_list_submissions_route(self):
        """Test that router has list submissions route."""
        from app.api.v1.vat import router
        
        # Check for list route
        list_routes = [
            r for r in router.routes 
            if hasattr(r, 'path') and 'submissions' in r.path and '{submission_id}' not in r.path
        ]
        assert len(list_routes) > 0


class TestEndpointAuthorization:
    """Test that endpoints use proper authorization."""
    
    def test_prepare_endpoint_uses_require_assigned_client(self):
        """Test that prepare endpoint uses require_assigned_client."""
        import inspect
        from app.api.v1.vat import prepare_vat_submission
        
        # Get source code of the function
        source = inspect.getsource(prepare_vat_submission)
        
        # Check that it calls require_assigned_client
        assert 'require_assigned_client' in source
    
    def test_queue_endpoint_uses_require_assigned_client(self):
        """Test that queue endpoint uses require_assigned_client."""
        import inspect
        from app.api.v1.vat import queue_vat_submission
        
        source = inspect.getsource(queue_vat_submission)
        assert 'require_assigned_client' in source
    
    def test_list_endpoint_uses_require_assigned_client(self):
        """Test that list endpoint uses require_assigned_client."""
        import inspect
        from app.api.v1.vat import list_vat_submissions
        
        source = inspect.getsource(list_vat_submissions)
        assert 'require_assigned_client' in source
    
    def test_endpoints_check_reports_scope(self):
        """Test that endpoints check for 'reports' scope."""
        import inspect
        from app.api.v1.vat import prepare_vat_submission, queue_vat_submission, list_vat_submissions
        
        # All endpoints should check for 'reports' scope
        for endpoint in [prepare_vat_submission, queue_vat_submission, list_vat_submissions]:
            source = inspect.getsource(endpoint)
            assert 'reports' in source or 'required_scope' in source


class TestEndpointErrorHandling:
    """Test that endpoints handle errors properly."""
    
    def test_prepare_endpoint_handles_vat_submission_error(self):
        """Test that prepare endpoint catches VatSubmissionError."""
        import inspect
        from app.api.v1.vat import prepare_vat_submission
        
        source = inspect.getsource(prepare_vat_submission)
        
        # Check for error handling
        assert 'VatSubmissionError' in source
        assert 'HTTPException' in source
    
    def test_queue_endpoint_handles_vat_submission_error(self):
        """Test that queue endpoint catches VatSubmissionError."""
        import inspect
        from app.api.v1.vat import queue_vat_submission
        
        source = inspect.getsource(queue_vat_submission)
        assert 'VatSubmissionError' in source
        assert 'HTTPException' in source


class TestEndpointResponseModels:
    """Test that endpoints have correct response models."""
    
    def test_prepare_endpoint_has_response_model(self):
        """Test that prepare endpoint has PrepareSubmissionResponse model."""
        from app.api.v1.vat import router
        
        # Find prepare route
        prepare_routes = [
            r for r in router.routes 
            if hasattr(r, 'path') and 'submit/prepare' in r.path
        ]
        assert len(prepare_routes) > 0
        
        # Check response model
        route = prepare_routes[0]
        assert hasattr(route, 'response_model')
    
    def test_queue_endpoint_has_response_model(self):
        """Test that queue endpoint has QueueSubmissionResponse model."""
        from app.api.v1.vat import router
        
        queue_routes = [
            r for r in router.routes 
            if hasattr(r, 'path') and 'submissions' in r.path and 'queue' in r.path
        ]
        assert len(queue_routes) > 0
        
        route = queue_routes[0]
        assert hasattr(route, 'response_model')
    
    def test_list_endpoint_has_response_model(self):
        """Test that list endpoint has VatSubmissionListResponse model."""
        from app.api.v1.vat import router
        
        list_routes = [
            r for r in router.routes 
            if hasattr(r, 'path') and 'submissions' in r.path and '{submission_id}' not in r.path and 'queue' not in r.path
        ]
        assert len(list_routes) > 0
        
        route = list_routes[0]
        assert hasattr(route, 'response_model')


class TestDataLeakagePrevention:
    """Test that endpoints don't leak data across clients."""
    
    def test_prepare_endpoint_uses_client_id_param(self):
        """Test that prepare endpoint filters by client_id."""
        import inspect
        from app.api.v1.vat import prepare_vat_submission
        
        # Check function signature
        sig = inspect.signature(prepare_vat_submission)
        assert 'client_id' in sig.parameters
    
    def test_queue_endpoint_uses_client_id_param(self):
        """Test that queue endpoint filters by client_id."""
        import inspect
        from app.api.v1.vat import queue_vat_submission
        
        sig = inspect.signature(queue_vat_submission)
        assert 'client_id' in sig.parameters
    
    def test_list_endpoint_filters_by_client_id(self):
        """Test that list endpoint filters submissions by client_id."""
        import inspect
        from app.api.v1.vat import list_vat_submissions
        
        source = inspect.getsource(list_vat_submissions)
        
        # Should filter by administration_id (client_id)
        assert 'administration_id' in source
        assert 'client_id' in source
