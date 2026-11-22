import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CircleHelp,
  KeyRound,
  Minus,
  Play,
  RotateCcw,
  Trophy,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { evaluateGuess } from '@arena/game-engine';
import { MAX_ATTEMPTS, WORD_LENGTH } from '@arena/shared';
import './landing.css';

export type LandingAction = 'quick' | 'private-room' | 'daily' | 'leaderboard' | 'help';

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

const mainActions = [
  { id: 'quick', label: 'Hızlı Oyna', icon: Play },
  { id: 'private-room', label: 'Özel Oda', icon: KeyRound },
  { id: 'daily', label: 'Günlük Mücadele', icon: CalendarDays },
  { id: 'leaderboard', label: 'Liderlik', icon: Trophy },
] as const;

export function Landing({ open }: { open: (mode: LandingAction) => void }) {
  const [showCrest, setShowCrest] = useState(true);

  return (
    <main className="arena-home">
      <section className="arena-landing" aria-labelledby="arena-home-title">
        <div className="arena-landing__content">
          <h1 id="arena-home-title" className="arena-landing__crest">
            {showCrest ? (
              <img
                src="/harfarena-crest.webp"
                alt="HarfArena"
                width={1446}
                height={1086}
                fetchPriority="high"
                onError={() => setShowCrest(false)}
              />
            ) : (
              <span>HarfArena</span>
            )}
          </h1>
          <nav className="arena-landing__actions" aria-label="Oyun menüsü">
            {mainActions.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={`arena-landing__button arena-landing__button--${id}`}
                onClick={() => open(id)}
              >
                <span className="arena-landing__action-icon">
                  <Icon size={23} aria-hidden="true" />
                </span>
                <span>{label}</span>
                <ArrowRight className="arena-landing__arrow" size={19} aria-hidden="true" />
              </button>
            ))}
          </nav>
          <button type="button" className="arena-landing__help" onClick={() => open('help')}>
            <CircleHelp size={17} aria-hidden="true" /> Nasıl oynanır?
          </button>
        </div>
      </section>
      <div className="arena-landing__example">
        <ExampleBoard />
      </div>
    </main>
  );
}
