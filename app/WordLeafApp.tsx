"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createEmptyCard, fsrs, Rating, State, type Grade } from "ts-fsrs";
import vocabularyData from "./data/vocabulary.json";
import { db } from "./db";
import { buildStudyQueue } from "./study";
import type { LearningCard, ReviewRecord, VocabularyEntry } from "./types";

type View = "home" | "library" | "study" | "complete";
type LibraryFilter = "all" | "unplanned" | "planned";

const vocabulary = vocabularyData as VocabularyEntry[];
const vocabularyById = new Map(vocabulary.map((entry) => [entry.id, entry]));
const scheduler = fsrs();
const SESSION_SIZE = 10;
const ratings: Array<{ value: Grade; label: string; hint: string; key: string; tone: string }> = [
  { value: Rating.Again as Grade, label: "忘记", hint: "重新开始", key: "1", tone: "again" },
  { value: Rating.Hard as Grade, label: "困难", hint: "很勉强", key: "2", tone: "hard" },
  { value: Rating.Good as Grade, label: "记得", hint: "基本想起", key: "3", tone: "good" },
  { value: Rating.Easy as Grade, label: "轻松", hint: "立即想起", key: "4", tone: "easy" },
];

function isDue(record: LearningCard, now = new Date()) {
  return record.card.state !== State.New && new Date(record.card.due).getTime() <= now.getTime();
}

function dateLabel(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(date);
}

export default function WordLeafApp() {
  const [view, setView] = useState<View>("home");
  const [cards, setCards] = useState<LearningCard[]>([]);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(36);
  const [session, setSession] = useState<LearningCard[]>([]);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [notice, setNotice] = useState("");
  const [speechVoice, setSpeechVoice] = useState<SpeechSynthesisVoice | null>(null);

  const reloadCards = useCallback(async () => {
    const records = await db.cards.toArray();
    setCards(records.map((record) => ({
      ...record,
      addedAt: new Date(record.addedAt),
      card: {
        ...record.card,
        due: new Date(record.card.due),
        last_review: record.card.last_review ? new Date(record.card.last_review) : undefined,
      },
    })));
    setReady(true);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void reloadCards(), 0);
    return () => window.clearTimeout(timer);
  }, [reloadCards]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const loadVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      setSpeechVoice(
        voices.find((voice) => voice.lang.toLowerCase() === "en-us") ??
        voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ??
        null,
      );
    };
    loadVoice();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoice);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoice);
  }, []);

  const plannedIds = useMemo(() => new Set(cards.map((card) => card.wordId)), [cards]);
  const dueCount = useMemo(() => cards.filter((card) => isDue(card)).length, [cards]);
  const newCount = useMemo(() => cards.filter((card) => card.card.state === State.New).length, [cards]);
  const learnedCount = cards.length - newCount;
  const currentCard = session[sessionIndex];
  const currentWord = currentCard ? vocabularyById.get(currentCard.wordId) : undefined;

  const filteredWords = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return vocabulary.filter((entry) => {
      const matchesSearch = !normalized || entry.word.includes(normalized) || entry.translation.includes(query.trim());
      const planned = plannedIds.has(entry.id);
      const matchesFilter = filter === "all" || (filter === "planned" ? planned : !planned);
      return matchesSearch && matchesFilter;
    });
  }, [query, filter, plannedIds]);

  const goTo = (nextView: View) => {
    setNotice("");
    setView(nextView);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startStudy = useCallback(async () => {
    const allCards = await db.cards.toArray();
    const now = new Date();
    const nextSession = buildStudyQueue(allCards, now, SESSION_SIZE);
    if (!nextSession.length) {
      setNotice(cards.length ? "今天没有到期复习，做得很好。" : "先从词库挑选想学的单词吧。");
      if (!cards.length) setView("library");
      return;
    }
    setSession(nextSession);
    setSessionIndex(0);
    setCompletedCount(0);
    setFlipped(false);
    setView("study");
    window.scrollTo({ top: 0 });
  }, [cards.length]);

  const addSelected = async () => {
    const ids = [...selected].filter((id) => !plannedIds.has(id));
    if (!ids.length) return;
    const now = Date.now();
    await db.cards.bulkAdd(ids.map((wordId, index) => ({
      wordId,
      addedAt: new Date(now + index),
      card: createEmptyCard(new Date(now)),
    })));
    setSelected(new Set());
    setNotice("已将 " + ids.length + " 个单词加入学习计划。");
    await reloadCards();
  };

  const removeWord = async (entry: VocabularyEntry) => {
    if (!window.confirm("从学习计划移除 “" + entry.word + "”？它的复习记录也会被删除。")) return;
    await db.transaction("rw", db.cards, db.reviews, async () => {
      await db.cards.delete(entry.id);
      await db.reviews.where("wordId").equals(entry.id).delete();
    });
    setNotice("已从计划移除 " + entry.word + "。");
    await reloadCards();
  };

  const rateCurrent = useCallback(async (rating: Grade) => {
    if (!currentCard || !flipped || ratingBusy) return;
    setRatingBusy(true);
    try {
      const now = new Date();
      const previousState = currentCard.card.state;
      const result = scheduler.next(currentCard.card, now, rating);
      const review: ReviewRecord = {
        wordId: currentCard.wordId,
        rating,
        reviewedAt: now,
        scheduledDays: result.log.scheduled_days,
        previousState,
        nextState: result.card.state,
      };
      await db.transaction("rw", db.cards, db.reviews, async () => {
        await db.cards.put({ ...currentCard, card: result.card });
        await db.reviews.add(review);
      });
      const finished = sessionIndex + 1;
      setCompletedCount(finished);
      await reloadCards();
      if (finished >= session.length) setView("complete");
      else {
        setSessionIndex(finished);
        setFlipped(false);
      }
    } finally {
      setRatingBusy(false);
    }
  }, [currentCard, flipped, ratingBusy, session.length, sessionIndex, reloadCards]);

  useEffect(() => {
    if (view !== "study") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        if (!flipped) setFlipped(true);
        return;
      }
      const choice = ratings.find((rating) => rating.key === event.key);
      if (choice && flipped) void rateCurrent(choice.value);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view, flipped, rateCurrent]);

  const speak = () => {
    if (!currentWord || !speechVoice) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(currentWord.word);
    utterance.lang = speechVoice.lang;
    utterance.voice = speechVoice;
    utterance.rate = 0.82;
    window.speechSynthesis.speak(utterance);
  };

  const toggleSelection = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleVisible = () => {
    const available = filteredWords.slice(0, visibleCount).filter((entry) => !plannedIds.has(entry.id));
    const allSelected = available.length > 0 && available.every((entry) => selected.has(entry.id));
    setSelected((previous) => {
      const next = new Set(previous);
      for (const entry of available) {
        if (allSelected) next.delete(entry.id);
        else next.add(entry.id);
      }
      return next;
    });
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="brand brand-button" onClick={() => goTo("home")} aria-label="返回 WordLeaf 首页">
          <span className="brand-mark" aria-hidden="true">W</span><span>WordLeaf</span>
        </button>
        <nav className="main-nav" aria-label="主导航">
          <button className={view === "home" ? "active" : ""} onClick={() => goTo("home")}>今日</button>
          <button className={view === "library" ? "active" : ""} onClick={() => goTo("library")}>词库</button>
        </nav>
        <span className="local-badge"><span aria-hidden="true">●</span> 本地保存</span>
      </header>

      {notice && view !== "study" && (
        <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="关闭提示">×</button></div>
      )}

      {view === "home" && (
        <main className="home-view">
          <section className="home-intro">
            <div>
              <p className="eyebrow">让记忆自然生长</p>
              <h1>{cards.length ? "今天，从记得开始。" : "先挑选真正想学的单词。"}</h1>
              <p>{cards.length ? "先复习到期单词，再认识少量新词。WordLeaf 已经排好这一轮。" : "内置 500 个高频核心词。你来选择，学习节奏由你决定。"}</p>
            </div>
            <div className="date-stamp">
              <span>{new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(new Date())}</span>
              <strong>{new Date().getDate()}</strong>
              <span>{new Intl.DateTimeFormat("zh-CN", { month: "long" }).format(new Date())}</span>
            </div>
          </section>

          <section className="dashboard-grid" aria-label="学习概览">
            <article className="start-panel">
              <div className="panel-label"><span>本轮学习</span><span>最多 {SESSION_SIZE} 张</span></div>
              <div className="start-orbit" aria-hidden="true"><strong>{Math.min(SESSION_SIZE, dueCount + newCount)}</strong><span>张卡片已准备</span></div>
              <button className="primary-button large" onClick={() => cards.length ? void startStudy() : goTo("library")} disabled={!ready}>
                {cards.length ? "开始这一轮" : "去选择单词"} <span aria-hidden="true">→</span>
              </button>
              <p className="panel-note">到期复习优先，剩余位置按加入顺序补充新词。</p>
            </article>
            <div className="metrics">
              <Metric icon="↻" value={ready ? dueCount : "—"} label="到期复习" note={dueCount ? "记忆正在等你回来" : "今天没有拖欠"} tone="due" />
              <Metric icon="＋" value={ready ? newCount : "—"} label="计划新词" note="按加入顺序进入学习" tone="fresh" />
              <Metric icon="✓" value={ready ? learnedCount : "—"} label="已经学习" note="每一次回想都在加深记忆" tone="learned" />
            </div>
          </section>

          <section className="library-callout">
            <div><p className="eyebrow">500 WORDS</p><h2>词库不替你决定，<br />只帮你找到。</h2></div>
            <div><p>搜索英文或中文释义，批量勾选想学的词。加入计划后，它们会安静地等到下一轮。</p><button className="text-button" onClick={() => goTo("library")}>打开高频词库 <span aria-hidden="true">↗</span></button></div>
          </section>
        </main>
      )}

      {view === "library" && (
        <main className="library-view">
          <header className="section-heading">
            <div><p className="eyebrow">HIGH-FREQUENCY LIBRARY</p><h1>选择你的单词</h1></div>
            <p>500 个高频核心词，全部离线可用。勾选后加入自己的学习计划。</p>
          </header>
          <section className="library-tools">
            <label className="search-box"><span aria-hidden="true">⌕</span><span className="sr-only">搜索单词或中文释义</span><input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(36); }} placeholder="搜索单词或中文释义…" />{query && <button onClick={() => { setQuery(""); setVisibleCount(36); }} aria-label="清除搜索">×</button>}</label>
            <div className="filter-tabs" aria-label="筛选词库">
              {([["all", "全部"], ["unplanned", "未加入"], ["planned", "已加入"]] as const).map(([value, label]) => (
                <button key={value} className={filter === value ? "active" : ""} onClick={() => { setFilter(value); setVisibleCount(36); }}>{label}</button>
              ))}
            </div>
          </section>
          <div className="selection-bar">
            <label><input type="checkbox" onChange={toggleVisible} />选择当前显示</label>
            <span>找到 {filteredWords.length} 个词</span>
            <button className="primary-button compact" disabled={!selected.size} onClick={() => void addSelected()}>加入计划{selected.size ? " · " + selected.size : ""}</button>
          </div>
          <section className="word-list" aria-live="polite">
            {filteredWords.slice(0, visibleCount).map((entry) => {
              const planned = plannedIds.has(entry.id);
              const card = cards.find((item) => item.wordId === entry.id);
              return (
                <article className={"word-row " + (selected.has(entry.id) ? "selected" : "")} key={entry.id}>
                  <label className="word-check"><input type="checkbox" checked={selected.has(entry.id)} disabled={planned} onChange={() => toggleSelection(entry.id)} /><span className="custom-check" aria-hidden="true">✓</span></label>
                  <span className="rank">{String(entry.frequencyRank).padStart(3, "0")}</span>
                  <div className="word-main"><strong>{entry.word}</strong><span>{entry.phonetic}</span></div>
                  <p>{entry.translation}</p>
                  <div className="word-status">
                    {planned ? <><span>{card?.card.state === State.New || !card ? "计划中" : "下次 " + dateLabel(new Date(card.card.due))}</span><button onClick={() => void removeWord(entry)}>移除</button></> : <span className="unplanned">未加入</span>}
                  </div>
                </article>
              );
            })}
            {!filteredWords.length && <div className="empty-list"><strong>没有找到这个单词</strong><p>试试更短的英文，或搜索中文释义。</p></div>}
          </section>
          {visibleCount < filteredWords.length && <button className="load-more" onClick={() => setVisibleCount((count) => count + 36)}>再显示 36 个</button>}
          <p className="source-note">词条基于 ECDICT 开源词典筛选；例句来自开放语言学习语料并经整理。</p>
        </main>
      )}

      {view === "study" && currentWord && currentCard && (
        <main className="study-view">
          <header className="study-header">
            <button className="quiet-button" onClick={() => goTo("home")}>← 结束本轮</button>
            <div className="study-progress"><span style={{ width: String(((sessionIndex + (flipped ? 0.45 : 0)) / session.length) * 100) + "%" }} /></div>
            <strong>{sessionIndex + 1} / {session.length}</strong>
          </header>
          <section className="study-stage">
            <button className={"flashcard " + (flipped ? "is-flipped" : "")} onClick={() => !flipped && setFlipped(true)} aria-label={currentWord.word + "，点击翻面"}>
              <span className="card-corner">{currentCard.card.state === State.New ? "NEW WORD" : "REVIEW"}</span><span className="card-rank">#{currentWord.frequencyRank}</span>
              <div className="flashcard-body">
                <span className="study-phonetic">{currentWord.phonetic}</span><h1>{currentWord.word}</h1>
                {!flipped ? <span className="reveal-prompt">点击卡片查看答案 <kbd>Space</kbd></span> : (
                  <div className="answer-content"><p className="meaning">{currentWord.translation}</p><div className="example-block"><p>{currentWord.example}</p><span>{currentWord.exampleTranslation}</span></div></div>
                )}
              </div>
            </button>
            <button className="speak-button" onClick={speak} disabled={!speechVoice} title={speechVoice ? "播放英语发音" : "此浏览器没有可用的英语语音"}><span aria-hidden="true">◖))</span> {speechVoice ? "听发音" : "暂无发音"}</button>
          </section>
          <section className={"rating-panel " + (flipped ? "visible" : "")} aria-hidden={!flipped}>
            <p>你记得怎么样？</p><div className="rating-grid">{ratings.map((rating) => (
              <button key={rating.value} className={"rating-button " + rating.tone} disabled={!flipped || ratingBusy} onClick={() => void rateCurrent(rating.value)}><kbd>{rating.key}</kbd><strong>{rating.label}</strong><span>{rating.hint}</span></button>
            ))}</div>
          </section>
        </main>
      )}

      {view === "complete" && (
        <main className="complete-view">
          <div className="complete-mark" aria-hidden="true">✓</div><p className="eyebrow">SESSION COMPLETE</p><h1>这一轮，完成了。</h1>
          <p>你刚刚认真回想了 <strong>{completedCount}</strong> 个单词。记忆不靠一次用力，而靠一次次刚好的重逢。</p>
          <div className="complete-actions"><button className="primary-button" onClick={() => void startStudy()}>继续下一轮</button><button className="secondary-button" onClick={() => goTo("home")}>返回首页</button></div>
        </main>
      )}
      <footer className="app-footer"><span>WordLeaf</span><span>数据只保存在你的浏览器</span></footer>
    </div>
  );
}

function Metric({ icon, value, label, note, tone }: { icon: string; value: number | string; label: string; note: string; tone: string }) {
  return <article className={"metric-card " + tone}><span className="metric-icon" aria-hidden="true">{icon}</span><div><strong>{value}</strong><span>{label}</span></div><small>{note}</small></article>;
}

