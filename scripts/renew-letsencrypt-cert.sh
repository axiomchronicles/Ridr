#!/usr/bin/env sh
set -eu

DOMAIN="${1:-ecoridr.tubox.cloud}"
COMPOSE_FILE_INPUT="${COMPOSE_FILE:-docker-compose.yml}"

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
WEBROOT_DIR="$PROJECT_ROOT/nginx/www"
LETSENCRYPT_DIR="$PROJECT_ROOT/nginx/letsencrypt"
SSL_DIR="$PROJECT_ROOT/nginx/ssl"

if [ -f "$COMPOSE_FILE_INPUT" ]; then
  COMPOSE_FILE_PATH="$COMPOSE_FILE_INPUT"
elif [ -f "$PROJECT_ROOT/$COMPOSE_FILE_INPUT" ]; then
  COMPOSE_FILE_PATH="$PROJECT_ROOT/$COMPOSE_FILE_INPUT"
else
  echo "Compose file not found: $COMPOSE_FILE_INPUT"
  exit 1
fi

mkdir -p "$WEBROOT_DIR" "$LETSENCRYPT_DIR" "$SSL_DIR"

cd "$PROJECT_ROOT"

echo "Renewing Let's Encrypt certificates..."
docker run --rm \
  -v "$WEBROOT_DIR:/var/www/certbot" \
  -v "$LETSENCRYPT_DIR:/etc/letsencrypt" \
  certbot/certbot:latest renew \
  --webroot \
  -w /var/www/certbot \
  --non-interactive

if [ ! -f "$LETSENCRYPT_DIR/live/$DOMAIN/fullchain.pem" ] || [ ! -f "$LETSENCRYPT_DIR/live/$DOMAIN/privkey.pem" ]; then
  echo "Certificate files not found after renewal for $DOMAIN"
  exit 1
fi

cp "$LETSENCRYPT_DIR/live/$DOMAIN/fullchain.pem" "$SSL_DIR/fullchain.pem"
cp "$LETSENCRYPT_DIR/live/$DOMAIN/privkey.pem" "$SSL_DIR/privkey.pem"
chmod 644 "$SSL_DIR/fullchain.pem"
chmod 600 "$SSL_DIR/privkey.pem"

echo "Reloading nginx..."
docker compose -f "$COMPOSE_FILE_PATH" restart nginx

echo "Done. Certificates refreshed for $DOMAIN."
