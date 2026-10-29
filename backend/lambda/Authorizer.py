import os, re, time, traceback
import jwt
from jwt import PyJWKClient, InvalidTokenError, ExpiredSignatureError

# === Env vars (required) ===
JWKS_URL   = os.environ["JWKS_URL"]         # e.g. https://<cf-domain>/.well-known/jwks.json
JWT_ISS    = os.environ["JWT_ISS"]          # e.g. verde-auth
JWT_AUD    = os.environ["JWT_AUD"]          # e.g. verde-api
CACHE_SECS = int(os.environ.get("JWKS_CACHE_SECONDS", "300"))

# === JWKS client + simple refresh timer ===
_jwks_client = PyJWKClient(JWKS_URL)
_last_refresh = 0.0

def _policy(effect: str, principal: str, method_arn: str, ctx: dict | None = None):
    ctx = {k: ("" if v is None else str(v)) for k, v in (ctx or {}).items()}
    return {
        "principalId": principal or "unknown",
        "policyDocument": {
            "Version": "2012-10-17",
            "Statement": [{"Action": "execute-api:Invoke", "Effect": effect, "Resource": method_arn}],
        },
        "context": ctx,
    }

def _deny(method_arn: str, reason: str):
    return _policy("Deny", "unknown", method_arn, {"error": reason})

def lambda_handler(event, context):
    method_arn = event.get("methodArn", "*")

    try:
        # Expect “Authorization: Bearer <JWT>”
        raw = event.get("authorizationToken") or ""
        m = re.match(r"^\s*Bearer\s+(.+)\s*$", raw, re.I)
        if not m:
            return _deny(method_arn, "missing_or_malformed_bearer")
        token = m.group(1)

        # Periodic JWKS refresh
        global _last_refresh
        if time.time() - _last_refresh > CACHE_SECS:
            try:
                _jwks_client.get_jwk_set(force_refresh=True)
            except Exception:
                pass
            _last_refresh = time.time()

        # Get signing key & verify
        key = _jwks_client.get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token,
            key=key,
            algorithms=["RS256"],
            audience=JWT_AUD,
            issuer=JWT_ISS,
        )

        sub = claims.get("sub", "unknown")
        return _policy("Allow", sub, method_arn, {
            "sub": sub,
            "iss": claims.get("iss", ""),
            "aud": claims.get("aud", ""),
            "scope": claims.get("scope", "")
        })

    except ExpiredSignatureError:
        return _deny(method_arn, "jwt_expired")
    except InvalidTokenError as e:
        return _deny(method_arn, f"invalid_token:{e.__class__.__name__}")
    except Exception as e:
        traceback.print_exc()
        return _deny(method_arn, f"authorizer_exception:{e.__class__.__name__}")
