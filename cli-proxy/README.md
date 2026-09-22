# CLI Proxy — Ponte HTTP → Claude/Agy CLI

Servidor leve que expõe endpoints compatíveis com as APIs do Anthropic e OpenAI,
redirecionando as chamadas para os CLIs locais na VPS.

## Instalação

```bash
cd cli-proxy
pip install -r requirements.txt
```

## Uso

```bash
# Variáveis obrigatórias
export PROXY_API_KEY="chave-secreta-qualquer"  # proteção do endpoint

# Variáveis opcionais (ajustar ao CLI da VPS)
export CLAUDE_CLI_CMD="claude"          # comando do Claude CLI
export AGY_CLI_CMD="agy"               # comando do Agy CLI
export PROXY_PORT=8787                  # porta do servidor

# Iniciar
python server.py
```

## Endpoints

| Rota | Formato | CLI acionado |
|------|---------|-------------|
| `POST /v1/messages` | Anthropic Messages API | Claude CLI |
| `POST /v1/chat/completions` | OpenAI Chat Completions API | Agy CLI |
| `GET /health` | — | Health check |

## Integração com o Next.js

No `.env` do projeto Next.js:
```env
SERVICE_CLAUDE_BASE_URL=http://<ip-da-vps>:8787
SERVICE_CLAUDE_API_KEY=chave-secreta-qualquer
SERVICE_CLAUDE_MODEL=claude

SERVICE_AGY_BASE_URL=http://<ip-da-vps>:8787
SERVICE_AGY_API_KEY=chave-secreta-qualquer
SERVICE_AGY_MODEL=agy
```

## Execução como serviço (systemd)

```bash
sudo cp cli-proxy.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable cli-proxy
sudo systemctl start cli-proxy
```
