"""
conftest.py — Shared test fixtures.

All AWS clients and config imports are mocked at the module level here,
so individual test files don't need to patch them repeatedly.
"""
import sys
import types
from unittest.mock import MagicMock, patch

# ---------------------------------------------------------------------------
# Stub heavy third-party packages that are NOT installed in the test env
# (psycopg2, jose) — these are Linux-compiled binaries bundled with the zip
# ---------------------------------------------------------------------------

# psycopg2 stub
fake_psycopg2 = types.ModuleType("psycopg2")
fake_psycopg2_extras = types.ModuleType("psycopg2.extras")
fake_psycopg2_extras.RealDictCursor = MagicMock()
fake_psycopg2.extras = fake_psycopg2_extras
sys.modules["psycopg2"] = fake_psycopg2
sys.modules["psycopg2.extras"] = fake_psycopg2_extras

# jose stub
fake_jose = types.ModuleType("jose")
fake_jwt_mod = types.ModuleType("jose.jwt")
fake_jwt_mod.decode = MagicMock(return_value={"sub": "u1", "email": "t@t.com"})
fake_jwt_mod.get_unverified_claims = MagicMock(return_value={"sub": "u1", "email": "t@t.com"})
fake_jose.jwt = fake_jwt_mod

fake_jwk_mod = types.ModuleType("jose.jwk")
fake_jwk_mod.construct = MagicMock()
fake_jose.jwk = fake_jwk_mod
fake_jose.utils = types.ModuleType("jose.utils")
fake_jose.utils.base64url_decode = MagicMock(return_value=b"sig")
fake_jose.JWTError = Exception

sys.modules["jose"] = fake_jose
sys.modules["jose.jwt"] = fake_jwt_mod
sys.modules["jose.jwk"] = fake_jwk_mod
sys.modules["jose.utils"] = fake_jose.utils


# ---------------------------------------------------------------------------
# Stub out AWS clients and env-dependent config BEFORE any app module import
# ---------------------------------------------------------------------------

# Create a minimal fake 'config' module so helpers.py / auth.py can import it
fake_config = types.ModuleType("config")
fake_config.ALLOWED_ORIGIN = "*"
fake_config.BEDROCK_INPUT_TOKEN_PRICE = 0.00000025
fake_config.BEDROCK_OUTPUT_TOKEN_PRICE = 0.00000125
fake_config.CATEGORIES = {
    1: "Market", 2: "Restoran", 3: "Kafe", 4: "Online Alışveriş",
    5: "Fatura", 6: "Konaklama", 7: "Ulaşım", 8: "Diğer",
    9: "Abonelik", 10: "Eğitim",
}
fake_config.CATEGORY_KEYWORDS = {
    1: ["migros", "bim", "a101", "market"],
    2: ["restaurant", "kebap"],
    3: ["starbucks", "kahve", "cafe"],
    4: ["amazon", "trendyol"],
    5: ["fatura", "elektrik"],
    6: ["otel", "hotel"],
    7: ["taksi", "benzin", "petrol", "shell"],
    8: ["eczane", "diger"],
    9: ["spotify", "netflix"],
    10: ["udemy", "kurs"],
}
fake_config.S3_BUCKET_NAME = "test-bucket"
fake_config.TITAN_EMBEDDING_MODEL_ID = "amazon.titan-embed-text-v2:0"
fake_config.bedrock_runtime = MagicMock()
fake_config.cw_client = MagicMock()
fake_config.s3_client = MagicMock()
fake_config.logger = MagicMock()
fake_config.log_ctx = lambda **kw: kw
fake_config.COGNITO_USER_POOL_ID = "us-east-1_test"
fake_config.COGNITO_CLIENT_ID = "test-client-id"
fake_config.AWS_REGION = "us-east-1"
fake_config.REFRESH_TOKEN_DAYS = 30
fake_config.TOKEN_USE_ALLOWED = {"access"}
fake_config.cognito = MagicMock()

sys.modules["config"] = fake_config

# Stub db module so auth.py / helpers.py imports don't fail
fake_db = types.ModuleType("db")
fake_db.get_db_connection = MagicMock()
fake_db.release_db_connection = MagicMock()
sys.modules["db"] = fake_db
