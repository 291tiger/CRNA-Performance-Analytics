import { strict as assert } from 'assert';
import {
  DAY_MS,
  aggregateCards,
  analyzeCard,
} from '../src/widgets/analytics-engine';

const now = Date.now();

function mockCard(id: string, scores: number[], daysAgo: number[]) {
  return {
    _id: id,
    remId: `rem-${id}`,
    repetitionHistory: scores.map((score, index) => ({
      score,
      date: now - daysAgo[index] * DAY_MS,
      responseTime: 30_000,
    })),
    nextRepetitionTime: now - 1_000,
    timesWrongInRow: scores.length && scores[scores.length - 1] === 0 ? 1 : 0,
  } as any;
}

const singleEasy = analyzeCard(mockCard('single-easy', [1.5], [1]), 'Single Easy', 30, now);
assert((singleEasy.mastery || 100) < 90, 'One Easy response must not imply certain mastery.');
assert(singleEasy.confidence < 25, 'One review must remain low confidence.');

const concentratedCards = Array.from({ length: 100 }, (_, index) => (
  index < 10
    ? analyzeCard(
      mockCard(`concentrated-${index}`, Array(10).fill(1), Array.from({ length: 10 }, (_value, review) => review * 3 + 1)),
      `Question ${index}`,
      30,
      now,
    )
    : analyzeCard(mockCard(`unseen-${index}`, [], []), `Question ${index}`, 30, now)
));
const concentrated = aggregateCards(concentratedCards, 30, now);
assert(concentrated.coverage < 20, 'Heavy review of a small subset must not hide low coverage.');
assert((concentrated.readiness || 100) < 70, 'Readiness must be reduced when most cards are unseen.');

const repeatMiss = analyzeCard(mockCard('repeat-miss', [1, 0, 0], [20, 3, 1]), 'Repeat miss', 30, now);
assert.equal(repeatMiss.stability, 'Volatile', 'Repeated recent Again responses must be volatile.');
assert(repeatMiss.priority > singleEasy.priority, 'Repeated misses must outrank a single successful review.');

const oneReviewEach = aggregateCards(
  Array.from({ length: 100 }, (_, index) => analyzeCard(mockCard(`once-${index}`, [1.5], [1]), `Question ${index}`, 30, now)),
  30,
  now,
);
const spacedEvidence = aggregateCards(
  Array.from({ length: 100 }, (_, index) => analyzeCard(mockCard(`spaced-${index}`, [1, 1, 1.5], [30, 12, 1]), `Question ${index}`, 30, now)),
  30,
  now,
);
assert(spacedEvidence.confidence > oneReviewEach.confidence, 'Spaced evidence must raise confidence.');
assert((spacedEvidence.readiness || 0) > (oneReviewEach.readiness || 0), 'Spaced evidence must raise readiness.');

console.log('Analytics engine tests passed.');
