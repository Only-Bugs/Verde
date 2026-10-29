"""Create (or reuse) the JWT signing key and write its public half for the SAM deploy.

The private PEM lives only in Secrets Manager; the public modulus goes to .deploy-params,
which scripts/deploy.sh feeds to the template as the JwtModulus parameter.
"""
import argparse
import base64
import pathlib
import subprocess
import sys
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument("--profile", required=True)
parser.add_argument("--region", required=True)
parser.add_argument("--secret-name", default="verde/jwt-private-key")
args = parser.parse_args()

AWS = ["aws", "--profile", args.profile, "--region", args.region]
OUT = pathlib.Path(__file__).resolve().parent.parent / ".deploy-params"


def run(cmd, **kwargs):
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kwargs).stdout


def existing_pem():
    proc = subprocess.run(
        AWS + ["secretsmanager", "get-secret-value", "--secret-id", args.secret_name,
               "--query", "SecretString", "--output", "text"],
        capture_output=True, text=True,
    )
    if proc.returncode == 0:
        return proc.stdout.strip()
    if "ResourceNotFoundException" in proc.stderr:
        return None
    sys.exit(f"Could not read secret {args.secret_name}: {proc.stderr.strip()}")


pem = existing_pem()
if pem:
    print(f"Reusing existing secret {args.secret_name}")
else:
    pem = run(["openssl", "genrsa", "2048"]).strip()
    with tempfile.TemporaryDirectory() as tmp:
        secret_file = pathlib.Path(tmp) / "key.pem"
        secret_file.write_text(pem)
        secret_file.chmod(0o600)
        run(AWS + ["secretsmanager", "create-secret", "--name", args.secret_name,
                   "--description", "Verde JWT RS256 private key",
                   "--secret-string", f"file://{secret_file}"])
    print(f"Created secret {args.secret_name}")

modulus_line = run(["openssl", "rsa", "-noout", "-modulus"], input=pem).strip()
modulus_hex = modulus_line.split("=", 1)[1]
modulus_b64 = base64.urlsafe_b64encode(bytes.fromhex(modulus_hex)).rstrip(b"=").decode()

OUT.write_text(f"JWT_MODULUS={modulus_b64}\n")
print(f"Wrote public key parameters to {OUT.name}")
