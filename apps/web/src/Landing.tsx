import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CircleHelp,
  DoorOpen,
  Minus,
  Plus,
  RotateCcw,
  UsersRound,
  WifiOff,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { evaluateGuess } from '@arena/game-engine';
import { MAX_ATTEMPTS, WORD_LENGTH } from '@arena/shared';
import './landing.css';

type Mode = 'create' | 'join' | 'offline' | 'daily' | 'help';

const exampleKey = 'arena-landing-example';
const examples = [
  { answer: 'GÜNEŞ', guesses: ['ŞEHİR', 'BULUT', 'GÜNEY'] },
  { answer: 'KİTAP', guesses: ['KİTLE'] },
  { answer: 'CEVİZ', guesses: ['ZEBRA', 'ÇEVİK'] },
  { answer: 'MERAK', guesses: ['KEMER', 'MERAM'] },
  { answer: 'PAMUK', guesses: ['KUMAR', 'KABUK'] },
];

function chooseExample(previous: string | null) {
  const choices = examples.filter(({ answer }) => answer !== previous);
  return choices[Math.floor(Math.random() * choices.length)];
}

function previousExample() {
  try {
    return sessionStorage.getItem(exampleKey);
  } catch {
    return null;
  }
}

const marks = {
  correct: { label: 'Doğru yerde', icon: Check },
  present: { label: 'Yanlış yerde', icon: ArrowUpRight },
  absent: { label: 'Eşleşme yok', icon: Minus },
};

function ExampleBoard() {
  const [example, setExample] = useState(() => chooseExample(previousExample()));
  const rows = [...example.guesses, example.answer].map((word) => ({
    word,
    marks: evaluateGuess(example.answer, word),
  }));

  useEffect(() => {
    try {
      sessionStorage.setItem(exampleKey, example.answer);
    } catch {
      // The board still rotates when browser storage is unavailable.
    }
  }, [example.answer]);

  return (
    <section className="arena-landing-board" aria-labelledby="arena-landing-demo">
      <div className="arena-landing-board__header">
        <h2 id="arena-landing-demo">Örnek tahta</h2>
        <button
          type="button"
          className="arena-landing-board__replay"
          aria-label="Başka bir örnek tahta göster"
          title="Başka bir örnek göster"
          onClick={() => setExample((previous) => chooseExample(previous.answer))}
        >
          <RotateCcw size={17} aria-hidden="true" />
        </button>
      </div>
      <div
        key={example.answer}
        className="arena-landing-board__grid"
        role="img"
        aria-label={`${example.guesses.join(' ve ')} tahminlerinden sonra ${example.answer} ${rows.length}. denemede çözüldü.`}
      >
        {Array.from({ length: MAX_ATTEMPTS }, (_, row) => {
          const guess = rows[row];
          return Array.from({ length: WORD_LENGTH }, (_, column) => {
            const mark = guess?.marks[column];
            const indicator = mark && marks[mark];
            const Indicator = indicator && indicator.icon;

            return (
              <span
                key={row * WORD_LENGTH + column}
                className={`arena-landing-board__tile ${mark ? `arena-landing-board__tile--${mark}` : ''}`}
                style={{ animationDelay: `${120 + row * 370 + column * 52}ms` }}
                aria-hidden="true"
              >
                {guess?.word[column]}
                {Indicator && <Indicator className="arena-landing-board__mark" size={12} />}
              </span>
            );
          });
        })}
      </div>
      <ul className="arena-landing-board__legend" aria-label="Harf işaretleri">
        {Object.entries(marks).map(([mark, { label, icon: Icon }]) => (
          <li key={mark} className={`arena-landing-board__legend--${mark}`}>
            <Icon size={14} aria-hidden="true" /> {label}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Landing({ open }: { open: (mode: Mode) => void }) {
  return (
    <main className="arena-landing">
      <div className="arena-landing__content">
        <div className="arena-landing__capacity">
          <UsersRound size={16} aria-hidden="true" />
          2–8 oyuncu
        </div>
        <h1>
          KELİME
          <span>ARENASI</span>
        </h1>
        <p className="arena-landing__tagline">
          Kelimeleri çöz, zamana karşı yarış, arkadaşlarını geride bırak!
        </p>
        <p className="arena-landing__description">
          Arkadaşlarınla süreli veya süresiz turlarda yarış. Tek başına çevrimdışı oynayarak beş harfli
          kelimeleri de çözebilirsin.
        </p>

        <div className="arena-landing__actions">
          <button
            type="button"
            className="arena-landing__button arena-landing__button--primary"
            onClick={() => open('create')}
          >
            <Plus size={19} aria-hidden="true" />
            Oda oluştur
            <ArrowRight className="arena-landing__action-arrow" size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="arena-landing__button arena-landing__button--secondary"
            onClick={() => open('join')}
          >
            <DoorOpen size={18} aria-hidden="true" />
            Odaya katıl
          </button>
          <button
            type="button"
            className="arena-landing__button arena-landing__button--offline"
            onClick={() => open('offline')}
          >
            <WifiOff size={18} aria-hidden="true" />
            Çevrimdışı oyna
          </button>
          <button
            type="button"
            className="arena-landing__button arena-landing__button--secondary"
            onClick={() => open('daily')}
          >
            <CalendarDays size={18} aria-hidden="true" />
            Günlük mücadele
          </button>
        </div>
        <button type="button" className="arena-landing__help" onClick={() => open('help')}>
          <CircleHelp size={17} aria-hidden="true" />
          Nasıl oynanır?
        </button>
      </div>
      <div className="arena-landing__example">
        <ExampleBoard />
      </div>
    </main>
  );
}
