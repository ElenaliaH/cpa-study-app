const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const output = path.join(__dirname, '..', 'work', 'workspace-tests');
fs.mkdirSync(output, { recursive: true });
const url = 'http://127.0.0.1:3000/?taxDemo=1&workspacePreview=1';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Isolated browser context with no production traffic or account data.
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById('workspaceLabel')?.textContent === 'CPA备考 · 2026');
    await page.locator('#workspaceSwitchButton').click();
    await page.locator('[data-workspace-id="demo-tax_advisor-2026"]').click();
    await page.waitForFunction(() => document.getElementById('workspaceLabel')?.textContent === '税务师备考 · 2026');
    await page.locator('[data-tab=tax]').click();
    await page.locator('[data-tax-chapter]').first().waitFor();
    assert.equal(await page.locator('[data-tax-chapter]').count(), 12);
    assert.equal(await page.locator('#practiceSubjectSelect').inputValue(), 'tax_law_i');
    await page.screenshot({ path: path.join(output, 'tax-law-i-desktop.png'), fullPage: true });

    await page.locator('[data-tax-chapter]').first().click();
    await page.locator('[data-tax-option]').first().waitFor();
    const first = await page.evaluate(async () => {
      const session = await TaxPracticeData.getLatestSession();
      return (await TaxPracticeData.getQuestions([session.question_ids[0]]))[0];
    });
    const wrong = first.options.find(o => !first.correct_answer.includes(o.label)).label;
    await page.locator(`[data-tax-option="${wrong}"]`).click();
    await page.locator('#taxSubmitBtn').click();
    await page.locator('#taxResultCard').waitFor();
    await page.locator('#taxFavoriteBtn').click();
    await page.locator('#taxNoteInput').fill('税法一独立笔记');
    await page.locator('#taxSaveNoteBtn').click();
    await page.waitForFunction(async id => (await TaxPracticeData.getQuestionState(id)).note === '税法一独立笔记', first.id);
    await page.locator('#taxOpenAnswerCardBtn').click();
    assert.match(await page.locator('#taxAnswerCardSummary').textContent(), /^1\s*\//);
    await page.locator('#taxCloseAnswerCardBtn').click();
    await page.reload();
    await page.locator('#taxResumeBtn').waitFor();

    await page.locator('#practiceSubjectSelect').selectOption('tax_law_ii');
    await page.waitForFunction(() => document.querySelectorAll('[data-tax-chapter]').length === 10);
    assert.equal(await page.locator('#taxResumeBtn').isVisible(), false);
    assert.equal(await page.evaluate(async () => (await TaxPracticeData.getCollection('favorite')).length), 0);
    assert.equal(await page.evaluate(async () => (await TaxPracticeData.getCollection('wrong')).length), 0);
    await page.locator('[data-tax-chapter]').first().click();
    await page.locator('[data-tax-option]').first().waitFor();
    const second = await page.evaluate(async () => {
      const session = await TaxPracticeData.getLatestSession();
      return (await TaxPracticeData.getQuestions([session.question_ids[0]]))[0];
    });
    assert.notEqual(first.id, second.id);
    for (const label of second.correct_answer) await page.locator(`[data-tax-option="${label}"]`).click();
    await page.locator('#taxSubmitBtn').click();
    await page.locator('#taxResultCard').waitFor();
    assert.equal((await page.evaluate(() => TaxPracticeData.getLatestSession())).correct_count, 1);
    const multi = await page.evaluate(async () => {
      const session = await TaxPracticeData.getLatestSession();
      const questions = await TaxPracticeData.getQuestions(session.question_ids);
      const index = questions.findIndex(q => q.question_type === 'multiple_choice');
      return { index, answer: questions[index].correct_answer };
    });
    await page.locator('#taxOpenAnswerCardBtn').click();
    await page.locator(`[data-tax-index="${multi.index}"]`).click();
    for (const label of multi.answer) await page.locator(`[data-tax-option="${label}"]`).click();
    assert.equal(await page.locator('[data-tax-option].selected').count(), multi.answer.length);
    await page.locator('#taxSubmitBtn').click();
    await page.locator('#taxResultCard').waitFor();
    const tax2Session = await page.evaluate(() => TaxPracticeData.getLatestSession());
    assert.equal(tax2Session.correct_count, 2);
    await page.reload();
    await page.locator('#taxResumeBtn').waitFor();
    await page.locator('#practiceSubjectSelect').selectOption('tax_law_i');
    await page.locator('#taxResumeBtn').waitFor();
    const restored = await page.evaluate(id => TaxPracticeData.getQuestionState(id), first.id);
    assert.equal(restored.note, '税法一独立笔记');
    assert.equal(restored.is_favorite, true);
    assert.equal(restored.is_in_wrong_book, true);
    assert.equal(restored.wrong_count, 1);
    assert.equal(await page.evaluate(async () => (await TaxPracticeData.getLatestSession()).answered_count), 1);
    assert.equal(await page.evaluate(async () => (await TaxPracticeData.getCollection('favorite')).length), 1);

    // A calculation case must retain shared material and grade each objective child.
    await page.locator('[data-tax-chapter]').nth(1).click();
    await page.locator('[data-tax-option]').first().waitFor();
    const caseIndex = await page.evaluate(async () => {
      const session = await TaxPracticeData.getLatestSession();
      const qs = await TaxPracticeData.getQuestions(session.question_ids);
      return qs.findIndex(q => q.source_label.includes('原题204（1）'));
    });
    assert.ok(caseIndex >= 0);
    await page.locator('#taxOpenAnswerCardBtn').click();
    await page.locator(`[data-tax-index="${caseIndex}"]`).click();
    await page.waitForFunction(() => document.getElementById('taxQuestionStem')?.textContent.includes('【第1问】'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'tax-law-i-case-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.reload();
    await page.locator('#practiceSubjectSelect').selectOption('tax_law_ii');
    await page.locator('[data-tax-chapter]').first().waitFor();
    await page.screenshot({ path: path.join(output, 'tax-law-ii-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.equal((await page.evaluate(() => TaxPracticeData.getLatestSession())).id, tax2Session.id);
    await page.locator('#practiceSubjectSelect').selectOption('tax_practice');
    await page.locator('#taxChapterList .task-empty').waitFor();
    assert.equal(await page.locator('#taxResumeBtn').isVisible(), false);
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS tax-advisor browser: chapter banks, submit, grading, answer card, refresh, independent progress/favorites/notes/wrong book, case context, desktop/mobile');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
