#!/usr/bin/env sh
set -eu

DOMAIN="ecoridr.tubox.cloud"
OUT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

openssl req \
  -x509 \
  -nodes \
  -newkey rsa:2048 \
  -sha256 \
  -days 365 \
  -keyout "$OUT_DIR/privkey.pem" \
  -out "$OUT_DIR/fullchain.pem" \
  -subj "/CN=$DOMAIN" \
  -addext "subjectAltName=DNS:$DOMAIN"

echo "Created: $OUT_DIR/fullchain.pem"
echo "Created: $OUT_DIR/privkey.pem"
