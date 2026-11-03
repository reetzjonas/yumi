import { onTestFinished } from "bun:test";
import { z } from "zod";
import { type AiProvider, type AiUsageEvent, createAi, readAiConfig } from ".";

export function completion(
  provider: AiProvider,
  model: string,
  text = JSON.stringify({ name: model }),
) {
  if (provider === "anthropic") {
    return Response.json({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model,
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 8, output_tokens: 3 },
    });
  }
  return Response.json({
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 1_730_000_000,
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 8, completion_tokens: 3, total_tokens: 11 },
  });
}

type RequestContext = {
  readonly request: Request;
  readonly model: string;
  readonly attempt: number;
};

export function aiServer(
  provider: AiProvider = "ollama",
  respond?: (context: RequestContext) => Response | Promise<Response>,
) {
  let requests = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const { model } = z
        .object({ model: z.string() })
        .parse(await request.json());
      requests += 1;
      return respond
        ? respond({ request, model, attempt: requests })
        : completion(provider, model);
    },
  });
  onTestFinished(() => server.stop(true));
  const config = readAiConfig({
    AI_ENABLED: "true",
    AI_PROVIDER: provider,
    AI_MODEL: provider === "anthropic" ? "claude-sonnet-4-5" : "test-model",
    AI_BASE_URL: `${server.url}v1`,
    OPENROUTER_API_KEY: "private-test-key",
    OPENAI_API_KEY: "private-test-key",
    ANTHROPIC_API_KEY: "private-test-key",
  });
  const events: AiUsageEvent[] = [];
  return {
    config,
    events,
    client: createAi(config, (event) => events.push(event)),
    requests: () => requests,
  };
}
