import os, json, time
import boto3
import jwt


sm = boto3.client("secretsmanager")
rds_client = boto3.client("rds-data")

"""
SECRET_ID         : Secrets Manager secret containing private RSA key
JWT_ISS           : Issuer claim
JWT_AUD           : Audience claim
JWT_TTL_SECONDS   : Token lifetime in seconds
KID               : JWKS kid

DB_CLUSTER_ARN    : ARN of Aurora cluster (for Data API)
DB_SECRET_ARN     : ARN of the Secrets Manager secret for the DB creds
"""

SECRET_ID = os.environ["SECRET_ID"]
ISS = os.environ.get("JWT_ISS", "verde-auth")
AUD = os.environ.get("JWT_AUD", "verde-api")
TTL = int(os.environ.get("JWT_TTL_SECONDS", "900"))
KID = os.environ.get("KID", "k1")

DB_CLUSTER_ARN = os.environ["DB_CLUSTER_ARN"]
DB_SECRET_ARN = os.environ["DB_SECRET_ARN"]

_PRIVATE_PEM = None

def _get_private_key():
    global _PRIVATE_PEM
    if _PRIVATE_PEM:
        return _PRIVATE_PEM

    secret_val = sm.get_secret_value(SecretId=SECRET_ID)["SecretString"]
    try:
        j = json.loads(secret_val)
        _PRIVATE_PEM = j.get("private_pem") or secret_val
    except json.JSONDecodeError:
        _PRIVATE_PEM = secret_val
    return _PRIVATE_PEM

def _response(status, body):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Authorization,Content-Type",
            "Access-Control-Allow-Methods": "POST,OPTIONS"
        },
        "body": json.dumps(body)
    }

def _user_exists(eco_id: str) -> bool:
    sql = "SELECT 1 FROM verde.users WHERE id = :id LIMIT 1"
    params = [{'name': 'id', 'value': {'stringValue': eco_id}}]
    kwargs = {
        "secretArn":  DB_SECRET_ARN,
        "resourceArn": DB_CLUSTER_ARN,
        "sql": sql,
        "parameters": params
    }
    response = rds_client.execute_statement(**kwargs)
    return len(response.get("records", [])) > 0

def lambda_handler(event, _ctx):
    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            pass

    eco_id = body.get("eco_id", "").strip()
    if not eco_id:
        return _response(400, {"message": "eco_id required"})

    # Check the user exists before minting a token
    try:
        if not _user_exists(eco_id):
            # Generic message to avoid user-ID enumeration signal
            return _response(401, {"message": "Invalid credentials"})
    except Exception:
        # Don't issue a token if DB check has error
        return _response(500, {"message": "Token service temporarily unavailable"})

    now = int(time.time())
    claims = {
        "iss": ISS,
        "aud": AUD,
        "iat": now,
        "exp": now + TTL,
        "sub": eco_id,
        "scope": "user"
    }

    private_pem = _get_private_key()
    token = jwt.encode(claims, private_pem, algorithm="RS256", headers={"kid": KID})
    return _response(200, {"token": token})
