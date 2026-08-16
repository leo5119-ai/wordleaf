import type { Card } from "ts-fsrs";

export interface VocabularyEntry {
  id: string;
  word: string;
  phonetic: string;
  translation: string;
  example: string;
  exampleTranslation: string;
  frequencyRank: number;
}

export interface LearningCard {
  wordId: string;
  addedAt: Date;
  card: Card;
}

export interface ReviewRecord {
  id?: number;
  wordId: string;
  rating: number;
  reviewedAt: Date;
  scheduledDays: number;
  previousState: number;
  nextState: number;
}

