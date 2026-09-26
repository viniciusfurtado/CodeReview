'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FolderGit2, Globe, Loader2, Sparkles, Coins } from 'lucide-react';
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
import { LAUDO_CREDIT_COST, hasEnoughCreditsForLaudo } from '@/lib/laudo/constants';

interface OrgOption {
  id: string;
  label: string;
  credits: number;
  repositories: { id: string; fullName: string; defaultBranch: string }[];
}

export function NewLaudoForm({ organizations }: { organizations: OrgOption[] }) {
  const router = useRouter();
  const { toast } = useToast();

  const [orgId, setOrgId] = useState(organizations[0]?.id ?? '');
  const org = organizations.find((o) => o.id === orgId);

  const [source, setSource] = useState<'REGISTERED' | 'PUBLIC_URL'>('REGISTERED');
  const [repositoryId, setRepositoryId] = useState(org?.repositories[0]?.id ?? '');
  const [publicRepoUrl, setPublicRepoUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const hasEnoughCredits = hasEnoughCreditsForLaudo(org?.credits ?? 0);

  async function handleSubmit() {
    if (!org) return;
    setSubmitting(true);
    try {
      const body =
        source === 'REGISTERED'
          ? { source, organizationId: org.id, repositoryId, branch: branch || undefined }
          : { source, organizationId: org.id, publicRepoUrl, branch: branch || undefined };

      const res = await fetch('/api/laudos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Falha ao criar laudo');

      toast({
        title: 'Laudo enfileirado',
        description: 'O laudo está sendo gerado — isso pode levar alguns minutos.',
      });
      router.push(`/dashboard/laudos/${data.id}`);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao criar laudo',
        description: err instanceof Error ? err.message : 'Tente novamente.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 rounded-md border border-border p-4">
      {organizations.length > 1 && (
        <div className="space-y-1.5">
          <Label>Organização</Label>
          <Select
            value={orgId}
            onValueChange={(v) => {
              setOrgId(v);
              setRepositoryId('');
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {organizations.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {org && (
        <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 p-3 text-xs">
          <span className="text-muted-foreground">Custo deste laudo</span>
          <Badge variant={hasEnoughCredits ? 'success' : 'destructive'} className="gap-1">
            <Coins className="h-3 w-3" />
            {LAUDO_CREDIT_COST} créditos (saldo: {org.credits})
          </Badge>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setSource('REGISTERED')}
          className={`flex items-start gap-2 rounded-md border p-3 text-left transition ${
            source === 'REGISTERED' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
          }`}
        >
          <FolderGit2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="text-xs">
            <span className="block text-sm font-medium">Repositório cadastrado</span>
            Escolha um repositório já conectado via GitHub App.
          </span>
        </button>
        <button
          type="button"
          onClick={() => setSource('PUBLIC_URL')}
          className={`flex items-start gap-2 rounded-md border p-3 text-left transition ${
            source === 'PUBLIC_URL' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
          }`}
        >
          <Globe className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="text-xs">
            <span className="block text-sm font-medium">Link público de git</span>
            github.com, gitlab.com ou bitbucket.org — apenas repositórios públicos.
          </span>
        </button>
      </div>

      {source === 'REGISTERED' ? (
        <div className="space-y-1.5">
          <Label>Repositório</Label>
          {org && org.repositories.length > 0 ? (
            <Select value={repositoryId} onValueChange={setRepositoryId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {org.repositories.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-xs text-muted-foreground">Nenhum repositório ativo nesta organização.</p>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="public-repo-url">URL do repositório público</Label>
          <Input
            id="public-repo-url"
            placeholder="https://github.com/owner/repo"
            value={publicRepoUrl}
            onChange={(e) => setPublicRepoUrl(e.target.value)}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="branch">Branch (opcional)</Label>
        <Input
          id="branch"
          placeholder="Padrão: branch principal do repositório"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
        />
      </div>

      <div className="flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={
            submitting ||
            !org ||
            !hasEnoughCredits ||
            (source === 'REGISTERED' ? !repositoryId : !publicRepoUrl.trim())
          }
        >
          {submitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          Iniciar Laudo
        </Button>
      </div>
    </div>
  );
}
