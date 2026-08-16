import { State } from "ts-fsrs";
import type { LearningCard } from "./types";

export function buildStudyQueue(cards: LearningCard[], now: Date, limit = 10) {
  const due = cards
    .filter((record) => record.card.state !== State.New && new Date(record.card.due).getTime() <= now.getTime())
    .sort((a, b) => new Date(a.card.due).getTime() - new Date(b.card.due).getTime());
  const fresh = cards
    .filter((record) => record.card.state === State.New)
    .sort((a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime());
  return [...due, ...fresh].slice(0, limit);
}

