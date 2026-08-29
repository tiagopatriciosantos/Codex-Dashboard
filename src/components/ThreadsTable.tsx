import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FolderOpen,
  Gauge,
  MessageSquareText,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TimerReset,
  Zap
} from 'lucide-react';
import type { PromptMetric, ThreadSummary } from '../types';

type ThreadFilter = 'all' | 'over-limit';
type ThreadSort = 'recent' | 'usage' | 'tokens' | 'cost';

function compact(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2
  }).format(value);
}

function formatTime(timestamp: number | null): string {
  if (!timestamp) return 'Unknown';
  return new Date(timestamp * 1000).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null) return '—';
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  const seconds = milliseconds / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} sec`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  if (minutes < 60) return remaining > 0 ? `${minutes}m ${remaining}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatUsage(value: number | null): string {
  if (value === null) return '—';
  if (value < 0.05) return '<0.1%';
  return `~${value.toFixed(value < 10 ? 1 : 0)}%`;
}

function average(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null);
  return valid.length > 0 ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function projectName(path: string | null): string {
  if (!path) return 'Unknown project';
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? path;
}

function primaryUsage(thread: ThreadSummary): number | null {
  return thread.estimatedSevenDayUsagePercent ?? thread.estimatedFiveHourUsagePercent;
}

function estimateNote(usage: number | null, windowLabel: string): string {
  if (usage === null) return `${windowLabel} · Awaiting bracket`;
  return `${windowLabel} · Timestamp estimate`;
}

function TokenDistribution({
  input,
  cached,
  output
}: {
  input: number;
  cached: number;
  output: number;
}) {
  const uncached = Math.max(0, input - cached);
  const denominator = Math.max(1, uncached + cached + output);
  const rows = [
    { label: 'Cached', value: cached, className: 'cached' },
    { label: 'Uncached', value: uncached, className: 'uncached' },
    { label: 'Output', value: output, className: 'output' }
  ];

  return (
    <div className="distribution-block">
      <div className="detail-block-heading">
        <span>Token distribution</span>
        <strong>{compact(input + output)} billable</strong>
      </div>
      <div className="distribution-track" aria-label="Token distribution">
        {rows.map((row) => (
          <span
            key={row.label}
            className={`distribution-segment ${row.className}`}
            style={{ width: `${(row.value / denominator) * 100}%` }}
            title={`${row.label}: ${row.value.toLocaleString()}`}
          />
        ))}
      </div>
      <div className="distribution-legend">
        {rows.map((row) => (
          <div key={row.label}>
            <i className={`legend-dot ${row.className}`} />
            <span>{row.label}</span>
            <strong>{compact(row.value)}</strong>
            <small>{((row.value / denominator) * 100).toFixed(1)}%</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function PromptRow({ prompt }: { prompt: PromptMetric }) {
  return (
    <article className="prompt-row">
      <span className="prompt-index">{prompt.sequence}</span>
      <div className="prompt-copy">
        <strong title={prompt.prompt}>{prompt.prompt}</strong>
        <span>{formatTime(prompt.startedAt)}</span>
      </div>
      <span className="model-label">{prompt.primaryModel}</span>
      <div className="prompt-metric">
        <span>Active span</span>
        <strong>{formatDuration(prompt.durationMs)}</strong>
        {prompt.timingEstimated ? <small>derived</small> : null}
      </div>
      <div className="prompt-metric">
        <span>First token</span>
        <strong>{formatDuration(prompt.timeToFirstTokenMs)}</strong>
      </div>
      <div className="prompt-metric">
        <span>Tokens</span>
        <strong>{compact(prompt.totalTokens)}</strong>
      </div>
      <div className="prompt-metric">
        <span>API equivalent</span>
        <strong>
          {prompt.estimatedApiCostUsd === null ? 'Unknown' : `$${prompt.estimatedApiCostUsd.toFixed(3)}`}
        </strong>
      </div>
    </article>
  );
}

function ExpandedThread({ thread }: { thread: ThreadSummary }) {
  const totalPromptMs = thread.prompts.reduce((sum, prompt) => sum + (prompt.durationMs ?? 0), 0);
  const averageTtft = average(thread.prompts.map((prompt) => prompt.timeToFirstTokenMs));
  const tokensPerMinute = totalPromptMs > 0 ? thread.totalTokens / (totalPromptMs / 60_000) : null;
  const cacheHit = thread.inputTokens > 0
    ? (thread.cachedInputTokens / thread.inputTokens) * 100
    : 0;

  const metrics = [
    { label: 'Prompts', value: thread.prompts.length.toString(), Icon: MessageSquareText },
    { label: 'Measured span', value: formatDuration(totalPromptMs || null), Icon: Clock3 },
    { label: 'First token', value: formatDuration(averageTtft), Icon: Zap },
    { label: 'Tokens / min', value: tokensPerMinute === null ? '—' : compact(tokensPerMinute), Icon: Gauge },
    { label: 'Cache hit', value: `${cacheHit.toFixed(1)}%`, Icon: TimerReset },
    { label: 'Review overhead', value: compact(thread.reviewerTokens), Icon: ShieldCheck }
  ];

  return (
    <div className="chat-detail">
      <div className="chat-detail-top">
        <TokenDistribution
          input={thread.inputTokens}
          cached={thread.cachedInputTokens}
          output={thread.outputTokens}
        />
        <div className="detail-metrics">
          <div className="detail-block-heading">
            <span>Prompt-level timing</span>
            <strong>{thread.prompts.length} segments</strong>
          </div>
          <div className="detail-metric-grid">
            {metrics.map(({ label, value, Icon }) => (
              <div key={label}>
                <Icon size={14} />
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="estimate-strip">
        <div>
          <span>5-hour estimate</span>
          <strong>{formatUsage(thread.estimatedFiveHourUsagePercent)}</strong>
        </div>
        <div>
          <span>7-day estimate</span>
          <strong>{formatUsage(thread.estimatedSevenDayUsagePercent)}</strong>
        </div>
        <div>
          <span>Reliable intervals</span>
          <strong>{thread.usageSampleIntervals}</strong>
        </div>
        <div>
          <span>Reset segments</span>
          <strong>{thread.usageResetSegments || '—'}</strong>
        </div>
        <div>
          <span>Session files</span>
          <strong>{thread.partCount}</strong>
        </div>
        <p>
          Completed task runs are matched to quota timestamps. Each impact is the after value minus the before value.
        </p>
      </div>

      <div className="prompt-section">
        <div className="prompt-section-heading">
          <div>
            <span>Prompt activity</span>
            <strong>Timing and token use for each prompt or steering message</strong>
          </div>
        </div>
        {thread.prompts.length === 0 ? (
          <div className="prompt-empty">Prompt-level events were not available in this rollout.</div>
        ) : (
          <div className="prompt-list">
            {thread.prompts.map((prompt) => <PromptRow key={prompt.promptId} prompt={prompt} />)}
          </div>
        )}
      </div>
    </div>
  );
}

export function ThreadsTable({ threads }: { threads: ThreadSummary[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(threads[0] ? [threads[0].threadId] : [])
  );
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ThreadFilter>('all');
  const [sort, setSort] = useState<ThreadSort>('recent');

  const visibleThreads = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = threads.filter((thread) => {
      const matchesQuery = !normalizedQuery || [
        thread.title,
        thread.projectPath ?? '',
        projectName(thread.projectPath),
        thread.primaryModel
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
      if (!matchesQuery) return false;
      if (filter === 'over-limit') {
        return (thread.estimatedFiveHourUsagePercent ?? 0) > 100 ||
          (thread.estimatedSevenDayUsagePercent ?? 0) > 100;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sort === 'usage') return (primaryUsage(b) ?? -1) - (primaryUsage(a) ?? -1);
      if (sort === 'tokens') return b.totalTokens - a.totalTokens;
      if (sort === 'cost') return (b.estimatedApiCostUsd ?? -1) - (a.estimatedApiCostUsd ?? -1);
      return (b.updatedAt ?? b.startedAt ?? 0) - (a.updatedAt ?? a.startedAt ?? 0);
    });
  }, [filter, query, sort, threads]);

  const toggle = (threadId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  };

  return (
    <section className="threads-panel" id="chats" aria-labelledby="recent-chats-title">
      <div className="threads-heading">
        <div>
          <h2 id="recent-chats-title">Recent chats</h2>
          <p>Real chat names, quota estimates, and prompt-level detail.</p>
        </div>
        <div className="thread-toolbar">
          <label className="search-control">
            <Search size={16} />
            <span className="sr-only">Search chats or projects</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search chats or projects"
            />
          </label>
          <div className="filter-control" aria-label="Filter chats">
            {([
              ['all', 'All'],
              ['over-limit', 'Over limit']
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={filter === value ? 'active' : ''}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="sort-control">
            <SlidersHorizontal size={15} />
            <span className="sr-only">Sort chats</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as ThreadSort)}>
              <option value="recent">Recent</option>
              <option value="usage">Quota impact</option>
              <option value="tokens">Tokens</option>
              <option value="cost">API equivalent</option>
            </select>
          </label>
        </div>
      </div>

      {threads.length === 0 ? (
        <div className="table-empty">No chat usage has been indexed.</div>
      ) : visibleThreads.length === 0 ? (
        <div className="table-empty">No chats match this search and filter.</div>
      ) : (
        <div className="chat-list">
          <div className="chat-list-header" aria-hidden="true">
            <span />
            <span>Chat</span>
            <span>Project</span>
            <span>Model</span>
            <span>5h impact</span>
            <span>7d impact</span>
            <span>Tokens</span>
            <span>API equivalent</span>
            <span>Last activity</span>
          </div>
          {visibleThreads.map((thread) => {
            const isExpanded = expanded.has(thread.threadId);
            const fiveHourUsage = thread.estimatedFiveHourUsagePercent;
            const sevenDayUsage = thread.estimatedSevenDayUsagePercent;
            return (
              <article
                className={`chat-item ${isExpanded ? 'expanded' : ''}`}
                key={thread.threadId}
              >
                <button
                  type="button"
                  className="chat-summary"
                  aria-expanded={isExpanded}
                  aria-controls={`detail-${thread.threadId}`}
                  onClick={() => toggle(thread.threadId)}
                >
                  <span className="chat-chevron">
                    {isExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                  </span>
                  <span className="chat-main">
                    <span className="chat-title-line">
                      <strong>{thread.title}</strong>
                    </span>
                    <span className="chat-mobile-meta">
                      {projectName(thread.projectPath)} · {thread.primaryModel}
                    </span>
                  </span>
                  <span className="chat-project" title={thread.projectPath ?? undefined}>
                    <FolderOpen size={13} /> {projectName(thread.projectPath)}
                  </span>
                  <span className="chat-model"><i className="model-label">{thread.primaryModel}</i></span>
                  <span className={`chat-usage chat-usage-five ${(fiveHourUsage ?? 0) > 100 ? 'over-limit' : ''}`}>
                    <strong>{formatUsage(fiveHourUsage)}</strong>
                    <small>{estimateNote(fiveHourUsage, '5h')}</small>
                  </span>
                  <span className={`chat-usage chat-usage-seven ${(sevenDayUsage ?? 0) > 100 ? 'over-limit' : ''}`}>
                    <strong>{formatUsage(sevenDayUsage)}</strong>
                    <small>{estimateNote(sevenDayUsage, '7d')}</small>
                  </span>
                  <span className="chat-tokens">
                    <strong>{compact(thread.totalTokens)}</strong>
                    <small>{compact(thread.outputTokens)} output</small>
                  </span>
                  <span className="chat-cost">
                    <strong>
                      {thread.estimatedApiCostUsd === null ? 'Unknown' : `$${thread.estimatedApiCostUsd.toFixed(2)}`}
                    </strong>
                    <small className={`pricing-state ${thread.pricingStatus}`}>
                      <CircleDollarSign size={11} />
                      {thread.pricingStatus === 'exact-model-match'
                        ? 'Matched'
                        : thread.pricingStatus === 'partial'
                          ? 'Partial'
                          : 'No price'}
                    </small>
                  </span>
                  <span className="chat-activity">{formatTime(thread.updatedAt)}</span>
                </button>
                {isExpanded ? (
                  <div id={`detail-${thread.threadId}`}>
                    <ExpandedThread thread={thread} />
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
