'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Loader2, Mail, MessageSquare, Hash, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

export type ChannelType = 'EMAIL' | 'SLACK' | 'DISCORD' | 'TEAMS';

export interface ChannelDTO {
  id: string;
  type: ChannelType;
  label: string;
  target: string;
  enabled: boolean;
}

export interface OrgWithChannels {
  id: string;
  name: string;
  channels: ChannelDTO[];
}

export const TYPE_META: Record<
  ChannelType,
  { label: string; icon: typeof Mail; placeholder: string }
> = {
  EMAIL: { label: 'E-mail', icon: Mail, placeholder: 'equipe@empresa.com' },
  SLACK: {
    label: 'Slack',
    icon: Hash,
    placeholder: 'https://hooks.slack.com/services/...',
  },
  DISCORD: {
    label: 'Discord',
    icon: MessageSquare,
    placeholder: 'https://discord.com/api/webhooks/...',
  },
  TEAMS: {
    label: 'Microsoft Teams',
    icon: Users,
    placeholder: 'https://prod-XX.logic.azure.com/workflows/.../invoke?...',
  },
};

export function NotificationsManager({
  orgs,
  hideHeader = false,
}: {
  orgs: OrgWithChannels[];
  hideHeader?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [form, setForm] = useState({
    organizationId: orgs[0]?.id ?? '',
    type: 'EMAIL' as ChannelType,
    label: '',
    target: '',
  });

  async function handleToggle(channel: ChannelDTO, next: boolean) {
    setBusyId(channel.id);
    try {
      const res = await fetch(`/api/channels/${channel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      toast({ title: 'Erro ao atualizar canal', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(channel: ChannelDTO) {
    if (!confirm(`Remover o canal “${channel.label}”?`)) return;
    setBusyId(channel.id);
    try {
      const res = await fetch(`/api/channels/${channel.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error();
      toast({ title: 'Canal removido' });
      router.refresh();
    } catch {
      toast({ title: 'Erro ao remover canal', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreate() {
    if (!form.label.trim() || !form.target.trim()) {
      toast({ title: 'Preencha nome e destino', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      toast({ title: 'Canal adicionado' });
      setOpen(false);
      setForm({
        organizationId: orgs[0]?.id ?? '',
        type: 'EMAIL',
        label: '',
        target: '',
      });
      router.refresh();
    } catch {
      toast({ title: 'Erro ao adicionar canal', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  const hasOrgs = orgs.length > 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        {hideHeader ? (
          <div />
        ) : (
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Notificações</h1>
            <p className="text-muted-foreground">
              Escolha para onde enviar os resultados das revisões.
            </p>
          </div>
        )}
        {hasOrgs && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" /> Adicionar canal
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Novo canal de notificação</DialogTitle>
                <DialogDescription>
                  Envie um resumo das revisões por e-mail ou webhook.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {orgs.length > 1 && (
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
                  <Label>Tipo</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, type: v as ChannelType }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        Object.keys(TYPE_META) as ChannelType[]
                      ).map((t) => (
                        <SelectItem key={t} value={t}>
                          {TYPE_META[t].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ch-label">Nome do canal</Label>
                  <Input
                    id="ch-label"
                    value={form.label}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, label: e.target.value }))
                    }
                    placeholder="Ex.: Canal #code-review"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ch-target">
                    {form.type === 'EMAIL' ? 'Endereço de e-mail' : 'URL do webhook'}
                  </Label>
                  <Input
                    id="ch-target"
                    value={form.target}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, target: e.target.value }))
                    }
                    placeholder={TYPE_META[form.type].placeholder}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button onClick={handleCreate} disabled={saving} className="gap-2">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Adicionar
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
              Instale o GitHub App para configurar notificações.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {orgs.map((org) => (
        <Card key={org.id}>
          <CardHeader>
            <CardTitle className="text-base">{org.name}</CardTitle>
            <CardDescription>
              {org.channels.length} canal(is) configurado(s)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {org.channels.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Nenhum canal ainda. Adicione o primeiro.
              </p>
            )}
            {org.channels.map((channel) => {
              const Meta = TYPE_META[channel.type];
              const Icon = Meta.icon;
              return (
                <div
                  key={channel.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-border p-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{channel.label}</span>
                        <Badge variant="outline">{Meta.label}</Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {channel.target}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Switch
                      checked={channel.enabled}
                      disabled={busyId === channel.id}
                      onCheckedChange={(v) => handleToggle(channel, v)}
                      aria-label="Ativar canal"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busyId === channel.id}
                      onClick={() => handleDelete(channel)}
                      aria-label="Remover canal"
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
