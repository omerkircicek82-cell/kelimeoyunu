import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MAX_ATTEMPTS, ROUND_COUNT, WORD_LENGTH, type DailyRoundView, type DailyState, type Mark } from '@arena/shared';
import { RequestError } from '../services/useMembership';
import { MemberButton, MemberNotice, MemberScreen } from './MemberScreens';
import { baseStyles as base, colors } from './Theme';

const numbers = new Intl.NumberFormat('tr-TR');
const rows = ['ERTYUIOPĞÜ', 'ASDFGHJKLŞİ', 'ZCVBNMÖÇ', 'ÂÎÛ'];
const strength: Record<Mark, number> = { absent: 0, present: 1, correct: 2 };
const markLabels: Record<Mark, string> = { absent: 'Kelimede yok', present: 'Yeri farklı', correct: 'Doğru yerde' };
const markSymbols: Record<Mark, string> = { absent: '−', present: '↗', correct: '✓' };
let requestSequence = 0;

type DailyOperations = {
  load: () => Promise<DailyState>;
  start: (date: string) => Promise<DailyState>;
  guess: (date: string, round: number, requestId: string, word: string) => Promise<DailyState>;
  next: (date: string, round: number) => Promise<DailyState>;
};

export function DailyScreen({
  operations, username, goBack,
}: { operations: DailyOperations; username: string; goBack: () => void }) {
  const [state, setState] = useState<DailyState>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const inFlight = useRef(false);
  const active = useRef(false);
  const current = useRef(operations);
  current.current = operations;

  async function run(action: () => Promise<DailyState>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNotice('');
    try {
      const next = await action();
      if (active.current) setState(next);
    } catch (reason) {
      if (!active.current) return;
      if (reason instanceof RequestError && reason.status === 409) {
        try {
          const latest = await current.current.load();
          if (active.current) setState(latest);
        } catch {
          // Leave the last available challenge on screen for manual refresh.
        }
      }
      if (active.current) {
        setNotice(reason instanceof Error ? reason.message : 'Günlük mücadele yüklenemedi.');
      }
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }

  useEffect(() => {
    active.current = true;
    void run(() => current.current.load());
    const listener = AppState.addEventListener('change', value => {
      if (value === 'active') void run(() => current.current.load());
    });
    return () => {
      active.current = false;
      listener.remove();
    };
  }, []);

  const attempt = state?.attempt;
  const round = attempt?.rounds.at(-1);

  return (
    <MemberScreen goBack={goBack}>
      <View style={base.sectionTitle}>
        <Text accessibilityRole="header" style={base.title}>Günlük mücadele</Text>
        <Text style={base.body}>
          Herkes günün aynı {ROUND_COUNT} kelimesini çözer. Kelime başına {MAX_ATTEMPTS} tahmin, süre sınırı yok.
        </Text>
        {state && <Text style={base.caption}>{state.date.split('-').reverse().join('.')} · Türkiye saati</Text>}
      </View>
      {!!notice && <MemberNotice message={notice} />}
      {!state && busy && <ActivityIndicator color={colors.lime} accessibilityLabel="Mücadele yükleniyor" />}
      {!state && !busy && <MemberButton label="Yeniden dene" onPress={() => void run(() => current.current.load())} />}
      {state && !attempt && (
        <View style={[base.card, base.section]}>
          <Text style={base.subtitle}>Günün kelimeleri hazır</Text>
          <Text style={base.body}>Günün hakkını şimdi oyna. Daha sonra aynı turdan devam edebilirsin.</Text>
          <MemberButton label="Mücadeleyi başlat" primary disabled={busy} onPress={() => void run(() => current.current.start(state.date))} />
        </View>
      )}
      {state && attempt && round && (
        <View style={[base.card, base.section]}>
          <View style={styles.scoreRow}>
            <Text style={[base.subtitle, styles.fill]}>
              {attempt.phase === 'finished' ? 'Bugünün sonucu' : `Tur ${round.round} / ${ROUND_COUNT}`}
            </Text>
            <Text style={styles.score}>{numbers.format(attempt.points)} puan</Text>
          </View>
          {attempt.phase === 'guessing' ? (
            <DailyBoard
              key={`${state.date}:${round.round}`}
              busy={busy}
              round={round}
              onGuess={(word, id) => run(() => current.current.guess(state.date, round.round, id, word))}
            />
          ) : (
            <Text style={base.body}>
              {attempt.phase === 'finished'
                ? `${attempt.solved} / ${ROUND_COUNT} kelime çözdün.`
                : round.solved ? 'Kelimeyi buldun.' : 'Bu turun tahmin hakkı doldu.'}
              {round.answer ? ` Cevap: ${round.answer}.` : ''}
            </Text>
          )}
          {attempt.phase === 'roundEnd' && (
            <MemberButton primary label="Sonraki kelime" disabled={busy} onPress={() => void run(() => current.current.next(state.date, round.round))} />
          )}
          {attempt.phase === 'finished' && state.rank !== null && (
            <Text style={styles.score}>Günün sırası: {numbers.format(state.rank)}</Text>
          )}
        </View>
      )}
      {state && (
        <View style={[base.card, base.section]}>
          <View style={styles.scoreRow}>
            <Text accessibilityRole="header" style={[base.subtitle, styles.fill]}>Günün sıralaması</Text>
            <MemberButton label="Yenile" disabled={busy} onPress={() => void run(() => current.current.load())} />
          </View>
          {state.leaderboard.length === 0 && <Text style={base.body}>Henüz tamamlanan mücadele yok.</Text>}
          {state.leaderboard.map(entry => (
            <View key={entry.username} style={[styles.scoreRow, styles.rankRow, entry.username === username && styles.currentRank]}>
              <Text style={styles.score}>{numbers.format(entry.rank)}</Text>
              <View style={styles.fill}>
                <Text style={base.label}>{entry.username}{entry.username === username ? ' (sen)' : ''}</Text>
                <Text style={base.caption}>{entry.solved} / {ROUND_COUNT} kelime</Text>
              </View>
              <Text style={base.label}>{numbers.format(entry.points)}</Text>
            </View>
          ))}
        </View>
      )}
    </MemberScreen>
  );
}

function DailyBoard({
  round, busy, onGuess,
}: {
  round: DailyRoundView;
  busy: boolean;
  onGuess: (word: string, requestId: string) => Promise<void>;
}) {
  const { width } = useWindowDimensions();
  const size = Math.max(29, Math.min(48, Math.floor((width - 90) / WORD_LENGTH)));
  const [draft, setDraft] = useState('');
  const currentDraft = useRef('');
  const sent = useRef<{ word: string; id: string } | null>(null);
  const guesses = round.guesses;
  const marks: Partial<Record<string, Mark>> = {};

  for (const guess of guesses) {
    for (const [index, letter] of Array.from(guess.word).entries()) {
      const mark = guess.marks[index];
      const previous = marks[letter];
      if (!previous || strength[mark] > strength[previous]) marks[letter] = mark;
    }
  }

  function edit(word: string) {
    currentDraft.current = word;
    sent.current = null;
    setDraft(word);
  }

  useEffect(() => { edit(''); }, [guesses.length]);

  async function send() {
    if (busy || currentDraft.current.length !== WORD_LENGTH) return;
    const word = currentDraft.current;
    if (sent.current?.word !== word) {
      const suffix = Math.random().toString(36).slice(2, 10);
      sent.current = { word, id: `daily-${Date.now()}-${++requestSequence}-${suffix}` };
    }
    await onGuess(word, sent.current.id);
  }

  return (
    <>
      <View style={styles.board} accessibilityLabel="Tahmin tahtası">
        {Array.from({ length: MAX_ATTEMPTS }, (_, index) => {
          const guess = guesses[index];
          const word = guess?.word ?? (index === guesses.length ? draft : '');
          return (
            <View key={index} style={styles.tiles}>
              {Array.from({ length: WORD_LENGTH }, (_, cell) => {
                const letter = word[cell];
                const mark = guess?.marks[cell];
                const label = letter ? `${letter}${mark ? ', ' + markLabels[mark] : ''}` : 'Boş';
                return (
                  <View
                    key={cell}
                    accessible
                    accessibilityLabel={label}
                    style={[styles.tile, { width: size, height: size }, mark && { backgroundColor: colors[mark] }]}
                  >
                    <Text style={styles.tileText}>{letter}</Text>
                    {mark && <Text style={styles.markSymbol} importantForAccessibility="no">{markSymbols[mark]}</Text>}
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>
      <Text style={base.caption}>{MAX_ATTEMPTS - guesses.length} tahmin hakkı</Text>
      <View style={styles.keyboard}>
        {rows.map((row, index) => (
          <View key={row} style={[styles.keys, index === rows.length - 1 && styles.shortRow]}>
            {Array.from(row).map(letter => {
              const mark = marks[letter];
              return (
                <Pressable
                  key={letter}
                  accessibilityRole="button"
                  accessibilityLabel={mark ? `${letter}, ${markLabels[mark]}` : letter}
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={() => {
                    if (currentDraft.current.length < WORD_LENGTH) edit(currentDraft.current + letter);
                  }}
                  style={({ pressed }) => [
                    styles.key, mark && { backgroundColor: colors[mark] },
                    index === rows.length - 1 && styles.shortKey,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.keyText}>{letter}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
        <View style={styles.scoreRow}>
          <MemberButton label="Harf sil" disabled={busy || !draft} onPress={() => edit(currentDraft.current.slice(0, -1))} />
          <MemberButton primary label="Tahmin et" disabled={busy || draft.length !== WORD_LENGTH} onPress={() => void send()} />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minWidth: 0 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  score: { color: colors.lime, fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  rankRow: { borderTopColor: colors.line, borderTopWidth: 1, minHeight: 48, paddingVertical: 8, paddingHorizontal: 5 },
  currentRank: { backgroundColor: colors.violetSoft, borderRadius: 8 },
  board: { alignItems: 'center', gap: 4 },
  tiles: { flexDirection: 'row', gap: 4 },
  tile: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 7 },
  tileText: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  markSymbol: { position: 'absolute', top: 1, right: 3, color: colors.ink, fontSize: 10 },
  keyboard: { gap: 5 },
  keys: { flexDirection: 'row', gap: 3, justifyContent: 'center' },
  shortRow: { marginVertical: 3 },
  key: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    backgroundColor: colors.surface,
  },
  shortKey: { flex: 0, minWidth: 38 },
  keyText: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.72 },
});
