import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CentralEmailError,
  centralOrigin,
  createCentralEmailClient,
  parseRetryAfter,
  sequenceIdempotencyKey,
} from "../src/client.ts";

const TOKEN = "t".repeat(40);
const BASE = "https://www.commandglows.com";
const STEPS = `${BASE}/api/v1/email/sequences/steps`;
const SERVICE = `${BASE}/api/v1/email/messages/service`;
const KEY_SHAPE = /^[A-Za-z0-9_:-]{16,128}$/;

const CONTENT = {
  fr: { subject: "Bienvenue", blocks: [{ id: "h1", type: "heading", text: "Bonjour *ami*" }] },
};

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** Faux `fetch` : rend les réponses dans l'ordre et garde chaque appel. */
function recorder(replies) {
  const calls = [];
  const queue = [...replies];
  const fetch = async (url, init) => {
    calls.push({
      url,
      authorization: init.headers.Authorization,
      key: init.headers["Idempotency-Key"],
      body: JSON.parse(init.body),
    });
    const next = queue.shift();
    if (!next) throw new Error("aucune réponse programmée");
    return next;
  };
  return { calls, fetch };
}

/** Horloge et attente factices : `sleep` avance le temps, `sleeps` garde chaque attente. */
function clock(start = 0) {
  let t = start;
  const sleeps = [];
  return {
    sleeps,
    now: () => t,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
  };
}

async function rejection(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("une exception était attendue");
}

test("pagination : répète avec le curseur jusqu'à complete, une clé par page", async () => {
  const { calls, fetch } = recorder([
    json(200, { queued: 2, skipped: 198, complete: false, cursor: "CUR-1" }),
    json(200, { queued: 1, skipped: 199, complete: true }),
  ]);
  const client = createCentralEmailClient({ baseUrl: BASE, token: TOKEN, fetch, ...clock() });

  const result = await client.runSequenceStep({
    businessId: "example",
    audienceId: "newsletter",
    sequenceId: "welcome",
    step: 1,
    content: CONTENT,
    date: "2026-10-27",
  });

  assert.deepEqual(result, { step: 1, pages: 2, queued: 3, skipped: 397, complete: true });
  assert.equal(calls[0].url, STEPS);
  assert.equal(calls[0].authorization, `Bearer ${TOKEN}`);
  assert.equal(calls[0].key, "welcome:1:2026-10-27:first");
  assert.equal(calls[0].body.cursor, undefined);
  assert.equal(calls[1].body.cursor, "CUR-1");
  assert.match(calls[1].key, /^welcome:1:2026-10-27:[0-9a-f]{16}$/);
  assert.notEqual(calls[0].key, calls[1].key);
  for (const call of calls) {
    assert.equal(call.body.business_id, "example");
    assert.equal(call.body.audience_id, "newsletter");
    assert.equal(call.body.sequence_id, "welcome");
    assert.equal(call.body.step, 1);
    // Le service lit le calendrier dans la configuration : le client ne l'envoie plus.
    assert.equal("day_offset" in call.body, false);
    assert.equal("max_lag_days" in call.body, false);
  }
});

test("clé d'idempotence : format, déterminisme et valeur de référence SHA-256", async () => {
  assert.equal(await sequenceIdempotencyKey("welcome", 3, "2026-10-27"), "welcome:3:2026-10-27:first");
  const a = await sequenceIdempotencyKey("welcome", 3, "2026-10-27", "abc");
  const b = await sequenceIdempotencyKey("welcome", 3, "2026-10-27", "abc");
  const c = await sequenceIdempotencyKey("welcome", 3, "2026-10-27", "abd");
  assert.equal(a, b);
  assert.notEqual(a, c);
  // SHA-256("abc") commence par ba7816bf8f01cfea.
  assert.equal(a, "welcome:3:2026-10-27:ba7816bf8f01cfea");
  const longest = await sequenceIdempotencyKey("a".repeat(64), 365, "2026-10-27", "x".repeat(4000));
  assert.match(longest, KEY_SHAPE);
  assert.ok(longest.length <= 128);
});

test("limite de pages : arrêt avec budget_exhausted", async () => {
  const { fetch } = recorder([json(200, { queued: 0, skipped: 200, complete: false, cursor: "C" })]);
  const client = createCentralEmailClient({ baseUrl: BASE, token: TOKEN, fetch, ...clock() });
  const result = await client.runSequenceStep({
    businessId: "example",
    audienceId: "newsletter",
    sequenceId: "welcome",
    step: 0,
    content: CONTENT,
    date: "2026-10-27",
    maxPages: 1,
  });
  assert.equal(result.error, "budget_exhausted");
  assert.equal(result.pages, 1);
  assert.equal(result.complete, false);
});

test("curseur qui ne change pas : arrêt avec cursor_stalled", async () => {
  const { fetch } = recorder([
    json(200, { queued: 0, skipped: 200, complete: false, cursor: "SAME" }),
    json(200, { queued: 0, skipped: 200, complete: false, cursor: "SAME" }),
  ]);
  const client = createCentralEmailClient({ baseUrl: BASE, token: TOKEN, fetch, ...clock() });
  const result = await client.runSequenceStep({
    businessId: "example",
    audienceId: "newsletter",
    sequenceId: "welcome",
    step: 0,
    content: CONTENT,
    date: "2026-10-27",
  });
  assert.equal(result.error, "cursor_stalled");
  assert.equal(result.pages, 2);
});

test("429 : attend Retry-After puis rejoue la même clé", async () => {
  const time = clock();
  const { calls, fetch } = recorder([
    json(429, { error: { code: "rate_limited", message: "rate limited", request_id: "r" } }, { "retry-after": "2" }),
    json(200, { queued: 4, skipped: 0, complete: true }),
  ]);
  const client = createCentralEmailClient({ baseUrl: BASE, token: TOKEN, fetch, ...time });
  const result = await client.runSequenceStep({
    businessId: "example",
    audienceId: "newsletter",
    sequenceId: "welcome",
    step: 0,
    content: CONTENT,
    date: "2026-10-27",
  });
  assert.deepEqual(time.sleeps, [2000]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].key, calls[1].key);
  assert.deepEqual(result, { step: 0, pages: 1, queued: 4, skipped: 0, complete: true });
});

test("429 persistant : abandonne après maxRetries avec rate_limited", async () => {
  const time = clock();
  const { calls, fetch } = recorder([
    json(429, { error: { code: "rate_limited" } }, { "retry-after": "1" }),
    json(429, { error: { code: "rate_limited" } }, { "retry-after": "1" }),
  ]);
  const client = createCentralEmailClient({ baseUrl: BASE, token: TOKEN, fetch, maxRetries: 1, ...time });
  const result = await client.runSequenceStep({
    businessId: "example",
    audienceId: "newsletter",
    sequenceId: "welcome",
    step: 0,
    content: CONTENT,
    date: "2026-10-27",
  });
  assert.equal(result.error, "rate_limited");
  assert.equal(calls.length, 2);
  assert.deepEqual(time.sleeps, [1000]);
});

test("429 avec Retry-After au-delà du budget : aucune attente", async () => {
  const time = clock();
  const { calls, fetch } = recorder([json(429, { error: { code: "rate_limited" } }, { "retry-after": "60" })]);
  const client = createCentralEmailClient({ baseUrl: BASE, token: TOKEN, fetch, budgetMs: 1000, ...time });
  const result = await client.runSequenceStep({
    businessId: "example",
    audienceId: "newsletter",
    sequenceId: "welcome",
    step: 0,
    content: CONTENT,
    date: "2026-10-27",
  });
  assert.equal(result.error, "rate_limited");
  assert.deepEqual(time.sleeps, []);
  assert.equal(calls.length, 1);
});

test("délai d'appel dépassé : erreur typée timeout", async () => {
  const fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")));
    });
  const client = createCentralEmailClient({ baseUrl: BASE, token: TOKEN, fetch, timeoutMs: 10 });
  const result = await client.runSequenceStep({
    businessId: "example",
    audienceId: "newsletter",
    sequenceId: "welcome",
    step: 0,
    content: CONTENT,
    date: "2026-10-27",
  });
  assert.equal(result.error, "timeout");
  assert.equal(result.pages, 0);
});

test("échec de transport : erreur typée network", async () => {
  const fetch = async () => {
    throw new TypeError(`connexion refusée pour ${TOKEN} person@example.test`);
  };
  const client = createCentralEmailClient({ baseUrl: BASE, token: TOKEN, fetch });
  const error = await client.sendServiceMessage(validService(), "service-key-0000001").catch((e) => e);
  assert.ok(error instanceof CentralEmailError);
  assert.equal(error.code, "network");
  assert.equal(error.message, "network");
  // Ni le jeton ni l'adresse ne sortent dans l'erreur ni dans sa forme sérialisée.
  assert.equal(JSON.stringify(error).includes(TOKEN), false);
  assert.equal(JSON.stringify(error).includes("person@"), false);
});

test("erreur HTTP centrale : code transmis, corps hors format : http_error", async () => {
  const { fetch } = recorder([
    json(422, { error: { code: "unknown_sequence_step", message: "x", request_id: "r" } }),
    new Response("<html>panne</html>", { status: 500 }),
  ]);
  const client = createCentralEmailClient({ baseUrl: BASE, token: TOKEN, fetch, ...clock() });
  const first = await client.runSequenceStep({
    businessId: "example",
    audienceId: "newsletter",
    sequenceId: "welcome",
    step: 9,
    content: CONTENT,
    date: "2026-10-27",
  });
  assert.deepEqual(first, { step: 9, pages: 0, queued: 0, skipped: 0, complete: false, error: "unknown_sequence_step" });
  const second = await client.runSequenceStep({
    businessId: "example",
    audienceId: "newsletter",
    sequenceId: "welcome",
    step: 0,
    content: CONTENT,
    date: "2026-10-27",
  });
  assert.equal(second.error, "http_error");
});

test("réception hors format : invalid_receipt", async () => {
  const { fetch } = recorder([json(200, { queued: "2", complete: true })]);
  const client = createCentralEmailClient({ baseUrl: BASE, token: TOKEN, fetch, ...clock() });
  const result = await client.runSequenceStep({
    businessId: "example",
    audienceId: "newsletter",
    sequenceId: "welcome",
    step: 0,
    content: CONTENT,
    date: "2026-10-27",
  });
  assert.equal(result.error, "invalid_receipt");
});

const BAD_STEPS = [
  ["sujet de 201 caractères", { fr: { subject: "a".repeat(201), blocks: [text("h")] } }],
  ["sujet avec gabarit fournisseur", { fr: { subject: "Bonjour {{name}}", blocks: [text("h")] } }],
  ["sujet sur deux lignes", { fr: { subject: "un\ndeux", blocks: [text("h")] } }],
  ["sujet avec contrôle bidi", { fr: { subject: "ab\u202ecd", blocks: [text("h")] } }],
  ["préheader de 301 caractères", { fr: { subject: "ok", preheader: "p".repeat(301), blocks: [text("h")] } }],
  ["61 blocs", { fr: { subject: "ok", blocks: Array.from({ length: 61 }, (_, i) => text(`b${i}`)) } }],
  ["bloc sans texte", { fr: { subject: "ok", blocks: [{ id: "h", type: "heading", text: "  " }] } }],
  ["texte de 4001 caractères", { fr: { subject: "ok", blocks: [{ id: "t", type: "text", text: "x".repeat(4001) }] } }],
  ["rich_text de 20001 caractères", { fr: { subject: "ok", blocks: [{ id: "r", type: "rich_text", text: "x".repeat(20001) }] } }],
  ["rich_text avec url", { fr: { subject: "ok", blocks: [{ id: "r", type: "rich_text", text: "x", url: "https://a.test" }] } }],
  ["url avec retour à la ligne", { fr: { subject: "ok", blocks: [{ id: "b", type: "button", text: "Ouvrir", url: "https://a.test/\n" }] } }],
  ["identifiants de bloc en double", { fr: { subject: "ok", blocks: [text("h"), text("h")] } }],
  ["type de bloc inconnu", { fr: { subject: "ok", blocks: [{ id: "x", type: "image", text: "x" }] } }],
  ["champ inconnu dans un bloc", { fr: { subject: "ok", blocks: [{ ...text("h"), html: "<b>" }] } }],
  ["langue inconnue", { de: { subject: "ok", blocks: [text("h")] } }],
  ["aucune langue", {}],
];

function text(id) {
  return { id, type: "text", text: "Texte" };
}

for (const [label, content] of BAD_STEPS) {
  test(`validation avant envoi : ${label} refusé sans appel réseau`, async () => {
    const { calls, fetch } = recorder([]);
    const client = createCentralEmailClient({ baseUrl: BASE, token: TOKEN, fetch, ...clock() });
    const error = await rejection(
      client.runSequenceStep({
        businessId: "example",
        audienceId: "newsletter",
        sequenceId: "welcome",
        step: 0,
        content,
        date: "2026-10-27",
      }),
    );
    assert.ok(error instanceof CentralEmailError);
    assert.equal(error.code, "invalid_input");
    assert.equal(calls.length, 0);
  });
}

test("entrées d'étape invalides : identifiants, étape et date refusés", async () => {
  const { calls, fetch } = recorder([]);
  const client = createCentralEmailClient({ baseUrl: BASE, token: TOKEN, fetch, ...clock() });
  const base = { businessId: "example", audienceId: "newsletter", sequenceId: "welcome", step: 1, content: CONTENT, date: "2026-10-27" };
  const invalid = [
    { ...base, sequenceId: "Welcome" },
    { ...base, step: 366 },
    { ...base, step: -1 },
    { ...base, audienceId: "news letter" },
    { ...base, date: "27/10/2026" },
    { ...base, maxPages: 0 },
  ];
  for (const input of invalid) {
    const error = await rejection(client.runSequenceStep(input));
    assert.equal(error.code, "invalid_input");
  }
  assert.equal(calls.length, 0);
});

function validService() {
  return {
    businessId: "example",
    email: "person@example.test",
    locale: "en",
    subject: "Export ready",
    preheader: "Your export is attached",
    blocks: [
      { id: "h1", type: "heading", text: "Export *ready*" },
      { id: "b1", type: "button", text: "Open", url: "https://example.test/exports/1" },
    ],
    reference: "export-job-000042",
  };
}

test("message de service : charge utile, clé et reçu", async () => {
  const { calls, fetch } = recorder([json(200, { status: "queued", message_id: "msg_123" })]);
  const client = createCentralEmailClient({ baseUrl: BASE, token: TOKEN, fetch, ...clock() });
  const receipt = await client.sendServiceMessage(validService(), "service-key-0000001");
  assert.deepEqual(receipt, { status: "queued", messageId: "msg_123" });
  assert.equal(calls[0].url, SERVICE);
  assert.equal(calls[0].key, "service-key-0000001");
  assert.equal(calls[0].body.business_id, "example");
  assert.equal(calls[0].body.locale, "en");
  assert.equal(calls[0].body.reference, "export-job-000042");
  assert.equal(calls[0].body.blocks[1].url, "https://example.test/exports/1");
  assert.equal("day_offset" in calls[0].body, false);
});

test("message de service : clé d'idempotence hors format refusée sans appel", async () => {
  const { calls, fetch } = recorder([]);
  const client = createCentralEmailClient({ baseUrl: BASE, token: TOKEN, fetch, ...clock() });
  const error = await rejection(client.sendServiceMessage(validService(), "trop court"));
  assert.equal(error.code, "invalid_input");
  assert.equal(calls.length, 0);
});

test("message de service : 409 idempotency_conflict transmis tel quel", async () => {
  const { fetch } = recorder([json(409, { error: { code: "idempotency_conflict", message: "x", request_id: "r" } })]);
  const client = createCentralEmailClient({ baseUrl: BASE, token: TOKEN, fetch, ...clock() });
  const error = await rejection(client.sendServiceMessage(validService(), "service-key-0000001"));
  assert.equal(error.code, "idempotency_conflict");
  assert.equal(error.status, 409);
});

test("message de service : adresse et jeton absents du message d'erreur", async () => {
  const { fetch } = recorder([json(503, { error: { code: "configuration_unavailable" } })]);
  const client = createCentralEmailClient({ baseUrl: BASE, token: TOKEN, fetch, ...clock() });
  const error = await rejection(client.sendServiceMessage(validService(), "service-key-0000001"));
  assert.equal(error.code, "configuration_unavailable");
  assert.equal(error.message.includes("person@"), false);
  assert.equal(error.message.includes(TOKEN), false);
});

test("configuration : URL de base et jeton vérifiés avant tout appel", () => {
  const ok = (baseUrl, token = TOKEN) => () => createCentralEmailClient({ baseUrl, token, fetch: async () => json(200, {}) });
  assert.throws(ok("http://example.test"), (e) => e.code === "invalid_config");
  assert.throws(ok("https://user:secret@example.test"), (e) => e.code === "invalid_config");
  assert.throws(ok("pas une url"), (e) => e.code === "invalid_config");
  assert.throws(ok(BASE, "court"), (e) => e.code === "invalid_config");
  assert.doesNotThrow(ok("http://localhost:3000"));
  assert.doesNotThrow(ok("http://127.0.0.1:8787"));
  assert.equal(centralOrigin("https://www.commandglows.com/"), BASE);
  assert.equal(centralOrigin("https://www.commandglows.com"), BASE);
  // A path, a query or a fragment would be silently ignored by the client: refused.
  for (const raw of ["https://www.commandglows.com/chemin/", "https://www.commandglows.com/api?x=1", "https://www.commandglows.com/#f"]) {
    assert.throws(() => centralOrigin(raw), (e) => e.code === "invalid_config", raw);
  }
});

test("Retry-After : secondes, date HTTP ou valeur inconnue", () => {
  assert.equal(parseRetryAfter("3", 0), 3000);
  assert.equal(parseRetryAfter("Wed, 21 Oct 2026 07:28:00 GMT", Date.parse("Wed, 21 Oct 2026 07:27:55 GMT")), 5000);
  assert.equal(parseRetryAfter("bientôt", 0), undefined);
  assert.equal(parseRetryAfter(null, 0), undefined);
});
