import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Gauge,
  RotateCcw
} from 'lucide-react';
import type { LimitProjection, RateLimitWindow } from '../types';

interface LimitCardProps {
  title: string;
  limit: RateLimitWindow | null;
  projection: LimitProjection;
  missingMessage: string;
}

function formatReset(timestamp: number): { relative: string; absolute: string } {
  const date = new Date(timestamp * 1000);
  const delta = timestamp * 1000 - Date.now();
  if (delta <= 0) {
    return {
      relative: 'Reset pending',
      absolute: date.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    };
  }
  const minutes = Math.max(1, Math.round(delta / 60_000));
  const relative = minutes < 60
    ? `${minutes}m`
    : minutes < 1440
      ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
      : `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
  return {
    relative,
    absolute: date.toLocaleString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  };
}

function statusFor(limit: RateLimitWindow, projection: LimitProjection): {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
  Icon: typeof Gauge;
} {
  if (limit.usedPercent > 100) {
    return {
      label: `${(limit.usedPercent - 100).toFixed(1)}% over limit`,
      tone: 'danger',
      Icon: AlertTriangle
    };
  }
  if (projection.projectedPercentAtReset !== null && projection.projectedPercentAtReset > 100) {
    return { label: 'Limit at risk', tone: 'warning', Icon: AlertTriangle };
  }
  if (projection.paceRatio === null) {
    return { label: 'Collecting trend', tone: 'neutral', Icon: Gauge };
  }
  if (projection.paceRatio > 1.15) {
    return { label: 'Above safe pace', tone: 'warning', Icon: Activity };
  }
  if (projection.paceRatio > 0.85) {
    return { label: 'Tight pace', tone: 'warning', Icon: Clock3 };
  }
  return { label: 'On track', tone: 'success', Icon: CheckCircle2 };
}

function formatPercent(value: number): string {
  return `${value.toFixed(value < 10 ? 1 : 0)}%`;
}

export function LimitCard({ title, limit, projection, missingMessage }: LimitCardProps) {
  if (!limit) {
    return (
      <section className="quota-panel quota-unavailable">
        <div className="quota-heading">
          <div className="quota-title"><Clock3 size={18} /><h2>{title}</h2></div>
          <span className="quota-status neutral"><Gauge size={14} />Not reported</span>
        </div>
        <div className="unavailable-message">
          <RotateCcw size={22} />
          <div>
            <strong>Waiting for Codex</strong>
            <p>{missingMessage}</p>
          </div>
        </div>
      </section>
    );
  }

  const status = statusFor(limit, projection);
  const reset = formatReset(limit.resetsAt);
  const overage = Math.max(0, limit.usedPercent - 100);
  const remaining = Math.max(0, 100 - limit.usedPercent);
  const samplesUsed = projection.samplesUsed ?? 0;
  const resetEventsDetected = projection.resetEventsDetected ?? 0;

  return (
    <section className={`quota-panel ${overage > 0 ? 'is-over-limit' : ''}`}>
      <div className="quota-heading">
        <div className="quota-title"><Clock3 size={18} /><h2>{title}</h2></div>
        <span className={`quota-status ${status.tone}`}>
          <status.Icon size={14} />
          {status.label}
        </span>
      </div>

      <div className="quota-primary">
        <div>
          <strong className="quota-value">{formatPercent(limit.usedPercent)}</strong>
          <span className={`quota-health ${status.tone}`}>
            <status.Icon size={15} /> {status.label}
          </span>
        </div>
        <div className="reset-copy">
          <span>Resets in</span>
          <strong>{reset.relative}</strong>
          <small>{reset.absolute}</small>
        </div>
      </div>

      <div className="quota-meter-wrap">
        <div
          className="quota-meter"
          role="meter"
          aria-label={`${title} usage`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, limit.usedPercent)}
          aria-valuetext={`${limit.usedPercent}% used`}
        >
          <span className="quota-meter-fill" style={{ width: `${Math.min(100, limit.usedPercent)}%` }} />
          <span className="quota-meter-segments" />
          <span className="quota-limit-marker">100%</span>
        </div>
        {overage > 0 ? (
          <div className="overage-row">
            <span className="overage-label">Overflow</span>
            <span className="overage-track"><i style={{ width: `${Math.min(100, overage)}%` }} /></span>
            <strong>+{overage.toFixed(1)}%</strong>
          </div>
        ) : null}
      </div>

      <div className="quota-legend">
        <span><i className="legend-swatch used" />Used <strong>{formatPercent(limit.usedPercent)}</strong></span>
        <span><i className="legend-swatch remaining" />Remaining <strong>{formatPercent(remaining)}</strong></span>
      </div>

      <div className="quota-metrics">
        <div>
          <span>Current burn</span>
          <strong>{projection.percentPerHour === null ? 'Collecting' : `${projection.percentPerHour.toFixed(1)}% / hr`}</strong>
        </div>
        <div>
          <span>Projected at reset</span>
          <strong>{projection.projectedPercentAtReset === null ? '—' : formatPercent(projection.projectedPercentAtReset)}</strong>
        </div>
        <div>
          <span>Confidence</span>
          <strong className="capitalize">{projection.confidence}</strong>
          <small>{samplesUsed} samples</small>
        </div>
        <div>
          <span>Reset handling</span>
          <strong>{resetEventsDetected === 0 ? 'Continuous' : `${resetEventsDetected} detected`}</strong>
          <small>{resetEventsDetected > 0 ? 'Trend restarted' : 'No drops seen'}</small>
        </div>
      </div>
    </section>
  );
}
