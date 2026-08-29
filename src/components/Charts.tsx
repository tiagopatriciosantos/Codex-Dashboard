import type { ReactNode } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type {
  DailyUsage,
  ModelEfficiency,
  ModelUsageSummary,
  ProjectionPoint
} from '../types';

function compactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value);
}

function timeLabel(timestamp: number, range: 'short' | 'long'): string {
  const date = new Date(timestamp * 1000);
  return range === 'short'
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

const tooltipStyle = {
  background: 'var(--tooltip-bg)',
  border: '1px solid var(--border-strong)',
  borderRadius: 10,
  boxShadow: 'var(--shadow-lg)',
  color: 'var(--text-primary)',
  fontSize: 12
};

function ChartPanel({
  title,
  subtitle,
  className = '',
  children
}: {
  title: string;
  subtitle: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`chart-panel ${className}`}>
      <div className="section-heading compact-heading">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

type TrendRow = ProjectionPoint & {
  actual: number | null;
  projection: number | null;
  overLimit: number | null;
};

function buildTrendData(points: ProjectionPoint[]): TrendRow[] {
  return points.map((point) => ({
    ...point,
    actual: point.projected ? null : point.usedPercent,
    projection: point.projected ? point.usedPercent : null,
    overLimit: !point.projected && point.usedPercent > 100 ? point.usedPercent : null
  }));
}

export function RateLimitChart({
  title,
  subtitle,
  points,
  range,
  resetAt
}: {
  title: string;
  subtitle: string;
  points: ProjectionPoint[];
  range: 'short' | 'long';
  resetAt: number | null;
}) {
  const base = buildTrendData(points);
  const firstProjectedIndex = base.findIndex((point) => point.projected);
  const data = [...base];
  if (firstProjectedIndex > 0) {
    const previous = base[firstProjectedIndex - 1];
    data[firstProjectedIndex - 1] = { ...previous, projection: previous.usedPercent };
  }
  const maxValue = Math.max(100, ...points.map((point) => point.usedPercent));
  const maxTimestamp = Math.max(resetAt ?? 0, ...points.map((point) => point.timestamp));
  const resetPoints = points.filter((point) => point.reset && !point.projected);

  return (
    <section className="usage-chart-panel">
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      {points.length < 2 ? (
        <div className="chart-empty">More snapshots are needed before a trend can be drawn.</div>
      ) : (
        <div className="chart-frame primary-chart">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 22, right: 18, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id={`usageFill-${range}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-primary)" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="var(--chart-primary)" stopOpacity={0.015} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--grid-line)" vertical={false} />
              <XAxis
                dataKey="timestamp"
                type="number"
                domain={['dataMin', maxTimestamp]}
                tickFormatter={(value) => timeLabel(value, range)}
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                domain={[0, Math.ceil(maxValue / 20) * 20]}
                tickFormatter={(value) => `${value}%`}
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(value) => new Date(Number(value) * 1000).toLocaleString()}
                formatter={(value, name) => [
                  `${Number(value).toFixed(1)}%`,
                  name === 'projection' ? 'Projected' : name === 'overLimit' ? 'Over limit' : 'Reported'
                ]}
              />
              <ReferenceLine
                y={100}
                stroke="var(--danger)"
                strokeDasharray="4 6"
                opacity={0.72}
                label={{ value: '100% limit', fill: 'var(--danger)', fontSize: 10, position: 'insideTopLeft' }}
              />
              {resetPoints.map((point) => (
                <ReferenceLine
                  key={`reset-${point.timestamp}`}
                  x={point.timestamp}
                  stroke="var(--info)"
                  strokeDasharray="3 5"
                  opacity={0.72}
                  label={{ value: 'Reset detected', fill: 'var(--info)', fontSize: 10, position: 'insideTopRight' }}
                />
              ))}
              {resetAt ? (
                <ReferenceLine
                  x={resetAt}
                  stroke="var(--info)"
                  strokeDasharray="4 4"
                  opacity={0.88}
                  label={{ value: 'Scheduled reset', fill: 'var(--info)', fontSize: 10, position: 'insideTopRight' }}
                />
              ) : null}
              <Area
                type="linear"
                dataKey="actual"
                stroke="var(--chart-primary)"
                strokeWidth={2.4}
                fill={`url(#usageFill-${range})`}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="overLimit"
                stroke="var(--danger)"
                strokeWidth={2.8}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="projection"
                stroke="var(--chart-projection)"
                strokeWidth={2.1}
                strokeDasharray="6 5"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

export function DailyTokenChart({ data }: { data: DailyUsage[] }) {
  return (
    <ChartPanel
      title="Daily token activity"
      subtitle="Account totals when available, otherwise local sessions."
    >
      {data.length === 0 ? (
        <div className="chart-empty">No daily token history was returned yet.</div>
      ) : (
        <div className="chart-frame compact-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
              <CartesianGrid stroke="var(--grid-line)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(value) =>
                  new Date(`${value}T12:00:00`).toLocaleDateString([], { weekday: 'short' })
                }
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={compactNumber}
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(value) => new Date(`${value}T12:00:00`).toLocaleDateString()}
                formatter={(value) => [Number(value).toLocaleString(), 'Tokens']}
              />
              <Bar dataKey="tokens" fill="var(--chart-primary)" radius={[5, 5, 1, 1]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartPanel>
  );
}

export function ModelEfficiencyChart({ data }: { data: ModelEfficiency[] }) {
  const rows = data
    .filter((row) => row.minutesPerPercent !== null)
    .sort((a, b) => (b.minutesPerPercent ?? 0) - (a.minutesPerPercent ?? 0))
    .slice(0, 7);
  return (
    <ChartPanel
      title="Model efficiency"
      subtitle="Last 30 chats · completed task minutes per 1% of quota. Higher is better."
    >
      {rows.length === 0 ? (
        <div className="chart-empty">More correlated quota samples are needed.</div>
      ) : (
        <div className="chart-frame compact-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 20, bottom: 0, left: 12 }}>
              <CartesianGrid stroke="var(--grid-line)" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(value) => `${value}m`}
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="model"
                width={118}
                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value) => [`${Number(value).toFixed(2)} min`, 'Minutes per 1%']}
              />
              <Bar dataKey="minutesPerPercent" fill="var(--chart-secondary)" radius={[0, 5, 5, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartPanel>
  );
}

export function ModelTokenChart({ data }: { data: ModelUsageSummary[] }) {
  const rows = data.slice(0, 7).map((row) => ({
    ...row,
    cached: row.cachedInputTokens,
    uncached: Math.max(0, row.inputTokens - row.cachedInputTokens),
    output: row.outputTokens
  }));
  return (
    <ChartPanel title="Tokens by model" subtitle="Cached input, uncached input, and output text tokens.">
      {rows.length === 0 ? (
        <div className="chart-empty">No model token data is available.</div>
      ) : (
        <div className="chart-frame compact-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
              <CartesianGrid stroke="var(--grid-line)" vertical={false} />
              <XAxis
                dataKey="model"
                tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <YAxis
                tickFormatter={compactNumber}
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={50}
              />
              <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [compactNumber(Number(value)), name]} />
              <Bar dataKey="cached" stackId="tokens" fill="var(--chart-primary)" />
              <Bar dataKey="uncached" stackId="tokens" fill="var(--chart-secondary)" />
              <Bar dataKey="output" stackId="tokens" fill="var(--warning)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartPanel>
  );
}

export function ModelCostChart({ data }: { data: ModelUsageSummary[] }) {
  const rows = data.filter((row) => row.estimatedApiCostUsd > 0).slice(0, 7);
  return (
    <ChartPanel title="API equivalent by model" subtitle="Estimated public API price for observed text tokens.">
      {rows.length === 0 ? (
        <div className="chart-empty">No priced model usage is available.</div>
      ) : (
        <div className="chart-frame compact-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
              <CartesianGrid stroke="var(--grid-line)" vertical={false} />
              <XAxis
                dataKey="model"
                tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <YAxis
                tickFormatter={(value) => `$${value}`}
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value) => [`$${Number(value).toFixed(3)}`, 'API equivalent']}
              />
              <Bar dataKey="estimatedApiCostUsd" fill="var(--info)" radius={[5, 5, 1, 1]} maxBarSize={34} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartPanel>
  );
}
