import React from 'react';
import {
  Card,
  PluginRem,
  renderWidget,
  usePlugin,
  useRunAsync,
  useTrackerPlugin,
} from '@remnote/plugin-sdk';

type Status = 'No data' | 'Critical' | 'Weak' | 'Developing' | 'Strong' | 'Mastered';

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
  status: Status;
};

type CategoryRow = ReviewStats & {
  id: string;
  name: string;
  childCount: number;
};

type HardCardRow = {
  cardId: string;
  remId: string;
  question: string;
  reviews: number;
  forgot: number;
  hard: number;
  good: number;
  easy: number;
  retention: number;
  recentRetention: number | null;
  averageSeconds: number | null;
  lastReviewed: number | null;
};

type Breadcrumb = { id: string; name: string };

const DAY_MS = 86_400_000;

function validRepetitions(card: Card) {
  return (card.repetitionHistory || []).filter((rep) => rep.score !== 0.01);
}

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
    for (const repetition of validRepetitions(card)) {
      const score = repetition.score;
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

  const baseRetention = lifetimeRetention === null
    ? null
    : 0.65 * (recentRetention ?? lifetimeRetention) + 0.35 * lifetimeRetention;
  const confidence = Math.min(1, reviews / 20);
  const mastery = baseRetention === null ? null : baseRetention * (0.75 + 0.25 * confidence);

  let status: Status = 'No data';
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
  const groups = await Promise.all(rems.map((item) => item.getCards()));
  return groups.flat().filter((card): card is Card => Boolean(card));
}

async function remName(plugin: ReturnType<typeof usePlugin>, rem: PluginRem): Promise<string> {
  if (!rem.text) return 'Untitled';
  return (await plugin.richText.toString(rem.text)) || 'Untitled';
}

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

function formatSeconds(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}s`;
}

function formatDate(value: number | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

function scoreClass(status: Status) {
  return `status status-${status.toLowerCase().replace(' ', '-')}`;
}

export function AnalyticsDashboard() {
  const plugin = usePlugin();
  const [recentDays, setRecentDays] = React.useState(30);
  const [minimumReviews, setMinimumReviews] = React.useState(0);
  const [cardMinimumReviews, setCardMinimumReviews] = React.useState(3);
  const [sortMode, setSortMode] = React.useState<'weakest' | 'strongest' | 'reviews'>('weakest');
  const [selectedRemId, setSelectedRemId] = React.useState<string | undefined>();
  const [breadcrumbs, setBreadcrumbs] = React.useState<Breadcrumb[]>([]);
  const [activeTab, setActiveTab] = React.useState<'sections' | 'cards'>('sections');

  const context = useTrackerPlugin(
    async (reactivePlugin) =>
      reactivePlugin.storage.getSession<{ focusedRemId?: string }>('crna-analytics-context'),
    [],
  );

  React.useEffect(() => {
    if (context?.focusedRemId) {
      setSelectedRemId(context.focusedRemId);
      setBreadcrumbs([]);
    }
  }, [context?.focusedRemId]);

  const rootRem = useRunAsync(async () => {
    if (!selectedRemId) return undefined;
    return plugin.rem.findOne(selectedRemId);
  }, [selectedRemId]);

  const rootName = useRunAsync(async () => {
    if (!rootRem) return 'Selected Rem';
    return remName(plugin, rootRem);
  }, [rootRem]);

  React.useEffect(() => {
    if (rootRem && rootName && breadcrumbs.length === 0) {
      setBreadcrumbs([{ id: rootRem._id, name: rootName }]);
    }
  }, [rootRem, rootName, breadcrumbs.length]);

  const allCards = useRunAsync(async () => {
    if (!rootRem) return [];
    return cardsBelow(rootRem);
  }, [rootRem]);

  const overall = React.useMemo(
    () => summarize(allCards || [], recentDays),
    [allCards, recentDays],
  );

  const rows = useRunAsync(async (): Promise<CategoryRow[]> => {
    if (!rootRem) return [];
    const children = await rootRem.getChildrenRem();
    return Promise.all(
      children.map(async (category) => {
        const [cards, name, grandchildren] = await Promise.all([
          cardsBelow(category),
          remName(plugin, category),
          category.getChildrenRem(),
        ]);
        return {
          id: category._id,
          name,
          childCount: grandchildren.length,
          ...summarize(cards, recentDays),
        };
      }),
    );
  }, [rootRem, recentDays]);

  const hardestCards = useRunAsync(async (): Promise<HardCardRow[]> => {
    const cards = allCards || [];
    const cutoff = Date.now() - recentDays * DAY_MS;
    const results = await Promise.all(cards.map(async (card) => {
      const history = validRepetitions(card);
      if (history.length < cardMinimumReviews) return null;

      let forgot = 0;
      let hard = 0;
      let good = 0;
      let easy = 0;
      let recentReviews = 0;
      let recentRemembered = 0;
      let totalResponseMs = 0;
      let timedReviews = 0;
      let lastReviewed: number | null = null;

      for (const repetition of history) {
        if (repetition.score === 0) forgot += 1;
        else if (repetition.score === 0.5) hard += 1;
        else if (repetition.score === 1) good += 1;
        else if (repetition.score === 1.5) easy += 1;

        if (!lastReviewed || repetition.date > lastReviewed) lastReviewed = repetition.date;
        if (repetition.date >= cutoff) {
          recentReviews += 1;
          if (repetition.score !== 0) recentRemembered += 1;
        }
        const responseTime = (repetition as { responseTime?: number }).responseTime;
        if (typeof responseTime === 'number' && responseTime > 0 && responseTime < 600_000) {
          totalResponseMs += responseTime;
          timedReviews += 1;
        }
      }

      const rem = await plugin.rem.findOne(card.remId);
      const question = rem ? await remName(plugin, rem) : '(Card source not found)';
      const remembered = hard + good + easy;
      const reviews = forgot + remembered;
      return {
        cardId: card._id,
        remId: card.remId,
        question,
        reviews,
        forgot,
        hard,
        good,
        easy,
        retention: reviews ? (remembered / reviews) * 100 : 0,
        recentRetention: recentReviews ? (recentRemembered / recentReviews) * 100 : null,
        averageSeconds: timedReviews ? totalResponseMs / timedReviews / 1000 : null,
        lastReviewed,
      };
    }));

    return results
      .filter((row): row is HardCardRow => Boolean(row))
      .sort((a, b) => {
        if (a.retention !== b.retention) return a.retention - b.retention;
        if (a.forgot !== b.forgot) return b.forgot - a.forgot;
        return b.reviews - a.reviews;
      });
  }, [allCards, recentDays, cardMinimumReviews]);

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

  const drillInto = async (row: CategoryRow) => {
    setSelectedRemId(row.id);
    setBreadcrumbs((current) => [...current, { id: row.id, name: row.name }]);
    setActiveTab('sections');
  };

  const jumpToBreadcrumb = (crumb: Breadcrumb, index: number) => {
    setSelectedRemId(crumb.id);
    setBreadcrumbs((current) => current.slice(0, index + 1));
  };

  const openRem = async (remId: string) => {
    const rem = await plugin.rem.findOne(remId);
    if (rem) await plugin.window.openRem(rem);
  };

  const responseTotal = overall.forgot + overall.hard + overall.good + overall.easy;
  const responsePercent = (value: number) => responseTotal ? (value / responseTotal) * 100 : 0;

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">CRNA PERFORMANCE ANALYTICS</p>
          <h1>{rootName || 'Loading…'}</h1>
          <nav className="breadcrumbs" aria-label="Analytics location">
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={crumb.id}>
                {index > 0 && <span>›</span>}
                <button onClick={() => jumpToBreadcrumb(crumb, index)}>{crumb.name}</button>
              </React.Fragment>
            ))}
          </nav>
          <p className="subtitle">
            Anki-style statistics for every folder, section, document, and individual flashcard
            nested under the selected Rem.
          </p>
        </div>
        <div className="summary-card">
          <span>Current mastery</span>
          <strong>{formatPercent(overall.mastery)}</strong>
          <span className={scoreClass(overall.status)}>{overall.status}</span>
        </div>
      </header>

      <section className="metric-grid">
        <article><span>Retention</span><strong>{formatPercent(overall.lifetimeRetention)}</strong><small>Lifetime</small></article>
        <article><span>Recent retention</span><strong>{formatPercent(overall.recentRetention)}</strong><small>Last {recentDays} days</small></article>
        <article><span>Reviews</span><strong>{overall.reviews}</strong><small>{overall.cards} cards</small></article>
        <article><span>Average time</span><strong>{formatSeconds(overall.averageSeconds)}</strong><small>Per answer</small></article>
      </section>

      <section className="answer-distribution" aria-label="Answer button distribution">
        <div><span>Again</span><strong>{overall.forgot}</strong><div className="bar"><i style={{ width: `${responsePercent(overall.forgot)}%` }} /></div></div>
        <div><span>Hard</span><strong>{overall.hard}</strong><div className="bar"><i style={{ width: `${responsePercent(overall.hard)}%` }} /></div></div>
        <div><span>Good</span><strong>{overall.good}</strong><div className="bar"><i style={{ width: `${responsePercent(overall.good)}%` }} /></div></div>
        <div><span>Easy</span><strong>{overall.easy}</strong><div className="bar"><i style={{ width: `${responsePercent(overall.easy)}%` }} /></div></div>
      </section>

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
        {activeTab === 'sections' ? (
          <>
            <label>
              Minimum reviews
              <select value={minimumReviews} onChange={(event) => setMinimumReviews(Number(event.target.value))}>
                <option value={0}>Show all</option>
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
              </select>
            </label>
            <label>
              Sort
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as typeof sortMode)}>
                <option value="weakest">Weakest first</option>
                <option value="strongest">Strongest first</option>
                <option value="reviews">Most reviewed</option>
              </select>
            </label>
          </>
        ) : (
          <label>
            Minimum card reviews
            <select value={cardMinimumReviews} onChange={(event) => setCardMinimumReviews(Number(event.target.value))}>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={5}>5</option>
              <option value={10}>10</option>
            </select>
          </label>
        )}
      </section>

      <div className="tabs" role="tablist">
        <button className={activeTab === 'sections' ? 'active' : ''} onClick={() => setActiveTab('sections')}>Folders & documents</button>
        <button className={activeTab === 'cards' ? 'active' : ''} onClick={() => setActiveTab('cards')}>Hardest questions</button>
      </div>

      {!rootRem && (
        <section className="empty-state">
          Focus a course, module, folder, section, or document, then run “Open CRNA Performance Analytics.”
        </section>
      )}

      {rootRem && activeTab === 'sections' && visibleRows.length === 0 && (
        <section className="empty-state">
          This level has no child folders or documents. Open “Hardest questions” to inspect its individual cards.
        </section>
      )}

      {activeTab === 'sections' && visibleRows.length > 0 && (
        <section className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Folder / section / document</th>
                <th>Mastery</th>
                <th>Status</th>
                <th>Lifetime</th>
                <th>Recent</th>
                <th>Reviews</th>
                <th>Again</th>
                <th>Hard</th>
                <th>Avg. time</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <button className="category-link" onClick={() => drillInto(row)}>{row.name}</button>
                    <small>{row.cards} cards · {row.childCount} nested items</small>
                  </td>
                  <td>
                    <strong>{formatPercent(row.mastery)}</strong>
                    <div className="mastery-track"><div style={{ width: `${Math.max(0, Math.min(100, row.mastery || 0))}%` }} /></div>
                  </td>
                  <td><span className={scoreClass(row.status)}>{row.status}</span></td>
                  <td>{formatPercent(row.lifetimeRetention)}</td>
                  <td>{formatPercent(row.recentRetention)}</td>
                  <td>{row.reviews}</td>
                  <td>{row.forgot}</td>
                  <td>{row.hard}</td>
                  <td>{formatSeconds(row.averageSeconds)}</td>
                  <td><button className="open-button" onClick={() => openRem(row.id)}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {activeTab === 'cards' && (
        <section className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Question / flashcard Rem</th>
                <th>Retention</th>
                <th>Recent</th>
                <th>Reviews</th>
                <th>Again</th>
                <th>Hard</th>
                <th>Good</th>
                <th>Easy</th>
                <th>Avg. time</th>
                <th>Last reviewed</th>
              </tr>
            </thead>
            <tbody>
              {(hardestCards || []).map((card) => (
                <tr key={card.cardId}>
                  <td>
                    <button className="question-link" onClick={() => openRem(card.remId)}>{card.question}</button>
                    <small>Click to open the exact Rem</small>
                  </td>
                  <td><strong>{formatPercent(card.retention)}</strong></td>
                  <td>{formatPercent(card.recentRetention)}</td>
                  <td>{card.reviews}</td>
                  <td>{card.forgot}</td>
                  <td>{card.hard}</td>
                  <td>{card.good}</td>
                  <td>{card.easy}</td>
                  <td>{formatSeconds(card.averageSeconds)}</td>
                  <td>{formatDate(card.lastReviewed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(hardestCards || []).length === 0 && (
            <div className="empty-inline">No cards have reached the selected minimum review count.</div>
          )}
        </section>
      )}

      <footer>
        Mastery is a study-priority estimate based on recent retention, lifetime retention, and review volume. It is not a predicted examination grade.
      </footer>
    </main>
  );
}

renderWidget(AnalyticsDashboard);
