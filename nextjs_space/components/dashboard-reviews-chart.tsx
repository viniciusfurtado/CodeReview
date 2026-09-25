'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export interface DayBucket {
  date: string; // "dd/mm" já formatado para exibição
  good: number;
  warning: number;
  critical: number;
}

const COLORS = {
  good: '#0ca30c',
  warning: '#fab219',
  critical: '#d03b3b',
};

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs shadow-md">
      <p className="mb-1 font-semibold">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

export function DashboardReviewsChart({ data }: { data: DayBucket[] }) {
  const hasAny = data.some((d) => d.good + d.warning + d.critical > 0);

  if (!hasAny) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Nenhuma revisão nos últimos 14 dias.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          className="fill-muted-foreground"
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={28}
          className="fill-muted-foreground"
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))' }} />
        <Legend
          verticalAlign="top"
          height={32}
          formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
        />
        <Bar
          dataKey="good"
          name="Concluída"
          stackId="reviews"
          fill={COLORS.good}
          radius={[0, 0, 0, 0]}
          stroke="hsl(var(--card))"
          strokeWidth={2}
        />
        <Bar
          dataKey="warning"
          name="Aguardando Ajustes"
          stackId="reviews"
          fill={COLORS.warning}
          radius={[0, 0, 0, 0]}
          stroke="hsl(var(--card))"
          strokeWidth={2}
        />
        <Bar
          dataKey="critical"
          name="Falhou"
          stackId="reviews"
          fill={COLORS.critical}
          radius={[4, 4, 0, 0]}
          stroke="hsl(var(--card))"
          strokeWidth={2}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
