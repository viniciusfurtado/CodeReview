'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

interface RepoActiveToggleProps {
  repoId: string;
  initialActive: boolean;
}

export function RepoActiveToggle({
  repoId,
  initialActive,
}: RepoActiveToggleProps) {
  const [active, setActive] = useState(initialActive);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  async function handleChange(next: boolean) {
    setActive(next);
    try {
      const res = await fetch(`/api/repositories/${repoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: next }),
      });
      if (!res.ok) throw new Error('Falha ao atualizar');
      toast({
        title: next ? 'Revisão ativada' : 'Revisão desativada',
        description: next
          ? 'Novos Pull Requests deste repositório serão revisados.'
          : 'Este repositório não será mais revisado automaticamente.',
      });
      startTransition(() => router.refresh());
    } catch {
      setActive(!next);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o repositório.',
        variant: 'destructive',
      });
    }
  }

  return (
    <Switch
      checked={active}
      onCheckedChange={handleChange}
      disabled={isPending}
      aria-label="Ativar revisão automática"
    />
  );
}
