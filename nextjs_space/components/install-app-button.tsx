'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';

interface InstallAppButtonProps extends ButtonProps {
  label?: string;
}

export function InstallAppButton({
  label = 'Instalar GitHub App',
  ...props
}: InstallAppButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch('/api/github/app-info');
      if (!res.ok) {
        throw new Error('Falha ao obter a URL de instalação');
      }
      const data = (await res.json()) as { installUrl: string };
      window.open(data.installUrl, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      console.error(error);
      alert('Não foi possível abrir a instalação do GitHub App. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={handleClick} disabled={loading} {...props}>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      {label}
    </Button>
  );
}
