// Uso manual: tsx --require dotenv/config scripts/laudo-smoke-test.ts <organizationId> <publicRepoUrl>
// Cria um Laudo de teste para um repositório público e processa imediatamente,
// imprimindo o resultado. Requer OPENROUTER_API_KEY e/ou SERVICE_CLAUDE_*
// configurados no .env para produzir um resultado real (senão falha com um
// erro claro, o que também é um resultado válido para este smoke test).
import { prisma } from '../lib/db';
import { processLaudo } from '../lib/laudo/queue';

async function main() {
  const [organizationId, publicRepoUrl] = process.argv.slice(2);
  if (!organizationId || !publicRepoUrl) {
    console.error('Uso: tsx scripts/laudo-smoke-test.ts <organizationId> <publicRepoUrl>');
    process.exit(1);
  }

  const laudo = await prisma.laudo.create({
    data: {
      organizationId,
      requestedByUserId: (
        await prisma.organizationMember.findFirstOrThrow({ where: { organizationId } })
      ).userId,
      source: 'PUBLIC_URL',
      publicRepoUrl,
      status: 'PENDING',
      queuedAt: new Date(),
    },
  });

  console.log(`Laudo criado: ${laudo.id}. Processando...`);
  await processLaudo(laudo.id);

  const result = await prisma.laudo.findUniqueOrThrow({
    where: { id: laudo.id },
    include: { findings: true, artifacts: true },
  });
  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
