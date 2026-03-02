"""
test_lambda_function.py — Unit tests for the main API Gateway handler

Focuses on:
 - Route handler dispatching
 - Error handling (500 on unexpected exceptions)
 - Async AI invocation (boto3 lambda client mock)
"""
import json
import sys
from unittest.mock import MagicMock, patch

import pytest

# conftest.py stubs config before import
sys.path.insert(0, ".")
import lambda_function


class TestLambdaFunction:

    @patch("lambda_function.verify_jwt")
    def test_missing_route_returns_404(self, mock_verify):
        event = {
            "requestContext": {
                "http": {"method": "GET", "path": "/api/unknown-route"}
            }
        }
        res = lambda_function.lambda_handler(event, None)
        assert res["statusCode"] == 404
        assert "not found" in json.loads(res["body"])["error"].lower()

    @patch("lambda_function.verify_jwt")
    def test_global_exception_handler_returns_500(self, mock_verify):
        event = {
            "requestContext": {
                "http": {"method": "GET", "path": "/api/auth/me"}
            }
        }
        mock_verify.side_effect = Exception("Surprise error!")
        res = lambda_function.lambda_handler(event, None)
        assert res["statusCode"] == 500
        assert "Internal" in json.loads(res["body"])["error"]


class TestAsyncLambdaInvocation:

    @patch("lambda_function.boto3.client")
    @patch("lambda_function.verify_jwt")
    @patch("lambda_function.get_db_connection")
    @patch("lambda_function.release_db_connection")
    def test_async_ai_trigger(self, mock_release_db, mock_get_db, mock_verify, mock_boto_client):
        # Setup mock user and DB response
        mock_verify.return_value = {"sub": "cognito-123"}
        mock_conn = MagicMock()
        mock_get_db.return_value = mock_conn
        mock_cursor = mock_conn.cursor.return_value.__enter__.return_value
        mock_cursor.fetchone.return_value = {"id": 1, "email": "test@test.com"}

        # Setup boto3 lambda client mock
        mock_lambda = MagicMock()
        mock_boto_client.return_value = mock_lambda

        # Act: trigger the AI generation route (which is asynchronous)
        event = {
            "requestContext": {
                "http": {"method": "POST", "path": "/api/ai/generate"}
            },
            "headers": {"authorization": "Bearer token"}
        }
        res = lambda_function.lambda_handler(event, None)

        # Assert 202 Accepted
        assert res["statusCode"] == 202
        body = json.loads(res["body"])
        assert body["message"] == "Analysis started"

        # Assert the AI lambda was invoked asynchronously with Event type
        mock_lambda.invoke.assert_called_once()
        call_kwargs = mock_lambda.invoke.call_args[1]
        assert call_kwargs["FunctionName"] == "lambda_ai"
        assert call_kwargs["InvocationType"] == "Event"  # Critical for async behavior
        
        # Verify the payload passed to the AI lambda
        payload = json.loads(call_kwargs["Payload"])
        assert payload["user_id"] == 1
        assert "period" in payload

