'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export function RunLaudoButton({ laudoId }: { laudoId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [running, setRunning] = useState(false);

  async function handleRun() {
    setRunning(true);
    try {
      const res = await fetch(`/api/laudos/${laudoId}/run`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? 'Falha ao reprocessar o laudo');
      }
      toast({
        title: 'Laudo enfileirado',
        description: 'O laudo está sendo reprocessado — o status será atualizado automaticamente aqui.',
      });
      router.refresh();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao reprocessar',
        description: err instanceof Error ? err.message : 'Tente novamente.',
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Button onClick={handleRun} disabled={running} size="sm">
      {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
      Executar novamente
    </Button>
  );
}
