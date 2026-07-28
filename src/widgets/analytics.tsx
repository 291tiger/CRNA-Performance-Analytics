import React from 'react';
import {
  Card,
  PluginRem,
  renderWidget,
  usePlugin,
  useRunAsync,
  useTrackerPlugin,
} from '@remnote/plugin-sdk';

type ReviewStats = {
  cards: number;
  reviews: number;
  forgot: number;
  hard: number;
  good: number;
  easy: number;
  lifetimeRetention: number | null;
  recentRetention: number | null;
  averageSeconds: number | null;
  mastery: number | null;
  status: 'No data' | 'Critical' | 'Weak' | 'Developing' | 'Strong' | 'Mastered';
};

type CategoryRow = ReviewStats & {
  id: string;
  name: string;
};

const DAY_MS = 86_400_000;

function summarize(cards: Card[], recentDays: number): ReviewStats {
  const cutoff = Date.now() - recentDays * DAY_MS;
  let reviews = 0;
  let forgot = 0;
  let hard = 0;
  let good = 0;
  let easy = 0;
  let recentReviews = 0;
  let recentRemembered = 0;
  let totalResponseMs = 0;
  let timedReviews = 0;

  for (const card of cards) {
    for (const repetition of card.repetitionHistory || []) {
      const score = repetition.score;
      if (score === 0.01) continue;

      reviews += 1;
      if (score === 0) forgot += 1;
      else if (score === 0.5) hard += 1;
      else if (score === 1) good += 1;
      else if (score === 1.5) easy += 1;

      if (repetition.date >= cutoff) {
        recentReviews += 1;
        if (score === 0.5 || score === 1 || score === 1.5) recentRemembered += 1;
      }

      const responseTime = (repetition as { responseTime?: number }).responseTime;
      if (typeof responseTime === 'number' && responseTime > 0 && responseTime < 600_000) {
        totalResponseMs += responseTime;
        timedReviews += 1;
      }
    }
  }

  const remembered = hard + good + easy;
  const lifetimeRetention = reviews ? (remembered / reviews) * 100 : null;
  const recentRetention = recentReviews ? (recentRemembered / recentReviews) * 100 : null;
  const averageSeconds = timedReviews ? totalResponseMs / timedReviews / 1000 : null;

  // Recent performance receives more weight, while low review volume reduces confidence.
  const baseRetention = lifetimeRetention === null
    ? null
    : 0.65 * (recentRetention ?? lifetimeRetention) + 0.35 * lifetimeRetention;
  const confidence = Math.min(1, reviews / 20);
  const mastery = baseRetention === null ? null : baseRetention * (0.75 + 0.25 * confidence);

  let status: ReviewStats['status'] = 'No data';
  if (reviews >= 5 && mastery !== null) {
    if (mastery < 60) status = 'Critical';
    else if (mastery < 75) status = 'Weak';
    else if (mastery < 85) status = 'Developing';
    else if (mastery < 93) status = 'Strong';
    else status = 'Mastered';
  }

  return {
    cards: cards.length,
    reviews,
    forgot,
    hard,
    good,
    easy,
    lifetimeRetention,
    recentRetention,
    averageSeconds,
    mastery,
    status,
  };
}

async function cardsBelow(rem: PluginRem): Promise<Card[]> {
  const descendants = await rem.getDescendants();
  const rems = [rem, ...descendants];
  const cardGroups = await Promise.all(rems.map((item) => item.getCards()));
  return cardGroups.flat().filter((card): card is Card => Boolean(card));
}

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

function formatSeconds(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}s`;
}

export function AnalyticsDashboard() {
  const plugin = usePlugin();
  const [recentDays, setRecentDays] = React.useState(30);
  const [minimumReviews, setMinimumReviews] = React.useState(0);
  const [sortMode, setSortMode] = React.useState<'weakest' | 'strongest' | 'reviews'>('weakest');

  const context = useTrackerPlugin(
    async (reactivePlugin) =>
      reactivePlugin.storage.getSession<{ focusedRemId?: string }>('crna-analytics-context'),
    [],
  );

  const rootRem = useRunAsync(async () => {
    if (!context?.focusedRemId) return undefined;
    return plugin.rem.findOne(context.focusedRemId);
  }, [context?.focusedRemId]);

  const rootName = useRunAsync(async () => {
    if (!rootRem?.text) return 'Selected Rem';
    return (await plugin.richText.toString(rootRem.text)) || 'Selected Rem';
  }, [rootRem]);

  const rows = useRunAsync(async (): Promise<CategoryRow[]> => {
    if (!rootRem) return [];
    const children = await rootRem.getChildrenRem();
    const categories = children.length ? children : [rootRem];

    return Promise.all(
      categories.map(async (category) => {
        const [cards, name] = await Promise.all([
          cardsBelow(category),
          category.text ? plugin.richText.toString(category.text) : Promise.resolve('Untitled category'),
        ]);
        return {
          id: category._id,
          name: name || 'Untitled category',
          ...summarize(cards, recentDays),
        };
      }),
    );
  }, [rootRem, recentDays]);

  const visibleRows = React.useMemo(() => {
    const filtered = (rows || []).filter((row) => row.reviews >= minimumReviews);
    return [...filtered].sort((a, b) => {
      if (sortMode === 'reviews') return b.reviews - a.reviews;
      const missing = sortMode === 'weakest' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
      const aValue = a.mastery ?? missing;
      const bValue = b.mastery ?? missing;
      return sortMode === 'weakest' ? aValue - bValue : bValue - aValue;
    });
  }, [rows, minimumReviews, sortMode]);

  const overallRetention = React.useMemo(() => {
    const reviewed = (rows || []).filter((row) => row.reviews > 0 && row.lifetimeRetention !== null);
    const totalReviews = reviewed.reduce((sum, row) => sum + row.reviews, 0);
    if (!totalReviews) return null;
    return reviewed.reduce(
      (sum, row) => sum + (row.lifetimeRetention || 0) * row.reviews,
      0,
    ) / totalReviews;
  }, [rows]);

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">CRNA PERFORMANCE ANALYTICS</p>
          <h1>{rootName || 'Loading…'}</h1>
          <p className="subtitle">
            Direct child Rems are treated as categories. Use the same structure for lectures,
            topics, drug classes, mechanisms, or clinical concepts.
          </p>
        </div>
        <div className="summary-card">
          <span>Overall retention</span>
          <strong>{formatPercent(overallRetention)}</strong>
        </div>
      </header>

      <section className="controls" aria-label="Analytics controls">
        <label>
          Recent window
          <select value={recentDays} onChange={(event) => setRecentDays(Number(event.target.value))}>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
        </label>
        <label>
          Minimum reviews
          <select
            value={minimumReviews}
            onChange={(event) => setMinimumReviews(Number(event.target.value))}
          >
            <option value={0}>Show all</option>
            <option value={3}>3</option>
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
          </select>
        </label>
        <label>
          Sort
          <select
            value={sortMode}
            onChange={(event) =>
              setSortMode(event.target.value as 'weakest' | 'strongest' | 'reviews')
            }
          >
            <option value="weakest">Weakest first</option>
            <option value="strongest">Strongest first</option>
            <option value="reviews">Most reviewed</option>
          </select>
        </label>
      </section>

      {!rootRem && (
        <section className="empty-state">
          Click a lecture, course, topic, or drug-class Rem, then run “Open CRNA Performance
          Analytics” from the command menu.
        </section>
      )}

      {rootRem && visibleRows.length === 0 && (
        <section className="empty-state">No categories meet the selected review threshold.</section>
      )}

      {visibleRows.length > 0 && (
        <section className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Mastery</th>
                <th>Status</th>
                <th>Lifetime</th>
                <th>Recent</th>
                <th>Reviews</th>
                <th>Forgot</th>
                <th>Hard</th>
                <th>Avg. time</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <button
                      className="category-link"
                      onClick={async () => {
                        const rem = await plugin.rem.findOne(row.id);
                        await rem?.openRemAsPage();
                      }}
                    >
                      {row.name}
                    </button>
                    <small>{row.cards} cards</small>
                  </td>
                  <td>
                    <strong>{formatPercent(row.mastery)}</strong>
                    <div className="mastery-track" aria-hidden="true">
                      <div style={{ width: `${Math.max(0, Math.min(100, row.mastery || 0))}%` }} />
                    </div>
                  </td>
                  <td>
                    <span className={`status status-${row.status.toLowerCase().replace(' ', '-')}`}>
                      {row.status}
                    </span>
                  </td>
                  <td>{formatPercent(row.lifetimeRetention)}</td>
                  <td>{formatPercent(row.recentRetention)}</td>
                  <td>{row.reviews}</td>
                  <td>{row.forgot}</td>
                  <td>{row.hard}</td>
                  <td>{formatSeconds(row.averageSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <footer>
        Mastery is a study-priority estimate based on recent retention, lifetime retention, and
        review volume. It is not a predicted examination grade.
      </footer>
    </main>
  );
}

renderWidget(AnalyticsDashboard);
