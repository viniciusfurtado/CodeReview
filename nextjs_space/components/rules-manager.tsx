'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Pencil, Loader2, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

export interface RuleDTO {
  id: string;
  name: string;
  description: string | null;
  instruction: string;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  enabled: boolean;
}

export interface OrgWithRules {
  id: string;
  name: string;
  login: string;
  rules: RuleDTO[];
}

const SEVERITY_LABEL: Record<RuleDTO['severity'], string> = {
  ERROR: 'Erro',
  WARNING: 'Aviso',
  INFO: 'Informativo',
};

function severityVariant(
  s: RuleDTO['severity']
): 'destructive' | 'warning' | 'secondary' {
  if (s === 'ERROR') return 'destructive';
  if (s === 'WARNING') return 'warning';
  return 'secondary';
}

export function RulesManager({ orgs }: { orgs: OrgWithRules[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<RuleDTO | null>(null);

  const emptyForm = {
    organizationId: orgs[0]?.id ?? '',
    name: '',
    description: '',
    instruction: '',
    severity: 'WARNING',
  };
  const [form, setForm] = useState(emptyForm);

  function openCreateDialog() {
    setEditingRule(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEditDialog(rule: RuleDTO) {
    setEditingRule(rule);
    setForm({
      organizationId: '',
      name: rule.name,
      description: rule.description ?? '',
      instruction: rule.instruction,
      severity: rule.severity,
    });
    setOpen(true);
  }

  async function handleToggle(rule: RuleDTO, next: boolean) {
    setBusyId(rule.id);
    try {
      const res = await fetch(`/api/rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      toast({ title: 'Erro ao atualizar regra', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(rule: RuleDTO) {
    if (!confirm(`Excluir a regra “${rule.name}”?`)) return;
    setBusyId(rule.id);
    try {
      const res = await fetch(`/api/rules/${rule.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast({ title: 'Regra excluída' });
      router.refresh();
    } catch {
      toast({ title: 'Erro ao excluir regra', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  }

  async function handleSave() {
    if (!form.name.trim() || !form.instruction.trim()) {
      toast({
        title: 'Preencha nome e instrução',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const res = editingRule
        ? await fetch(`/api/rules/${editingRule.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: form.name,
              description: form.description,
              instruction: form.instruction,
              severity: form.severity,
            }),
          })
        : await fetch('/api/rules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
          });
      if (!res.ok) throw new Error();
      toast({ title: editingRule ? 'Regra atualizada' : 'Regra criada' });
      setOpen(false);
      setEditingRule(null);
      setForm(emptyForm);
      router.refresh();
    } catch {
      toast({
        title: editingRule ? 'Erro ao atualizar regra' : 'Erro ao criar regra',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  const hasOrgs = orgs.length > 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Regras de revisão</h1>
          <p className="text-muted-foreground">
            Defina o que a IA deve verificar em cada Pull Request.
          </p>
        </div>
        {hasOrgs && (
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) setEditingRule(null);
            }}
          >
            <Button className="gap-2" onClick={openCreateDialog}>
              <Plus className="h-4 w-4" /> Nova regra
            </Button>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editingRule ? 'Editar regra de revisão' : 'Nova regra de revisão'}
                </DialogTitle>
                <DialogDescription>
                  A instrução é enviada à IA para orientar a análise do código.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {orgs.length > 1 && !editingRule && (
                  <div className="space-y-2">
                    <Label>Organização</Label>
                    <Select
                      value={form.organizationId}
                      onValueChange={(v) =>
                        setForm((f) => ({ ...f, organizationId: v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {orgs.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="rule-name">Nome</Label>
                  <Input
                    id="rule-name"
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                    placeholder="Ex.: Segurança e credenciais"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rule-desc">Descrição (opcional)</Label>
                  <Input
                    id="rule-desc"
                    value={form.description}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, description: e.target.value }))
                    }
                    placeholder="Breve resumo da regra"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rule-instruction">Instrução para a IA</Label>
                  <Textarea
                    id="rule-instruction"
                    rows={4}
                    value={form.instruction}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, instruction: e.target.value }))
                    }
                    placeholder="Descreva o que a IA deve procurar e como reportar..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Severidade</Label>
                  <Select
                    value={form.severity}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, severity: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ERROR">Erro</SelectItem>
                      <SelectItem value="WARNING">Aviso</SelectItem>
                      <SelectItem value="INFO">Informativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    setEditingRule(null);
                  }}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingRule ? 'Salvar alterações' : 'Criar regra'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {!hasOrgs && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle>Nenhuma organização disponível</CardTitle>
            <CardDescription>
              Instale o GitHub App para começar a definir regras de revisão.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {orgs.map((org) => (
        <Card key={org.id}>
          <CardHeader>
            <CardTitle className="text-base">{org.name}</CardTitle>
            <CardDescription>
              {org.rules.length} regra(s) configurada(s)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {org.rules.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
                <ScrollText className="h-6 w-6" />
                Nenhuma regra ainda. Crie a primeira com “Nova regra”.
              </div>
            )}
            {org.rules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-start justify-between gap-4 rounded-lg border border-border p-4"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{rule.name}</span>
                    <Badge variant={severityVariant(rule.severity)}>
                      {SEVERITY_LABEL[rule.severity]}
                    </Badge>
                    {!rule.enabled && (
                      <Badge variant="outline">Desativada</Badge>
                    )}
                  </div>
                  {rule.description && (
                    <p className="text-sm text-muted-foreground">
                      {rule.description}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground/80">
                    {rule.instruction}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Switch
                    checked={rule.enabled}
                    disabled={busyId === rule.id}
                    onCheckedChange={(v) => handleToggle(rule, v)}
                    aria-label="Ativar regra"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={busyId === rule.id}
                    onClick={() => openEditDialog(rule)}
                    aria-label="Editar regra"
                  >
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={busyId === rule.id}
                    onClick={() => handleDelete(rule)}
                    aria-label="Excluir regra"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
