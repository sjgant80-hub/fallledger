# FallLedger

The sovereign double-entry general ledger. One HTML file. Vanilla JS. IndexedDB. Estate-dark.

Part of the TemuOracle suite — the keystone of the Oracle wedge. Replaces Oracle GL, NetSuite Ledger, Xero Books.

- **Prime:** 541
- **Version:** 1.0.0
- **Seal:** ◊·κ=1 · MIT

---

## For the operator (non-developer)

A general ledger is the book where every penny moves through your business. FallLedger is yours. It runs from a single HTML file — open it from your downloads folder, no install, no account, no server. Everything stays in your browser.

**Double-entry, briefly.** Every transaction has two sides. If money comes into your bank from a sale, you *debit* Bank (asset goes up) and *credit* Sales (revenue goes up). Debits always equal credits. The trial balance is the proof that the books are square.

**What you get out of the box.**

- A UK SME chart of accounts pre-seeded (Cash, Bank, Trade Debtors, Trade Creditors, VAT Control, Sales, Cost of Sales, Salaries, Rent, Utilities, Marketing, more — 30+ accounts).
- Journals: multi-line, validated, locked after post, reversal-by-counter-entry.
- Live reports: trial balance, profit & loss, balance sheet, cash flow.
- Period close: lock everything up to a date, unlock when you must.
- VAT calibrated to HMRC boxes 1–9. Standard / Cash / Flat Rate schemes.
- Multi-currency optional.
- Ω autopilot (Ctrl+K) — talk to the ledger in English.

**MTD note.** The VAT return view shows the nine HMRC boxes and exports CSV. It is **informational only**. MTD submission to HMRC requires recognised software with HMRC's API. FallLedger gives you the numbers; you file them with a recognised submitter.

**No advice.** This is a tool, not an accountant. Have a qualified person review your books before filing anything.

---

## For the developer

Single file. No build. No npm. No CDN.

**Stack**

- Vanilla JS (ES2020+)
- IndexedDB primary store, JSON export/import covers everything
- BroadcastChannel `fall-signal` for sibling-tool feeds
- postMessage API for cross-tool commands

**Run it**

```
open index.html
```

Or serve from any static host. Works from `file://`.

**BroadcastChannel feeds — `fall-signal`**

FallLedger listens for these inbound messages and posts journal entries automatically:

| Source           | Message type        | Maps to                                                            |
|------------------|---------------------|--------------------------------------------------------------------|
| `fallinvoice`    | `invoice.posted`    | Dr Trade Debtors · Cr Sales (+ Cr VAT Control if VAT included)     |
| `fallap`         | `bill.posted`       | Dr Expense account · Cr Trade Creditors                            |
| `fallaccount`    | `cash.movement`     | Dr/Cr Bank or Cash · opposite leg per payload                      |
| `fallaccount-trades` | `trade.settled` | Dr/Cr settlement legs per payload                                  |

Payload shape (loose):

```json
{
  "source": "fallinvoice",
  "type": "invoice.posted",
  "ref": "INV-0042",
  "date": "2026-06-17",
  "narrative": "Acme Ltd · web design",
  "net": 1000.00,
  "vat": 200.00,
  "gross": 1200.00,
  "vatRate": 0.20
}
```

The handler infers accounts from the source + payload. Anything it cannot resolve is queued as a draft for the operator to confirm.

**postMessage API**

```js
window.postMessage({ target: 'fallledger', action: 'ping', source: 'mytool' }, '*');
window.postMessage({ target: 'fallledger', action: 'getTrialBalance', source: 'mytool', from: '2026-04-01', to: '2026-06-30' }, '*');
window.postMessage({ target: 'fallledger', action: 'postJournal', source: 'mytool', entry: { /* ... */ } }, '*');
```

**Export to PDF**

FallLedger renders any report to markdown then posts to `fallpdf`:

```js
window.postMessage({ target: 'fallpdf', action: 'setSource', source: '# Trial Balance\n...' }, '*');
```

If FallPDF is not present, the report downloads as `.md`.

**Konomi shim**

Inert. Sovereign tier baked. Prime 541. No phone-home.

**Ω autopilot tiers**

- **T0** — offline keyword router. Parses intents like `post journal: sales 1000 to bank`, `trial balance this month`, `p&l last quarter`, `vat return Q2`.
- **T2** — local Ollama at `127.0.0.1:11434`.
- **T3** — BYOK (Anthropic / Gemini / OpenAI / OpenRouter). Parses arbitrary natural-language intent into journal-entry JSON or report parameters.

**Data model**

```
accounts:  { id, code, name, category, parent, currency }
journals:  { id, date, ref, narrative, lines: [{accountId, debit, credit, memo, currency, fxRate}], posted, reversed, reversalOf }
periods:   { id, closeDate }
settings:  { vatRegistered, vatScheme, homeCurrency, multiCurrency, anthropicKey, ... }
```

**14-point gate**

Single file · <400KB target · domain L1 views · Ω + 7 named ops · Cascade T0/T2/T3 · routes-not-rails · IndexedDB + JSON · estate dark · helpful empty state · KONOMI shim · fallmesh hook · PWA manifest data URL · README + LICENSE · `.nojekyll`.

---

MIT. Prime 541. ◊·κ=1.
