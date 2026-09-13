"""Inspect source archives and render source PDF pages without modifying them."""
import argparse
import json
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / '税务师题库'


def load_source(subject):
    name = f'税法{subject}_结构化JSON.zip'
    member = 'all_questions.json' if subject == 1 else '必刷550题_税法2_结构化.json'
    with zipfile.ZipFile(SOURCE / '结构化题库' / name) as archive:
        return json.loads(archive.read(member))


def inspect():
    for subject in (1, 2):
        source = load_source(subject)
        issues = []
        for q in source['questions']:
            number = q.get('number', q.get('question_no'))
            children = q.get('sub_questions', q.get('subquestions', []))
            for child in children or [q]:
                options = child.get('options', {})
                labels = list(options) if isinstance(options, dict) else [o['label'] for o in options]
                answer = child.get('answer', '')
                if not labels or any(label not in labels for label in 'ABCD') or any(c not in labels for c in answer if c in 'ABCDEF'):
                    issues.append({'number': number, 'part': child.get('no'), 'kind': 'options', 'page': q.get('page', q.get('source_pdf_pages')), 'labels': labels, 'answer': answer})
                elif not children and q['question_type'] == '多项选择题' and 'E' not in labels:
                    issues.append({'number': number, 'kind': 'check_E', 'page': q.get('page', q.get('source_pdf_pages'))})
                if not child.get('explanation', child.get('analysis', '')) and not q.get('explanation', q.get('analysis', '')):
                    issues.append({'number': number, 'part': child.get('no'), 'kind': 'explanation', 'page': q.get('page', q.get('source_pdf_pages'))})
        print(json.dumps({'subject': subject, 'questions': len(source['questions']), 'issues': issues}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--pages', type=int, nargs='+')
    parser.add_argument('--subject', type=int, default=2)
    args = parser.parse_args()
    if args.pages:
        output = ROOT / 'work' / 'tax-advisor-review'
        output.mkdir(parents=True, exist_ok=True)
        for page in args.pages:
            prefix = output / f'tax{args.subject}-p{page}'
            if prefix.with_suffix('.png').exists():
                continue
            subprocess.run(['pdftoppm', '-f', str(page), '-l', str(page), '-scale-to', '2100', '-singlefile', '-png', str(SOURCE / '原始题库' / f'必刷550题 税法{args.subject}.pdf'), str(prefix)], check=True, capture_output=True)
            print(str(prefix) + '.png')
    else:
        inspect()
