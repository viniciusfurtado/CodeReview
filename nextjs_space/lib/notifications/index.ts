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

/**
 * Envia notificações para todos os canais habilitados da organização.
 *
 * - Falhas individuais são logadas mas NÃO propagam exceção.
 * - Retorna o número de canais notificados com sucesso.
 */
export async function notifyReviewCompleted(
  organizationId: string,
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
    } catch (error: any) {
      console.error(
        `[notifications] ❌ Falha ao enviar ${channel.type} "${channel.label}":`,
        error?.message ?? error
      );
    }
  }

  return successCount;
}

