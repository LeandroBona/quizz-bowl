import test from "node:test";
import assert from "node:assert/strict";
import { createPresentationStream } from "./presentation-stream";

test("duas janelas recebem a mesma mudança pelo stream SSE", async () => {
  let screen = "OPENING";
  const firstAbort = new AbortController(), secondAbort = new AbortController();
  const first = createPresentationStream(firstAbort.signal, async () => ({ mode: screen }), 20).getReader();
  const second = createPresentationStream(secondAbort.signal, async () => ({ mode: screen }), 20).getReader();
  const decoder = new TextDecoder();
  try {
    const initial = await Promise.all([first.read(), second.read()]);
    assert.ok(initial.every(result => decoder.decode(result.value).includes('"mode":"OPENING"')));
    screen = "QUESTION";
    const updated = await Promise.all([first.read(), second.read()]);
    assert.ok(updated.every(result => decoder.decode(result.value).includes('"mode":"QUESTION"')));
    assert.ok(updated.every(result => decoder.decode(result.value).includes("event: presentation")));
  } finally {
    firstAbort.abort(); secondAbort.abort();
    await Promise.all([first.cancel(), second.cancel()]);
  }
});
