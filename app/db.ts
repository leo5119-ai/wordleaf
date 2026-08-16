import Dexie, { type EntityTable } from "dexie";
import type { LearningCard, ReviewRecord } from "./types";

class WordLeafDatabase extends Dexie {
  cards!: EntityTable<LearningCard, "wordId">;
  reviews!: EntityTable<ReviewRecord, "id">;

  constructor() {
    super("wordleaf");
    this.version(1).stores({
      cards: "wordId, addedAt",
      reviews: "++id, wordId, reviewedAt",
    });
  }
}

export const db = new WordLeafDatabase();

