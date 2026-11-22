export const LEAGUE_DETAILS = {
  bronze: { label: "Bronz", minRating: 0 },
  silver: { label: "Gümüş", minRating: 1_100 },
  gold: { label: "Altın", minRating: 1_300 },
  diamond: { label: "Elmas", minRating: 1_600 },
} as const;

export type LeagueId = keyof typeof LEAGUE_DETAILS;
export const LEAGUES = ["bronze", "silver", "gold", "diamond"] as const satisfies readonly LeagueId[];

export const BADGE_DETAILS = {
  "first-win": { label: "İlk Zafer", description: "Bir dereceli turda ilk kez kelimeyi çöz." },
  "ten-rounds": { label: "Arena Müdavimi", description: "10 dereceli tur tamamla." },
  "streak-three": { label: "Üçlü Seri", description: "Art arda 3 dereceli tur çöz." },
  "streak-five": { label: "Seri Avcısı", description: "Art arda 5 dereceli tur çöz." },
  "fifty-wins": { label: "Kelime Maratonu", description: "50 dereceli turda kelimeyi çöz." },
  "reach-gold": { label: "Altın Yükseliş", description: "Altın ligine ulaş." },
  "reach-diamond": { label: "Elmas Işığı", description: "Elmas ligine ulaş." },
} as const;

export type BadgeId = keyof typeof BADGE_DETAILS;

interface ProgressionTotals {
  rating: number;
  ratedGames: number;
  wins: number;
  winStreak: number;
  bestWinStreak: number;
  peakRating: number;
}

export interface PlayerProgression extends Omit<ProgressionTotals, "rating" | "ratedGames"> {
  league: LeagueId;
  title: string;
  badges: BadgeId[];
}

export function leagueForRating(rating: number): LeagueId {
  if (rating >= LEAGUE_DETAILS.diamond.minRating) return "diamond";
  if (rating >= LEAGUE_DETAILS.gold.minRating) return "gold";
  if (rating >= LEAGUE_DETAILS.silver.minRating) return "silver";
  return "bronze";
}

export function progressionFor(stats: ProgressionTotals): PlayerProgression {
  const { rating, ratedGames, wins, winStreak, bestWinStreak, peakRating } = stats;
  const reachedGold = peakRating >= LEAGUE_DETAILS.gold.minRating;
  const reachedDiamond = peakRating >= LEAGUE_DETAILS.diamond.minRating;
  const milestones: Array<{ badge: BadgeId; earned: boolean }> = [
    { badge: "first-win", earned: wins >= 1 },
    { badge: "ten-rounds", earned: ratedGames >= 10 },
    { badge: "streak-three", earned: bestWinStreak >= 3 },
    { badge: "streak-five", earned: bestWinStreak >= 5 },
    { badge: "fifty-wins", earned: wins >= 50 },
    { badge: "reach-gold", earned: reachedGold },
    { badge: "reach-diamond", earned: reachedDiamond },
  ];

  const title = reachedDiamond ? "Arena Efsanesi"
    : reachedGold ? "Kelime Ustası"
      : bestWinStreak >= 5 ? "Seri Avcısı"
        : wins >= 1 ? "Kelime Avcısı" : "Arena Çırağı";

  return {
    league: leagueForRating(rating),
    title, wins, winStreak, bestWinStreak, peakRating,
    badges: milestones.filter(item => item.earned).map(item => item.badge),
  };
}
