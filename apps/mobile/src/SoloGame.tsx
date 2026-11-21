import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  MAX_ATTEMPTS,
  ROUND_MS,
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
import { offlineAccepted, offlineAnswers } from './offlineWords';
import { baseStyles as base, colors } from './Theme';

const keyRows = ['ERTYUIOPĞÜ', 'ASDFGHJKLŞİ', 'ZCVBNMÖÇ', 'ÂÎÛ'];
const markSymbols = { correct: '✓', present: '↗', absent: '−' };
const markLabels = { correct: 'doğru yerde', present: 'yeri farklı', absent: 'kelimede yok' };
const strength: Record<Mark, number> = { absent: 0, present: 1, correct: 2 };

type Outcome = { solved: boolean; expired: boolean };

function formatTime(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function SoloGame({
  mode,
  challenge,
  onComplete,
  onBack,
  onPlayAgain,
}: {
  mode: RoundMode;
  challenge?: SoloChallengeTicket;
  onComplete: (result: SoloResultRequest) => void;
  onBack: () => void;
  onPlayAgain: () => void;
}) {
  const [answer] = useState(() =>
    normalizeWord(
      challenge?.answer ?? offlineAnswers[Math.floor(Math.random() * offlineAnswers.length)],
    ),
  );
  const [startedAt] = useState(() => performance.now());
  const [remaining, setRemaining] = useState(ROUND_MS);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const acceptedGuesses = useRef<Guess[]>([]);
  const currentDraft = useRef('');
  const finished = useRef(false);
  const { width, height } = useWindowDimensions();
  const tileSize = Math.max(
    30,
    Math.min(height < 740 ? 42 : 49, Math.floor((width - 78) / WORD_LENGTH)),
  );
  const timed = mode === 'timed';

  const finish = useCallback(
    (solved: boolean, expired: boolean) => {
      if (finished.current) return;
      finished.current = true;
      setError('');
      setOutcome({ solved, expired });
      if (challenge) {
        onComplete({
          challengeId: challenge.id,
          roundMode: mode,
          guesses: acceptedGuesses.current.map(({ word }) => word),
          expired,
        });
      }
    },
    [challenge, mode, onComplete],
  );

  useEffect(() => {
    if (!timed || outcome) return;
    function tick() {
      const left = Math.max(0, ROUND_MS - (performance.now() - startedAt));
      setRemaining(left);
      if (left === 0) finish(false, true);
    }
    const timer = setInterval(tick, 200);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [finish, outcome, startedAt, timed]);

  function edit(word: string) {
    currentDraft.current = word;
    setDraft(word);
    setError('');
  }

  function submit() {
    if (finished.current) return;
    if (timed && performance.now() - startedAt >= ROUND_MS) {
      finish(false, true);
      return;
    }
    const word = normalizeWord(currentDraft.current);
    if (word.length !== WORD_LENGTH) {
      setError('Beş harfli bir kelime gir.');
      return;
    }
    if (!offlineAccepted.has(word) && word !== answer) {
      setError('Bu kelime sözlükte yok. Başka bir kelime dene.');
      return;
    }
    const updated = [...acceptedGuesses.current, { word, marks: evaluateGuess(answer, word) }];
    acceptedGuesses.current = updated;
    setGuesses(updated);
    edit('');
    if (word === answer || updated.length === MAX_ATTEMPTS) finish(word === answer, false);
  }

  const keys: Partial<Record<string, Mark>> = {};
  for (const guess of guesses) {
    for (const [index, letter] of Array.from(guess.word).entries()) {
      const mark = guess.marks[index];
      const previous = keys[letter];
      if (!previous || strength[previous] < strength[mark]) keys[letter] = mark;
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>‹ Arena</Text>
        </Pressable>
        <Text style={styles.headerText}>Çevrimdışı oyun</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[base.card, styles.gameCard]}>
          <View style={styles.metrics}>
            <View>
              <Text style={base.caption}>Kalan tahmin</Text>
              <Text style={styles.metricValue}>
                {MAX_ATTEMPTS - guesses.length} / {MAX_ATTEMPTS}
              </Text>
            </View>
            <View style={styles.timer}>
              <Text style={base.caption}>{timed ? 'Kalan süre' : 'Oyun modu'}</Text>
              <Text
                style={[
                  styles.metricValue,
                  timed && remaining < 10_000 && !outcome && styles.lowTime,
                ]}
              >
                {timed ? formatTime(remaining) : 'Süresiz'}
              </Text>
            </View>
          </View>
          {timed && (
            <View style={styles.progressRail} importantForAccessibility="no">
              <View
                style={[
                  styles.progress,
                  remaining < 10_000 && styles.lowProgress,
                  { width: `${(remaining / ROUND_MS) * 100}%` },
                ]}
              />
            </View>
          )}
          <View style={styles.board} accessibilityLabel="Tahmin tahtası">
            {Array.from({ length: MAX_ATTEMPTS }, (_, index) => {
              const guess = guesses[index];
              const active = !outcome && index === guesses.length;
              const word = guess?.word ?? (active ? draft : '');
              return (
                <View key={index} style={styles.row} accessibilityLabel={`${index + 1}. tahmin`}>
                  {Array.from({ length: WORD_LENGTH }, (_, letterIndex) => (
                    <Tile
                      key={letterIndex}
                      letter={word[letterIndex] ?? ''}
                      mark={guess?.marks[letterIndex]}
                      size={tileSize}
                      current={active && letterIndex === word.length}
                    />
                  ))}
                </View>
              );
            })}
          </View>
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
        </View>
        {outcome ? (
          <SoloResult
            answer={answer}
            outcome={outcome}
            guesses={guesses}
            pendingSync={Boolean(challenge)}
            onPlayAgain={onPlayAgain}
          />
        ) : (
          <View style={styles.keyboard} accessibilityLabel="Türkçe klavye">
            {keyRows.map((letters) => (
              <View key={letters} style={[styles.keyRow, letters.length === 3 && styles.shortKeys]}>
                {Array.from(letters).map((letter) => (
                  <Key
                    key={letter}
                    label={letter}
                    mark={keys[letter]}
                    onPress={() => {
                      if (!finished.current && currentDraft.current.length < WORD_LENGTH) {
                        edit(currentDraft.current + letter);
                      }
                    }}
                  />
                ))}
              </View>
            ))}
            <View style={styles.controls}>
              <Key label="Tahmin et" primary onPress={submit} />
              <Key label="Sil" onPress={() => edit(currentDraft.current.slice(0, -1))} />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Tile({
  letter,
  mark,
  size,
  current,
}: {
  letter: string;
  mark?: Mark;
  size: number;
  current: boolean;
}) {
  return (
    <View
      accessibilityLabel={letter ? (mark ? `${letter}, ${markLabels[mark]}` : letter) : 'Boş kutu'}
      accessible
      style={[
        styles.tile,
        { width: size, height: size },
        current && styles.currentTile,
        mark && { backgroundColor: colors[mark] },
      ]}
    >
      <Text style={styles.tileLetter}>{letter}</Text>
      {mark && <Text style={styles.tileMark}>{markSymbols[mark]}</Text>}
    </View>
  );
}

function Key({
  label,
  mark,
  primary = false,
  onPress,
}: {
  label: string;
  mark?: Mark;
  primary?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={mark ? `${label}, ${markLabels[mark]}` : label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        mark && { backgroundColor: colors[mark] },
        primary && styles.primaryKey,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.keyLabel, primary && styles.primaryLabel]}>{label}</Text>
    </Pressable>
  );
}

function SoloResult({
  answer,
  outcome,
  guesses,
  pendingSync,
  onPlayAgain,
}: {
  answer: string;
  outcome: Outcome;
  guesses: readonly Guess[];
  pendingSync: boolean;
  onPlayAgain: () => void;
}) {
  let bestGuess: Guess | undefined;
  let bestDelta = -Infinity;
  for (const guess of guesses) {
    const delta = ratedRoundDelta([guess], false);
    if (delta > bestDelta) {
      bestGuess = guess;
      bestDelta = delta;
    }
  }
  const best = scoreCloseness(bestGuess?.marks ?? []);
  const delta = ratedRoundDelta(guesses, outcome.solved);

  return (
    <View style={[base.card, base.section]}>
      <Text accessibilityRole="header" style={base.subtitle}>
        {outcome.solved
          ? 'Kelimeyi buldun!'
          : outcome.expired
            ? 'Süre doldu'
            : 'Tahmin hakların bitti'}
      </Text>
      <View style={styles.metrics}>
        <Text style={base.caption}>Doğru kelime</Text>
        <Text style={styles.answer}>{answer}</Text>
      </View>
      <Text style={base.caption}>
        En iyi tahmin · {best.correct} yeşil · {best.present} sarı
      </Text>
      {pendingSync && (
        <View style={styles.earned}>
          <Text style={[styles.metricValue, delta < 0 && styles.lowTime]}>
            {delta >= 0 ? '+' : ''}
            {delta}
          </Text>
          <Text style={base.caption}>Derece puanı bağlantı sağlandığında eşitlenir.</Text>
        </View>
      )}
      <Key label="Tekrar oyna" primary onPress={onPlayAgain} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    alignItems: 'center',
    justifyContent: 'space-between',
    flexDirection: 'row',
    minHeight: 48,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    paddingHorizontal: 16,
  },
  back: { minHeight: 44, justifyContent: 'center', paddingRight: 12 },
  backText: { color: colors.violet, fontSize: 15, fontWeight: '800' },
  headerText: { color: colors.ink, fontWeight: '800', fontSize: 14 },
  content: {
    padding: 12,
    paddingBottom: 24,
    gap: 9,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  gameCard: { gap: 8, padding: 10 },
  metrics: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' },
  metricValue: {
    color: colors.ink,
    fontWeight: '800',
    fontSize: 18,
    fontVariant: ['tabular-nums'],
  },
  timer: { alignItems: 'flex-end' },
  lowTime: { color: colors.danger },
  progressRail: { height: 3, borderRadius: 2, backgroundColor: colors.line, overflow: 'hidden' },
  progress: { height: 3, borderRadius: 2, backgroundColor: colors.violet },
  lowProgress: { backgroundColor: colors.danger },
  board: { alignSelf: 'center', gap: 4 },
  row: { flexDirection: 'row', gap: 4 },
  tile: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderColor: colors.line,
    borderWidth: 1,
    backgroundColor: colors.background,
  },
  tileLetter: { color: colors.ink, fontSize: 19, fontWeight: '900' },
  tileMark: {
    color: colors.ink,
    position: 'absolute',
    right: 3,
    top: 1,
    fontSize: 8,
    fontWeight: '900',
  },
  currentTile: { borderColor: colors.violet },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  keyboard: { gap: 4 },
  keyRow: { flexDirection: 'row', gap: 3 },
  shortKeys: { alignSelf: 'center', width: '40%' },
  key: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 0,
    borderRadius: 7,
    flex: 1,
    paddingHorizontal: 1,
    paddingVertical: 3,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
  },
  keyLabel: { color: colors.ink, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  primaryKey: { backgroundColor: colors.lime, borderColor: colors.lime },
  primaryLabel: { color: colors.background },
  pressed: { opacity: 0.7 },
  controls: { flexDirection: 'row', gap: 5 },
  earned: { gap: 2, padding: 8, borderRadius: 9, backgroundColor: colors.background },
  answer: { color: colors.lime, letterSpacing: 1, fontSize: 18, fontWeight: '900' },
});
