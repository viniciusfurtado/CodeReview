import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { AnalysisFinding, Severity } from './types';

export const DEFAULT_LLM_TIMEOUT_MS = 45_000;

const VALID_SEVERITY: Severity[] = ['INFO', 'WARNING', 'ERROR'];

export function coerceSeverity(value: unknown): Severity {
  const v = String(value ?? '').toUpperCase();
  return (VALID_SEVERITY as string[]).includes(v) ? (v as Severity) : 'WARNING';
}

/** Extrai o objeto JSON de uma resposta que pode vir com cercas de markdown ou texto ao redor. */
export function extractJsonObject(raw: string): string {
  let text = (raw ?? '').trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) text = fenceMatch[1].trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last !== -1) text = text.slice(first, last + 1);
  return text;
}

export interface ParsedFindings {
  summary: string;
  findings: AnalysisFinding[];
}

export function parseFindingsJson(raw: string): ParsedFindings {
  const data = JSON.parse(extractJsonObject(raw));
  const findings: AnalysisFinding[] = Array.isArray(data.findings)
    ? data.findings.map((f: any) => ({
        filePath: String(f.filePath ?? f.file ?? 'desconhecido'),
        line:
          f.line === null || f.line === undefined || Number.isNaN(Number(f.line))
            ? null
            : Number(f.line),
        severity: coerceSeverity(f.severity),
        title: String(f.title ?? 'Apontamento'),
        message: String(f.message ?? ''),
        suggestion: f.suggestion ? String(f.suggestion) : null,
      }))
    : [];
  return {
    summary: String(data.summary ?? 'Análise concluída.'),
    findings,
  };
}

export interface OpenAICompatibleOptions {
  apiKey: string;
  baseURL: string;
  model: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/** Cliente genérico compatível com OpenAI (OpenRouter, agy local na VPS, etc.). */
export async function callOpenAICompatible(
  opts: OpenAICompatibleOptions,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const client = new OpenAI({
    apiKey: opts.apiKey,
    baseURL: opts.baseURL,
    defaultHeaders: opts.headers,
    timeout: opts.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS,
    maxRetries: 0,
  });

  const completion = await client.chat.completions.create({
    model: opts.model,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  return completion.choices?.[0]?.message?.content ?? '';
}

export interface AnthropicCompatibleOptions {
  apiKey: string;
  model: string;
  baseURL?: string;
  timeoutMs?: number;
  maxTokens?: number;
}

/** Cliente Anthropic Claude (chave própria ou instância na VPS via baseURL). */
export async function callAnthropicCompatible(
  opts: AnthropicCompatibleOptions,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const client = new Anthropic({
    ...(opts.baseURL ? { authToken: opts.apiKey } : { apiKey: opts.apiKey }),
    baseURL: opts.baseURL,
    timeout: opts.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS,
    maxRetries: 0,
  });

  const message = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: 0.1,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const block = message.content?.[0];
  return block && block.type === 'text' ? block.text : '';
}
