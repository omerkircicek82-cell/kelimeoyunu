import { useState, type FormEvent } from 'react';
import {
  Check,
  CircleMinus,
  Copy,
  Crown,
  DoorOpen,
  Eye,
  Lock,
  Play,
  Settings2,
  Timer,
  UsersRound,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { PlayerView, RoomView } from '@arena/shared';
import { request } from './connection';
import { Avatar, Modal, roundModeLabel, ShareButton } from './ui';
import { gameModeLabel, RoomRules, teamLabel, type RoomRulesValue } from './RoomRules';

export function RoomHeading({ room, leave }: { room: RoomView; leave: () => void }) {
  return (
    <div className="room-heading">
      <div>
        <p className="room-label">
          <Lock size={13} /> Özel oda <code>{room.code}</code>
          <span className="room-mode">
            <Timer size={13} aria-hidden="true" /> {roundModeLabel[room.roundMode]}
            {room.roundMode === 'timed' ? ` · ${room.roundSeconds} sn` : ''}
          </span>
          <span>
            {gameModeLabel[room.gameMode]} · {room.roundCount} tur
          </span>
          {room.spectatorCount > 0 && (
            <span className="room-mode">
              <Eye size={13} /> {room.spectatorCount} izleyici
            </span>
          )}
        </p>
        <h1>{room.name}</h1>
      </div>
      <button className="button button-quiet" onClick={leave}>
        <DoorOpen size={17} /> <span>Odadan ayrıl</span>
      </button>
    </div>
  );
}

export function InviteCard({ room, notify }: { room: RoomView; notify: (message: string) => void }) {
  const url = new URL(`/room/${room.code}`, window.location.origin).href;
  const watchUrl = new URL(url);
  watchUrl.searchParams.set('izle', '1');
  return (
    <section className="panel lobby-invite" aria-label="Arkadaşlarını davet et">
      <h2>Arkadaşlarını davet et</h2>
      <p>Oda kodunu veya davet bağlantısını paylaş.</p>
      <button
        type="button"
        className="invite-code"
        title="Oda kodunu kopyala"
        aria-label={`Oda kodunu kopyala: ${room.code}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(room.code);
            notify('Oda kodu kopyalandı.');
          } catch {
            notify('Kod kopyalanamadı.');
          }
        }}
      >
        <code>{room.code}</code>
        <Copy size={19} />
      </button>
      <input
        className="invite-url"
        readOnly
        aria-label="Davet bağlantısı"
        value={url}
        onFocus={(event) => event.target.select()}
      />
      <ShareButton
        title="Kelime Arenası"
        text={`Kelime Arenası’na katıl. Oda kodu: ${room.code}`}
        url={url}
        label="Davet bağlantısını paylaş"
        notify={notify}
      />
      <ShareButton
        title="Kelime Arenası"
        text={`Kelime Arenası maçını izle. Oda kodu: ${room.code}`}
        url={watchUrl.href}
        label="İzleyici bağlantısını paylaş"
        notify={notify}
      />
    </section>
  );
}

export function Lobby({
  room,
  enabled,
  notify,
  afterMatch = false,
  showResults,
}: {
  room: RoomView;
  enabled: boolean;
  notify: (message: string) => void;
  afterMatch?: boolean;
  showResults?: () => void;
}) {
  const me = room.players.find((player) => player.id === room.playerId);
  const spectator = room.viewerRole === 'spectator';
  const host = !spectator && room.hostId === room.playerId;
  const teamsReady = room.gameMode === 'ffa' || room.players.length === room.maxPlayers;
  const canStart =
    teamsReady &&
    room.players.length >= 2 &&
    room.players.every((player) => player.connected && (player.id === room.hostId || player.ready));
  const active = room.phase === 'lobby';
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(false);
  const [kick, setKick] = useState<PlayerView | null>(null);

  async function run(action: () => Promise<unknown>) {
    if (busy || !enabled) return;
    setBusy(true);
    try {
      await action();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'İşlem tamamlanamadı.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lobby-grid">
      <section className="panel lobby-players">
        <div className="panel-heading">
          <h2>
            <UsersRound size={20} /> Oyuncular{' '}
            <span className="count-chip">
              {room.players.length}/{room.maxPlayers}
            </span>
          </h2>
          {host && active && (
            <button
              className="icon-button"
              title="Oda ayarları"
              aria-label="Oda ayarları"
              onClick={() => setSettings(true)}
            >
              <Settings2 size={19} />
            </button>
          )}
        </div>
        {active && me && room.gameMode !== 'ffa' && (
          <div className="lobby-team-switch" role="group" aria-label="Takım seç">
            {(['a', 'b'] as const).map((teamId) => {
              const count = room.players.filter((player) => player.teamId === teamId).length;
              return (
                <button
                  key={teamId}
                  type="button"
                  className={`button button-secondary team-${teamId}`}
                  aria-pressed={me.teamId === teamId}
                  disabled={busy || !enabled || (count >= room.maxPlayers / 2 && me.teamId !== teamId)}
                  onClick={() => {
                    if (me.teamId !== teamId) void run(() => request('room:team', { teamId }));
                  }}
                >
                  {teamLabel[teamId]} · {count}/{room.maxPlayers / 2}
                </button>
              );
            })}
          </div>
        )}
        <ul className="lobby-list">
          {room.players.map((player) => (
            <motion.li layout key={player.id} className="player-row">
              <Avatar name={player.name} id={player.id} />
              <span className="player-name">
                {player.name}
                {player.teamId && (
                  <small className={`team-${player.teamId}`}>{teamLabel[player.teamId]}</small>
                )}
                {player.id === room.playerId && <small>Sen</small>}
              </span>
              {player.id === room.hostId && (
                <span className="host-badge">
                  <Crown size={15} /> <span>Oda sahibi</span>
                </span>
              )}
              <span className={player.connected && player.ready ? 'ready-state ready' : 'ready-state'}>
                {!player.connected ? (
                  'Bağlantı kesildi'
                ) : player.ready ? (
                  <>
                    <Check size={15} /> Hazır
                  </>
                ) : (
                  'Bekliyor'
                )}
              </span>
              {host && active && player.id !== room.hostId && (
                <button
                  className="icon-button kick-button"
                  title={`${player.name} adlı oyuncuyu çıkar`}
                  aria-label={`${player.name} adlı oyuncuyu çıkar`}
                  onClick={() => setKick(player)}
                >
                  <CircleMinus size={18} />
                </button>
              )}
            </motion.li>
          ))}
        </ul>
        <div className="lobby-actions">
          {spectator ? (
            <p>İzleyici olarak oyuncuların durumunu ve maç sonuçlarını takip edebilirsin.</p>
          ) : afterMatch ? (
            <>
              <p>
                {host
                  ? 'Bir sonraki maç için oyuncular yeniden hazır olacak.'
                  : 'Oda sahibinin yeni maçı açması bekleniyor.'}
              </p>
              <div className="button-group">
                {host && (
                  <button
                    className="button button-primary"
                    disabled={busy || !enabled}
                    onClick={() => void run(() => request('game:restart', {}))}
                  >
                    <Play size={17} /> Yeni maça hazırlan
                  </button>
                )}
                <button className="button button-secondary" onClick={showResults}>
                  Sonuçları göster
                </button>
              </div>
            </>
          ) : host ? (
            <>
              <p>
                {room.players.length < 2
                  ? 'Başlamak için en az iki oyuncu gerekli.'
                  : !teamsReady
                    ? 'Maçın başlaması için iki takım da dolmalı.'
                    : !canStart
                      ? 'Diğer oyuncuların hazır olması bekleniyor.'
                      : 'Herkes hazır. Arenayı başlatabilirsin.'}
              </p>
              <button
                className="button button-primary"
                disabled={!canStart || !enabled || busy || !active}
                onClick={() => void run(() => request('game:start', {}))}
              >
                <Play size={17} /> Oyunu başlat
              </button>
            </>
          ) : (
            <>
              <p>
                {me?.ready
                  ? 'Oda sahibinin maçı başlatması bekleniyor.'
                  : 'Başlamaya hazır olduğunda diğerlerine bildir.'}
              </p>
              <button
                className={`button ${me?.ready ? 'button-secondary' : 'button-primary'}`}
                disabled={!me || !active || !enabled || busy}
                aria-pressed={me?.ready ?? false}
                onClick={() => void run(() => request('room:player-ready', { ready: !me?.ready }))}
              >
                <Check size={18} /> {me?.ready ? 'Hazır durumunu geri al' : 'Hazırım'}
              </button>
            </>
          )}
        </div>
      </section>
      <InviteCard room={room} notify={notify} />
      {settings && active && (
        <Modal title="Oda ayarları" onClose={() => setSettings(false)}>
          <SettingsForm room={room} close={() => setSettings(false)} enabled={enabled} />
        </Modal>
      )}
      {kick && active && (
        <Modal title="Oyuncuyu çıkar" onClose={() => setKick(null)}>
          <p className="modal-description">{kick.name} odadan çıkarılacak.</p>
          <div className="button-group">
            <button className="button button-secondary" onClick={() => setKick(null)}>
              Vazgeç
            </button>
            <button
              className="button button-danger"
              disabled={busy || !enabled}
              onClick={() =>
                void run(async () => {
                  await request('room:player-kick', { playerId: kick.id });
                  setKick(null);
                })
              }
            >
              Oyuncuyu çıkar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SettingsForm({ room, enabled, close }: { room: RoomView; enabled: boolean; close: () => void }) {
  const [name, setName] = useState(room.name);
  const [rules, setRules] = useState<RoomRulesValue>({
    roundCount: room.roundCount,
    roundSeconds: room.roundSeconds,
    roundMode: room.roundMode,
    gameMode: room.gameMode,
    maxPlayers: room.maxPlayers,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const minPlayers = Math.max(2, room.players.length);

  async function change(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !enabled) return;
    setBusy(true);
    setError('');
    try {
      await request('room:settings', { name: name.trim(), ...rules });
      close();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Ayarlar kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="room-form" onSubmit={change}>
      <label>
        Oda adı
        <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={40} />
      </label>
      <RoomRules value={rules} onChange={setRules} minimumPlayers={minPlayers} />
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button className="button button-primary" disabled={!enabled || busy}>
        Ayarları kaydet
      </button>
    </form>
  );
}
