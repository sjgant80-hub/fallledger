// ledger.mjs — a ledger has one rule, and this is the rule.
//
// fallledger DOES check that debits equal credits, which is more than most of the estate managed.
// What it checks is the problem.
//
// ⚑ THE EXCHANGE RATE WAS DECORATION. Every line stores a `currency` and an `fxRate`. Search the file:
// `fxRate` is written once, at the moment a journal is posted, and read nowhere — not by the balance
// check, not by the trial balance, not by the profit and loss. So a journal debiting £100 and
// crediting $100 balances perfectly, and the books are out by the difference for ever after.
//
// ⚑ A COMMA SILENTLY BECAME ZERO. Amounts were read as `Number(l.debit)||0`, and `Number('1,000')` is
// NaN, so a line typed the way money is written on a proposal becomes 0. Type both sides that way and
// the journal is all zeros — which balances, and posts, and records nothing.
//
// ⚑ IT BALANCED TO WITHIN HALF A PENNY. The old check allowed the two sides to differ by up to
// 0.005, because it summed pounds as floating point and needed the slack. Counted in whole pence
// there is nothing to tolerate: money balances exactly or it is not balanced. A tolerance is a
// decision to lose money slowly.
//
// ⚑ AND THE TRIAL BALANCE DROPPED WHAT IT COULD NOT PLACE. It looked each line's account up in its
// running totals and, finding none, returned early without a word — so a line posted to an account
// that has since been deleted was skipped in silence. Every journal still balanced individually, the
// trial balance did not, and nothing anywhere said why. The entire purpose of a trial balance is that
// it balances; one that quietly cannot is worse than none at all.
//
// (Both faults are described here in prose rather than quoted as code on purpose: the page inlines
// this file, and CI greps the page for the old expressions. A guard that trips on a comment explaining
// the bug is a guard nobody can live with — the same trap fall-graft met with its own closing tags.)
//
// Pure: no storage, no clock, no DOM. Money is integer pence throughout.

/** The two sides. A line carries exactly one of them. */
export const DEBIT = 'debit';
export const CREDIT = 'credit';

/**
 * Money as whole pence, or null.
 *
 * Accepts what people type — "1,000", "£1,000.50", " 1000 " — and refuses what nobody means. Rounds
 * to the penny at the boundary so nothing downstream ever holds a fraction of one.
 */
export function pence(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 100) : null;
  }
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[£$€,\s]/g, '');
  if (cleaned === '' || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;   // no exponents, no junk
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Pence back to pounds, for display. */
export function pounds(p) {
  const n = Number(p);
  return Number.isFinite(n) ? Math.round(n) / 100 : null;
}

/**
 * One line, normalised — or the reasons it is not a line.
 *
 * ⚑ EXACTLY ONE SIDE. A line carrying both a debit and a credit is not a double entry, it is a net
 * figure with the working thrown away, and it makes every account it touches unauditable.
 */
export function normalizeLine(line, opts) {
  const l = (line && typeof line === 'object') ? line : {};
  const o = (opts && typeof opts === 'object') ? opts : {};
  const problems = [];

  const dr = l.debit === undefined || l.debit === null || l.debit === '' ? 0 : pence(l.debit);
  const cr = l.credit === undefined || l.credit === null || l.credit === '' ? 0 : pence(l.credit);

  if (dr === null || cr === null) problems.push('that is not an amount — "1,000" and "£1,000.50" are fine, letters are not');
  if (dr !== null && dr < 0) problems.push('a debit cannot be negative — credit the other account instead');
  if (cr !== null && cr < 0) problems.push('a credit cannot be negative — debit the other account instead');
  if (dr && cr) problems.push('a line is a debit or a credit, never both');
  if (!dr && !cr) problems.push('a line with no amount is not a line');

  const accountId = l.accountId == null ? '' : String(l.accountId);
  if (!accountId) problems.push('a line needs an account');
  else if (Array.isArray(o.accounts) && !o.accounts.some(a => a && String(a.id) === accountId)) {
    problems.push(`there is no account ${accountId}`);
  }

  const rate = fxRateOf(l.fxRate);
  if (rate === null) problems.push('the exchange rate is not a usable number');

  if (problems.length) return { ok: false, problems, line: null };
  return {
    ok: true, problems: [],
    line: { accountId, debit: dr, credit: cr, side: dr ? DEBIT : CREDIT, amount: dr || cr,
            currency: currencyOf(l.currency), fxRate: rate, fxRateGiven: rateWasGiven(l.fxRate),
            memo: typeof l.memo === 'string' ? l.memo : '' },
  };
}

function currencyOf(v) {
  return typeof v === 'string' && /^[A-Za-z]{3}$/.test(v.trim()) ? v.trim().toUpperCase() : 'GBP';
}

/** A rate must be a positive finite number. Absent means 1; zero and negative mean nothing at all. */
export function fxRateOf(value) {
  if (value === undefined || value === null || value === '') return 1;
  const n = Number(value);
  return (Number.isFinite(n) && n > 0) ? n : null;
}

/** Was a rate actually stated, as opposed to defaulted? On a foreign line that difference is money. */
function rateWasGiven(value) {
  return !(value === undefined || value === null || value === '');
}

/**
 * ⚑ WHAT A LINE IS WORTH IN THE BOOKS' OWN CURRENCY.
 *
 * This is the function whose absence made the exchange rate decoration. Everything that adds money up
 * goes through it, so a foreign line can never be compared against a home one by accident again.
 */
export function homeAmount(line, homeCurrency) {
  const l = (line && typeof line === 'object') ? line : {};
  const amount = Number(l.amount);
  if (!Number.isFinite(amount)) return null;
  const home = currencyOf(homeCurrency);

  // A home-currency line is already in home money. Any rate sitting on it is ignored: a stray rate
  // must never quietly restate sterling.
  if (currencyOf(l.currency) === home) return Math.round(amount);

  // ⚑ A FOREIGN LINE WITH NO STATED RATE CONVERTS TO NOTHING. Defaulting it to 1 is how $100 came to
  // equal £100 in the first place — the difference between "the rate is one" and "nobody said" is
  // exactly the money that goes missing. It has to be written down, even when it really is 1.
  const given = ('fxRateGiven' in l) ? l.fxRateGiven === true : rateWasGiven(l.fxRate);
  if (!given) return null;
  const rate = fxRateOf(l.fxRate);
  if (rate === null) return null;
  return Math.round(amount * rate);
}

/**
 * ⚑ THE RULE. Every reason at once, because being told one fault at a time is five trips back.
 *
 * Balanced means EXACTLY balanced, in whole pence, after every line has been converted into the books'
 * own currency. No tolerance.
 */
export function validateJournal(entry, opts) {
  const e = (entry && typeof entry === 'object') ? entry : {};
  const o = (opts && typeof opts === 'object') ? opts : {};
  const home = currencyOf(o.homeCurrency);
  const problems = [];

  const raw = Array.isArray(e.lines) ? e.lines : [];
  if (raw.length < 2) problems.push('a journal needs at least two lines');

  const lines = [];
  raw.forEach((l, i) => {
    const r = normalizeLine(l, o);
    if (!r.ok) r.problems.forEach(p => problems.push(`line ${i + 1}: ${p}`));
    else lines.push(r.line);
  });

  let dr = 0, cr = 0, unconvertible = 0;
  for (const l of lines) {
    const home_ = homeAmount(l, home);
    if (home_ === null) { unconvertible++; continue; }
    if (l.side === DEBIT) dr += home_; else cr += home_;
  }
  if (unconvertible) problems.push(`${unconvertible} line(s) cannot be converted into ${home}`);

  if (!problems.length && dr !== cr) {
    problems.push(`debits (${fmtPence(dr)}) must equal credits (${fmtPence(cr)}) — out by ${fmtPence(Math.abs(dr - cr))}`);
  }

  if (problems.length) return { ok: false, problems, debits: dr, credits: cr, lines: null };
  return { ok: true, problems: [], debits: dr, credits: cr, lines };
}

function fmtPence(p) {
  const v = Math.abs(p) / 100;
  return (p < 0 ? '-' : '') + '£' + v.toFixed(2);
}

/** Journals that count toward the books. Voided and unposted are history, not balance. */
export function livePostings(journals) {
  return (Array.isArray(journals) ? journals : [])
    .filter(j => j && typeof j === 'object' && j.posted !== false && j.voided !== true);
}

/**
 * ⚑ THE TRIAL BALANCE, AND WHAT IT COULD NOT PLACE.
 *
 * Returns per-account totals AND `unplaced` — every line whose account does not exist. The old code
 * dropped those silently, so the report simply stopped balancing and no screen in the application
 * could tell anybody why. A number that cannot be explained is not a number a bookkeeper can sign.
 */
export function trialBalance(journals, accounts, opts) {
  const o = (opts && typeof opts === 'object') ? opts : {};
  const home = currencyOf(o.homeCurrency);
  const accs = Array.isArray(accounts) ? accounts.filter(a => a && a.id != null) : [];
  const byId = new Map(accs.map(a => [String(a.id), a]));

  const rows = new Map(accs.map(a => [String(a.id), {
    accountId: String(a.id), code: a.code || '', name: a.name || '', category: a.category || '',
    debit: 0, credit: 0, net: 0,
  }]));
  const unplaced = [];
  let totalDr = 0, totalCr = 0;

  for (const j of livePostings(journals)) {
    if (o.from && String(j.date) < o.from) continue;
    if (o.to && String(j.date) > o.to) continue;
    for (const raw of (Array.isArray(j.lines) ? j.lines : [])) {
      const norm = normalizeLine(raw, {});          // no account list: shape only
      if (!norm.ok) { unplaced.push({ journalId: j.id ?? null, accountId: raw && raw.accountId, why: norm.problems[0] }); continue; }
      const l = norm.line;
      const amount = homeAmount(l, home);
      if (amount === null) { unplaced.push({ journalId: j.id ?? null, accountId: l.accountId, why: `cannot be converted into ${home}` }); continue; }
      const row = rows.get(l.accountId);
      if (!row) { unplaced.push({ journalId: j.id ?? null, accountId: l.accountId, why: 'there is no such account' }); continue; }
      if (l.side === DEBIT) { row.debit += amount; totalDr += amount; }
      else { row.credit += amount; totalCr += amount; }
    }
  }

  for (const row of rows.values()) {
    row.net = (row.category === 'asset' || row.category === 'expense')
      ? row.debit - row.credit
      : row.credit - row.debit;
  }

  return {
    rows: [...rows.values()],
    debits: totalDr, credits: totalCr,
    balanced: totalDr === totalCr && unplaced.length === 0,
    unplaced,
    homeCurrency: home,
  };
}

/** Reversing an entry swaps every side. It must balance for the same reason the original did. */
export function reversalOf(journal) {
  const j = (journal && typeof journal === 'object') ? journal : {};
  const lines = (Array.isArray(j.lines) ? j.lines : []).map(l => ({
    ...l, debit: l && l.credit, credit: l && l.debit,
    memo: 'reversal · ' + ((l && l.memo) || ''),
  }));
  return { ref: 'REV-' + (j.ref || String(j.id || '').slice(0, 6)), narrative: 'Reversal of ' + (j.ref || j.id || ''), lines, reversalOf: j.id ?? null };
}

export default {
  DEBIT, CREDIT, pence, pounds, fxRateOf, normalizeLine, homeAmount,
  validateJournal, livePostings, trialBalance, reversalOf,
};
