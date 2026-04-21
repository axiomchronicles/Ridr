FROM nginx:1.27-alpine

RUN apk add --no-cache openssl

COPY default.conf /etc/nginx/conf.d/default.conf
COPY ssl/ensure-self-signed.sh /docker-entrypoint.d/20-ensure-self-signed.sh

RUN chmod +x /docker-entrypoint.d/20-ensure-self-signed.sh