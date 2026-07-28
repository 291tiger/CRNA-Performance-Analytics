# CRNA Performance Analytics 2.0

CRNA Performance Analytics turns RemNote review history into practical, question-level study decisions.

## What is new in 2.0

- **Exam Readiness**: combines mastery with confidence and coverage. It is a study-planning estimate, not a predicted grade.
- **Mastery**: Bayesian-adjusted card performance so one Easy response does not equal certain mastery.
- **Confidence**: measures how much review depth and spacing support the mastery estimate.
- **Coverage**: prevents a small group of heavily reviewed cards from hiding unstudied material.
- **Trend**: compares the selected recent window with the preceding equal-length window.
- **Exact missed questions**: see every question with Again or Hard, repeat misses, current volatility, and direct links back to its Rem.
- **Unique-card analysis**: separates repeated failures on one card from failures spread across many cards.
- **Study Next**: creates a time-based priority plan using recent failures, repeat misses, low evidence, overdue status, and forgetting risk.
- **Weakness Heat Map**: visual readiness, coverage, and Again signals across every direct child topic.
- **Forgotten-topic detection**: identifies topics with the most long-unseen, fragile cards.
- **Lecture / Professor Lens**: analyzes your direct Rem hierarchy as lectures, modules, objectives, or topics without inventing labels that are not present.
- **Saved score snapshots**: show exact mastery/readiness change since the prior saved dashboard state and the review events associated with that change.
- **Weekly and monthly progress**: review activity, retention, unique cards, Again, and Hard over time.

## Access

You no longer need to rely only on Command-K.

1. **Sidebar**: click **CRNA Analytics** near the end of the sidebar.
2. **Review queue toolbar**: click **CRNA Analytics** while studying.
3. **Beside the flashcard answer controls**: click the compact analytics badge to open the exact current question.
4. **Command palette**: run **Open CRNA Performance Analytics**.

The first time, focus the course, lecture, topic, folder, or document you want analyzed and open the dashboard. Click **Use as review scope** so review-screen buttons keep opening that full topic while highlighting the current card.

## Dashboard views

- **Overview**: readiness, mastery, confidence, coverage, action items, current drivers, answer patterns, weakest topics, and questions to fix.
- **Topics / Lecture Lens**: drill from course to module to lecture to topic.
- **Questions**: filter exact cards by any Again, repeat misses, Hard, volatility, unseen, overdue, or low evidence.
- **Study Next**: generate a 15, 30, 45, 60, or 90-minute study plan.
- **Progress**: inspect 12-week and 6-month activity and retention.

## Scoring principles

The plugin intentionally avoids false certainty:

- Cards are weighted equally at the topic level, so one frequently reviewed question cannot dominate the score.
- Bayesian adjustment shrinks very small samples toward a neutral prior.
- Confidence remains low until review depth and spacing accumulate.
- Coverage includes both reviewed cards and cards with at least three reviews.
- Readiness is mastery adjusted by confidence and coverage.

All calculations run locally from RemNote card and repetition data. The manifest requests read-only access.

## Build

```bash
npm ci
npm run build:ci
```

The installable file is generated as `PluginZip.zip`.
