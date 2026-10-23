/**
 * Mentions légales (LCEN, art. 6-III) : identité de l'éditeur, direction de la publication, hébergeur.
 * Les valeurs (SIRET, adresse, téléphone…) restent dans chaque site ; ce module ne contient que la forme et les textes.
 */

/** Texte fixe, ou traduit par langue (`{ fr: "…", en: "…" }`). */
export type Localized = string | Readonly<Partial<Record<string, string>>>;

/** Éditeur ou hébergeur. Un champ vide ou absent n'est pas rendu. */
export interface LegalParty {
  name: string;
  /** Statut juridique, ex. « Entrepreneur individuel (EI), micro-entrepreneur ». */
  status?: Localized;
  siret?: string;
  /** Numéro d'immatriculation hors SIRET (registre étranger, BCE…). */
  companyNumber?: string;
  vatNumber?: string;
  /** Une ligne, ou plusieurs lignes rendues avec des retours à la ligne. */
  address?: string | readonly string[];
  phone?: string;
  /** Rend le téléphone cliquable, ex. `telHref(phone)`. Sans lui, le numéro reste du texte. */
  phoneHref?: string;
  /** Adresse de contact, rendue en lien `mailto:`. */
  email?: string;
  /** Site web (surtout pour l'hébergeur). */
  url?: string;
  /** Texte du lien `url` ; par défaut l'URL sans `https://` ni `/` final. */
  urlLabel?: string;
}

export interface LegalIdentity {
  siteName: string;
  siteUrl?: string;
  /** `null` tant que l'identité n'est pas validée : la section affiche `labels.publisherPending`. */
  publisher: LegalParty | null;
  /** Directeur ou directrice de la publication ; par défaut le nom de l'éditeur. */
  publicationDirector?: string;
  host: LegalParty;
}

export function defineLegalIdentity<const T extends LegalIdentity>(identity: T): T {
  if (!identity.siteName.trim()) throw new Error("Mentions légales : siteName est vide.");
  for (const [role, party] of [["publisher", identity.publisher], ["host", identity.host]] as const) {
    if (!party) continue;
    if (!party.name.trim()) throw new Error(`Mentions légales : ${role}.name est vide.`);
    if (party.siret && party.siret.replace(/\s/g, "").length !== 14) {
      throw new Error(`Mentions légales : le SIRET « ${party.siret} » de ${role} n'a pas 14 chiffres.`);
    }
    if (party.phoneHref && !party.phoneHref.startsWith("tel:")) {
      throw new Error(`Mentions légales : ${role}.phoneHref doit commencer par « tel: ».`);
    }
  }
  return identity;
}

/** `"+33 6 12 34 56 78"` → `"tel:+33612345678"`. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/** Hébergeur commun des sites ShipGlows (coordonnées publiques de Vercel Inc.). */
export const vercelHost = {
  name: "Vercel Inc.",
  address: "440 N Barranca Avenue #4133, Covina, CA 91723, United States",
  phone: "+1 559 288 7060",
  phoneHref: "tel:+15592887060",
  url: "https://vercel.com",
} as const satisfies LegalParty;

export interface LegalNoticeLabels {
  title: string;
  publisherHeading: string;
  publisher: string;
  status: string;
  siret: string;
  companyNumber: string;
  vatNumber: string;
  address: string;
  phone: string;
  email: string;
  publisherPending: string;
  directorHeading: string;
  hostHeading: string;
  host: string;
  website: string;
  ipHeading: string;
  ipText: (siteName: string) => string;
  dataHeading: string;
  /** Phrase avant le lien vers la politique de confidentialité. */
  dataBefore: string;
  dataLink: string;
  dataAfter: string;
}

export const legalNoticeTexts = {
  fr: {
    title: "Mentions légales",
    publisherHeading: "Éditeur du site",
    publisher: "Éditeur",
    status: "Statut",
    siret: "SIRET",
    companyNumber: "Numéro d’entreprise",
    vatNumber: "TVA",
    address: "Adresse",
    phone: "Téléphone",
    email: "Contact",
    publisherPending: "Les informations d’identification de l’éditeur sont en cours de validation.",
    directorHeading: "Directrice de la publication",
    hostHeading: "Hébergeur",
    host: "Hébergeur",
    website: "Site web",
    ipHeading: "Propriété intellectuelle",
    ipText: (siteName) =>
      `Les textes, visuels et logos de ${siteName} sont protégés. Les marques citées appartiennent à leurs propriétaires respectifs.`,
    dataHeading: "Données personnelles",
    dataBefore: "Le traitement des données personnelles est décrit dans la",
    dataLink: "politique de confidentialité",
    dataAfter: ".",
  },
  en: {
    title: "Legal notice",
    publisherHeading: "Website publisher",
    publisher: "Publisher",
    status: "Legal status",
    siret: "SIRET",
    companyNumber: "Company number",
    vatNumber: "VAT number",
    address: "Address",
    phone: "Phone",
    email: "Contact",
    publisherPending: "The publisher identification details are being validated.",
    directorHeading: "Publication director",
    hostHeading: "Hosting provider",
    host: "Host",
    website: "Website",
    ipHeading: "Intellectual property",
    ipText: (siteName) =>
      `The texts, visuals and logos of ${siteName} are protected. Trademarks mentioned belong to their respective owners.`,
    dataHeading: "Personal data",
    dataBefore: "The processing of personal data is described in our",
    dataLink: "privacy policy",
    dataAfter: ".",
  },
} as const satisfies Record<string, LegalNoticeLabels>;

/** Textes fr ou en (anglais pour toute autre langue), surchargeables champ par champ. */
export function legalNoticeLabels(locale = "fr", overrides: Partial<LegalNoticeLabels> = {}): LegalNoticeLabels {
  const base: LegalNoticeLabels = locale === "fr" ? legalNoticeTexts.fr : legalNoticeTexts.en;
  return { ...base, ...overrides };
}

export function resolveLocalized(value: Localized | undefined, locale = "fr"): string {
  if (value === undefined || typeof value === "string") return value ?? "";
  return value[locale] ?? value.fr ?? Object.values(value).find(Boolean) ?? "";
}

export interface LegalRow {
  key: "name" | "status" | "siret" | "companyNumber" | "vatNumber" | "address" | "phone" | "email" | "url";
  label: string;
  /** Lignes à afficher (plusieurs pour une adresse multiligne). */
  lines: string[];
  href?: string;
  /** Lien vers un autre site (`url`) : à ouvrir avec `rel="noopener noreferrer"`. */
  external?: boolean;
}

/** Lignes non vides d'un éditeur ou d'un hébergeur, dans l'ordre d'affichage. */
export function legalRows(
  party: LegalParty,
  role: "publisher" | "host",
  locale = "fr",
  labels: LegalNoticeLabels = legalNoticeLabels(locale),
): LegalRow[] {
  const rows: (LegalRow | false)[] = [
    { key: "name", label: role === "host" ? labels.host : labels.publisher, lines: [party.name] },
    { key: "status", label: labels.status, lines: [resolveLocalized(party.status, locale)] },
    { key: "siret", label: labels.siret, lines: [party.siret ?? ""] },
    { key: "companyNumber", label: labels.companyNumber, lines: [party.companyNumber ?? ""] },
    { key: "vatNumber", label: labels.vatNumber, lines: [party.vatNumber ?? ""] },
    { key: "address", label: labels.address, lines: typeof party.address === "string" ? [party.address] : [...(party.address ?? [])] },
    { key: "phone", label: labels.phone, lines: [party.phone ?? ""], href: party.phoneHref },
    !!party.email && { key: "email", label: labels.email, lines: [party.email], href: `mailto:${party.email}` },
    !!party.url && {
      key: "url",
      label: labels.website,
      lines: [party.urlLabel ?? party.url.replace(/^https?:\/\//, "").replace(/\/$/, "")],
      href: party.url,
      external: true,
    },
  ];
  return rows
    .filter((row): row is LegalRow => !!row)
    .map((row) => ({ ...row, lines: row.lines.map((line) => line.trim()).filter(Boolean) }))
    .filter((row) => row.lines.length > 0);
}

/** Classes ajoutées à celles du kit (`sg-legal__*`), ex. des utilitaires Tailwind. */
export type LegalNoticeClasses = Partial<
  Record<"section" | "heading" | "list" | "row" | "term" | "value" | "text" | "link", string>
>;
