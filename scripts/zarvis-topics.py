#!/usr/bin/env python3
"""Topic distribution of Zarvis questions from the deploy log, for deciding which subjects deserve a zero-cost direct answer next.

Reads log lines from stdin (`railway logs ... | python3 scripts/zarvis-topics.py`), keeps the `zarvis.chat` records and prints, per topic label:
count, share, direct (local) versus model route split, failed answers and the median latency of completed answers. Standard library only.
The log carries no question text, so neither does this report; lines written before topic logging existed are counted as unlabelled.
"""
import argparse, json, statistics, sys
from collections import Counter, defaultdict

parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
parser.add_argument('--since', help='Keep records at or after this UTC day or instant (YYYY-MM-DD or ISO 8601).')
parser.add_argument('--until', help='Keep records before the end of this UTC day (YYYY-MM-DD) or before this instant (ISO 8601).')
parser.add_argument('--json', action='store_true', help='Print the report as JSON instead of a table.')
args = parser.parse_args()

def record(line):
    """The JSON object embedded in a log line, whatever the hosting prefix; None for anything that is not a zarvis.chat record."""
    start, end = line.find('{'), line.rfind('}')
    if start < 0 or end < start: return None
    try: entry = json.loads(line[start:end + 1])
    except ValueError: return None
    return entry if isinstance(entry, dict) and entry.get('event') == 'zarvis.chat' and isinstance(entry.get('at'), str) else None

def bound(value, end_of_day):
    """ISO strings compare lexicographically; a bare day becomes its first or last instant."""
    if value is None: return None
    return value + ('T23:59:59.999Z' if end_of_day else 'T00:00:00.000Z') if len(value) == 10 else value

since, until = bound(args.since, False), bound(args.until, True)
entries = [entry for entry in map(record, sys.stdin) if entry and (since is None or entry['at'] >= since) and (until is None or entry['at'] <= until)]
labelled = [entry for entry in entries if isinstance(entry.get('topic'), str)]
rejected = sum(1 for entry in entries if entry.get('route') == 'rejected')
unlabelled = len(entries) - len(labelled) - rejected
by_topic = defaultdict(list)
for entry in labelled: by_topic[entry['topic']].append(entry)
share = lambda part, whole: round(part / whole, 3) if whole else 0

def row(topic, group):
    local = sum(1 for entry in group if entry.get('route') == 'local')
    model = sum(1 for entry in group if entry.get('route') == 'model')
    failed = sum(1 for entry in group if entry.get('outcome') != 'completed')
    completed_ms = [entry['ms'] for entry in group if entry.get('outcome') == 'completed' and isinstance(entry.get('ms'), (int, float))]
    return {'topic': topic, 'count': len(group), 'share': share(len(group), len(labelled)), 'local': local, 'model': model, 'localShare': share(local, len(group)), 'modelShare': share(model, len(group)), 'failed': failed, 'medianMs': round(statistics.median(completed_ms)) if completed_ms else None}

rows = sorted((row(topic, group) for topic, group in by_topic.items()), key=lambda r: (-r['count'], r['topic']))
languages = Counter(entry['lang'] for entry in labelled if isinstance(entry.get('lang'), str))
by_language = {topic: dict(Counter(entry['lang'] for entry in group if isinstance(entry.get('lang'), str))) for topic, group in by_topic.items()}
period = {'from': min(entry['at'] for entry in entries), 'to': max(entry['at'] for entry in entries)} if entries else None
report = {'period': period, 'labelled': len(labelled), 'unlabelled': unlabelled, 'rejected': rejected, 'topics': rows, 'languages': dict(languages), 'byLanguage': by_language}

if args.json:
    print(json.dumps(report, indent=2, sort_keys=False))
    sys.exit(0)
if not entries:
    print('No zarvis.chat records in the input' + (' for that period.' if since or until else '.'))
    sys.exit(0)
print(f"Zarvis topics {period['from']} .. {period['to']}: {len(labelled)} labelled, {unlabelled} unlabelled (before topic logging), {rejected} rejected")
pct = lambda value: f'{value * 100:.1f}%'
print(f"{'topic':<20}{'count':>7}{'share':>8}{'direct':>8}{'model':>8}{'failed':>8}{'median ms':>11}")
for r in rows: print(f"{r['topic']:<20}{r['count']:>7}{pct(r['share']):>8}{pct(r['localShare']):>8}{pct(r['modelShare']):>8}{r['failed']:>8}{(r['medianMs'] if r['medianMs'] is not None else '-'):>11}")
if languages: print('languages: ' + ', '.join(f'{lang} {count}' for lang, count in languages.most_common()))
