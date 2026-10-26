import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/server/db";
import { publicPresentation, updatePresentation } from "../src/server/presentation";
import { GET as streamRoute } from "../src/app/api/public/events/[eventId]/stream/route";

test("duas conexões públicas acompanham a tela persistida no evento", { timeout: 12000 }, async () => {
  const event = await prisma.event.create({ data: { name: "Telão integrado" } });
  const firstAbort = new AbortController(), secondAbort = new AbortController();
  let first: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let second: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const decoder = new TextDecoder();
  async function nextMode(reader: ReadableStreamDefaultReader<Uint8Array>, expected: string) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const value = await reader.read();
      if (value.done) break;
      const text = decoder.decode(value.value);
      if (text.includes(`"mode":"${expected}"`)) return text;
    }
    assert.fail(`Tela ${expected} não chegou ao stream.`);
  }
  try {
    const context = { params: Promise.resolve({ eventId: event.id }) };
    const [firstResponse, secondResponse] = await Promise.all([
      streamRoute(new Request(`http://localhost/api/public/events/${event.id}/stream`, { signal: firstAbort.signal }), context),
      streamRoute(new Request(`http://localhost/api/public/events/${event.id}/stream`, { signal: secondAbort.signal }), context),
    ]);
    assert.equal(firstResponse.status, 200); assert.equal(secondResponse.status, 200);
    first = firstResponse.body!.getReader(); second = secondResponse.body!.getReader();
    await Promise.all([nextMode(first, "OPENING"), nextMode(second, "OPENING")]);
    await updatePresentation({ eventId: event.id, mode: "STANDINGS", matchId: null, logoUrl: null, welcomeMessage: null, showQuestionScore: true, showExplanation: false, soundsEnabled: false });
    const updated = await Promise.all([nextMode(first, "STANDINGS"), nextMode(second, "STANDINGS")]);
    assert.ok(updated.every(item => item?.includes("event: presentation")));
  } finally {
    firstAbort.abort(); secondAbort.abort();
    await Promise.all([first?.cancel(), second?.cancel()]);
    await prisma.event.delete({ where: { id: event.id } });
    await prisma.$disconnect();
  }
});

test("payload público contém somente a questão atual e oculta gabarito até revelação", async () => {
  const event = await prisma.event.create({ data: { name: "Privacidade do telão" } });
  try {
    const home = await prisma.team.create({ data: { eventId: event.id, name: "Azul" } });
    const away = await prisma.team.create({ data: { eventId: event.id, name: "Branca" } });
    const match = await prisma.match.create({ data: { eventId: event.id, homeTeamId: home.id, awayTeamId: away.id, status: "LIVE" } });
    await prisma.matchSession.create({ data: { matchId: match.id, startedAt: new Date(), currentPosition: 1 } });
    const current = await prisma.question.create({ data: { eventId: event.id, statement: "Pergunta presente", answer: "B", explanation: "Explicação secreta" } });
    const future = await prisma.question.create({ data: { eventId: event.id, statement: "Pergunta futura secreta", answer: "C" } });
    await prisma.questionUse.createMany({ data: [{ eventId: event.id, matchId: match.id, questionId: current.id, position: 1, awardedPoints: 10 }, { eventId: event.id, matchId: match.id, questionId: future.id, position: 2, awardedPoints: 20 }] });
    const config = { eventId: event.id, matchId: match.id, logoUrl: null, welcomeMessage: null, showQuestionScore: false, showExplanation: false, soundsEnabled: false };
    await updatePresentation({ ...config, mode: "QUESTION" });
    let payload = JSON.stringify(await publicPresentation(event.id));
    assert.ok(payload.includes("Pergunta presente"));
    assert.ok(!payload.includes("Pergunta futura secreta"));
    assert.ok(!payload.includes("Explicação secreta"));
    assert.ok(!payload.includes('"answer":"B"'));
    assert.ok(!payload.includes('"homeScore"'));
    await prisma.questionUse.update({ where: { matchId_position: { matchId: match.id, position: 1 } }, data: { status: "REVEALED", revealedAt: new Date() } });
    await updatePresentation({ ...config, mode: "REVEAL" });
    payload = JSON.stringify(await publicPresentation(event.id));
    assert.ok(payload.includes('"answer":"B"'));
    assert.ok(!payload.includes("Explicação secreta"));
    assert.ok(!payload.includes("Pergunta futura secreta"));
  } finally { await prisma.event.delete({ where: { id: event.id } }); await prisma.$disconnect(); }
});
