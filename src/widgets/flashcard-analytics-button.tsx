import React from 'react';
import { Card, renderWidget, usePlugin, useRunAsync } from '@remnote/plugin-sdk';
import { analyzeCard, validReviewEvents, ReviewEvent } from './analytics-engine';

type RecallKind = 'forgot' | 'partial' | 'effort' | 'easy';
type CompactStatus = 'Good' | 'Review' | 'Weak';

const HISTORY_SLOTS = 9;

function recallKind(score: number): RecallKind {
  if (score < 0.1) return 'forgot';
  if (score < 0.75) return 'partial';
  if (score < 1.25) return 'effort';
  return 'easy';
}

function recallLabel(kind: RecallKind): string {
  if (kind === 'forgot') return 'Forgot';
  if (kind === 'partial') return 'Partially Recalled';
  if (kind === 'effort') return 'Recalled with Effort';
  return 'Easily Recalled';
}

function quality(event: ReviewEvent): number {
  const kind = recallKind(event.score);
  if (kind === 'forgot') return 0;
  if (kind === 'partial') return 0.55;
  if (kind === 'effort') return 0.9;
  return 1;
}

function currentStreak(events: ReviewEvent[]): number {
  let streak = 0;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (recallKind(events[index].score) === 'forgot') break;
    streak += 1;
  }
  return streak;
}

function trendFor(events: ReviewEvent[]): { symbol: string; label: string } {
  if (events.length < 4) return { symbol: '→', label: 'Steady' };

  const recent = events.slice(-5);
  const previous = events.slice(Math.max(0, events.length - 10), Math.max(0, events.length - 5));
  if (!previous.length) return { symbol: '→', label: 'Steady' };

  const average = (items: ReviewEvent[]) => items.reduce((sum, event) => sum + quality(event), 0) / items.length;
  const delta = average(recent) - average(previous);
  if (delta > 0.08) return { symbol: '↑', label: 'Improving' };
  if (delta < -0.08) return { symbol: '↓', label: 'Declining' };
  return { symbol: '→', label: 'Steady' };
}

function statusFor(mastery: number | null, events: ReviewEvent[]): CompactStatus {
  if (!events.length || mastery === null) return 'Review';
  const latest = recallKind(events[events.length - 1].score);
  const recentForgot = events.slice(-3).filter((event) => recallKind(event.score) === 'forgot').length;

  if (latest === 'forgot' || recentForgot >= 2 || mastery < 65) return 'Weak';
  if (mastery >= 85 && recentForgot === 0) return 'Good';
  return 'Review';
}

function FlashcardAnalyticsButton() {
  const plugin = usePlugin();
  const context = useRunAsync(async () => plugin.widget.getWidgetContext<any>(), []);

  const compact = useRunAsync(async () => {
    if (!context?.remId) return undefined;
    const rem = await plugin.rem.findOne(context.remId);
    if (!rem) return undefined;

    const cards = await rem.getCards();
    const card = cards.find((item) => item?._id === context.cardId) || cards[0];
    if (!card) return undefined;

    const events = validReviewEvents(card as Card);
    const analysis = analyzeCard(card as Card, '', 30);
    const remembered = events.filter((event) => recallKind(event.score) !== 'forgot').length;
    const retention = events.length ? Math.round((remembered / events.length) * 100) : null;
    const mastery = analysis.mastery === null ? null : Math.round(analysis.mastery);

    return {
      events,
      retention,
      mastery,
      reviews: events.length,
      streak: currentStreak(events),
      trend: trendFor(events),
      status: statusFor(mastery, events),
    };
  }, [context?.remId, context?.cardId]);

  const events = compact?.events || [];
  const visibleEvents = events.slice(-HISTORY_SLOTS);
  const emptySlots = Math.max(0, HISTORY_SLOTS - visibleEvents.length);

  return (
    <div className="card-history-widget" aria-label="Flashcard repetition history">
      <div className="card-history-strip" aria-label={`${compact?.reviews || 0} prior reviews, oldest to newest from left to right`}>
        {visibleEvents.map((event, index) => {
          const kind = recallKind(event.score);
          return (
            <span
              className={`history-square history-square-${kind}`}
              key={`${event.date}-${index}`}
              title={recallLabel(kind)}
              aria-label={recallLabel(kind)}
            />
          );
        })}
        {Array.from({ length: emptySlots }).map((_, index) => (
          <span className="history-square history-square-empty" key={`empty-${index}`} aria-hidden="true" />
        ))}
      </div>

      <div className="card-history-popover" aria-hidden="true">
        <div className="history-metric">
          <strong>{compact?.retention === null || compact?.retention === undefined ? '—' : `${compact.retention}%`}</strong>
          <span>Retention</span>
        </div>
        <div className={`history-metric status-${(compact?.status || 'Review').toLowerCase()}`}>
          <strong>{compact?.status || 'Review'}</strong>
          <span>Status</span>
        </div>
        <div className="history-metric">
          <strong>{compact?.reviews ?? 0}</strong>
          <span>Reviews</span>
        </div>
        <div className="history-metric">
          <strong>{compact?.streak ?? 0}</strong>
          <span>Current Streak</span>
        </div>
        <div className="history-metric">
          <strong>{compact?.trend.symbol || '→'}</strong>
          <span>{compact?.trend.label || 'Steady'}</span>
        </div>
        <div className="history-metric">
          <strong>{compact?.mastery === null || compact?.mastery === undefined ? '—' : `${compact.mastery}%`}</strong>
          <span>Mastery</span>
        </div>
      </div>
    </div>
  );
}

renderWidget(FlashcardAnalyticsButton);
