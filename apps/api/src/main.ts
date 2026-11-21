import "reflect-metadata";
import { Controller, Get, Module, ServiceUnavailableException } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FINAL_GUESS_MS, MAX_ATTEMPTS, ROUND_COUNT, ROUND_MODES, ROUND_MS, WORD_LENGTH } from "@arena/shared";
import { History } from "./history";
import { mountGateway, originAllowed } from "./gateway";
import { Membership } from "./membership";
import { membershipController } from "./membership.controller";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL gerekli. PostgreSQL bağlantısını .env dosyasında ayarlayın.");
const history = new History(databaseUrl);
const membership = new Membership(history.db);
const dictionary = await history.loadDictionary().catch(async () => {
  await history.close();
  throw new Error("PostgreSQL kelime sözlüğü yüklenemedi. Bağlantıyı kontrol edin ve npm run migrate çalıştırın.");
});

@Controller("api")
class StatusController {
  @Get("rules")
  rules() {
    return {
      roundCount: ROUND_COUNT, roundMs: ROUND_MS, roundModes: ROUND_MODES, finalGuessMs: FINAL_GUESS_MS,
      maxAttempts: MAX_ATTEMPTS, wordLength: WORD_LENGTH,
    };
  }

  @Get("health")
  async health() {
    try {
      return { status: "ok", storage: await history.check() };
    } catch {
      throw new ServiceUnavailableException("PostgreSQL maç geçmişi kullanılamıyor.");
    }
  }
}

@Module({ controllers: [StatusController, membershipController(membership)] })
class ApiModule {}

const app = await NestFactory.create(ApiModule);
app.enableCors({
  origin(origin: string | undefined, callback: (error: Error | null, allowed: boolean) => void) {
    callback(null, originAllowed(origin));
  },
});
app.getHttpAdapter().getInstance().disable("x-powered-by");
const gateway = mountGateway(app.getHttpServer(), history, dictionary, token => membership.getProfile(token));
const port = Number(process.env.PORT ?? 3000);
await app.listen(port, "0.0.0.0");

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const timeout = setTimeout(() => process.exit(1), 10_000);
  timeout.unref();
  try {
    await gateway.close();
    await app.close();
    await history.close();
  } finally {
    clearTimeout(timeout);
  }
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
