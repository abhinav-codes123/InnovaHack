"use client";

import { ArrowUpRight, LoaderCircle, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { apiUrl } from "../lib/api";

const suggestions = [
  "Are electric vehicles environmentally better over their full lifecycle?",
  "Does remote work consistently improve employee productivity?",
  "How strong is the evidence that microplastics affect human health?"
];

export function ResearchLaunch() {
  const router = useRouter();
  const [query, setQuery] = useState(suggestions[0] ?? "");
  const [mode, setMode] = useState<"demo" | "live">("live");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (query.trim().length < 10) {
      setError("Enter a research question with at least 10 characters.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch(apiUrl("/api/research-runs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), mode })
      });
      const body = (await response.json()) as {
        id?: string;
        error?: { message?: string };
      };
      if (!response.ok || !body.id) {
        throw new Error(body.error?.message ?? "Unable to start research.");
      }
      router.push(`/research/${body.id}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to start research."
      );
      setPending(false);
    }
  }

  return (
    <div className="launch-wrap">
      <form className="launch-card" onSubmit={submit}>
        <label htmlFor="research-question">What should we investigate?</label>
        <textarea
          id="research-question"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ask a question with a verifiable factual core…"
          rows={3}
        />
        <div className="launch-actions">
          <div className="mode-control" aria-label="Research mode">
            <button
              type="button"
              className={mode === "demo" ? "active" : ""}
              onClick={() => setMode("demo")}
            >
              Demo evidence
            </button>
            <button
              type="button"
              className={mode === "live" ? "active" : ""}
              onClick={() => setMode("live")}
            >
              Live providers
            </button>
          </div>
          <button className="research-button" type="submit" disabled={pending}>
            {pending ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <Sparkles size={18} />
            )}
            Start research
            <ArrowUpRight size={17} />
          </button>
        </div>
      </form>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="suggestion-row">
        <span>Try</span>
        {suggestions.slice(1).map((suggestion) => (
          <button key={suggestion} onClick={() => setQuery(suggestion)}>
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
