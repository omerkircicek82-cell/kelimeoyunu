import { useState, type FormEvent } from 'react';
import { ArrowRight, Lock, Plus } from 'lucide-react';
import { DEFAULT_ROUND_MODE, type RoundMode } from '@arena/shared';
import { rememberTicket, request } from './connection';
import { RoundModeField } from './ui';

export type EntryMode = 'create' | 'join';

function cleanCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

export function RoomForm({
  mode,
  inviteCode,
  entered,
  enabled,
}: {
  mode: EntryMode;
  inviteCode?: string;
  entered: (code: string) => void;
  enabled: boolean;
}) {
  const [name, setName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [code, setCode] = useState(inviteCode ?? '');
  const [capacity, setCapacity] = useState(8);
  const [roundMode, setRoundMode] = useState<RoundMode>(DEFAULT_ROUND_MODE);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !enabled) return;
    setError('');
    setBusy(true);
    try {
      const ticket =
        mode === 'create'
          ? await request('room:create', {
              playerName: name.trim(),
              name: roomName.trim() || undefined,
              maxPlayers: capacity,
              roundMode,
            })
          : await request('room:join', { playerName: name.trim(), code });
      rememberTicket(ticket);
      entered(ticket.room.code);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Odaya giriş yapılamadı.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="room-form" onSubmit={submit}>
      <label>
        Oyuncu adı
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Arenada görünen adın"
          minLength={2}
          maxLength={24}
          required
          autoComplete="nickname"
        />
      </label>
      {mode === 'create' ? (
        <>
          <label>
            Oda adı <small>İsteğe bağlı</small>
            <input
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              placeholder="Örn. Cuma Arenası"
              maxLength={40}
            />
          </label>
          <div className="form-columns">
            <label>
              Görünürlük
              <span className="locked-field">
                <Lock size={15} /> Özel oda
              </span>
            </label>
            <label>
              Oyuncu kapasitesi
              <select value={capacity} onChange={(event) => setCapacity(Number(event.target.value))}>
                {Array.from({ length: 7 }, (_, index) => index + 2).map((size) => (
                  <option key={size} value={size}>
                    {size} oyuncu
                  </option>
                ))}
              </select>
            </label>
          </div>
          <RoundModeField value={roundMode} onChange={setRoundMode} />
        </>
      ) : (
        <label>
          Oda kodu
          <input
            className="code-input"
            value={code}
            onChange={(event) => setCode(cleanCode(event.target.value))}
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="ABC123"
            pattern="[A-Z0-9]{6}"
            minLength={6}
            maxLength={6}
            required
          />
        </label>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="button button-primary form-submit" disabled={busy || !enabled}>
        {mode === 'create' ? <Plus size={18} /> : <ArrowRight size={18} />}
        {busy ? 'Bağlanıyor…' : mode === 'create' ? 'Oda oluştur' : 'Odaya katıl'}
      </button>
    </form>
  );
}
