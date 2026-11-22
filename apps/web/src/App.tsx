import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, DoorOpen, Eye, Infinity, Link2, Lock, Plus, Timer, WifiOff } from 'lucide-react';
import { ROUND_MS, type RoundMode, type SoloChallengeTicket } from '@arena/shared';
import { attachConnection, forgetTicket, hasRoomTicket, request, useArena } from './connection';
import { Countdown, GameRound, MatchResults, RoundResults, SpectatorRound } from './Game';
import { Landing, type LandingAction } from './Landing';
import { Lobby, RoomHeading } from './Lobby';
import { useMembership } from './membership';
import { OfflineGame } from './OfflineGame';
import { useOfflineQueue } from './offlineQueue';
import { RoomForm, type EntryMode } from './RoomForm';
import { Header, Help, loadPreferences, Modal, PreferencesPanel, type Preferences } from './ui';

type Overlay = EntryMode | 'help' | 'profile' | 'leave' | 'settings' | 'private-room' | 'watch';
type SoloRun = { key: number; mode: RoundMode; challenge?: SoloChallengeTicket; accountId?: string };
const DailyPage = lazy(() => import('./Daily').then((module) => ({ default: module.DailyPage })));
const AccountPanel = lazy(() => import('./Member').then((module) => ({ default: module.AccountPanel })));
const LeaderboardPage = lazy(() =>
  import('./Member').then((module) => ({ default: module.LeaderboardPage })),
);

export function App() {
  const { room, connected, recovering, notice } = useArena();
  const { session, refresh, invalidate, authenticate, logout, loadEntries } = useMembership();
  const profile = session?.profile ?? null;
  const offline = useOfflineQueue(session, refresh);
  const [soloRun, setSoloRun] = useState<SoloRun | null>(null);
  const soloRunKey = useRef(0);
  const [accountPending, setAccountPending] = useState(false);
  const accountAction = useRef(false);
  const [preferences, setPreferences] = useState(loadPreferences);
  const [overlay, setOverlay] = useState<Overlay>();
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [leaving, setLeaving] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const enabled = connected && !recovering && !accountPending;

  useEffect(
    () => attachConnection(session?.token, profile?.id, invalidate),
    [session?.token, profile?.id, invalidate],
  );
  useEffect(() => {
    if (!session?.token || (room?.phase !== 'intermission' && room?.phase !== 'finished')) return;
    const timer = setTimeout(() => void refresh(), 500);
    return () => clearTimeout(timer);
  }, [room?.phase, room?.round, session?.token, refresh]);
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    try {
      localStorage.setItem('arena-preferences', JSON.stringify(preferences));
    } catch {
      /* Storage can be disabled by the browser. */
    }
  }, [preferences]);

  function notify(message: string) {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(''), 4500);
  }

  useEffect(() => {
    if (notice) {
      notify(notice);
      useArena.setState({ notice: '' });
    }
  }, [notice]);

  function enter(code: string) {
    setOverlay(undefined);
    navigate(`/room/${code}`);
  }

  function home() {
    if (room && location.pathname !== '/') setOverlay('leave');
    else navigate('/');
  }

  function open(mode: LandingAction) {
    if (mode === 'daily') {
      navigate('/gunluk');
      return;
    }
    if (mode === 'quick') {
      setSoloRun(null);
      navigate('/cevrimdisi');
      return;
    }
    if (mode === 'leaderboard') {
      openLeaderboard();
      return;
    }
    if (room && mode === 'private-room') {
      navigate(`/room/${room.code}`);
      return;
    }
    setOverlay(mode);
  }

  function startSolo(mode: RoundMode) {
    setSoloRun({ key: ++soloRunKey.current, mode, challenge: offline.getTicket(), accountId: profile?.id });
  }

  async function leave() {
    if (!enabled || leaving) return;
    setLeaving(true);
    try {
      await request('room:leave', {});
      forgetTicket();
      setOverlay(undefined);
      navigate('/');
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Odadan ayrılamadın.');
    } finally {
      setLeaving(false);
    }
  }

  async function changeAccount(operation: () => Promise<void>) {
    if (accountAction.current || hasRoomTicket() || useArena.getState().room) {
      throw new Error('Hesap değiştirmek için önce odadan ayrıl.');
    }
    accountAction.current = true;
    setAccountPending(true);
    try {
      await operation();
    } finally {
      accountAction.current = false;
      setAccountPending(false);
    }
  }

  function openAccount() {
    void refresh();
    setOverlay('profile');
  }

  function openLeaderboard() {
    setOverlay(undefined);
    navigate('/siralama');
  }

  return (
    <>
      <Header
        home={home}
        profile={openAccount}
        accountName={profile?.username}
        accountRating={profile?.rating}
        leaderboard={openLeaderboard}
        openSettings={() => setOverlay('settings')}
      />
      <Routes>
        <Route
          path="/"
          element={
            <>
              {room && (
                <div className="site-width resume-banner">
                  <button className="button button-secondary" onClick={() => navigate(`/room/${room.code}`)}>
                    Odana dön <ArrowRight size={17} />
                  </button>
                </div>
              )}
              <Landing open={open} />
            </>
          }
        />
        <Route
          path="/cevrimdisi"
          element={
            soloRun ? (
              <OfflineGame
                key={soloRun.key}
                mode={soloRun.mode}
                challenge={soloRun.challenge}
                preferences={preferences}
                onComplete={(result) => {
                  if (soloRun.accountId) offline.record(result, soloRun.accountId);
                }}
                onBack={() => setSoloRun(null)}
                onPlayAgain={() => startSolo(soloRun.mode)}
              />
            ) : (
              <main className="site-width room-page">
                <section className="panel standalone solo-mode-picker">
                  <span className="result-icon">
                    <WifiOff size={22} aria-hidden="true" />
                  </span>
                  <h1>Hızlı Oyna</h1>
                  <p>Tek kelime, beş tahmin hakkı.</p>
                  <div className="solo-mode-actions">
                    <button className="button button-primary" onClick={() => startSolo('timed')}>
                      <Timer size={18} /> Süreli · {ROUND_MS / 1000} saniye
                    </button>
                    <button className="button button-secondary" onClick={() => startSolo('untimed')}>
                      <Infinity size={18} /> Süresiz
                    </button>
                  </div>
                  <p className="solo-mode-status">
                    {offline.available
                      ? 'Puanlı oyun hazır. Sonucun bağlantı geldiğinde hesabına işlenecek.'
                      : profile
                        ? 'Puanlı bilet gelene kadar antrenman oynayabilirsin.'
                        : 'Misafir antrenmanı. Genel puan için hesabına giriş yap.'}
                  </p>
                  {profile && offline.pending > 0 && (
                    <p role="status">{offline.pending} sonuç eşitlenmeyi bekliyor.</p>
                  )}
                  {profile && offline.notice && (
                    <p role="alert" className="form-error">
                      {offline.notice}
                    </p>
                  )}
                  <div className="button-group">
                    {profile ? (
                      <button className="button button-quiet" onClick={() => void offline.sync()}>
                        Eşitle
                      </button>
                    ) : (
                      <button className="button button-quiet" onClick={openAccount}>
                        Giriş / Kayıt
                      </button>
                    )}
                    <button className="button button-quiet" onClick={() => navigate('/')}>
                      Ana menüye dön
                    </button>
                  </div>
                </section>
              </main>
            )
          }
        />
        <Route
          path="/gunluk"
          element={
            <Suspense
              fallback={
                <p className="site-width room-page" role="status">
                  Günlük mücadele yükleniyor…
                </p>
              }
            >
              <DailyPage
                key={profile?.id ?? 'guest'}
                token={session?.token}
                username={profile?.username}
                preferences={preferences}
                onAccount={openAccount}
                onHome={() => navigate(room ? `/room/${room.code}` : '/')}
              />
            </Suspense>
          }
        />
        <Route
          path="/siralama"
          element={
            <Suspense
              fallback={
                <main className="site-width room-page" role="status">
                  Sıralama yükleniyor…
                </main>
              }
            >
              <LeaderboardPage
                profile={profile}
                loadEntries={loadEntries}
                onAccount={openAccount}
                onHome={() => navigate(room ? `/room/${room.code}` : '/')}
              />
            </Suspense>
          }
        />
        <Route
          path="/room/:code"
          element={
            <RoomRoute
              enabled={enabled}
              accountName={profile?.username}
              recovering={recovering}
              preferences={preferences}
              enter={enter}
              leave={() => setOverlay('leave')}
              notify={notify}
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {overlay === 'help' && (
        <Modal title="Nasıl oynanır?" onClose={() => setOverlay(undefined)}>
          <Help />
        </Modal>
      )}
      {overlay === 'profile' && (
        <Modal title={profile ? 'Hesabım' : 'Giriş ve kayıt'} onClose={() => setOverlay(undefined)}>
          <Suspense fallback={<p role="status">Hesap ekranı yükleniyor…</p>}>
            <AccountPanel
              profile={profile}
              onAuthenticate={(kind, credentials) => changeAccount(() => authenticate(kind, credentials))}
              onLogout={() => changeAccount(logout)}
              onLeaderboard={openLeaderboard}
              accountActionsEnabled={!room && !recovering && !hasRoomTicket()}
            />
          </Suspense>
        </Modal>
      )}
      {overlay === 'settings' && (
        <Modal title="Ayarlar" onClose={() => setOverlay(undefined)}>
          <PreferencesPanel
            preferences={preferences}
            setPreferences={setPreferences}
            help={() => setOverlay('help')}
          />
        </Modal>
      )}
      {overlay === 'private-room' && (
        <Modal title="Özel Oda" onClose={() => setOverlay(undefined)}>
          <div className="private-room-options">
            <button type="button" className="button button-primary" onClick={() => setOverlay('create')}>
              <Plus size={18} aria-hidden="true" /> Oda oluştur
            </button>
            <button type="button" className="button button-secondary" onClick={() => setOverlay('join')}>
              <DoorOpen size={18} aria-hidden="true" /> Odaya katıl
            </button>
            <button type="button" className="button button-secondary" onClick={() => setOverlay('watch')}>
              <Eye size={18} aria-hidden="true" /> İzleyici olarak katıl
            </button>
          </div>
        </Modal>
      )}
      {(overlay === 'create' || overlay === 'join' || overlay === 'watch') && (
        <Modal
          title={overlay === 'create' ? 'Oda oluştur' : overlay === 'watch' ? 'Odayı izle' : 'Odaya katıl'}
          onClose={() => setOverlay(undefined)}
        >
          {!connected && <ConnectionNotice message="Sunucuya bağlanılıyor…" />}
          <RoomForm
            key={overlay}
            mode={overlay === 'create' ? 'create' : 'join'}
            watchOnly={overlay === 'watch'}
            accountName={profile?.username}
            enabled={enabled}
            entered={enter}
          />
        </Modal>
      )}
      {overlay === 'leave' && (
        <Modal title="Odadan ayrıl" onClose={() => setOverlay(undefined)}>
          <p className="modal-description">
            {room?.phase === 'round' || room?.phase === 'countdown' || room?.phase === 'intermission'
              ? 'Devam eden maçtan çıkacaksın.'
              : 'Ana menüye döneceksin.'}
          </p>
          {!enabled && <ConnectionNotice message="Oturum yeniden bağlanıyor…" />}
          <div className="button-group">
            <button className="button button-secondary" onClick={() => setOverlay(undefined)}>
              Odada kal
            </button>
            <button
              className="button button-danger"
              disabled={!enabled || leaving}
              onClick={() => void leave()}
            >
              <DoorOpen size={16} /> Ayrıl
            </button>
          </div>
        </Modal>
      )}
      <div className="toast-region" aria-live="polite">
        {toast && <div className="toast">{toast}</div>}
      </div>
    </>
  );
}

function ConnectionNotice({ message }: { message: string }) {
  return (
    <div className="connection-notice" role="status">
      <WifiOff size={17} /> {message}
    </div>
  );
}

function RoomRoute({
  enabled,
  accountName,
  recovering,
  preferences,
  enter,
  leave,
  notify,
}: {
  enabled: boolean;
  accountName?: string;
  recovering: boolean;
  preferences: Preferences;
  enter: (code: string) => void;
  leave: () => void;
  notify: (message: string) => void;
}) {
  const room = useArena((state) => state.room);
  const { code } = useParams<{ code: string }>();
  const watchOnly = new URLSearchParams(useLocation().search).get('izle') === '1';
  const navigate = useNavigate();
  const [finishedLobby, setFinishedLobby] = useState(false);

  useEffect(() => {
    if (room?.phase !== 'finished') setFinishedLobby(false);
  }, [room?.phase]);

  const invite = code?.toUpperCase() ?? '';
  if (!/^[A-Z0-9]{6}$/.test(invite)) {
    return (
      <main className="site-width room-page">
        <section className="panel standalone">
          <h1>Oda kodu geçersiz</h1>
          <p>Oda kodu altı harf veya rakamdan oluşur. Davet bağlantısını kontrol et.</p>
          <button className="button button-secondary" onClick={() => navigate('/')}>
            Ana menüye dön
          </button>
        </section>
      </main>
    );
  }

  if (room?.code !== invite) {
    return (
      <main className="site-width room-page">
        <section className="panel standalone">
          <span className="result-icon">
            <Link2 size={22} />
          </span>
          <h1>Özel oda daveti</h1>
          <p className="room-label">
            <Lock size={13} /> Oda kodu <code>{invite}</code>
          </p>
          {!enabled && (
            <ConnectionNotice message={recovering ? 'Oturum geri yükleniyor…' : 'Sunucuya bağlanılıyor…'} />
          )}
          {room ? (
            <button className="button button-secondary" onClick={() => navigate(`/room/${room.code}`)}>
              Açık odana dön
            </button>
          ) : (
            <RoomForm
              key={`${invite}-${watchOnly}`}
              mode="join"
              inviteCode={invite}
              watchOnly={watchOnly}
              accountName={accountName}
              entered={enter}
              enabled={enabled}
            />
          )}
        </section>
      </main>
    );
  }

  return (
    <main className={`site-width room-page page-${room.phase}`}>
      <RoomHeading room={room} leave={leave} />
      {!enabled && (
        <ConnectionNotice
          message={
            room.deadline === null
              ? 'Bağlantı yeniden kuruluyor.'
              : 'Bağlantı yeniden kuruluyor. Oyun süresi işlemeye devam eder.'
          }
        />
      )}
      {room.phase === 'lobby' && <Lobby room={room} enabled={enabled} notify={notify} />}
      {room.phase === 'countdown' && <Countdown room={room} />}
      {room.phase === 'round' &&
        (room.viewerRole === 'spectator' ? (
          <SpectatorRound room={room} />
        ) : (
          <GameRound
            key={`${room.matchId}-${room.round}`}
            room={room}
            enabled={enabled}
            preferences={preferences}
          />
        ))}
      {room.phase === 'intermission' && <RoundResults key={room.round} room={room} />}
      {room.phase === 'finished' &&
        (finishedLobby ? (
          <Lobby
            room={room}
            enabled={enabled}
            notify={notify}
            afterMatch
            showResults={() => setFinishedLobby(false)}
          />
        ) : (
          <MatchResults
            room={room}
            enabled={enabled}
            notify={notify}
            continueRoom={() => setFinishedLobby(true)}
            leave={leave}
          />
        ))}
    </main>
  );
}
