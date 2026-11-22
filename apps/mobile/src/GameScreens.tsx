import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  CLOSENESS_CORRECT_POINTS,
  CLOSENESS_PRESENT_POINTS,
  FINAL_GUESS_MS,
  MAX_ATTEMPTS,
  WORD_LENGTH,
  scoreCloseness,
  type ClosenessScore,
  type Guess,
  type Mark,
  type PlayerView,
  type RoundMode,
  type RoomView,
  type RoundAnalysis,
  type TeamId,
} from '@arena/shared';

const palette = {
  panel: '#19192a',
  inset: '#121220',
  line: '#292941',
  text: '#f5f3ff',
  muted: '#aaa6be',
  lime: '#bdf66c',
  violet: '#a99bff',
  red: '#ffabb6',
  ink: '#141321',
};
const marked = {
  correct: {
    color: '#c4f880',
    surface: '#324520',
    border: '#6d9850',
    symbol: '✓',
    label: 'Doğru yerde',
  },
  present: {
    color: '#f9d48d',
    surface: '#4b361b',
    border: '#b68844',
    symbol: '↗',
    label: 'Yanlış yerde',
  },
  absent: {
    color: '#c6c3d5',
    surface: '#303043',
    border: '#42425d',
    symbol: '−',
    label: 'Eşleşme yok',
  },
} satisfies Record<
  Mark,
  { color: string; surface: string; border: string; symbol: string; label: string }
>;
const strength: Record<Mark, number> = { absent: 0, present: 1, correct: 2 };
const keyboardRows = ['ERTYUIOPĞÜ', 'ASDFGHJKLŞİ', 'ZCVBNMÖÇ'];
const extraLetters = 'ÂÎÛ';
const playerStatus: Record<PlayerView['status'], string> = {
  playing: 'Tahmin ediyor',
  solved: 'Kelimeyi buldu',
  exhausted: 'Hakları tükendi',
  timeout: 'Süresi doldu',
  disconnected: 'Bağlantı kesildi',
};

const teamLabels: Record<TeamId, string> = { a: 'Takım A', b: 'Takım B' };
const pointFormat = new Intl.NumberFormat('tr-TR');
const secondsFormat = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
function timeLabel(milliseconds: number) {
  const total = Math.ceil(milliseconds / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function useRemaining(room: RoomView) {
  const [now, setNow] = useState(() => performance.now());
  const [anchor, setAnchor] = useState(() => ({
    deadline: room.deadline,
    serverNow: room.serverNow,
    observedAt: performance.now(),
  }));
  if (anchor.deadline !== room.deadline || anchor.serverNow !== room.serverNow) {
    setAnchor({
      deadline: room.deadline,
      serverNow: room.serverNow,
      observedAt: performance.now(),
    });
  }

  useEffect(() => {
    if (room.deadline === null) return;
    const sync = () => setNow(performance.now());
    const tick = setInterval(sync, 200);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => {
      clearInterval(tick);
      subscription.remove();
    };
  }, [room.deadline]);

  if (anchor.deadline === null) return null;
  return Math.max(0, anchor.deadline - anchor.serverNow - Math.max(0, now - anchor.observedAt));
}

interface GameScreensProps {
  room: RoomView;
  online: boolean;
  submitGuess: (word: string, requestId: string) => Promise<void>;
  restart: () => Promise<void>;
  canRestart: boolean;
  share: () => void;
  leave: () => Promise<void>;
  showMarkSymbols?: boolean;
}

export function GameScreens({
  room,
  online,
  submitGuess,
  restart,
  canRestart,
  share,
  leave,
  showMarkSymbols = true,
}: GameScreensProps) {
  if (room.phase === 'countdown') return <Countdown room={room} />;
  if (room.phase === 'round') {
    return (
      <ActiveRound
        key={`${room.matchId}-${room.round}`}
        {...{ room, online, submitGuess, showMarkSymbols }}
      />
    );
  }
  if (room.phase === 'intermission') {
    return <RoundSummary key={room.round} room={room} showMarkSymbols={showMarkSymbols} />;
  }
  if (room.phase === 'finished')
    return <MatchSummary {...{ room, online, restart, canRestart, share, leave }} />;
  return null;
}

function Countdown({ room }: { room: RoomView }) {
  const remaining = useRemaining(room) ?? 0;
  const seconds = Math.ceil(remaining / 1000);

  return (
    <View style={styles.centerCard}>
      <Text style={styles.eyebrow}>MAÇ BAŞLIYOR</Text>
      <View style={styles.countdownRing}>
        <Text
          accessibilityLabel={seconds ? `Başlangıca ${seconds} saniye` : 'Başla'}
          style={styles.countdown}
        >
          {seconds || 'Başla'}
        </Text>
      </View>
      <Text style={styles.title}>
        {room.viewerRole === 'spectator' ? 'İlk turu izlemeye hazırlan' : 'İlk kelimeye hazır ol'}
      </Text>
      <Text style={styles.detail}>
        {room.roundMode === 'untimed' ? 'Süresiz tur' : `Süreli tur · ${room.roundSeconds} saniye`}
        {' · '}
        {MAX_ATTEMPTS} tahmin hakkı
      </Text>
    </View>
  );
}

const roundPanels = [
  { id: 'guess', label: 'Tahmin' },
  { id: 'standings', label: 'Sıralama' },
  { id: 'scoring', label: 'Puanlama' },
] as const;

type RoundPanel = (typeof roundPanels)[number]['id'];

function ActiveRound({
  room,
  online,
  submitGuess,
  showMarkSymbols,
}: Pick<GameScreensProps, 'room' | 'online' | 'submitGuess' | 'showMarkSymbols'>) {
  const remaining = useRemaining(room);
  const timerLabel = room.finalCountdown ? 'Son şans' : 'Kalan süre';
  const timerWindow = room.finalCountdown ? FINAL_GUESS_MS : room.roundSeconds * 1000;
  const spectating = room.viewerRole === 'spectator';
  const solvedCount = room.players.filter((player) => player.roundSolved).length;
  const { width, height } = useWindowDimensions();
  const tileSize = Math.min(49, Math.floor((width - 76) / WORD_LENGTH), height < 740 ? 42 : 49);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [panel, setPanel] = useState<RoundPanel>(spectating ? 'standings' : 'guess');
  const draftRef = useRef('');
  const attempt = useRef<{ word: string; id: string; index: number } | null>(null);
  const attempts = useRef(0);
  const inFlight = useRef(false);
  const mine = room.players.find((player) => player.id === room.playerId);
  const myTeam = room.teams.find((team) => team.id === mine?.teamId);
  const scoreLabel = spectating ? 'İZLEYİCİ' : myTeam ? teamLabels[myTeam.id] : 'PUAN';
  const score = spectating ? room.spectatorCount : (myTeam?.points ?? mine?.points ?? 0);
  const playable =
    !spectating &&
    online &&
    (remaining === null || remaining > 0) &&
    mine?.status === 'playing' &&
    room.guesses.length < MAX_ATTEMPTS;
  const draftIndex = room.guesses.length;
  const currentDraft = !attempt.current || attempt.current.index === draftIndex ? draft : '';
  const guessesRemaining = Math.max(0, MAX_ATTEMPTS - draftIndex);

  useEffect(() => {
    const recorded = attempt.current;
    if (!recorded || room.guesses[recorded.index]?.word !== recorded.word) return;
    attempt.current = null;
    draftRef.current = '';
    setDraft('');
    setError('');
  }, [room.guesses]);

  const keys: Partial<Record<string, Mark>> = {};
  for (const { word, marks } of room.guesses) {
    for (const [index, letter] of Array.from(word).entries()) {
      const mark = marks[index];
      const previous = keys[letter];
      if (!previous || strength[mark] > strength[previous]) keys[letter] = mark;
    }
  }

  function changeDraft(word: string) {
    attempt.current = null;
    draftRef.current = word;
    setDraft(word);
    setError('');
  }

  function letterKey(letter: string) {
    return (
      <Key
        key={letter}
        caption={letter}
        mark={keys[letter]}
        blocked={!playable || pending}
        onPress={() => {
          if (!inFlight.current && draftRef.current.length < WORD_LENGTH) {
            changeDraft(draftRef.current + letter);
          }
        }}
      />
    );
  }

  async function send() {
    if (!playable || inFlight.current || pending) return;
    const word = draftRef.current;
    if (word.length !== WORD_LENGTH) {
      setError('Beş harfli bir kelime gir.');
      return;
    }
    attempt.current ??= {
      word,
      id: `mobile-${Date.now()}-${room.round}-${++attempts.current}`,
      index: draftIndex,
    };
    const sent = attempt.current;
    inFlight.current = true;
    setPending(true);
    setError('');
    try {
      await submitGuess(sent.word, sent.id);
      changeDraft('');
    } catch (reason) {
      if (attempt.current === sent) {
        setError(reason instanceof Error ? reason.message : 'Tahmin gönderilemedi.');
      }
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  const note =
    error ||
    (mine?.status === 'solved'
      ? `Doğru tahmin! +${pointFormat.format(mine.roundPoints)} puan`
      : mine?.status === 'exhausted'
        ? 'Tahmin hakkın tükendi. Turun tamamlanmasını bekle.'
        : `${guessesRemaining} tahmin hakkı`);

  return (
    <View style={styles.roundStack}>
      <View style={styles.roundCard}>
        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>TUR</Text>
            <Text style={styles.metricValue}>
              {room.round}
              <Text style={styles.metricSmall}> / {room.roundCount}</Text>
            </Text>
          </View>
          <View style={[styles.metric, styles.middleMetric]}>
            {remaining === null ? (
              <>
                <Text style={styles.metricLabel}>SÜRE</Text>
                <Text style={[styles.timerValue, styles.untimedValue]}>Süresiz</Text>
              </>
            ) : (
              <>
                <Text style={[styles.metricLabel, room.finalCountdown && styles.finalTimer]}>
                  {timerLabel.toLocaleUpperCase('tr-TR')}
                </Text>
                <Text
                  accessibilityLabel={`${timerLabel} ${Math.ceil(remaining / 1000)} saniye`}
                  style={[
                    styles.timerValue,
                    room.finalCountdown && styles.finalTimer,
                    remaining <= 10_000 && styles.danger,
                  ]}
                >
                  {timeLabel(remaining)}
                </Text>
              </>
            )}
          </View>
          <View style={[styles.metric, styles.rightMetric]}>
            <Text style={styles.metricLabel}>{scoreLabel}</Text>
            <Text style={styles.metricValue}>{pointFormat.format(score)}</Text>
          </View>
        </View>

        {remaining !== null && (
          <View style={styles.timeTrack} importantForAccessibility="no">
            <View
              style={[
                styles.timeFill,
                room.finalCountdown && styles.finalTimeFill,
                { width: `${Math.min(100, (remaining / timerWindow) * 100)}%` },
              ]}
            />
          </View>
        )}
      </View>

      {!spectating && (
        <View style={styles.tabs} accessibilityRole="tablist">
          {roundPanels.map(({ id, label }) => (
            <Pressable
              key={id}
              accessibilityRole="tab"
              accessibilityState={{ selected: panel === id }}
              onPress={() => setPanel(id)}
              style={({ pressed }) => [
                styles.tab,
                panel === id && styles.tabSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.tabLabel, panel === id && styles.tabSelectedLabel]}>
                {id === 'standings' ? `${label} · ${solvedCount}/${room.players.length}` : label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {(spectating || panel === 'standings') && <LiveStandings room={room} />}
      {!spectating && panel === 'scoring' && (
        <ScoringPanel
          guesses={room.guesses}
          mode={room.roundMode}
          roundSeconds={room.roundSeconds}
        />
      )}
      {!spectating && panel === 'guess' && (
        <View style={styles.roundStack}>
          <View style={styles.roundCard}>
            <View style={styles.board}>
              {Array.from({ length: MAX_ATTEMPTS }, (_, row) => {
                const guess = room.guesses[row];
                const active = row === draftIndex && playable;
                const word = guess?.word ?? (active ? currentDraft : '');
                return (
                  <View key={row} style={styles.boardRow}>
                    {Array.from({ length: WORD_LENGTH }, (_, column) => (
                      <Tile
                        key={column}
                        size={tileSize}
                        letter={word[column]}
                        mark={guess?.marks[column]}
                        showSymbol={showMarkSymbols}
                        active={active && column === currentDraft.length}
                        invalid={active && !!error}
                      />
                    ))}
                  </View>
                );
              })}
            </View>
            <Text
              accessibilityLiveRegion={error ? 'polite' : 'none'}
              style={[
                styles.feedback,
                !!error && styles.danger,
                !error && mine?.status === 'solved' && styles.highlight,
              ]}
            >
              {note}
            </Text>
          </View>

          <View style={styles.keyboard} accessibilityLabel="Türkçe tahmin klavyesi">
            {keyboardRows.map((row) => (
              <View key={row} style={styles.keyboardRow}>
                {Array.from(row, letterKey)}
              </View>
            ))}
            <View style={styles.keyboardRow}>
              {Array.from(extraLetters, letterKey)}
              <Key
                caption="⌫"
                label="Son harfi sil"
                blocked={!playable || pending || !draft}
                onPress={() => {
                  if (!inFlight.current) changeDraft(draftRef.current.slice(0, -1));
                }}
              />
              <Key
                caption="Tahmin et"
                submit
                blocked={!playable || pending}
                onPress={() => void send()}
              />
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function TeamStandings({ room }: { room: RoomView }) {
  if (room.teams.length === 0) return null;
  return (
    <View style={styles.teamList}>
      {room.teams.map((team) => (
        <View
          key={team.id}
          style={[
            styles.roundCard,
            styles.teamCard,
            room.winnerTeamId === team.id && styles.ownPlayerRow,
          ]}
        >
          <Text style={styles.sectionTitle}>{teamLabels[team.id]}</Text>
          <Text style={styles.playerPoints}>{pointFormat.format(team.points)} puan</Text>
          <Text style={styles.detail}>
            {room.phase === 'intermission'
              ? `Bu tur +${pointFormat.format(team.roundPoints)}`
              : `${team.solved} çözüm`}
          </Text>
        </View>
      ))}
    </View>
  );
}

function LiveStandings({ room }: { room: RoomView }) {
  const solvedCount = room.players.filter((player) => player.roundSolved).length;
  return (
    <View style={styles.roundStack}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Canlı sıralama</Text>
        <Text style={styles.detail}>
          {solvedCount}/{room.players.length} oyuncu çözdü
        </Text>
      </View>
      <TeamStandings room={room} />
      <PlayerList room={room} phase="round" />
    </View>
  );
}

function ScoringPanel({
  guesses,
  mode,
  roundSeconds,
}: {
  guesses: readonly Guess[];
  mode: RoundMode;
  roundSeconds: number;
}) {
  const best = guesses.reduce<ClosenessScore | null>((closest, guess) => {
    const score = scoreCloseness(guess.marks);
    return !closest || score.points > closest.points ? score : closest;
  }, null);

  return (
    <View style={styles.roundStack}>
      {best && (
        <View style={styles.roundCard}>
          <Text style={styles.sectionTitle}>En yakın tahminin</Text>
          <View style={styles.closenessCounts}>
            <Text style={[styles.closenessCount, { color: marked.correct.color }]}>
              {best.correct} yeşil
            </Text>
            <Text style={[styles.closenessCount, { color: marked.present.color }]}>
              {best.present} sarı
            </Text>
          </View>
        </View>
      )}
      <View style={[styles.roundCard, styles.bonusCard]}>
        <Text style={styles.bonusTitle}>Yakınlık puanı</Text>
        <Text style={styles.detail}>
          Kimse kelimeyi bulamazsa her oyuncunun en iyi tahmin satırı karşılaştırılır. En yüksek
          pozitif puan, o değere ulaşan her oyuncuya verilir.
        </Text>
        <View style={styles.closenessCounts}>
          <Text style={[styles.closenessCount, { color: marked.correct.color }]}>
            Yeşil +{CLOSENESS_CORRECT_POINTS}
          </Text>
          <Text style={[styles.closenessCount, { color: marked.present.color }]}>
            Sarı +{CLOSENESS_PRESENT_POINTS}
          </Text>
        </View>
      </View>
      <View style={styles.roundCard}>
        <Text style={styles.sectionTitle}>Kelimeyi bul</Text>
        <Text style={styles.detail}>
          {mode === 'untimed'
            ? 'Süresiz turda doğru tahmine temel puan ve kullanılmayan tahmin hakkı bonusu verilir.'
            : `Süreli turda doğru tahmine temel puan, kalan tahmin hakkı ve turun ilk ${roundSeconds} saniyesine göre süre bonusu verilir.`}
        </Text>
        <Text style={styles.detail}>
          İlk doğru tahminden sonra diğer oyunculara {FINAL_GUESS_MS / 1000} saniye verilir.
        </Text>
      </View>
    </View>
  );
}

function Tile({
  size,
  letter,
  mark,
  active,
  invalid,
  showSymbol = true,
}: {
  size: number;
  letter?: string;
  mark?: Mark;
  active?: boolean;
  invalid?: boolean;
  showSymbol?: boolean;
}) {
  const tone = mark && marked[mark];
  return (
    <View
      accessible={!!letter}
      accessibilityLabel={letter && tone ? `${letter}, ${tone.label}` : letter}
      style={[
        styles.tile,
        { width: size, height: size },
        active && styles.activeTile,
        invalid && styles.invalidTile,
        tone && { backgroundColor: tone.surface, borderColor: tone.border },
      ]}
    >
      <Text style={[styles.tileLetter, tone && { color: tone.color }]} maxFontSizeMultiplier={1.25}>
        {letter}
      </Text>
      {showSymbol && tone && (
        <Text style={[styles.tileMark, { color: tone.color }]} maxFontSizeMultiplier={1}>
          {tone.symbol}
        </Text>
      )}
    </View>
  );
}

function Key({
  caption,
  label,
  mark,
  submit,
  blocked,
  onPress,
}: {
  caption: string;
  label?: string;
  mark?: Mark;
  submit?: boolean;
  blocked: boolean;
  onPress: () => void;
}) {
  const tone = mark && marked[mark];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? (tone ? `${caption}, ${tone.label}` : caption)}
      accessibilityState={{ disabled: blocked }}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        submit && styles.submitKey,
        tone && { backgroundColor: tone.surface, borderColor: tone.border },
        pressed && styles.pressed,
        blocked && styles.disabled,
      ]}
    >
      <Text
        adjustsFontSizeToFit
        numberOfLines={1}
        style={[styles.keyCaption, submit && styles.submitCaption, tone && { color: tone.color }]}
      >
        {caption}
      </Text>
    </Pressable>
  );
}

function RoundSummary({
  room,
  showMarkSymbols,
}: Pick<GameScreensProps, 'room' | 'showMarkSymbols'>) {
  const remaining = useRemaining(room) ?? 0;
  const { width } = useWindowDimensions();
  const size = Math.min(49, Math.floor((width - 70) / WORD_LENGTH));
  const bonusPlayers = room.players.filter((player) => !!player.roundCloseness);
  const mine = room.players.find((player) => player.id === room.playerId);
  const analysis = room.roundAnalyses.find(({ round }) => round === room.round);
  return (
    <View style={styles.roundStack}>
      <View style={styles.centerCard}>
        <Text style={styles.eyebrow}>TUR {room.round} TAMAMLANDI</Text>
        <Text style={styles.title}>Doğru kelime</Text>
        <View style={styles.boardRow}>
          {Array.from(room.answer ?? '').map((letter, index) => (
            <Tile
              key={index}
              size={size}
              letter={letter}
              mark="correct"
              showSymbol={showMarkSymbols}
            />
          ))}
        </View>
        {analysis && (
          <Text style={styles.detail}>
            Tur süresi · {elapsed(analysis.endedAt - analysis.startedAt)}
          </Text>
        )}
        <Text style={styles.detail}>
          {room.round === room.roundCount ? 'Maç sonucu' : 'Sonraki tur'} ·{' '}
          {Math.ceil(remaining / 1000)} sn
        </Text>
      </View>
      {bonusPlayers.length > 0 && (
        <View style={[styles.roundCard, styles.bonusCard]}>
          <Text style={styles.bonusTitle}>Yakınlık puanı</Text>
          <Text style={styles.detail}>
            Kimse kelimeyi bulamadı. {bonusPlayers.map((player) => player.name).join(', ')}
            {bonusPlayers.length === 1 ? ' en yakın tahmini yaptı.' : ' en yakın tahmini paylaştı.'}
          </Text>
        </View>
      )}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Tur sonuçları</Text>
        {mine && <Text style={styles.ownTotal}>Sen · +{pointFormat.format(mine.roundPoints)}</Text>}
      </View>
      <TeamStandings room={room} />
      <PlayerList room={room} phase="intermission" />
    </View>
  );
}

function MatchSummary({
  room,
  online,
  restart,
  canRestart,
  share,
  leave,
}: Omit<GameScreensProps, 'submitGuess'>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const winners = room.players.filter(({ rank }) => rank === 1);
  const podium = room.players.filter(({ rank }) => rank <= 3).slice(0, 3);
  const teamMatch = room.gameMode !== 'ffa';

  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError('');
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'İşlem tamamlanamadı.');
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <View style={styles.roundStack}>
      <View style={styles.centerCard}>
        <Text style={styles.eyebrow}>MAÇ TAMAMLANDI</Text>
        <Text style={styles.title}>
          {teamMatch
            ? room.winnerTeamId
              ? `${teamLabels[room.winnerTeamId]} kazandı`
              : 'Takımlar berabere'
            : winners.length > 1
              ? 'Arena şampiyonları'
              : 'Arena şampiyonu'}
        </Text>
        {!teamMatch && (
          <Text style={styles.winnerNames}>{winners.map(({ name }) => name).join(' · ')}</Text>
        )}
        {!teamMatch && (
          <View style={styles.podium}>
            {podium.map((player) => (
              <View
                key={player.id}
                style={[styles.podiumCard, player.rank === 1 && styles.firstPlace]}
              >
                <Text style={[styles.podiumRank, player.rank === 1 && styles.highlight]}>
                  {player.rank}.
                </Text>
                <Text numberOfLines={1} accessibilityLabel={player.name} style={styles.playerName}>
                  {player.name}
                </Text>
                <Text numberOfLines={1} style={styles.detail}>
                  {pointFormat.format(player.points)} puan
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <TeamStandings room={room} />
      <Text style={styles.sectionTitle}>
        {teamMatch ? 'Oyuncu istatistikleri' : 'Maç sıralaması'}
      </Text>
      <PlayerList room={room} phase="finished" />
      <MatchAnalysis rounds={room.roundAnalyses} />
      {error ? (
        <Text style={[styles.feedback, styles.danger]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {canRestart && (
        <ResultAction
          label="Rövanş başlat"
          primary
          blocked={!online || pending}
          onPress={() => void run(restart)}
        />
      )}
      <View style={styles.resultActions}>
        <ResultAction label="Sonucu paylaş" blocked={pending} onPress={share} />
        <ResultAction label="Ana menüye dön" blocked={pending} onPress={() => void run(leave)} />
      </View>
    </View>
  );
}

function elapsed(ms: number) {
  return `${secondsFormat.format(Math.max(0, ms) / 1000)} sn`;
}

function MatchAnalysis({ rounds }: { rounds: readonly RoundAnalysis[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  if (rounds.length === 0) return null;

  return (
    <View style={styles.roundStack}>
      <Text style={styles.sectionTitle}>Tur ayrıntıları</Text>
      {rounds.map((round) => {
        const expanded = selected === round.round;
        return (
          <View key={round.round} style={styles.roundCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => setSelected(expanded ? null : round.round)}
              style={styles.analysisToggle}
            >
              <Text style={styles.playerName}>
                Tur {round.round} · {round.answer}
              </Text>
              <Text style={styles.detail}>
                {elapsed(round.endedAt - round.startedAt)} {expanded ? '▴' : '▾'}
              </Text>
            </Pressable>
            {expanded && (
              <View style={styles.roundStack}>
                {round.players.map((player) => (
                  <View key={player.playerId} style={styles.analysisRow}>
                    <View style={styles.playerInfo}>
                      <Text style={styles.playerName}>
                        {player.name}
                        {player.teamId ? ` · ${teamLabels[player.teamId]}` : ''}
                      </Text>
                      <Text style={styles.detail}>
                        {player.attempts} tahmin ·{' '}
                        {player.solveMs === null
                          ? playerStatus[player.status]
                          : elapsed(player.solveMs)}
                      </Text>
                    </View>
                    <Text style={styles.playerPoints}>+{pointFormat.format(player.points)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function ResultAction({
  label,
  primary,
  blocked,
  onPress,
}: {
  label: string;
  primary?: boolean;
  blocked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked }}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.resultButton,
        primary && styles.resultButtonPrimary,
        pressed && styles.pressed,
        blocked && styles.disabled,
      ]}
    >
      <Text style={[styles.resultButtonLabel, primary && styles.resultButtonPrimaryLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

function PlayerList({
  room,
  phase,
}: {
  room: RoomView;
  phase: 'round' | 'intermission' | 'finished';
}) {
  return (
    <View style={styles.playerList}>
      {room.players.map((player) => {
        const detail =
          phase === 'finished'
            ? `${player.solved}/${room.roundCount} kelime · ${player.attempts} tahmin${player.solved > 0 ? ` · ${elapsed(player.solveMs)}` : ''}`
            : phase === 'intermission'
              ? `${player.roundAttempts} tahmin · ${player.roundSolveMs === null ? playerStatus[player.status] : elapsed(player.roundSolveMs)}`
              : `${player.roundAttempts}/${MAX_ATTEMPTS} tahmin · ${playerStatus[player.roundSolved ? 'solved' : player.connected ? player.status : 'disconnected']}`;
        const closeness = phase === 'intermission' ? player.roundCloseness : undefined;
        return (
          <View
            key={player.id}
            style={[styles.playerRow, player.id === room.playerId && styles.ownPlayerRow]}
          >
            <Text style={styles.playerRank}>{player.rank}.</Text>
            <View style={styles.playerInfo}>
              <Text style={styles.playerName}>
                {player.name}
                {player.id === room.playerId ? ' · Sen' : ''}
                {player.teamId ? ` · ${teamLabels[player.teamId]}` : ''}
              </Text>
              <Text style={styles.detail}>{detail}</Text>
              {phase === 'finished' && player.fastestWord && player.fastestMs !== null && (
                <Text style={styles.detail}>
                  En hızlı · {player.fastestWord} · {elapsed(player.fastestMs)}
                </Text>
              )}
              {closeness && (
                <Text style={styles.bonusDetail}>
                  Yakınlık · {closeness.correct} yeşil · {closeness.present} sarı
                </Text>
              )}
              {phase === 'round' && (
                <View
                  accessible
                  accessibilityRole="progressbar"
                  accessibilityLabel="Kullanılan tahmin"
                  accessibilityValue={{ min: 0, max: MAX_ATTEMPTS, now: player.roundAttempts }}
                  style={styles.attemptDots}
                >
                  {Array.from({ length: MAX_ATTEMPTS }, (_, attempt) => (
                    <View
                      key={attempt}
                      style={[
                        styles.attemptDot,
                        attempt < player.roundAttempts && styles.attemptDotUsed,
                      ]}
                    />
                  ))}
                </View>
              )}
            </View>
            <Text style={styles.playerPoints}>
              {phase === 'intermission' ? '+' : ''}
              {pointFormat.format(phase === 'intermission' ? player.roundPoints : player.points)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  roundStack: { gap: 11 },
  teamList: { flexDirection: 'row', gap: 8 },
  teamCard: { minWidth: 0, flex: 1 },
  analysisToggle: {
    minHeight: 38,
    gap: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  analysisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    paddingTop: 7,
  },
  roundCard: {
    padding: 11,
    gap: 9,
    borderRadius: 18,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.line,
  },
  centerCard: {
    alignItems: 'center',
    gap: 13,
    paddingVertical: 24,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.line,
  },
  eyebrow: {
    color: palette.violet,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.6,
    textAlign: 'center',
  },
  countdownRing: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
    minHeight: 120,
    borderRadius: 60,
    borderColor: palette.violet,
    borderWidth: 2,
    backgroundColor: palette.inset,
  },
  countdown: {
    color: palette.lime,
    fontSize: 48,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  title: { color: palette.text, fontSize: 23, fontWeight: '900', textAlign: 'center' },
  sectionTitle: { color: palette.text, fontSize: 17, fontWeight: '800' },
  detail: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  winnerNames: { color: palette.lime, fontSize: 17, textAlign: 'center', fontWeight: '800' },
  metrics: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metric: { flex: 1, gap: 2 },
  middleMetric: { alignItems: 'center', flex: 1.3 },
  rightMetric: { alignItems: 'flex-end' },
  metricLabel: { fontSize: 10, color: palette.muted, fontWeight: '800', letterSpacing: 0.6 },
  metricValue: {
    fontSize: 21,
    color: palette.text,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  metricSmall: { fontSize: 13, color: palette.muted },
  timerValue: {
    fontSize: 24,
    color: palette.lime,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  untimedValue: { fontSize: 20 },
  finalTimer: { color: marked.present.color },
  timeTrack: { height: 3, borderRadius: 3, backgroundColor: palette.line, overflow: 'hidden' },
  timeFill: { height: '100%', borderRadius: 3, backgroundColor: palette.violet },
  finalTimeFill: { backgroundColor: marked.present.color },
  board: { gap: 4, alignItems: 'center' },
  boardRow: { flexDirection: 'row', gap: 4, justifyContent: 'center' },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.inset,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 8,
  },
  activeTile: { borderColor: palette.violet, borderWidth: 2 },
  invalidTile: { borderColor: palette.red },
  tileLetter: { color: palette.text, fontSize: 22, fontWeight: '900' },
  tileMark: { position: 'absolute', right: 3, bottom: 1, fontSize: 9, fontWeight: '900' },
  feedback: { color: palette.muted, fontSize: 13, textAlign: 'center', minHeight: 18 },
  danger: { color: palette.red },
  highlight: { color: palette.lime },
  keyboard: { gap: 4, alignSelf: 'center', width: '100%', maxWidth: 460 },
  keyboardRow: { flexDirection: 'row', gap: 3 },
  key: {
    flex: 1,
    minWidth: 0,
    minHeight: 43,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.panel,
  },
  submitKey: { flex: 3, backgroundColor: palette.lime, borderColor: palette.lime },
  keyCaption: { color: palette.text, fontSize: 16, fontWeight: '800' },
  submitCaption: { color: palette.ink },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.48 },
  tabs: {
    flexDirection: 'row',
    gap: 3,
    padding: 3,
    borderRadius: 12,
    backgroundColor: palette.inset,
    borderWidth: 1,
    borderColor: palette.line,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  tabSelected: { backgroundColor: '#30294d' },
  tabLabel: { color: palette.muted, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  tabSelectedLabel: { color: palette.text },
  sectionHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  bonusCard: { borderColor: '#6f542e', backgroundColor: '#261e21' },
  bonusTitle: { color: marked.present.color, fontSize: 17, fontWeight: '800' },
  bonusDetail: { color: marked.present.color, fontSize: 12, lineHeight: 17 },
  ownTotal: { color: palette.lime, fontSize: 13, fontWeight: '800' },
  closenessCounts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  closenessCount: {
    backgroundColor: palette.inset,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
    fontWeight: '800',
    fontSize: 13,
  },
  playerList: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.panel,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  ownPlayerRow: { backgroundColor: '#242039' },
  attemptDots: { flexDirection: 'row', gap: 3, marginTop: 3 },
  attemptDot: { width: 11, height: 3, borderRadius: 3, backgroundColor: palette.line },
  attemptDotUsed: { backgroundColor: palette.violet },
  playerRank: { width: 24, color: palette.violet, fontSize: 14, fontWeight: '800' },
  playerInfo: { flex: 1 },
  playerName: { color: palette.text, fontSize: 14, fontWeight: '800' },
  playerPoints: {
    color: palette.lime,
    fontSize: 15,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  podium: { flexDirection: 'row', gap: 6, alignItems: 'flex-end' },
  podiumCard: {
    flex: 1,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: palette.inset,
    borderWidth: 1,
    borderColor: palette.line,
    gap: 4,
    paddingVertical: 9,
    paddingHorizontal: 4,
  },
  firstPlace: { borderColor: palette.lime, paddingVertical: 15 },
  podiumRank: { color: palette.violet, fontSize: 22, fontWeight: '900' },
  resultActions: { flexDirection: 'row', gap: 7 },
  resultButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 7,
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderWidth: 1,
  },
  resultButtonPrimary: { flex: 0, backgroundColor: palette.lime, borderColor: palette.lime },
  resultButtonLabel: { textAlign: 'center', color: palette.text, fontSize: 14, fontWeight: '800' },
  resultButtonPrimaryLabel: { color: palette.ink },
});
