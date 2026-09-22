/**
 * Formatadores de mensagem para cada canal de notificação.
 *
 * Cada formatter recebe os dados da review e retorna o payload pronto
 * para ser enviado ao respectivo serviço (Slack webhook, Discord webhook,
 * Teams connector, ou corpo de e-mail HTML).
 */

export interface ReviewNotificationData {
  repoFullName: string;
  prNumber: number;
  prTitle: string;
  author: string;
  branch: string;
  summary: string;
  findingsCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  status: 'COMPLETED' | 'FAILED';
  error?: string | null;
  dashboardUrl: string;
  githubPrUrl: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function severitySummary(data: ReviewNotificationData): string {
  const parts: string[] = [];
  if (data.errorCount > 0) parts.push(`🔴 ${data.errorCount} erro(s)`);
  if (data.warningCount > 0) parts.push(`🟡 ${data.warningCount} atenção`);
  if (data.infoCount > 0) parts.push(`🔵 ${data.infoCount} info`);
  return parts.length > 0 ? parts.join(' · ') : '✅ Nenhum apontamento';
}

function statusEmoji(status: string): string {
  return status === 'COMPLETED' ? '✅' : '❌';
}

// ---------------------------------------------------------------------------
// Slack (Incoming Webhook — JSON blocks)
// ---------------------------------------------------------------------------

export function formatSlack(data: ReviewNotificationData): object {
  const status = statusEmoji(data.status);
  const blocks: object[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${status} Revisão de Código — ${data.repoFullName} #${data.prNumber}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*PR:* <${data.githubPrUrl}|${data.prTitle}>` },
        { type: 'mrkdwn', text: `*Autor:* ${data.author}` },
        { type: 'mrkdwn', text: `*Branch:* \`${data.branch}\`` },
        { type: 'mrkdwn', text: `*Apontamentos:* ${data.findingsCount}` },
      ],
    },
  ];

  if (data.status === 'COMPLETED') {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${severitySummary(data)}\n\n${data.summary}`,
      },
    });
  } else if (data.error) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `❌ *Erro:* ${data.error}`,
      },
    });
  }

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: '📊 Ver no Dashboard', emoji: true },
        url: data.dashboardUrl,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '🔗 Ver PR no GitHub', emoji: true },
        url: data.githubPrUrl,
      },
    ],
  });

  return { blocks };
}

// ---------------------------------------------------------------------------
// Discord (Webhook — JSON embeds)
// ---------------------------------------------------------------------------

export function formatDiscord(data: ReviewNotificationData): object {
  const color = data.status === 'COMPLETED'
    ? (data.errorCount > 0 ? 0xef4444 : data.warningCount > 0 ? 0xeab308 : 0x22c55e)
    : 0xef4444;

  return {
    embeds: [
      {
        title: `${statusEmoji(data.status)} Revisão — ${data.repoFullName} #${data.prNumber}`,
        url: data.githubPrUrl,
        color,
        fields: [
          { name: 'PR', value: data.prTitle, inline: true },
          { name: 'Autor', value: data.author, inline: true },
          { name: 'Branch', value: `\`${data.branch}\``, inline: true },
          { name: 'Apontamentos', value: severitySummary(data), inline: false },
          ...(data.status === 'COMPLETED'
            ? [{ name: 'Resumo', value: data.summary.slice(0, 1024), inline: false }]
            : []),
          ...(data.error
            ? [{ name: '❌ Erro', value: data.error.slice(0, 1024), inline: false }]
            : []),
        ],
        footer: { text: 'AI Code Review' },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Microsoft Teams (Incoming Webhook — Adaptive Card)
// ---------------------------------------------------------------------------

export function formatTeams(data: ReviewNotificationData): object {
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              size: 'Medium',
              weight: 'Bolder',
              text: `${statusEmoji(data.status)} Revisão — ${data.repoFullName} #${data.prNumber}`,
            },
            {
              type: 'FactSet',
              facts: [
                { title: 'PR', value: data.prTitle },
                { title: 'Autor', value: data.author },
                { title: 'Branch', value: data.branch },
                { title: 'Apontamentos', value: `${data.findingsCount}` },
              ],
            },
            {
              type: 'TextBlock',
              text: data.status === 'COMPLETED'
                ? `${severitySummary(data)}\n\n${data.summary.slice(0, 500)}`
                : `❌ Erro: ${(data.error ?? 'desconhecido').slice(0, 500)}`,
              wrap: true,
            },
          ],
          actions: [
            {
              type: 'Action.OpenUrl',
              title: '📊 Dashboard',
              url: data.dashboardUrl,
            },
            {
              type: 'Action.OpenUrl',
              title: '🔗 GitHub PR',
              url: data.githubPrUrl,
            },
          ],
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Email (HTML body — enviado via SMTP ou API de e-mail transacional)
// ---------------------------------------------------------------------------

export function formatEmailHtml(data: ReviewNotificationData): string {
  const severityHtml = (() => {
    const parts: string[] = [];
    if (data.errorCount > 0) parts.push(`<span style="color:#ef4444">🔴 ${data.errorCount} erro(s)</span>`);
    if (data.warningCount > 0) parts.push(`<span style="color:#eab308">🟡 ${data.warningCount} atenção</span>`);
    if (data.infoCount > 0) parts.push(`<span style="color:#3b82f6">🔵 ${data.infoCount} info</span>`);
    return parts.length > 0 ? parts.join(' &middot; ') : '✅ Nenhum apontamento';
  })();

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1a1a1a">
  <h2 style="margin-bottom:4px">${statusEmoji(data.status)} Revisão de Código</h2>
  <p style="color:#666;margin-top:0">${data.repoFullName} #${data.prNumber}</p>

  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:6px 0;color:#666;width:100px">PR</td><td><strong>${data.prTitle}</strong></td></tr>
    <tr><td style="padding:6px 0;color:#666">Autor</td><td>${data.author}</td></tr>
    <tr><td style="padding:6px 0;color:#666">Branch</td><td><code>${data.branch}</code></td></tr>
    <tr><td style="padding:6px 0;color:#666">Resultado</td><td>${severityHtml}</td></tr>
  </table>

  ${data.status === 'COMPLETED'
    ? `<p style="background:#f5f5f5;padding:12px;border-radius:6px;line-height:1.5">${data.summary}</p>`
    : `<p style="background:#fef2f2;padding:12px;border-radius:6px;color:#ef4444">❌ ${data.error ?? 'Erro desconhecido'}</p>`
  }

  <p>
    <a href="${data.dashboardUrl}" style="display:inline-block;padding:8px 16px;background:#2563eb;color:white;border-radius:6px;text-decoration:none;margin-right:8px">📊 Dashboard</a>
    <a href="${data.githubPrUrl}" style="display:inline-block;padding:8px 16px;background:#24292f;color:white;border-radius:6px;text-decoration:none">🔗 GitHub</a>
  </p>

  <hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0">
  <p style="font-size:12px;color:#999">Gerado por AI Code Review</p>
</body>
</html>`.trim();
}

export function formatEmailSubject(data: ReviewNotificationData): string {
  return `${statusEmoji(data.status)} Review: ${data.repoFullName} #${data.prNumber} — ${data.prTitle}`;
}

