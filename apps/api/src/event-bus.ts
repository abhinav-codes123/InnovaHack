import type { AgentEvent } from "@verifact/core";
import { createClient, type RedisClientType } from "redis";

type EventListener = (event: AgentEvent) => void;

export interface EventBus {
  subscribe(runId: string, listener: EventListener): Promise<() => void>;
  publish(event: AgentEvent): Promise<void>;
}

export class ResearchEventBus implements EventBus {
  private readonly listeners = new Map<string, Set<EventListener>>();

  async subscribe(
    runId: string,
    listener: EventListener
  ): Promise<() => void> {
    const subscribers = this.listeners.get(runId) ?? new Set<EventListener>();
    subscribers.add(listener);
    this.listeners.set(runId, subscribers);

    return () => {
      const current = this.listeners.get(runId);
      current?.delete(listener);
      if (current?.size === 0) this.listeners.delete(runId);
    };
  }

  async publish(event: AgentEvent): Promise<void> {
    for (const listener of this.listeners.get(event.runId) ?? []) {
      listener(event);
    }
  }
}

export class RedisResearchEventBus implements EventBus {
  private readonly publisher: RedisClientType;
  private readonly subscriber: RedisClientType;
  private readonly listeners = new Map<string, Set<EventListener>>();
  private connecting?: Promise<void>;

  constructor(url: string) {
    this.publisher = createClient({ url });
    this.subscriber = this.publisher.duplicate();
    this.publisher.on("error", (error) =>
      console.error("Redis publisher error", error)
    );
    this.subscriber.on("error", (error) =>
      console.error("Redis subscriber error", error)
    );
  }

  private async ensureConnected(): Promise<void> {
    if (this.publisher.isOpen && this.subscriber.isOpen) return;
    this.connecting ??= Promise.all([
      this.publisher.isOpen ? Promise.resolve() : this.publisher.connect(),
      this.subscriber.isOpen ? Promise.resolve() : this.subscriber.connect()
    ]).then(() => undefined);
    await this.connecting;
  }

  async subscribe(
    runId: string,
    listener: EventListener
  ): Promise<() => void> {
    await this.ensureConnected();
    const channel = `verifact:research:${runId}`;
    const current = this.listeners.get(channel) ?? new Set<EventListener>();
    current.add(listener);
    this.listeners.set(channel, current);

    if (current.size === 1) {
      await this.subscriber.subscribe(channel, (message) => {
        const parsed = JSON.parse(message) as AgentEvent;
        for (const registered of this.listeners.get(channel) ?? []) {
          registered(parsed);
        }
      });
    }

    return () => {
      const registered = this.listeners.get(channel);
      registered?.delete(listener);
      if (registered?.size === 0) {
        this.listeners.delete(channel);
        void this.subscriber.unsubscribe(channel);
      }
    };
  }

  async publish(event: AgentEvent): Promise<void> {
    await this.ensureConnected();
    await this.publisher.publish(
      `verifact:research:${event.runId}`,
      JSON.stringify(event)
    );
  }
}
