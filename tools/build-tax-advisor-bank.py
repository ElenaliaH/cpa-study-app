"""Build local preview banks from immutable source ZIPs and reviewed corrections."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import re
import runpy

ROOT = Path(__file__).resolve().parents[1]
HELPERS = runpy.run_path(str(ROOT / 'tools' / 'inspect-tax-advisor.py'))
OUTPUT = ROOT / 'work' / 'tax-advisor-bank'


def number(question):
    return int(question.get('number', question.get('question_no')))


def children(question):
    return question.get('sub_questions', question.get('subquestions', []))


def part_number(question):
    return int(str(question['no']).strip('()（）'))


def options_for(question):
    options = question.get('options', {})
    return dict(options) if isinstance(options, dict) else {o['label']: o['text'] for o in options}


def encode(data):
    return json.dumps(data, ensure_ascii=False, indent=2) + '\n'


def correct(subject, original):
    source = copy.deepcopy(original)
    manifest = json.loads((ROOT / 'tools' / f'tax{subject}-source-corrections.json').read_text(encoding='utf-8'))
    by_number = {number(q): q for q in source['questions']}
    audit = []
    for fix in manifest['corrections']:
        target = by_number[fix['number']]
        if 'part' in fix:
            target = next(c for c in children(target) if part_number(c) == fix['part'])
        changes = {}
        for field in ('stem', 'explanation', 'question_type', 'options'):
            if field not in fix:
                continue
            before = copy.deepcopy(target.get(field))
            if field == 'options':
                options = options_for(target)
                options.update(fix[field])
                target[field] = (options if subject == 2 else
                                 [{'label': k, 'text': v} for k, v in sorted(options.items())])
            else:
                target[field] = fix[field]
            changes[field] = {'before': before, 'after': target[field]}
        audit.append({'number': fix['number'], 'part': fix.get('part'),
                      'source': manifest['source'], 'pages': fix['pages'], 'changes': changes})
    return source, audit


def build(subject):
    original = HELPERS['load_source'](subject)
    source, audit = correct(subject, original)
    roman = 'i' if subject == 1 else 'ii'
    bank_id = f'tax-advisor-tax-law-{roman}-550-2026'
    source_file = f'必刷550题 税法{subject}.pdf'
    chapters = []
    chapter_map = {}
    questions = []
    issues = []
    for parent in source['questions']:
        title = parent['chapter']
        if title not in chapter_map:
            chapter = {'id': f'{bank_id}-chapter-{len(chapters) + 1:02d}',
                       'order': len(chapters) + 1, 'title': title, 'questionCount': 0,
                       'subjectiveQuestionCount': 0, 'originalQuestionCount': 0}
            chapters.append(chapter)
            chapter_map[title] = chapter
        chapter = chapter_map[title]
        chapter['originalQuestionCount'] += 1
        parts = children(parent)
        parent_stem = parent['stem'].strip()
        # Some OCR records repeat child prompts after this explicit source boundary.
        # Retain the shared material once; the intact original remains in the source copy.
        if parts and subject == 2:
            boundary = re.search(r'要求[：:]\s*根据上述资料[，,]\s*回答下列问题[。.]', parent_stem)
            if boundary:
                parent_stem = parent_stem[:boundary.end()]
        for child in parts or [parent]:
            part = part_number(child) if parts else None
            qid = f'{bank_id}-q{number(parent):04d}' + (f'-{part}' if part else '')
            options = options_for(child)
            answer = str(child.get('answer', '')).strip()
            correct_answer = sorted(set(re.findall('[A-E]', answer)))
            explanation = child.get('explanation', child.get('analysis', '')).strip()
            if not explanation and parts:
                explanation = '【原题整组解析】\n' + parent.get('explanation', parent.get('analysis', '')).strip()
            stem = child['stem'].strip()
            if parts:
                stem = f'【公共材料 · 原题{number(parent)}】\n{parent_stem}\n\n【第{part}问】\n{stem}'
            qtype = 'multiple_choice' if (len(correct_answer) > 1 or
                (not parts and parent['question_type'] == '多项选择题')) else 'single_choice'
            item = {'id': qid, 'bankId': bank_id, 'chapterId': chapter['id'],
                    'sequenceNo': len(questions) + 1, 'questionType': qtype,
                    'sourceLabel': f'{source_file} · 原题{number(parent)}' +
                        (f'（{part}）· {parent["question_type"]}' if parts else ''),
                    'stem': stem, 'options': [{'label': k, 'text': str(v).strip()} for k, v in sorted(options.items())],
                    'correctAnswer': correct_answer, 'answerRaw': answer, 'explanation': explanation,
                    'sourceQuestionNo': number(parent), 'sourcePartNo': part,
                    'sourceQuestionType': parent['question_type'], 'sourceFile': source_file,
                    'sourcePdfPages': parent.get('source_pdf_pages', [parent.get('page')]),
                    'answerSourcePdfPages': parent.get('answer_source_pdf_pages', []),
                    'correctionPages': sorted({p for a in audit if a['number'] == number(parent)
                        and a['part'] in (None, part) for p in a['pages']})}
            problems = []
            if not stem or not child.get('stem', '').strip(): problems.append('empty_stem')
            if set(options) not in (set('ABCD'), set('ABCDE')): problems.append('invalid_option_labels')
            if any(not str(v).strip() for v in options.values()): problems.append('empty_option')
            if not re.fullmatch('[A-E]+', answer): problems.append('invalid_answer')
            if not set(correct_answer).issubset(options): problems.append('answer_missing_option')
            if not explanation or explanation == '【原题整组解析】': problems.append('empty_explanation')
            if not parts and qtype == 'multiple_choice' and len(options) != 5: problems.append('missing_E')
            if not parts and ((parent['question_type'] == '单项选择题') != (len(correct_answer) == 1)):
                problems.append('type_answer_mismatch')
            if problems: issues.append({'id': qid, 'problems': problems})
            item['contentHash'] = hashlib.sha256(encode(item).encode()).hexdigest()
            questions.append(item)
            chapter['questionCount'] += 1
    originals = [number(q) for q in source['questions']]
    if sorted(originals) != list(range(1, 551)): issues.append({'problems': ['original_number_coverage']})
    if len({q['id'] for q in questions}) != len(questions): issues.append({'problems': ['duplicate_ids']})
    archive = ROOT / '税务师题库' / '结构化题库' / f'税法{subject}_结构化JSON.zip'
    metadata = {'bankId': bank_id, 'examType': 'tax_advisor', 'subjectCode': f'tax_law_{roman}',
                'title': f'必刷550题 · 税法{"一" if subject == 1 else "二"}', 'editionYear': 2026,
                'originalQuestionCount': len(originals), 'questionCount': len(questions),
                'caseCount': sum(bool(children(q)) for q in source['questions']),
                'chapterCount': len(chapters), 'sourceFile': source_file,
                'sourceArchiveSha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
                'correctionEntries': len(audit),
                'correctedOriginals': len({a['number'] for a in audit}),
                'scope': 'local_preview_only',
                'reviewNote': '异常选项、题型与缺失小问解析已按原PDF核对；非全书逐字校对，原OCR个别字形或公式仍需复核。计算/综合题按客观小问计数。'}
    return {'metadata': metadata, 'chapters': chapters, 'questions': questions}, source, audit, issues


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true', help='Validate and compare outputs without writing')
    args = parser.parse_args()
    builds = [(subject, build(subject)) for subject in (1, 2)]
    errors = [{'subject': s, 'issues': b[3]} for s, b in builds if b[3]]
    if errors:
        print(encode(errors))
        raise SystemExit('Bank validation failed; outputs not written.')
    for subject, (bank, source, audit, _) in builds:
        roman = 'i' if subject == 1 else 'ii'
        outputs = {f'tax-law-{roman}.publishable.json': bank,
                   f'tax-law-{roman}.corrected-source.json': source,
                   f'tax-law-{roman}.audit.json': audit}
        for name, value in outputs.items():
            target = OUTPUT / name
            content = encode(value)
            if args.check:
                if not target.exists() or target.read_text(encoding='utf-8') != content:
                    raise SystemExit(f'Stale output: {name}')
            else:
                OUTPUT.mkdir(parents=True, exist_ok=True)
                target.write_text(content, encoding='utf-8')
        print(encode(bank['metadata']))


if __name__ == '__main__':
    main()
