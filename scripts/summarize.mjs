#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';

const CHANNEL_ID = 'UCaWmmMJ6EiBqdQdMfzFqpUg';
const CHANNEL_NAME = 'Omar Bragantini';
const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const APIFY_ACTOR = 'pintostudio~youtube-transcript-scraper';
const RECIPIENT = 'pierpaolo.maggio84@gmail.com';
const MIN_TRANSCRIPT_LEN = 1500;
const STATE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'state.json');

const APIFY_TOKEN = (process.env.APIFY_TOKEN || '').trim();
const OPENROUTER_KEY = (process.env.OPENROUTER_KEY || '').trim();
const GMAIL_USER = (process.env.GMAIL_USER || '').trim();
const GMAIL_APP_PASSWORD = (process.env.GMAIL_APP_PASSWORD || '').trim();

for (const [k, v] of Object.entries({ APIFY_TOKEN, OPENROUTER_KEY, GMAIL_USER, GMAIL_APP_PASSWORD })) {
  if (!v) { console.error(`Missing env var: ${k}`); process.exit(1); }
  console.log(`env ${k}: length=${v.length}, prefix=${v.slice(0, 6)}***`);
}

async function loadState() {
  try {
    return JSON.parse(await fs.readFile(STATE_PATH, 'utf8'));
  } catch {
    return { seeded: false, processed: [] };
  }
}

async function saveState(state) {
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
}

function decodeHtml(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function fetchRSS() {
  const res = await fetch(RSS_URL);
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);
  const xml = await res.text();
  const entries = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = entryRe.exec(xml))) {
    const e = m[1];
    const videoId = (e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1];
    const title = (e.match(/<title>([^<]+)<\/title>/) || [])[1];
    const published = (e.match(/<published>([^<]+)<\/published>/) || [])[1];
    if (videoId) entries.push({
      videoId,
      title: title ? decodeHtml(title) : '',
      published,
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    });
  }
  return entries;
}

async function fetchTranscript(videoUrl) {
  const url = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl }),
  });
  if (!res.ok) throw new Error(`Apify failed: ${res.status} ${await res.text().catch(() => '')}`);
  const data = await res.json();
  let segs = [];
  if (Array.isArray(data)) {
    for (const d of data) {
      if (Array.isArray(d?.transcript)) segs = segs.concat(d.transcript);
      else if (Array.isArray(d?.data)) segs = segs.concat(d.data);
      else if (d?.text) segs.push(d);
    }
  }
  return segs
    .map(s => (typeof s === 'string' ? s : s.text || s.snippet || ''))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function summarize({ title, transcript }) {
  const systemPrompt = 'Sei un esperto analista di contenuti video di strategia business, e-commerce, marketing e operazioni. Produci sempre output HTML pulito (solo <h2>, <h3>, <p>, <strong>, <ul>, <li>, <code>) senza tag <html>, <body> o <style>. Non aggiungere preamboli, commenti o note finali. Mai usare blocchi triple-backtick.';

  const userPrompt = `Ti fornisco la trascrizione automatica in italiano di un video di Omar Bragantini (canale "${CHANNEL_NAME}" — strategia, marketing ed e-commerce) intitolato: ${title}

Devi produrre un singolo output HTML in italiano con esattamente questa struttura:

<h2>Riassunto</h2>
<p><strong>Argomento principale:</strong> una frase concisa che identifichi il tema centrale del video.</p>

<h3>Concetti chiave o novità introdotte</h3>
<ul>
  <li>Da 4 a 8 punti, ciascuno una frase compatta su un concetto o un'idea distinta affrontata nel video.</li>
</ul>

<h3>Step tecnici o tutorial</h3>
<p>Se il video contiene una demo, un tutorial o uno step-by-step pratico, riporta in modo strutturato:</p>
<ul>
  <li><strong>Obiettivo:</strong> cosa si vuole ottenere.</li>
  <li><strong>Passaggi/azioni/strumenti:</strong> elenco preciso di ciò che viene fatto o usato.</li>
  <li><strong>Dettagli rilevanti:</strong> qualsiasi parametro, soglia, metrica o configurazione importante.</li>
</ul>
<p>Se il video <strong>non</strong> contiene step pratici, sostituisci questa sezione con: <em>Nessun tutorial pratico in questo video.</em></p>

<h3>Strumenti e funzionalità menzionati</h3>
<ul>
  <li><strong>Nome strumento o tattica:</strong> spiegazione breve in 1-2 frasi.</li>
</ul>

<h3>Vantaggi pratici</h3>
<p>Una sintesi in 2-4 frasi sui benefici concreti per chi gestisce un business, un e-commerce o lavora con team operativi nel proprio workflow quotidiano.</p>

Tutto in italiano. Mantieni intatti nomi propri, sigle, riferimenti a strumenti, brand e persone. Restituisci direttamente l'HTML pronto, senza markdown, commenti o blocchi di codice.

Trascrizione originale:
${transcript}`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/PierpaoloMaggio/omar-bragantini-summarizer',
      'X-Title': 'Omar Bragantini Summarizer',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4.5',
      max_tokens: 4000,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter failed: ${res.status} ${await res.text().catch(() => '')}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter response missing content: ' + JSON.stringify(data).slice(0, 300));
  return content
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
}

function buildEmailHtml({ title, videoUrl, summaryHtml }) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:720px;margin:0 auto;color:#1a1a1a;line-height:1.6">
<p style="color:#666;font-size:13px;margin:0 0 8px 0">Nuovo video &middot; ${CHANNEL_NAME}</p>
<h1 style="font-size:22px;margin:0 0 4px 0">${title}</h1>
<p style="margin:0 0 24px 0"><a href="${videoUrl}" style="color:#0066cc">Guarda su YouTube</a></p>
<hr style="border:none;border-top:1px solid #eee;margin:0 0 24px 0">
${summaryHtml}
</div>`;
}

async function sendEmail({ subject, html }) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
  await transporter.sendMail({ from: GMAIL_USER, to: RECIPIENT, subject, html });
}

async function main() {
  const state = await loadState();
  const entries = await fetchRSS();
  console.log(`RSS entries: ${entries.length}`);

  if (!state.seeded) {
    state.seeded = true;
    state.processed = entries.map(e => e.videoId);
    await saveState(state);
    console.log(`First run — seeded ${state.processed.length} videoIds without processing.`);
    return;
  }

  const newOnes = entries.filter(e => !state.processed.includes(e.videoId));
  console.log(`New videos: ${newOnes.length}`);
  if (newOnes.length === 0) return;

  for (const entry of newOnes.reverse()) {
    console.log(`Processing ${entry.videoId} — ${entry.title}`);
    try {
      const transcript = await fetchTranscript(entry.videoUrl);
      console.log(`  transcript length: ${transcript.length}`);
      if (transcript.length < MIN_TRANSCRIPT_LEN) {
        console.log(`  skipped (too short, likely a Short)`);
        state.processed.push(entry.videoId);
      } else {
        const summaryHtml = await summarize({ title: entry.title, transcript });
        const html = buildEmailHtml({ title: entry.title, videoUrl: entry.videoUrl, summaryHtml });
        await sendEmail({ subject: `${CHANNEL_NAME} — ${entry.title}`, html });
        console.log(`  mail sent`);
        state.processed.push(entry.videoId);
      }
    } catch (e) {
      console.error(`  ERROR on ${entry.videoId}: ${e.message}`);
    }
    if (state.processed.length > 200) state.processed = state.processed.slice(-200);
    await saveState(state);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
