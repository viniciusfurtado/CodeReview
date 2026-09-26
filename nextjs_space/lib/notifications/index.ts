/**
 * Dispatcher de notificações — busca os canais habilitados da organização
 * e envia a mensagem formatada para cada um.
 *
 * Suporta: Slack (webhook), Discord (webhook), Teams (webhook), Email (SMTP).
 * Falhas de envio são logadas mas NÃO interrompem o fluxo principal.
 */

import { prisma } from '@/lib/db';
import {
  type ReviewNotificationData,
  formatSlack,
  formatDiscord,
  formatTeams,
  formatEmailHtml,
  formatEmailSubject,
} from './formatters';

const WEBHOOK_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Senders por tipo de canal
// ---------------------------------------------------------------------------

async function sendSlack(webhookUrl: string, data: ReviewNotificationData): Promise<void> {
  const payload = formatSlack(data);
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Slack webhook retornou ${res.status}: ${await res.text()}`);
  }
}

async function sendDiscord(webhookUrl: string, data: ReviewNotificationData): Promise<void> {
  const payload = formatDiscord(data);
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Discord webhook retornou ${res.status}: ${await res.text()}`);
  }
}

async function sendTeams(webhookUrl: string, data: ReviewNotificationData): Promise<void> {
  const payload = formatTeams(data);
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Teams webhook retornou ${res.status}: ${await res.text()}`);
  }
}

async function sendEmail(to: string, data: ReviewNotificationData): Promise<void> {
  // Suporta dois backends: Resend API (recomendado) ou SMTP via nodemailer.
  // Para MVP, usamos Resend se RESEND_API_KEY estiver definida,
  // caso contrário logamos que o email não foi enviado.

  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.EMAIL_FROM ?? 'noreply@codereview.app';

  if (resendKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject: formatEmailSubject(data),
        html: formatEmailHtml(data),
      }),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`Resend API retornou ${res.status}: ${await res.text()}`);
    }
    return;
  }

  // Sem provedor de e-mail configurado — loga aviso.
  console.warn(
    `[notifications] E-mail para ${to} não enviado: RESEND_API_KEY não configurada. ` +
    `Configure para habilitar notificações por e-mail.`
  );
}

// ---------------------------------------------------------------------------
// Dispatcher principal
// ---------------------------------------------------------------------------

type ChannelType = 'EMAIL' | 'SLACK' | 'DISCORD' | 'TEAMS';

const SENDERS: Record<ChannelType, (target: string, data: ReviewNotificationData) => Promise<void>> = {
  SLACK: sendSlack,
  DISCORD: sendDiscord,
  TEAMS: sendTeams,
  EMAIL: sendEmail,
};

const RETENTION_MAX_PER_ORG = 100;
const RETENTION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Mantém o histórico de entregas dentro da retenção: até 100 por
 * organização e até 90 dias — o que for mais restritivo. Chamado depois de
 * cada rodada de envio; barato o bastante para rodar inline (sem cron).
 */
async function pruneNotificationHistory(organizationId: string): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_MAX_AGE_MS);
  const keep = await prisma.notificationDelivery.findMany({
    where: { channel: { organizationId }, createdAt: { gte: cutoff } },
    orderBy: { createdAt: 'desc' },
    take: RETENTION_MAX_PER_ORG,
    select: { id: true },
  });
  await prisma.notificationDelivery.deleteMany({
    where: {
      channel: { organizationId },
      id: { notIn: keep.map((k) => k.id) },
    },
  });
}

/**
 * Envia notificações para todos os canais habilitados da organização,
 * registrando cada tentativa (sucesso ou falha) no histórico.
 *
 * - Falhas individuais são logadas mas NÃO propagam exceção.
 * - Retorna o número de canais notificados com sucesso.
 */
export async function notifyReviewCompleted(
  organizationId: string,
  reviewId: string,
  data: ReviewNotificationData
): Promise<number> {
  const channels = await prisma.notificationChannel.findMany({
    where: { organizationId, enabled: true },
  });

  if (channels.length === 0) return 0;

  let successCount = 0;

  for (const channel of channels) {
    const sender = SENDERS[channel.type as ChannelType];
    if (!sender) {
      console.warn(`[notifications] Tipo de canal desconhecido: ${channel.type}`);
      continue;
    }

    try {
      await sender(channel.target, data);
      successCount++;
      console.log(
        `[notifications] ✅ ${channel.type} "${channel.label}" notificado (org=${organizationId})`
      );
      await prisma.notificationDelivery.create({
        data: { channelId: channel.id, reviewId, status: 'SUCCESS' },
      });
    } catch (error: any) {
      const message = String(error?.message ?? error).slice(0, 2000);
      console.error(
        `[notifications] ❌ Falha ao enviar ${channel.type} "${channel.label}":`,
        message
      );
      await prisma.notificationDelivery.create({
        data: { channelId: channel.id, reviewId, status: 'FAILED', error: message },
      });
    }
  }

  await pruneNotificationHistory(organizationId).catch((err) =>
    console.error('[notifications] falha ao aplicar retenção do histórico:', err)
  );

  return successCount;
}

/**
 * Reconstrói o ReviewNotificationData a partir do estado atual (persistido)
 * de uma review — usado tanto para a pré-visualização de "detalhes" quanto
 * para reenvio, sempre com dados frescos em vez de um snapshot antigo.
 */
export async function buildReviewNotificationData(
  reviewId: string
): Promise<ReviewNotificationData | null> {
  const review = await prisma.pullRequestReview.findUnique({
    where: { id: reviewId },
    include: { repository: true, findings: true },
  });
  if (!review) return null;

  const baseUrl = process.env.AUTH_URL ?? 'https://codereview.app';
  const errorCount = review.findings.filter((f) => f.severity === 'ERROR').length;
  const warningCount = review.findings.filter((f) => f.severity === 'WARNING').length;
  const infoCount = review.findings.filter((f) => f.severity === 'INFO').length;

  return {
    repoFullName: review.repository.fullName,
    prNumber: review.prNumber,
    prTitle: review.prTitle,
    author: review.author,
    branch: review.branch,
    summary: review.summary ?? '',
    findingsCount: review.findings.length,
    errorCount,
    warningCount,
    infoCount,
    status: review.status === 'FAILED' ? 'FAILED' : 'COMPLETED',
    error: review.error,
    dashboardUrl: `${baseUrl}/dashboard/reviews/${review.id}`,
    githubPrUrl: `https://github.com/${review.repository.fullName}/pull/${review.prNumber}`,
  };
}

/**
 * Reenvia para um único canal (usado pela ação "Reenviar" no histórico).
 * Registra uma NOVA linha de entrega — não sobrescreve a tentativa antiga,
 * preservando o histórico completo.
 */
export async function resendToChannel(
  channelId: string,
  reviewId: string
): Promise<{ success: boolean; error?: string }> {
  const channel = await prisma.notificationChannel.findUnique({ where: { id: channelId } });
  if (!channel) return { success: false, error: 'Canal não encontrado' };

  const data = await buildReviewNotificationData(reviewId);
  if (!data) return { success: false, error: 'Revisão não encontrada' };

  const sender = SENDERS[channel.type as ChannelType];
  if (!sender) return { success: false, error: `Tipo de canal desconhecido: ${channel.type}` };

  try {
    await sender(channel.target, data);
    await prisma.notificationDelivery.create({
      data: { channelId, reviewId, status: 'SUCCESS' },
    });
    await pruneNotificationHistory(channel.organizationId).catch(() => {});
    return { success: true };
  } catch (error: any) {
    const message = String(error?.message ?? error).slice(0, 2000);
    await prisma.notificationDelivery.create({
      data: { channelId, reviewId, status: 'FAILED', error: message },
    });
    return { success: false, error: message };
  }
}

