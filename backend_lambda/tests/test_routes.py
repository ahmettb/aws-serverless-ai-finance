"""
test_routes.py — Example tests for route handlers

Focuses on:
 - Error handling (e.g., trying to fetch an item that doesn't exist)
 - Happy paths with DB mocks
"""
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, ".")
from routes.goals import handle_goals


class TestRouteHandlers:

    @patch("routes.goals.get_db_connection")
    @patch("routes.goals.release_db_connection")
    def test_goals_list_empty(self, mock_release, mock_get_db):
        """Test GET /api/goals when the user has no goals."""
        mock_conn = MagicMock()
        mock_get_db.return_value = mock_conn
        mock_cursor = mock_conn.cursor.return_value.__enter__.return_value
        # Mock empty list returned by DB
        mock_cursor.fetchall.return_value = []

        # Call handle_goals for GET
        res = handle_goals(1, "GET", None, None)
        assert res["statusCode"] == 200
        import json
        body = json.loads(res["body"])
        assert "goals" in body
        assert body["goals"] == []

    @patch("routes.goals.get_db_connection")
    @patch("routes.goals.release_db_connection")
    def test_goals_create_missing_fields_returns_400(self, mock_release, mock_get_db):
        """Test POST /api/goals with missing required fields."""
        # Provide only a name, missing target_amount
        body = {"title": "New Car"}
        res = handle_goals(1, "POST", None, body)
        assert res["statusCode"] == 400
        import json
        err = json.loads(res["body"])
        assert "error" in err

    @patch("routes.goals.get_db_connection")
    @patch("routes.goals.release_db_connection")
    def test_goals_exception_returns_500(self, mock_release, mock_get_db):
        """Test unexpected DB error returns 500 cleanly."""
        mock_conn = MagicMock()
        mock_get_db.return_value = mock_conn
        mock_cursor = mock_conn.cursor.return_value.__enter__.return_value
        mock_cursor.execute.side_effect = Exception("DB Connection Lost")

        res = handle_goals(1, "GET", None, None)
        assert res["statusCode"] == 500
        import json
        assert "error" in json.loads(res["body"])
