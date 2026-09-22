'use client';

import { signIn } from 'next-auth/react';
import { Github } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function GithubSignInButton() {
  return (
    <Button
      size="lg"
      onClick={() => signIn('github', { callbackUrl: '/dashboard' })}
      className="gap-2"
    >
      <Github className="h-5 w-5" />
      Entrar com GitHub
    </Button>
  );
}
