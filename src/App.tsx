import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Code2, RefreshCw, ShieldCheck } from 'lucide-react';
import { getOverview, refreshOverview } from './api';
import {
  DailyTokenChart,
  ModelCostChart,
  ModelEfficiencyChart,
  ModelTokenChart,
  RateLimitChart
} from './components/Charts';
import { LimitCard } from './components/LimitCard';
import {
  MobileNavigation,
  Sidebar,
  type DashboardSection
} from './components/Navigation';
import { SummaryPanel } from './components/SummaryPanel';
import { ThreadsTable } from './components/ThreadsTable';
import type { DashboardOverview } from './types';

type UsageRange = 'five' | 'seven';

function formatUpdated(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  });
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <div className="loading-mark"><Code2 size={26} /></div>
      <div>
        <h1>Loading usage</h1>
        <p>Indexing your local Codex activity.</p>
      </div>
    </main>
  );
}

function WindowToggle({
  value,
  onChange,
  className = ''
}: {
  value: UsageRange;
  onChange: (value: UsageRange) => void;
  className?: string;
}) {
  return (
    <div className={`window-toggle ${className}`} aria-label="Usage window">
      <button
        type="button"
        className={value === 'five' ? 'active' : ''}
        aria-pressed={value === 'five'}
        onClick={() => onChange('five')}
      >
        5h
      </button>
      <button
        type="button"
        className={value === 'seven' ? 'active' : ''}
        aria-pressed={value === 'seven'}
        onClick={() => onChange('seven')}
      >
        7d
      </button>
    </div>
  );
}

export default function App() {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeWindow, setActiveWindow] = useState<UsageRange>('five');
  const [activeSection, setActiveSection] = useState<DashboardSection>('overview');

  const load = useCallback(async (force = false) => {
    try {
      if (force) setRefreshing(true);
      const next = force ? await refreshOverview() : await getOverview();
      setOverview(next);
      setError(null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
    const timer = window.setInterval(() => void load(false), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const dailyData = useMemo(() => {
    if (!overview) return [];
    return overview.accountDailyUsage.length > 0
      ? overview.accountDailyUsage
      : overview.localDailyUsage;
  }, [overview]);

  const navigate = useCallback((section: DashboardSection) => {
    setActiveSection(section);
    document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  if (!overview && !error) return <LoadingScreen />;

  if (!overview) {
    return (
      <main className="loading-screen error-screen">
        <div className="loading-mark error-mark"><AlertCircle size={25} /></div>
        <div>
          <h1>Dashboard unavailable</h1>
          <p>{error}</p>
          <button className="primary-button" onClick={() => void load(false)}>Retry</button>
        </div>
      </main>
    );
  }

  const cacheHit = overview.totals.inputTokens > 0
    ? (overview.totals.cachedInputTokens / overview.totals.inputTokens) * 100
    : 0;
  const selectedLimit = activeWindow === 'five'
    ? overview.limits.fiveHour
    : overview.limits.sevenDay;
  const selectedPoints = activeWindow === 'five'
    ? overview.histories.fiveHour
    : overview.histories.sevenDay;

  return (
    <div className="app-shell">
      <Sidebar
        active={activeSection}
        onNavigate={navigate}
        connected={overview.connection.codexConnected}
        planType={overview.connection.planType}
      />

      <header className="topbar">
        <h1>Usage overview</h1>
        <div className="topbar-actions">
          <div className="topbar-connection">
            <span className={overview.connection.codexConnected ? 'connection-dot online' : 'connection-dot offline'} />
            <span>{overview.connection.codexConnected ? 'Connected' : 'Offline'}</span>
          </div>
          <span className="updated-copy">Updated {formatUpdated(overview.generatedAt)}</span>
          <button
            className="refresh-button"
            type="button"
            aria-label="Refresh all usage data"
            onClick={() => void load(true)}
            disabled={refreshing}
          >
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
            <span>{refreshing ? 'Refreshing' : 'Refresh'}</span>
          </button>
        </div>
      </header>

      <main className="dashboard">
        {error ? (
          <div className="inline-alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        ) : null}

        <section id="overview" className="overview-section">
          <WindowToggle
            value={activeWindow}
            onChange={setActiveWindow}
            className="mobile-window-toggle"
          />
          <div className="limits-grid">
            <div className={`window-slot ${activeWindow !== 'five' ? 'mobile-window-hidden' : ''}`}>
              <LimitCard
                title="5-hour window"
                limit={overview.limits.fiveHour}
                projection={overview.projections.fiveHour}
                missingMessage="This window is not being reported. Stored history remains available and collection will resume automatically."
              />
            </div>
            <div className={`window-slot ${activeWindow !== 'seven' ? 'mobile-window-hidden' : ''}`}>
              <LimitCard
                title="7-day window"
                limit={overview.limits.sevenDay}
                projection={overview.projections.sevenDay}
                missingMessage="Codex is not currently returning a weekly usage window for this account."
              />
            </div>
          </div>

          <div className="activity-grid">
            <div className="activity-chart-wrap">
              <WindowToggle value={activeWindow} onChange={setActiveWindow} />
              <RateLimitChart
                title="Usage activity"
                subtitle={
                  activeWindow === 'five'
                    ? 'Reported quota usage and the current reset-aware projection.'
                    : 'Weekly quota usage with reset boundaries kept separate.'
                }
                points={selectedPoints}
                range={activeWindow === 'five' ? 'short' : 'long'}
                resetAt={selectedLimit?.resetsAt ?? null}
              />
            </div>
            <SummaryPanel overview={overview} cacheHit={cacheHit} />
          </div>
        </section>

        <ThreadsTable threads={overview.threads} />

        <section className="analytics-section" id="analytics" aria-labelledby="analytics-title">
          <div className="section-heading analytics-heading">
            <div>
              <h2 id="analytics-title">Model performance</h2>
              <p>Token volume, API-equivalent cost, and observed quota efficiency.</p>
            </div>
          </div>
          <div className="analytics-grid">
            <DailyTokenChart data={dailyData} />
            <ModelEfficiencyChart data={overview.modelEfficiency} />
          </div>
          <div className="analytics-grid">
            <ModelTokenChart data={overview.modelUsage} />
            <ModelCostChart data={overview.modelUsage} />
          </div>
        </section>

        <section className="accuracy-section" id="accuracy" aria-labelledby="accuracy-title">
          <div className="accuracy-heading">
            <ShieldCheck size={20} />
            <div>
              <h2 id="accuracy-title">Accuracy & methodology</h2>
              <p>What is reported, what is estimated, and how resets are handled.</p>
            </div>
          </div>
          <div className="accuracy-notes">
            <p>Reported percentages and reset times come directly from Codex. Values above 100% are preserved.</p>
            <p>A downward change starts a new trend segment, so pace before a reset never leaks into the current projection.</p>
            {overview.notices.map((notice) => <p key={notice}>{notice}</p>)}
          </div>
        </section>
      </main>

      <MobileNavigation active={activeSection} onNavigate={navigate} />
    </div>
  );
}
