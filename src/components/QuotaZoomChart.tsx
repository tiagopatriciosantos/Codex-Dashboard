import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Area, Brush, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Maximize2, Minimize2, RotateCcw } from 'lucide-react';
import type { ProjectionPoint } from '../types';
import { brushIndices, orderedPoints, timeWindow, type TimeWindow, type ZoomPreset } from '../chartWindow';
import './quotaZoom.css';
type Props = { title: string; subtitle: string; points: ProjectionPoint[]; range: 'short' | 'long'; resetAt: number | null };
function label(t: number, span: number) {
  return new Date(t * 1000).toLocaleString([], span <= 86400
    ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
export function RateLimitChart(props: Props) {
  // Remount only when switching quota windows, not on periodic refresh.
  return <ZoomChart key={props.range} {...props} />;
}
function ZoomChart({ title, subtitle, points, resetAt }: Props) {
  const [preset, setPreset] = useState<ZoomPreset>('all');
  const [manual, setManual] = useState<TimeWindow | null>(null);
  const [projection, setProjection] = useState(false);
  const [autoY, setAutoY] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId().replace(/:/g, '');
  const ordered = useMemo(() => orderedPoints(points, projection), [points, projection]);
  const domain = timeWindow(ordered, preset, manual);
  const [startIndex, endIndex] = brushIndices(ordered, domain);
  const span = domain[1] - domain[0];
  const visible = ordered.filter(p => p.timestamp >= domain[0] && p.timestamp <= domain[1]);
  const lastActual = [...ordered].reverse().find(p => !p.projected);
  const rows: Array<{ timestamp: number; actual: number | null; projection: number | null }> = [];
  for (const p of visible) {
    // Break the series at a downward correction/reset; do not interpolate across it.
    if (p.reset && rows.length) rows.push({ timestamp: p.timestamp - 0.001, actual: null, projection: null });
    rows.push({ timestamp: p.timestamp, actual: p.projected ? null : p.usedPercent,
      projection: p.projected || (projection && p === lastActual) ? p.usedPercent : null });
  }
  const values = visible.map(p => p.usedPercent);
  const max = values.reduce((a, b) => Math.max(a, b), 0);
  const min = values.reduce((a, b) => Math.min(a, b), max);
  const padding = Math.max(1, (max - min) * 0.1);
  const yDomain: [number, number] = autoY
    ? [Math.max(0, Math.floor(min - padding)), Math.ceil(max + padding)]
    : [0, Math.max(100, Math.ceil(max / 20) * 20)];
  useEffect(() => {
    if (!expanded) return;
    const element = dialog.current;
    const old = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { element?.close(); document.body.style.overflow = old; };
  }, [expanded]);
  function choose(p: ZoomPreset) { setPreset(p); setManual(null); }
  function reset() { choose('all'); setProjection(false); setAutoY(false); }
  const body = <>
    <div className="section-heading"><div><h2 id={`${id}-title`}>{title}</h2><p>{subtitle}</p></div></div>
    <div className="qz-tools">
      <div className="qz-presets" role="group" aria-label="Time range">{(['1h', '5h', '24h', 'all'] as const).map(p =>
        <button key={p} type="button" aria-pressed={!manual && preset === p} onClick={() => choose(p)}>{p === 'all' ? 'All' : p}</button>)}</div>
      <button type="button" onClick={reset} title="Reset zoom"><RotateCcw size={14} />Reset</button>
      <button type="button" onClick={() => setExpanded(!expanded)} aria-label={expanded ? 'Close expanded chart' : 'Expand chart'}>
        {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}{expanded ? 'Close' : 'Expand'}
      </button>
    </div>
    <div className="qz-options">
      <label><input type="checkbox" checked={projection} onChange={e => { setProjection(e.target.checked); setManual(null); }} />Show projection</label>
      <label><input type="checkbox" checked={autoY} onChange={e => setAutoY(e.target.checked)} />Auto-scale Y</label>
    </div>
    {ordered.length < 2 ? <div className="chart-empty">At least two samples are needed. No values are invented.</div> : <>
      <div className="qz-plot">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 16, right: 25, bottom: 5, left: 3 }}>
            <defs><linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-primary)" stopOpacity={0.25} /><stop offset="100%" stopColor="var(--chart-primary)" stopOpacity={0.02} /></linearGradient></defs>
            <CartesianGrid stroke="var(--grid-line)" vertical={false} />
            <XAxis dataKey="timestamp" type="number" domain={domain} allowDataOverflow tickFormatter={v => label(Number(v), span)} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} minTickGap={35} />
            <YAxis domain={yDomain} allowDataOverflow width={55} tickFormatter={v => `${Number(v).toFixed(autoY ? 1 : 0)}%`} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: 'var(--tooltip-bg)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}
              labelFormatter={v => new Date(Number(v) * 1000).toLocaleString()}
              formatter={(v, name) => [`${Number(v).toFixed(2)}% used${name === 'actual' ? ` / ${Math.max(0, 100 - Number(v)).toFixed(2)}% remaining` : ''}`, name === 'projection' ? 'Linear projection (estimate)' : 'Reported quota']} />
            {yDomain[0] <= 100 && yDomain[1] >= 100 && <ReferenceLine y={100} stroke="var(--danger)" strokeDasharray="4 5" />}
            {visible.filter(p => p.reset && !p.projected).map((p, i) => <ReferenceLine key={`reset-${i}`} x={p.timestamp} stroke="var(--info)" strokeDasharray="3 5" label={{ value: 'Reset/correction', fill: 'var(--text-muted)', fontSize: 10 }} />)}
            {resetAt && resetAt >= domain[0] && resetAt <= domain[1] ? <ReferenceLine x={resetAt} stroke="var(--info)" strokeDasharray="4 4" /> : null}
            <Area dataKey="actual" type="linear" stroke="var(--chart-primary)" strokeWidth={2} fill={`url(#${id}-fill)`} connectNulls={false} isAnimationActive={false} />
            {projection && <Line dataKey="projection" type="linear" stroke="var(--chart-projection)" strokeDasharray="6 5" dot={false} connectNulls={false} isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="qz-brush" aria-label="Drag the range handles to zoom">
        <ResponsiveContainer width="100%" height={48}>
          <ComposedChart data={ordered} margin={{ left: 55, right: 25 }}>
            <Brush dataKey="timestamp" height={28} travellerWidth={12} startIndex={startIndex} endIndex={endIndex}
              stroke="var(--chart-primary)" fill="var(--surface-soft)" tickFormatter={v => label(Number(v), span)}
              onChange={v => { if (v.startIndex === undefined || v.endIndex === undefined || v.startIndex >= v.endIndex) return;
                const a = ordered[v.startIndex], b = ordered[v.endIndex]; if (a && b) setManual([a.timestamp, b.timestamp]); }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="qz-note" aria-live="polite">{new Date(domain[0] * 1000).toLocaleString()} — {new Date(domain[1] * 1000).toLocaleString()} · {visible.filter(p => !p.projected).length} reported samples</p>
    </>}
    <p className="qz-note">Drag the handles to zoom. Shortcuts end at the latest reported sample. {projection ? 'Dashed line: extrapolation, not a confirmed future charge.' : 'Projection hidden to keep real activity readable.'}</p>
  </>;
  return <>
    {!expanded && <section className="usage-chart-panel qz-panel">{body}</section>}
    <dialog ref={dialog} className="qz-dialog" aria-labelledby={`${id}-title`} onClose={() => setExpanded(false)} onCancel={() => setExpanded(false)}>{expanded && body}</dialog>
  </>;
}
