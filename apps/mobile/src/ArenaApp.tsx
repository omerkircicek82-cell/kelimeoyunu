import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import {
  CLOSENESS_CORRECT_POINTS,
  CLOSENESS_PRESENT_POINTS,
  DEFAULT_ROUND_MODE,
  FINAL_GUESS_MS,
  MAX_ATTEMPTS,
  ROUND_COUNT,
  ROUND_MS,
  type Mark,
  type PlayerView,
  type Requests,
  type ResponseFor,
  type RoomView,
  type RoundMode,
} from '@arena/shared';
import { GameScreens } from './GameScreens';
import { baseStyles as base, colors } from './Theme';

export interface ArenaAppProps {
  room: RoomView | null;
  online: boolean;
  recovering: boolean;
  joinCode: string | null;
  error: string | null;
  serverUrl: string;
  send: <Event extends keyof Requests>(
    event: Event,
    data: Requests[Event],
  ) => Promise<Extract<ResponseFor<Event>, { ok: true }>>;
  openServerSettings?: () => void;
}

type Tab = 'home' | 'help' | 'settings';
type Scene = Tab | 'create' | 'join' | 'scoring';
const marksPreferenceKey = 'arena.show-mark-symbols';
const tabs: ReadonlyArray<{ id: Tab; label: string; icon: string }> = [
  { id: 'home', label: 'Arena', icon: '▦' },
  { id: 'help', label: 'Rehber', icon: '?' },
  { id: 'settings', label: 'Ayarlar', icon: '⚙' },
];
type Variant = 'primary' | 'secondary' | 'plain' | 'danger';
const roundModeOptions: ReadonlyArray<{ value: RoundMode; label: string; detail: string }> = [
  { value: 'timed', label: 'Süreli', detail: `Her tur ${ROUND_MS / 1000} saniyeyle başlar.` },
  { value: 'untimed', label: 'Süresiz', detail: 'Sayaç ilk doğru tahminle başlar.' },
];

const sample: ReadonlyArray<{ word: string; marks: readonly Mark[] }> = [
  { word: 'ŞEHİR', marks: ['present', 'present', 'absent', 'absent', 'absent'] },
  { word: 'GÜNEY', marks: ['correct', 'correct', 'correct', 'correct', 'absent'] },
  { word: 'GÜNEŞ', marks: ['correct', 'correct', 'correct', 'correct', 'correct'] },
];

const markLabels: Record<Mark, string> = {
  correct: 'Harf doğru yerde',
  present: 'Harf kelimede var, yeri farklı',
  absent: 'Kelimede yok',
};

const markSymbols: Record<Mark, string> = { correct: '✓', present: '↗', absent: '−' };

function Action({
  title,
  onPress,
  variant = 'primary',
  disabled,
  compact,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        actionBackgrounds[variant],
        compact && styles.compactAction,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.actionLabel, actionText[variant]]}>{title}</Text>
    </Pressable>
  );
}

function Brand() {
  return (
    <View style={styles.brand} accessibilityLabel="Kelime Arenası" accessible>
      <View style={styles.brandMark} importantForAccessibility="no-hide-descendants">
        <Text style={styles.brandInitial}>K</Text>
        <View style={styles.brandCorner} />
      </View>
      <Text style={styles.brandText}>Kelime Arenası</Text>
    </View>
  );
}

function ConnectionBadge({ online, recovering }: { online: boolean; recovering: boolean }) {
  const label = recovering ? 'Oturum açılıyor' : online ? 'Çevrimiçi' : 'Bağlanıyor';
  return (
    <View style={styles.connection} accessibilityLiveRegion="polite">
      <View style={[styles.connectionDot, (recovering || !online) && styles.connectionPending]} />
      <Text style={styles.connectionLabel}>{label}</Text>
    </View>
  );
}

function Home({ open, enabled }: { open: (scene: Scene) => void; enabled: boolean }) {
  return (
    <View style={styles.home}>
      <View style={styles.hero}>
        <View
          pointerEvents="none"
          style={styles.heroBackdrop}
          importantForAccessibility="no-hide-descendants"
        >
          <View style={styles.heroTileTop} />
          <View style={styles.heroTileBottom} />
        </View>
        <Text style={styles.heroKicker}>Çok oyunculu kelime oyunu</Text>
        <Text accessibilityRole="header" style={styles.heroFirst}>
          KELİME
        </Text>
        <Text accessibilityRole="header" style={[styles.heroFirst, styles.heroSecond]}>
          ARENASI
        </Text>
        <Text style={styles.heroCopy}>Arkadaşlarınla aynı kelimeyi çöz, arenada zirveye çık.</Text>
        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.statValue}>2–8</Text>
            <Text style={base.caption}>Oyuncu</Text>
          </View>
          <View style={styles.heroStat}>
            <Text style={styles.statValue}>{ROUND_COUNT}</Text>
            <Text style={base.caption}>Tur</Text>
          </View>
          <View style={styles.heroStat}>
            <Text style={styles.statValue}>{roundModeOptions.length}</Text>
            <Text style={base.caption}>Oyun modu</Text>
          </View>
        </View>
      </View>
      <View style={styles.actions}>
        <PlayAction
          title="Oda oluştur"
          description="Yeni bir maç için arkadaşlarını davet et."
          icon="+"
          onPress={() => open('create')}
          disabled={!enabled}
          primary
        />
        <PlayAction
          title="Odaya katıl"
          description="Altı karakterli davet kodunu gir."
          icon="↗"
          onPress={() => open('join')}
          disabled={!enabled}
        />
      </View>
      <View style={[base.card, base.section]}>
        <View style={styles.between}>
          <Text style={base.subtitle}>Örnek tahta</Text>
          <Action title="Nasıl oynanır?" onPress={() => open('help')} variant="plain" compact />
        </View>
        <View
          style={styles.exampleGrid}
          accessible
          accessibilityLabel="ŞEHİR, GÜNEY ve GÜNEŞ tahminleriyle örnek oyun"
        >
          {sample.map(({ word, marks }) => (
            <View
              key={word}
              style={styles.exampleRow}
              importantForAccessibility="no-hide-descendants"
            >
              {Array.from(word).map((letter, index) => (
                <View key={index} style={[styles.exampleTile, exampleMarks[marks[index]]]}>
                  <Text style={styles.exampleLetter}>{letter}</Text>
                  <Text style={styles.exampleSymbol}>{markSymbols[marks[index]]}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function PlayAction({
  title,
  description,
  icon,
  onPress,
  disabled,
  primary = false,
}: {
  title: string;
  description: string;
  icon: string;
  onPress: () => void;
  disabled: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.playAction,
        primary && styles.playActionPrimary,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={[styles.playIcon, primary && styles.playIconPrimary]}>
        <Text style={[styles.playIconText, primary && styles.playTextPrimary]}>{icon}</Text>
      </View>
      <View style={styles.fill}>
        <Text style={[base.subtitle, primary && styles.playTextPrimary]}>{title}</Text>
        <Text style={[base.caption, primary && styles.playCaptionPrimary]}>{description}</Text>
      </View>
      <Text style={[styles.playArrow, primary && styles.playTextPrimary]}>›</Text>
    </Pressable>
  );
}

function Navigation({
  selected,
  navigate,
  disabled,
}: {
  selected: Tab;
  navigate: (scene: Tab) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.tabBar} accessibilityRole="tablist">
      <View style={styles.tabList}>
        {tabs.map(({ id, label, icon }) => {
          const active = id === selected;
          return (
            <Pressable
              key={id}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: active, disabled }}
              disabled={disabled}
              onPress={() => navigate(id)}
              style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}
            >
              <View
                style={[styles.tabIcon, active && styles.tabIconActive]}
                importantForAccessibility="no-hide-descendants"
              >
                <Text style={[styles.tabGlyph, active && styles.tabGlyphActive]}>{icon}</Text>
              </View>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Help({ openScoring }: { openScoring: () => void }) {
  return (
    <View style={base.section}>
      <View style={base.sectionTitle}>
        <Text accessibilityRole="header" style={base.title}>
          Nasıl oynanır?
        </Text>
        <Text style={base.body}>
          Aynı gizli kelimeyi tahmin et ve {ROUND_COUNT} turun sonunda en yüksek puana ulaş.
        </Text>
      </View>
      <View style={[base.card, base.section]}>
        <Text style={base.subtitle}>Bir tur nasıl işliyor?</Text>
        <Text style={base.body}>
          Beş harfli bir Türkçe kelime yaz. Her turda {MAX_ATTEMPTS} tahmin hakkın var.
        </Text>
        <Text style={base.body}>
          Bir tahminden sonra harflerin aldığı renkleri sonraki tahmininde ipucu olarak kullan.
        </Text>
      </View>
      <View style={[base.card, base.section]}>
        <Text style={base.subtitle}>Oyun modları</Text>
        {roundModeOptions.map(({ value, label, detail }) => (
          <View key={value} style={styles.field}>
            <Text style={base.label}>{label}</Text>
            <Text style={base.body}>{detail}</Text>
          </View>
        ))}
        <Text style={base.body}>
          İlk doğru tahminden sonra, her iki modda da diğer oyuncuların kalan süresi{' '}
          {FINAL_GUESS_MS / 1000} saniyeye ayarlanır. Sonraki doğru tahminlerde sayaç devam eder.
        </Text>
      </View>
      <View style={[base.card, base.section]}>
        <Text style={base.subtitle}>Harf işaretleri</Text>
        {(Object.keys(markLabels) as Mark[]).map((mark) => (
          <View key={mark} style={styles.helpRow}>
            <View style={[styles.helpMarker, exampleMarks[mark]]}>
              <Text style={styles.exampleLetter}>{markSymbols[mark]}</Text>
            </View>
            <Text style={base.label}>{markLabels[mark]}</Text>
          </View>
        ))}
      </View>
      <Action title="Puanlama kuralları" onPress={openScoring} variant="secondary" />
    </View>
  );
}

function Scoring() {
  return (
    <View style={base.section}>
      <View style={base.sectionTitle}>
        <Text accessibilityRole="header" style={base.title}>
          Puanlama
        </Text>
        <Text style={base.body}>Turda kazandığın puan maç toplamına eklenir.</Text>
      </View>
      <View style={[base.card, base.section]}>
        <Text style={base.subtitle}>Kelimeyi bulduğunda</Text>
        <Text style={base.body}>
          Doğru tahmin 500 puan kazandırır. Her iki modda da kullanılmayan tahmin hakları bonus
          getirir. Süreli modda ilk {ROUND_MS / 1000} saniyenin kalan bölümüne göre hız bonusu da
          eklenir.
        </Text>
      </View>
      <View style={[base.card, base.section]}>
        <Text style={base.subtitle}>Kelimeyi kimse bulamazsa</Text>
        <Text style={base.body}>
          Her oyuncunun tek bir en iyi geçerli tahmini değerlendirilir. En yüksek eşleşme puanına
          ulaşan oyuncuların her biri bu puanı alır.
        </Text>
        <View style={styles.scoreValues}>
          <View style={[styles.scoreChip, styles.hasLetter]}>
            <Text style={base.label}>✓ +{CLOSENESS_CORRECT_POINTS}</Text>
            <Text style={styles.scoreText}>Doğru yer</Text>
          </View>
          <View style={[styles.scoreChip, styles.otherPosition]}>
            <Text style={base.label}>↗ +{CLOSENESS_PRESENT_POINTS}</Text>
            <Text style={styles.scoreText}>Yanlış yer</Text>
          </View>
        </View>
        <Text style={base.caption}>
          Örneğin iki yeşil ve bir sarı işaret{' '}
          {2 * CLOSENESS_CORRECT_POINTS + CLOSENESS_PRESENT_POINTS} puan eder.
        </Text>
      </View>
    </View>
  );
}

function Settings({
  showMarkSymbols,
  saveMarkSymbols,
  serverUrl,
  online,
  recovering,
  openServerSettings,
}: {
  showMarkSymbols: boolean;
  saveMarkSymbols: (enabled: boolean) => void;
  serverUrl: string;
  online: boolean;
  recovering: boolean;
  openServerSettings?: () => void;
}) {
  return (
    <View style={base.section}>
      <Text accessibilityRole="header" style={base.title}>
        Ayarlar
      </Text>
      <View style={[base.card, base.section]}>
        <Text style={base.subtitle}>Görünüm</Text>
        <View style={styles.settingRow}>
          <View style={styles.settingText}>
            <Text style={base.label}>Harf işaretleri</Text>
            <Text style={base.caption}>
              Tahmin kutularında renklerin yanında ✓, ↗ ve − işaretlerini göster.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Harf işaretleri"
            value={showMarkSymbols}
            onValueChange={saveMarkSymbols}
            trackColor={{ false: colors.line, true: colors.correct }}
            thumbColor={showMarkSymbols ? colors.lime : colors.muted}
          />
        </View>
      </View>
      <View style={[base.card, base.section]}>
        <View style={styles.between}>
          <Text style={base.subtitle}>Bağlantı</Text>
          <ConnectionBadge online={online} recovering={recovering} />
        </View>
        <View style={styles.endpoint}>
          <Text style={base.caption}>Oyun sunucusu</Text>
          <Text selectable style={base.label}>
            {serverUrl}
          </Text>
        </View>
        {openServerSettings && (
          <Action
            title="Sunucu adresini değiştir"
            onPress={openServerSettings}
            variant="secondary"
            compact
          />
        )}
      </View>
    </View>
  );
}

function Capacity({
  value,
  set,
  minimum = 2,
}: {
  value: number;
  set: (capacity: number) => void;
  minimum?: number;
}) {
  return (
    <View style={styles.field}>
      <Text style={base.label}>Oyuncu sınırı</Text>
      <View style={styles.capacityRows}>
        {Array.from({ length: 7 }, (_, index) => index + 2).map((size) => (
          <Pressable
            key={size}
            accessibilityRole="button"
            accessibilityLabel={`${size} oyuncu`}
            accessibilityState={{ selected: size === value, disabled: size < minimum }}
            disabled={size < minimum}
            onPress={() => set(size)}
            style={[
              styles.capacityButton,
              size === value && styles.capacitySelected,
              size < minimum && styles.disabled,
            ]}
          >
            <Text style={[styles.capacityText, size === value && styles.capacitySelectedText]}>
              {size}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function RoundModeSelector({
  value,
  onChange,
  disabled,
}: {
  value: RoundMode;
  onChange: (value: RoundMode) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.field} accessibilityRole="radiogroup">
      <Text style={base.label}>Oyun modu</Text>
      {roundModeOptions.map((option) => {
        const checked = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityHint={option.detail}
            accessibilityState={{ checked, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.modeChoice,
              checked && styles.modeChoiceActive,
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.modeRadio, checked && styles.modeRadioActive]}>
              {checked && <View style={styles.modeDot} />}
            </View>
            <View style={styles.modeChoiceText}>
              <Text style={base.label}>{option.label}</Text>
              <Text style={base.caption}>{option.detail}</Text>
            </View>
          </Pressable>
        );
      })}
      <Text style={base.caption}>
        İlk doğru tahminden sonra diğer oyunculara {FINAL_GUESS_MS / 1000} saniye kalır.
      </Text>
    </View>
  );
}

function RoundModeBadge({ mode }: { mode: RoundMode }) {
  const label = mode === 'untimed' ? 'Süresiz' : 'Süreli';
  return (
    <View style={styles.modeBadge} accessibilityLabel={`Oyun modu: ${label}`}>
      <Text style={styles.modeBadgeText}>{label}</Text>
    </View>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={base.label}>{label}</Text>
      {children}
    </View>
  );
}

function EntryForm({
  mode,
  invitation,
  submit,
  enabled,
  busy,
}: {
  mode: 'create' | 'join';
  invitation: string | null;
  submit: (input: {
    playerName: string;
    name?: string;
    code: string;
    maxPlayers: number;
    roundMode: RoundMode;
  }) => void;
  enabled: boolean;
  busy: boolean;
}) {
  const [playerName, setPlayerName] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState(invitation ?? '');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [roundMode, setRoundMode] = useState<RoundMode>(DEFAULT_ROUND_MODE);
  const join = mode === 'join';
  const title = join ? 'Odaya katıl' : 'Oda oluştur';
  const valid = playerName.trim().length >= 2 && (!join || /^[A-Z0-9]{6}$/.test(code));

  useEffect(() => {
    if (invitation) setCode(invitation);
  }, [invitation]);

  function enter() {
    if (!valid || busy || !enabled) return;
    submit({
      playerName: playerName.trim(),
      name: name.trim() || undefined,
      code,
      maxPlayers,
      roundMode,
    });
  }

  return (
    <View style={base.section}>
      <Text accessibilityRole="header" style={base.title}>
        {title}
      </Text>
      <View style={[base.card, base.section]}>
        <Field label="Oyuncu adın">
          <TextInput
            accessibilityLabel="Oyuncu adın"
            value={playerName}
            onChangeText={setPlayerName}
            placeholder="Örn. Deniz"
            placeholderTextColor={colors.muted}
            autoCapitalize="words"
            maxLength={24}
            style={styles.input}
          />
        </Field>
        {join ? (
          <Field label="Oda kodu">
            <TextInput
              accessibilityLabel="Oda kodu"
              value={code}
              onChangeText={(value) =>
                setCode(
                  value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .slice(0, 6),
                )
              }
              placeholder="ABC123"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              returnKeyType="go"
              onSubmitEditing={enter}
              style={[styles.input, styles.codeInput]}
            />
          </Field>
        ) : (
          <>
            <Field label="Oda adı (isteğe bağlı)">
              <TextInput
                accessibilityLabel="Oda adı"
                value={name}
                onChangeText={setName}
                placeholder="Örn. Akşam arenası"
                placeholderTextColor={colors.muted}
                maxLength={40}
                style={styles.input}
              />
            </Field>
            <Capacity value={maxPlayers} set={setMaxPlayers} />
            <RoundModeSelector value={roundMode} onChange={setRoundMode} disabled={busy} />
          </>
        )}
      </View>
      <Action
        title={busy ? 'Bağlanıyor…' : title}
        onPress={enter}
        disabled={!valid || busy || !enabled}
      />
    </View>
  );
}

function PlayerRow({
  player,
  room,
  kick,
}: {
  player: PlayerView;
  room: RoomView;
  kick?: () => void;
}) {
  const mine = player.id === room.playerId;
  const host = player.id === room.hostId;
  const ready = player.connected && (host || player.ready);
  const initials = Array.from(player.name.trim())[0]?.toLocaleUpperCase('tr-TR');

  return (
    <View style={styles.playerRow}>
      <View style={[styles.avatar, host && styles.avatarHost]}>
        <Text style={[styles.avatarText, host && styles.avatarHostText]}>{initials}</Text>
      </View>
      <View style={styles.playerName}>
        <Text style={base.label} numberOfLines={1}>
          {player.name}
          {mine ? ' (sen)' : ''}
        </Text>
        <Text style={[base.caption, ready && styles.ready]}>
          {!player.connected
            ? 'Bağlantı kesildi'
            : host
              ? 'Oda sahibi'
              : player.ready
                ? 'Hazır'
                : 'Bekleniyor'}
        </Text>
      </View>
      {kick && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${player.name} adlı oyuncuyu çıkar`}
          onPress={kick}
          style={styles.kick}
        >
          <Text style={styles.kickText}>Çıkar</Text>
        </Pressable>
      )}
    </View>
  );
}

function Lobby({
  room,
  enabled,
  busy,
  share,
  kick,
  setReady,
  start,
  save,
  leave,
}: {
  room: RoomView;
  enabled: boolean;
  busy: boolean;
  share: () => void;
  kick: (playerId: string) => void;
  setReady: (ready: boolean) => void;
  start: () => void;
  save: (changes: { name: string; maxPlayers: number; roundMode: RoundMode }) => Promise<void>;
  leave: () => void;
}) {
  const host = room.hostId === room.playerId;
  const myself = room.players.find((player) => player.id === room.playerId);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(room.name);
  const [capacity, setCapacity] = useState(room.maxPlayers);
  const [roundMode, setRoundMode] = useState(room.roundMode);
  const canStart =
    room.players.length >= 2 &&
    room.players.every((player) => player.connected && (player.id === room.hostId || player.ready));
  const disabled = !enabled || busy;

  useEffect(() => {
    if (!host) setEditing(false);
  }, [host]);

  function openSettings() {
    setName(room.name);
    setCapacity(room.maxPlayers);
    setRoundMode(room.roundMode);
    setEditing(true);
  }

  return (
    <View style={base.section}>
      <View style={styles.sectionHeader}>
        <Text accessibilityRole="header" style={base.title}>
          {room.name}
        </Text>
        <RoundModeBadge mode={room.roundMode} />
      </View>
      <View style={[base.card, styles.inviteCard]}>
        <View>
          <Text style={base.caption}>Oda kodu</Text>
          <Text selectable style={styles.roomCode}>
            {room.code}
          </Text>
        </View>
        <Action title="Daveti paylaş" onPress={share} variant="secondary" compact />
      </View>
      <View style={[base.card, base.section]}>
        <View style={styles.between}>
          <Text style={base.subtitle}>Oyuncular</Text>
          <Text style={styles.playerCount}>
            {room.players.length} / {room.maxPlayers}
          </Text>
        </View>
        {room.players.map((player) => (
          <PlayerRow
            key={player.id}
            player={player}
            room={room}
            kick={
              host && player.id !== room.playerId && !disabled ? () => kick(player.id) : undefined
            }
          />
        ))}
      </View>
      {host && editing && (
        <View style={[base.card, base.section]}>
          <Text style={base.subtitle}>Oda ayarları</Text>
          <Field label="Oda adı">
            <TextInput
              accessibilityLabel="Oda adı"
              value={name}
              onChangeText={setName}
              style={styles.input}
              maxLength={40}
            />
          </Field>
          <Capacity value={capacity} set={setCapacity} minimum={room.players.length} />
          <RoundModeSelector value={roundMode} onChange={setRoundMode} disabled={disabled} />
          <View style={styles.buttonRow}>
            <View style={styles.fill}>
              <Action
                title="Vazgeç"
                onPress={() => setEditing(false)}
                variant="secondary"
                compact
              />
            </View>
            <View style={styles.fill}>
              <Action
                title="Kaydet"
                onPress={() =>
                  void save({ name: name.trim(), maxPlayers: capacity, roundMode })
                    .then(() => setEditing(false))
                    .catch(() => {})
                }
                disabled={disabled || !name.trim() || capacity < room.players.length}
                compact
              />
            </View>
          </View>
        </View>
      )}
      {host ? (
        <>
          <Action title="Maçı başlat" onPress={start} disabled={disabled || !canStart || editing} />
          {!canStart && (
            <Text style={base.caption}>
              En az iki oyuncu gerekir. Oda sahibi dışındaki oyuncular hazır olduğunda maç
              başlayabilir.
            </Text>
          )}
          {!editing && (
            <Action
              title="Oda ayarları"
              onPress={openSettings}
              variant="secondary"
              disabled={disabled}
            />
          )}
        </>
      ) : (
        <Action
          title={myself?.ready ? 'Hazır değilim' : 'Hazırım'}
          onPress={() => setReady(!myself?.ready)}
          disabled={disabled || !myself}
          variant={myself?.ready ? 'secondary' : 'primary'}
        />
      )}
      <Action title="Odadan ayrıl" onPress={leave} variant="danger" disabled={disabled} />
    </View>
  );
}

export function ArenaApp({
  room,
  online,
  recovering,
  joinCode,
  error,
  serverUrl,
  send,
  openServerSettings,
}: ArenaAppProps) {
  const [scene, setScene] = useState<Scene>(joinCode ? 'join' : 'home');
  const [busy, setBusy] = useState(false);
  const [showMarkSymbols, setShowMarkSymbols] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  const pending = useRef(false);
  const preferenceWrites = useRef<Promise<void>>(Promise.resolve());
  const preferenceTouched = useRef(false);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const enabled = online && !recovering;
  const entryOpen = scene === 'create' || scene === 'join';
  const selectedTab = scene === 'scoring' ? 'help' : entryOpen ? 'home' : scene;

  useEffect(() => {
    if (!room && joinCode) setScene('join');
  }, [joinCode, room]);

  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(marksPreferenceKey)
      .then((stored) => {
        if (active && !preferenceTouched.current && stored === 'false') setShowMarkSymbols(false);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  function saveMarkSymbols(value: boolean) {
    preferenceTouched.current = true;
    setShowMarkSymbols(value);
    preferenceWrites.current = preferenceWrites.current
      .then(() => SecureStore.setItemAsync(marksPreferenceKey, String(value)))
      .catch(() => setLocalError('Görünüm ayarı cihaza kaydedilemedi.'));
  }

  useEffect(() => {
    scroller.current?.scrollTo({ y: 0, animated: false });
  }, [scene, room?.phase, room?.round]);

  function open(next: Scene) {
    setLocalError(null);
    setScene(next);
  }

  async function act(operation: () => Promise<unknown>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setLocalError(null);
    try {
      await operation();
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : 'İşlem tamamlanamadı.');
      throw cause;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function run(operation: () => Promise<unknown>) {
    void act(operation).catch(() => {});
  }

  async function leave() {
    await act(async () => {
      await send('room:leave', {});
      setScene('home');
    });
  }

  function confirmLeave() {
    if (busy) return;
    Alert.alert('Odadan ayrıl', 'Odadan çıkıp ana menüye dönmek istiyor musun?', [
      { text: 'Kal', style: 'cancel' },
      { text: 'Ayrıl', style: 'destructive', onPress: () => void leave().catch(() => {}) },
    ]);
  }

  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (room) {
        confirmLeave();
        return true;
      }
      if (scene !== 'home') {
        open(scene === 'scoring' ? 'help' : 'home');
        return true;
      }
      return false;
    });
    return () => back.remove();
  });

  function share(results = false) {
    if (!room) return;
    const url = `${serverUrl.replace(/\/+$/, '')}/room/${room.code}`;
    const best = room.players[0];
    const message =
      results && best
        ? `Kelime Arenası • ${room.name}\n${best.name} maçı ${best.points.toLocaleString('tr-TR')} puanla tamamladı.\n${url}`
        : `Kelime Arenası’nda bana katıl! Oda kodu: ${room.code}\n${url}`;
    void Share.share({ message }).catch(() => setLocalError('Paylaşım açılamadı.'));
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        {!room && (entryOpen || scene === 'scoring') ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => open(scene === 'scoring' ? 'help' : 'home')}
            style={styles.back}
          >
            <Text style={styles.backText}>‹ {scene === 'scoring' ? 'Rehber' : 'Arena'}</Text>
          </Pressable>
        ) : room && room.phase !== 'lobby' ? (
          <View style={styles.roomHeader}>
            <Text style={styles.roomHeaderTitle} numberOfLines={1}>
              {room.name}
            </Text>
            <Text style={styles.roomHeaderCode}>Oda {room.code}</Text>
          </View>
        ) : (
          <Brand />
        )}
        <ConnectionBadge online={online} recovering={recovering} />
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
      >
        <ScrollView
          ref={scroller}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {Boolean(localError || error) && (
            <View accessibilityRole="alert" style={styles.notice}>
              <Text style={styles.noticeText}>{localError || error}</Text>
            </View>
          )}
          {room ? (
            room.phase === 'lobby' ? (
              <Lobby
                key={room.code}
                room={room}
                enabled={enabled}
                busy={busy}
                share={() => share()}
                kick={(playerId) => {
                  const player = room.players.find((candidate) => candidate.id === playerId);
                  if (player)
                    Alert.alert('Oyuncuyu çıkar', `${player.name} odadan çıkarılsın mı?`, [
                      { text: 'Vazgeç', style: 'cancel' },
                      {
                        text: 'Çıkar',
                        style: 'destructive',
                        onPress: () => run(() => send('room:player-kick', { playerId })),
                      },
                    ]);
                }}
                setReady={(ready) => run(() => send('room:player-ready', { ready }))}
                start={() => run(() => send('game:start', {}))}
                save={(input) => act(() => send('room:settings', input))}
                leave={confirmLeave}
              />
            ) : (
              <GameScreens
                key={`${room.code}:${room.matchId ?? ''}:${room.phase}:${room.round}`}
                room={room}
                online={enabled}
                showMarkSymbols={showMarkSymbols}
                submitGuess={async (word, requestId) => {
                  if (!room.matchId) throw new Error('Maç henüz başlamadı.');
                  await send('game:submit-guess', {
                    word,
                    requestId,
                    matchId: room.matchId,
                    round: room.round,
                  });
                }}
                restart={() => act(() => send('game:restart', {}))}
                canRestart={room.hostId === room.playerId && !busy}
                share={() => share(true)}
                leave={leave}
              />
            )
          ) : scene === 'home' ? (
            <Home open={open} enabled={enabled} />
          ) : scene === 'help' ? (
            <Help openScoring={() => open('scoring')} />
          ) : scene === 'scoring' ? (
            <Scoring />
          ) : scene === 'settings' ? (
            <Settings
              showMarkSymbols={showMarkSymbols}
              saveMarkSymbols={saveMarkSymbols}
              online={online}
              recovering={recovering}
              serverUrl={serverUrl}
              openServerSettings={openServerSettings}
            />
          ) : (
            <EntryForm
              key={scene}
              mode={scene}
              invitation={scene === 'join' ? joinCode : null}
              enabled={enabled}
              busy={busy}
              submit={({ playerName, name, code, maxPlayers, roundMode }) =>
                run(async () => {
                  if (scene === 'join') await send('room:join', { playerName, code });
                  else await send('room:create', { playerName, name, maxPlayers, roundMode });
                  setScene('home');
                })
              }
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      {!room && !entryOpen && <Navigation selected={selectedTab} navigate={open} disabled={busy} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingHorizontal: 16,
    minHeight: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    alignItems: 'center',
  },
  brand: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandText: { color: colors.ink, fontSize: 16, fontWeight: '900', flexShrink: 1 },
  brandMark: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lime,
    overflow: 'hidden',
  },
  brandInitial: { fontSize: 20, fontWeight: '900', color: colors.background },
  brandCorner: {
    position: 'absolute',
    top: 3,
    right: 3,
    borderRadius: 2,
    width: 5,
    height: 5,
    backgroundColor: colors.background,
    opacity: 0.5,
  },
  roomHeader: { minWidth: 0, flex: 1, gap: 2 },
  roomHeaderTitle: { color: colors.ink, fontWeight: '800', fontSize: 15 },
  roomHeaderCode: { color: colors.violet, fontWeight: '700', fontSize: 11, letterSpacing: 0.3 },
  connection: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  connectionDot: { width: 7, height: 7, backgroundColor: colors.lime, borderRadius: 4 },
  connectionPending: { backgroundColor: colors.amber },
  connectionLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 28,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 560,
    gap: 12,
    flexGrow: 1,
  },
  home: { gap: 14 },
  hero: {
    paddingTop: 20,
    paddingHorizontal: 18,
    paddingBottom: 16,
    borderRadius: 22,
    backgroundColor: colors.heroPanel,
    borderWidth: 1,
    borderColor: colors.heroLine,
    overflow: 'hidden',
  },
  heroBackdrop: { position: 'absolute', right: 8, top: 6, width: 126, height: 150 },
  heroTileTop: {
    position: 'absolute',
    left: 49,
    top: 7,
    width: 78,
    height: 78,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: colors.heroLine,
    backgroundColor: colors.violetSoft,
    transform: [{ rotate: '18deg' }],
  },
  heroTileBottom: {
    position: 'absolute',
    left: 15,
    top: 66,
    width: 87,
    height: 87,
    borderRadius: 24,
    backgroundColor: colors.heroTile,
    borderWidth: 1,
    borderColor: colors.heroTileLine,
    transform: [{ rotate: '-15deg' }],
  },
  heroKicker: { marginBottom: 10, color: colors.violet, fontSize: 12, fontWeight: '800' },
  heroFirst: {
    fontSize: 48,
    lineHeight: 50,
    letterSpacing: -2.5,
    fontWeight: '900',
    color: colors.ink,
  },
  heroSecond: { color: colors.lime },
  heroCopy: { color: colors.ink, fontSize: 16, fontWeight: '600', lineHeight: 22, marginTop: 8 },
  heroStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
    paddingTop: 16,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  heroStat: { minWidth: 64, flexGrow: 1, gap: 2 },
  statValue: { color: colors.ink, fontSize: 19, fontWeight: '800' },
  actions: { gap: 8 },
  playAction: {
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    minHeight: 76,
    padding: 12,
  },
  playActionPrimary: { backgroundColor: colors.lime, borderColor: colors.lime },
  playIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.violetSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIconPrimary: { backgroundColor: colors.limeInset },
  playIconText: { color: colors.violet, fontSize: 24, fontWeight: '700' },
  playTextPrimary: { color: colors.background },
  playCaptionPrimary: { color: colors.limeDetail },
  playArrow: { color: colors.muted, fontSize: 27 },
  tabBar: { borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.panel },
  tabList: { width: '100%', maxWidth: 560, alignSelf: 'center', flexDirection: 'row', padding: 6 },
  tabButton: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabIcon: {
    minWidth: 47,
    minHeight: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconActive: { backgroundColor: colors.violetSoft },
  tabGlyph: { color: colors.muted, fontWeight: '800', fontSize: 17 },
  tabGlyphActive: { color: colors.lime },
  tabLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  tabLabelActive: { color: colors.ink },
  scoreValues: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scoreChip: { paddingHorizontal: 12, paddingVertical: 8, gap: 2, borderRadius: 10 },
  scoreText: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingText: { flex: 1, minWidth: 0, gap: 5 },
  endpoint: { backgroundColor: colors.background, borderRadius: 11, padding: 12, gap: 3 },
  action: {
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactAction: { minHeight: 44, paddingVertical: 8 },
  actionLabel: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  primary: { backgroundColor: colors.lime, borderColor: colors.lime },
  secondary: { backgroundColor: colors.surface, borderColor: colors.line },
  plain: { backgroundColor: 'transparent', borderColor: 'transparent', paddingHorizontal: 0 },
  danger: { backgroundColor: 'transparent', borderColor: colors.line },
  primaryText: { color: colors.background },
  secondaryText: { color: colors.ink },
  plainText: { color: colors.violet },
  dangerText: { color: colors.danger },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
  between: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  exampleGrid: { gap: 5, maxWidth: 233, width: '100%', alignSelf: 'center' },
  exampleRow: { flexDirection: 'row', gap: 5 },
  exampleTile: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  hasLetter: { backgroundColor: colors.correct },
  otherPosition: { backgroundColor: colors.present },
  noLetter: { backgroundColor: colors.absent },
  exampleLetter: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  exampleSymbol: {
    position: 'absolute',
    top: 2,
    right: 4,
    color: colors.ink,
    fontSize: 9,
    fontWeight: '800',
  },
  helpRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  helpMarker: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  back: { minHeight: 44, justifyContent: 'center' },
  backText: { color: colors.violet, fontSize: 15, fontWeight: '800' },
  field: { gap: 7 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.background,
    color: colors.ink,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 48,
    fontSize: 16,
  },
  codeInput: { letterSpacing: 3, fontWeight: '800' },
  capacityRows: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  capacityButton: {
    flexGrow: 1,
    minWidth: 33,
    minHeight: 44,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 10,
    borderColor: colors.line,
    backgroundColor: colors.background,
  },
  capacitySelected: { backgroundColor: colors.lime, borderColor: colors.lime },
  capacityText: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  capacitySelectedText: { color: colors.background },
  sectionHeader: { gap: 5 },
  modeChoice: {
    minHeight: 58,
    gap: 10,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.line,
  },
  modeChoiceActive: { backgroundColor: colors.violetSoft, borderColor: colors.violet },
  modeRadio: {
    width: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeRadioActive: { borderColor: colors.lime },
  modeDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.lime },
  modeChoiceText: { flex: 1, minWidth: 0, gap: 2 },
  modeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.violetSoft,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  modeBadgeText: { color: colors.violet, fontSize: 12, fontWeight: '800' },
  inviteCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  roomCode: { color: colors.lime, fontSize: 27, fontWeight: '900', letterSpacing: 2, marginTop: 3 },
  playerCount: { color: colors.violet, fontWeight: '800', fontVariant: ['tabular-nums'] },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 53,
    gap: 9,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    paddingTop: 7,
  },
  playerName: { flex: 1, minWidth: 0, gap: 3 },
  avatar: {
    width: 39,
    height: 39,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.violetSoft,
  },
  avatarHost: { backgroundColor: '#4a562f' },
  avatarText: { color: colors.violet, fontSize: 17, fontWeight: '900' },
  avatarHostText: { color: colors.lime },
  ready: { color: colors.lime },
  kick: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  kickText: { color: colors.danger, fontSize: 13, fontWeight: '800' },
  buttonRow: { flexDirection: 'row', gap: 8 },
  fill: { flex: 1 },
  notice: {
    borderWidth: 1,
    borderColor: '#774353',
    borderRadius: 12,
    backgroundColor: '#34212b',
    padding: 10,
  },
  noticeText: { color: colors.danger, fontSize: 14, lineHeight: 20 },
});

const actionBackgrounds = {
  primary: styles.primary,
  secondary: styles.secondary,
  plain: styles.plain,
  danger: styles.danger,
};
const actionText = {
  primary: styles.primaryText,
  secondary: styles.secondaryText,
  plain: styles.plainText,
  danger: styles.dangerText,
};
const exampleMarks = {
  correct: styles.hasLetter,
  present: styles.otherPosition,
  absent: styles.noLetter,
};
