import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CalendarDays, Trophy } from 'lucide-react';
import {
  MAX_ATTEMPTS,
  ROUND_COUNT,
  TURKISH_ALPHABET,
  WORD_LENGTH,
  normalizeWord,
  type DailyRoundView,
  type DailyState,
} from '@arena/shared';
import { ArenaKeys, GuessRow, guessKeyMarks } from './Game';
import { accountApi, AccountRequestError } from './membership';
import { playSound, type Preferences } from './ui';
import './daily.css';

const number = new Intl.NumberFormat('tr-TR');
const dateFormat = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeZone: 'Europe/Istanbul' });

export function DailyPage({
  token,
  username,
  preferences,
  onAccount,
  onHome,
}: {
  token?: string;
  username?: string;
  preferences: Preferences;
  onAccount: () => void;
  onHome: () => void;
}) {
  const [state, setState] = useState<DailyState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const clearError = useCallback(() => setError(''), []);

  const request = useCallback(
    async (path = 'daily', body?: object) => {
      if (!token || inFlight.current) return null;
      inFlight.current = true;
      setBusy(true);
      setError('');
      try {
        const view = await accountApi<DailyState>(path, { token, body });
        setState(view);
        return view;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Günlük mücadeleye ulaşılamadı.');
        if (reason instanceof AccountRequestError && reason.status === 409) {
          const refreshed = await accountApi<DailyState>('daily', { token }).catch(() => null);
          if (refreshed) setState(refreshed);
        }
        return null;
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (!token) return;
    void request();
    const refreshVisible = () => {
      if (!document.hidden) void request();
    };
    document.addEventListener('visibilitychange', refreshVisible);
    return () => document.removeEventListener('visibilitychange', refreshVisible);
  }, [request, token]);

  const attempt = state?.attempt;
  const activeRound = attempt?.rounds.at(-1);

  return (
    <main className="site-width room-page daily-page">
      <button type="button" className="button button-quiet" onClick={onHome}>
        <ArrowLeft size={17} aria-hidden="true" /> Ana menü
      </button>
      <div className="daily-heading">
        <span className="result-icon">
          <CalendarDays size={23} aria-hidden="true" />
        </span>
        <div>
          <h1>Günlük mücadele</h1>
          {state && <p>{dateFormat.format(new Date(state.date + 'T12:00:00Z'))}</p>}
        </div>
      </div>
      {!token ? (
        <section className="panel daily-card">
          <h2>Hesabınla katıl</h2>
          <p>Her gün herkes aynı {ROUND_COUNT} kelimeyi çözer. Sonucun günlük sıralamada yer alır.</p>
          <button type="button" className="button button-primary" onClick={onAccount}>
            Giriş yap
          </button>
        </section>
      ) : (
        <div className="game-grid">
          <div className="daily-main">
            {error && (attempt?.phase !== 'guessing' || !activeRound) && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {!state ? (
              <section className="panel daily-card">
                {busy ? (
                  <p role="status">Günlük mücadele yükleniyor…</p>
                ) : (
                  <button type="button" className="button button-secondary" onClick={() => void request()}>
                    Yeniden dene
                  </button>
                )}
              </section>
            ) : !attempt ? (
              <section className="panel daily-card">
                <h2>Bugünün kelimeleri</h2>
                <p>
                  {ROUND_COUNT} kelimeyi süre baskısı olmadan çöz. Her kelime için {MAX_ATTEMPTS} tahmin
                  hakkın var.
                </p>
                <button
                  type="button"
                  className="button button-primary"
                  disabled={busy}
                  onClick={() => void request('daily/start', { date: state.date })}
                >
                  Mücadeleye başla
                </button>
              </section>
            ) : attempt.phase === 'guessing' && activeRound ? (
              <DailyBoard
                key={`${state.date}-${attempt.round}`}
                round={activeRound}
                points={attempt.points}
                preferences={preferences}
                busy={busy}
                requestError={error}
                clearError={clearError}
                submit={(word, requestId) =>
                  request('daily/guess', { date: state.date, round: attempt.round, word, requestId })
                }
              />
            ) : attempt.phase === 'roundEnd' && activeRound ? (
              <section className="panel daily-card">
                <h2>{activeRound.solved ? 'Kelimeyi buldun!' : 'Tur tamamlandı'}</h2>
                <p>
                  Doğru kelime <strong>{activeRound.answer}</strong>
                </p>
                <p>
                  Tur {attempt.round}/{ROUND_COUNT} · {activeRound.guesses.length} tahmin · +
                  {number.format(activeRound.points)} puan
                </p>
                <button
                  type="button"
                  className="button button-primary"
                  disabled={busy}
                  onClick={() => void request('daily/next', { date: state.date, round: attempt.round })}
                >
                  Sonraki kelime
                </button>
              </section>
            ) : (
              <section className="panel daily-card">
                <h2>Günlük mücadele tamamlandı</h2>
                <p>
                  {attempt.solved}/{ROUND_COUNT} kelime ·{' '}
                  <strong>{number.format(attempt.points)} puan</strong>
                </p>
                {state.rank !== null && (
                  <p>
                    Günlük sıran <strong>{state.rank}.</strong>
                  </p>
                )}
                <ol className="daily-answers">
                  {attempt.rounds.map((round) => (
                    <li key={round.round}>
                      <strong>{round.answer}</strong>
                      <span>
                        {round.guesses.length} tahmin · +{number.format(round.points)} puan
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
          {state && (
            <section className="panel daily-card">
              <div className="daily-rank-heading">
                <h2>
                  <Trophy size={19} aria-hidden="true" /> Günlük sıralama
                </h2>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => void request()}
                >
                  Yenile
                </button>
              </div>
              {state.leaderboard.length ? (
                <div className="table-scroll">
                  <table className="results-table">
                    <thead>
                      <tr>
                        <th scope="col">Sıra</th>
                        <th scope="col">Oyuncu</th>
                        <th scope="col">Çözülen</th>
                        <th scope="col">Puan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.leaderboard.map((entry) => (
                        <tr
                          key={entry.username}
                          className={entry.username === username ? 'daily-own-rank' : undefined}
                        >
                          <td>{entry.rank}.</td>
                          <th scope="row">
                            {entry.username}
                            {entry.username === username && <small>Sen</small>}
                          </th>
                          <td>{entry.solved}</td>
                          <td>{number.format(entry.points)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>Henüz mücadeleyi tamamlayan yok.</p>
              )}
            </section>
          )}
        </div>
      )}
    </main>
  );
}

function DailyBoard({
  round,
  points,
  preferences,
  busy,
  requestError,
  clearError,
  submit,
}: {
  round: DailyRoundView;
  points: number;
  preferences: Preferences;
  busy: boolean;
  requestError: string;
  clearError: () => void;
  submit: (word: string, requestId: string) => Promise<DailyState | null>;
}) {
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState('');
  const [shake, setShake] = useState(0);
  const currentDraft = useRef('');
  const pending = useRef(false);
  const attempt = useRef<{ word: string; requestId: string } | null>(null);
  const initialGuessCount = useRef(round.guesses.length);

  const editDraft = useCallback(
    (word: string) => {
      currentDraft.current = word;
      setDraft(word);
      setMessage('');
      clearError();
      attempt.current = null;
    },
    [clearError],
  );

  const key = useCallback(
    async (input: string) => {
      if (pending.current || busy) return;
      const word = currentDraft.current;
      if (input === 'Enter') {
        if (word.length !== WORD_LENGTH) {
          setMessage('Beş harfli bir kelime yaz.');
          setShake((index) => index + 1);
          return;
        }
        if (!attempt.current || attempt.current.word !== word) {
          const bytes = crypto.getRandomValues(new Uint8Array(16));
          attempt.current = {
            word,
            requestId: Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(''),
          };
        }
        pending.current = true;
        try {
          const response = await submit(word, attempt.current.requestId);
          if (response) {
            playSound(response.attempt?.rounds.at(-1)?.solved ? 'solve' : 'tap', preferences.sound);
            editDraft('');
          } else {
            setShake((index) => index + 1);
          }
        } finally {
          pending.current = false;
        }
      } else if (input === 'Backspace') {
        editDraft(word.slice(0, -1));
      } else {
        const letter = normalizeWord(input);
        if (word.length < WORD_LENGTH && letter.length === 1 && TURKISH_ALPHABET.includes(letter))
          editDraft(word + letter);
      }
    },
    [busy, editDraft, preferences.sound, submit],
  );

  useEffect(() => {
    function pressed(event: KeyboardEvent) {
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
      if (!['Enter', 'Backspace'].includes(event.key) && event.key.length !== 1) return;
      event.preventDefault();
      void key(event.key);
    }
    window.addEventListener('keydown', pressed);
    return () => window.removeEventListener('keydown', pressed);
  }, [key]);

  const feedback = message || requestError;
  return (
    <section className="panel game-panel" aria-label="Günlük tahmin alanı">
      <div className="daily-round-heading">
        <h2>
          Tur {round.round} / {ROUND_COUNT}
        </h2>
        <strong>{number.format(points)} puan</strong>
      </div>
      <div className="board" role="group" aria-label="Tahmin tahtası">
        {Array.from({ length: MAX_ATTEMPTS }, (_, index) => {
          const guess = round.guesses[index];
          const active = index === round.guesses.length;
          return (
            <GuessRow
              key={active ? `draft-${index}-${shake}` : index}
              guess={guess}
              draft={active ? draft : ''}
              active={active}
              index={index}
              reveal={Boolean(guess && index >= initialGuessCount.current)}
              invalid={active && Boolean(feedback)}
              symbols={preferences.symbols}
            />
          );
        })}
      </div>
      <p className={`guess-feedback ${feedback ? 'form-error' : ''}`} aria-live="polite">
        {feedback || (busy ? 'İşlem sürüyor…' : `${MAX_ATTEMPTS - round.guesses.length} tahmin hakkın kaldı`)}
      </p>
      <ArenaKeys
        disabled={busy}
        marks={guessKeyMarks(round.guesses)}
        symbols={preferences.symbols}
        onKey={(input) => void key(input)}
      />
    </section>
  );
}
