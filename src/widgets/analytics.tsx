import React from 'react';
import {
  Card,
  PluginRem,
  RNPPlugin,
  renderWidget,
  usePlugin,
  useRunAsync,
  useTrackerPlugin,
} from '@remnote/plugin-sdk';
import {
  AggregateStats,
  CardAnalysis,
  DAY_MS,
  PeriodStats,
  Stability,
  Status,
  aggregateCards,
  analyzeCard,
  buildMonthlySeries,
  buildStudyPlan,
  buildWeeklySeries,
} from './analytics-engine';
import { ANALYTICS_CONTEXT_KEY, AnalyticsContext, LAST_SCOPE_KEY } from './widget-utils';

type Tab = 'overview' | 'topics' | 'questions' | 'study' | 'progress';
type TopicSort = 'readiness' | 'weakest' | 'coverage' | 'reviews' | 'again' | 'forgotten';
type QuestionSort = 'priority' | 'mastery' | 'again' | 'evidence' | 'recent';
type QuestionFilter = 'all' | 'missed' | 'repeat' | 'hard' | 'volatile' | 'unseen' | 'overdue' | 'low-evidence';

type Breadcrumb = { id: string; name: string };

type AnalyticsSnapshot = {
  timestamp: number;
  mastery: number | null;
  readiness: number | null;
  confidence: number;
  coverage: number;
  reviews: number;
  again: number;
  hard: number;
  reviewedCards: number;
};

const SNAPSHOT_KEY_PREFIX = 'crna-analytics-snapshots';

type SectionRow = {
  id: string;
  name: string;
  childCount: number;
  stats: AggregateStats;
  cards: CardAnalysis[];
  structuredLabel: boolean;
};

const EMPTY_STATS: AggregateStats = {
  cards: 0,
  reviewedCards: 0,
  matureCards: 0,
  spacedCards: 0,
  deepEvidenceCards: 0,
  lowEvidenceCards: 0,
  neverReviewedCards: 0,
  overdueCards: 0,
  forgottenCards: 0,
  volatileCards: 0,
  stableCards: 0,
  reviews: 0,
  again: 0,
  hard: 0,
  good: 0,
  easy: 0,
  uniqueAgainCards: 0,
  uniqueHardCards: 0,
  retention: null,
  adjustedRetention: null,
  recentRetention: null,
  recentReviews: 0,
  averageSeconds: null,
  reviewsPerCard: 0,
  mastery: null,
  confidence: 0,
  coverage: 0,
  readiness: null,
  status: 'No data',
  trend: 'No baseline',
  trendDelta: null,
  reviewDistribution: { unseen: 0, once: 0, twoToFour: 0, fiveToNine: 0, tenPlus: 0 },
};

async function cardsBelow(rem: PluginRem): Promise<Card[]> {
  const descendants = await rem.getDescendants();
  const rems = [rem, ...descendants];
  const groups = await Promise.all(rems.map((item) => item.getCards()));
  return groups.flat().filter((card): card is Card => Boolean(card));
}

async function remName(plugin: RNPPlugin, rem: PluginRem): Promise<string> {
  if (!rem.text) return 'Untitled';
  return (await plugin.richText.toString(rem.text)) || 'Untitled';
}

async function analyzeCardsWithNames(
  plugin: RNPPlugin,
  cards: Card[],
  recentDays: number,
): Promise<CardAnalysis[]> {
  const nameCache = new Map<string, Promise<string>>();

  const getName = (remId: string) => {
    if (!nameCache.has(remId)) {
      nameCache.set(remId, (async () => {
        const rem = await plugin.rem.findOne(remId);
        return rem ? remName(plugin, rem) : '(Card source not found)';
      })());
    }
    return nameCache.get(remId) as Promise<string>;
  };

  return Promise.all(cards.map(async (card) => analyzeCard(card, await getName(card.remId), recentDays)));
}

function formatPercent(value: number | null, digits = 0): string {
  return value === null || Number.isNaN(value) ? '—' : `${value.toFixed(digits)}%`;
}

function formatNumber(value: number, digits = 1): string {
  return value.toFixed(digits).replace(/\.0$/, '');
}

function formatSeconds(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}s`;
}

function formatDate(value: number | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

function formatDays(value: number | null): string {
  if (value === null) return 'Never';
  if (value < 1) return 'Today';
  if (value < 2) return '1 day';
  return `${Math.floor(value)} days`;
}

function formatDelta(value: number | null): string {
  if (value === null) return 'No baseline';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)} points`;
}

function formatMinutes(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

function statusClass(status: Status) {
  return `pill status-${status.toLowerCase().replace(' ', '-')}`;
}

function stabilityClass(stability: Stability) {
  return `pill stability-${stability.toLowerCase()}`;
}

function trendClass(trend: AggregateStats['trend']) {
  return `trend trend-${trend.toLowerCase().replace(' ', '-')}`;
}

function MetricCard(props: {
  label: string;
  value: string;
  detail: string;
  tone?: 'default' | 'primary' | 'warning';
  help?: string;
}) {
  return (
    <article className={`metric-card metric-${props.tone || 'default'}`} title={props.help}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <small>{props.detail}</small>
    </article>
  );
}

function MiniProgress(props: { value: number | null; label?: string }) {
  const value = props.value === null ? 0 : Math.max(0, Math.min(100, props.value));
  return (
    <div className="mini-progress" aria-label={props.label}>
      <div style={{ width: `${value}%` }} />
    </div>
  );
}

function EmptyState(props: { children: React.ReactNode }) {
  return <section className="empty-state">{props.children}</section>;
}

function EvidenceDistribution(props: { stats: AggregateStats }) {
  const entries = [
    ['Never reviewed', props.stats.reviewDistribution.unseen],
    ['Reviewed once', props.stats.reviewDistribution.once],
    ['2 to 4 reviews', props.stats.reviewDistribution.twoToFour],
    ['5 to 9 reviews', props.stats.reviewDistribution.fiveToNine],
    ['10+ reviews', props.stats.reviewDistribution.tenPlus],
  ] as const;
  const maximum = Math.max(1, ...entries.map((entry) => entry[1]));

  return (
    <div className="evidence-bars">
      {entries.map(([label, value]) => (
        <div className="evidence-row" key={label}>
          <span>{label}</span>
          <div className="evidence-track"><i style={{ width: `${(value / maximum) * 100}%` }} /></div>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function PeriodChart(props: { periods: PeriodStats[] }) {
  const maximum = Math.max(1, ...props.periods.map((period) => period.reviews));
  return (
    <div className="period-chart" aria-label="Review activity over time">
      {props.periods.map((period) => (
        <div className="period-column" key={period.key} title={`${period.label}: ${period.reviews} reviews, ${formatPercent(period.retention)}`}>
          <div className="period-value">{period.reviews || ''}</div>
          <div className="period-bar-area">
            <i style={{ height: `${Math.max(period.reviews ? 5 : 0, (period.reviews / maximum) * 100)}%` }} />
          </div>
          <small>{period.label}</small>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsDashboard() {
  const plugin = usePlugin();
  const [recentDays, setRecentDays] = React.useState(30);
  const [selectedRemId, setSelectedRemId] = React.useState<string | undefined>();
  const [focusCardId, setFocusCardId] = React.useState<string | undefined>();
  const [breadcrumbs, setBreadcrumbs] = React.useState<Breadcrumb[]>([]);
  const [activeTab, setActiveTab] = React.useState<Tab>('overview');
  const [topicSort, setTopicSort] = React.useState<TopicSort>('weakest');
  const [questionSort, setQuestionSort] = React.useState<QuestionSort>('priority');
  const [questionFilter, setQuestionFilter] = React.useState<QuestionFilter>('all');
  const [questionSearch, setQuestionSearch] = React.useState('');
  const [studyMinutes, setStudyMinutes] = React.useState(60);
  const [reloadToken, setReloadToken] = React.useState(0);
  const [scopeSaved, setScopeSaved] = React.useState(false);
  const [previousSnapshot, setPreviousSnapshot] = React.useState<AnalyticsSnapshot | null>(null);

  const context = useTrackerPlugin(
    async (reactivePlugin) => reactivePlugin.storage.getSession<AnalyticsContext>(ANALYTICS_CONTEXT_KEY),
    [],
  );

  React.useEffect(() => {
    if (context?.focusedRemId) {
      setSelectedRemId(context.focusedRemId);
      setFocusCardId(context.focusCardId);
      setBreadcrumbs([]);
      setScopeSaved(false);
      if (context.focusCardId) {
        setActiveTab('questions');
        setQuestionFilter('all');
      }
    }
  }, [context?.focusedRemId, context?.focusCardId, context?.launchedAt]);

  const rootRem = useRunAsync(async () => {
    if (!selectedRemId) return undefined;
    return plugin.rem.findOne(selectedRemId);
  }, [selectedRemId, reloadToken]);

  const rootName = useRunAsync(async () => {
    if (!rootRem) return 'Selected Rem';
    return remName(plugin, rootRem);
  }, [rootRem, reloadToken]);

  React.useEffect(() => {
    if (rootRem && rootName && breadcrumbs.length === 0) {
      setBreadcrumbs([{ id: rootRem._id, name: rootName }]);
    }
  }, [rootRem, rootName, breadcrumbs.length]);

  const rawCards = useRunAsync(async () => {
    if (!rootRem) return [];
    return cardsBelow(rootRem);
  }, [rootRem, reloadToken]);

  const analyses = useRunAsync(async () => {
    if (!rawCards) return [];
    return analyzeCardsWithNames(plugin, rawCards, recentDays);
  }, [rawCards, recentDays, reloadToken]);

  const overall = React.useMemo(
    () => analyses ? aggregateCards(analyses, recentDays) : EMPTY_STATS,
    [analyses, recentDays],
  );

  React.useEffect(() => {
    let cancelled = false;

    const saveSnapshot = async () => {
      if (!selectedRemId || !analyses || overall.cards === 0) return;
      const key = `${SNAPSHOT_KEY_PREFIX}:${selectedRemId}`;
      const history = await plugin.storage.getLocal<AnalyticsSnapshot[]>(key) || [];
      const last = history.length ? history[history.length - 1] : null;
      const current: AnalyticsSnapshot = {
        timestamp: Date.now(),
        mastery: overall.mastery,
        readiness: overall.readiness,
        confidence: overall.confidence,
        coverage: overall.coverage,
        reviews: overall.reviews,
        again: overall.again,
        hard: overall.hard,
        reviewedCards: overall.reviewedCards,
      };

      const nearlyEqual = (a: number | null, b: number | null) => (
        a === null && b === null
      ) || (a !== null && b !== null && Math.abs(a - b) < 0.05);
      const sameAsLast = Boolean(last
        && last.reviews === current.reviews
        && last.again === current.again
        && last.hard === current.hard
        && last.reviewedCards === current.reviewedCards
        && nearlyEqual(last.mastery, current.mastery)
        && nearlyEqual(last.readiness, current.readiness)
        && Math.abs(last.coverage - current.coverage) < 0.05
        && Math.abs(last.confidence - current.confidence) < 0.05);

      if (!cancelled) {
        setPreviousSnapshot(sameAsLast && history.length > 1 ? history[history.length - 2] : last);
      }

      if (!sameAsLast || !last || Date.now() - last.timestamp > DAY_MS) {
        await plugin.storage.setLocal(key, [...history, current].slice(-120));
      }
    };

    saveSnapshot();
    return () => { cancelled = true; };
  }, [plugin, selectedRemId, analyses, overall.cards, overall.mastery, overall.readiness, overall.confidence, overall.coverage, overall.reviews, overall.again, overall.hard, overall.reviewedCards]);

  const sectionRows = useRunAsync(async (): Promise<SectionRow[]> => {
    if (!rootRem) return [];
    const children = await rootRem.getChildrenRem();
    return Promise.all(children.map(async (child) => {
      const [cards, name, grandchildren] = await Promise.all([
        cardsBelow(child),
        remName(plugin, child),
        child.getChildrenRem(),
      ]);
      const cardAnalyses = await analyzeCardsWithNames(plugin, cards, recentDays);
      return {
        id: child._id,
        name,
        childCount: grandchildren.length,
        stats: aggregateCards(cardAnalyses, recentDays),
        cards: cardAnalyses,
        structuredLabel: /(lecture|module|unit|week|chapter|slide|objective|topic)/i.test(name),
      };
    }));
  }, [rootRem, recentDays, reloadToken]);

  const sortedSections = React.useMemo(() => {
    const rows = [...(sectionRows || [])];
    rows.sort((a, b) => {
      if (topicSort === 'reviews') return b.stats.reviews - a.stats.reviews;
      if (topicSort === 'again') return b.stats.again - a.stats.again;
      if (topicSort === 'forgotten') return b.stats.forgottenCards - a.stats.forgottenCards;
      if (topicSort === 'coverage') return a.stats.coverage - b.stats.coverage;
      if (topicSort === 'readiness') return (b.stats.readiness ?? -1) - (a.stats.readiness ?? -1);
      return (a.stats.readiness ?? 101) - (b.stats.readiness ?? 101);
    });
    return rows;
  }, [sectionRows, topicSort]);

  const visibleQuestions = React.useMemo(() => {
    let cards = [...(analyses || [])];
    const query = questionSearch.trim().toLowerCase();
    if (query) cards = cards.filter((card) => card.question.toLowerCase().includes(query));

    cards = cards.filter((card) => {
      if (questionFilter === 'missed') return card.again > 0;
      if (questionFilter === 'repeat') return card.again >= 2 || card.timesWrongInRow > 0;
      if (questionFilter === 'hard') return card.hard > 0;
      if (questionFilter === 'volatile') return card.stability === 'Volatile';
      if (questionFilter === 'unseen') return card.reviews === 0;
      if (questionFilter === 'overdue') return card.overdue;
      if (questionFilter === 'low-evidence') return card.reviews > 0 && card.reviews < 3;
      return true;
    });

    cards.sort((a, b) => {
      if (focusCardId && a.cardId === focusCardId) return -1;
      if (focusCardId && b.cardId === focusCardId) return 1;
      if (questionSort === 'mastery') return (a.mastery ?? -1) - (b.mastery ?? -1);
      if (questionSort === 'again') return b.again - a.again || b.hard - a.hard;
      if (questionSort === 'evidence') return a.reviews - b.reviews;
      if (questionSort === 'recent') return (b.lastReviewed ?? 0) - (a.lastReviewed ?? 0);
      return b.priority - a.priority;
    });
    return cards;
  }, [analyses, questionFilter, questionSort, questionSearch, focusCardId]);

  const studyPlan = React.useMemo(
    () => buildStudyPlan(analyses || [], studyMinutes),
    [analyses, studyMinutes],
  );

  const weeklySeries = React.useMemo(() => buildWeeklySeries(analyses || []), [analyses]);
  const monthlySeries = React.useMemo(() => buildMonthlySeries(analyses || []), [analyses]);

  const openRem = async (remId: string) => {
    const rem = await plugin.rem.findOne(remId);
    if (rem) await plugin.window.openRem(rem);
  };

  const drillInto = (row: SectionRow) => {
    setSelectedRemId(row.id);
    setBreadcrumbs((current) => [...current, { id: row.id, name: row.name }]);
    setActiveTab('overview');
    setFocusCardId(undefined);
    setScopeSaved(false);
  };

  const jumpToBreadcrumb = (crumb: Breadcrumb, index: number) => {
    setSelectedRemId(crumb.id);
    setBreadcrumbs((current) => current.slice(0, index + 1));
    setActiveTab('overview');
    setFocusCardId(undefined);
    setScopeSaved(false);
  };

  const saveScope = async () => {
    if (!selectedRemId) return;
    await plugin.storage.setLocal(LAST_SCOPE_KEY, selectedRemId);
    setScopeSaved(true);
  };

  const totalResponses = overall.again + overall.hard + overall.good + overall.easy;
  const answerPercent = (value: number) => totalResponses ? (value / totalResponses) * 100 : 0;

  const weakestSections = React.useMemo(
    () => [...(sectionRows || [])]
      .filter((row) => row.stats.cards > 0)
      .sort((a, b) => (a.stats.readiness ?? 101) - (b.stats.readiness ?? 101))
      .slice(0, 5),
    [sectionRows],
  );

  const priorityCards = React.useMemo(
    () => [...(analyses || [])].sort((a, b) => b.priority - a.priority),
    [analyses],
  );

  const todayStart = React.useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }, [reloadToken]);

  const todayStats = React.useMemo(() => {
    const cards = analyses || [];
    const reviewedToday = cards.filter((card) => card.events.some((event) => event.date >= todayStart));
    const againCards = cards.filter((card) => card.events.some((event) => event.date >= todayStart && event.score < 0.1));
    const hardCards = cards.filter((card) => card.events.some((event) => event.date >= todayStart && event.score >= 0.1 && event.score < 0.75));
    const successfulCards = cards.filter((card) => card.events.some((event) => event.date >= todayStart && event.score >= 0.75));
    return {
      reviewed: reviewedToday.length,
      again: againCards.length,
      hard: hardCards.length,
      successful: successfulCards.length,
      problemCards: [...new Map([...againCards, ...hardCards].map((card) => [card.cardId, card])).values()]
        .sort((a, b) => b.priority - a.priority),
    };
  }, [analyses, todayStart]);

  const actionItems = React.useMemo(() => {
    const items: { title: string; detail: string; tab: Tab; filter?: QuestionFilter }[] = [];
    if (todayStats.again || todayStats.hard) {
      items.push({
        title: `Recheck ${todayStats.again + todayStats.hard} questions from today's difficult reviews`,
        detail: `${todayStats.again} had Again and ${todayStats.hard} had Hard at least once today.`,
        tab: 'questions',
        filter: todayStats.again ? 'missed' : 'hard',
      });
    }
    if (overall.neverReviewedCards) {
      items.push({
        title: `Cover ${overall.neverReviewedCards} unseen questions`,
        detail: 'These cards currently contribute no evidence to readiness.',
        tab: 'questions',
        filter: 'unseen',
      });
    }
    if (overall.overdueCards) {
      items.push({
        title: `Address ${overall.overdueCards} due or overdue questions`,
        detail: 'Prioritize overdue cards that are also fragile or volatile.',
        tab: 'questions',
        filter: 'overdue',
      });
    }
    if (weakestSections[0]) {
      items.push({
        title: `Focus on ${weakestSections[0].name}`,
        detail: `${formatPercent(weakestSections[0].stats.readiness)} readiness with ${formatPercent(weakestSections[0].stats.coverage)} coverage.`,
        tab: 'topics',
      });
    }
    if (!items.length && overall.lowEvidenceCards) {
      items.push({
        title: `Strengthen evidence on ${overall.lowEvidenceCards} questions`,
        detail: 'They have been reviewed, but fewer than three times.',
        tab: 'questions',
        filter: 'low-evidence',
      });
    }
    if (!items.length) {
      items.push({
        title: 'Continue scheduled maintenance',
        detail: 'No major coverage or lapse signal was detected in this scope.',
        tab: 'study',
      });
    }
    return items.slice(0, 4);
  }, [todayStats, overall, weakestSections]);

  const professorLens = React.useMemo(() => {
    const rows = (sectionRows || []).filter((row) => row.stats.cards > 0);
    const weakest = [...rows].sort((a, b) => (a.stats.readiness ?? 101) - (b.stats.readiness ?? 101))[0];
    const neglected = [...rows].sort((a, b) => a.stats.coverage - b.stats.coverage)[0];
    const repeatMisses = [...rows].sort((a, b) => {
      const aRate = a.stats.reviews ? a.stats.again / a.stats.reviews : 0;
      const bRate = b.stats.reviews ? b.stats.again / b.stats.reviews : 0;
      return bRate - aRate || b.stats.again - a.stats.again;
    })[0];
    const forgotten = [...rows].sort((a, b) => b.stats.forgottenCards - a.stats.forgottenCards)[0];
    const improving = [...rows]
      .filter((row) => row.stats.trendDelta !== null)
      .sort((a, b) => (b.stats.trendDelta || 0) - (a.stats.trendDelta || 0))[0];
    return {
      weakest,
      neglected,
      repeatMisses,
      forgotten,
      improving,
      structuredCount: rows.filter((row) => row.structuredLabel).length,
    };
  }, [sectionRows]);

  const changeTabFromAction = (item: typeof actionItems[number]) => {
    if (item.filter) setQuestionFilter(item.filter);
    setActiveTab(item.tab);
  };

  const totalPlanSeconds = studyPlan.reduce((sum, card) => sum + card.estimatedSeconds, 0);
  const masterySnapshotDelta = previousSnapshot && overall.mastery !== null && previousSnapshot.mastery !== null
    ? overall.mastery - previousSnapshot.mastery
    : null;
  const readinessSnapshotDelta = previousSnapshot && overall.readiness !== null && previousSnapshot.readiness !== null
    ? overall.readiness - previousSnapshot.readiness
    : null;
  const snapshotReviewDelta = previousSnapshot ? overall.reviews - previousSnapshot.reviews : null;
  const snapshotAgainDelta = previousSnapshot ? overall.again - previousSnapshot.again : null;
  const snapshotHardDelta = previousSnapshot ? overall.hard - previousSnapshot.hard : null;

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div className="header-copy">
          <p className="eyebrow">CRNA PERFORMANCE ANALYTICS 2.0</p>
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
            Reliable topic and question-level analytics based on coverage, spaced evidence, recent performance, and repeated misses.
          </p>
        </div>
        <div className="header-actions">
          <button className="secondary-button" onClick={saveScope} disabled={!selectedRemId}>
            {scopeSaved ? 'Review scope saved' : 'Use as review scope'}
          </button>
          <button className="secondary-button" onClick={() => setReloadToken((value) => value + 1)}>Refresh data</button>
        </div>
      </header>

      {!rootRem && (
        <EmptyState>
          Focus a course, lecture, topic, folder, or document, then click <strong>CRNA Analytics</strong> in the sidebar or run the command.
        </EmptyState>
      )}

      {rootRem && (
        <>
          <section className="metric-grid primary-metrics">
            <MetricCard
              label="Exam readiness"
              value={formatPercent(overall.readiness)}
              detail="Mastery adjusted for evidence and coverage"
              tone="primary"
              help="A study-readiness estimate, not a predicted examination grade."
            />
            <MetricCard
              label="Mastery"
              value={formatPercent(overall.mastery)}
              detail={`${overall.reviewedCards} of ${overall.cards} cards have evidence`}
              help="Equal-card average of evidence-weighted question mastery."
            />
            <MetricCard
              label="Confidence"
              value={formatPercent(overall.confidence)}
              detail={`${overall.matureCards} cards have 3+ reviews`}
              help="How strongly review depth and spacing support the mastery estimate."
            />
            <MetricCard
              label="Coverage"
              value={formatPercent(overall.coverage)}
              detail={`${overall.neverReviewedCards} unseen · ${overall.lowEvidenceCards} low evidence`}
              tone={overall.neverReviewedCards ? 'warning' : 'default'}
              help="How much of the scope has been reviewed and reinforced."
            />
          </section>

          <section className="evidence-strip">
            <div><span>Status</span><strong className={statusClass(overall.status)}>{overall.status}</strong></div>
            <div><span>Lifetime retention</span><strong>{formatPercent(overall.retention, 1)}</strong></div>
            <div><span>Bayesian retention</span><strong>{formatPercent(overall.adjustedRetention, 1)}</strong></div>
            <div><span>Recent retention</span><strong>{formatPercent(overall.recentRetention, 1)}</strong></div>
            <div><span>Total reviews</span><strong>{overall.reviews}</strong></div>
            <div><span>Reviews per card</span><strong>{formatNumber(overall.reviewsPerCard)}</strong></div>
            <div><span>Average answer time</span><strong>{formatSeconds(overall.averageSeconds)}</strong></div>
            <div><span>Trend</span><strong className={trendClass(overall.trend)}>{overall.trend}</strong><small>{formatDelta(overall.trendDelta)}</small></div>
          </section>

          <section className="toolbar">
            <div className="tabs" role="tablist" aria-label="Analytics views">
              {([
                ['overview', 'Overview'],
                ['topics', 'Topics / Lecture Lens'],
                ['questions', 'Questions'],
                ['study', 'Study Next'],
                ['progress', 'Progress'],
              ] as [Tab, string][]).map(([tab, label]) => (
                <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{label}</button>
              ))}
            </div>
            <label className="inline-control">
              Recent window
              <select value={recentDays} onChange={(event) => setRecentDays(Number(event.target.value))}>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
              </select>
            </label>
          </section>

          {activeTab === 'overview' && (
            <>
              <section className="section-grid overview-top-grid">
                <article className="panel action-panel">
                  <div className="panel-heading">
                    <div><p className="panel-kicker">ACTION ITEMS</p><h2>What to do next</h2></div>
                    <button className="text-button" onClick={() => setActiveTab('study')}>Open study plan</button>
                  </div>
                  <div className="action-list">
                    {actionItems.map((item, index) => (
                      <button key={`${item.title}-${index}`} onClick={() => changeTabFromAction(item)}>
                        <span className="action-number">{index + 1}</span>
                        <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                        <b>›</b>
                      </button>
                    ))}
                  </div>
                </article>

                <article className="panel">
                  <div className="panel-heading"><div><p className="panel-kicker">TODAY'S DRIVERS</p><h2>What is affecting the data</h2></div></div>
                  {previousSnapshot && (
                    <div className="snapshot-change">
                      <span>Since the prior saved snapshot</span>
                      <strong>{masterySnapshotDelta === null ? 'No mastery baseline' : `${masterySnapshotDelta > 0 ? '+' : ''}${masterySnapshotDelta.toFixed(1)} mastery points`}</strong>
                      <small>
                        {snapshotReviewDelta !== null ? `${snapshotReviewDelta >= 0 ? '+' : ''}${snapshotReviewDelta} reviews` : 'No review comparison'}
                        {snapshotAgainDelta !== null ? ` · ${snapshotAgainDelta >= 0 ? '+' : ''}${snapshotAgainDelta} Again` : ''}
                        {snapshotHardDelta !== null ? ` · ${snapshotHardDelta >= 0 ? '+' : ''}${snapshotHardDelta} Hard` : ''}
                      </small>
                    </div>
                  )}
                  <div className="driver-grid">
                    <div><strong>{todayStats.reviewed}</strong><span>Questions reviewed today</span></div>
                    <div><strong>{todayStats.again}</strong><span>Questions with Again today</span></div>
                    <div><strong>{todayStats.hard}</strong><span>Questions with Hard today</span></div>
                    <div><strong>{overall.overdueCards}</strong><span>Due or overdue now</span></div>
                  </div>
                  {todayStats.problemCards[0] ? (
                    <button className="problem-callout" onClick={() => openRem(todayStats.problemCards[0].remId)}>
                      <span>Highest-priority issue today</span>
                      <strong>{todayStats.problemCards[0].question}</strong>
                      <small>{todayStats.problemCards[0].reasons.join(' · ')}</small>
                    </button>
                  ) : (
                    <p className="muted-copy">No Again or Hard response has been recorded today in this scope.</p>
                  )}
                </article>
              </section>

              <section className="section-grid">
                <article className="panel">
                  <div className="panel-heading"><div><p className="panel-kicker">ANSWER PATTERN</p><h2>Again and Hard analysis</h2></div></div>
                  <div className="answer-distribution">
                    {[
                      ['Again', overall.again, overall.uniqueAgainCards],
                      ['Hard', overall.hard, overall.uniqueHardCards],
                      ['Good', overall.good, null],
                      ['Easy', overall.easy, null],
                    ].map(([label, count, unique]) => (
                      <div key={String(label)}>
                        <span>{label}</span>
                        <strong>{count}</strong>
                        <small>{formatPercent(answerPercent(Number(count)), 1)} of responses{unique !== null ? ` · ${unique} unique cards` : ''}</small>
                        <div className="answer-track"><i style={{ width: `${answerPercent(Number(count))}%` }} /></div>
                      </div>
                    ))}
                  </div>
                  <p className="panel-note">
                    Unique-card counts separate one repeatedly missed question from misses spread across many questions.
                  </p>
                </article>

                <article className="panel">
                  <div className="panel-heading"><div><p className="panel-kicker">EVIDENCE COVERAGE</p><h2>How evenly the material was studied</h2></div></div>
                  <EvidenceDistribution stats={overall} />
                  <div className="mini-stat-row">
                    <span><strong>{overall.stableCards}</strong> stable</span>
                    <span><strong>{overall.volatileCards}</strong> volatile</span>
                    <span><strong>{overall.forgottenCards}</strong> at risk of being forgotten</span>
                  </div>
                </article>
              </section>

              <section className="section-grid">
                <article className="panel">
                  <div className="panel-heading">
                    <div><p className="panel-kicker">WEAKEST TOPICS</p><h2>Where the score is coming from</h2></div>
                    <button className="text-button" onClick={() => setActiveTab('topics')}>View all</button>
                  </div>
                  {weakestSections.length ? (
                    <div className="rank-list">
                      {weakestSections.map((row, index) => (
                        <button key={row.id} onClick={() => drillInto(row)}>
                          <span className="rank">{index + 1}</span>
                          <span className="rank-copy"><strong>{row.name}</strong><small>{row.stats.again} Again · {formatPercent(row.stats.coverage)} coverage</small></span>
                          <span className="rank-score">{formatPercent(row.stats.readiness)}</span>
                        </button>
                      ))}
                    </div>
                  ) : <p className="muted-copy">No child topics were detected at this level.</p>}
                </article>

                <article className="panel">
                  <div className="panel-heading">
                    <div><p className="panel-kicker">QUESTIONS TO FIX</p><h2>Highest-priority individual cards</h2></div>
                    <button className="text-button" onClick={() => setActiveTab('questions')}>View all</button>
                  </div>
                  <div className="rank-list question-rank-list">
                    {priorityCards.slice(0, 6).map((card, index) => (
                      <button key={card.cardId} onClick={() => openRem(card.remId)}>
                        <span className="rank">{index + 1}</span>
                        <span className="rank-copy"><strong>{card.question}</strong><small>{card.reasons.join(' · ')}</small></span>
                        <span className="rank-score">{Math.round(card.priority)}</span>
                      </button>
                    ))}
                    {!priorityCards.length && <p className="muted-copy">No questions were found beneath this Rem.</p>}
                  </div>
                </article>
              </section>
            </>
          )}

          {activeTab === 'topics' && (
            <>
              {(sectionRows || []).length > 0 && (
                <section className="topic-heatmap-panel">
                  <div className="panel-heading">
                    <div><p className="panel-kicker">WEAKNESS HEAT MAP</p><h2>Readiness across the selected topic</h2></div>
                    <small>Darker risk means lower readiness or missing evidence.</small>
                  </div>
                  <div className="topic-heatmap">
                    {[...(sectionRows || [])]
                      .sort((a, b) => (a.stats.readiness ?? -1) - (b.stats.readiness ?? -1))
                      .map((row) => {
                        const readiness = row.stats.readiness;
                        const heat = readiness === null
                          ? 'heat-no-data'
                          : readiness < 60
                            ? 'heat-critical'
                            : readiness < 72
                              ? 'heat-weak'
                              : readiness < 83
                                ? 'heat-developing'
                                : readiness < 92
                                  ? 'heat-strong'
                                  : 'heat-mastered';
                        return (
                          <button key={row.id} className={heat} onClick={() => drillInto(row)} title={`${row.name}: ${formatPercent(row.stats.readiness)} readiness`}>
                            <strong>{row.name}</strong>
                            <span>{formatPercent(row.stats.readiness)} ready</span>
                            <small>{formatPercent(row.stats.coverage)} coverage · {row.stats.again} Again</small>
                          </button>
                        );
                      })}
                  </div>
                </section>
              )}

              <section className="professor-lens">
                <div className="professor-copy">
                  <p className="panel-kicker">LECTURE / PROFESSOR LENS</p>
                  <h2>Use your Rem hierarchy as the course blueprint</h2>
                  <p>
                    This view treats direct child folders and documents as lectures, modules, objectives, or topics. It does not invent professor emphasis that is not encoded in your Rems.
                  </p>
                </div>
                <div className="lens-grid">
                  <div><span>Weakest</span><strong>{professorLens.weakest?.name || '—'}</strong><small>{formatPercent(professorLens.weakest?.stats.readiness ?? null)} readiness</small></div>
                  <div><span>Least covered</span><strong>{professorLens.neglected?.name || '—'}</strong><small>{formatPercent(professorLens.neglected?.stats.coverage ?? null)} coverage</small></div>
                  <div><span>Highest Again rate</span><strong>{professorLens.repeatMisses?.name || '—'}</strong><small>{professorLens.repeatMisses?.stats.reviews ? formatPercent((professorLens.repeatMisses.stats.again / professorLens.repeatMisses.stats.reviews) * 100, 1) : 'No reviews'}</small></div>
                  <div><span>Most forgotten</span><strong>{professorLens.forgotten?.name || '—'}</strong><small>{professorLens.forgotten?.stats.forgottenCards ?? 0} at-risk cards</small></div>
                  <div><span>Fastest improving</span><strong>{professorLens.improving?.name || '—'}</strong><small>{formatDelta(professorLens.improving?.stats.trendDelta ?? null)}</small></div>
                </div>
                <p className="structure-note">
                  {professorLens.structuredCount
                    ? `${professorLens.structuredCount} child items contain labels such as lecture, module, slide, objective, or topic.`
                    : 'No explicit lecture, slide, or objective labels were detected. The folder structure is still used for analysis.'}
                </p>
              </section>

              <section className="table-controls">
                <label>Sort topics
                  <select value={topicSort} onChange={(event) => setTopicSort(event.target.value as TopicSort)}>
                    <option value="weakest">Weakest first</option>
                    <option value="readiness">Strongest first</option>
                    <option value="coverage">Lowest coverage</option>
                    <option value="again">Most Again</option>
                    <option value="forgotten">Most forgotten</option>
                    <option value="reviews">Most reviewed</option>
                  </select>
                </label>
              </section>

              {sortedSections.length ? (
                <section className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Lecture / topic / folder</th>
                        <th>Readiness</th>
                        <th>Mastery</th>
                        <th>Confidence</th>
                        <th>Coverage</th>
                        <th>Trend</th>
                        <th>Cards</th>
                        <th>Reviews</th>
                        <th>Again</th>
                        <th>Hard</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedSections.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <button className="primary-link" onClick={() => drillInto(row)}>{row.name}</button>
                            <small>{row.childCount} nested items · {row.stats.neverReviewedCards} unseen</small>
                          </td>
                          <td><strong>{formatPercent(row.stats.readiness)}</strong><MiniProgress value={row.stats.readiness} /></td>
                          <td>{formatPercent(row.stats.mastery)}</td>
                          <td>{formatPercent(row.stats.confidence)}</td>
                          <td>{formatPercent(row.stats.coverage)}</td>
                          <td><span className={trendClass(row.stats.trend)}>{row.stats.trend}</span><small>{formatDelta(row.stats.trendDelta)}</small></td>
                          <td>{row.stats.cards}</td>
                          <td>{row.stats.reviews}<small>{formatNumber(row.stats.reviewsPerCard)} per card</small></td>
                          <td>{row.stats.again}<small>{row.stats.uniqueAgainCards} cards · {row.stats.reviews ? formatPercent((row.stats.again / row.stats.reviews) * 100, 1) : '—'}</small></td>
                          <td>{row.stats.hard}<small>{row.stats.uniqueHardCards} cards · {row.stats.reviews ? formatPercent((row.stats.hard / row.stats.reviews) * 100, 1) : '—'}</small></td>
                          <td><button className="open-button" onClick={() => openRem(row.id)}>Open</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ) : (
                <EmptyState>This level has no child folders or documents. Use the Questions tab to inspect its cards.</EmptyState>
              )}
            </>
          )}

          {activeTab === 'questions' && (
            <>
              <section className="question-summary">
                <div><strong>{visibleQuestions.length}</strong><span>questions shown</span></div>
                <div><strong>{overall.uniqueAgainCards}</strong><span>unique questions with Again</span></div>
                <div><strong>{(analyses || []).filter((card) => card.again >= 2).length}</strong><span>repeat-miss questions</span></div>
                <div><strong>{overall.volatileCards}</strong><span>volatile questions</span></div>
              </section>

              <section className="table-controls question-controls">
                <label className="search-control">Search question
                  <input value={questionSearch} onChange={(event) => setQuestionSearch(event.target.value)} placeholder="Type part of the question..." />
                </label>
                <label>Show
                  <select value={questionFilter} onChange={(event) => setQuestionFilter(event.target.value as QuestionFilter)}>
                    <option value="all">All questions</option>
                    <option value="missed">Any Again</option>
                    <option value="repeat">Repeat misses</option>
                    <option value="hard">Any Hard</option>
                    <option value="volatile">Volatile</option>
                    <option value="unseen">Never reviewed</option>
                    <option value="overdue">Due or overdue</option>
                    <option value="low-evidence">Low evidence</option>
                  </select>
                </label>
                <label>Sort
                  <select value={questionSort} onChange={(event) => setQuestionSort(event.target.value as QuestionSort)}>
                    <option value="priority">Highest study priority</option>
                    <option value="mastery">Lowest mastery</option>
                    <option value="again">Most Again</option>
                    <option value="evidence">Least evidence</option>
                    <option value="recent">Most recently reviewed</option>
                  </select>
                </label>
              </section>

              <section className="table-wrap question-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Exact question / flashcard Rem</th>
                      <th>Mastery</th>
                      <th>Confidence</th>
                      <th>Stability</th>
                      <th>Reviews</th>
                      <th>Again</th>
                      <th>Hard</th>
                      <th>Recent</th>
                      <th>Last reviewed</th>
                      <th>Priority</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleQuestions.map((card) => (
                      <tr key={card.cardId} className={focusCardId === card.cardId ? 'focused-card-row' : ''}>
                        <td>
                          <button className="question-link" onClick={() => openRem(card.remId)}>{card.question}</button>
                          <small>{card.reasons.join(' · ')}</small>
                        </td>
                        <td><strong>{formatPercent(card.mastery)}</strong><MiniProgress value={card.mastery} /></td>
                        <td>{formatPercent(card.confidence)}<small>{card.distinctReviewDays} review days</small></td>
                        <td><span className={stabilityClass(card.stability)}>{card.stability}</span></td>
                        <td>{card.reviews}<small>{card.reviewSpanDays ? `${Math.round(card.reviewSpanDays)}-day span` : 'No spacing yet'}</small></td>
                        <td><strong>{card.again}</strong><small>{card.recentAgain} recent</small></td>
                        <td>{card.hard}<small>{card.recentHard} recent</small></td>
                        <td>{formatPercent(card.recentRetention)}</td>
                        <td>{formatDate(card.lastReviewed)}<small>{formatDays(card.daysSinceReview)} ago</small></td>
                        <td><strong>{Math.round(card.priority)}</strong><MiniProgress value={card.priority} /></td>
                        <td><button className="open-button" onClick={() => openRem(card.remId)}>Open</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!visibleQuestions.length && <div className="empty-inline">No questions match the current filters.</div>}
              </section>
            </>
          )}

          {activeTab === 'study' && (
            <>
              <section className="study-hero">
                <div>
                  <p className="panel-kicker">HIGHEST-IMPACT REVIEW</p>
                  <h2>{studyMinutes}-minute study plan</h2>
                  <p>
                    Questions are prioritized by low mastery, weak evidence, recent Again/Hard responses, repeated misses, overdue status, and time since review.
                  </p>
                </div>
                <label>Available time
                  <select value={studyMinutes} onChange={(event) => setStudyMinutes(Number(event.target.value))}>
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={45}>45 minutes</option>
                    <option value={60}>1 hour</option>
                    <option value={90}>90 minutes</option>
                  </select>
                </label>
                <div className="study-summary">
                  <strong>{studyPlan.length}</strong><span>questions</span>
                  <strong>{formatMinutes(totalPlanSeconds)}</strong><span>estimated</span>
                </div>
              </section>

              <section className="study-columns">
                <article className="panel study-priority-panel">
                  <div className="panel-heading"><div><p className="panel-kicker">DO THESE IN ORDER</p><h2>Study Next</h2></div></div>
                  <div className="study-list">
                    {studyPlan.map((card, index) => (
                      <button key={card.cardId} onClick={() => openRem(card.remId)}>
                        <span className="study-index">{index + 1}</span>
                        <span className="study-copy">
                          <strong>{card.question}</strong>
                          <small>{card.reasons.join(' · ')}</small>
                          <span className="study-tags">
                            <i>{card.stability}</i>
                            <i>{formatPercent(card.mastery)} mastery</i>
                            <i>{card.reviews} reviews</i>
                          </span>
                        </span>
                        <span className="study-time">~{Math.round(card.estimatedSeconds)}s</span>
                      </button>
                    ))}
                    {!studyPlan.length && <p className="muted-copy">No questions were found beneath this Rem.</p>}
                  </div>
                </article>

                <aside className="panel study-method-panel">
                  <p className="panel-kicker">WHY THESE CARDS</p>
                  <h2>Transparent priority signals</h2>
                  <div className="method-list">
                    <div><strong>Recent failure</strong><span>Again and Hard responses receive extra weight.</span></div>
                    <div><strong>Repeat failure</strong><span>Multiple Again responses are treated differently from one isolated lapse.</span></div>
                    <div><strong>Coverage gap</strong><span>Unseen and low-evidence cards are surfaced before the dashboard overstates readiness.</span></div>
                    <div><strong>Forgetting risk</strong><span>Overdue and long-unseen cards rise in priority.</span></div>
                    <div><strong>Card-level balance</strong><span>One heavily reviewed card cannot hide many unreviewed cards.</span></div>
                  </div>
                  <p className="panel-note">Open each question directly, answer it in RemNote, then refresh the dashboard to update the plan.</p>
                </aside>
              </section>
            </>
          )}

          {activeTab === 'progress' && (
            <>
              <section className="progress-summary">
                <div><span>Since prior snapshot</span><strong>{masterySnapshotDelta === null ? 'No baseline' : `${masterySnapshotDelta > 0 ? '+' : ''}${masterySnapshotDelta.toFixed(1)} mastery`}</strong><small>{readinessSnapshotDelta === null ? `${overall.trend}: ${formatDelta(overall.trendDelta)}` : `${readinessSnapshotDelta > 0 ? '+' : ''}${readinessSnapshotDelta.toFixed(1)} readiness points`}</small></div>
                <div><span>Recent reviews</span><strong>{overall.recentReviews}</strong><small>Last {recentDays} days</small></div>
                <div><span>Recent retention</span><strong>{formatPercent(overall.recentRetention)}</strong><small>Again counts as not remembered</small></div>
                <div><span>Evidence growth target</span><strong>{overall.lowEvidenceCards + overall.neverReviewedCards}</strong><small>Cards needing more evidence</small></div>
              </section>

              <section className="panel progress-panel">
                <div className="panel-heading"><div><p className="panel-kicker">12-WEEK ACTIVITY</p><h2>Reviews over time</h2></div></div>
                <PeriodChart periods={weeklySeries} />
              </section>

              <section className="section-grid progress-grids">
                <article className="panel">
                  <div className="panel-heading"><div><p className="panel-kicker">WEEKLY DETAIL</p><h2>Retention and workload</h2></div></div>
                  <div className="compact-period-table">
                    {weeklySeries.slice(-8).reverse().map((period) => (
                      <div key={period.key}>
                        <strong>{period.label}</strong>
                        <span>{period.reviews} reviews</span>
                        <span>{period.uniqueCards} cards</span>
                        <span>{period.again} Again</span>
                        <b>{formatPercent(period.retention)}</b>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="panel">
                  <div className="panel-heading"><div><p className="panel-kicker">6-MONTH VIEW</p><h2>Longer-term retention</h2></div></div>
                  <div className="compact-period-table">
                    {monthlySeries.slice().reverse().map((period) => (
                      <div key={period.key}>
                        <strong>{period.label}</strong>
                        <span>{period.reviews} reviews</span>
                        <span>{period.uniqueCards} cards</span>
                        <span>{period.hard} Hard</span>
                        <b>{formatPercent(period.retention)}</b>
                      </div>
                    ))}
                  </div>
                </article>
              </section>
            </>
          )}

          <footer className="methodology-footer">
            <strong>How to read these numbers:</strong> Mastery is question-level and Bayesian-adjusted so one Easy response cannot produce 100% certainty. Confidence measures review depth and spacing. Coverage measures how much of the selected material has actually been studied. Exam readiness combines those signals and is a study-planning estimate, not a guaranteed exam score.
          </footer>
        </>
      )}
    </main>
  );
}

renderWidget(AnalyticsDashboard);
