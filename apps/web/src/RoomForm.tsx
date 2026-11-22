import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, Plus } from 'lucide-react';
import { rememberTicket, request } from './connection';
import { defaultRoomRules, RoomRules } from './RoomRules';

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
  accountName,
  watchOnly = false,
  entered,
  enabled,
}: {
  mode: EntryMode;
  inviteCode?: string;
  accountName?: string;
  watchOnly?: boolean;
  entered: (code: string) => void;
  enabled: boolean;
}) {
  const [name, setName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [code, setCode] = useState(inviteCode ?? '');
  const [rules, setRules] = useState(defaultRoomRules);
  const [spectator, setSpectator] = useState(watchOnly);
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
              playerName: accountName ?? name.trim(),
              name: roomName.trim() || undefined,
              ...rules,
            })
          : spectator
            ? await request('room:spectate', { code })
            : await request('room:join', { playerName: accountName ?? name.trim(), code });
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
      {mode === 'join' && (
        <label>
          Katılım biçimi
          <select
            value={spectator ? 'spectator' : 'player'}
            onChange={(event) => setSpectator(event.currentTarget.value === 'spectator')}
          >
            <option value="player">Oyuncu olarak katıl</option>
            <option value="spectator">İzleyici olarak katıl</option>
          </select>
        </label>
      )}
      {!spectator && (
        <label>
          Oyuncu adı
          <input
            value={accountName ?? name}
            readOnly={Boolean(accountName)}
            onChange={(event) => setName(event.target.value)}
            placeholder="Arenada görünen adın"
            minLength={2}
            maxLength={24}
            required
            autoComplete="nickname"
          />
        </label>
      )}
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
          <RoomRules value={rules} onChange={setRules} />
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
        {mode === 'create' ? <Plus size={18} /> : spectator ? <Eye size={18} /> : <ArrowRight size={18} />}
        {busy ? 'Bağlanıyor…' : mode === 'create' ? 'Oda oluştur' : spectator ? 'Odayı izle' : 'Odaya katıl'}
      </button>
    </form>
  );
}
