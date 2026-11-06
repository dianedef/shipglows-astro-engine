import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSubscribeBody,
  isLandingPage,
  mergeSubscribeMessages,
  pickSubscribeLocale,
  readSubscribeLanding,
  stripSubscribeLanding,
  subscribeMessageKey,
  subscribeMessages,
} from "../src/subscribe.ts";

/** Codes publics documentés (contrat central, « Public subscription ») et la clé attendue. */
const DOCUMENTED = [
  ["invalid_email", "invalidEmail"],
  ["consent_required", "consentRequired"],
  ["invalid_input", "invalidRequest"],
  ["rate_limited", "rateLimited"],
  ["captcha_failed", "captchaFailed"],
  ["forbidden_origin", "unavailable"],
  ["public_subscribe_unavailable", "unavailable"],
  ["unavailable", "server"],
  ["method_not_allowed", "invalidRequest"],
  ["payload_too_large", "invalidRequest"],
  ["unsupported_media_type", "invalidRequest"],
];

test("chaque code public documenté a un message FR et EN", () => {
  for (const [code, key] of DOCUMENTED) {
    const mapped = subscribeMessageKey(code);
    assert.equal(mapped, key, `code ${code}`);
    assert.ok(subscribeMessages.fr[mapped].length > 0, `fr ${key}`);
    assert.ok(subscribeMessages.en[mapped].length > 0, `en ${key}`);
  }
});

test("codes inconnus, statuts HTTP et réseau", () => {
  assert.equal(subscribeMessageKey("retention_unconfigured"), "server");
  assert.equal(subscribeMessageKey("address_rate_limited"), "server");
  assert.equal(subscribeMessageKey(undefined, 429), "rateLimited");
  assert.equal(subscribeMessageKey(null, 403), "unavailable");
  assert.equal(subscribeMessageKey(undefined, 500), "server");
  assert.equal(subscribeMessageKey(undefined), "server");
  assert.equal(subscribeMessageKey("network"), "network");
  // Un code qui n'est pas propre à la table ne doit pas résoudre via le prototype.
  assert.equal(subscribeMessageKey("constructor"), "server");
  assert.equal(subscribeMessageKey("__proto__"), "server");
  // Un code connu l'emporte sur le statut.
  assert.equal(subscribeMessageKey("invalid_email", 429), "invalidEmail");
});

test("langue : seul `en` passe en anglais", () => {
  assert.equal(pickSubscribeLocale("en"), "en");
  assert.equal(pickSubscribeLocale("fr"), "fr");
  assert.equal(pickSubscribeLocale(null), "fr");
  assert.equal(pickSubscribeLocale(undefined), "fr");
  assert.equal(pickSubscribeLocale("de"), "fr");
});

test("retour sans JavaScript : pending et error avec raison", () => {
  assert.deepEqual(readSubscribeLanding("?subscription=pending"), { outcome: "pending" });
  assert.deepEqual(readSubscribeLanding("?subscription=error&reason=invalid_email"), {
    outcome: "error",
    key: "invalidEmail",
  });
  assert.deepEqual(readSubscribeLanding("?subscription=error"), { outcome: "error", key: "server" });
  assert.deepEqual(readSubscribeLanding("?subscription=error&reason=forbidden_origin&x=1"), {
    outcome: "error",
    key: "unavailable",
  });
});

test("retour : valeurs inconnues et adresse sans retour ignorées", () => {
  assert.equal(readSubscribeLanding(""), undefined);
  assert.equal(readSubscribeLanding("?utm_source=mail"), undefined);
  assert.equal(readSubscribeLanding("?subscription=peut-etre"), undefined);
});

test("retour : le formulaire dont return_to désigne la page courante reçoit le message", () => {
  const page = "https://www.example.com/contact/?subscription=error&reason=invalid_email";
  assert.equal(isLandingPage("https://www.example.com/contact/", page), true);
  assert.equal(isLandingPage("https://www.example.com/newsletter/", page), false);
  assert.equal(isLandingPage("https://other.example.com/contact/", page), false);
  assert.equal(isLandingPage("", page), false);
  assert.equal(isLandingPage("pas une url", page), false);
});

test("nettoyage de l'adresse : seuls subscription et reason sont retirés", () => {
  assert.equal(stripSubscribeLanding("?subscription=error&reason=rate_limited&utm=1"), "?utm=1");
  assert.equal(stripSubscribeLanding("?subscription=pending"), "");
  assert.equal(stripSubscribeLanding("?a=1&b=2"), "?a=1&b=2");
  assert.equal(stripSubscribeLanding(""), "");
});

test("dictionnaire : surcharge partielle sans modifier les textes par défaut", () => {
  const before = subscribeMessages.fr.pending;
  const merged = mergeSubscribeMessages({ fr: { pending: "Presque fini." } });
  assert.equal(merged.fr.pending, "Presque fini.");
  assert.equal(merged.fr.invalidEmail, subscribeMessages.fr.invalidEmail);
  assert.equal(merged.en.pending, subscribeMessages.en.pending);
  assert.equal(subscribeMessages.fr.pending, before);
});

test("corps JSON : consentement vrai, sans return_to, jeton seulement s'il existe", () => {
  const base = {
    businessId: "dreamglows",
    audienceId: "waitlist",
    email: "person@example.test",
    source: "footer",
    locale: "fr",
  };
  const plain = buildSubscribeBody({ ...base, website: "" });
  assert.deepEqual(plain, {
    business_id: "dreamglows",
    audience_id: "waitlist",
    email: "person@example.test",
    consent: true,
    source: "footer",
    locale: "fr",
    website: "",
  });
  const withToken = buildSubscribeBody({ ...base, turnstileToken: "tok" });
  assert.equal(withToken.cf_turnstile_response, "tok");
  assert.equal("return_to" in withToken, false);
  assert.equal(withToken.website, "");
});
