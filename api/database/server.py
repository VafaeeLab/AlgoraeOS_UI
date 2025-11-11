from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
import os

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

DB_PATH = os.path.join(os.path.dirname(__file__), 'api', 'database', 'drugcomb.db')

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/api/health', methods=['GET'])
def health_check():
    """Check if API and database are accessible"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as count FROM synergy_scores")
        count = cursor.fetchone()['count']
        conn.close()
        return jsonify({'status': 'healthy', 'total_records': count})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/drugs/all', methods=['GET'])
def get_all_drugs():
    """Get all unique drugs from drug_1 column"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT drug_1 FROM synergy_scores ORDER BY drug_1")
        drugs = [row['drug_1'] for row in cursor.fetchall()]
        conn.close()
        return jsonify(drugs)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/drugs/search', methods=['GET'])
def search_drugs():
    """Search for drugs by query string"""
    query = request.args.get('q', '').strip()
    limit = request.args.get('limit', 20, type=int)
    
    if len(query) < 2:
        return jsonify([])
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Search in drug_1 column
        cursor.execute("""
            SELECT DISTINCT drug_1 
            FROM synergy_scores 
            WHERE LOWER(drug_1) LIKE LOWER(?) 
            ORDER BY drug_1
            LIMIT ?
        """, (f'%{query}%', limit))
        
        drugs = [row['drug_1'] for row in cursor.fetchall()]
        conn.close()
        return jsonify(drugs)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/drugs/partners', methods=['GET'])
def get_drug_partners():
    """Get all drug_2 options for a given drug_1"""
    drug1 = request.args.get('drug1', '').strip()
    
    if not drug1:
        return jsonify({'error': 'drug1 parameter required'}), 400
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT DISTINCT drug_2 
            FROM synergy_scores 
            WHERE drug_1 = ? 
            ORDER BY drug_2
        """, (drug1,))
        
        partners = [row['drug_2'] for row in cursor.fetchall()]
        conn.close()
        return jsonify(partners)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/celllines', methods=['GET'])
def get_celllines():
    """Get all cell lines for a drug combination"""
    drug1 = request.args.get('drug1', '').strip()
    drug2 = request.args.get('drug2', '').strip()
    
    if not drug1 or not drug2:
        return jsonify({'error': 'drug1 and drug2 parameters required'}), 400
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT DISTINCT cell_line 
            FROM synergy_scores 
            WHERE drug_1 = ? AND drug_2 = ? 
            ORDER BY cell_line
        """, (drug1, drug2))
        
        celllines = [row['cell_line'] for row in cursor.fetchall()]
        conn.close()
        return jsonify(celllines)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/synergy', methods=['GET'])
def get_synergy():
    """Get synergy scores for a specific drug combination and cell line"""
    drug1 = request.args.get('drug1', '').strip()
    drug2 = request.args.get('drug2', '').strip()
    cellline = request.args.get('cellline', '').strip()
    
    if not drug1 or not drug2 or not cellline:
        return jsonify({'error': 'drug1, drug2, and cellline parameters required'}), 400
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT drug_1, drug_2, cell_line, 
                   bliss, loewe, hsa, zip,
                   bliss_uncertainty, loewe_uncertainty, 
                   hsa_uncertainty, zip_uncertainty
            FROM synergy_scores 
            WHERE drug_1 = ? AND drug_2 = ? AND cell_line = ?
        """, (drug1, drug2, cellline))
        
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return jsonify(dict(row))
        else:
            return jsonify({'error': 'Combination not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/synergy/batch', methods=['POST'])
def get_synergy_batch():
    """Get synergy scores for multiple combinations"""
    data = request.get_json()
    
    if not data or 'queries' not in data:
        return jsonify({'error': 'queries array required in request body'}), 400
    
    queries = data['queries']
    results = []
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        for query in queries:
            drug1 = query.get('drug_1', '').strip()
            drug2 = query.get('drug_2', '').strip()
            cellline = query.get('cell_line', '').strip()
            
            if not drug1 or not drug2 or not cellline:
                results.append({
                    'drug_1': drug1,
                    'drug_2': drug2,
                    'cell_line': cellline,
                    'status': 'invalid',
                    'error': 'Missing required fields'
                })
                continue
            
            cursor.execute("""
                SELECT drug_1, drug_2, cell_line, 
                       bliss, loewe, hsa, zip,
                       bliss_uncertainty, loewe_uncertainty, 
                       hsa_uncertainty, zip_uncertainty
                FROM synergy_scores 
                WHERE drug_1 = ? AND drug_2 = ? AND cell_line = ?
            """, (drug1, drug2, cellline))
            
            row = cursor.fetchone()
            
            if row:
                result = dict(row)
                result['status'] = 'found'
                results.append(result)
            else:
                results.append({
                    'drug_1': drug1,
                    'drug_2': drug2,
                    'cell_line': cellline,
                    'status': 'not_found',
                    'bliss': None,
                    'loewe': None,
                    'hsa': None,
                    'zip': None
                })
        
        conn.close()
        return jsonify({'results': results})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Check if database exists
    if not os.path.exists(DB_PATH):
        print(f"ERROR: Database not found at {DB_PATH}")
        print("Please ensure drugcomb.db is in the api/database/ directory")
        exit(1)
    
    print(f"✓ Database found at {DB_PATH}")
    print("Starting Flask server...")
    app.run(debug=True, host='localhost', port=5000)