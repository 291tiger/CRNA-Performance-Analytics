import React from 'react';
import { renderWidget, usePlugin } from '@remnote/plugin-sdk';
import { openAnalytics } from './widget-utils';

function QueueToolbarButton() {
  const plugin = usePlugin();

  const handleClick = async () => {
    const context = await plugin.widget.getWidgetContext<any>();
    const focusedRem = await plugin.focus.getFocusedRem();
    const currentRemId = context?.remId || focusedRem?._id;

    await openAnalytics(plugin, {
      currentRemId,
      focusCardId: context?.cardId,
      source: 'queue',
    });
  };

  return (
    <button
      onClick={handleClick}
      title="Open analytics without leaving the review queue"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        padding: '6px 10px',
        margin: '0 5px',
        border: '1px solid var(--rn-clr-border-primary)',
        borderRadius: '7px',
        background: 'var(--rn-clr-background-secondary)',
        color: 'var(--rn-clr-content-primary)',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden="true">📊</span>
      <span>CRNA Analytics</span>
    </button>
  );
}

renderWidget(QueueToolbarButton);
