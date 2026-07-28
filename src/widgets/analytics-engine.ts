import type { Card } from '@remnote/plugin-sdk';

export const DAY_MS = 86_400_000;
const PRIOR_QUALITY = 0.78;
const LIFETIME_PRIOR_STRENGTH = 4;
const RECENT_PRIOR_STRENGTH = 2;

export type Status = 'No data' | 'Critical' | 'Weak' | 'Developing' | 'Strong' | 'Mastered';
export type Stability = 'Unseen' | 'Volatile' | 'Fragile' | 'Stable';
export type TrendLabel = 'Improving' | 'Stable' | 'Declining' | 'No baseline';

export type ReviewEvent = {
  date: number;
  score: number;
  quality: number;
  responseTime: number | null;
};

export type CardAnalysis = {
  cardId: string;
  remId: string;
  question: string;
  reviews: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
  remembered: number;
  retention: number | null;
  adjustedRetention: number | null;
  recentRetention: number | null;
  recentReviews: number;
  previousRetention: number | null;
  averageSeconds: number | null;
  lastReviewed: number | null;
  nextReview: number | null;
  daysSinceReview: number | null;
  reviewSpanDays: number;
  distinctReviewDays: number;
  overdue: boolean;
  recentAgain: number;
  recentHard: number;
  timesWrongInRow: number;
  mastery: number | null;
  confidence: number;
  stability: Stability;
  priority: number;
  estimatedSeconds: number;
  reasons: string[];
  events: ReviewEvent[];
};

export type AggregateStats = {
  cards: number;
  reviewedCards: number;
  matureCards: number;
  spacedCards: number;
  deepEvidenceCards: number;
  lowEvidenceCards: number;
  neverReviewedCards: number;
  overdueCards: number;
  forgottenCards: number;
  volatileCards: number;
  stableCards: number;
  reviews: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
  uniqueAgainCards: number;
  uniqueHardCards: number;
  retention: number | null;
  adjustedRetention: number | null;
  recentRetention: number | null;
  recentReviews: number;
  averageSeconds: number | null;
  reviewsPerCard: number;
  mastery: number | null;
  confidence: number;
  coverage: number;
  readiness: number | null;
  status: Status;
  trend: TrendLabel;
  trendDelta: number | null;
  reviewDistribution: {
    unseen: number;
    once: number;
    twoToFour: number;
    fiveToNine: number;
    tenPlus: number;
  };
};

export type PeriodStats = {
  key: string;
  label: string;
  reviews: number;
  again: number;
  hard: number;
  retention: number | null;
  uniqueCards: number;
};

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeTime(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 && value < 10_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function scoreBucket(score: number): 'again' | 'hard' | 'good' | 'easy' {
  if (score < 0.1) return 'again';
  if (score < 0.75) return 'hard';
  if (score < 1.25) return 'good';
  return 'easy';
}

function qualityForScore(score: number): number {
  const bucket = scoreBucket(score);
  if (bucket === 'again') return 0;
  if (bucket === 'hard') return 0.55;
  if (bucket === 'good') return 0.9;
  return 1;
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function bayesianQuality(events: ReviewEvent[], strength: number): number {
  const total = events.reduce((sum, event) => sum + event.quality, 0);
  return (total + PRIOR_QUALITY * strength) / (events.length + strength);
}

export function validReviewEvents(card: Card): ReviewEvent[] {
  return (card.repetitionHistory || [])
    .filter((repetition) => Math.abs(repetition.score - 0.01) > 0.001)
    .map((repetition) => {
      const date = normalizeTime(repetition.date);
      const responseTimeRaw = (repetition as { responseTime?: number }).responseTime;
      const responseTime = typeof responseTimeRaw === 'number'
        && responseTimeRaw > 0
        && responseTimeRaw < 600_000
        ? responseTimeRaw
        : null;
      return date === null
        ? null
        : {
          date,
          score: repetition.score,
          quality: qualityForScore(repetition.score),
          responseTime,
        };
    })
    .filter((event): event is ReviewEvent => Boolean(event))
    .sort((a, b) => a.date - b.date);
}

function retentionFor(events: ReviewEvent[]): number | null {
  if (!events.length) return null;
  const remembered = events.filter((event) => scoreBucket(event.score) !== 'again').length;
  return (remembered / events.length) * 100;
}

function statusFor(readiness: number | null, reviews: number): Status {
  if (!reviews || readiness === null) return 'No data';
  if (readiness < 60) return 'Critical';
  if (readiness < 72) return 'Weak';
  if (readiness < 83) return 'Developing';
  if (readiness < 92) return 'Strong';
  return 'Mastered';
}

function trendFor(delta: number | null): TrendLabel {
  if (delta === null) return 'No baseline';
  if (delta > 3) return 'Improving';
  if (delta < -3) return 'Declining';
  return 'Stable';
}

export function analyzeCard(
  card: Card,
  question: string,
  recentDays: number,
  now = Date.now(),
): CardAnalysis {
  const events = validReviewEvents(card);
  const cutoff = now - recentDays * DAY_MS;
  const previousCutoff = cutoff - recentDays * DAY_MS;
  const recentEvents = events.filter((event) => event.date >= cutoff);
  const previousEvents = events.filter((event) => event.date >= previousCutoff && event.date < cutoff);

  let again = 0;
  let hard = 0;
  let good = 0;
  let easy = 0;
  let totalResponseTime = 0;
  let timedReviews = 0;

  for (const event of events) {
    const bucket = scoreBucket(event.score);
    if (bucket === 'again') again += 1;
    else if (bucket === 'hard') hard += 1;
    else if (bucket === 'good') good += 1;
    else easy += 1;

    if (event.responseTime !== null) {
      totalResponseTime += event.responseTime;
      timedReviews += 1;
    }
  }

  const lastReviewed = events.length ? events[events.length - 1].date : null;
  const firstReviewed = events.length ? events[0].date : null;
  const daysSinceReview = lastReviewed === null ? null : Math.max(0, (now - lastReviewed) / DAY_MS);
  const reviewSpanDays = firstReviewed === null || lastReviewed === null
    ? 0
    : Math.max(0, (lastReviewed - firstReviewed) / DAY_MS);
  const distinctReviewDays = new Set(events.map((event) => new Date(event.date).toISOString().slice(0, 10))).size;
  const nextReview = normalizeTime((card as Card & { nextRepetitionTime?: unknown }).nextRepetitionTime);
  const overdue = nextReview !== null && nextReview <= now;
  const recentAgain = recentEvents.filter((event) => scoreBucket(event.score) === 'again').length;
  const recentHard = recentEvents.filter((event) => scoreBucket(event.score) === 'hard').length;
  const timesWrongInRow = Math.max(0, Number((card as Card & { timesWrongInRow?: number }).timesWrongInRow || 0));

  let mastery: number | null = null;
  let confidence = 0;

  if (events.length) {
    const lifetimeAdjusted = bayesianQuality(events, LIFETIME_PRIOR_STRENGTH);
    const recentAdjusted = recentEvents.length
      ? bayesianQuality(recentEvents, RECENT_PRIOR_STRENGTH)
      : lifetimeAdjusted;
    const lastThree = events.slice(Math.max(0, events.length - 3));
    const lastThreeQuality = mean(lastThree.map((event) => event.quality)) ?? PRIOR_QUALITY;
    const recencyPenalty = daysSinceReview !== null && daysSinceReview > 45
      ? Math.min(0.16, ((daysSinceReview - 45) / 180) * 0.16)
      : 0;
    const lapsePenalty = Math.min(0.12, recentAgain * 0.04 + timesWrongInRow * 0.02);

    mastery = clamp(
      (0.5 * recentAdjusted + 0.35 * lifetimeAdjusted + 0.15 * lastThreeQuality
        - recencyPenalty - lapsePenalty) * 100,
    );

    const depthEvidence = Math.min(1, events.length / 6);
    const spacingEvidence = Math.min(1, reviewSpanDays / 28);
    const distinctDayEvidence = Math.min(1, distinctReviewDays / 5);
    confidence = clamp((0.55 * depthEvidence + 0.25 * spacingEvidence + 0.2 * distinctDayEvidence) * 100);
  }

  const againRate = events.length ? again / events.length : 0;
  const hardRate = events.length ? hard / events.length : 0;
  const lastEvent = events.length ? events[events.length - 1] : null;

  let stability: Stability = 'Unseen';
  if (events.length) {
    if (
      (lastEvent && scoreBucket(lastEvent.score) === 'again')
      || recentAgain >= 2
      || timesWrongInRow > 0
      || againRate >= 0.3
    ) stability = 'Volatile';
    else if (
      (mastery ?? 0) >= 85
      && confidence >= 60
      && (daysSinceReview ?? 0) <= 45
    ) stability = 'Stable';
    else stability = 'Fragile';
  }

  let priority = events.length ? 0 : 82;
  if (events.length) {
    const gapPenalty = daysSinceReview === null ? 0 : Math.min(12, Math.max(0, (daysSinceReview - 14) / 4));
    priority = clamp(
      (100 - (mastery ?? 0)) * 0.55
      + (100 - confidence) * 0.15
      + againRate * 20
      + hardRate * 10
      + recentAgain * 8
      + recentHard * 3
      + (overdue ? 12 : 0)
      + gapPenalty
      + Math.min(10, timesWrongInRow * 4),
    );
  }

  const reasons: string[] = [];
  if (!events.length) reasons.push('Never reviewed');
  if (again >= 2) reasons.push(`${again} Again responses`);
  else if (again === 1) reasons.push('1 Again response');
  if (recentAgain) reasons.push(`${recentAgain} recent lapse${recentAgain === 1 ? '' : 's'}`);
  if (hard >= 2) reasons.push(`${hard} Hard responses`);
  if (timesWrongInRow > 0) reasons.push('Currently missed in a row');
  if (overdue) reasons.push('Due or overdue');
  if (events.length > 0 && events.length < 3) reasons.push('Low evidence');
  if (daysSinceReview !== null && daysSinceReview >= 30) reasons.push(`Not reviewed in ${Math.floor(daysSinceReview)} days`);
  if (mastery !== null && mastery < 70) reasons.push('Low mastery estimate');
  if (!reasons.length && stability === 'Fragile') reasons.push('Needs more spaced evidence');
  if (!reasons.length) reasons.push('Maintenance review');

  return {
    cardId: card._id,
    remId: card.remId,
    question,
    reviews: events.length,
    again,
    hard,
    good,
    easy,
    remembered: hard + good + easy,
    retention: retentionFor(events),
    adjustedRetention: events.length ? bayesianQuality(events, LIFETIME_PRIOR_STRENGTH) * 100 : null,
    recentRetention: retentionFor(recentEvents),
    recentReviews: recentEvents.length,
    previousRetention: retentionFor(previousEvents),
    averageSeconds: timedReviews ? totalResponseTime / timedReviews / 1000 : null,
    lastReviewed,
    nextReview,
    daysSinceReview,
    reviewSpanDays,
    distinctReviewDays,
    overdue,
    recentAgain,
    recentHard,
    timesWrongInRow,
    mastery,
    confidence,
    stability,
    priority,
    estimatedSeconds: Math.max(25, Math.min(90, ((timedReviews ? totalResponseTime / timedReviews / 1000 : 40) * 1.2))),
    reasons: reasons.slice(0, 4),
    events,
  };
}

export function aggregateCards(
  cards: CardAnalysis[],
  recentDays: number,
  now = Date.now(),
): AggregateStats {
  const reviewed = cards.filter((card) => card.reviews > 0);
  const mature = cards.filter((card) => card.reviews >= 3);
  const spaced = cards.filter((card) => card.reviews >= 3 && card.reviewSpanDays >= 7);
  const deepEvidence = cards.filter((card) => card.reviews >= 6 && card.reviewSpanDays >= 21);
  const allEvents = cards.flatMap((card) => card.events);

  const again = cards.reduce((sum, card) => sum + card.again, 0);
  const hard = cards.reduce((sum, card) => sum + card.hard, 0);
  const good = cards.reduce((sum, card) => sum + card.good, 0);
  const easy = cards.reduce((sum, card) => sum + card.easy, 0);
  const reviews = allEvents.length;
  const timed = cards.filter((card) => card.averageSeconds !== null && card.reviews > 0);
  const timedWeight = timed.reduce((sum, card) => sum + card.reviews, 0);
  const averageSeconds = timedWeight
    ? timed.reduce((sum, card) => sum + (card.averageSeconds || 0) * card.reviews, 0) / timedWeight
    : null;

  const reviewedRatio = cards.length ? reviewed.length / cards.length : 0;
  const matureRatio = cards.length ? mature.length / cards.length : 0;
  const spacedRatio = cards.length ? spaced.length / cards.length : 0;
  const deepRatio = cards.length ? deepEvidence.length / cards.length : 0;
  const coverage = clamp((0.7 * reviewedRatio + 0.3 * matureRatio) * 100);
  const confidence = clamp(
    (0.35 * reviewedRatio + 0.35 * matureRatio + 0.2 * spacedRatio + 0.1 * deepRatio) * 100,
  );
  const mastery = mean(reviewed.map((card) => card.mastery).filter((value): value is number => value !== null));
  const readiness = mastery === null
    ? null
    : clamp(mastery * (0.55 + 0.3 * (coverage / 100) + 0.15 * (confidence / 100)));

  const cutoff = now - recentDays * DAY_MS;
  const previousCutoff = cutoff - recentDays * DAY_MS;
  const currentEvents = allEvents.filter((event) => event.date >= cutoff);
  const previousEvents = allEvents.filter((event) => event.date >= previousCutoff && event.date < cutoff);
  const currentQuality = mean(currentEvents.map((event) => event.quality));
  const previousQuality = mean(previousEvents.map((event) => event.quality));
  const trendDelta = currentEvents.length >= 3 && previousEvents.length >= 3
    && currentQuality !== null && previousQuality !== null
    ? (currentQuality - previousQuality) * 100
    : null;

  return {
    cards: cards.length,
    reviewedCards: reviewed.length,
    matureCards: mature.length,
    spacedCards: spaced.length,
    deepEvidenceCards: deepEvidence.length,
    lowEvidenceCards: cards.filter((card) => card.reviews > 0 && card.reviews < 3).length,
    neverReviewedCards: cards.filter((card) => card.reviews === 0).length,
    overdueCards: cards.filter((card) => card.overdue).length,
    forgottenCards: cards.filter((card) => (
      card.reviews > 0
      && ((card.daysSinceReview ?? 0) >= 30)
      && ((card.mastery ?? 0) < 85 || card.stability !== 'Stable')
    )).length,
    volatileCards: cards.filter((card) => card.stability === 'Volatile').length,
    stableCards: cards.filter((card) => card.stability === 'Stable').length,
    reviews,
    again,
    hard,
    good,
    easy,
    uniqueAgainCards: cards.filter((card) => card.again > 0).length,
    uniqueHardCards: cards.filter((card) => card.hard > 0).length,
    retention: reviews ? ((hard + good + easy) / reviews) * 100 : null,
    adjustedRetention: reviews ? bayesianQuality(allEvents, LIFETIME_PRIOR_STRENGTH) * 100 : null,
    recentRetention: retentionFor(currentEvents),
    recentReviews: currentEvents.length,
    averageSeconds,
    reviewsPerCard: cards.length ? reviews / cards.length : 0,
    mastery,
    confidence,
    coverage,
    readiness,
    status: statusFor(readiness, reviews),
    trend: trendFor(trendDelta),
    trendDelta,
    reviewDistribution: {
      unseen: cards.filter((card) => card.reviews === 0).length,
      once: cards.filter((card) => card.reviews === 1).length,
      twoToFour: cards.filter((card) => card.reviews >= 2 && card.reviews <= 4).length,
      fiveToNine: cards.filter((card) => card.reviews >= 5 && card.reviews <= 9).length,
      tenPlus: cards.filter((card) => card.reviews >= 10).length,
    },
  };
}

export function buildWeeklySeries(cards: CardAnalysis[], weeks = 12, now = Date.now()): PeriodStats[] {
  const events = cards.flatMap((card) => card.events.map((event) => ({ ...event, cardId: card.cardId })));
  const periods: PeriodStats[] = [];

  for (let index = weeks - 1; index >= 0; index -= 1) {
    const end = now - index * 7 * DAY_MS;
    const start = end - 7 * DAY_MS;
    const periodEvents = events.filter((event) => event.date >= start && event.date < end);
    const remembered = periodEvents.filter((event) => scoreBucket(event.score) !== 'again').length;
    periods.push({
      key: `${start}`,
      label: new Date(start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      reviews: periodEvents.length,
      again: periodEvents.filter((event) => scoreBucket(event.score) === 'again').length,
      hard: periodEvents.filter((event) => scoreBucket(event.score) === 'hard').length,
      retention: periodEvents.length ? (remembered / periodEvents.length) * 100 : null,
      uniqueCards: new Set(periodEvents.map((event) => event.cardId)).size,
    });
  }

  return periods;
}

export function buildMonthlySeries(cards: CardAnalysis[], months = 6, now = Date.now()): PeriodStats[] {
  const events = cards.flatMap((card) => card.events.map((event) => ({ ...event, cardId: card.cardId })));
  const periods: PeriodStats[] = [];
  const current = new Date(now);

  for (let index = months - 1; index >= 0; index -= 1) {
    const start = new Date(current.getFullYear(), current.getMonth() - index, 1).getTime();
    const end = new Date(current.getFullYear(), current.getMonth() - index + 1, 1).getTime();
    const periodEvents = events.filter((event) => event.date >= start && event.date < end);
    const remembered = periodEvents.filter((event) => scoreBucket(event.score) !== 'again').length;
    periods.push({
      key: `${start}`,
      label: new Date(start).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
      reviews: periodEvents.length,
      again: periodEvents.filter((event) => scoreBucket(event.score) === 'again').length,
      hard: periodEvents.filter((event) => scoreBucket(event.score) === 'hard').length,
      retention: periodEvents.length ? (remembered / periodEvents.length) * 100 : null,
      uniqueCards: new Set(periodEvents.map((event) => event.cardId)).size,
    });
  }

  return periods;
}

export function buildStudyPlan(cards: CardAnalysis[], minutes: number): CardAnalysis[] {
  const limitSeconds = Math.max(60, minutes * 60);
  const sorted = [...cards].sort((a, b) => b.priority - a.priority);
  const selected: CardAnalysis[] = [];
  let total = 0;

  for (const card of sorted) {
    if (selected.length > 0 && total + card.estimatedSeconds > limitSeconds) continue;
    selected.push(card);
    total += card.estimatedSeconds;
    if (total >= limitSeconds || selected.length >= 100) break;
  }

  return selected;
}
