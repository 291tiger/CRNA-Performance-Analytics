import React, { useRef, useState } from 'react';
import {
  Card,
  WidgetLocation,
  renderWidget,
  usePlugin,
  useRunAsync,
} from '@remnote/plugin-sdk';
import { validReviewEvents, ReviewEvent } from './analytics-engine';

type RecallKind = 'forgot' | 'partial' | 'effort' | 'easy';

type TooltipState = {
  visible: boolean;
  left: number;
};

const HISTORY_SLOTS = 9;

function recallKind(score: number): RecallKind {
  if (score < 0.1) return 'forgot';
  if (score < 0.75) return 'partial';
  if (score < 1.25) return 'effort';
  return 'easy';
}

function quality(event: ReviewEvent): number {
  const kind = recallKind(event.score);
  if (kind === 'forgot') return 0;
  if (kind === 'partial') return 0.4;
  if (kind === 'effort') return 0.75;
  return 1;
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
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

  const delta = average(recent.map(quality)) - average(previous.map(quality));
  if (delta > 0.08) return { symbol: '↑', label: 'Improving' };
  if (delta < -0.08) return { symbol: '↓', label: 'Declining' };
  return { symbol: '→', label: 'Steady' };
}

function strengthFor(events: ReviewEvent[]): number | null {
  if (!events.length) return null;

  const successful = events.filter((event) => recallKind(event.score) !== 'forgot').length;
  const retention = successful / events.length;
  const recent = average(events.slice(-5).map(quality));
  const recallQuality = average(events.map(quality));
  const streak = currentStreak(events);
  const consistency = Math.min(1, streak / 5);

  const raw = (0.5 * retention) + (0.25 * recent) + (0.15 * recallQuality) + (0.1 * consistency);

  // Prevent one or two successful reviews from presenting as fully established knowledge.
  const confidence = Math.min(1, 0.55 + (events.length * 0.09));
  return Math.round(raw * confidence * 100);
}

function statusFor(strength: number | null, reviews: number): string {
  if (!reviews || strength === null) return 'New';
  if (strength >= 85) return 'Strong';
  if (strength < 55) return 'Needs Review';
  return 'Learning';
}

function FlashcardHistoryWidget() {
  const plugin = usePlugin();
  const stripRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, left: 0 });

  const card = useRunAsync(async () => {
    const context = await plugin.widget.getWidgetContext<WidgetLocation.FlashcardUnder>();
    if (!context?.cardId) return null;
    return plugin.card.findOne(context.cardId);
  }, []);

  const compact = useRunAsync(async () => {
    if (!card) return undefined;

    const events = validReviewEvents(card as Card);
    const strength = strengthFor(events);

    return {
      events,
      strength,
      reviews: events.length,
      streak: currentStreak(events),
      trend: trendFor(events),
      status: statusFor(strength, events.length),
    };
  }, [card?._id, card?.repetitionHistory?.length]);

  if (!card) return <></>;

  const events = compact?.events || [];
  const visibleEvents = events.slice(-HISTORY_SLOTS);
  const emptySlots = Math.max(0, HISTORY_SLOTS - visibleEvents.length);

  const showTooltip = () => {
    const strip = stripRef.current;
    if (!strip) return;
    setTooltip({ visible: true, left: strip.offsetLeft + strip.offsetWidth / 2 });
  };

  return (
    <div className="card-history-host" aria-label="Flashcard repetition history">
      <div
        ref={stripRef}
        className="card-history-strip"
        aria-label={`${compact?.reviews || 0} prior reviews`}
        onMouseEnter={showTooltip}
        onMouseLeave={() => setTooltip((current) => ({ ...current, visible: false }))}
      >
        {visibleEvents.map((event: ReviewEvent, index: number) => (
          <span
            className={`history-square history-square-${recallKind(event.score)}`}
            key={`${event.date}-${index}`}
            aria-hidden="true"
          />
        ))}
        {Array.from({ length: emptySlots }).map((_, index) => (
          <span className="history-square history-square-empty" key={`empty-${index}`} aria-hidden="true" />
        ))}
      </div>

      <div
        className={`card-history-popover ${tooltip.visible ? 'is-visible' : ''}`}
        style={{ left: `${tooltip.left}px` }}
        aria-hidden="true"
      >
        <div className="history-row"><span>Status</span><strong>{compact?.status || 'New'}</strong></div>
        <div className="history-row"><span>Strength</span><strong>{compact?.strength == null ? '—' : `${compact.strength}%`}</strong></div>
        <div className="history-row"><span>Reviews</span><strong>{compact?.reviews ?? 0}</strong></div>
        <div className="history-row"><span>Current Streak</span><strong>{compact?.streak ?? 0}</strong></div>
        <div className="history-row"><span>Trend</span><strong>{compact?.trend.symbol || '→'} {compact?.trend.label || 'Steady'}</strong></div>
      </div>
    </div>
  );
}

renderWidget(FlashcardHistoryWidget);
