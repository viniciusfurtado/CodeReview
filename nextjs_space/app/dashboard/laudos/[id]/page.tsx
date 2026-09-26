import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ArrowLeft,
  FileCode,
  AlertCircle,
  AlertTriangle,
  Info,
  Lightbulb,
  ChevronDown,
  Download,
  FolderGit2,
  Globe,
  GitBranch,
  CheckCheck,
} from 'lucide-react';
import { prisma } from '@/lib/db';
import { getCurrentUserId, getUserOrgIds } from '@/lib/dashboard';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SafeDate } from '@/components/safe-format';
import { GradeBadge } from '@/components/grade-badge';
import { ReviewAutoRefresh } from '@/components/review-auto-refresh';
import { ACTIVE_REVIEW_STATUSES } from '@/lib/review-status';
import { RunLaudoButton } from '@/components/run-laudo-button';
import type { ReviewGrade } from '@/lib/review-grade';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';

export const dynamic = 'force-dynamic';

function statusBadge(status: string) {
  switch (status) {
    case 'COMPLETED':
      return { variant: 'success' as const, label: 'Concluído' };
    case 'IN_PROGRESS':
      return { variant: 'warning' as const, label: 'Em andamento' };
    case 'FAILED':
      return { variant: 'destructive' as const, label: 'Falhou' };
    default:
      return { variant: 'outline' as const, label: 'Na fila' };
  }
}

function severityMeta(sev: string) {
  switch (sev) {
    case 'ERROR':
      return { variant: 'destructive' as const, label: 'Erro', Icon: AlertCircle };
    case 'WARNING':
      return { variant: 'warning' as const, label: 'Atenção', Icon: AlertTriangle };
    default:
      return { variant: 'secondary' as const, label: 'Info', Icon: Info };
  }
}

export default async function LaudoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) redirect('/');

  const orgIds = await getUserOrgIds(userId);

  const laudo = await prisma.laudo.findUnique({
    where: { id },
    include: {
      repository: true,
      findings: { orderBy: { createdAt: 'asc' } },
      artifacts: true,
      creditTransactions: { where: { type: 'USAGE' } },
    },
  });

  if (!laudo || !orgIds.includes(laudo.organizationId)) {
    notFound();
  }

  const badge = statusBadge(laudo.status as string);
  const creditsUsed = laudo.creditTransactions.reduce((sum, t) => sum + t.amount, 0);
  const canRun = laudo.status !== 'IN_PROGRESS';
  const repoLabel =
    laudo.source === 'REGISTERED' && laudo.repository
      ? laudo.repository.fullName
      : (laudo.publicRepoUrl ?? '—');

  const pdfArtifact = laudo.artifacts.find((a) => a.type === 'PDF');
  const mdArtifact = laudo.artifacts.find((a) => a.type === 'MARKDOWN');

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <ReviewAutoRefresh active={ACTIVE_REVIEW_STATUSES.includes(laudo.status as string)} />
      <Link
        href="/dashboard/laudos"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para laudos
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {laudo.source === 'REGISTERED' ? (
                  <FolderGit2 className="h-5 w-5 shrink-0 text-primary" />
                ) : (
                  <Globe className="h-5 w-5 shrink-0 text-primary" />
                )}
                <CardTitle className="truncate text-lg">{repoLabel}</CardTitle>
              </div>
              <CardDescription className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                {laudo.branch && (
                  <span className="flex items-center gap-1">
                    <GitBranch className="h-3 w-3" />
                    {laudo.branch}
                  </span>
                )}
                <SafeDate date={laudo.updatedAt} options={{ dateStyle: 'medium', timeStyle: 'short' }} />
              </CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {laudo.status === 'COMPLETED' && laudo.scoreLetter && (
                <GradeBadge grade={laudo.scoreLetter as ReviewGrade} />
              )}
              <Badge variant={badge.variant}>{badge.label}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {laudo.status === 'COMPLETED' && laudo.scoreNumber !== null && (
            <p className="text-sm">
              <span className="font-semibold">Nota:</span> {laudo.scoreLetter} ({laudo.scoreNumber}/100)
            </p>
          )}
          {laudo.summary && (
            <div>
              <h3 className="mb-1 text-sm font-semibold">Resumo</h3>
              <p className="whitespace-pre-line text-sm text-muted-foreground">{laudo.summary}</p>
            </div>
          )}
          {laudo.error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-destructive">
                <AlertCircle className="h-3 w-3" />
                Erro na última execução (tentativas: {laudo.attempts})
              </div>
              <p className="text-sm text-muted-foreground">{laudo.error}</p>
            </div>
          )}
          {laudo.status === 'COMPLETED' && (
            <p className="text-xs text-muted-foreground">
              {laudo.filesScanned} arquivo(s) analisado(s) · {laudo.filesSkipped} ignorado(s)
              {laudo.truncated ? ' · ⚠️ repositório truncado pelo limite de tamanho' : ''}
              {laudo.usedClaudeOnly
                ? ' · Analisado somente pelo Claude (etapa gratuita indisponível)'
                : ' · Analisado com dupla checagem (IA gratuita + Claude)'}
            </p>
          )}
          {creditsUsed > 0 && (
            <p className="text-xs text-muted-foreground">{creditsUsed} créditos usados neste laudo</p>
          )}
        </CardContent>
        <CardFooter className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-2">
            {pdfArtifact && (
              <a href={`/api/laudos/${laudo.id}/artifacts/${pdfArtifact.id}`}>
                <Button size="sm" variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  PDF
                </Button>
              </a>
            )}
            {mdArtifact && (
              <a href={`/api/laudos/${laudo.id}/artifacts/${mdArtifact.id}`}>
                <Button size="sm" variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Markdown
                </Button>
              </a>
            )}
          </div>
          {canRun && <RunLaudoButton laudoId={laudo.id} />}
        </CardFooter>
      </Card>

      <Collapsible defaultOpen>
        <CollapsibleTrigger asChild>
          <button className="mb-3 flex w-full items-center justify-between gap-2 text-left [&[data-state=open]>svg]:rotate-180">
            <h2 className="text-lg font-semibold">Apontamentos ({laudo.findings.length})</h2>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {laudo.findings.length === 0 && (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                {laudo.status === 'IN_PROGRESS'
                  ? 'A análise ainda está em andamento.'
                  : 'Nenhum apontamento — o código está de acordo com as regras.'}
              </CardContent>
            </Card>
          )}
          <div className="space-y-3">
            {laudo.findings.map((finding) => {
              const meta = severityMeta(finding.severity as string);
              return (
                <Card key={finding.id}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <meta.Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="font-medium">{finding.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {finding.source === 'CONFIRMED_BOTH' && (
                          <Badge variant="success" className="gap-1">
                            <CheckCheck className="h-3 w-3" />
                            Confirmado por 2 IAs
                          </Badge>
                        )}
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <FileCode className="h-3 w-3" />
                      <code>
                        {finding.filePath}
                        {finding.line ? `:${finding.line}` : ''}
                      </code>
                    </div>
                    <p className="text-sm text-muted-foreground">{finding.message}</p>
                    {finding.suggestion && (
                      <div className="rounded-md border border-border bg-muted/40 p-3">
                        <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-foreground">
                          <Lightbulb className="h-3 w-3" />
                          Sugestão
                        </div>
                        <p className="whitespace-pre-line text-sm text-muted-foreground">
                          {finding.suggestion}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
