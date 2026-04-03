# SSL Certificates for ecoridr.tubox.cloud

Place your TLS certificate files in this directory before starting Docker Compose.

Required files:
- fullchain.pem
- privkey.pem

Expected container paths:
- /etc/nginx/ssl/fullchain.pem
- /etc/nginx/ssl/privkey.pem

You can copy these from Let's Encrypt, for example:
- /etc/letsencrypt/live/ecoridr.tubox.cloud/fullchain.pem
- /etc/letsencrypt/live/ecoridr.tubox.cloud/privkey.pem

For local/testing only, generate a self-signed certificate with:
- ./nginx/ssl/generate-self-signed.sh

For production trusted SSL, issue a Let's Encrypt certificate and copy it automatically with:
- ./scripts/issue-letsencrypt-cert.sh ecoridr.tubox.cloud your-email@example.com
