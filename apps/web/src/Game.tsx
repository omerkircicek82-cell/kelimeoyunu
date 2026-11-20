import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Check,
  ChevronDown,
  Clock3,
  CornerDownLeft,
  Delete,
  Medal,
  Radio,
  Sparkles,
  Timer,
  Trophy,
  UsersRound,
} from 'lucide-react';
import {
  MAX_ATTEMPTS,
  normalizeWord,
  ROUND_COUNT,
  ROUND_MS,
  TURKISH_ALPHABET,
  WORD_LENGTH,
  type Guess,
  type Mark,
  type PlayerView,
  type RoomView,
} from '@arena/shared';
import { request, RequestError, useArena } from './connection';
import { Avatar, MarkIcon, markLabel, playSound, ShareButton, type Preferences } from './ui';

const numberFormat = new Intl.NumberFormat('tr-TR');
const secondsFormat = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
const number = (value: number) => numberFormat.format(value);
const seconds = (ms: number | null) => (ms === null ? '—' : `${secondsFormat.format(ms / 1000)} sn`);
const keyboardRows = ['ERTYUIOPĞÜ', 'ASDFGHJKLŞİ', 'ZCVBNMÖÇ'];
const improvement: Record<Mark, number> = { absent: 0, present: 1, correct: 2 };
const statusLabel: Record<PlayerView['status'], string> = {
  playing: 'Tahmin ediyor',
  solved: 'Kelimeyi buldu',
  exhausted: 'Hakları tükendi',
  timeout: 'Süresi doldu',
  disconnected: 'Bağlantı kesildi',
};

function useRemaining(room: RoomView) {
  const receivedAt = useArena((state) => state.receivedAt);
  const [now, setNow] = useState(() => performance.now());
  const { deadline, serverNow } = room;

  useEffect(() => {
    if (deadline === null) return;
    const interval = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(interval);
  }, [deadline]);

  return deadline === null ? 0 : Math.max(0, deadline - serverNow - Math.max(0, now - receivedAt));
}

function formatCountdown(ms: number) {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function TimerDisplay({ remaining }: { remaining: number }) {
  return (
    <div
      className={`timer-display ${remaining <= 15000 ? 'timer-warning' : ''} ${remaining > 0 && remaining <= 5000 ? 'timer-urgent' : ''}`}
    >
      <Timer size={22} />
      <span aria-label={`Kalan süre ${Math.ceil(remaining / 1000)} saniye`}>
        {formatCountdown(remaining)}
      </span>
    </div>
  );
}

export function Countdown({ room }: { room: RoomView }) {
  const remaining = useRemaining(room);
  const count = Math.ceil(remaining / 1000);
  return (
    <div className="panel countdown-panel">
      <Timer size={27} />
      <h2>Maç başlıyor</h2>
      <AnimatePresence mode="wait">
        <motion.div
          key={count}
          className="countdown-number"
          initial={{ scale: 0.84, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ opacity: 0 }}
          aria-live="polite"
        >
          {count || 'Başla'}
        </motion.div>
      </AnimatePresence>
      <p>İlk kelime için hazır ol.</p>
    </div>
  );
}

export function GameRound({
  room,
  enabled,
  preferences,
}: {
  room: RoomView;
  enabled: boolean;
  preferences: Preferences;
}) {
  const remaining = useRemaining(room);
  const mine = room.players.find((player) => player.id === room.playerId);
  const solved = mine?.status === 'solved';
  const playable =
    enabled &&
    room.matchId !== null &&
    remaining > 0 &&
    mine?.status === 'playing' &&
    room.guesses.length < MAX_ATTEMPTS;
  const [draft, setDraft] = useState('');
  const draftValue = useRef('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const attempt = useRef<{ word: string; requestId: string; index: number } | null>(null);
  const inFlight = useRef(false);
  const initialGuessCount = useRef(room.guesses.length);
  const reducedMotion = useReducedMotion();

  const invalid = useCallback((reason: string) => {
    setError(reason);
    setShake((value) => value + 1);
  }, []);

  const updateDraft = useCallback((word: string) => {
    draftValue.current = word;
    setDraft(word);
  }, []);

  const key = useCallback(
    async (input: string) => {
      if (!playable || !room.matchId || inFlight.current) return;
      const word = draftValue.current;
      if (input === 'Enter') {
        if (word.length < WORD_LENGTH) {
          invalid('Beş harfli bir kelime yaz.');
          return;
        }
        if (attempt.current?.word !== word) {
          const bytes = crypto.getRandomValues(new Uint8Array(16));
          const requestId = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
          attempt.current = { word, requestId, index: room.guesses.length };
        }
        const { requestId, index } = attempt.current;
        inFlight.current = true;
        setSubmitting(true);
        setError('');
        try {
          const { guess } = await request('game:submit-guess', {
            word,
            requestId,
            matchId: room.matchId,
            round: room.round,
          });
          playSound(guess.marks.every((mark) => mark === 'correct') ? 'solve' : 'tap', preferences.sound);
          updateDraft('');
          attempt.current = null;
        } catch (reason) {
          const state = useArena.getState().room;
          const recorded =
            state?.matchId === room.matchId &&
            state.round === room.round &&
            state.guesses[index]?.word === word;
          if (recorded) updateDraft('');
          if (recorded || !(reason instanceof RequestError && reason.retryable)) attempt.current = null;
          if (!recorded) invalid(reason instanceof Error ? reason.message : 'Tahmin gönderilemedi.');
        } finally {
          setSubmitting(false);
          inFlight.current = false;
        }
        return;
      }
      setError('');
      if (input === 'Backspace') {
        attempt.current = null;
        updateDraft(word.slice(0, -1));
      } else {
        const letter = normalizeWord(input);
        if (word.length < WORD_LENGTH && letter.length === 1 && TURKISH_ALPHABET.includes(letter)) {
          attempt.current = null;
          playSound('tap', preferences.sound);
          updateDraft(word + letter);
        }
      }
    },
    [invalid, playable, preferences.sound, room.guesses.length, room.matchId, room.round, updateDraft],
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
      if (event.key === 'Enter' && target?.closest('button, a, summary')) return;
      if (!['Enter', 'Backspace'].includes(event.key) && event.key.length !== 1) return;
      if (!playable) return;
      event.preventDefault();
      if (event.key !== 'Enter' || !event.repeat) void key(event.key);
    }
    window.addEventListener('keydown', pressed);
    return () => window.removeEventListener('keydown', pressed);
  }, [key, playable]);

  const marks: Record<string, Mark> = {};
  for (const guess of room.guesses) {
    Array.from(guess.word).forEach((letter, index) => {
      const mark = guess.marks[index];
      if (!marks[letter] || improvement[mark] > improvement[marks[letter]]) marks[letter] = mark;
    });
  }

  return (
    <div className="game-grid">
      <section className="panel game-panel" aria-label="Kelime tahmin alanı">
        <div className="game-panel-header">
          <div className="round-label">
            <span>Tur</span>
            <strong>
              {room.round} <small>/ {ROUND_COUNT}</small>
            </strong>
          </div>
          <TimerDisplay remaining={remaining} />
          <div className="round-label score-label">
            <span>Toplam puan</span>
            <strong>{number(mine?.points ?? 0)}</strong>
          </div>
        </div>
        <div
          className="duration-line"
          role="progressbar"
          aria-label="Tur süresi"
          aria-valuemin={0}
          aria-valuemax={90}
          aria-valuenow={Math.ceil(remaining / 1000)}
        >
          <span
            className={remaining <= 15000 ? 'low' : ''}
            style={{ width: `${Math.min(100, (remaining / ROUND_MS) * 100)}%` }}
          />
        </div>
        <div className="board" role="group" aria-label="Beş satırlı tahmin tahtası">
          {Array.from({ length: MAX_ATTEMPTS }, (_, index) => {
            const guess = room.guesses[index];
            const active = index === room.guesses.length && !solved;
            const displayingDraft = active && (!attempt.current || attempt.current.index === index);
            return (
              <GuessRow
                key={active ? `draft-${index}-${shake}` : index}
                guess={guess}
                draft={displayingDraft ? draft : ''}
                active={active}
                index={index}
                symbols={preferences.symbols}
                reveal={Boolean(guess && index >= initialGuessCount.current && !reducedMotion)}
                invalid={active && Boolean(error)}
              />
            );
          })}
        </div>
        <div
          className={`guess-feedback ${error ? 'form-error' : solved ? 'solve-feedback' : ''}`}
          aria-live="polite"
        >
          {error ||
            (solved ? (
              <>
                <Check size={17} /> Kelimeyi buldun! <strong>+{number(mine.roundPoints)} puan</strong>
              </>
            ) : mine?.status === 'exhausted' ? (
              'Tahmin hakların tükendi. Turun bitmesi bekleniyor.'
            ) : submitting ? (
              'Tahmin kontrol ediliyor…'
            ) : (
              `${MAX_ATTEMPTS - room.guesses.length} tahmin hakkın kaldı`
            ))}
        </div>
        <div
          className="keyboard"
          aria-label="Türkçe ekran klavyesi"
          onMouseDown={(event) => event.preventDefault()}
        >
          {keyboardRows.map((row, index) => (
            <div className="keyboard-row" key={row}>
              {index === 2 && (
                <button
                  type="button"
                  className="game-key command-key"
                  aria-label="Tahmini gönder"
                  disabled={!playable || submitting}
                  onClick={() => void key('Enter')}
                >
                  <CornerDownLeft size={16} />
                  <span>Enter</span>
                </button>
              )}
              {Array.from(row).map((letter) => (
                <button
                  type="button"
                  key={letter}
                  className={`game-key ${marks[letter] ? `mark-${marks[letter]}` : ''}`}
                  aria-label={marks[letter] ? `${letter}, ${markLabel(marks[letter])}` : letter}
                  disabled={!playable || submitting}
                  onClick={() => void key(letter)}
                >
                  {letter}
                  {marks[letter] && preferences.symbols && <MarkIcon mark={marks[letter]} />}
                </button>
              ))}
              {index === 2 && (
                <button
                  type="button"
                  className="game-key command-key"
                  aria-label="Son harfi sil"
                  disabled={!playable || submitting}
                  onClick={() => void key('Backspace')}
                >
                  <Delete size={19} />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
      <Scoreboard room={room} />
    </div>
  );
}

function GuessRow({
  guess,
  draft,
  active,
  index,
  reveal,
  invalid,
  symbols,
}: {
  guess?: Guess;
  draft: string;
  active: boolean;
  index: number;
  reveal: boolean;
  invalid: boolean;
  symbols: boolean;
}) {
  const letters = Array.from(guess?.word ?? draft);
  return (
    <div
      className={`board-row ${invalid ? 'row-shake' : ''}`}
      role="group"
      aria-label={`${index + 1}. tahmin`}
    >
      {Array.from({ length: WORD_LENGTH }, (_, column) => {
        const letter = letters[column];
        const mark = guess?.marks[column];
        return (
          <div
            key={column}
            className={`board-cell ${mark ? `mark-${mark}` : ''} ${letter ? 'cell-filled' : ''} ${active && column === draft.length ? 'current-cell' : ''} ${reveal ? 'cell-reveal' : ''}`}
            style={reveal ? { animationDelay: `${column * 75}ms` } : undefined}
            role={letter ? 'img' : undefined}
            aria-hidden={!letter || undefined}
            aria-label={letter && mark ? `${letter}, ${markLabel(mark)}` : letter}
          >
            {letter}
            {mark && symbols && <MarkIcon mark={mark} />}
          </div>
        );
      })}
    </div>
  );
}

function Scoreboard({ room }: { room: RoomView }) {
  const [open, setOpen] = useState(false);
  return (
    <aside className={`panel scoreboard ${open ? 'scoreboard-open' : ''}`}>
      <div className="panel-heading score-heading">
        <h2>
          <UsersRound size={20} /> Canlı sıralama
        </h2>
        <span className="live-dot" aria-hidden="true">
          <Radio size={16} />
        </span>
      </div>
      <button type="button" className="score-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <UsersRound size={18} /> Canlı sıralama <ChevronDown size={18} />
      </button>
      <ol className="score-list">
        {room.players.map((player) => (
          <motion.li
            layout
            key={player.id}
            className={`score-row ${player.id === room.playerId ? 'score-self' : ''}`}
          >
            <span className="score-rank">{player.rank}</span>
            <Avatar name={player.name} id={player.id} />
            <div className="score-person">
              <strong>
                {player.name}
                {player.id === room.playerId && <small>Sen</small>}
              </strong>
              <span className={`status-${player.status}`}>
                {player.connected ? statusLabel[player.status] : 'Bağlantı kesildi'}
              </span>
            </div>
            <strong className="score-number">{number(player.points)}</strong>
          </motion.li>
        ))}
      </ol>
    </aside>
  );
}

export function RoundResults({ room }: { room: RoomView }) {
  const remaining = useRemaining(room);
  return (
    <div className="game-grid">
      <section className="panel result-panel">
        <div className="result-title">
          <span className="result-icon">
            <Sparkles size={22} />
          </span>
          <div>
            <h2>Tur {room.round} tamamlandı</h2>
            <p>Doğru kelime</p>
          </div>
        </div>
        {room.answer && (
          <div className="answer-tiles" aria-label={room.answer}>
            {Array.from(room.answer).map((char, index) => (
              <span key={index} aria-hidden="true">
                {char}
              </span>
            ))}
          </div>
        )}
        <div className="table-scroll">
          <table className="results-table">
            <thead>
              <tr>
                <th scope="col">Oyuncu</th>
                <th scope="col">Süre</th>
                <th scope="col">Deneme</th>
                <th scope="col">Puan</th>
              </tr>
            </thead>
            <tbody>
              {room.players.map((player) => (
                <tr key={player.id}>
                  <th scope="row">{player.name}</th>
                  <td>{seconds(player.roundSolveMs)}</td>
                  <td>{player.roundAttempts}</td>
                  <td className="result-points">
                    <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                      +{number(player.roundPoints)}
                    </motion.span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="round-next">
          <Clock3 size={17} /> {room.round < ROUND_COUNT ? 'Sonraki tur' : 'Maç sonucu'}{' '}
          <strong>{Math.ceil(remaining / 1000)} sn</strong>
        </p>
      </section>
      <Scoreboard room={room} />
    </div>
  );
}

function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 24 }, (_, index) => (
        <i
          key={index}
          style={{ left: `${(index * 43 + 7) % 100}%`, animationDelay: `${(index % 6) * 0.12}s` }}
        />
      ))}
    </div>
  );
}

export function MatchResults({
  room,
  enabled,
  notify,
  continueRoom,
  leave,
}: {
  room: RoomView;
  enabled: boolean;
  notify: (message: string) => void;
  continueRoom: () => void;
  leave: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const winners = room.players.filter((player) => player.rank === 1);
  const podium = room.players.filter((player) => player.rank <= 3);
  const host = room.hostId === room.playerId;
  const mine = room.players.find((player) => player.id === room.playerId);
  const winnerText = winners.map((player) => player.name).join(', ');
  return (
    <section className="panel match-panel">
      {mine?.rank === 1 && <Confetti />}
      <div className="match-title">
        <Trophy size={34} />
        <h2>Arena {winners.length > 1 ? 'Şampiyonları!' : 'Şampiyonu!'}</h2>
        <p>{winnerText}</p>
      </div>
      <div className="podium" aria-label="Dereceye giren oyuncular">
        {podium.map((player) => (
          <motion.article
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            key={player.id}
            className={`podium-card podium-rank-${player.rank}`}
          >
            <Avatar name={player.name} id={player.id} />
            <strong className="podium-name">{player.name}</strong>
            <span>{number(player.points)} puan</span>
            <div className="podium-platform">
              {player.rank === 1 ? <Trophy size={21} /> : <Medal size={21} />} {player.rank}.
            </div>
          </motion.article>
        ))}
      </div>
      <div className="table-scroll">
        <table className="results-table final-table">
          <thead>
            <tr>
              <th scope="col">Derece</th>
              <th scope="col">Oyuncu</th>
              <th scope="col">Puan</th>
              <th scope="col">Çözülen</th>
              <th scope="col">Ort. süre</th>
              <th scope="col">Ort. deneme</th>
              <th scope="col">En hızlı kelime</th>
            </tr>
          </thead>
          <tbody>
            {room.players.map((player) => (
              <tr key={player.id}>
                <td>{player.rank}.</td>
                <th scope="row">{player.name}</th>
                <td>{number(player.points)}</td>
                <td>
                  {player.solved}/{ROUND_COUNT}
                </td>
                <td>{seconds(player.solved ? player.solveMs / player.solved : null)}</td>
                <td>{secondsFormat.format(player.attempts / ROUND_COUNT)}</td>
                <td>
                  {player.fastestWord
                    ? `${player.fastestWord} · ${seconds(player.fastestMs)}`
                    : seconds(player.fastestMs)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="button-group match-actions">
        {host && (
          <button
            type="button"
            className="button button-primary"
            disabled={!enabled || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await request('game:restart', {});
              } catch (reason) {
                notify(reason instanceof Error ? reason.message : 'Yeni maç açılamadı.');
              } finally {
                setBusy(false);
              }
            }}
          >
            Tekrar oyna
          </button>
        )}
        <button type="button" className="button button-secondary" onClick={continueRoom}>
          Aynı odayla devam et
        </button>
        <ShareButton
          title="Kelime Arenası sonucu"
          text={`Kelime Arenası: ${mine ? `${mine.rank}. oldum ve ${number(mine.points)} puan topladım!` : `Arena şampiyonu: ${winnerText}`}`}
          label="Sonucu paylaş"
          notify={notify}
        />
        <button type="button" className="button button-quiet" onClick={leave}>
          Ana menüye dön
        </button>
      </div>
    </section>
  );
}
