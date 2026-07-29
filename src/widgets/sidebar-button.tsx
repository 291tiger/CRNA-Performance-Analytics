import React from 'react';
import { renderWidget, usePlugin } from '@remnote/plugin-sdk';
import { openAnalytics } from './widget-utils';

function SidebarButton() {
  const plugin = usePlugin();

  const handleClick = async () => {
    const focusedRem = await plugin.focus.getFocusedRem();
    await openAnalytics(plugin, {
      rootRemId: focusedRem?._id,
      currentRemId: focusedRem?._id,
      source: 'sidebar',
      rememberScope: Boolean(focusedRem?._id),
    });
  };

  return (
    <button
      onClick={handleClick}
      title="Open CRNA Performance Analytics for the focused Rem"
      style={{
        width: 'calc(100% - 12px)',
        margin: '6px',
        padding: '8px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        border: '1px solid var(--rn-clr-border-primary)',
        borderRadius: '8px',
        background: 'var(--rn-clr-background-secondary)',
        color: 'var(--rn-clr-content-primary)',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 650,
        textAlign: 'left',
      }}
    >
      <span aria-hidden="true">📊</span>
      <span>CRNA Analytics</span>
    </button>
  );
}

renderWidget(SidebarButton);
