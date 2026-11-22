import { useEffect, useId, useRef, type ReactNode } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CircleHelp,
  CircleUserRound,
  Settings,
  Trophy,
  X,
} from 'lucide-react';
import {
  CLOSENESS_CORRECT_POINTS,
  CLOSENESS_PRESENT_POINTS,
  FINAL_GUESS_MS,
  MAX_ATTEMPTS,
  ROUND_COUNT_MIN,
  ROUND_COUNT_MAX,
  type Mark,
  type RoundMode,
} from '@arena/shared';

export type Preferences = { theme: 'dark' | 'light'; sound: boolean; symbols: boolean };

const defaults: Preferences = { theme: 'dark', sound: false, symbols: false };

export function loadPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem('arena-preferences') ?? 'null');
    return {
      theme: value?.theme === 'light' ? 'light' : 'dark',
      sound: value?.sound === true,
      symbols: value?.symbols === true,
    };
  } catch {
    return defaults;
  }
}

let audio: AudioContext | undefined;

export function playSound(type: 'tap' | 'solve', enabled: boolean) {
  if (!enabled) return;
  try {
    audio ??= new AudioContext();
    const context = audio;
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
    const notes = type === 'solve' ? [440, 554, 659] : [330];
    notes.forEach((pitch, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = context.currentTime + index * 0.07;
      oscillator.frequency.value = pitch;
      gain.gain.setValueAtTime(0.04, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.14);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.15);
    });
  } catch {
    // The game remains usable on browsers without Web Audio.
  }
}

export function Brand({ home }: { home: () => void }) {
  return (
    <button type="button" className="brand" onClick={home} aria-label="HarfArena ana menü">
      <img className="brand-mark" src="/harfarena-icon.png" width={42} height={42} alt="" />
      <span className="brand-name">
        Harf<span>Arena</span>
      </span>
    </button>
  );
}

const headerRating = new Intl.NumberFormat('tr-TR');

export function Header({
  home,
  profile,
  accountName,
  accountRating,
  leaderboard,
  openSettings,
}: {
  home: () => void;
  profile: () => void;
  accountName?: string;
  accountRating?: number;
  leaderboard: () => void;
  openSettings: () => void;
}) {
  return (
    <header className="topbar">
      <div className="site-width topbar-inner">
        <Brand home={home} />
        <nav aria-label="Ana gezinti" className="nav-controls">
          <button
            type="button"
            className="nav-help"
            onClick={leaderboard}
            aria-label="Lider tablosu"
            title="Lider tablosu"
          >
            <Trophy size={18} aria-hidden="true" />
            <span>Lider tablosu</span>
          </button>
          <button
            type="button"
            className="icon-button nav-settings"
            onClick={openSettings}
            aria-label="Ayarlar"
            title="Ayarlar"
          >
            <Settings size={19} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="nav-profile account-button"
            onClick={profile}
            aria-label={accountName ? 'Hesabım' : 'Giriş / Kayıt'}
          >
            <CircleUserRound size={20} aria-hidden="true" />
            <span className="account-label">
              <strong>{accountName ?? 'Giriş / Kayıt'}</strong>
              {accountRating !== undefined && <small>{headerRating.format(accountRating)} puan</small>}
            </span>
            <span className="account-label-compact">{accountName ?? 'Giriş'}</span>
          </button>
        </nav>
      </div>
    </header>
  );
}

export function PreferencesPanel({
  preferences,
  setPreferences,
  help,
}: {
  preferences: Preferences;
  setPreferences: (value: Preferences) => void;
  help: () => void;
}) {
  return (
    <div className="settings-options">
      <label className="preferences-control">
        <strong>Ses efektleri</strong>
        <input
          type="checkbox"
          checked={preferences.sound}
          onChange={(event) => {
            const sound = event.currentTarget.checked;
            setPreferences({ ...preferences, sound });
            playSound('tap', sound);
          }}
        />
      </label>
      <label className="preferences-control">
        <strong>Açık tema</strong>
        <input
          type="checkbox"
          checked={preferences.theme === 'light'}
          onChange={(event) =>
            setPreferences({ ...preferences, theme: event.currentTarget.checked ? 'light' : 'dark' })
          }
        />
      </label>
      <label className="preferences-control">
        <div>
          <strong>Harf işaretleri</strong>
          <p>Tahmin sonuçlarını renklerle birlikte simgelerle göster.</p>
        </div>
        <input
          type="checkbox"
          checked={preferences.symbols}
          onChange={(event) => setPreferences({ ...preferences, symbols: event.currentTarget.checked })}
        />
      </label>
      <button type="button" className="button button-secondary" onClick={help}>
        <CircleHelp size={17} aria-hidden="true" /> Nasıl oynanır?
      </button>
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-content">
        <div className="modal-heading">
          <h2 id={headingId}>{title}</h2>
          <button type="button" className="icon-button" aria-label="Kapat" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function Help() {
  return (
    <div className="help-copy">
      <p>
        Bir oda aç veya arkadaşının oda koduyla katıl. Oda ayarına göre {ROUND_COUNT_MIN}–{ROUND_COUNT_MAX}{' '}
        kelimede aynı gizli kelimeleri çözmek için yarışın.
      </p>
      <ol>
        <li>Her turda {MAX_ATTEMPTS} tahmin hakkın var.</li>
        <li>
          Süreli turlar oda sahibinin seçtiği süreyle başlar. Süresiz turda sayaç ilk doğru tahminde başlar.
          Her iki modda ilk doğru tahmin, diğer oyuncular için bir kez {FINAL_GUESS_MS / 1000} saniyelik son
          şans başlatır.
        </li>
        <li>Tahminini yazıp Enter tuşuna bas. Renkler bir sonraki tahminin için ipucu verir.</li>
        <li>
          Her doğru çözüm taban puanı ve deneme bonusu kazandırır. Hız bonusu süreli moda özeldir ve turun
          başlangıç süresi üzerinden hesaplanır.
        </li>
        <li>
          Kimse çözemezse her oyuncunun en iyi geçerli tahmini karşılaştırılır. Doğru yerdeki her harf{' '}
          {CLOSENESS_CORRECT_POINTS}, başka yerdeki her harf {CLOSENESS_PRESENT_POINTS} puan değerindedir. En
          yüksek pozitif puana ulaşan oyuncular bu puanı alır.
        </li>
      </ol>
      <div className="help-marks">
        <span>
          <MarkIcon mark="correct" /> Doğru yerde
        </span>
        <span>
          <MarkIcon mark="present" /> Başka yerde
        </span>
        <span>
          <MarkIcon mark="absent" /> Eşleşme yok
        </span>
      </div>
    </div>
  );
}

export const roundModeLabel: Record<RoundMode, string> = { timed: 'Süreli', untimed: 'Süresiz' };

const markLabels: Record<Mark, string> = {
  correct: 'Doğru yerde',
  present: 'Başka yerde',
  absent: 'Eşleşme yok',
};

export const markLabel = (mark: Mark) => markLabels[mark];

export function MarkIcon({ mark }: { mark: Mark }) {
  return (
    <span className={`mark-icon mark-${mark}`} aria-hidden="true">
      {mark === 'correct' ? (
        <Check size={13} />
      ) : mark === 'present' ? (
        <ArrowDownLeft size={13} />
      ) : (
        <X size={12} />
      )}
    </span>
  );
}

const avatarColors = ['#bab0ff', '#9be9c7', '#ffd387', '#9ac8ff', '#f7a8c6', '#f8bca9'];

export function Avatar({ name, id }: { name: string; id: string }) {
  const points = Array.from(id).reduce((sum, char) => sum + char.codePointAt(0)!, 0);
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join('')
    .toLocaleUpperCase('tr');
  const color = avatarColors[points % avatarColors.length];
  return (
    <span className="avatar" style={{ background: color }} aria-hidden="true">
      {initials}
    </span>
  );
}

export function ShareButton({
  title,
  text,
  url,
  label,
  notify,
}: {
  title: string;
  text: string;
  url?: string;
  label: string;
  notify: (message: string) => void;
}) {
  return (
    <button
      type="button"
      className="button button-secondary"
      onClick={async () => {
        try {
          if (navigator.share) await navigator.share({ title, text, url });
          else {
            await navigator.clipboard.writeText(url ?? text);
            notify(url ? 'Davet bağlantısı kopyalandı.' : 'Sonuç kopyalandı.');
          }
        } catch (error) {
          if (!(error instanceof DOMException && error.name === 'AbortError'))
            notify('Paylaşım şu anda kullanılamıyor.');
        }
      }}
    >
      <ArrowUpRight size={17} />
      {label}
    </button>
  );
}
