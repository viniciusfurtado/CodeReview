import { redirect } from 'next/navigation';
import { Bot, GitPullRequest, ShieldCheck, Zap } from 'lucide-react';
import { auth } from '@/auth';
import { GithubSignInButton } from '@/components/github-sign-in-button';
import { DemoSignInButton } from '@/components/demo-sign-in-button';

export const dynamic = 'force-dynamic';

const features = [
  {
    icon: Bot,
    title: 'Revisão com IA',
    description:
      'Análise automática de Pull Requests com sugestões inteligentes de melhoria.',
  },
  {
    icon: GitPullRequest,
    title: 'Integração nativa',
    description:
      'Instale o GitHub App e comece a receber revisões diretamente nos seus PRs.',
  },
  {
    icon: ShieldCheck,
    title: 'Multi-tenant seguro',
    description:
      'Cada organização tem seus dados isolados e protegidos por padrão.',
  },
  {
    icon: Zap,
    title: 'Rápido e assíncrono',
    description:
      'Processamento em fila para não bloquear seu fluxo de desenvolvimento.',
  },
];

export default async function HomePage() {
  const session = await auth();
  if (session?.user) {
    redirect('/dashboard');
  }

  return (
    <main className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 font-semibold">
            <Bot className="h-6 w-6 text-primary" />
            <span>AI Code Review</span>
          </div>
          <GithubSignInButton />
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto flex max-w-4xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <span className="mb-4 inline-flex items-center rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
          Revisão de código automatizada
        </span>
        <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          AI Code Review — Automatizado com Inteligência
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          Conecte suas organizações do GitHub e deixe a inteligência artificial
          revisar seus Pull Requests automaticamente. Encontre bugs, melhore a
          qualidade do código e acelere seus code reviews.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <GithubSignInButton />
          <DemoSignInButton />
        </div>
        <p className="mt-4 max-w-md text-xs text-muted-foreground">
          Sem um GitHub App configurado? Use o{' '}
          <span className="font-medium">modo demo</span> para explorar toda a
          interface com dados de exemplo — nenhuma conta do GitHub necessária.
        </p>
      </section>

      {/* Features */}
      <section className="border-t border-border bg-secondary/30">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-16 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature: any) => (
            <div key={feature.title} className="flex flex-col gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-6 text-center text-sm text-muted-foreground">
          <span suppressHydrationWarning>© 2026 AI Code Review. Todos os direitos reservados.</span>
        </div>
      </footer>
    </main>
  );
}
