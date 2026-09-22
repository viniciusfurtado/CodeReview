'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Play, Loader2 } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';

export function DemoSignInButton(props: ButtonProps) {
  const [loading, setLoading] = useState(false);

  return (
    <Button
      variant="outline"
      size="lg"
      disabled={loading}
      onClick={() => {
        setLoading(true);
        signIn('demo', { callbackUrl: '/dashboard' });
      }}
      className="gap-2"
      {...props}
    >
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <Play className="h-5 w-5" />
      )}
      Entrar no modo demo
    </Button>
  );
}
