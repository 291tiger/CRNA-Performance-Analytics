# CRNA Performance Analytics

A RemNote plugin that compares review performance across the direct child Rems beneath a selected lecture, course, topic, or drug-class Rem.

## What it reports

- Mastery estimate
- Lifetime retention
- Recent retention over a selectable time window
- Total reviews and forgotten/hard counts
- Average response time when available
- Priority labels from Critical through Mastered

## How categories work

Select a parent Rem before opening the dashboard. Each direct child is treated as one category, and cards nested anywhere beneath that child are included. This lets the same dashboard compare lectures, topics, drug classes, mechanisms, or clinical concepts depending on how the parent Rem is organized.

## Open the dashboard

Focus the parent Rem, open RemNote's command menu, and run **Open CRNA Performance Analytics**.

## Build

Run `npm ci`, then `npm run build:ci`. The installable file is generated as `PluginZip.zip`.
