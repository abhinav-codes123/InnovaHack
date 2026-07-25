import type { ResearchRun } from "@verifact/core";
import { Pool } from "pg";

export interface ResearchRunRepository {
  create(run: ResearchRun): Promise<ResearchRun>;
  findById(id: string): Promise<ResearchRun | null>;
  update(
    id: string,
    updater: (current: ResearchRun) => ResearchRun
  ): Promise<ResearchRun>;
}

export class InMemoryResearchRunRepository
  implements ResearchRunRepository
{
  private readonly runs = new Map<string, ResearchRun>();

  async create(run: ResearchRun): Promise<ResearchRun> {
    this.runs.set(run.id, structuredClone(run));
    return structuredClone(run);
  }

  async findById(id: string): Promise<ResearchRun | null> {
    const run = this.runs.get(id);
    return run ? structuredClone(run) : null;
  }

  async update(
    id: string,
    updater: (current: ResearchRun) => ResearchRun
  ): Promise<ResearchRun> {
    const current = this.runs.get(id);
    if (!current) throw new Error(`Research run ${id} was not found.`);
    const next = updater(structuredClone(current));
    next.updatedAt = new Date().toISOString();
    this.runs.set(id, structuredClone(next));
    return structuredClone(next);
  }
}

export class PostgresResearchRunRepository
  implements ResearchRunRepository
{
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 12,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: true }
          : undefined
    });
  }

  async create(run: ResearchRun): Promise<ResearchRun> {
    await this.pool.query(
      `INSERT INTO research_runs
        (id, query, normalized_question, mode, status, payload, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [
        run.id,
        run.query,
        run.normalizedQuestion,
        run.mode,
        run.status,
        JSON.stringify(run),
        run.createdAt,
        run.updatedAt
      ]
    );
    return structuredClone(run);
  }

  async findById(id: string): Promise<ResearchRun | null> {
    const result = await this.pool.query<{ payload: ResearchRun }>(
      "SELECT payload FROM research_runs WHERE id = $1",
      [id]
    );
    return result.rows[0]?.payload
      ? structuredClone(result.rows[0].payload)
      : null;
  }

  async update(
    id: string,
    updater: (current: ResearchRun) => ResearchRun
  ): Promise<ResearchRun> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query<{ payload: ResearchRun }>(
        "SELECT payload FROM research_runs WHERE id = $1 FOR UPDATE",
        [id]
      );
      const current = selected.rows[0]?.payload;
      if (!current) throw new Error(`Research run ${id} was not found.`);
      const next = updater(structuredClone(current));
      next.updatedAt = new Date().toISOString();
      await client.query(
        `UPDATE research_runs
         SET normalized_question = $2, status = $3, payload = $4::jsonb, updated_at = $5
         WHERE id = $1`,
        [
          id,
          next.normalizedQuestion,
          next.status,
          JSON.stringify(next),
          next.updatedAt
        ]
      );
      await client.query("COMMIT");
      return structuredClone(next);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
