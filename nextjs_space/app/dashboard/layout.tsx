import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import {
  Bell,
  Bot,
  LayoutDashboard,
  ScrollText,
  Settings,
  FolderGit2,
  GitPullRequest,
} from 'lucide-react';
import { auth } from '@/auth';
import { SignOutButton } from '@/components/sign-out-button';
import { MobileNav } from '@/components/mobile-nav';

const navItems = [
  { href: '/dashboard', label: 'Visão Geral', icon: LayoutDashboard },
  { href: '/dashboard/repositories', label: 'Repositórios', icon: FolderGit2 },
  { href: '/dashboard/reviews', label: 'Revisões', icon: GitPullRequest },
  { href: '/dashboard/rules', label: 'Regras', icon: ScrollText },
  { href: '/dashboard/notifications', label: 'Notificações', icon: Bell },
  { href: '/dashboard/settings', label: 'Configurações', icon: Settings },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect('/');
  }

  const name = session.user?.name;
  const image = session.user?.image;
  const githubLogin = (session.user as any)?.githubLogin as string | null;
  const displayName = name ?? (githubLogin ? `@${githubLogin}` : 'Usuário');

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-border bg-card md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-border px-6 font-semibold">
          <Bot className="h-6 w-6 text-primary" />
          <span>AI Code Review</span>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item: any) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6">
          <div className="flex items-center gap-2 md:hidden">
            <MobileNav />
            <div className="flex items-center gap-2 font-semibold">
              <Bot className="h-5 w-5 text-primary" />
              <span>AI Code Review</span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {image ? (
              <Image
                src={image}
                alt={displayName}
                width={32}
                height={32}
                className="rounded-full"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-secondary" />
            )}
            <span className="hidden text-sm font-medium sm:inline">
              {displayName}
            </span>
            <SignOutButton />
          </div>
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
