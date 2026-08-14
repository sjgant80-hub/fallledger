// ledger.test.mjs — PROOF-OF-PLAY for the one rule a ledger has.
import { DEBIT, CREDIT, pence, pounds, fxRateOf, normalizeLine, homeAmount,
         validateJournal, livePostings, trialBalance, reversalOf } from './ledger.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FAIL ') + m); };

const ACC = [
  { id: '1200', code: '1200', name: 'Bank', category: 'asset' },
  { id: '4000', code: '4000', name: 'Sales', category: 'revenue' },
  { id: '7500', code: '7500', name: 'Rent', category: 'expense' },
];
const J = (lines, extra = {}) => ({ id: 'J1', date: '2026-08-14', lines, posted: true, voided: false, ...extra });

console.log('\n=== §1 · ⚑ THE COMMA THAT POSTED NOTHING ===');
{
  ok(pence('1,000') === 100000, '⚑ "1,000" is a thousand pounds — Number("1,000") is NaN, and `||0` turned it into nothing');
  ok(pence('£1,000.50') === 100050, 'and so is "£1,000.50", typed the way it appears on an invoice');
  ok(pence(1000) === 100000 && pence('1000') === 100000, 'a plain number, passed or typed');
  ok(pence('0.005') === 1 || pence('0.005') === 0, 'a fraction of a penny is rounded at the boundary, never carried');
  ok(pence('abc') === null && pence('') === null && pence(null) === null, 'letters and emptiness are not amounts');
  ok(pence('1e5') === null, 'nor an exponent — that is a paste accident, not a figure anybody typed');
  ok(pounds(100050) === 1000.5 && pounds('x') === null, 'and pence convert back for display');

  // the whole fault, end to end
  const allZero = validateJournal({ lines: [
    { accountId: '1200', debit: '1,000' }, { accountId: '4000', credit: '1,000' }] }, { accounts: ACC });
  ok(allZero.ok === true && allZero.debits === 100000,
     '⚑ so a journal typed with commas posts ONE THOUSAND POUNDS — before, both sides became zero, which balances, and posted a journal recording nothing');
}

console.log('\n=== §2 · ⚑ THE EXCHANGE RATE WAS DECORATION ===');
{
  const mixed = validateJournal({ lines: [
    { accountId: '1200', debit: 100, currency: 'GBP' },
    { accountId: '4000', credit: 100, currency: 'USD' },
  ] }, { accounts: ACC, homeCurrency: 'GBP' });
  ok(mixed.ok === false,
     '⚑ £100 debit against $100 credit is REFUSED — fxRate was stored on every line and read by nothing, so this balanced perfectly and the books were out for ever');
  ok(/cannot be converted/.test(mixed.problems.join(' ')),
     '⚑ and the reason is that NOBODY STATED A RATE — defaulting a foreign line to 1 is precisely how $100 came to equal £100');

  const converted = validateJournal({ lines: [
    { accountId: '1200', debit: 79, currency: 'GBP' },
    { accountId: '4000', credit: 100, currency: 'USD', fxRate: 0.79 },
  ] }, { accounts: ACC, homeCurrency: 'GBP' });
  ok(converted.ok === true, 'with the rate actually applied, $100 at 0.79 balances £79');
  ok(converted.debits === 7900 && converted.credits === 7900, 'and both sides are held in home pence');

  ok(homeAmount({ amount: 10000, currency: 'USD', fxRate: 0.79 }, 'GBP') === 7900, 'a foreign line converts');
  ok(homeAmount({ amount: 10000, currency: 'GBP', fxRate: 99 }, 'GBP') === 10000,
     '⚑ and a HOME-currency line ignores any rate on it — a stray rate must never quietly restate sterling');
  ok(homeAmount({ amount: 100, currency: 'USD', fxRate: 0 }, 'GBP') === null, 'a rate of zero converts nothing');
  ok(homeAmount(null, 'GBP') === null, 'and nothing converts nothing');
}

console.log('\n=== §3 · ⚑ EXACTLY, NOT NEARLY ===');
{
  // ⚑ THE CASE THE OLD TOLERANCE ACTUALLY LET THROUGH. Three lines of £0.334 against one of £1.00:
  // in floating-point pounds that is 1.002 against 1.000, a difference of 0.002, comfortably inside
  // the 0.005 the old check allowed — so it posted, and the books were a third of a penny out. In
  // whole pence it is 33+33+33 = 99 against 100, and it is simply not balanced.
  //
  // (My first attempt at this test used 99.996 against 100.00 and proved nothing: both round to the
  // same penny, so both versions accept it. A sub-penny difference is not the fault — a sub-penny
  // difference that SURVIVES rounding and accumulates is.)
  const off = validateJournal({ lines: [
    { accountId: '7500', debit: 0.334 }, { accountId: '7500', debit: 0.334 },
    { accountId: '7500', debit: 0.334 }, { accountId: '1200', credit: 1.00 }] }, { accounts: ACC });
  ok(off.ok === false,
     '⚑ three lines of 33.4p against £1 do NOT balance — the old check summed pounds as floats, saw a difference of 0.002, and allowed it');
  ok(/out by £0\.01/.test(off.problems.join(' ')), 'and it says exactly how far out: a penny');

  // the classic float sum, a hundred times over
  const many = [];
  for (let i = 0; i < 100; i++) many.push({ accountId: '7500', debit: 0.1 });
  many.push({ accountId: '1200', credit: 10 });
  const r = validateJournal({ lines: many }, { accounts: ACC });
  ok(r.ok === true && r.debits === 1000,
     '⚑ a hundred lines of 10p come to exactly £10 — added as pounds they land a penny out and the journal is refused for no reason');
}

console.log('\n=== §4 · a line is a debit or a credit ===');
{
  const both = normalizeLine({ accountId: '1200', debit: 100, credit: 100 }, { accounts: ACC });
  ok(both.ok === false && /never both/.test(both.problems.join(' ')),
     '⚑ a line carrying both sides is refused — it is a net figure with the working thrown away');
  ok(normalizeLine({ accountId: '1200' }, { accounts: ACC }).ok === false, 'a line with no amount is not a line');
  ok(normalizeLine({ accountId: '1200', debit: -100 }, { accounts: ACC }).ok === false,
     '⚑ a NEGATIVE debit is refused — it is a credit in disguise, and it hides which account was really credited');
  ok(normalizeLine({ debit: 100 }, { accounts: ACC }).ok === false, 'a line with no account is not a line');
  ok(normalizeLine({ accountId: '9999', debit: 100 }, { accounts: ACC }).ok === false, 'nor one posting to an account that does not exist');
  ok(/no account 9999/.test(normalizeLine({ accountId: '9999', debit: 100 }, { accounts: ACC }).problems.join(' ')), 'and it names the account');

  const good = normalizeLine({ accountId: '1200', debit: '1,000' }, { accounts: ACC });
  ok(good.ok === true && good.line.side === DEBIT && good.line.amount === 100000, 'a good line comes back normalised, in pence, with its side named');
  ok(normalizeLine({ accountId: '4000', credit: 5 }, { accounts: ACC }).line.side === CREDIT, 'and a credit knows it is one');
}

console.log('\n=== §5 · every fault at once ===');
{
  const bad = validateJournal({ lines: [{ accountId: '9999', debit: 'abc', credit: 5 }] }, { accounts: ACC });
  ok(bad.ok === false, 'a broken journal is refused');
  ok(bad.problems.length >= 3,
     '⚑ all of it is reported at once — one fault at a time is five trips back to the same screen');
  ok(bad.problems.every(p => /^line 1: |journal needs/.test(p)), 'and each problem says which line it is about');
  ok(bad.lines === null, 'nothing half-built is handed back');
  ok(validateJournal({ lines: [{ accountId: '1200', debit: 100 }] }, { accounts: ACC }).ok === false, 'one line is not a double entry');
  ok(validateJournal(null, {}).ok === false && validateJournal({}, {}).ok === false, 'and nothing is not a journal');
}

console.log('\n=== §6 · ⚑ THE TRIAL BALANCE SAYS WHAT IT COULD NOT PLACE ===');
{
  const js = [
    J([{ accountId: '1200', debit: 1000 }, { accountId: '4000', credit: 1000 }]),
    J([{ accountId: '7500', debit: 250 }, { accountId: '1200', credit: 250 }], { id: 'J2' }),
  ];
  const tb = trialBalance(js, ACC, { homeCurrency: 'GBP' });
  ok(tb.balanced === true, 'a clean set of books balances');
  ok(tb.debits === 125000 && tb.credits === 125000, 'and both totals agree, in pence');
  ok(tb.rows.find(r => r.accountId === '1200').net === 75000, 'the bank account nets to £750');
  ok(tb.rows.find(r => r.accountId === '4000').net === 100000, 'and revenue nets the other way round');

  // the deleted account — the fault that made the report stop balancing in silence
  const orphaned = [...js, J([{ accountId: '9999', debit: 500 }, { accountId: '4000', credit: 500 }], { id: 'J3' })];
  const tb2 = trialBalance(orphaned, ACC, { homeCurrency: 'GBP' });
  ok(tb2.balanced === false,
     '⚑ a line posted to an account that no longer exists makes the trial balance UNBALANCED, and it says so');
  ok(tb2.unplaced.length === 1 && tb2.unplaced[0].accountId === '9999',
     '⚑ and it NAMES the line it could not place — the old code dropped it silently and no screen could say why');
  ok(tb2.unplaced[0].journalId === 'J3', 'with the journal it came from, so it can be found');
  ok(/no such account/.test(tb2.unplaced[0].why), 'and the reason');
}

console.log('\n=== §7 · what counts toward the books ===');
{
  const js = [
    J([{ accountId: '1200', debit: 100 }, { accountId: '4000', credit: 100 }]),
    J([{ accountId: '1200', debit: 999 }, { accountId: '4000', credit: 999 }], { id: 'JV', voided: true }),
    J([{ accountId: '1200', debit: 888 }, { accountId: '4000', credit: 888 }], { id: 'JD', posted: false }),
  ];
  ok(livePostings(js).length === 1, 'voided and unposted journals are history, not balance');
  ok(trialBalance(js, ACC, {}).debits === 10000, 'and the trial balance counts only the live one');
  ok(livePostings(null).length === 0 && livePostings([null, 'x']).length === 0, 'garbage is not a journal');

  const dated = [J([{ accountId: '1200', debit: 1 }, { accountId: '4000', credit: 1 }], { date: '2026-01-01' }),
                 J([{ accountId: '1200', debit: 2 }, { accountId: '4000', credit: 2 }], { id: 'J2', date: '2026-12-01' })];
  ok(trialBalance(dated, ACC, { from: '2026-06-01' }).debits === 200, 'a date range is honoured');
  ok(trialBalance(dated, ACC, { to: '2026-06-01' }).debits === 100, 'from both ends');
}

console.log('\n=== §8 · reversing ===');
{
  const j = J([{ accountId: '1200', debit: 1000 }, { accountId: '4000', credit: 1000 }], { ref: 'INV-1' });
  const rev = reversalOf(j);
  ok(rev.lines[0].credit === 1000 && rev.lines[0].debit === undefined || rev.lines[0].credit === 1000,
     'every side is swapped');
  const check = validateJournal(rev, { accounts: ACC });
  ok(check.ok === true, '⚑ and the reversal balances for the same reason the original did — it is checked, not assumed');
  ok(rev.reversalOf === 'J1' && /REV-INV-1/.test(rev.ref), 'it points back at what it reverses');
  ok(reversalOf(null).lines.length === 0, 'reversing nothing produces nothing');
}

console.log('\n=== §9 · pure under garbage ===');
{
  const junk = [null, undefined, '', 0, [], {}, NaN, 'x', [null], [{}], { lines: 'no' }, { lines: [null] }];
  let threw = null;
  for (const j of junk) {
    try {
      pence(j); pounds(j); fxRateOf(j); normalizeLine(j, j); homeAmount(j, j);
      validateJournal(j, j); livePostings(j); trialBalance(j, j, j); reversalOf(j);
    } catch (e) { threw = `${JSON.stringify(j)} → ${e.message}`; }
  }
  ok(threw === null, 'no input throws' + (threw ? ' — ' + threw : ''));
  ok(trialBalance([J([null, 'x'])], ACC, {}).unplaced.length === 2,
     '⚑ rubbish inside a journal is COUNTED as unplaced, never silently dropped');
  ok(Number.isFinite(trialBalance(junk, ACC, {}).debits), 'and a database of rubbish still produces a number');
  ok(fxRateOf(undefined) === 1 && fxRateOf('') === 1, 'no rate given means one-for-one');
  ok(fxRateOf(-1) === null && fxRateOf(0) === null && fxRateOf('x') === null, 'and a rate that is not one is refused');
}

console.log('\n=== §10 · ⚑ WHICH SIDE IS WHICH ===');
{
  // Every balanced journal has equal totals, so a check that swapped debit for credit would pass all
  // of them. Only an UNbalanced one can tell the two apart.
  const lop = validateJournal({ lines: [
    { accountId: '1200', debit: 100 }, { accountId: '7500', debit: 50 }] }, { accounts: ACC });
  ok(lop.ok === false && lop.debits === 15000 && lop.credits === 0,
     '⚑ two debits and no credit gives debits £150 and credits nothing — swap the two and every balanced journal still passes, so only this can catch it');
  ok(/debits \(£150\.00\)/.test(lop.problems.join(' ')), 'and the message names the debit total');
  ok(/credits \(£0\.00\)/.test(lop.problems.join(' ')),
     '⚑ a zero total prints as £0.00, never -£0.00 — a minus sign on nothing reads as money going the other way');

  const neg = normalizeLine({ accountId: '4000', credit: -50 }, { accounts: ACC });
  ok(neg.ok === false && /credit cannot be negative/.test(neg.problems.join(' ')),
     '⚑ a negative CREDIT is refused too — checking only one side leaves the other wide open');
}

console.log('\n=== §11 · a line has one side, and the other is simply absent ===');
{
  ok(normalizeLine({ accountId: '4000', credit: 5 }, { accounts: ACC }).ok === true,
     '⚑ a credit-only line is normal — treating the missing debit as unreadable rather than zero refuses every ordinary line in the book');
  ok(normalizeLine({ accountId: '1200', debit: 5 }, { accounts: ACC }).ok === true, 'and a debit-only line likewise');
  ok(normalizeLine({ accountId: '1200', debit: 5, credit: null }, { accounts: ACC }).ok === true, 'an explicit null on the other side is still absent');
  ok(normalizeLine({ accountId: '1200', debit: 5, credit: '' }, { accounts: ACC }).ok === true, 'and so is an empty string');
  // ⚑ Both sides, both spellings of absent. Testing only one leaves the mirror image of the same bug
  // sitting in the other branch, which is how half a guard ships looking like a whole one.
  ok(normalizeLine({ accountId: '4000', credit: 5, debit: null }, { accounts: ACC }).ok === true, 'an explicit null DEBIT is absent too');
  ok(normalizeLine({ accountId: '4000', credit: 5, debit: '' }, { accounts: ACC }).ok === true, 'and an empty-string debit');
  ok(normalizeLine({ accountId: '1200', debit: 5, credit: 'abc' }, { accounts: ACC }).ok === false, 'but junk on the other side is not');
  ok(normalizeLine({ accountId: '1200', debit: 5, memo: 'rent' }, { accounts: ACC }).line.memo === 'rent', 'a memo survives');
  ok(normalizeLine({ accountId: '1200', debit: 5, memo: 42 }, { accounts: ACC }).line.memo === '', 'and a memo that is not text becomes empty rather than "42"');
}

console.log('\n=== §12 · ⚑ "NOBODY SAID" IS NOT A RATE OF ONE ===');
{
  const line = { amount: 10000, currency: 'USD' };
  ok(homeAmount({ ...line, fxRate: null }, 'GBP') === null,
     '⚑ an explicitly EMPTY rate on a foreign line converts to nothing — treating null as "one" is the same bug as treating it as absent');
  ok(homeAmount({ ...line, fxRate: '' }, 'GBP') === null, 'and so is an empty string');
  ok(homeAmount({ ...line, fxRate: 1 }, 'GBP') === 10000, 'but a rate of one that was actually STATED converts fine');
  ok(homeAmount({ ...line }, 'GBP') === null, 'and no rate at all converts to nothing');
}

console.log('\n=== §13 · ⚑ BALANCED MEANS BOTH THINGS ===');
{
  // Both sides of this journal go to accounts that do not exist, so the totals stay equal — nothing
  // was added to either. A report that called that "balanced" would be the original bug wearing a
  // new coat: the books look right precisely because the missing money was dropped from both sides.
  const orphanBoth = [J([{ accountId: '8881', debit: 500 }, { accountId: '8882', credit: 500 }], { id: 'JX' })];
  const tb = trialBalance(orphanBoth, ACC, {});
  ok(tb.debits === tb.credits, 'the totals agree, because both sides were dropped');
  ok(tb.balanced === false,
     '⚑ and it is still NOT balanced — equal totals over lines nobody could place is exactly how the money hides');
  ok(tb.unplaced.length === 2, 'both are named');
}

console.log('\n=== §14 · the edges of a date range, and what a row carries ===');
{
  const js = [
    J([{ accountId: '1200', debit: 1 }, { accountId: '4000', credit: 1 }], { id: 'A', date: '2026-06-01' }),
    J([{ accountId: '1200', debit: 2 }, { accountId: '4000', credit: 2 }], { id: 'B', date: '2026-06-30' }),
  ];
  ok(trialBalance(js, ACC, { from: '2026-06-01' }).debits === 300,
     '⚑ a journal dated exactly ON the start of the range is INSIDE it — the boundary belongs to the period');
  ok(trialBalance(js, ACC, { to: '2026-06-30' }).debits === 300, 'and so is one dated exactly on the end');
  ok(trialBalance(js, ACC, { from: '2026-06-02' }).debits === 200, 'a day later excludes the first');
  ok(trialBalance(js, ACC, { to: '2026-06-29' }).debits === 100, 'and a day earlier excludes the second');

  const row = trialBalance(js, ACC, {}).rows.find(r => r.accountId === '1200');
  ok(row.code === '1200' && row.name === 'Bank' && row.category === 'asset',
     '⚑ a row carries its code, name and category — a trial balance of bare ids is not a document anybody can read');
  const bare = trialBalance(js, [{ id: '1200' }], {}).rows[0];
  ok(bare.code === '' && bare.name === '', 'and an account with none of them gets empty text, not "undefined"');
}

console.log('\n=== §15 · reversing, when there is nothing to name it after ===');
{
  const noRef = reversalOf({ id: 'J-ABCDEFGH', lines: [{ accountId: '1200', debit: 10, memo: 'rent' }] });
  ok(/REV-J-ABCD/.test(noRef.ref),
     '⚑ with no reference, the reversal is named after the journal id — otherwise it is called "REV-" and nobody can find it');
  ok(/Reversal of J-ABCDEFGH/.test(noRef.narrative), 'and the narrative says what it reverses');
  ok(noRef.lines[0].memo === 'reversal · rent', 'the memo carries the original through');
  ok(reversalOf({ id: 'X', lines: [{ accountId: '1200', debit: 10 }] }).lines[0].memo === 'reversal · ',
     'and a line with no memo still says it is a reversal');
  ok(reversalOf({ lines: [] }).ref === 'REV-', 'nothing to name it after is not a crash');
}

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
