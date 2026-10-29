"""Apply db/schema.sql and db/seed.sql to the Aurora cluster through the RDS Data API.

The Data API runs one statement per call, so the files are split on ';' + newline
(comment-only lines are dropped). Cluster and secret ARNs come from the stack outputs.
"""
import argparse
import json
import pathlib
import subprocess
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument("--profile", required=True)
parser.add_argument("--region", required=True)
parser.add_argument("--stack-name", default="verde-backend")
args = parser.parse_args()

AWS = ["aws", "--profile", args.profile, "--region", args.region]
DB_DIR = pathlib.Path(__file__).resolve().parent.parent / "db"


def aws(*cmd):
    return subprocess.run(AWS + list(cmd), capture_output=True, text=True)


outputs = aws("cloudformation", "describe-stacks", "--stack-name", args.stack_name,
              "--query", "Stacks[0].Outputs", "--output", "json")
if outputs.returncode != 0:
    sys.exit(outputs.stderr)
out = {o["OutputKey"]: o["OutputValue"] for o in json.loads(outputs.stdout)}
CLUSTER, SECRET = out["DbClusterArn"], out["DbSecretArn"]


def statements(path):
    lines = [l for l in path.read_text().splitlines() if not l.lstrip().startswith("--")]
    return [s.strip() for s in "\n".join(lines).split(";\n") if s.strip().rstrip(";")]


def execute(sql, retries=24):
    for attempt in range(retries):
        proc = aws("rds-data", "execute-statement", "--resource-arn", CLUSTER,
                   "--secret-arn", SECRET, "--database", "verde", "--sql", sql)
        if proc.returncode == 0:
            return
        # Cluster still starting or resuming: wait and retry.
        if any(k in proc.stderr for k in ("DatabaseResuming", "BadRequestException", "Communications link")) and attempt < retries - 1:
            time.sleep(10)
            continue
        sys.exit(f"Failed:\n{sql[:300]}\n{proc.stderr}")


for name in ("schema.sql", "seed.sql"):
    stmts = statements(DB_DIR / name)
    print(f"{name}: {len(stmts)} statements")
    for i, stmt in enumerate(stmts, 1):
        execute(stmt.rstrip(";"))
        if i % 10 == 0 or i == len(stmts):
            print(f"  {i}/{len(stmts)}")

# Article images live in the stack's S3 bucket (synced by deploy.sh); point rows at them.
if out.get("AssetsBaseUrl"):
    execute(
        f"UPDATE articles SET image_url = CONCAT('{out['AssetsBaseUrl']}/articles/', article_id, '.jpg') "
        "WHERE image_url IS NULL"
    )
    print("article image URLs set")

print("Database initialised")
