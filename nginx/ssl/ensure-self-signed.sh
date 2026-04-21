#!/usr/bin/env sh
set -eu

DOMAIN="${SSL_DOMAIN:-ecoridr.tubox.cloud}"
SSL_DIR="${SSL_DIR:-/etc/nginx/ssl}"
FULLCHAIN_FILE="$SSL_DIR/fullchain.pem"
PRIVKEY_FILE="$SSL_DIR/privkey.pem"

if [ -s "$FULLCHAIN_FILE" ] && [ -s "$PRIVKEY_FILE" ]; then
  echo "TLS certificate already present for $DOMAIN"
  exit 0
fi

mkdir -p "$SSL_DIR"
umask 077

openssl req \
  -x509 \
  -nodes \
  -newkey rsa:2048 \
  -sha256 \
  -days 365 \
  -keyout "$PRIVKEY_FILE" \
  -out "$FULLCHAIN_FILE" \
  -subj "/CN=$DOMAIN" \
  -addext "subjectAltName=DNS:$DOMAIN"

chmod 644 "$FULLCHAIN_FILE"
chmod 600 "$PRIVKEY_FILE"

echo "Created fallback self-signed certificate for $DOMAIN"