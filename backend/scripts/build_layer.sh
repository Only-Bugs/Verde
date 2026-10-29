#!/usr/bin/env bash
# Build the Lambda dependency layer for the Lambda platform (Linux x86_64, Python 3.13)
# without Docker: pip is told to fetch manylinux wheels instead of macOS ones.
set -euo pipefail

cd "$(dirname "$0")/../layer"
rm -rf python
mkdir python

pip3 install \
  --requirement requirements.txt \
  --target python \
  --platform manylinux2014_x86_64 \
  --implementation cp \
  --python-version 3.13 \
  --only-binary=:all: \
  --upgrade

find python -name '__pycache__' -type d -prune -exec rm -rf {} +
echo "Layer built: $(du -sh python | cut -f1) in layer/python"
