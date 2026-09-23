# AI Code Review SaaS

Plataforma SaaS para revisão de código automatizada com Inteligência Artificial integrada ao GitHub.

## 🚀 Como Executar e Gerenciar

O projeto conta com o script central [`manage.sh`](file:///root/Projetos/CodeReview/manage.sh) para gerenciar todos os serviços necessários:

```bash
# Ver status dos serviços e URL pública ativa
./manage.sh status

# Obter apenas a URL pública atual
./manage.sh url

# Iniciar todos os serviços
./manage.sh start

# Reiniciar todos os serviços
./manage.sh restart

# Parar serviços
./manage.sh stop

# Ver logs (Next.js, cli-proxy ou tunnel)
./manage.sh logs codereview-web
./manage.sh logs cli-proxy
./manage.sh logs tunnel
```

## 🏗️ Arquitetura dos Serviços

1. **Banco de Dados (PostgreSQL)**:
   - Executa na porta `5432` com banco `codereview`.
   - Gerenciado via `service postgresql`.

2. **CLI Proxy (`cli-proxy`)**:
   - Ponte HTTP leve (FastAPI) na porta `8787` compatível com Anthropic/OpenAI APIs.
   - Redireciona chamadas para os utilitários de linha de comando locais (`claude` e `agy`).
   - Configurado via [`cli-proxy/.env`](file:///root/Projetos/CodeReview/cli-proxy/.env) e gerenciado via PM2.

3. **Frontend & API Next.js (`nextjs_space`)**:
   - Next.js 16 App Router na porta `3000`.
   - Configurado via [`nextjs_space/.env`](file:///root/Projetos/CodeReview/nextjs_space/.env) e gerenciado via PM2.

4. **Túnel Público (Cloudflare Tunnel)**:
   - Exponibiliza a aplicação na web com HTTPS automático sem necessidade de abrir portas no firewall/NAT da VPS.
   - O endereço público gerado é sincronizado automaticamente na variável `AUTH_URL` do NextAuth.