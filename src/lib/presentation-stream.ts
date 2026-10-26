export function createPresentationStream(signal: AbortSignal, snapshot: () => Promise<unknown>, intervalMs = 1500, initialSnapshot?: unknown) {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  let reading = false;
  let sequence = 0;
  let stop = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      stop = () => { closed = true; if (timer) clearInterval(timer); signal.removeEventListener("abort", stop); try { controller.close(); } catch { /* already closed */ } };
      signal.addEventListener("abort", stop, { once: true });
      const send = async () => {
        if (closed || reading) return;
        reading = true;
        try {
          const value = await snapshot();
          if (!closed) controller.enqueue(encoder.encode(`id: ${++sequence}\nevent: presentation\ndata: ${JSON.stringify(value)}\n\n`));
        } catch {
          if (!closed) controller.enqueue(encoder.encode(": reconectando\n\n"));
        } finally { reading = false; }
      };
      if (initialSnapshot !== undefined) controller.enqueue(encoder.encode(`id: ${++sequence}\nevent: presentation\ndata: ${JSON.stringify(initialSnapshot)}\n\n`));
      else void send();
      timer = setInterval(() => void send(), intervalMs);
    },
    cancel() { stop(); },
  });
  return stream;
}
