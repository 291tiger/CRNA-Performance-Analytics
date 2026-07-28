import {
  declareIndexPlugin,
  ReactRNPlugin,
  WidgetLocation,
} from '@remnote/plugin-sdk';
import '../style.css';
import { openAnalytics } from './widget-utils';

async function onActivate(plugin: ReactRNPlugin) {
  await plugin.app.registerWidget('analytics', WidgetLocation.Popup, {
    dimensions: { height: 860, width: 1280 },
  });

  await plugin.app.registerWidget(
    'flashcard-analytics-button',
    WidgetLocation.FlashcardAnswerButtons,
    {
      dimensions: { height: 'auto', width: 'auto' },
    }
  );

  await plugin.app.registerWidget(
    'queue-toolbar-button',
    WidgetLocation.QueueToolbar,
    {
      dimensions: { height: 'auto', width: 'auto' },
    }
  );

  await plugin.app.registerWidget(
    'sidebar-button',
    WidgetLocation.SidebarEnd,
    {
      dimensions: { height: 'auto', width: 'auto' },
    }
  );

  await plugin.app.registerCommand({
    id: 'open-crna-performance-analytics',
    name: 'Open CRNA Performance Analytics',
    action: async () => {
      const focusedRem = await plugin.focus.getFocusedRem();

      await openAnalytics(plugin, {
        rootRemId: focusedRem?._id,
        currentRemId: focusedRem?._id,
        source: 'command',
        rememberScope: Boolean(focusedRem?._id),
      });
    },
  });
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
