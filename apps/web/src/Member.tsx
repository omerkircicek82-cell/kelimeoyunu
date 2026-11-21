import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Eye,
  EyeOff,
  LoaderCircle,
  LogIn,
  LogOut,
  Medal,
  RefreshCw,
  Trophy,
  UserRoundPlus,
} from 'lucide-react';
import {
  RATING_GREEN_POINTS,
  RATING_ROUND_POINTS,
  RATING_YELLOW_POINTS,
  type AccountProfile,
  type LeaderboardEntry,
} from '@arena/shared';
import { Avatar } from './ui';
import './member.css';

type AuthKind = 'login' | 'register';
type Credentials = { username: string; password: string };

const numbers = new Intl.NumberFormat('tr-TR');
const authLabels = { login: 'Giriş yap', register: 'Hesap oluştur' };

export function AccountPanel({
  profile,
  onAuthenticate,
  onLogout,
  onLeaderboard,
  accountActionsEnabled,
}: {
  profile: AccountProfile | null;
  onAuthenticate: (kind: AuthKind, credentials: Credentials) => Promise<void>;
  onLogout: () => Promise<void>;
  onLeaderboard: () => void;
  accountActionsEnabled: boolean;
}) {
  const [kind, setKind] = useState<AuthKind>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nameHint = useId();
  const passwordHint = useId();

  function changeKind(next: AuthKind) {
    if (next === kind) return;
    setKind(next);
    setPassword('');
    setPasswordVisible(false);
    setError('');
  }

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountActionsEnabled || busy) return;
    setBusy(true);
    setError('');
    try {
      await onAuthenticate(kind, { username: username.trim(), password });
      setPassword('');
      setPasswordVisible(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Hesap işlemi tamamlanamadı.');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    if (!accountActionsEnabled || busy) return;
    setBusy(true);
    setError('');
    try {
      await onLogout();
      setKind('login');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Oturum kapatılamadı.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="member-panel">
      {profile ? (
        <AccountSummary profile={profile} />
      ) : (
        <>
          <div className="member-auth-switch" role="group" aria-label="Hesap işlemi">
            <button
              type="button"
              aria-pressed={kind === 'login'}
              disabled={busy}
              onClick={() => changeKind('login')}
            >
              <LogIn size={16} aria-hidden="true" /> {authLabels.login}
            </button>
            <button
              type="button"
              aria-pressed={kind === 'register'}
              disabled={busy}
              onClick={() => changeKind('register')}
            >
              <UserRoundPlus size={16} aria-hidden="true" /> {authLabels.register}
            </button>
          </div>
          <form className="room-form" onSubmit={authenticate} aria-busy={busy}>
            <div className="member-field">
              <label>
                Kullanıcı adı
                <input
                  name="username"
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  pattern="[A-Za-z0-9_]{3,20}"
                  minLength={3}
                  maxLength={20}
                  aria-describedby={kind === 'register' ? nameHint : undefined}
                  readOnly={busy}
                  required
                />
              </label>
              {kind === 'register' && <small id={nameHint}>3–20 karakter. A–Z, 0–9 ve alt çizgi (_).</small>}
            </div>
            <div className="member-field member-password">
              <label>
                Parola
                <input
                  name="password"
                  type={passwordVisible ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={kind === 'register' ? 'new-password' : 'current-password'}
                  minLength={8}
                  maxLength={128}
                  aria-describedby={kind === 'register' ? passwordHint : undefined}
                  readOnly={busy}
                  required
                />
              </label>
              {kind === 'register' && <small id={passwordHint}>En az 8 karakter.</small>}
              <button
                type="button"
                className="icon-button password-toggle"
                aria-label="Parolayı göster"
                aria-pressed={passwordVisible}
                onClick={() => setPasswordVisible(!passwordVisible)}
              >
                {passwordVisible ? (
                  <EyeOff size={17} aria-hidden="true" />
                ) : (
                  <Eye size={17} aria-hidden="true" />
                )}
              </button>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="button button-primary" disabled={busy || !accountActionsEnabled}>
              {busy && <LoaderCircle size={16} className="member-spinner" aria-hidden="true" />}
              {busy ? 'Bağlanıyor…' : authLabels[kind]}
            </button>
          </form>
        </>
      )}
      {profile && error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!accountActionsEnabled && <p className="member-hint">Hesabını değiştirmek için önce odadan ayrıl.</p>}
      <div className="member-account-actions">
        <button type="button" className="button button-secondary" onClick={onLeaderboard}>
          <Trophy size={16} aria-hidden="true" /> Sıralamayı gör
        </button>
        {profile && (
          <button
            type="button"
            className="button button-quiet"
            onClick={() => void logout()}
            disabled={busy || !accountActionsEnabled}
          >
            <LogOut size={16} aria-hidden="true" /> {busy ? 'Çıkış yapılıyor…' : 'Çıkış yap'}
          </button>
        )}
      </div>
    </div>
  );
}

function AccountSummary({ profile }: { profile: AccountProfile }) {
  return (
    <div className="member-summary">
      <div className="member-identity">
        <Avatar name={profile.username} id={profile.id} />
        <strong>{profile.username}</strong>
      </div>
      <dl className="member-metrics">
        <div>
          <dt>Derece puanı</dt>
          <dd>{numbers.format(profile.rating)}</dd>
        </div>
        <div>
          <dt>Dereceli tur</dt>
          <dd>{numbers.format(profile.ratedGames)}</dd>
        </div>
      </dl>
    </div>
  );
}

type BoardState = { entries: LeaderboardEntry[] | null; loading: boolean; error: string };

export function LeaderboardPage({
  profile,
  loadEntries,
  onAccount,
  onHome,
}: {
  profile: AccountProfile | null;
  loadEntries: () => Promise<LeaderboardEntry[]>;
  onAccount: () => void;
  onHome: () => void;
}) {
  const [revision, setRevision] = useState(0);
  const [board, setBoard] = useState<BoardState>({ entries: null, loading: true, error: '' });
  const loader = useRef(loadEntries);

  useEffect(() => {
    loader.current = loadEntries;
  }, [loadEntries]);

  useEffect(() => {
    let active = true;
    setBoard((previous) => ({ ...previous, loading: true, error: '' }));
    void (async () => {
      try {
        const entries = await loader.current();
        if (active) setBoard({ entries, loading: false, error: '' });
      } catch (reason) {
        const error = reason instanceof Error ? reason.message : 'Sıralama yüklenemedi.';
        if (active) setBoard((previous) => ({ ...previous, loading: false, error }));
      }
    })();
    return () => {
      active = false;
    };
  }, [profile?.id, profile?.ratedGames, profile?.rating, revision]);

  const ownEntry = board.entries?.find((entry) => entry.username === profile?.username);

  return (
    <main className="site-width member-page">
      <button type="button" className="button button-quiet member-back" onClick={onHome}>
        <ArrowLeft size={17} aria-hidden="true" /> Ana menü
      </button>
      <header className="member-hero">
        <span className="member-hero-icon">
          <Trophy size={26} aria-hidden="true" />
        </span>
        <h1>Arena sıralaması</h1>
        <p>Dereceli turların genel puanına göre oyuncu sıralaması.</p>
      </header>
      <div className="member-grid">
        <section
          className="panel member-board"
          aria-labelledby="member-board-title"
          aria-busy={board.loading}
        >
          <div className="member-board-heading">
            <h2 id="member-board-title">Lider tablosu</h2>
            <button
              type="button"
              className="button button-secondary"
              disabled={board.loading}
              onClick={() => setRevision((value) => value + 1)}
            >
              <RefreshCw
                size={15}
                className={board.loading ? 'member-spinner' : undefined}
                aria-hidden="true"
              />
              Yenile
            </button>
          </div>
          {board.loading && (
            <p className="member-board-status" role="status">
              Sıralama yükleniyor…
            </p>
          )}
          {board.error && (
            <p className="member-board-status form-error" role="alert">
              {board.error}
            </p>
          )}
          {!board.loading && !board.error && board.entries?.length === 0 && (
            <div className="member-empty">
              <Medal size={24} aria-hidden="true" />
              <p>Henüz dereceli tur tamamlayan oyuncu yok.</p>
            </div>
          )}
          {board.entries && board.entries.length > 0 && (
            <table className="member-table">
              <thead>
                <tr>
                  <th scope="col">Sıra</th>
                  <th scope="col">Oyuncu</th>
                  <th scope="col">Tur</th>
                  <th scope="col">Puan</th>
                </tr>
              </thead>
              <tbody>
                {board.entries.map((entry) => (
                  <tr key={entry.username} className={entry === ownEntry ? 'member-own-rank' : undefined}>
                    <td>
                      <span className={`member-rank member-rank-${entry.rank <= 3 ? entry.rank : 'rest'}`}>
                        {entry.rank}
                      </span>
                    </td>
                    <th scope="row">
                      <div className="member-ranked-player">
                        <Avatar name={entry.username} id={entry.username} />
                        <span>
                          {entry.username} {entry === ownEntry && <small>Sen</small>}
                        </span>
                      </div>
                    </th>
                    <td>{numbers.format(entry.ratedGames)}</td>
                    <td>{numbers.format(entry.rating)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <aside className="member-side">
          <section className="panel member-card">
            <h2>Oyuncu hesabın</h2>
            {profile ? (
              <>
                <AccountSummary profile={profile} />
                {ownEntry && (
                  <p className="member-hint">
                    Genel sıran <strong>{numbers.format(ownEntry.rank)}.</strong>
                  </p>
                )}
              </>
            ) : (
              <p className="member-hint">Dereceli turlara katılmak için Arena hesabınla giriş yap.</p>
            )}
            <button type="button" className="button button-secondary" onClick={onAccount}>
              {profile ? 'Profili aç' : 'Hesap aç veya giriş yap'}{' '}
              <ArrowUpRight size={16} aria-hidden="true" />
            </button>
          </section>
          <section className="panel member-card">
            <h2>Derece puanı</h2>
            <p className="member-hint">
              Çözülen tur +{RATING_ROUND_POINTS}, çözülemeyen tur −{RATING_ROUND_POINTS} puan. En iyi tahminde
              doğru yerdeki harf +{RATING_GREEN_POINTS}, başka yerdeki harf +{RATING_YELLOW_POINTS} puan.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}
