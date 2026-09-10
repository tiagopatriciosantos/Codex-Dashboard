import { Coins, Database, Layers, Zap } from 'lucide-react';
import type { DashboardOverview } from '../types';
const compact = (n: number) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 2 }).format(n);
export function SummaryPanel({ overview, cacheHit }: { overview: DashboardOverview; cacheHit: number }) {
  const t = overview.totals;
  const rows = [
    { label: 'Observed tokens', value: compact(t.totalTokens), note: `${compact(t.inputTokens)} input / ${compact(t.outputTokens)} output`, Icon: Database },
    { label: 'API-equivalent estimate', value: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(t.estimatedApiCostUsd), note: `${t.unknownPriceThreads} thread(s) with incomplete pricing. Not a subscription bill.`, Icon: Coins },
    { label: 'Cached input', value: `${cacheHit.toFixed(1)}%`, note: `${compact(t.cachedInputTokens)} tokens; included in input, not additional.`, Icon: Zap },
    { label: 'Indexed threads', value: compact(t.threads), note: 'Local logs only; not all activity on this account.', Icon: Layers }
  ];
  return <section className="summary-panel" aria-label="Local observations">
    <div className="section-heading"><div><h2>Local observations</h2><p>Independent of server-reported quota.</p></div></div>
    <div className="summary-list">{rows.map(({ label, value, note, Icon }) => <div className="summary-row" key={label}>
      <Icon size={19} /><span>{label}</span><strong>{value}</strong><small>{note}</small>
    </div>)}</div>
  </section>;
}
