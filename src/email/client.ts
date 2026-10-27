/*
 * Client serveur du service email central ShipGlows (CommandGlows).
 *
 * Sans dépendance : `fetch`, `AbortController` et Web Crypto seulement, donc utilisable dans
 * Node, Vercel, edge ou une action Convex. Ce fichier porte un jeton serveur : ne jamais
 * l'importer depuis du code navigateur (le navigateur utilise `subscribe.ts`, sans jeton).
 *
 * Aucune erreur, aucun résultat et aucun journal ne contiennent d'adresse, d'identifiant de
 * membre, d'identifiant de message ni de jeton : seuls des codes stables sortent de ce module.
 *
 * Contrat : `commandglows_site/src/lib/email/central/` et
 * `shipglows_data/technical/central-email-api-contract.md` (sections « Service messages » et
 * « Sequence steps »). Les validations ci-dessous reprennent les limites du service central ;
 * le service reste l'autorité finale (configuration, consentement, états).
 */

export type Locale = "fr" | "en";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Codes produits par ce client. Les codes d'erreur du service central passent tels quels (`forbidden`, `unknown_sequence_step`…). */
export type ClientErrorCode =
  | "invalid_config" // URL de base ou jeton mal formés : aucun appel n'est fait
  | "invalid_input" // contenu ou identifiant refusé avant envoi
  | "timeout" // délai d'un appel dépassé
  | "network" // échec de transport
  | "rate_limited" // 429 persistant, ou Retry-After au-delà du budget
  | "invalid_receipt" // réponse 2xx hors du format documenté
  | "cursor_stalled" // le curseur ne change pas : arrêt plutôt que boucle
  | "budget_exhausted" // pages ou temps maximum atteints
  | "http_error"; // erreur HTTP sans code exploitable

/** Erreur typée. Le message est le code seul, jamais une réponse brute. */
export class CentralEmailError extends Error {
  /** Code stable : un `ClientErrorCode` ou un code d'erreur du service central. */
  readonly code: string;
  readonly status: number | undefined;
  /** Renseigné sur un 429 : délai demandé par le service, en millisecondes. */
  readonly retryAfterMs: number | undefined;

  constructor(code: string, options: { status?: number; retryAfterMs?: number } = {}) {
    super(code);
    this.name = "CentralEmailError";
    this.code = code;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
  }
}

export type BlockType = "heading" | "text" | "button" | "divider" | "source" | "rich_text";

/** Bloc de contenu. `url` et `sourceId` ne sont pas acceptés sur `rich_text`. */
export type ContentBlock = {
  id: string;
  type: BlockType;
  text: string;
  url?: string;
  sourceId?: string;
};

export type LocaleContent = {
  subject: string;
  preheader?: string;
  blocks: ContentBlock[];
};

/** Contenu d'une étape : au moins une langue, `fr` et/ou `en`. */
export type SequenceContent = { fr?: LocaleContent; en?: LocaleContent };

export type ServiceMessageInput = {
  businessId: string;
  email: string;
  locale: Locale;
  subject: string;
  preheader?: string;
  blocks: ContentBlock[];
  /** Référence opaque, stockée avec le message et jamais rendue ni envoyée. */
  reference?: string;
};

export type ServiceMessageReceipt = { status: "queued"; messageId: string };

export type SequenceStepInput = {
  businessId: string;
  audienceId: string;
  sequenceId: string;
  step: number;
  content: SequenceContent;
  /** Jour UTC (AAAA-MM-JJ) porté par les clés d'idempotence ; aujourd'hui par défaut. */
  date?: string;
  /** Nombre maximal de pages pour cette étape ; 100 par défaut. */
  maxPages?: number;
};

/** Résultat d'une étape. Les erreurs d'appel sont rendues dans `error` ; une entrée invalide lève une exception. */
export type SequenceStepResult = {
  step: number;
  pages: number;
  queued: number;
  skipped: number;
  complete: boolean;
  /** Code d'arrêt anticipé. Absent quand l'étape est complète. */
  error?: string;
};

export type CentralEmailClientOptions = {
  /** Origine du service central, en https (http seulement pour une boucle locale). */
  baseUrl: string;
  /** Jeton serveur (Bearer). Ne jamais le journaliser ni l'exposer au navigateur. */
  token: string;
  fetch?: FetchLike;
  /** Délai maximal d'un appel HTTP, en millisecondes. 15 000 par défaut. */
  timeoutMs?: number;
  /** Budget total d'une opération (toutes les pages et nouvelles tentatives), en millisecondes. 50 000 par défaut. */
  budgetMs?: number;
  /** Nouvelles tentatives sur 429, avant abandon. 2 par défaut. */
  maxRetries?: number;
  /** Horloge en millisecondes (même base que `Date.now`). Injectée par les tests. */
  now?: () => number;
  /** Attente entre deux tentatives. Injectée par les tests. */
  sleep?: (ms: number) => Promise<void>;
};

export interface CentralEmailClient {
  sendServiceMessage(input: ServiceMessageInput, idempotencyKey: string): Promise<ServiceMessageReceipt>;
  runSequenceStep(input: SequenceStepInput): Promise<SequenceStepResult>;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_BUDGET_MS = 50_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_AFTER_MS = 1_000;
const DEFAULT_MAX_PAGES = 100;
const MAX_PAGES_LIMIT = 1_000;

const SUBJECT_MAX = 200;
const PREHEADER_MAX = 300;
const BLOCKS_MAX = 60;
const BLOCK_ID_MAX = 100;
const BLOCK_TEXT_MAX = 4_000;
const RICH_TEXT_MAX = 20_000;
const BLOCKS_JSON_MAX = 48_000;
const URL_MAX = 2_048;
const SOURCE_ID_MAX = 200;
const REFERENCE_MAX = 128;
const EMAIL_MAX = 254;
const CURSOR_MAX = 4_096;

const BUSINESS_ID = /^[a-z0-9_-]{1,64}$/;
const AUDIENCE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SEQUENCE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_:-]{16,128}$/;
const ERROR_CODE = /^[a-z_]{1,64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const BEARER = /^\S{32,4096}$/;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;
/** Contrôles de ligne, séparateurs Unicode de ligne et de paragraphe, contrôles bidi : refusés dans un objet d'une seule ligne. */
const LINE_CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;
/** Contrôles C0/C1 sauf tabulation, saut de ligne et retour chariot, que le texte de bloc conserve. */
const BLOCK_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const BIDI_CONTROL = /[\u202a-\u202e\u2066-\u2069]/;
/** `{{ … }}` est la syntaxe de gabarit des fournisseurs : jamais dans un texte d'appelant. */
const PROVIDER_SYNTAX = /\{\{|\}\}/;

const BLOCK_TYPES: readonly BlockType[] = ["heading", "text", "button", "divider", "source", "rich_text"];
const BLOCK_FIELDS = ["id", "type", "text", "url", "sourceId"];
const LOCALE_FIELDS = ["subject", "preheader", "blocks"];

type Ctx = {
  origin: string;
  token: string;
  fetch: FetchLike;
  timeoutMs: number;
  budgetMs: number;
  maxRetries: number;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

type Reply =
  | { ok: true; data: unknown }
  | { ok: false; status: number; code: string; retryAfterMs: number | undefined };

type SequenceReceipt = { queued: number; skipped: number; complete: boolean; cursor: string | undefined };

function invalidInput(): CentralEmailError {
  return new CentralEmailError("invalid_input");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Origine https du service central ; http n'est accepté que pour une boucle locale de développement. */
export function centralOrigin(raw: unknown): string {
  if (typeof raw !== "string") throw new CentralEmailError("invalid_config");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CentralEmailError("invalid_config");
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if ((url.protocol !== "https:" && !(loopback && url.protocol === "http:")) || url.username || url.password) {
    throw new CentralEmailError("invalid_config");
  }
  return url.origin;
}

/** Date UTC `AAAA-MM-JJ`, partie date de chaque clé d'idempotence. */
export function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Délai d'un en-tête Retry-After (secondes ou date HTTP), en millisecondes. */
export function parseRetryAfter(value: string | null, now: number): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d{1,6}$/.test(trimmed)) return Number(trimmed) * 1000;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

async function pageHash(cursor: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(cursor));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

/**
 * Clé d'idempotence d'une page : `<séquence>:<étape>:<AAAA-MM-JJ>:<first | 16 hex de SHA-256(curseur)>`.
 * Deux appels identiques le même jour rejouent le reçu d'origine ; une page perdue est donc sûre à relancer.
 */
export async function sequenceIdempotencyKey(
  sequenceId: string,
  step: number,
  date: string,
  cursor?: string,
): Promise<string> {
  const page = cursor === undefined ? "first" : await pageHash(cursor);
  return `${sequenceId}:${step}:${date}:${page}`;
}

function singleLine(value: unknown, max: number, allowEmpty: boolean): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    LINE_CONTROL.test(value) ||
    PROVIDER_SYNTAX.test(value) ||
    (!allowEmpty && value.trim() === "")
  ) {
    throw invalidInput();
  }
  return value;
}

function blockText(type: BlockType, value: unknown): string {
  const limit = type === "rich_text" ? RICH_TEXT_MAX : BLOCK_TEXT_MAX;
  if (
    typeof value !== "string" ||
    value.length > limit ||
    BLOCK_CONTROL.test(value) ||
    BIDI_CONTROL.test(value) ||
    PROVIDER_SYNTAX.test(value)
  ) {
    throw invalidInput();
  }
  // Seul un séparateur peut être vide : tous les autres blocs portent du texte.
  if (type !== "divider" && value.trim() === "") throw invalidInput();
  return value;
}

function checkBlock(raw: unknown, ids: Set<string>): ContentBlock {
  if (!isRecord(raw) || Object.keys(raw).some((key) => !BLOCK_FIELDS.includes(key))) throw invalidInput();
  const { id, type, text, url, sourceId } = raw;
  if (typeof id !== "string" || id.length < 1 || id.length > BLOCK_ID_MAX || ids.has(id)) throw invalidInput();
  ids.add(id);
  if (typeof type !== "string" || !BLOCK_TYPES.includes(type as BlockType)) throw invalidInput();
  const blockType = type as BlockType;
  // Le texte d'un rich_text porte ses propres liens : il n'accepte ni url ni sourceId.
  if (blockType === "rich_text" && (url !== undefined || sourceId !== undefined)) throw invalidInput();
  const block: ContentBlock = { id, type: blockType, text: blockText(blockType, text) };
  if (url !== undefined) {
    if (typeof url !== "string" || url.length > URL_MAX || LINE_CONTROL.test(url) || PROVIDER_SYNTAX.test(url)) {
      throw invalidInput();
    }
    block.url = url;
  }
  if (sourceId !== undefined) {
    if (typeof sourceId !== "string" || sourceId.length > SOURCE_ID_MAX) throw invalidInput();
    block.sourceId = sourceId;
  }
  return block;
}

/** Blocs au format du service : 1 à 60, identifiants uniques, 48 000 caractères de JSON au plus. */
function checkBlocks(raw: unknown): ContentBlock[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > BLOCKS_MAX) throw invalidInput();
  const ids = new Set<string>();
  const blocks = raw.map((item) => checkBlock(item, ids));
  if (JSON.stringify(blocks.map(wireBlock)).length > BLOCKS_JSON_MAX) throw invalidInput();
  return blocks;
}

function checkLocaleContent(raw: unknown): LocaleContent {
  if (!isRecord(raw) || Object.keys(raw).some((key) => !LOCALE_FIELDS.includes(key))) throw invalidInput();
  const subject = singleLine(raw.subject, SUBJECT_MAX, false);
  const content: LocaleContent = { subject, blocks: checkBlocks(raw.blocks) };
  if (raw.preheader !== undefined) content.preheader = singleLine(raw.preheader, PREHEADER_MAX, true);
  return content;
}

function checkSequenceContent(raw: unknown): SequenceContent {
  if (!isRecord(raw) || Object.keys(raw).some((key) => key !== "fr" && key !== "en")) throw invalidInput();
  const content: SequenceContent = {};
  if (raw.fr !== undefined) content.fr = checkLocaleContent(raw.fr);
  if (raw.en !== undefined) content.en = checkLocaleContent(raw.en);
  if (!content.fr && !content.en) throw invalidInput();
  return content;
}

function checkEmail(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > EMAIL_MAX ||
    !EMAIL_SHAPE.test(value) ||
    LINE_CONTROL.test(value)
  ) {
    throw invalidInput();
  }
  return value;
}

function checkServiceInput(input: ServiceMessageInput): ServiceMessageInput {
  if (!isRecord(input)) throw invalidInput();
  if (typeof input.businessId !== "string" || !BUSINESS_ID.test(input.businessId)) throw invalidInput();
  if (input.locale !== "fr" && input.locale !== "en") throw invalidInput();
  const checked: ServiceMessageInput = {
    businessId: input.businessId,
    email: checkEmail(input.email),
    locale: input.locale,
    subject: singleLine(input.subject, SUBJECT_MAX, false),
    blocks: checkBlocks(input.blocks),
  };
  if (input.preheader !== undefined) checked.preheader = singleLine(input.preheader, PREHEADER_MAX, true);
  if (input.reference !== undefined) {
    if (typeof input.reference !== "string" || input.reference.length < 1 || input.reference.length > REFERENCE_MAX) {
      throw invalidInput();
    }
    checked.reference = input.reference;
  }
  return checked;
}

function wireBlock(block: ContentBlock): Record<string, unknown> {
  const wire: Record<string, unknown> = { id: block.id, type: block.type, text: block.text };
  if (block.url !== undefined) wire.url = block.url;
  if (block.sourceId !== undefined) wire.source_id = block.sourceId;
  return wire;
}

function wireLocale(content: LocaleContent): Record<string, unknown> {
  const wire: Record<string, unknown> = { subject: content.subject, blocks: content.blocks.map(wireBlock) };
  if (content.preheader !== undefined) wire.preheader = content.preheader;
  return wire;
}

function wireContent(content: SequenceContent): Record<string, unknown> {
  const wire: Record<string, unknown> = {};
  if (content.fr) wire.fr = wireLocale(content.fr);
  if (content.en) wire.en = wireLocale(content.en);
  return wire;
}

/** Première lecture JSON d'un corps ; tout ce qui n'est pas du JSON devient `undefined`. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Code d'erreur du service central, s'il est dans le format attendu. */
function errorCodeOf(text: string): string | undefined {
  const data = parseJson(text);
  if (!isRecord(data) || !isRecord(data.error)) return undefined;
  const code = data.error.code;
  return typeof code === "string" && ERROR_CODE.test(code) ? code : undefined;
}

function serviceReceipt(data: unknown): ServiceMessageReceipt | undefined {
  if (!isRecord(data) || data.status !== "queued") return undefined;
  const id = data.message_id;
  if (typeof id !== "string" || id.length < 1 || id.length > 128) return undefined;
  return { status: "queued", messageId: id };
}

function count(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : undefined;
}

function sequenceReceipt(data: unknown): SequenceReceipt | undefined {
  if (!isRecord(data) || typeof data.complete !== "boolean") return undefined;
  const queued = count(data.queued);
  const skipped = count(data.skipped);
  if (queued === undefined || skipped === undefined) return undefined;
  if (data.complete) return { queued, skipped, complete: true, cursor: undefined };
  const cursor = data.cursor;
  if (typeof cursor !== "string" || cursor === "" || cursor.length > CURSOR_MAX) return undefined;
  return { queued, skipped, complete: false, cursor };
}

/** Un appel HTTP, délai compris ; le corps est lu avant que le délai ne soit levé. */
async function attempt(ctx: Ctx, path: string, body: unknown, key: string, timeoutMs: number): Promise<Reply> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await ctx.fetch(`${ctx.origin}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (response.ok) return { ok: true, data: parseJson(text) };
    return {
      ok: false,
      status: response.status,
      code: errorCodeOf(text) ?? (response.status === 429 ? "rate_limited" : "http_error"),
      retryAfterMs: parseRetryAfter(response.headers.get("retry-after"), ctx.now()),
    };
  } catch {
    throw new CentralEmailError(controller.signal.aborted ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Un appel avec nouvelles tentatives sur 429 seulement. La clé d'idempotence reste la même
 * d'une tentative à l'autre : un 429 n'a rien traité, et rejouer la même clé est sans risque.
 */
async function post(ctx: Ctx, path: string, body: unknown, key: string, deadline: number): Promise<unknown> {
  for (let retries = 0; ; retries += 1) {
    const remaining = deadline - ctx.now();
    if (remaining <= 0) throw new CentralEmailError("budget_exhausted");
    const reply = await attempt(ctx, path, body, key, Math.min(ctx.timeoutMs, remaining));
    if (reply.ok) return reply.data;
    if (reply.status !== 429) throw new CentralEmailError(reply.code, { status: reply.status });
    const waitMs = reply.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS;
    if (retries >= ctx.maxRetries || waitMs >= deadline - ctx.now()) {
      throw new CentralEmailError("rate_limited", { status: 429, retryAfterMs: waitMs });
    }
    await ctx.sleep(waitMs);
  }
}

/**
 * Crée un client pour le service central. Lève `invalid_config` si l'URL ou le jeton est mal formé,
 * avant tout appel réseau.
 */
export function createCentralEmailClient(options: CentralEmailClientOptions): CentralEmailClient {
  const origin = centralOrigin(options.baseUrl);
  if (typeof options.token !== "string" || !BEARER.test(options.token)) {
    throw new CentralEmailError("invalid_config");
  }
  const ctx: Ctx = {
    origin,
    token: options.token,
    fetch: options.fetch ?? ((url, init) => fetch(url, init)),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    budgetMs: options.budgetMs ?? DEFAULT_BUDGET_MS,
    maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    now: options.now ?? (() => Date.now()),
    sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
  };

  return {
    async sendServiceMessage(input, idempotencyKey) {
      if (typeof idempotencyKey !== "string" || !IDEMPOTENCY_KEY.test(idempotencyKey)) throw invalidInput();
      const checked = checkServiceInput(input);
      const body: Record<string, unknown> = {
        business_id: checked.businessId,
        email: checked.email,
        locale: checked.locale,
        subject: checked.subject,
        blocks: checked.blocks.map(wireBlock),
      };
      if (checked.preheader !== undefined) body.preheader = checked.preheader;
      if (checked.reference !== undefined) body.reference = checked.reference;
      const data = await post(
        ctx,
        "/api/v1/email/messages/service",
        body,
        idempotencyKey,
        ctx.now() + ctx.budgetMs,
      );
      const receipt = serviceReceipt(data);
      if (!receipt) throw new CentralEmailError("invalid_receipt");
      return receipt;
    },

    async runSequenceStep(input) {
      if (!isRecord(input)) throw invalidInput();
      if (typeof input.businessId !== "string" || !BUSINESS_ID.test(input.businessId)) throw invalidInput();
      if (typeof input.audienceId !== "string" || !AUDIENCE_ID.test(input.audienceId)) throw invalidInput();
      if (typeof input.sequenceId !== "string" || !SEQUENCE_ID.test(input.sequenceId)) throw invalidInput();
      if (!Number.isSafeInteger(input.step) || input.step < 0 || input.step > 365) throw invalidInput();
      const date = input.date ?? utcDate(new Date(ctx.now()));
      if (typeof date !== "string" || !DAY.test(date)) throw invalidInput();
      const maxPages = input.maxPages ?? DEFAULT_MAX_PAGES;
      if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > MAX_PAGES_LIMIT) throw invalidInput();
      const content = wireContent(checkSequenceContent(input.content));

      const deadline = ctx.now() + ctx.budgetMs;
      const result: SequenceStepResult = {
        step: input.step,
        pages: 0,
        queued: 0,
        skipped: 0,
        complete: false,
      };
      const seen = new Set<string>();
      let cursor: string | undefined;

      for (;;) {
        if (result.pages >= maxPages) {
          result.error = "budget_exhausted";
          return result;
        }
        const key = await sequenceIdempotencyKey(input.sequenceId, input.step, date, cursor);
        // Les champs `day_offset` et `max_lag_days` ne sont plus envoyés : le service les lit dans la configuration.
        const body = {
          business_id: input.businessId,
          audience_id: input.audienceId,
          sequence_id: input.sequenceId,
          step: input.step,
          content,
          ...(cursor === undefined ? {} : { cursor }),
        };
        let receipt: SequenceReceipt;
        try {
          const data = await post(ctx, "/api/v1/email/sequences/steps", body, key, deadline);
          const parsed = sequenceReceipt(data);
          if (!parsed) throw new CentralEmailError("invalid_receipt");
          receipt = parsed;
        } catch (error) {
          if (error instanceof CentralEmailError) {
            result.error = error.code;
            return result;
          }
          throw error;
        }
        result.pages += 1;
        result.queued += receipt.queued;
        result.skipped += receipt.skipped;
        if (receipt.complete) {
          result.complete = true;
          return result;
        }
        // Un curseur qui revient à l'identique bouclerait sans fin : on s'arrête.
        if (receipt.cursor === undefined || seen.has(receipt.cursor)) {
          result.error = "cursor_stalled";
          return result;
        }
        seen.add(receipt.cursor);
        cursor = receipt.cursor;
      }
    },
  };
}
