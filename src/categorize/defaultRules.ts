import type { Category, CategoryType } from '../db/types'

/**
 * Standardkategorien. Die Namen dienen als stabile Schlüssel, um beim ersten
 * Start die Regeln den richtigen Kategorien zuzuordnen.
 */
export const DEFAULT_CATEGORIES: Category[] = [
  // Einkommen
  { name: 'Gehalt / Lohn', typ: 'einkommen', farbe: '#10b981', system: true },
  { name: 'Sonstige Einnahmen', typ: 'einkommen', farbe: '#34d399', system: true },

  // Fixkosten
  { name: 'Miete / Wohnen', typ: 'fix', farbe: '#3b82f6' },
  { name: 'Strom / Gas / Wasser', typ: 'fix', farbe: '#60a5fa' },
  { name: 'Versicherungen', typ: 'fix', farbe: '#818cf8' },
  { name: 'Telefon / Internet', typ: 'fix', farbe: '#a78bfa' },
  { name: 'Abos / Streaming', typ: 'fix', farbe: '#c084fc' },
  { name: 'Mobilität / Auto', typ: 'fix', farbe: '#38bdf8' },
  { name: 'Rundfunkbeitrag / Steuern', typ: 'fix', farbe: '#7dd3fc' },

  // Variabel
  { name: 'Lebensmittel', typ: 'variabel', farbe: '#f59e0b' },
  { name: 'Online-Shopping', typ: 'variabel', farbe: '#fb923c' },
  { name: 'Gastronomie / Lieferdienst', typ: 'variabel', farbe: '#f97316' },
  { name: 'Freizeit / Unterhaltung', typ: 'variabel', farbe: '#fbbf24' },
  { name: 'Gesundheit / Drogerie', typ: 'variabel', farbe: '#fde047' },
  { name: 'Kleidung', typ: 'variabel', farbe: '#facc15' },
  { name: 'Bargeld', typ: 'variabel', farbe: '#eab308' },
  { name: 'Tanken', typ: 'variabel', farbe: '#d97706' },

  // Schulden
  { name: 'Dispozinsen / Kontoführung', typ: 'schulden', farbe: '#ef4444', system: true },
  { name: 'Rücklastschrift / Mahngebühr', typ: 'schulden', farbe: '#f43f5e', system: true },
  { name: 'Kreditrate', typ: 'schulden', farbe: '#dc2626', system: true },
  { name: 'Ratenkauf / Buy-now-pay-later', typ: 'schulden', farbe: '#e11d48', system: true },
  { name: 'Inkasso', typ: 'schulden', farbe: '#be123c', system: true },

  // Sonstiges
  { name: 'Umbuchung / Sparen', typ: 'sonstiges', farbe: '#94a3b8' },
  { name: 'Sonstiges', typ: 'sonstiges', farbe: '#64748b', system: true },
]

export interface DefaultRule {
  schlagwort: string
  kategorie: string
  prioritaet?: number
}

/**
 * Schlagwort-Regeln. Die Suche erfolgt case-insensitiv im normalisierten
 * Buchungstext (Buchungsart + Verwendungszweck). Höhere Priorität gewinnt.
 */
export const DEFAULT_RULES: DefaultRule[] = [
  // Schulden (hohe Priorität, damit sie vor allgemeinen Regeln greifen)
  { schlagwort: 'dispozins', kategorie: 'Dispozinsen / Kontoführung', prioritaet: 100 },
  { schlagwort: 'sollzins', kategorie: 'Dispozinsen / Kontoführung', prioritaet: 100 },
  { schlagwort: 'überziehungszins', kategorie: 'Dispozinsen / Kontoführung', prioritaet: 100 },
  { schlagwort: 'ueberziehungszins', kategorie: 'Dispozinsen / Kontoführung', prioritaet: 100 },
  { schlagwort: 'abschluss', kategorie: 'Dispozinsen / Kontoführung', prioritaet: 90 },
  { schlagwort: 'kontoführung', kategorie: 'Dispozinsen / Kontoführung', prioritaet: 90 },
  { schlagwort: 'kontofuehrung', kategorie: 'Dispozinsen / Kontoführung', prioritaet: 90 },
  { schlagwort: 'entgelt', kategorie: 'Dispozinsen / Kontoführung', prioritaet: 80 },
  { schlagwort: 'entgeltabrechnung', kategorie: 'Dispozinsen / Kontoführung', prioritaet: 96 },
  { schlagwort: 'rücklastschrift', kategorie: 'Rücklastschrift / Mahngebühr', prioritaet: 100 },
  { schlagwort: 'ruecklastschrift', kategorie: 'Rücklastschrift / Mahngebühr', prioritaet: 100 },
  { schlagwort: 'rückgabe lastschrift', kategorie: 'Rücklastschrift / Mahngebühr', prioritaet: 100 },
  { schlagwort: 'retoure', kategorie: 'Rücklastschrift / Mahngebühr', prioritaet: 90 },
  { schlagwort: 'mahngebühr', kategorie: 'Rücklastschrift / Mahngebühr', prioritaet: 100 },
  { schlagwort: 'mahngebuehr', kategorie: 'Rücklastschrift / Mahngebühr', prioritaet: 100 },
  { schlagwort: 'mahnung', kategorie: 'Rücklastschrift / Mahngebühr', prioritaet: 95 },
  { schlagwort: 'verzugszins', kategorie: 'Rücklastschrift / Mahngebühr', prioritaet: 95 },
  { schlagwort: 'kreditrate', kategorie: 'Kreditrate', prioritaet: 100 },
  { schlagwort: 'darlehen', kategorie: 'Kreditrate', prioritaet: 95 },
  { schlagwort: 'ratenkredit', kategorie: 'Kreditrate', prioritaet: 100 },
  { schlagwort: 'kredit', kategorie: 'Kreditrate', prioritaet: 85 },
  { schlagwort: 'santander', kategorie: 'Kreditrate', prioritaet: 90 },
  { schlagwort: 'targobank', kategorie: 'Kreditrate', prioritaet: 90 },
  { schlagwort: 'creditplus', kategorie: 'Kreditrate', prioritaet: 90 },
  { schlagwort: 'klarna', kategorie: 'Ratenkauf / Buy-now-pay-later', prioritaet: 95 },
  { schlagwort: 'ratepay', kategorie: 'Ratenkauf / Buy-now-pay-later', prioritaet: 95 },
  { schlagwort: 'ratenzahlung', kategorie: 'Ratenkauf / Buy-now-pay-later', prioritaet: 95 },
  { schlagwort: 'ratenkauf', kategorie: 'Ratenkauf / Buy-now-pay-later', prioritaet: 95 },
  { schlagwort: 'afterpay', kategorie: 'Ratenkauf / Buy-now-pay-later', prioritaet: 95 },
  { schlagwort: 'riverty', kategorie: 'Ratenkauf / Buy-now-pay-later', prioritaet: 95 },
  { schlagwort: 'inkasso', kategorie: 'Inkasso', prioritaet: 100 },
  { schlagwort: 'forderungsmanagement', kategorie: 'Inkasso', prioritaet: 95 },
  { schlagwort: 'creditreform', kategorie: 'Inkasso', prioritaet: 95 },
  { schlagwort: 'eos deutscher', kategorie: 'Inkasso', prioritaet: 95 },

  // Einkommen
  { schlagwort: 'gehalt', kategorie: 'Gehalt / Lohn', prioritaet: 90 },
  { schlagwort: 'lohn', kategorie: 'Gehalt / Lohn', prioritaet: 85 },
  { schlagwort: 'bezüge', kategorie: 'Gehalt / Lohn', prioritaet: 85 },
  { schlagwort: 'arbeitgeber', kategorie: 'Gehalt / Lohn', prioritaet: 85 },
  { schlagwort: 'bürgergeld', kategorie: 'Gehalt / Lohn', prioritaet: 90 },
  { schlagwort: 'jobcenter', kategorie: 'Gehalt / Lohn', prioritaet: 90 },
  { schlagwort: 'arbeitslosengeld', kategorie: 'Gehalt / Lohn', prioritaet: 90 },
  { schlagwort: 'rente', kategorie: 'Gehalt / Lohn', prioritaet: 85 },
  { schlagwort: 'kindergeld', kategorie: 'Sonstige Einnahmen', prioritaet: 90 },
  { schlagwort: 'familienkasse', kategorie: 'Sonstige Einnahmen', prioritaet: 90 },
  { schlagwort: 'wohngeld', kategorie: 'Sonstige Einnahmen', prioritaet: 90 },
  { schlagwort: 'erstattung', kategorie: 'Sonstige Einnahmen', prioritaet: 80 },
  { schlagwort: 'steuererstattung', kategorie: 'Sonstige Einnahmen', prioritaet: 90 },
  { schlagwort: 'finanzamt', kategorie: 'Rundfunkbeitrag / Steuern', prioritaet: 85 },

  // Wohnen
  { schlagwort: 'miete', kategorie: 'Miete / Wohnen', prioritaet: 90 },
  { schlagwort: 'wohnungsbau', kategorie: 'Miete / Wohnen', prioritaet: 85 },
  { schlagwort: 'hausverwaltung', kategorie: 'Miete / Wohnen', prioritaet: 85 },
  { schlagwort: 'vonovia', kategorie: 'Miete / Wohnen', prioritaet: 90 },
  { schlagwort: 'nebenkosten', kategorie: 'Miete / Wohnen', prioritaet: 85 },
  { schlagwort: 'stadtwerke', kategorie: 'Strom / Gas / Wasser', prioritaet: 85 },
  { schlagwort: 'strom', kategorie: 'Strom / Gas / Wasser', prioritaet: 80 },
  { schlagwort: 'energie', kategorie: 'Strom / Gas / Wasser', prioritaet: 75 },
  { schlagwort: 'gas', kategorie: 'Strom / Gas / Wasser', prioritaet: 60 },
  { schlagwort: 'vattenfall', kategorie: 'Strom / Gas / Wasser', prioritaet: 85 },
  { schlagwort: 'e.on', kategorie: 'Strom / Gas / Wasser', prioritaet: 85 },
  { schlagwort: 'eon', kategorie: 'Strom / Gas / Wasser', prioritaet: 70 },
  { schlagwort: 'enbw', kategorie: 'Strom / Gas / Wasser', prioritaet: 85 },
  { schlagwort: 'rwe', kategorie: 'Strom / Gas / Wasser', prioritaet: 80 },

  // Versicherungen
  { schlagwort: 'versicherung', kategorie: 'Versicherungen', prioritaet: 85 },
  { schlagwort: 'allianz', kategorie: 'Versicherungen', prioritaet: 85 },
  { schlagwort: 'huk', kategorie: 'Versicherungen', prioritaet: 85 },
  { schlagwort: 'ergo', kategorie: 'Versicherungen', prioritaet: 80 },
  { schlagwort: 'axa', kategorie: 'Versicherungen', prioritaet: 80 },
  { schlagwort: 'debeka', kategorie: 'Versicherungen', prioritaet: 85 },
  { schlagwort: 'krankenkasse', kategorie: 'Versicherungen', prioritaet: 85 },
  { schlagwort: 'techniker', kategorie: 'Versicherungen', prioritaet: 80 },
  { schlagwort: 'barmer', kategorie: 'Versicherungen', prioritaet: 85 },
  { schlagwort: 'aok', kategorie: 'Versicherungen', prioritaet: 80 },
  { schlagwort: 'dak', kategorie: 'Versicherungen', prioritaet: 75 },

  // Telefon / Internet
  { schlagwort: 'telekom', kategorie: 'Telefon / Internet', prioritaet: 85 },
  { schlagwort: 'vodafone', kategorie: 'Telefon / Internet', prioritaet: 85 },
  { schlagwort: 'o2', kategorie: 'Telefon / Internet', prioritaet: 75 },
  { schlagwort: 'telefonica', kategorie: 'Telefon / Internet', prioritaet: 85 },
  { schlagwort: '1&1', kategorie: 'Telefon / Internet', prioritaet: 85 },
  { schlagwort: '1und1', kategorie: 'Telefon / Internet', prioritaet: 85 },
  { schlagwort: 'congstar', kategorie: 'Telefon / Internet', prioritaet: 85 },
  { schlagwort: 'mobilfunk', kategorie: 'Telefon / Internet', prioritaet: 80 },
  { schlagwort: 'drillisch', kategorie: 'Telefon / Internet', prioritaet: 85 },
  { schlagwort: 'pyur', kategorie: 'Telefon / Internet', prioritaet: 85 },

  // Abos
  { schlagwort: 'netflix', kategorie: 'Abos / Streaming', prioritaet: 90 },
  { schlagwort: 'spotify', kategorie: 'Abos / Streaming', prioritaet: 90 },
  { schlagwort: 'disney', kategorie: 'Abos / Streaming', prioritaet: 90 },
  { schlagwort: 'amazon prime', kategorie: 'Abos / Streaming', prioritaet: 92 },
  { schlagwort: 'prime video', kategorie: 'Abos / Streaming', prioritaet: 92 },
  { schlagwort: 'dazn', kategorie: 'Abos / Streaming', prioritaet: 90 },
  { schlagwort: 'sky ', kategorie: 'Abos / Streaming', prioritaet: 85 },
  { schlagwort: 'wow ', kategorie: 'Abos / Streaming', prioritaet: 80 },
  { schlagwort: 'apple.com/bill', kategorie: 'Abos / Streaming', prioritaet: 90 },
  { schlagwort: 'itunes', kategorie: 'Abos / Streaming', prioritaet: 88 },
  { schlagwort: 'google play', kategorie: 'Abos / Streaming', prioritaet: 85 },
  { schlagwort: 'youtube', kategorie: 'Abos / Streaming', prioritaet: 85 },
  { schlagwort: 'fitness', kategorie: 'Abos / Streaming', prioritaet: 80 },
  { schlagwort: 'mcfit', kategorie: 'Abos / Streaming', prioritaet: 85 },
  { schlagwort: 'clever fit', kategorie: 'Abos / Streaming', prioritaet: 85 },
  { schlagwort: 'playstation', kategorie: 'Abos / Streaming', prioritaet: 85 },
  { schlagwort: 'xbox', kategorie: 'Abos / Streaming', prioritaet: 85 },

  // Rundfunk / Steuern
  { schlagwort: 'rundfunk', kategorie: 'Rundfunkbeitrag / Steuern', prioritaet: 90 },
  { schlagwort: 'ard zdf', kategorie: 'Rundfunkbeitrag / Steuern', prioritaet: 90 },
  { schlagwort: 'beitragsservice', kategorie: 'Rundfunkbeitrag / Steuern', prioritaet: 90 },
  { schlagwort: 'kfz-steuer', kategorie: 'Rundfunkbeitrag / Steuern', prioritaet: 90 },
  { schlagwort: 'hauptzollamt', kategorie: 'Rundfunkbeitrag / Steuern', prioritaet: 90 },
  { schlagwort: 'stadtkasse', kategorie: 'Rundfunkbeitrag / Steuern', prioritaet: 85 },

  // Mobilität
  { schlagwort: 'deutsche bahn', kategorie: 'Mobilität / Auto', prioritaet: 85 },
  { schlagwort: 'db vertrieb', kategorie: 'Mobilität / Auto', prioritaet: 85 },
  { schlagwort: 'deutschlandticket', kategorie: 'Mobilität / Auto', prioritaet: 90 },
  { schlagwort: 'bvg', kategorie: 'Mobilität / Auto', prioritaet: 80 },
  { schlagwort: 'hvv', kategorie: 'Mobilität / Auto', prioritaet: 80 },
  { schlagwort: 'mvv', kategorie: 'Mobilität / Auto', prioritaet: 80 },
  { schlagwort: 'vrr', kategorie: 'Mobilität / Auto', prioritaet: 80 },
  { schlagwort: 'rmv', kategorie: 'Mobilität / Auto', prioritaet: 80 },
  { schlagwort: 'leasing', kategorie: 'Mobilität / Auto', prioritaet: 85 },
  { schlagwort: 'adac', kategorie: 'Mobilität / Auto', prioritaet: 85 },
  { schlagwort: 'uber', kategorie: 'Mobilität / Auto', prioritaet: 75 },
  { schlagwort: 'flixbus', kategorie: 'Mobilität / Auto', prioritaet: 85 },

  // Tanken
  { schlagwort: 'aral', kategorie: 'Tanken', prioritaet: 85 },
  { schlagwort: 'shell', kategorie: 'Tanken', prioritaet: 85 },
  { schlagwort: 'esso', kategorie: 'Tanken', prioritaet: 85 },
  { schlagwort: 'total', kategorie: 'Tanken', prioritaet: 70 },
  { schlagwort: 'jet ', kategorie: 'Tanken', prioritaet: 80 },
  { schlagwort: 'tankstelle', kategorie: 'Tanken', prioritaet: 85 },
  { schlagwort: 'star tank', kategorie: 'Tanken', prioritaet: 85 },
  { schlagwort: 'hem ', kategorie: 'Tanken', prioritaet: 75 },

  // Lebensmittel
  { schlagwort: 'rewe', kategorie: 'Lebensmittel', prioritaet: 85 },
  { schlagwort: 'edeka', kategorie: 'Lebensmittel', prioritaet: 85 },
  { schlagwort: 'lidl', kategorie: 'Lebensmittel', prioritaet: 85 },
  { schlagwort: 'aldi', kategorie: 'Lebensmittel', prioritaet: 85 },
  { schlagwort: 'penny', kategorie: 'Lebensmittel', prioritaet: 85 },
  { schlagwort: 'netto', kategorie: 'Lebensmittel', prioritaet: 80 },
  { schlagwort: 'kaufland', kategorie: 'Lebensmittel', prioritaet: 85 },
  { schlagwort: 'norma', kategorie: 'Lebensmittel', prioritaet: 80 },
  { schlagwort: 'real,-', kategorie: 'Lebensmittel', prioritaet: 80 },
  { schlagwort: 'globus', kategorie: 'Lebensmittel', prioritaet: 80 },
  { schlagwort: 'marktkauf', kategorie: 'Lebensmittel', prioritaet: 85 },
  { schlagwort: 'hit ', kategorie: 'Lebensmittel', prioritaet: 70 },
  { schlagwort: 'tegut', kategorie: 'Lebensmittel', prioritaet: 85 },
  { schlagwort: 'nahkauf', kategorie: 'Lebensmittel', prioritaet: 85 },
  { schlagwort: 'bäcker', kategorie: 'Lebensmittel', prioritaet: 75 },
  { schlagwort: 'baecker', kategorie: 'Lebensmittel', prioritaet: 75 },
  { schlagwort: 'backwerk', kategorie: 'Lebensmittel', prioritaet: 75 },
  { schlagwort: 'metzger', kategorie: 'Lebensmittel', prioritaet: 75 },

  // Drogerie / Gesundheit
  { schlagwort: 'dm-drogerie', kategorie: 'Gesundheit / Drogerie', prioritaet: 85 },
  { schlagwort: 'dm drogerie', kategorie: 'Gesundheit / Drogerie', prioritaet: 85 },
  { schlagwort: 'rossmann', kategorie: 'Gesundheit / Drogerie', prioritaet: 85 },
  { schlagwort: 'müller', kategorie: 'Gesundheit / Drogerie', prioritaet: 70 },
  { schlagwort: 'apotheke', kategorie: 'Gesundheit / Drogerie', prioritaet: 85 },
  { schlagwort: 'docmorris', kategorie: 'Gesundheit / Drogerie', prioritaet: 85 },
  { schlagwort: 'shop apotheke', kategorie: 'Gesundheit / Drogerie', prioritaet: 85 },
  { schlagwort: 'zahnarzt', kategorie: 'Gesundheit / Drogerie', prioritaet: 85 },
  { schlagwort: 'praxis', kategorie: 'Gesundheit / Drogerie', prioritaet: 75 },

  // Online-Shopping
  { schlagwort: 'amazon', kategorie: 'Online-Shopping', prioritaet: 80 },
  { schlagwort: 'amzn', kategorie: 'Online-Shopping', prioritaet: 80 },
  { schlagwort: 'paypal', kategorie: 'Online-Shopping', prioritaet: 60 },
  { schlagwort: 'ebay', kategorie: 'Online-Shopping', prioritaet: 80 },
  { schlagwort: 'otto', kategorie: 'Online-Shopping', prioritaet: 70 },
  { schlagwort: 'zalando', kategorie: 'Kleidung', prioritaet: 85 },
  { schlagwort: 'about you', kategorie: 'Kleidung', prioritaet: 85 },
  { schlagwort: 'h&m', kategorie: 'Kleidung', prioritaet: 85 },
  { schlagwort: 'h & m', kategorie: 'Kleidung', prioritaet: 85 },
  { schlagwort: 'c&a', kategorie: 'Kleidung', prioritaet: 85 },
  { schlagwort: 'primark', kategorie: 'Kleidung', prioritaet: 85 },
  { schlagwort: 'deichmann', kategorie: 'Kleidung', prioritaet: 85 },
  { schlagwort: 'shein', kategorie: 'Kleidung', prioritaet: 85 },
  { schlagwort: 'temu', kategorie: 'Online-Shopping', prioritaet: 85 },
  { schlagwort: 'mediamarkt', kategorie: 'Online-Shopping', prioritaet: 85 },
  { schlagwort: 'media markt', kategorie: 'Online-Shopping', prioritaet: 85 },
  { schlagwort: 'saturn', kategorie: 'Online-Shopping', prioritaet: 80 },
  { schlagwort: 'ikea', kategorie: 'Online-Shopping', prioritaet: 80 },
  { schlagwort: 'obi', kategorie: 'Online-Shopping', prioritaet: 70 },
  { schlagwort: 'bauhaus', kategorie: 'Online-Shopping', prioritaet: 80 },
  { schlagwort: 'hornbach', kategorie: 'Online-Shopping', prioritaet: 80 },
  { schlagwort: 'action', kategorie: 'Online-Shopping', prioritaet: 65 },
  { schlagwort: 'tedi', kategorie: 'Online-Shopping', prioritaet: 75 },
  { schlagwort: 'kik', kategorie: 'Kleidung', prioritaet: 75 },

  // Gastronomie
  { schlagwort: 'lieferando', kategorie: 'Gastronomie / Lieferdienst', prioritaet: 90 },
  { schlagwort: 'uber eats', kategorie: 'Gastronomie / Lieferdienst', prioritaet: 90 },
  { schlagwort: 'wolt', kategorie: 'Gastronomie / Lieferdienst', prioritaet: 85 },
  { schlagwort: 'mcdonald', kategorie: 'Gastronomie / Lieferdienst', prioritaet: 85 },
  { schlagwort: 'burger king', kategorie: 'Gastronomie / Lieferdienst', prioritaet: 85 },
  { schlagwort: 'subway', kategorie: 'Gastronomie / Lieferdienst', prioritaet: 80 },
  { schlagwort: 'kfc', kategorie: 'Gastronomie / Lieferdienst', prioritaet: 80 },
  { schlagwort: 'starbucks', kategorie: 'Gastronomie / Lieferdienst', prioritaet: 85 },
  { schlagwort: 'restaurant', kategorie: 'Gastronomie / Lieferdienst', prioritaet: 80 },
  { schlagwort: 'pizza', kategorie: 'Gastronomie / Lieferdienst', prioritaet: 80 },
  { schlagwort: 'döner', kategorie: 'Gastronomie / Lieferdienst', prioritaet: 80 },
  { schlagwort: 'imbiss', kategorie: 'Gastronomie / Lieferdienst', prioritaet: 80 },
  { schlagwort: 'café', kategorie: 'Gastronomie / Lieferdienst', prioritaet: 75 },
  { schlagwort: 'cafe', kategorie: 'Gastronomie / Lieferdienst', prioritaet: 70 },
  { schlagwort: 'gastro', kategorie: 'Gastronomie / Lieferdienst', prioritaet: 75 },

  // Freizeit
  { schlagwort: 'kino', kategorie: 'Freizeit / Unterhaltung', prioritaet: 80 },
  { schlagwort: 'cinemaxx', kategorie: 'Freizeit / Unterhaltung', prioritaet: 85 },
  { schlagwort: 'cinestar', kategorie: 'Freizeit / Unterhaltung', prioritaet: 85 },
  { schlagwort: 'steam', kategorie: 'Freizeit / Unterhaltung', prioritaet: 80 },
  { schlagwort: 'eventim', kategorie: 'Freizeit / Unterhaltung', prioritaet: 85 },
  { schlagwort: 'ticketmaster', kategorie: 'Freizeit / Unterhaltung', prioritaet: 85 },
  { schlagwort: 'lotto', kategorie: 'Freizeit / Unterhaltung', prioritaet: 80 },
  { schlagwort: 'tipico', kategorie: 'Freizeit / Unterhaltung', prioritaet: 90 },
  { schlagwort: 'bwin', kategorie: 'Freizeit / Unterhaltung', prioritaet: 90 },
  { schlagwort: 'casino', kategorie: 'Freizeit / Unterhaltung', prioritaet: 90 },
  { schlagwort: 'wetten', kategorie: 'Freizeit / Unterhaltung', prioritaet: 85 },

  // Bargeld
  { schlagwort: 'bargeldauszahlung', kategorie: 'Bargeld', prioritaet: 95 },
  { schlagwort: 'geldautomat', kategorie: 'Bargeld', prioritaet: 95 },
  { schlagwort: 'auszahlung', kategorie: 'Bargeld', prioritaet: 80 },
  { schlagwort: 'ga nr', kategorie: 'Bargeld', prioritaet: 85 },
  { schlagwort: 'atm', kategorie: 'Bargeld', prioritaet: 80 },

  // Umbuchungen
  { schlagwort: 'sparplan', kategorie: 'Umbuchung / Sparen', prioritaet: 85 },
  { schlagwort: 'sparen', kategorie: 'Umbuchung / Sparen', prioritaet: 75 },
  { schlagwort: 'tagesgeld', kategorie: 'Umbuchung / Sparen', prioritaet: 85 },
  { schlagwort: 'depot', kategorie: 'Umbuchung / Sparen', prioritaet: 80 },
  { schlagwort: 'trade republic', kategorie: 'Umbuchung / Sparen', prioritaet: 85 },
  { schlagwort: 'scalable', kategorie: 'Umbuchung / Sparen', prioritaet: 85 },
  { schlagwort: 'umbuchung', kategorie: 'Umbuchung / Sparen', prioritaet: 85 },
  { schlagwort: 'eigenübertrag', kategorie: 'Umbuchung / Sparen', prioritaet: 85 },
]

export const CATEGORY_TYPE_LABELS: Record<CategoryType, string> = {
  einkommen: 'Einkommen',
  fix: 'Fixkosten',
  variabel: 'Variable Ausgaben',
  schulden: 'Schuldenkosten',
  sonstiges: 'Sonstiges',
}
