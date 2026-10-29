#!/usr/bin/env bash
# Deploy the Verde backend: dependency layer -> JWT key -> SAM stack -> database schema + seed.
# Usage: AWS_PROFILE=fresh-deploy AWS_REGION=ap-southeast-2 scripts/deploy.sh
set -euo pipefail

PROFILE="${AWS_PROFILE:-fresh-deploy}"
REGION="${AWS_REGION:-ap-southeast-2}"
STACK="${STACK_NAME:-verde-backend}"

cd "$(dirname "$0")/.."

[ -d layer/python ] || scripts/build_layer.sh

python3 -I scripts/bootstrap_keys.py --profile "$PROFILE" --region "$REGION"
# shellcheck disable=SC1091
source .deploy-params

sam deploy \
  --template-file template.yaml \
  --stack-name "$STACK" \
  --profile "$PROFILE" \
  --region "$REGION" \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides "JwtModulus=${JWT_MODULUS}" \
  --no-fail-on-empty-changeset

BUCKET="$(aws cloudformation describe-stacks --stack-name "$STACK" --profile "$PROFILE" --region "$REGION" \
  --query 'Stacks[0].Outputs[?OutputKey==`AssetsBucketName`].OutputValue' --output text)"
aws s3 sync assets/articles "s3://${BUCKET}/articles" --exclude '*.md' --profile "$PROFILE" --region "$REGION"

python3 -I scripts/init_db.py --profile "$PROFILE" --region "$REGION" --stack-name "$STACK"

echo
aws cloudformation describe-stacks --stack-name "$STACK" --profile "$PROFILE" --region "$REGION" \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiBaseUrl`].OutputValue' --output text
