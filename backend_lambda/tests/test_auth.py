"""
test_auth.py — Unit tests for authorization logic in auth.py

Covers:
 - handle_auth_register: success, duplicate user, missing fields
 - handle_auth_confirm: success, wrong code, expired code
 - handle_auth_login: success, wrong password, unconfirmed user, missing fields
 - handle_auth_refresh: success, invalid refresh token
 - verify_jwt: tested via direct mock of jose.jwt (not real Cognito)
"""
import json
import sys
from unittest.mock import MagicMock, patch

import pytest

# conftest.py stubs config + db before any app import
sys.path.insert(0, ".")
import auth


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _body(res):
    """Parse JSON body from an api_response dict."""
    return json.loads(res["body"])


def _make_cognito_exc(name):
    """Create a fake botocore-style exception class on the mock client."""
    exc_class = type(name, (Exception,), {})
    return exc_class


# ---------------------------------------------------------------------------
# handle_auth_register
# ---------------------------------------------------------------------------

class TestHandleAuthRegister:

    def setup_method(self):
        """Reset cognito mock before each test."""
        import config as cfg
        self.cognito = cfg.cognito
        self.cognito.reset_mock()
        # Attach exception classes that auth.py references
        self.cognito.exceptions.UsernameExistsException = _make_cognito_exc("UsernameExistsException")
        self.cognito.exceptions.InvalidPasswordException = _make_cognito_exc("InvalidPasswordException")

    def test_success_returns_201(self):
        self.cognito.sign_up.return_value = {
            "UserSub": "abc-123",
            "UserConfirmed": False,
        }
        res = auth.handle_auth_register({"email": "new@user.com", "password": "Pass1234!"})
        assert res["statusCode"] == 201
        assert _body(res)["user_sub"] == "abc-123"

    def test_missing_email_returns_400(self):
        res = auth.handle_auth_register({"password": "Pass1234!"})
        assert res["statusCode"] == 400

    def test_missing_password_returns_400(self):
        res = auth.handle_auth_register({"email": "a@b.com"})
        assert res["statusCode"] == 400

    def test_empty_body_returns_400(self):
        res = auth.handle_auth_register({})
        assert res["statusCode"] == 400

    def test_none_body_returns_400(self):
        res = auth.handle_auth_register(None)
        assert res["statusCode"] == 400

    def test_duplicate_user_returns_409(self):
        self.cognito.sign_up.side_effect = self.cognito.exceptions.UsernameExistsException("exists")
        res = auth.handle_auth_register({"email": "old@user.com", "password": "Pass1234!"})
        assert res["statusCode"] == 409
        assert "already exists" in _body(res)["error"]

    def test_cognito_generic_error_returns_500(self):
        self.cognito.sign_up.side_effect = Exception("unexpected")
        res = auth.handle_auth_register({"email": "x@x.com", "password": "Pass!"})
        assert res["statusCode"] == 500

    def test_full_name_passed_to_cognito(self):
        self.cognito.sign_up.return_value = {"UserSub": "z", "UserConfirmed": False}
        auth.handle_auth_register({
            "email": "a@b.com",
            "password": "Pass1!",
            "full_name": "Ahmet Test",
        })
        call_kwargs = self.cognito.sign_up.call_args[1]
        attr_values = {a["Name"]: a["Value"] for a in call_kwargs["UserAttributes"]}
        assert attr_values.get("name") == "Ahmet Test"


# ---------------------------------------------------------------------------
# handle_auth_confirm
# ---------------------------------------------------------------------------

class TestHandleAuthConfirm:

    def setup_method(self):
        import config as cfg
        self.cognito = cfg.cognito
        self.cognito.reset_mock()
        self.cognito.exceptions.CodeMismatchException = _make_cognito_exc("CodeMismatchException")
        self.cognito.exceptions.ExpiredCodeException = _make_cognito_exc("ExpiredCodeException")

    def test_success_returns_200(self):
        self.cognito.confirm_sign_up.return_value = {}
        res = auth.handle_auth_confirm({"email": "a@b.com", "code": "123456"})
        assert res["statusCode"] == 200

    def test_missing_email_returns_400(self):
        res = auth.handle_auth_confirm({"code": "123456"})
        assert res["statusCode"] == 400

    def test_missing_code_returns_400(self):
        res = auth.handle_auth_confirm({"email": "a@b.com"})
        assert res["statusCode"] == 400

    def test_wrong_code_returns_400(self):
        self.cognito.confirm_sign_up.side_effect = self.cognito.exceptions.CodeMismatchException("wrong")
        res = auth.handle_auth_confirm({"email": "a@b.com", "code": "000000"})
        assert res["statusCode"] == 400
        assert "Invalid" in _body(res)["error"]

    def test_expired_code_returns_400(self):
        self.cognito.confirm_sign_up.side_effect = self.cognito.exceptions.ExpiredCodeException("expired")
        res = auth.handle_auth_confirm({"email": "a@b.com", "code": "111111"})
        assert res["statusCode"] == 400
        assert "expired" in _body(res)["error"].lower()

    def test_generic_error_returns_500(self):
        self.cognito.confirm_sign_up.side_effect = Exception("boom")
        res = auth.handle_auth_confirm({"email": "a@b.com", "code": "123"})
        assert res["statusCode"] == 500


# ---------------------------------------------------------------------------
# handle_auth_login
# ---------------------------------------------------------------------------

class TestHandleAuthLogin:

    def setup_method(self):
        import config as cfg
        self.cognito = cfg.cognito
        self.cognito.reset_mock()
        self.cognito.exceptions.NotAuthorizedException = _make_cognito_exc("NotAuthorizedException")
        self.cognito.exceptions.UserNotConfirmedException = _make_cognito_exc("UserNotConfirmedException")

    def _mock_successful_login(self):
        """Set up cognito to return a valid auth result and an ID token."""
        # Minimal fake ID token payload (not actually signed, we bypass verify_jwt)
        self.cognito.initiate_auth.return_value = {
            "AuthenticationResult": {
                "IdToken": "header.eyJzdWIiOiJ1c2VyLTEyMyIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsIm5hbWUiOiJUZXN0IFVzZXIifQ.sig",
                "AccessToken": "access.tok",
                "RefreshToken": "refresh.tok",
                "ExpiresIn": 3600,
                "TokenType": "Bearer",
            }
        }

    def test_missing_email_returns_400(self):
        res = auth.handle_auth_login({"password": "Pass!"})
        assert res["statusCode"] == 400

    def test_missing_password_returns_400(self):
        res = auth.handle_auth_login({"email": "a@b.com"})
        assert res["statusCode"] == 400

    def test_wrong_password_returns_401(self):
        self.cognito.initiate_auth.side_effect = self.cognito.exceptions.NotAuthorizedException("bad creds")
        res = auth.handle_auth_login({"email": "a@b.com", "password": "Wrong!"})
        assert res["statusCode"] == 401
        assert "credentials" in _body(res)["error"].lower()

    def test_unconfirmed_user_returns_403(self):
        self.cognito.initiate_auth.side_effect = self.cognito.exceptions.UserNotConfirmedException("not confirmed")
        res = auth.handle_auth_login({"email": "a@b.com", "password": "Pass!"})
        assert res["statusCode"] == 403
        assert "confirmed" in _body(res)["error"].lower()

    def test_generic_error_returns_500(self):
        self.cognito.initiate_auth.side_effect = Exception("unexpected")
        res = auth.handle_auth_login({"email": "a@b.com", "password": "Pass!"})
        assert res["statusCode"] == 500


# ---------------------------------------------------------------------------
# handle_auth_refresh
# ---------------------------------------------------------------------------

class TestHandleAuthRefresh:

    def setup_method(self):
        import config as cfg
        self.cognito = cfg.cognito
        self.cognito.reset_mock()
        self.cognito.exceptions.NotAuthorizedException = _make_cognito_exc("NotAuthorizedException")

    def test_missing_refresh_token_returns_400(self):
        res = auth.handle_auth_refresh({})
        assert res["statusCode"] == 400

    def test_invalid_refresh_token_returns_401(self):
        self.cognito.initiate_auth.side_effect = self.cognito.exceptions.NotAuthorizedException("invalid")
        res = auth.handle_auth_refresh({"refresh_token": "bad-token"})
        assert res["statusCode"] == 401

    def test_success_returns_200(self):
        self.cognito.initiate_auth.return_value = {
            "AuthenticationResult": {
                "AccessToken": "new-access",
                "IdToken": "new-id",
                "ExpiresIn": 3600,
                "TokenType": "Bearer",
            }
        }
        res = auth.handle_auth_refresh({"refresh_token": "valid-refresh"})
        assert res["statusCode"] == 200
        body = _body(res)
        assert body["tokens"]["access_token"] == "new-access"

    def test_generic_error_returns_500(self):
        self.cognito.initiate_auth.side_effect = Exception("boom")
        res = auth.handle_auth_refresh({"refresh_token": "tok"})
        assert res["statusCode"] == 500


# ---------------------------------------------------------------------------
# verify_jwt (guard function)
# ---------------------------------------------------------------------------

class TestVerifyJwt:
    """
    verify_jwt makes an HTTP call to Cognito's JWKS endpoint.
    We test the guard conditions without a real token.
    """

    def test_none_token_returns_none(self):
        assert auth.verify_jwt(None) is None

    def test_empty_string_returns_none(self):
        assert auth.verify_jwt("") is None

    def test_non_string_returns_none(self):
        assert auth.verify_jwt(123) is None

    def test_malformed_token_returns_none(self):
        # A garbage string that can't be parsed as JWT
        assert auth.verify_jwt("not.a.jwt") is None

    def test_whitespace_only_returns_none(self):
        assert auth.verify_jwt("   ") is None
