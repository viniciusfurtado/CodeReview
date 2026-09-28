"""
CLI Proxy Server — Ponte HTTP para Claude CLI e Agy CLI.

Expõe endpoints compatíveis com Anthropic Messages API e OpenAI Chat
Completions API, redirecionando chamadas para os CLIs locais da VPS.

O app Next.js chama estes endpoints como se fossem APIs reais, mas por trás
o proxy executa os CLIs via subprocess e formata a resposta no padrão esperado.
"""

import asyncio
import json
import os
import time
import uuid
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
import uvicorn

# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------

PROXY_API_KEY = os.environ.get("PROXY_API_KEY", "")
CLAUDE_CLI_CMD = os.environ.get("CLAUDE_CLI_CMD", "claude")
AGY_CLI_CMD = os.environ.get("AGY_CLI_CMD", "agy")
CLI_TIMEOUT = int(os.environ.get("CLI_TIMEOUT", "120"))  # segundos

app = FastAPI(title="CLI Proxy", version="1.0.0")


# ---------------------------------------------------------------------------
# Autenticação simples por Bearer token
# ---------------------------------------------------------------------------

def verify_auth(authorization: Optional[str]):
    """Valida o header Authorization contra PROXY_API_KEY."""
    if not PROXY_API_KEY:
        return  # sem chave configurada, aceita tudo (dev local)
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header ausente")
    token = authorization.replace("Bearer ", "").strip()
    if token != PROXY_API_KEY:
        raise HTTPException(status_code=401, detail="Token inválido")


# ---------------------------------------------------------------------------
# Execução de CLI via subprocess
# ---------------------------------------------------------------------------

async def run_cli(cmd: list[str], stdin_text: str = "") -> str:
    """
    Executa um comando CLI de forma assíncrona, envia stdin_text via pipe
    e retorna o stdout. Levanta exceção em caso de erro ou timeout.
    """
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            process.communicate(input=stdin_text.encode("utf-8")),
            timeout=CLI_TIMEOUT,
        )

        if process.returncode != 0:
            err_msg = stderr.decode("utf-8", errors="replace").strip()
            raise RuntimeError(
                f"CLI exited with code {process.returncode}: {err_msg}"
            )

        return stdout.decode("utf-8", errors="replace").strip()

    except asyncio.TimeoutError:
        process.kill()
        raise HTTPException(
            status_code=504,
            detail=f"CLI timeout após {CLI_TIMEOUT}s",
        )


def build_prompt_text(system: str, messages: list[dict]) -> str:
    """
    Combina system prompt + mensagens do usuário em um texto único
    para enviar ao CLI como argumento -p ou via stdin.
    """
    parts = []
    if system:
        parts.append(f"[Instrução de Sistema]\n{system}\n")
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if isinstance(content, list):
            # Anthropic envia content como array de blocks
            content = " ".join(
                block.get("text", "") for block in content if block.get("type") == "text"
            )
        if role == "system":
            parts.append(f"[Sistema]\n{content}\n")
        elif role == "user":
            parts.append(f"[Usuário]\n{content}\n")
        elif role == "assistant":
            parts.append(f"[Assistente]\n{content}\n")
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# POST /v1/messages — Compatível com Anthropic Messages API
# Chamado pelo SDK Anthropic no Next.js para o fallback Claude na VPS.
# ---------------------------------------------------------------------------

@app.post("/v1/messages")
async def anthropic_messages(request: Request, authorization: str = Header(None)):
    verify_auth(authorization)

    body = await request.json()
    system = body.get("system", "")
    messages = body.get("messages", [])
    # max_tokens = body.get("max_tokens", 4096)  # disponível se necessário

    prompt_text = build_prompt_text(system, messages)

    # Chama o Claude CLI no modo não-interativo.
    # Ajuste os flags conforme a versão instalada na VPS:
    #   claude -p "prompt"                     (modo print básico)
    #   claude -p "prompt" --output-format json (se suportar JSON output)
    #   echo "prompt" | claude --pipe           (modo pipe)
    cmd = [CLAUDE_CLI_CMD, "-p", prompt_text]

    raw_output = await run_cli(cmd)

    # Formata como resposta Anthropic Messages API.
    return JSONResponse(content={
        "id": f"msg_{uuid.uuid4().hex[:24]}",
        "type": "message",
        "role": "assistant",
        "model": body.get("model", "claude-cli"),
        "content": [
            {
                "type": "text",
                "text": raw_output,
            }
        ],
        "stop_reason": "end_turn",
        "stop_sequence": None,
        "usage": {
            "input_tokens": len(prompt_text.split()),
            "output_tokens": len(raw_output.split()),
        },
    })


# ---------------------------------------------------------------------------
# POST /v1/chat/completions — Compatível com OpenAI Chat Completions API
# Chamado pelo SDK OpenAI no Next.js para o fallback Agy na VPS.
# ---------------------------------------------------------------------------

@app.post("/v1/chat/completions")
async def openai_chat_completions(
    request: Request, authorization: str = Header(None)
):
    verify_auth(authorization)

    body = await request.json()
    messages = body.get("messages", [])

    # Extrai system prompt se houver.
    system = ""
    user_messages = []
    for msg in messages:
        if msg.get("role") == "system":
            system = msg.get("content", "")
        else:
            user_messages.append(msg)

    prompt_text = build_prompt_text(system, user_messages)

    # Chama o Agy CLI no modo não-interativo.
    # Ajuste os flags conforme a versão instalada na VPS:
    #   agy -p "prompt"
    #   echo "prompt" | agy --pipe
    cmd = [AGY_CLI_CMD, "-p", prompt_text]

    raw_output = await run_cli(cmd)

    # Formata como resposta OpenAI Chat Completions API.
    return JSONResponse(content={
        "id": f"chatcmpl-{uuid.uuid4().hex[:24]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": body.get("model", "agy-cli"),
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": raw_output,
                },
                "finish_reason": "stop",
            }
        ],
        "usage": {
            "prompt_tokens": len(prompt_text.split()),
            "completion_tokens": len(raw_output.split()),
            "total_tokens": len(prompt_text.split()) + len(raw_output.split()),
        },
    })


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok", "claude_cmd": CLAUDE_CLI_CMD, "agy_cmd": AGY_CLI_CMD}


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PROXY_PORT", "8787"))
    print(f"🚀 CLI Proxy iniciando na porta {port}")
    print(f"   Claude CLI: {CLAUDE_CLI_CMD}")
    print(f"   Agy CLI:    {AGY_CLI_CMD}")
    print(f"   Timeout:    {CLI_TIMEOUT}s")
    print(f"   Auth:       {'habilitada' if PROXY_API_KEY else 'desabilitada (dev)'}")
    uvicorn.run(app, host="0.0.0.0", port=port)
