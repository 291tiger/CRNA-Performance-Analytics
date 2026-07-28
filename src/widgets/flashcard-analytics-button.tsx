import React from 'react';
import { Card, renderWidget, usePlugin, useRunAsync } from '@remnote/plugin-sdk';
import { openAnalytics } from './widget-utils';

function validHistory(card: Card | undefined) {
  return (card?.repetitionHistory || []).filter((item) => Math.abs(item.score - 0.01) > 0.001);
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

    const history = validHistory(card);
    const again = history.filter((item) => item.score < 0.1).length;
    const hard = history.filter((item) => item.score >= 0.1 && item.score < 0.75).length;
    const remembered = history.filter((item) => item.score >= 0.1).length;
    const retention = history.length ? Math.round((remembered / history.length) * 100) : null;

    return { cardId: card._id, again, hard, reviews: history.length, retention };
  }, [context?.remId, context?.cardId]);

  const handleClick = async () => {
    await openAnalytics(plugin, {
      currentRemId: context?.remId,
      focusCardId: compact?.cardId || context?.cardId,
      source: 'flashcard',
    });
  };

  const detail = compact?.reviews
    ? `${compact.retention}% · ${compact.again} Again${compact.hard ? ` · ${compact.hard} Hard` : ''}`
    : 'No prior reviews';

  return (
    <button
      onClick={handleClick}
      title={`Open this question in CRNA Analytics. ${detail}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        minHeight: '30px',
        padding: '5px 9px',
        border: '1px solid var(--rn-clr-border-primary)',
        borderRadius: '7px',
        background: 'var(--rn-clr-background-secondary)',
        color: 'var(--rn-clr-content-primary)',
        cursor: 'pointer',
        fontSize: '11px',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden="true">📊</span>
      <span>{compact?.reviews ? detail : 'Analytics'}</span>
    </button>
  );
}

renderWidget(FlashcardAnalyticsButton);
