import { declareIndexPlugin, ReactRNPlugin, WidgetLocation } from '@remnote/plugin-sdk';
import '../style.css';

async function onActivate(plugin: ReactRNPlugin) {
  await plugin.app.registerWidget('analytics', WidgetLocation.Popup, {
    dimensions: { height: 800, width: 1200 },
  });

  await plugin.app.registerCommand({
    id: 'open-crna-performance-analytics',
    name: 'Open CRNA Performance Analytics',
    action: async () => {
      const focusedRem = await plugin.focus.getFocusedRem();
      await plugin.storage.setSession('crna-analytics-context', {
        focusedRemId: focusedRem?._id,
      });
      await plugin.widget.openPopup('analytics');
    },
  });
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
