from flask import Flask, jsonify, request
import sqlite3
import os

app = Flask(__name__)
DB_PATH = 'database/drugcomb.db'


@app.route('/api/drugs/search', methods=['GET'])
def search_drugs():
    query = request.args.get('q', '').lower()
    limit = request.args.get('limit', 20, type=int)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        SELECT DISTINCT drug_name 
        FROM drugs 
        WHERE LOWER(drug_name) LIKE ? 
        LIMIT ?
    """, (f'%{query}%', limit))

    results = [row[0] for row in cursor.fetchall()]
    conn.close()

    return jsonify(results)


@app.route('/api/synergy', methods=['GET'])
def get_synergy():
    drug1 = request.args.get('drug1')
    drug2 = request.args.get('drug2')
    cellline = request.args.get('cellline')

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        SELECT bliss, loewe, hsa, zip 
        FROM synergy_scores 
        WHERE drug_1 = ? AND drug_2 = ? AND cell_line = ?
    """, (drug1, drug2, cellline))

    result = cursor.fetchone()
    conn.close()

    if result:
        return jsonify({
            'bliss': result[0],
            'loewe': result[1],
            'hsa': result[2],
            'zip': result[3]
        })
    else:
        return jsonify({'error': 'Not found'}), 404


if __name__ == '__main__':
    app.run(debug=True)