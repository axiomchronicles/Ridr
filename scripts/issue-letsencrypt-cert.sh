#!/usr/bin/env sh
set -eu

DOMAIN="${1:-ecoridr.tubox.cloud}"
EMAIL="${2:-}"
COMPOSE_FILE_INPUT="${COMPOSE_FILE:-docker-compose.yml}"

if [ -z "$EMAIL" ]; then
  echo "Usage: $0 [domain] <email>"
  echo "Example: $0 ecoridr.tubox.cloud admin@ecoridr.tubox.cloud"
  exit 1
fi

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

echo "Starting nginx so ACME challenges can be served..."
docker compose -f "$COMPOSE_FILE_PATH" up -d nginx

echo "Requesting Let's Encrypt certificate for $DOMAIN..."
docker run --rm \
  -v "$WEBROOT_DIR:/var/www/certbot" \
  -v "$LETSENCRYPT_DIR:/etc/letsencrypt" \
  certbot/certbot:latest certonly \
  --webroot \
  -w /var/www/certbot \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --non-interactive

if [ ! -f "$LETSENCRYPT_DIR/live/$DOMAIN/fullchain.pem" ] || [ ! -f "$LETSENCRYPT_DIR/live/$DOMAIN/privkey.pem" ]; then
  echo "Certificate files were not created for $DOMAIN"
  exit 1
fi

cp "$LETSENCRYPT_DIR/live/$DOMAIN/fullchain.pem" "$SSL_DIR/fullchain.pem"
cp "$LETSENCRYPT_DIR/live/$DOMAIN/privkey.pem" "$SSL_DIR/privkey.pem"
chmod 644 "$SSL_DIR/fullchain.pem"
chmod 600 "$SSL_DIR/privkey.pem"

echo "Reloading nginx with trusted certificate..."
docker compose -f "$COMPOSE_FILE_PATH" restart nginx

echo "Done. TLS certificate installed for $DOMAIN."
