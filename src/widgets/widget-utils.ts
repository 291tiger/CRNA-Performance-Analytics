import type { ReactRNPlugin } from '@remnote/plugin-sdk';

export type AnalyticsLaunchSource = 'command' | 'sidebar' | 'queue' | 'flashcard';

export type AnalyticsContext = {
  focusedRemId?: string;
  focusCardId?: string;
  source?: AnalyticsLaunchSource;
  launchedAt?: number;
};

export const ANALYTICS_CONTEXT_KEY = 'crna-analytics-context';
export const LAST_SCOPE_KEY = 'crna-analytics-last-scope';

export async function openAnalytics(
  plugin: ReactRNPlugin,
  options: {
    rootRemId?: string;
    currentRemId?: string;
    focusCardId?: string;
    source: AnalyticsLaunchSource;
    rememberScope?: boolean;
  },
) {
  let focusedRemId = options.rootRemId;

  if (!focusedRemId && options.source !== 'command' && options.source !== 'sidebar') {
    focusedRemId = await plugin.storage.getLocal<string>(LAST_SCOPE_KEY);
  }

  if (!focusedRemId) focusedRemId = options.currentRemId;

  if (!focusedRemId) {
    const focusedRem = await plugin.focus.getFocusedRem();
    focusedRemId = focusedRem?._id;
  }

  if (focusedRemId && (options.rememberScope || options.source === 'command' || options.source === 'sidebar')) {
    await plugin.storage.setLocal(LAST_SCOPE_KEY, focusedRemId);
  }

  const context: AnalyticsContext = {
    focusedRemId,
    focusCardId: options.focusCardId,
    source: options.source,
    launchedAt: Date.now(),
  };

  await plugin.storage.setSession(ANALYTICS_CONTEXT_KEY, context);
  await plugin.widget.openPopup('analytics');
}
