"""
test_helpers.py — Unit tests for business logic in helpers.py

Covers:
 - _safe_float
 - _coerce_bool
 - _get_header
 - _hash_token
 - _parse_period
 - _period_bounds
 - _normalize_text
 - _determine_category
 - _resolve_category_id
 - _json_default
 - api_response
 - _fix_date
"""
import decimal
import json
import sys
from datetime import date, datetime

import pytest

# conftest.py stubs config/db before this import
sys.path.insert(0, ".")
from helpers import (
    _coerce_bool,
    _determine_category,
    _fix_date,
    _get_header,
    _hash_token,
    _json_default,
    _normalize_text,
    _parse_period,
    _period_bounds,
    _resolve_category_id,
    _safe_float,
    api_response,
)


# ---------------------------------------------------------------------------
# _safe_float
# ---------------------------------------------------------------------------

class TestSafeFloat:
    def test_none_returns_default(self):
        assert _safe_float(None) == 0.0

    def test_none_with_custom_default(self):
        assert _safe_float(None, 99.9) == 99.9

    def test_valid_int(self):
        assert _safe_float(5) == 5.0

    def test_valid_float(self):
        assert _safe_float(3.14) == 3.14

    def test_numeric_string(self):
        assert _safe_float("12.5") == 12.5

    def test_invalid_string_returns_default(self):
        assert _safe_float("abc") == 0.0

    def test_nan_returns_default(self):
        assert _safe_float(float("nan")) == 0.0

    def test_inf_returns_default(self):
        assert _safe_float(float("inf")) == 0.0

    def test_negative_inf_returns_default(self):
        assert _safe_float(float("-inf")) == 0.0

    def test_decimal_type(self):
        assert _safe_float(decimal.Decimal("7.5")) == 7.5

    def test_zero(self):
        assert _safe_float(0) == 0.0

    def test_negative_value(self):
        assert _safe_float(-3.5) == -3.5


# ---------------------------------------------------------------------------
# _coerce_bool
# ---------------------------------------------------------------------------

class TestCoerceBool:
    def test_none_returns_none(self):
        assert _coerce_bool(None) is None

    def test_none_with_default(self):
        assert _coerce_bool(None, default=False) is False

    def test_true_bool(self):
        assert _coerce_bool(True) is True

    def test_false_bool(self):
        assert _coerce_bool(False) is False

    def test_truthy_strings(self):
        for val in ["1", "true", "yes", "on", "True", "YES"]:
            assert _coerce_bool(val) is True

    def test_falsy_strings(self):
        for val in ["0", "false", "no", "off", "False", "NO"]:
            assert _coerce_bool(val) is False

    def test_unrecognized_string_returns_default(self):
        assert _coerce_bool("maybe", default=None) is None


# ---------------------------------------------------------------------------
# _get_header
# ---------------------------------------------------------------------------

class TestGetHeader:
    def test_exact_key_match(self):
        assert _get_header({"Authorization": "Bearer tok"}, "Authorization") == "Bearer tok"

    def test_case_insensitive_match(self):
        assert _get_header({"authorization": "Bearer tok"}, "Authorization") == "Bearer tok"

    def test_missing_key_returns_empty(self):
        assert _get_header({"Content-Type": "json"}, "Authorization") == ""

    def test_none_headers_returns_empty(self):
        assert _get_header(None, "Authorization") == ""

    def test_empty_headers_returns_empty(self):
        assert _get_header({}, "Authorization") == ""

    def test_value_none_returns_empty(self):
        assert _get_header({"Authorization": None}, "Authorization") == ""


# ---------------------------------------------------------------------------
# _hash_token
# ---------------------------------------------------------------------------

class TestHashToken:
    def test_returns_64_char_hex(self):
        result = _hash_token("sometoken")
        assert len(result) == 64
        assert all(c in "0123456789abcdef" for c in result)

    def test_same_input_same_output(self):
        assert _hash_token("abc") == _hash_token("abc")

    def test_different_inputs_differ(self):
        assert _hash_token("abc") != _hash_token("xyz")

    def test_none_input(self):
        result = _hash_token(None)
        assert len(result) == 64  # SHA-256 of empty string

    def test_empty_string(self):
        assert _hash_token("") == _hash_token(None)


# ---------------------------------------------------------------------------
# _parse_period
# ---------------------------------------------------------------------------

class TestParsePeriod:
    def test_valid_period(self):
        assert _parse_period("2025-03") == "2025-03"

    def test_none_returns_current_month(self):
        result = _parse_period(None)
        assert len(result) == 7
        assert result[4] == "-"

    def test_invalid_format_returns_current(self):
        result = _parse_period("not-a-period")
        assert len(result) == 7

    def test_partial_date_invalid(self):
        result = _parse_period("2025-3")  # missing leading zero
        assert len(result) == 7


# ---------------------------------------------------------------------------
# _period_bounds
# ---------------------------------------------------------------------------

class TestPeriodBounds:
    def test_returns_correct_start_and_end(self):
        period, start, end = _period_bounds("2025-02")
        assert period == "2025-02"
        assert start == date(2025, 2, 1)
        assert end == date(2025, 2, 28)

    def test_month_31_days(self):
        _, start, end = _period_bounds("2025-01")
        assert end == date(2025, 1, 31)

    def test_leap_year_february(self):
        _, _, end = _period_bounds("2024-02")
        assert end == date(2024, 2, 29)


# ---------------------------------------------------------------------------
# _normalize_text
# ---------------------------------------------------------------------------

class TestNormalizeText:
    def test_turkish_chars(self):
        assert _normalize_text("İstanbul") == "istanbul"
        assert _normalize_text("Şırnak") == "sirnak"
        assert _normalize_text("Çöp") == "cop"
        assert _normalize_text("Ğüzel") == "guzel"

    def test_lowercase(self):
        assert _normalize_text("HELLO") == "hello"

    def test_none_returns_empty(self):
        assert _normalize_text(None) == ""

    def test_strips_whitespace(self):
        assert _normalize_text("  market  ") == "market"


# ---------------------------------------------------------------------------
# _determine_category
# ---------------------------------------------------------------------------

class TestDetermineCategory:
    def test_market_keyword(self):
        assert _determine_category("migros") == 1

    def test_cafe_keyword(self):
        assert _determine_category("starbucks") == 3

    def test_transport_keyword(self):
        assert _determine_category("petrol station") == 7

    def test_subscription_keyword(self):
        assert _determine_category("netflix payment") == 9

    def test_unknown_returns_diger(self):
        assert _determine_category("random unknown place") == 8

    def test_ai_suggested_id_takes_priority(self):
        assert _determine_category("migros", ai_suggested_id=5) == 5

    def test_invalid_ai_id_falls_back_to_keyword(self):
        assert _determine_category("migros", ai_suggested_id=99) == 1

    def test_item_level_kebap(self):
        assert _determine_category("", items=[{"name": "iskender"}]) == 2

    def test_item_level_fuel(self):
        assert _determine_category("", items=[{"name": "benzin"}]) == 7


# ---------------------------------------------------------------------------
# _resolve_category_id
# ---------------------------------------------------------------------------

class TestResolveCategoryId:
    def test_valid_id_takes_priority(self):
        assert _resolve_category_id(raw_category_id=1) == 1

    def test_invalid_id_falls_back_to_name(self):
        result = _resolve_category_id(raw_category_id=99, raw_category_name="Market")
        assert result == 1

    def test_category_name_resolution(self):
        assert _resolve_category_id(raw_category_name="Kafe") == 3

    def test_turkish_category_name(self):
        assert _resolve_category_id(raw_category_name="Ulaşım") == 7

    def test_alias_ulasim(self):
        assert _resolve_category_id(raw_category_name="ulasim") == 7

    def test_falls_back_to_merchant_keyword(self):
        assert _resolve_category_id(merchant_name="bim market") == 1


# ---------------------------------------------------------------------------
# _json_default
# ---------------------------------------------------------------------------

class TestJsonDefault:
    def test_datetime_serialized(self):
        dt = datetime(2025, 3, 1, 12, 0, 0)
        assert _json_default(dt) == "2025-03-01T12:00:00"

    def test_date_serialized(self):
        d = date(2025, 3, 1)
        assert _json_default(d) == "2025-03-01"

    def test_decimal_to_float(self):
        assert _json_default(decimal.Decimal("9.99")) == 9.99

    def test_unknown_type_to_str(self):
        assert _json_default(object()) is not None  # just doesn't crash


# ---------------------------------------------------------------------------
# api_response
# ---------------------------------------------------------------------------

class TestApiResponse:
    def test_status_code(self):
        res = api_response(200, {"ok": True})
        assert res["statusCode"] == 200

    def test_body_is_json_string(self):
        res = api_response(200, {"key": "value"})
        parsed = json.loads(res["body"])
        assert parsed["key"] == "value"

    def test_cors_header_present(self):
        res = api_response(200, {})
        assert "Access-Control-Allow-Origin" in res["headers"]

    def test_content_type(self):
        res = api_response(200, {})
        assert "application/json" in res["headers"]["Content-Type"]

    def test_error_body(self):
        res = api_response(409, {"error": "User exists"})
        assert res["statusCode"] == 409
        parsed = json.loads(res["body"])
        assert parsed["error"] == "User exists"

    def test_datetime_in_body_serialized(self):
        res = api_response(200, {"ts": datetime(2025, 1, 1)})
        parsed = json.loads(res["body"])
        assert parsed["ts"] == "2025-01-01T00:00:00"

    def test_cache_control_no_store(self):
        res = api_response(200, {})
        assert res["headers"]["Cache-Control"] == "no-store"


# ---------------------------------------------------------------------------
# _fix_date
# ---------------------------------------------------------------------------

class TestFixDate:
    def test_valid_date(self):
        assert _fix_date("2025-03-01") == "2025-03-01"

    def test_none_returns_none(self):
        assert _fix_date(None) is None

    def test_invalid_format_returns_none(self):
        assert _fix_date("01/03/2025") is None

    def test_day_overflow_corrected(self):
        # Feb 30 should be corrected to Feb 28 (non-leap)
        result = _fix_date("2025-02-30")
        assert result == "2025-02-28"

    def test_month_boundary(self):
        assert _fix_date("2025-12-31") == "2025-12-31"
