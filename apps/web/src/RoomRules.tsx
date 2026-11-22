import {
  DEFAULT_ROUND_MODE,
  ROUND_COUNT,
  ROUND_COUNT_MIN,
  ROUND_COUNT_MAX,
  ROUND_SECONDS_MIN,
  ROUND_SECONDS_MAX,
  ROUND_MS,
  TEAM_SIZE,
  type RoomView,
} from '@arena/shared';

export type RoomRulesValue = Pick<
  RoomView,
  'roundCount' | 'roundSeconds' | 'roundMode' | 'gameMode' | 'maxPlayers'
>;

export const gameModeLabel: Record<RoomRulesValue['gameMode'], string> = {
  ffa: 'Bireysel',
  '2v2': '2’ye 2',
  '3v3': '3’e 3',
};

export const teamLabel = { a: 'Mor takım', b: 'Yeşil takım' };

export const defaultRoomRules: RoomRulesValue = {
  roundCount: ROUND_COUNT,
  roundSeconds: ROUND_MS / 1000,
  roundMode: DEFAULT_ROUND_MODE,
  gameMode: 'ffa',
  maxPlayers: 8,
};

export function RoomRules({
  value,
  onChange,
  minimumPlayers = 2,
}: {
  value: RoomRulesValue;
  onChange: (value: RoomRulesValue) => void;
  minimumPlayers?: number;
}) {
  const { gameMode, roundMode, roundCount, roundSeconds, maxPlayers } = value;
  const isTeam = gameMode !== 'ffa';

  function selectGameMode(mode: RoomRulesValue['gameMode']) {
    const capacity = mode === 'ffa' ? Math.max(minimumPlayers, maxPlayers) : TEAM_SIZE[mode] * 2;
    onChange({ ...value, gameMode: mode, maxPlayers: capacity });
  }

  return (
    <>
      <div className="form-columns">
        <label>
          Oyun biçimi
          <select
            value={gameMode}
            onChange={(event) => selectGameMode(event.currentTarget.value as RoomRulesValue['gameMode'])}
          >
            <option value="ffa">{gameModeLabel.ffa}</option>
            <option value="2v2" disabled={minimumPlayers > TEAM_SIZE['2v2'] * 2}>
              {gameModeLabel['2v2']}
            </option>
            <option value="3v3" disabled={minimumPlayers > TEAM_SIZE['3v3'] * 2}>
              {gameModeLabel['3v3']}
            </option>
          </select>
        </label>
        <label>
          Oyuncu kapasitesi
          <select
            disabled={isTeam}
            value={maxPlayers}
            onChange={(event) => onChange({ ...value, maxPlayers: Number(event.currentTarget.value) })}
          >
            {Array.from({ length: 9 - minimumPlayers }, (_, index) => index + minimumPlayers).map((size) => (
              <option key={size} value={size}>
                {size} oyuncu
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-columns">
        <label>
          Tur sayısı
          <select
            value={roundCount}
            onChange={(event) => onChange({ ...value, roundCount: Number(event.currentTarget.value) })}
          >
            {Array.from(
              { length: ROUND_COUNT_MAX - ROUND_COUNT_MIN + 1 },
              (_, index) => index + ROUND_COUNT_MIN,
            ).map((count) => (
              <option key={count} value={count}>
                {count} tur
              </option>
            ))}
          </select>
        </label>
        <label>
          Tur modu
          <select
            value={roundMode}
            onChange={(event) => {
              const validDuration =
                Number.isInteger(roundSeconds) &&
                roundSeconds >= ROUND_SECONDS_MIN &&
                roundSeconds <= ROUND_SECONDS_MAX;
              onChange({
                ...value,
                roundMode: event.currentTarget.value as RoomRulesValue['roundMode'],
                roundSeconds: validDuration ? roundSeconds : defaultRoomRules.roundSeconds,
              });
            }}
          >
            <option value="timed">Süreli</option>
            <option value="untimed">Süresiz</option>
          </select>
        </label>
      </div>
      {roundMode === 'timed' && (
        <label>
          Tur süresi (saniye)
          <input
            type="number"
            inputMode="numeric"
            min={ROUND_SECONDS_MIN}
            max={ROUND_SECONDS_MAX}
            step={1}
            value={roundSeconds || ''}
            onChange={(event) => onChange({ ...value, roundSeconds: Number(event.currentTarget.value) })}
            required
          />
        </label>
      )}
    </>
  );
}
