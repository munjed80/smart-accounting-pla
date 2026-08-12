from jose import jwt

from app.core.config import settings
from app.core.security import create_access_token, decode_token


class TestJwtSecurity:
    def test_create_access_token_round_trip(self):
        token = create_access_token(data={"sub": "user-123", "role": "admin"})

        payload = decode_token(token)

        assert payload is not None
        assert payload["sub"] == "user-123"
        assert payload["role"] == "admin"
        assert "exp" in payload

    def test_decode_token_rejects_unexpected_algorithm(self):
        alternate_algorithm = "HS384" if settings.ALGORITHM != "HS384" else "HS512"
        token = jwt.encode({"sub": "user-123"}, settings.SECRET_KEY, algorithm=alternate_algorithm)

        assert decode_token(token) is None
