import { BadRequestException, Body, Controller, Get, Header, Headers, HttpCode, Post } from "@nestjs/common";
import { ROUND_COUNT } from "@arena/shared";
import { z } from "zod";
import type { DailyService } from "./daily";
import { bearer, type Membership } from "./membership";

const dateRequest = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict();
const roundRequest = dateRequest.extend({ round: z.int().min(1).max(ROUND_COUNT) });
const guessRequest = roundRequest.extend({
  requestId: z.string().regex(/^[\w-]{8,64}$/),
  word: z.string().min(1).max(24),
});

function read<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException("Günlük oyun isteği geçersiz.");
  return result.data;
}

export function dailyController(daily: DailyService, membership: Membership) {
  @Controller("api/daily")
  class DailyController {
    @Get()
    @Header("Cache-Control", "no-store")
    async get(@Headers("authorization") authorization?: string) {
      const profile = await membership.requireProfile(bearer(authorization));
      return daily.get(profile.id);
    }

    @Post("start")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async start(@Body() body: unknown, @Headers("authorization") authorization?: string) {
      const profile = await membership.requireProfile(bearer(authorization));
      return daily.start(profile.id, read(dateRequest, body).date);
    }

    @Post("guess")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async guess(@Body() body: unknown, @Headers("authorization") authorization?: string) {
      const profile = await membership.requireProfile(bearer(authorization));
      return daily.guess(profile.id, read(guessRequest, body));
    }

    @Post("next")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async next(@Body() body: unknown, @Headers("authorization") authorization?: string) {
      const profile = await membership.requireProfile(bearer(authorization));
      return daily.next(profile.id, read(roundRequest, body));
    }
  }

  return DailyController;
}
