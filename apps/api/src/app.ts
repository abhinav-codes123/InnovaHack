import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type RequestHandler
} from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import { AppError } from "./errors.js";
import {
  RedisResearchEventBus,
  ResearchEventBus
} from "./event-bus.js";
import {
  InMemoryResearchRunRepository,
  PostgresResearchRunRepository
} from "./repository.js";
import { ResearchRunner } from "./research-runner.js";
import { ResearchService } from "./research-service.js";

const createRunSchema = z.object({
  query: z.string().trim().min(10).max(1_000),
  mode: z.enum(["demo", "live"]).default("live")
});

export function createApp(config: AppConfig) {
  const repository = config.DATABASE_URL
    ? new PostgresResearchRunRepository(config.DATABASE_URL)
    : new InMemoryResearchRunRepository();
  const eventBus = config.REDIS_URL
    ? new RedisResearchEventBus(config.REDIS_URL)
    : new ResearchEventBus();
  const runner = new ResearchRunner(repository, eventBus, config);
  const service = new ResearchService(repository, runner, config);

  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: config.WEB_ORIGIN,
      methods: ["GET", "POST"],
      allowedHeaders: ["Content-Type", "Last-Event-ID"]
    })
  );
  app.use(express.json({ limit: "32kb" }));
  app.use(
    pinoHttp({
      quietReqLogger: config.NODE_ENV === "test"
    })
  );

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      service: "verifact-api",
      timestamp: new Date().toISOString()
    });
  });

  app.post("/api/research-runs", async (request, response, next) => {
    try {
      const input = createRunSchema.parse(request.body);
      const run = await service.create(input);
      response.status(202).json(run);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/research-runs/:id", async (request, response, next) => {
    try {
      const runId = z.string().uuid().parse(request.params.id);
      const run = await service.getById(runId);
      response.json(run);
    } catch (error) {
      next(error);
    }
  });

  const streamEvents: RequestHandler = async (request, response, next) => {
    try {
      const runId = z.string().uuid().parse(request.params.id);
      const run = await service.getById(runId);
      const parsedLastEventId = Number(request.header("Last-Event-ID") ?? 0);
      const lastEventId = Number.isFinite(parsedLastEventId)
        ? parsedLastEventId
        : 0;

      response.status(200);
      response.setHeader("Content-Type", "text/event-stream");
      response.setHeader("Cache-Control", "no-cache, no-transform");
      response.setHeader("Connection", "keep-alive");
      response.flushHeaders();

      const write = (event: (typeof run.events)[number]) => {
        response.write(`id: ${event.id}\n`);
        response.write(`event: research-event\n`);
        response.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      for (const event of run.events.filter(
        (item) => item.id > lastEventId
      )) {
        write(event);
      }

      if (run.status === "complete" || run.status === "failed") {
        response.end();
        return;
      }

      const unsubscribe = await eventBus.subscribe(run.id, (event) => {
        write(event);
        if (event.status === "complete" || event.status === "failed") {
          unsubscribe();
          response.end();
        }
      });
      request.on("close", unsubscribe);
    } catch (error) {
      next(error);
    }
  };

  app.get("/api/research-runs/:id/events", streamEvents);

  app.use((_request, _response, next) => {
    next(new AppError(404, "ROUTE_NOT_FOUND", "Route not found."));
  });

  const errorHandler: ErrorRequestHandler = (
    error,
    _request,
    response,
    _next
  ) => {
    if (error instanceof z.ZodError) {
      response.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "The request did not pass validation.",
          details: error.flatten()
        }
      });
      return;
    }
    if (error instanceof AppError) {
      response.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        }
      });
      return;
    }
    requestLogger(error);
    response.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected server error occurred."
      }
    });
  };
  app.use(errorHandler);

  return app;
}

function requestLogger(error: unknown): void {
  console.error(error);
}
