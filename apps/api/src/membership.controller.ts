import { BadRequestException, Body, Controller, Get, Header, Headers, HttpCode, Post, Req, UnauthorizedException } from "@nestjs/common";
import { isIP } from "node:net";
import type { IncomingMessage } from "node:http";
import { z } from "zod";
import { MAX_ATTEMPTS, ROUND_MODES } from "@arena/shared";
import { bearer, type Membership } from "./membership";

const credentials = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,20}$/),
  password: z.string().min(8).max(128),
}).strict();

const solo = z.object({
  challengeId: z.uuid(),
  roundMode: z.enum(ROUND_MODES),
  guesses: z.array(z.string().min(1).max(24)).max(MAX_ATTEMPTS),
  expired: z.boolean(),
}).strict();

function read<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException(message);
  return result.data;
}

function address(request: IncomingMessage) {
  const forwarded = request.headers["x-forwarded-for"];
  if (process.env.TRUST_PROXY === "1" && typeof forwarded === "string" && isIP(forwarded)) return forwarded;
  return request.socket.remoteAddress ?? "unknown";
}

export function membershipController(membership: Membership) {
  @Controller("api")
  class MemberController {
    @Post("auth/register")
    @Header("Cache-Control", "no-store")
    async register(@Body() body: unknown, @Req() request: IncomingMessage) {
      membership.limitAuth(address(request));
      const input = read(credentials, body, "Kullanıcı adı 3–20 ASCII harf, rakam veya alt çizgi, parola 8–128 karakter olmalı.");
      return membership.register(input.username, input.password);
    }

    @Post("auth/login")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async login(@Body() body: unknown, @Req() request: IncomingMessage) {
      membership.limitAuth(address(request));
      const input = read(credentials, body, "Kullanıcı adı veya parola geçersiz.");
      return membership.login(input.username, input.password);
    }

    @Get("auth/me")
    @Header("Cache-Control", "no-store")
    async me(@Headers("authorization") authorization?: string) {
      return { profile: await membership.requireProfile(bearer(authorization)) };
    }

    @Post("auth/logout")
    @HttpCode(204)
    async logout(@Headers("authorization") authorization?: string) {
      const token = bearer(authorization);
      if (!token) throw new UnauthorizedException("Geçerli oturum gerekli.");
      await membership.logout(token);
    }

    @Get("leaderboard")
    @Header("Cache-Control", "no-store")
    async leaderboard(@Headers("authorization") authorization?: string) {
      return membership.leaderboard(bearer(authorization));
    }

    @Post("solo/challenges")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async challenges(@Headers("authorization") authorization?: string) {
      const profile = await membership.requireProfile(bearer(authorization));
      return { tickets: await membership.challenges(profile.id) };
    }

    @Post("solo/results")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async submit(@Body() body: unknown, @Headers("authorization") authorization?: string) {
      const profile = await membership.requireProfile(bearer(authorization));
      return membership.submitSolo(profile.id, read(solo, body, "Çevrimdışı oyun sonucu geçersiz."));
    }
  }

  return MemberController;
}
