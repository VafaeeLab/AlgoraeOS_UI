"""
Build AlgoraeOS data from the aggregated prediction CSV.

Outputs
  1. api/database/synergy.db   SQLite table `synergy_scores` (used by server.py, local only)
  2. data/index.json           drug + cell line lookup for the static site
  3. data/b/<n>.json           Drug 1 data grouped into 64 files (n = CID % 64)

The static files let the GitHub Pages site work with no server.

Usage
  python scripts/build_data.py PREDICTIONS.csv Drugs.csv cell_lines.csv
"""
import csv
import json
import os
import sqlite3
import sys
from collections import defaultdict

csv.field_size_limit(10**9)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
METRICS = ['Bliss', 'Loewe', 'HSA', 'ZIP']
DECIMALS = 3
BUCKETS = 64


def load_drugs(path):
    """PubChem CID -> drug name."""
    names = {}
    with open(path, encoding='utf-8') as fh:
        for r in csv.DictReader(fh):
            try:
                cid = int(float(r['cid']))
            except (TypeError, ValueError):
                continue
            name = (r['dname'] or '').strip()
            if cid > 0 and name and name.upper() != 'NULL':
                names.setdefault(cid, name)
    return names


def load_cell_lines(path):
    """DrugComb cell line id -> name."""
    with open(path, encoding='utf-8') as fh:
        return {int(r['id']): r['name'].strip() for r in csv.DictReader(fh)}


def to_cid(value):
    f = float(value)
    return int(f) if f.is_integer() and f > 0 else None  # damaged ids look like 1.3541


def num(v):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return None if x != x else x  # NaN -> None


def main(pred_path, drugs_path, cells_path):
    drug_names = load_drugs(drugs_path)
    cell_names = load_cell_lines(cells_path)

    # (cid1, cid2, cell_id) -> running sums so repeated folds are averaged
    acc = {}
    skipped_ids, skipped_rows, total = set(), 0, 0
    with open(pred_path, encoding='utf-8') as fh:
        for r in csv.DictReader(fh):
            total += 1
            c1, c2 = to_cid(r['drug_1']), to_cid(r['drug_2'])
            cell = int(float(r['cell_line']))
            bad = [r[k] for k, c in (('drug_1', c1), ('drug_2', c2)) if c is None or c not in drug_names]
            if bad or cell not in cell_names:
                skipped_ids.update(bad)
                skipped_rows += 1
                continue
            vals = []
            for m in METRICS:
                vals += [num(r[f'Prediction_label_{m}']), num(r[f'{m}_Total_Uncertainty']),
                         num(r[f'Ground_Truth_label_{m}'])]
            key = (c1, c2, cell)
            if key not in acc:
                acc[key] = [[0.0, 0] for _ in vals]
            for slot, v in zip(acc[key], vals):
                if v is not None:
                    slot[0] += v
                    slot[1] += 1

    print(f'rows read: {total:,}  combinations: {len(acc):,}  rows skipped: {skipped_rows:,}')
    if skipped_ids:
        print(f'unmappable drug ids ({len(skipped_ids)}): {sorted(skipped_ids)}')

    def mean(slot):
        return round(slot[0] / slot[1], DECIMALS) if slot[1] else None

    # ---- 1. SQLite ---------------------------------------------------------
    db_path = os.path.join(ROOT, 'api', 'database', 'synergy.db')
    if os.path.exists(db_path):
        os.remove(db_path)
    con = sqlite3.connect(db_path)
    con.execute("""CREATE TABLE synergy_scores (
        drug_1 TEXT, drug_2 TEXT, drug_1_cid INTEGER, drug_2_cid INTEGER, cell_line TEXT,
        bliss REAL, loewe REAL, hsa REAL, zip REAL,
        bliss_uncertainty REAL, loewe_uncertainty REAL, hsa_uncertainty REAL, zip_uncertainty REAL,
        bliss_gt REAL, loewe_gt REAL, hsa_gt REAL, zip_gt REAL)""")
    rows = []
    shards = defaultdict(lambda: defaultdict(dict))
    cells_used = sorted({k[2] for k in acc}, key=lambda c: cell_names[c].lower())
    cell_idx = {c: i for i, c in enumerate(cells_used)}
    for (c1, c2, cell), slots in acc.items():
        v = [mean(s) for s in slots]  # per metric: pred, unc, gt
        pred, unc, gt = v[0::3], v[1::3], v[2::3]
        rows.append((drug_names[c1], drug_names[c2], c1, c2, cell_names[cell], *pred, *unc, *gt))
        shards[c1][c2][cell_idx[cell]] = pred + unc + gt
    con.executemany('INSERT INTO synergy_scores VALUES (' + ','.join('?' * 17) + ')', rows)
    con.execute('CREATE INDEX idx_triplet ON synergy_scores(drug_1, drug_2, cell_line)')
    con.execute('CREATE INDEX idx_triplet_cid ON synergy_scores(drug_1_cid, drug_2_cid, cell_line)')
    con.commit()
    con.close()
    print(f'wrote {db_path}')

    # ---- 2/3. Static JSON --------------------------------------------------
    out = os.path.join(ROOT, 'data')
    shard_dir = os.path.join(out, 'b')
    os.makedirs(shard_dir, exist_ok=True)
    for f in os.listdir(shard_dir):
        os.remove(os.path.join(shard_dir, f))

    used = {c for k in acc for c in k[:2]}
    drugs = sorted(([drug_names[c], c, c in shards] for c in used), key=lambda d: d[0].lower())
    index = {
        'metrics': ['bliss', 'loewe', 'hsa', 'zip'],
        'row_format': 'pred[bliss,loewe,hsa,zip] + total_uncertainty[...] + ground_truth[...]',
        'cell_lines': [cell_names[c] for c in cells_used],
        # [name, pubchem_cid, has_shard (appears as Drug 1)]
        'drugs': [[n, c, int(h)] for n, c, h in drugs],
        'combinations': len(acc),
        'buckets': BUCKETS,  # Drug 1 with CID c lives in data/b/<c % buckets>.json
    }
    with open(os.path.join(out, 'index.json'), 'w', encoding='utf-8') as fh:
        json.dump(index, fh, separators=(',', ':'), ensure_ascii=False)
    # Few files so the site can also be uploaded through the GitHub website (max 100 per upload).
    buckets = defaultdict(dict)
    for c1, partners in shards.items():
        buckets[c1 % BUCKETS][str(c1)] = {str(c2): {str(i): v for i, v in cells.items()}
                                          for c2, cells in partners.items()}
    for b, content in buckets.items():
        with open(os.path.join(shard_dir, f'{b}.json'), 'w', encoding='utf-8') as fh:
            json.dump(content, fh, separators=(',', ':'))
    print(f'wrote data/index.json and {len(buckets)} bucket files in data/b/')


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
