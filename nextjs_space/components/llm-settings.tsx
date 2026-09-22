'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Loader2, Lock, Coins, Server, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  DEFAULT_MODELS,
  OPENROUTER_FREE_MODELS,
  ANTHROPIC_MODELS,
} from '@/lib/llm/types';

type ProviderId = 'OPENROUTER' | 'ANTHROPIC';
type ModeId = 'SERVICE' | 'BYOK';

const CUSTOM = '__custom__';

interface Props {
  orgId: string;
  initialMode: ModeId;
  initialProvider: ProviderId;
  initialModel: string | null;
  credits: number;
}

export function LlmSettings({
  orgId,
  initialMode,
  initialProvider,
  initialModel,
  credits,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const hasCredits = credits > 0;

  const [mode, setMode] = useState<ModeId>(initialMode);
  const [provider, setProvider] = useState<ProviderId>(initialProvider);

  // Estado do modelo do OpenRouter: escolha de lista ou personalizado.
  const initialFreeMatch = OPENROUTER_FREE_MODELS.find(
    (m) => m.id === initialModel
  );
  const [orModelChoice, setOrModelChoice] = useState<string>(
    initialProvider === 'OPENROUTER'
      ? initialFreeMatch
        ? initialFreeMatch.id
        : initialModel
          ? CUSTOM
          : DEFAULT_MODELS.OPENROUTER
      : DEFAULT_MODELS.OPENROUTER
  );
  const [orCustom, setOrCustom] = useState<string>(
    initialProvider === 'OPENROUTER' && !initialFreeMatch && initialModel
      ? initialModel
      : ''
  );

  // Estado do modelo do Claude.
  const [anthropicModel, setAnthropicModel] = useState<string>(
    initialProvider === 'ANTHROPIC' && initialModel
      ? initialModel
      : DEFAULT_MODELS.ANTHROPIC
  );

  const [saving, setSaving] = useState(false);

  function resolveModel(): string | null {
    if (provider === 'ANTHROPIC') return anthropicModel || null;
    if (orModelChoice === CUSTOM) return orCustom.trim() || null;
    return orModelChoice || null;
  }

  async function handleSave() {
    // No modo SERVICE o provedor salvo é sempre o OpenRouter gratuito (o Claude
    // premium na VPS é acionado automaticamente quando há créditos).
    const effectiveProvider: ProviderId =
      mode === 'SERVICE' ? 'OPENROUTER' : provider;
    // No modo SERVICE o motor é escolhido automaticamente pelo serviço; não
    // expomos seleção de modelo ao cliente.
    const effectiveModel = mode === 'SERVICE' ? null : resolveModel();

    setSaving(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          llmMode: mode,
          llmProvider: effectiveProvider,
          llmModel: effectiveModel,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? 'Falha ao salvar');
      }
      toast({
        title: 'Configuração de IA atualizada',
        description: 'As preferências de análise foram salvas com sucesso.',
      });
      router.refresh();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: err instanceof Error ? err.message : 'Tente novamente.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4" />
          Motor de Análise por IA
        </div>
        <Badge variant={hasCredits ? 'success' : 'secondary'} className="gap-1">
          <Coins className="h-3 w-3" />
          {credits} crédito{credits === 1 ? '' : 's'}
        </Badge>
      </div>

      {/* Seletor de origem da IA */}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode('SERVICE')}
          className={`flex items-start gap-2 rounded-md border p-3 text-left transition ${
            mode === 'SERVICE'
              ? 'border-primary bg-primary/5'
              : 'border-border hover:bg-muted'
          }`}
        >
          <Server className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="text-xs">
            <span className="block text-sm font-medium">IA Serviço (Créditos)</span>
            Motor de análise gerenciado pelo serviço, com alta disponibilidade
            automática. Consome créditos da organização quando necessário.
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMode('BYOK')}
          className={`flex items-start gap-2 rounded-md border p-3 text-left transition ${
            mode === 'BYOK'
              ? 'border-primary bg-primary/5'
              : 'border-border hover:bg-muted'
          }`}
        >
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="text-xs">
            <span className="block text-sm font-medium">Chave Própria</span>
            Use a sua própria chave de API. Você paga o provedor diretamente,
            sem consumir créditos.
          </span>
        </button>
      </div>

      {mode === 'SERVICE' ? (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            A análise é executada pela infraestrutura de IA do serviço, com
            redundância automática entre múltiplos motores para garantir alta
            disponibilidade. Quando necessário, um motor adicional é acionado
            automaticamente, consumindo créditos da organização.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            No modo BYOK, a análise usa a chave configurada para a sua
            organização. Selecione o provedor e o modelo desejados.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor={`provider-${orgId}`}>Provedor</Label>
            <Select
              value={provider}
              onValueChange={(v) => setProvider(v as ProviderId)}
            >
              <SelectTrigger id={`provider-${orgId}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OPENROUTER">OpenRouter</SelectItem>
                <SelectItem value="ANTHROPIC">Claude (Anthropic)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {provider === 'OPENROUTER' ? (
            <div className="space-y-1.5">
              <Label htmlFor={`ormodel-byok-${orgId}`}>Modelo</Label>
              <Select value={orModelChoice} onValueChange={setOrModelChoice}>
                <SelectTrigger id={`ormodel-byok-${orgId}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPENROUTER_FREE_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM}>
                    Outro (personalizado)...
                  </SelectItem>
                </SelectContent>
              </Select>
              {orModelChoice === CUSTOM && (
                <Input
                  value={orCustom}
                  onChange={(e) => setOrCustom(e.target.value)}
                  placeholder="ex.: openai/gpt-4o-mini"
                />
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor={`anmodel-${orgId}`}>Modelo</Label>
              <Select value={anthropicModel} onValueChange={setAnthropicModel}>
                <SelectTrigger id={`anmodel-${orgId}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ANTHROPIC_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <Lock className="h-3 w-3 shrink-0" />
            A chave de API é configurada no servidor do serviço. Fale com o
            administrador para cadastrar a chave da sua organização.
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar configuração
        </Button>
      </div>
    </div>
  );
}
