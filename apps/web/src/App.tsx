import { useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, CircleUserRound, DoorOpen, Link2, Lock, WifiOff } from 'lucide-react';
import { attachConnection, forgetTicket, request, useArena } from './connection';
import { Countdown, GameRound, MatchResults, RoundResults } from './Game';
import { Landing } from './Landing';
import { Lobby, RoomHeading } from './Lobby';
import { RoomForm, type EntryMode } from './RoomForm';
import { Header, Help, loadPreferences, Modal, type Preferences } from './ui';

type Overlay = EntryMode | 'help' | 'profile' | 'leave';

export function App() {
  const { room, connected, recovering, notice } = useArena();
  const [preferences, setPreferences] = useState(loadPreferences);
  const [overlay, setOverlay] = useState<Overlay>();
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [leaving, setLeaving] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const enabled = connected && !recovering;

  useEffect(attachConnection, []);
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

  function open(mode: EntryMode | 'help') {
    if (room && mode !== 'help') {
      navigate(`/room/${room.code}`);
      return;
    }
    setOverlay(mode);
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

  const me = room?.players.find((player) => player.id === room.playerId);

  return (
    <>
      <Header
        home={home}
        help={() => setOverlay('help')}
        profile={() => setOverlay('profile')}
        preferences={preferences}
        setPreferences={setPreferences}
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
          path="/room/:code"
          element={
            <RoomRoute
              enabled={enabled}
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
        <Modal title="Oyuncu profili" onClose={() => setOverlay(undefined)}>
          <div className="profile-card">
            <CircleUserRound size={30} />
            <div>
              <strong>{me?.name ?? 'Misafir oyuncu'}</strong>
              <p>Odaya katılırken oyuncu adını seçebilirsin.</p>
            </div>
          </div>
          <label className="preferences-control">
            <div>
              <strong>Harf işaretleri</strong>
              <p>Tahmin sonuçlarını renklerle birlikte simgelerle göster.</p>
            </div>
            <input
              type="checkbox"
              checked={preferences.symbols}
              onChange={(event) => setPreferences({ ...preferences, symbols: event.target.checked })}
            />
          </label>
        </Modal>
      )}
      {(overlay === 'create' || overlay === 'join') && (
        <Modal
          title={overlay === 'create' ? 'Oda oluştur' : 'Odaya katıl'}
          onClose={() => setOverlay(undefined)}
        >
          {!connected && <ConnectionNotice message="Sunucuya bağlanılıyor…" />}
          <RoomForm mode={overlay} enabled={enabled} entered={enter} />
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
  recovering,
  preferences,
  enter,
  leave,
  notify,
}: {
  enabled: boolean;
  recovering: boolean;
  preferences: Preferences;
  enter: (code: string) => void;
  leave: () => void;
  notify: (message: string) => void;
}) {
  const room = useArena((state) => state.room);
  const { code } = useParams<{ code: string }>();
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
            <RoomForm key={invite} mode="join" inviteCode={invite} entered={enter} enabled={enabled} />
          )}
        </section>
      </main>
    );
  }

  return (
    <main className={`site-width room-page page-${room.phase}`}>
      <RoomHeading room={room} leave={leave} />
      {!enabled && (
        <ConnectionNotice message="Bağlantı yeniden kuruluyor. Oyun süresi işlemeye devam eder." />
      )}
      {room.phase === 'lobby' && <Lobby room={room} enabled={enabled} notify={notify} />}
      {room.phase === 'countdown' && <Countdown room={room} />}
      {room.phase === 'round' && (
        <GameRound
          key={`${room.matchId}-${room.round}`}
          room={room}
          enabled={enabled}
          preferences={preferences}
        />
      )}
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
