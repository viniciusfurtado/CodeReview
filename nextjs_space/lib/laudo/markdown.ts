import type { Laudo, LaudoFinding, Repository, Organization } from '@prisma/client';

export type LaudoWithRelations = Laudo & { repository: Repository | null; organization: Organization };

function severityLabel(sev: string): string {
  switch (sev) {
    case 'ERROR':
      return 'Erro';
    case 'WARNING':
      return 'Atenção';
    default:
      return 'Info';
  }
}

function sourceLabel(source: string): string {
  return source === 'CONFIRMED_BOTH'
    ? 'Confirmado por 2 IAs'
    : 'Identificado pela dupla checagem (Claude)';
}

export function generateLaudoMarkdown(laudo: LaudoWithRelations, findings: LaudoFinding[]): string {
  const repoLabel =
    laudo.source === 'REGISTERED' && laudo.repository
      ? laudo.repository.fullName
      : (laudo.publicRepoUrl ?? 'repositório desconhecido');

  const lines: string[] = [];
  lines.push('# Laudo de Qualidade de Código');
  lines.push('');
  lines.push(`**Repositório:** ${repoLabel}`);
  if (laudo.branch) lines.push(`**Branch:** ${laudo.branch}`);
  lines.push(`**Gerado em:** ${(laudo.completedAt ?? new Date()).toISOString()}`);
  lines.push(`**Organização:** ${laudo.organization.name ?? laudo.organization.githubLogin}`);
  lines.push('');
  lines.push('## Pontuação');
  lines.push('');
  lines.push(
    laudo.scoreLetter && laudo.scoreNumber !== null
      ? `**Nota:** ${laudo.scoreLetter} (${laudo.scoreNumber}/100)`
      : '**Nota:** não aplicável (nenhum arquivo analisado).'
  );
  lines.push('');
  lines.push('## Resumo');
  lines.push('');
  lines.push(laudo.summary ?? '—');
  lines.push('');
  lines.push(
    `Arquivos analisados: ${laudo.filesScanned} · Arquivos ignorados: ${laudo.filesSkipped}${
      laudo.truncated ? ' · ⚠️ Repositório truncado por limite de tamanho' : ''
    }`
  );
  lines.push('');
  lines.push(`## Apontamentos (${findings.length})`);
  lines.push('');

  if (findings.length === 0) {
    lines.push('Nenhum apontamento — o código está de acordo com as regras configuradas.');
  }

  for (const f of findings) {
    lines.push(`### ${f.title}`);
    lines.push('');
    lines.push(`- **Arquivo:** \`${f.filePath}${f.line ? `:${f.line}` : ''}\``);
    lines.push(`- **Severidade:** ${severityLabel(f.severity)}`);
    lines.push(`- **Origem:** ${sourceLabel(f.source)}`);
    lines.push('');
    lines.push(f.message);
    if (f.suggestion) {
      lines.push('');
      lines.push(`**Recomendação:** ${f.suggestion}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
