import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleHelp,
  DoorOpen,
  Minus,
  Plus,
  RotateCcw,
  UsersRound,
} from 'lucide-react';
import { useState } from 'react';
import './landing.css';

type Mode = 'create' | 'join' | 'help';
type ExampleMark = 'correct' | 'present' | 'absent';

const example: { word: string; marks: ExampleMark[] }[] = [
  { word: 'ŞEHİR', marks: ['present', 'present', 'absent', 'absent', 'absent'] },
  { word: 'GÜNEY', marks: ['correct', 'correct', 'correct', 'correct', 'absent'] },
  { word: 'GÜNEŞ', marks: ['correct', 'correct', 'correct', 'correct', 'correct'] },
];

const marks = {
  correct: { label: 'Doğru yerde', icon: Check },
  present: { label: 'Yanlış yerde', icon: ArrowUpRight },
  absent: { label: 'Eşleşme yok', icon: Minus },
};

function ExampleBoard() {
  const [play, setPlay] = useState(0);

  return (
    <section className="arena-landing-board" aria-labelledby="arena-landing-demo">
      <div className="arena-landing-board__header">
        <h2 id="arena-landing-demo">Örnek tahta</h2>
        <button
          type="button"
          className="arena-landing-board__replay"
          aria-label="Tahta animasyonunu yeniden oynat"
          title="Animasyonu yeniden oynat"
          onClick={() => setPlay((previous) => previous + 1)}
        >
          <RotateCcw size={17} aria-hidden="true" />
        </button>
      </div>
      <div
        key={play}
        className="arena-landing-board__grid"
        role="img"
        aria-label="ŞEHİR ve GÜNEY tahminlerinden sonra GÜNEŞ üçüncü denemede çözüldü."
      >
        {Array.from({ length: 5 }, (_, row) => {
          const guess = example[row];
          return Array.from({ length: 5 }, (_, column) => {
            const mark = guess?.marks[column];
            const indicator = mark && marks[mark];
            const Indicator = indicator && indicator.icon;

            return (
              <span
                key={row * 5 + column}
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
          5 kelime, 90 saniyelik turlar ve tek bir şampiyon! Arkadaşlarınla aynı arenada yarış, doğru
          kelimeleri herkesten önce bul ve zirveye çık.
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
