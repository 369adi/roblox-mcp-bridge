/** Bounded OpenAI-compatible SSE. Partial tokens are display data, never tool authority. */
export async function readCompletionStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (s: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const reader = body.getReader(),
    decoder = new TextDecoder();
  let pending = "",
    answer = "",
    done = false,
    event: string[] = [];
  const flush = () => {
    if (!event.length) return;
    const data = event.join("\n");
    event = [];
    if (data === "[DONE]") {
      done = true;
      return;
    }
    let j: any;
    try {
      j = JSON.parse(data);
    } catch {
      throw Error("Malformed completion stream event");
    }
    if (j.error) throw Error("Provider stream failed");
    const d = j.choices?.[0]?.delta?.content;
    if (typeof d === "string") {
      answer += d;
      if (answer.length > 200000) throw Error("Completion exceeds 200 KB");
      onDelta(d);
    }
  };
  try {
    while (!done) {
      if (signal?.aborted) throw Error("Completion aborted");
      const r = await reader.read();
      pending += decoder.decode(r.value, { stream: !r.done });
      if (pending.length > 262144) throw Error("Stream event exceeds limit");
      let i;
      while ((i = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, i).replace(/\r$/, "");
        pending = pending.slice(i + 1);
        if (!line) flush();
        else if (line.startsWith("data:")) event.push(line.slice(5).trimStart());
      }
      if (r.done) {
        if (pending.startsWith("data:")) event.push(pending.slice(5).trimStart());
        flush();
        break;
      }
    }
    if (!done) throw Error("Completion stream interrupted before DONE");
    return answer;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
