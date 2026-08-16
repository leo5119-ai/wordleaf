import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyCard, Rating, State, fsrs } from "ts-fsrs";
import { buildStudyQueue } from "../app/study.ts";
import type { LearningCard } from "../app/types.ts";

const now = new Date("2026-08-16T12:00:00.000Z");
const engine = fsrs({ enable_fuzz: false });

function fresh(wordId: string, offset: number): LearningCard {
  return { wordId, addedAt: new Date(now.getTime() + offset), card: createEmptyCard(now) };
}

function reviewed(wordId: string, due: Date): LearningCard {
  const reviewAt = new Date("2026-08-01T00:00:00.000Z");
  const result = engine.next(createEmptyCard(reviewAt), reviewAt, Rating.Good);
  return { wordId, addedAt: reviewAt, card: { ...result.card, state: State.Review, due } };
}

test("queue is capped, due-first, then oldest new cards", () => {
  const cards = [
    fresh("new-late", 2000),
    fresh("new-early", 1000),
    reviewed("due-late", new Date("2026-08-15T00:00:00.000Z")),
    reviewed("not-due", new Date("2026-08-20T00:00:00.000Z")),
    reviewed("due-early", new Date("2026-08-10T00:00:00.000Z")),
  ];
  assert.deepEqual(buildStudyQueue(cards, now, 4).map((card) => card.wordId), [
    "due-early", "due-late", "new-early", "new-late",
  ]);
});

test("queue never exceeds ten cards", () => {
  const cards = Array.from({ length: 25 }, (_, index) => fresh("word-" + index, index));
  assert.equal(buildStudyQueue(cards, now).length, 10);
});

