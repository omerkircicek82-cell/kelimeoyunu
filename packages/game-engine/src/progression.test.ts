import assert from "node:assert/strict";
import test from "node:test";
import { leagueForRating, progressionFor } from "@arena/shared";

test("league depends on current rating at each promotion boundary", () => {
  assert.equal(leagueForRating(1_099), "bronze");
  assert.equal(leagueForRating(1_100), "silver");
  assert.equal(leagueForRating(1_299), "silver");
  assert.equal(leagueForRating(1_300), "gold");
  assert.equal(leagueForRating(1_599), "gold");
  assert.equal(leagueForRating(1_600), "diamond");
});

test("earned badges and title survive a lost streak and league demotion", () => {
  const progress = progressionFor({
    rating: 1_290, ratedGames: 53, wins: 50, winStreak: 0, bestWinStreak: 9, peakRating: 1_650,
  });
  assert.equal(progress.league, "silver");
  assert.equal(progress.winStreak, 0);
  assert.equal(progress.bestWinStreak, 9);
  assert.equal(progress.title, "Arena Efsanesi");
  assert.deepEqual(progress.badges, [
    "first-win", "ten-rounds", "streak-three", "streak-five", "fifty-wins", "reach-gold", "reach-diamond",
  ]);
});
