# SchuldenAnalyse

Offline-PWA, die Sparkasse-Kontoauszüge (PDF) direkt auf dem iPhone auswertet:

- **Wo und warum entstehen Schulden?** Saldoverlauf, Tage im Minus, Dispozinsen, Rücklastschriften, Kreditraten, Verursacher-Ranking nach Kategorie, Monatsvergleich
- **Wie viel ist diesen Monat noch frei – ohne Schulden?** Kontostand minus noch erwartete Fixkosten minus Sicherheitspuffer, begrenzt auf 0 (der Dispo zählt nicht als „verfügbar“)
- **Alles lokal.** Kein Server, kein Konto, keine Übertragung. Daten liegen in IndexedDB auf dem Gerät, Backup als JSON.

## Technik

Vite + React + TypeScript, Tailwind, `pdfjs-dist` (Textextraktion im Browser), Dexie (IndexedDB), Recharts, `vite-plugin-pwa`, Vitest.

```
src/
  parser/      pdfText.ts (pdf.js), sparkasse.ts (Layout-Parser), dedupe.ts (Duplikat-Hash)
  categorize/  Schlagwort-Regeln und Standardkategorien
  analysis/    recurring.ts (Fixkosten), debt.ts (Schuldenanalyse), budget.ts (Frei verfügbar)
  db/          Dexie-Schema, Import/Backup-Operationen
  pages/       Dashboard, Import, Buchungen, Analyse, Einstellungen
  test/fixtures/  anonymisierte Auszugstexte für die Parser-Tests
```

## Entwicklung

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Parser- und Analyse-Tests
npm run build      # Produktions-Build nach dist/
npm run preview    # dist/ lokal ausliefern (--host für Zugriff im WLAN)
```

## Auf das iPhone bringen

Eine PWA lässt sich in iOS nur von einer **HTTPS**-Adresse aus installieren. Es werden dabei nur die App-Dateien geladen – deine Kontodaten verlassen das iPhone nie.

### Variante A: GitHub Pages (empfohlen)

1. Neues GitHub-Repository anlegen und dieses Projekt pushen (Branch `main`).
2. Im Repository unter **Settings → Pages** als Source **GitHub Actions** wählen.
3. Der Workflow `.github/workflows/deploy.yml` baut und veröffentlicht die App automatisch bei jedem Push. Die Adresse lautet `https://<benutzername>.github.io/<repository>/`.
   Soll das Repository privat bleiben, ist GitHub Pages nur mit einem bezahlten Plan möglich – alternativ Netlify oder Cloudflare Pages nutzen (beide bauen mit `npm run build`, Publish-Verzeichnis `dist`, ohne `BASE_PATH`).
4. Auf dem iPhone die Adresse in **Safari** öffnen → Teilen-Symbol → **„Zum Home-Bildschirm“**.
5. Die App vom Home-Bildschirm starten. Ab jetzt funktioniert sie auch offline.

### Variante B: nur im Heimnetz

`npm run preview -- --host` liefert `dist/` im WLAN aus, allerdings ohne HTTPS. Für die Installation als Home-Bildschirm-App braucht es dann ein lokales Zertifikat (z. B. mit `mkcert`) und einen HTTPS-fähigen Static-Server. Ohne Installation kann die App trotzdem im Safari-Tab benutzt werden; die Daten bleiben im Safari-Speicher.

## Bedienung

1. **Import:** Eine oder mehrere PDF-Kontoauszüge auswählen (Dateien-App). Vorschau prüfen, ggf. Kategorie ändern oder Vorzeichen antippen, dann speichern. Überlappende Auszüge werden per Duplikat-Hash bereinigt. Falls ein PDF nicht lesbar ist: Text im PDF markieren, kopieren und über „Text aus Zwischenablage einfügen“ auswerten.
2. **Buchungen:** Kategorie antippen und ändern – mit „Regel merken“ lernt die App die Zuordnung für ähnliche Buchungen. Manuelle Buchungen für Ausgaben, die noch auf keinem Auszug stehen.
3. **Einstellungen:** Aktuellen Kontostand aus dem Online-Banking eintragen (Auszüge kommen meist erst am Monatsende), Dispolimit, Sicherheitspuffer, Start des Budgetmonats (z. B. Gehaltstag). Regelmäßig **Backup exportieren**.
4. **Analyse:** Erkenntnisse, Saldoverlauf mit Dispolimit, Phasen im Minus, Einnahmen vs. Ausgaben, Kategorien-Ranking, reine Schuldenkosten, erkannte Fixkosten/Abos/Raten.

## Bekannte Grenzen

- Nur textbasierte PDFs (keine Scans – dafür wäre OCR nötig).
- Layout-Erkennung ist auf Sparkasse-Auszüge ausgelegt (Kennzeichen S/H, Vorzeichen-Variante, Soll/Haben-Spalten). Bei Abweichungen hilft die Rohtext-Ansicht in der Import-Vorschau; über „Neu auswerten“ lassen sich bereits importierte Auszüge nach Parser-Verbesserungen erneut auswerten.
- Wiederkehrende Kosten werden erst ab zwei Monaten Daten erkannt.
