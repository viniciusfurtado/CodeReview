import PDFDocument from 'pdfkit';
import type { LaudoFinding } from '@prisma/client';
import type { LaudoWithRelations } from './markdown';

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

/** Gera o PDF do laudo em memória (não toca disco) — quem chama decide onde salvar. */
export function generateLaudoPdf(laudo: LaudoWithRelations, findings: LaudoFinding[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const repoLabel =
      laudo.source === 'REGISTERED' && laudo.repository
        ? laudo.repository.fullName
        : (laudo.publicRepoUrl ?? 'repositório desconhecido');

    doc.fontSize(20).fillColor('#000000').text('Laudo de Qualidade de Código');
    doc.moveDown();
    doc.fontSize(11).fillColor('#444444');
    doc.text(`Repositório: ${repoLabel}`);
    if (laudo.branch) doc.text(`Branch: ${laudo.branch}`);
    doc.text(`Organização: ${laudo.organization.name ?? laudo.organization.githubLogin}`);
    doc.text(`Gerado em: ${(laudo.completedAt ?? new Date()).toLocaleString('pt-BR')}`);
    doc.moveDown();

    doc.fillColor('#000000').fontSize(14).text('Pontuação');
    doc.fontSize(11).fillColor('#444444');
    doc.text(
      laudo.scoreLetter && laudo.scoreNumber !== null
        ? `Nota: ${laudo.scoreLetter} (${laudo.scoreNumber}/100)`
        : 'Nota: não aplicável (nenhum arquivo analisado).'
    );
    doc.moveDown();

    doc.fillColor('#000000').fontSize(14).text('Resumo');
    doc.fontSize(11).fillColor('#444444').text(laudo.summary ?? '—');
    doc.text(
      `Arquivos analisados: ${laudo.filesScanned} · Arquivos ignorados: ${laudo.filesSkipped}${
        laudo.truncated ? ' · Repositório truncado por limite de tamanho' : ''
      }`
    );
    doc.moveDown();

    doc.fillColor('#000000').fontSize(14).text(`Apontamentos (${findings.length})`);
    doc.moveDown(0.5);

    if (findings.length === 0) {
      doc
        .fontSize(11)
        .fillColor('#444444')
        .text('Nenhum apontamento — o código está de acordo com as regras configuradas.');
    }

    for (const f of findings) {
      doc.fontSize(12).fillColor('#000000').text(f.title, { underline: true });
      doc
        .fontSize(10)
        .fillColor('#666666')
        .text(`${f.filePath}${f.line ? `:${f.line}` : ''} · ${severityLabel(f.severity)} · ${sourceLabel(f.source)}`);
      doc.fontSize(11).fillColor('#333333').text(f.message);
      if (f.suggestion) {
        doc.fontSize(11).fillColor('#0a6b3f').text(`Recomendação: ${f.suggestion}`);
      }
      doc.moveDown();
    }

    doc.end();
  });
}
