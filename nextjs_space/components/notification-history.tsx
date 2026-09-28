'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, RotateCw, Eye, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SafeDate } from '@/components/safe-format';
import { useToast } from '@/hooks/use-toast';
import { TYPE_META, type ChannelType } from '@/components/notifications-manager';

export interface DeliveryDTO {
  id: string;
  status: 'SUCCESS' | 'FAILED';
  createdAt: string;
  channelType: ChannelType;
  channelLabel: string;
  reviewId: string;
  repoFullName: string;
  prNumber: number;
  prTitle: string;
}

interface PreviewData {
  status: string;
  error: string | null;
  channelType: ChannelType;
  channelLabel: string;
  createdAt: string;
  preview: { subject?: string; content: string };
}

export function NotificationHistory({ deliveries }: { deliveries: DeliveryDTO[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [detailFor, setDetailFor] = useState<DeliveryDTO | null>(null);
  const [detail, setDetail] = useState<PreviewData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  async function openDetails(d: DeliveryDTO) {
    setDetailFor(d);
    setDetail(null);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/notification-deliveries/${d.id}`);
      if (!res.ok) throw new Error();
      setDetail(await res.json());
    } catch {
      toast({ title: 'Erro ao carregar detalhes', variant: 'destructive' });
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleResend(d: DeliveryDTO) {
    setResendingId(d.id);
    try {
      const res = await fetch(`/api/notification-deliveries/${d.id}/resend`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Falha ao reenviar');
      toast({ title: 'Reenviado com sucesso' });
      router.refresh();
    } catch (err) {
      toast({
        title: 'Erro ao reenviar',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setResendingId(null);
    }
  }

  if (deliveries.length === 0) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle>Nenhum envio ainda</CardTitle>
          <CardDescription>
            Assim que uma revisão notificar algum canal, o histórico aparece aqui.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {deliveries.map((d) => {
          const Meta = TYPE_META[d.channelType];
          const Icon = Meta.icon;
          return (
            <Card key={d.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <Link
                      href={`/dashboard/reviews/${d.reviewId}`}
                      className="truncate font-medium text-primary hover:underline"
                    >
                      {d.repoFullName} #{d.prNumber}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {d.prTitle}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{d.channelLabel}</Badge>
                      <SafeDate
                        date={d.createdAt}
                        options={{ dateStyle: 'medium', timeStyle: 'short' }}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={d.status === 'SUCCESS' ? 'success' : 'destructive'}>
                    {d.status === 'SUCCESS' ? 'Enviado' : 'Falhou'}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => openDetails(d)}
                  >
                    <Eye className="h-3.5 w-3.5" /> Detalhes
                  </Button>
                  {d.status === 'FAILED' && (
                    <Button
                      size="sm"
                      className="gap-1"
                      disabled={resendingId === d.id}
                      onClick={() => handleResend(d)}
                    >
                      {resendingId === d.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCw className="h-3.5 w-3.5" />
                      )}
                      Reenviar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={detailFor !== null} onOpenChange={(v) => !v && setDetailFor(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4" /> Detalhes da notificação
            </DialogTitle>
            <DialogDescription>
              {detailFor && `${detailFor.repoFullName} #${detailFor.prNumber} · ${detailFor.channelLabel}`}
            </DialogDescription>
          </DialogHeader>

          {loadingDetail && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loadingDetail && detail && (
            <div className="space-y-3">
              {detail.status === 'FAILED' && detail.error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <div className="mb-1 text-xs font-semibold text-destructive">
                    Erro no envio
                  </div>
                  <p className="text-sm text-muted-foreground">{detail.error}</p>
                </div>
              )}

              {detail.preview.subject && (
                <p className="text-sm">
                  <span className="font-semibold">Assunto: </span>
                  {detail.preview.subject}
                </p>
              )}

              {detail.channelType === 'EMAIL' ? (
                <iframe
                  title="Pré-visualização do e-mail"
                  srcDoc={detail.preview.content}
                  sandbox="allow-popups allow-popups-to-escape-sandbox"
                  className="h-96 w-full rounded-md border border-border bg-white"
                />
              ) : (
                <pre className="max-h-96 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs">
                  {detail.preview.content}
                </pre>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
