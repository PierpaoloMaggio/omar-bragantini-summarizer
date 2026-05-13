# Omar Bragantini Summarizer

Cron GitHub Actions che ogni ora controlla il canale YouTube di Omar Bragantini (founder Keep Growing — strategia, marketing ed e-commerce), riassume i nuovi video via Claude Sonnet 4.5 e manda la sintesi strutturata via mail.

Replica dell'output di [nate-herk-summarizer](https://github.com/PierpaoloMaggio/nate-herk-summarizer) — **stessa identica struttura email (5 sezioni)**, framing system adattato per contenuto business/e-commerce. Sostituisce il workflow n8n `Ie3zUTw7eC01u96l`.

## Struttura del riassunto (5 sezioni)

1. **Argomento principale** — una frase
2. **Concetti chiave o novità introdotte** — 4-8 punti
3. **Step tecnici o tutorial** — obiettivo + passaggi/azioni + dettagli (oppure "Nessun tutorial pratico in questo video")
4. **Strumenti e funzionalità menzionati** — nome + spiegazione
5. **Vantaggi pratici** — 2-4 frasi sui benefici per chi gestisce business/e-commerce/team

## Secrets

Stessi 4 del nate-herk-summarizer: `APIFY_TOKEN`, `OPENROUTER_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`.

## Primo avvio

1. Push del repo con i secrets configurati.
2. Actions → "Omar Bragantini Summarizer" → Run workflow.
3. Prima run = seed dei videoId correnti senza mandare mail. Dalla seconda processa i nuovi.

## Costo

~$0.05-0.10/video Sonnet 4.5 (Omar pubblica spesso Shorts che vengono filtrati per lunghezza transcript, quindi solo video full vengono effettivamente processati). A regime ~$1-2/mese.
