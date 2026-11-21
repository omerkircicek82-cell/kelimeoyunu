import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Clock3, CornerDownLeft, Delete, Infinity, RotateCcw, Timer } from 'lucide-react';
import {
  MAX_ATTEMPTS,
  ROUND_MS,
  TURKISH_ALPHABET,
  WORD_LENGTH,
  normalizeWord,
  ratedRoundDelta,
  scoreCloseness,
  type Guess,
  type Mark,
  type RoundMode,
  type SoloChallengeTicket,
  type SoloResultRequest,
} from '@arena/shared';
import { evaluateGuess } from '@arena/game-engine';
import { offlineAccepted, offlineAnswers } from '@arena/game-engine/offline-words';
import { MarkIcon, markLabel, playSound, roundModeLabel, type Preferences } from './ui';
import './offline.css';

const keyRows = ['ERTYUIOPĞÜ', 'ASDFGHJKLŞİ', 'ZCVBNMÖÇ', 'ÂÎÛ'];
const strength: Record<Mark, number> = { absent: 0, present: 1, correct: 2 };
const resultTitles = {
  solved: 'Kelimeyi buldun!',
  exhausted: 'Tahmin hakların bitti',
  timeout: 'Süre doldu',
};
type Outcome = keyof typeof resultTitles;

function formatTimer(seconds: number) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function remainingUntil(deadline: number) {
  return Math.min(ROUND_MS, Math.max(0, deadline - Date.now()));
}

export function OfflineGame({
  mode,
  challenge,
  onComplete,
  onBack,
  onPlayAgain,
  preferences,
}: {
  mode: RoundMode;
  challenge?: SoloChallengeTicket;
  onComplete: (result: SoloResultRequest) => void;
  onBack: () => void;
  onPlayAgain: () => void;
  preferences: Preferences;
}) {
  const [answer] = useState(() =>
    normalizeWord(challenge?.answer ?? offlineAnswers[Math.floor(Math.random() * offlineAnswers.length)]),
  );
  const [deadline] = useState(() => (mode === 'timed' ? Date.now() + ROUND_MS : null));
  const [remaining, setRemaining] = useState(ROUND_MS);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const draftRef = useRef('');
  const guessesRef = useRef<Guess[]>([]);
  const finished = useRef(false);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const seconds = Math.ceil(remaining / 1000);

  const finish = useCallback(
    (result: Outcome) => {
      if (finished.current) return;
      finished.current = true;
      if (deadline !== null) setRemaining(remainingUntil(deadline));
      setError('');
      setOutcome(result);
      if (challenge) {
        onComplete({
          challengeId: challenge.id,
          roundMode: mode,
          guesses: guessesRef.current.map(({ word }) => word),
          expired: result === 'timeout',
        });
      }
    },
    [challenge, deadline, mode, onComplete],
  );

  useEffect(() => {
    if (deadline === null || outcome) return;
    const end = deadline;

    function tick() {
      const timeLeft = remainingUntil(end);
      setRemaining(timeLeft);
      if (timeLeft === 0) finish('timeout');
    }

    tick();
    const timer = window.setInterval(tick, 125);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [deadline, finish, outcome]);

  useEffect(() => {
    if (outcome) resultHeading.current?.focus();
  }, [outcome]);

  const updateDraft = useCallback((word: string) => {
    draftRef.current = word;
    setDraft(word);
    setError('');
  }, []);

  const key = useCallback(
    (input: string) => {
      if (finished.current) return;
      if (deadline !== null && Date.now() >= deadline) {
        finish('timeout');
        return;
      }

      const word = draftRef.current;
      if (input === 'Enter') {
        if (word.length !== WORD_LENGTH || (!offlineAccepted.has(word) && word !== answer)) {
          setError(
            word.length !== WORD_LENGTH
              ? 'Beş harfli bir kelime yaz.'
              : 'Bu kelime sözlükte yok. Başka bir kelime dene.',
          );
          setShake((current) => current + 1);
          return;
        }
        const updated = [...guessesRef.current, { word, marks: evaluateGuess(answer, word) }];
        guessesRef.current = updated;
        setGuesses(updated);
        updateDraft('');
        const solved = word === answer;
        playSound(solved ? 'solve' : 'tap', preferences.sound);
        if (solved || updated.length === MAX_ATTEMPTS) finish(solved ? 'solved' : 'exhausted');
      } else if (input === 'Backspace') {
        updateDraft(word.slice(0, -1));
      } else {
        const letter = normalizeWord(input);
        if (word.length < WORD_LENGTH && letter.length === 1 && TURKISH_ALPHABET.includes(letter)) {
          updateDraft(word + letter);
          playSound('tap', preferences.sound);
        }
      }
    },
    [answer, deadline, finish, preferences.sound, updateDraft],
  );

  useEffect(() => {
    if (outcome) return;

    function handleKeyboard(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        document.querySelector('dialog[open]')
      )
        return;

      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable]')) return;
      if (event.key === 'Enter' && (event.repeat || target?.closest('button, a, summary'))) return;
      const letter = normalizeWord(event.key);
      if (
        event.key !== 'Enter' &&
        event.key !== 'Backspace' &&
        (letter.length !== 1 || !TURKISH_ALPHABET.includes(letter))
      )
        return;

      event.preventDefault();
      key(event.key);
    }

    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [key, outcome]);

  const keyboardMarks: Partial<Record<string, Mark>> = {};
  for (const guess of guesses) {
    for (const [index, letter] of Array.from(guess.word).entries()) {
      const mark = guess.marks[index];
      const previous = keyboardMarks[letter];
      if (!previous || strength[mark] > strength[previous]) keyboardMarks[letter] = mark;
    }
  }

  return (
    <main className="site-width offline-game">
      <div className="offline-game-heading">
        <h1>Çevrimdışı oyun</h1>
        <button type="button" className="button button-quiet" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" /> Arena’ya dön
        </button>
      </div>
      <section className="panel game-panel" aria-label="Çevrimdışı tahmin alanı">
        <div className="offline-game-metrics">
          <div className="round-label">
            <span>Kalan tahmin</span>
            <strong>
              {MAX_ATTEMPTS - guesses.length} <small>/ {MAX_ATTEMPTS}</small>
            </strong>
          </div>
          {deadline === null ? (
            <div className="timer-display timer-untimed">
              <Infinity size={20} aria-hidden="true" /> {roundModeLabel.untimed}
            </div>
          ) : (
            <div
              className={`timer-display ${remaining <= 15000 ? 'timer-warning' : ''} ${!outcome && remaining > 0 && remaining <= 5000 ? 'timer-urgent' : ''}`}
              role="timer"
              aria-label={`Kalan süre ${seconds} saniye`}
            >
              <Timer size={21} aria-hidden="true" /> {formatTimer(seconds)}
            </div>
          )}
        </div>
        {deadline !== null && (
          <div
            className="duration-line"
            role="progressbar"
            aria-label="Tur süresi"
            aria-valuemin={0}
            aria-valuemax={ROUND_MS / 1000}
            aria-valuenow={seconds}
          >
            <span
              className={remaining <= 15000 ? 'low' : ''}
              style={{ width: `${(remaining / ROUND_MS) * 100}%` }}
            />
          </div>
        )}
        <div className="board" role="group" aria-label="Tahmin tahtası">
          {Array.from({ length: MAX_ATTEMPTS }, (_, row) => {
            const guess = guesses[row];
            const active = !outcome && row === guesses.length;
            const letters = Array.from(guess?.word ?? (active ? draft : ''));
            return (
              <div
                key={active ? `active-${row}-${shake}` : row}
                className={`board-row ${active && error ? 'row-shake' : ''}`}
                role="group"
                aria-label={`${row + 1}. tahmin`}
              >
                {Array.from({ length: WORD_LENGTH }, (_, index) => {
                  const letter = letters[index];
                  const mark = guess?.marks[index];
                  return (
                    <div
                      key={index}
                      className={`board-cell ${mark ? `mark-${mark} cell-reveal` : ''} ${letter ? 'cell-filled' : ''} ${active && index === draft.length ? 'current-cell' : ''}`}
                      style={mark ? { animationDelay: `${index * 75}ms` } : undefined}
                      role={letter ? 'img' : undefined}
                      aria-hidden={!letter || undefined}
                      aria-label={letter && mark ? `${letter}, ${markLabel(mark)}` : letter}
                    >
                      {letter}
                      {mark && preferences.symbols && <MarkIcon mark={mark} />}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {!outcome && (
          <>
            <p className={`guess-feedback ${error ? 'form-error' : ''}`} aria-live="polite">
              {error}
            </p>
            <div
              className="keyboard"
              role="group"
              aria-label="Türkçe ekran klavyesi"
              onMouseDown={(event) => event.preventDefault()}
            >
              {keyRows.map((letters, row) => (
                <div className={`keyboard-row ${row === 3 ? 'offline-accent-keys' : ''}`} key={letters}>
                  {row === 2 && (
                    <button
                      type="button"
                      className="game-key command-key"
                      aria-label="Tahmini gönder"
                      onClick={() => key('Enter')}
                    >
                      <CornerDownLeft size={16} aria-hidden="true" />
                    </button>
                  )}
                  {Array.from(letters).map((letter) => {
                    const mark = keyboardMarks[letter];
                    return (
                      <button
                        type="button"
                        key={letter}
                        className={`game-key ${mark ? `mark-${mark}` : ''}`}
                        aria-label={mark ? `${letter}, ${markLabel(mark)}` : letter}
                        onClick={() => key(letter)}
                      >
                        {letter}
                        {mark && preferences.symbols && <MarkIcon mark={mark} />}
                      </button>
                    );
                  })}
                  {row === 2 && (
                    <button
                      type="button"
                      className="game-key command-key"
                      aria-label="Son harfi sil"
                      onClick={() => key('Backspace')}
                    >
                      <Delete size={18} aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>
      {outcome && (
        <section className="panel offline-result" aria-labelledby="offline-result-title">
          <h2 id="offline-result-title" tabIndex={-1} ref={resultHeading}>
            {outcome === 'solved' ? (
              <Check size={20} aria-hidden="true" />
            ) : (
              <Clock3 size={20} aria-hidden="true" />
            )}
            {resultTitles[outcome]}
          </h2>
          <p className="offline-answer">
            Doğru kelime <strong>{answer}</strong>
          </p>
          <RoundFeedback guesses={guesses} solved={outcome === 'solved'} rated={Boolean(challenge)} />
          <button type="button" className="button button-primary" onClick={onPlayAgain}>
            <RotateCcw size={16} aria-hidden="true" /> Tekrar oyna
          </button>
        </section>
      )}
    </main>
  );
}

function RoundFeedback({ guesses, solved, rated }: { guesses: Guess[]; solved: boolean; rated: boolean }) {
  let best: Guess | undefined;
  for (const guess of guesses) {
    if (!best || ratedRoundDelta([guess], false) > ratedRoundDelta([best], false)) best = guess;
  }
  const { correct, present } = scoreCloseness(best?.marks ?? []);
  const delta = ratedRoundDelta(guesses, solved);

  return (
    <>
      {best && (
        <p className="offline-best">
          En iyi tahmin
          <span>
            <MarkIcon mark="correct" /> {correct} doğru yerde
          </span>
          <span>
            <MarkIcon mark="present" /> {present} başka yerde
          </span>
        </p>
      )}
      {rated ? (
        <div className="offline-rating">
          <strong className={delta < 0 ? 'negative' : undefined}>
            {delta < 0 ? '−' : '+'}
            {Math.abs(delta)}
          </strong>
          <div>
            <p>Derece puanı değişimi</p>
            <small>Sonuç bağlantı sağlandığında hesabına işlenir.</small>
          </div>
        </div>
      ) : (
        <p className="offline-guest">Antrenman turu</p>
      )}
    </>
  );
}
