import "reflect-metadata";
import { Controller, Get, Module, ServiceUnavailableException } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { MAX_ATTEMPTS, ROUND_COUNT, ROUND_MS, WORD_LENGTH } from "@arena/shared";
import { History } from "./history";
import { mountGateway, originAllowed } from "./gateway";

const history = new History(process.env.DATABASE_URL);

@Controller("api")
class StatusController {
  @Get("rules")
  rules() {
    return { roundCount: ROUND_COUNT, roundMs: ROUND_MS, maxAttempts: MAX_ATTEMPTS, wordLength: WORD_LENGTH };
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

@Module({ controllers: [StatusController] })
class ApiModule {}

const app = await NestFactory.create(ApiModule);
app.enableCors({
  origin(origin: string | undefined, callback: (error: Error | null, allowed: boolean) => void) {
    callback(null, originAllowed(origin));
  },
});
app.getHttpAdapter().getInstance().disable("x-powered-by");
const gateway = mountGateway(app.getHttpServer(), history);
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
