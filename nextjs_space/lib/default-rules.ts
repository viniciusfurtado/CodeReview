import { prisma } from '@/lib/db';

interface DefaultRule {
  name: string;
  description: string;
  instruction: string;
  severity: 'INFO' | 'WARNING' | 'ERROR';
}

export const DEFAULT_REVIEW_RULES: DefaultRule[] = [
  {
    name: 'Segurança — injeção e dados sensíveis',
    description: 'Riscos de injeção, segredos hardcoded e exposição de dados sensíveis.',
    instruction:
      'Aponte riscos de injeção (SQL, comando, XSS), segredos/chaves hardcoded no código, ou exposição de dados sensíveis (senhas, tokens, PII) em logs ou respostas.',
    severity: 'ERROR',
  },
  {
    name: 'Tratamento de erros',
    description: 'Erros e exceções tratados de forma adequada.',
    instruction:
      'Verifique se erros e exceções são tratados adequadamente — sem catch vazios, sem engolir erros silenciosamente, e com mensagens que ajudem a diagnosticar o problema.',
    severity: 'WARNING',
  },
  {
    name: 'Duplicação de código',
    description: 'Blocos duplicados que poderiam virar uma função/módulo compartilhado.',
    instruction:
      'Identifique blocos de código duplicados ou muito similares que poderiam ser extraídos para uma função/módulo compartilhado.',
    severity: 'WARNING',
  },
  {
    name: 'Nomenclatura e legibilidade',
    description: 'Nomes pouco claros ou genéricos demais.',
    instruction:
      'Aponte nomes de variáveis, funções ou classes pouco claros, genéricos demais (ex: data, temp, x) ou que não refletem o que representam.',
    severity: 'INFO',
  },
  {
    name: 'Performance e consultas ineficientes',
    description: 'Padrões como consultas N+1 e loops custosos.',
    instruction:
      'Identifique padrões de performance problemáticos, como consultas N+1 a banco de dados, loops aninhados desnecessários, ou operações custosas dentro de loops.',
    severity: 'WARNING',
  },
  {
    name: 'Cobertura de testes',
    description: 'Mudanças de lógica de negócio sem testes correspondentes.',
    instruction:
      'Avalie se mudanças em lógica de negócio relevante vêm acompanhadas de testes automatizados correspondentes.',
    severity: 'INFO',
  },
  {
    name: 'Comentários e documentação',
    description: 'Lógica complexa sem explicação, ou comentários desatualizados.',
    instruction:
      'Aponte lógica complexa sem nenhum comentário explicativo quando o código não é autoexplicativo, e comentários desatualizados ou redundantes com o código.',
    severity: 'INFO',
  },
];

/**
 * Semeia as regras padrão numa organização, apenas se ela ainda não tiver
 * nenhuma regra própria. Idempotente — seguro de chamar em todo login/evento
 * de instalação, sem sobrescrever regras que o usuário já tenha criado.
 */
export async function ensureDefaultRules(organizationId: string): Promise<void> {
  const existing = await prisma.reviewRule.count({ where: { organizationId } });
  if (existing > 0) return;

  await prisma.reviewRule.createMany({
    data: DEFAULT_REVIEW_RULES.map((rule) => ({
      organizationId,
      name: rule.name,
      description: rule.description,
      instruction: rule.instruction,
      severity: rule.severity,
    })),
  });
}
