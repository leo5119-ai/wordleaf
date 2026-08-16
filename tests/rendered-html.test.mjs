import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createEmptyCard, fsrs, Rating } from "ts-fsrs";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", String(Date.now()));
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the WordLeaf application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>WordLeaf/);
  assert.match(html, /WordLeaf/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Your site is taking shape/);
});

test("ships exactly 500 complete, unique vocabulary entries", async () => {
  const entries = JSON.parse(await readFile(new URL("../app/data/vocabulary.json", import.meta.url), "utf8"));
  assert.equal(entries.length, 500);
  assert.equal(new Set(entries.map((entry) => entry.word)).size, 500);
  entries.forEach((entry, index) => {
    assert.equal(entry.frequencyRank, index + 1);
    for (const field of ["id", "word", "phonetic", "translation", "example", "exampleTranslation"]) {
      assert.equal(typeof entry[field], "string");
      assert.ok(entry[field].trim(), entry.word + " has an empty " + field);
    }
  });
});

test("FSRS produces valid future scheduling for all four ratings", () => {
  const engine = fsrs({ enable_fuzz: false });
  const now = new Date("2026-08-16T00:00:00.000Z");
  const card = createEmptyCard(now);
  for (const rating of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
    const result = engine.next(card, now, rating);
    assert.ok(result.card.due instanceof Date);
    assert.ok(result.card.due.getTime() > now.getTime());
    assert.ok(result.log.scheduled_days >= 0);
  }
});

