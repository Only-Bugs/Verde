#!/usr/bin/env bash
# Delete everything the deploy created so Aurora stops billing.
# Usage: AWS_PROFILE=fresh-deploy AWS_REGION=ap-southeast-2 scripts/teardown.sh
set -euo pipefail

PROFILE="${AWS_PROFILE:-fresh-deploy}"
REGION="${AWS_REGION:-ap-southeast-2}"
STACK="${STACK_NAME:-verde-backend}"

# CloudFormation cannot delete a non-empty bucket, so empty the image bucket first.
BUCKET="$(aws cloudformation describe-stacks --stack-name "$STACK" --profile "$PROFILE" --region "$REGION" \
  --query 'Stacks[0].Outputs[?OutputKey==`AssetsBucketName`].OutputValue' --output text 2>/dev/null || true)"
if [ -n "${BUCKET:-}" ] && [ "$BUCKET" != "None" ]; then
  aws s3 rm "s3://${BUCKET}" --recursive --profile "$PROFILE" --region "$REGION"
fi

sam delete --stack-name "$STACK" --profile "$PROFILE" --region "$REGION" --no-prompts

aws secretsmanager delete-secret --secret-id verde/jwt-private-key \
  --force-delete-without-recovery --profile "$PROFILE" --region "$REGION" || true

echo "Stack and JWT secret deleted. (The shared SAM artifact bucket aws-sam-cli-managed-default is left in place.)"
