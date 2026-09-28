#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEXT_DIR="$DIR/nextjs_space"
PROXY_DIR="$DIR/cli-proxy"
PUBLIC_DOMAIN="codereview.109-199-115-182.sslip.io"
PUBLIC_URL="https://$PUBLIC_DOMAIN"

start_all() {
  echo "==> Iniciando PostgreSQL..."
  service postgresql start >/dev/null 2>&1 || true

  echo "==> Iniciando CLI-Proxy (porta 8787)..."
  if ! pm2 describe cli-proxy >/dev/null 2>&1; then
    pm2 start "$PROXY_DIR/server.py" --name "cli-proxy" --interpreter python3
  else
    pm2 restart cli-proxy
  fi

  # Se houver tunnel antigo no PM2, desativamos
  if pm2 describe tunnel >/dev/null 2>&1; then
    echo "==> Desativando túnel Cloudflare antigo..."
    pm2 delete tunnel >/dev/null 2>&1 || true
  fi

  echo "==> Sincronizando AUTH_URL com $PUBLIC_URL..."
  sed -i '/AUTH_URL=/d' "$NEXT_DIR/.env"
  echo "AUTH_URL=$PUBLIC_URL" >> "$NEXT_DIR/.env"

  echo "==> Iniciando Next.js (porta 3000)..."
  if ! pm2 describe codereview-web >/dev/null 2>&1; then
    pm2 start npm --name "codereview-web" --cwd "$NEXT_DIR" --update-env -- start
  else
    pm2 restart codereview-web --update-env
  fi

  echo "==> Aguardando Next.js responder..."
  for i in $(seq 1 20); do
    if curl -s http://127.0.0.1:3000 >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  pm2 save >/dev/null 2>&1 || true

  echo ""
  echo "================================================================="
  echo "  🚀 AI Code Review SaaS está pronto e em execução!"
  echo "================================================================="
  echo "  🌍 Acesso Externo (Caddy + sslip.io):"
  echo "  👉 $PUBLIC_URL"
  echo ""
  echo "  💻 Acesso Local / Interno:"
  echo "  👉 http://localhost:3000"
  echo "================================================================="
}

stop_all() {
  echo "==> Parando processos PM2..."
  pm2 stop codereview-web cli-proxy >/dev/null 2>&1 || true
  pm2 stop tunnel >/dev/null 2>&1 || true
  echo "==> Serviços parados."
}

status_all() {
  echo "==> Status do PostgreSQL:"
  service postgresql status || true
  echo ""
  echo "==> Status dos Serviços PM2:"
  pm2 status
  echo ""
  echo "==> URL Pública Fixa:"
  echo "  👉 $PUBLIC_URL"
}

show_url() {
  echo "$PUBLIC_URL"
}

show_logs() {
  pm2 logs "${2:-codereview-web}"
}

case "$1" in
  start)
    start_all
    ;;
  stop)
    stop_all
    ;;
  restart)
    stop_all
    start_all
    ;;
  status)
    status_all
    ;;
  url)
    show_url
    ;;
  logs)
    show_logs "$@"
    ;;
  *)
    echo "Uso: $0 {start|stop|restart|status|url|logs}"
    exit 1
    ;;
esac
