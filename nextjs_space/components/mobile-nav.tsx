'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  Bot,
  LayoutDashboard,
  ScrollText,
  Settings,
  FolderGit2,
  GitPullRequest,
  FileCheck2,
  Menu,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Visão Geral', icon: LayoutDashboard },
  { href: '/dashboard/repositories', label: 'Repositórios', icon: FolderGit2 },
  { href: '/dashboard/reviews', label: 'Revisões', icon: GitPullRequest },
  { href: '/dashboard/laudos', label: 'Laudo', icon: FileCheck2 },
  { href: '/dashboard/rules', label: 'Regras', icon: ScrollText },
  { href: '/dashboard/notifications', label: 'Notificações', icon: Bell },
  { href: '/dashboard/settings', label: 'Configurações', icon: Settings },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
        <div className="flex h-16 items-center gap-2 border-b border-border px-6 font-semibold">
          <Bot className="h-6 w-6 text-primary" />
          <span>AI Code Review</span>
        </div>
        <nav className="space-y-1 p-4">
          {navItems.map((item) => {
            const active =
              item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
