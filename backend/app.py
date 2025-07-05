import pandas as pd
from flask import Flask, request, jsonify, render_template, send_file
from flask_cors import CORS
import os
import requests
import io
import sys
from dotenv import load_dotenv

# NEW: Import Whoosh modules
from whoosh.index import open_dir
from whoosh.qparser import QueryParser

load_dotenv()

# --- Path Correction ---
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
STATIC_FOLDER = os.path.join(PROJECT_ROOT, 'static')
TEMPLATE_FOLDER = os.path.join(PROJECT_ROOT, 'templates')

# --- Flask App Initialization ---
app = Flask(__name__,
            static_folder=STATIC_FOLDER,
            template_folder=TEMPLATE_FOLDER)
CORS(app)

# --- Configuration ---
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID')
DATA_FILE = os.path.join(PROJECT_ROOT, 'data', 'processed_testers_data.csv')

# NEW: Search Index Configuration
SEARCH_INDEX_DIR = os.path.join(PROJECT_ROOT, 'search_index')
SEARCH_INDEX_NAME = 'main' # This name MUST match what's in build_search_index.py

# In-memory data store
testers_data_by_jig_and_so = {}

def load_data():
    """
    Loads and cleans processed data.
    """
    global testers_data_by_jig_and_so
    testers_data_by_jig_and_so = {}
    try:
        df = pd.read_csv(DATA_FILE)

        # Data Sanitization
        string_cols = ['availability_status', 'status', 'part_number', 'unitName', 'officialIncharge', 'tester_jig_number', 'sale_order', 'testerId', 'top_assy_no']
        for col in string_cols:
            if col in df.columns:
                df[col] = df[col].fillna('N/A')
        df[string_cols] = df[string_cols].astype(str)

        numeric_cols = ['requiredQuantity', 'currentStock', 'p_factor', 'recommendedQuantity']
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0).astype(int)
        
        for (jig, so), group in df.groupby(['tester_jig_number', 'sale_order']):
            jig_str, so_str = str(jig), str(so)
            if jig_str not in testers_data_by_jig_and_so:
                testers_data_by_jig_and_so[jig_str] = {}
            testers_data_by_jig_and_so[jig_str][so_str] = group.to_dict('records')
            
        print(f"Data loaded and sanitized successfully. {len(testers_data_by_jig_and_so)} unique jig numbers found.")
        
    except FileNotFoundError:
        print(f"ERROR: Data file not found at {DATA_FILE}. The build script may have failed. Please run transform_data.py")
    except Exception as e:
        print(f"An error occurred during data loading: {e}")

# Load data on application startup
load_data()

# --- API Routes ---

@app.route('/')
def serve_index():
    return render_template('index.html')

@app.route('/api/jig_details', methods=['GET'])
def get_jig_details():
    jig_number = request.args.get('jig_number')
    if not jig_number:
        return jsonify({'message': 'Jig number is required.'}), 400

    jig_data = testers_data_by_jig_and_so.get(jig_number)
    if not jig_data:
        return jsonify({'message': f'No details found for Jig Number: {jig_number}. Please check the number.'}), 404

    sale_orders = sorted(list(jig_data.keys()))
    first_record = next(iter(jig_data.values()))[0]

    response_data = {
        'testerId': first_record.get('testerId', 'N/A'),
        'tester_jig_number': first_record.get('tester_jig_number', 'N/A'),
        'sale_orders': sale_orders,
        'top_assy_no': first_record.get('top_assy_no', 'N/A'),
        'officialIncharge': first_record.get('officialIncharge', 'N/A'),
        'status': first_record.get('status', 'Status Unknown')
    }
    return jsonify(response_data)

@app.route('/api/all_parts_for_jig', methods=['GET'])
def get_all_parts_for_jig():
    jig_number = request.args.get('jig_number')
    if not jig_number:
        return jsonify({'message': 'Jig number is required.'}), 400
        
    jig_data = testers_data_by_jig_and_so.get(jig_number)
    if not jig_data:
        return jsonify([])

    all_parts = [part for parts_list in jig_data.values() for part in parts_list]
    return jsonify(all_parts)

@app.route('/api/recommend_purchase', methods=['GET'])
def recommend_purchase():
    jig_number = request.args.get('jig_number')
    sale_order = request.args.get('sale_order') 
    
    if not jig_number:
        return jsonify({'message': 'Jig number is required for purchase recommendation.'}), 400

    jig_data = testers_data_by_jig_and_so.get(jig_number)
    if not jig_data:
        return jsonify({'message': 'Jig not found.'}), 404

    parts_to_process = []
    if sale_order and sale_order in jig_data:
        parts_to_process = jig_data[sale_order]
    else:
        for so_parts in jig_data.values():
            parts_to_process.extend(so_parts)

    recommended_parts = []
    MIN_BUFFER = 5 

    for part in parts_to_process:
        req_qty = part.get('requiredQuantity', 0)
        curr_stock = part.get('currentStock', 0)
        p_factor = part.get('p_factor', 0) 

        needed_qty = max(0, req_qty - curr_stock)
        
        recommended_qty = int(needed_qty * (1 + p_factor / 100)) + MIN_BUFFER
        
        recommended_qty = max(0, recommended_qty)

        part_copy = part.copy() 
        part_copy['recommendedQuantity'] = recommended_qty
        recommended_parts.append(part_copy)
    
    return jsonify(recommended_parts)

@app.route('/api/download_recommended_excel', methods=['GET'])
def download_recommended_excel():
    jig_number = request.args.get('jig_number')
    sale_order = request.args.get('sale_order') 
    
    if not jig_number:
        return jsonify({'message': 'Jig number is required for download.'}), 400

    jig_data = testers_data_by_jig_and_so.get(jig_number)
    if not jig_data:
        return jsonify({'message': 'Jig not found.'}), 404

    parts_to_process = []
    if sale_order and sale_order in jig_data:
        parts_to_process = jig_data[sale_order]
    else:
        for so_parts in jig_data.values():
            parts_to_process.extend(so_parts)

    # Perform the recommendation calculation for the Excel download
    recommended_parts_for_excel = []
    MIN_BUFFER = 5 

    for part in parts_to_process:
        req_qty = part.get('requiredQuantity', 0)
        curr_stock = part.get('currentStock', 0)
        p_factor = part.get('p_factor', 0)

        needed_qty = max(0, req_qty - curr_stock)
        recommended_qty = int(needed_qty * (1 + p_factor / 100)) + MIN_BUFFER
        recommended_qty = max(0, recommended_qty)

        part_copy = part.copy()
        part_copy['recommendedQuantity'] = recommended_qty
        recommended_parts_for_excel.append(part_copy)

    df = pd.DataFrame(recommended_parts_for_excel)
    
    excel_cols_order = [
        'tester_jig_number', 'sale_order', 'part_number', 'unitName', 
        'requiredQuantity', 'currentStock', 'p_factor', 'recommendedQuantity', 
        'availability_status', 'status' 
    ]
    
    for col in excel_cols_order:
        if col not in df.columns:
            if col in ['requiredQuantity', 'currentStock', 'p_factor', 'recommendedQuantity']:
                df[col] = 0
            else:
                df[col] = 'N/A'
    df = df[excel_cols_order]

    output = io.BytesIO()
    df.to_excel(output, index=False, sheet_name='Recommended_Purchase')
    output.seek(0)

    filename = f'HAL_Recommended_Purchase_{jig_number}'
    if sale_order:
        filename += f'_{sale_order}'
    filename += '.xlsx'

    return send_file(
        output,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        download_name=filename,
        as_attachment=True
    )


@app.route('/api/download_all_parts_excel', methods=['GET'])
def download_all_parts():
    tester_jig_number = request.args.get('jig_number')
    if not tester_jig_number:
        return jsonify({'message': 'Jig number is required'}), 400

    jig_data = testers_data_by_jig_and_so.get(tester_jig_number)
    if not jig_data:
        return jsonify({'message': 'Jig not found'}), 404

    all_parts = [part for so_parts in jig_data.values() for part in so_parts]
    df = pd.DataFrame(all_parts)
    
    df_cols_order = ['tester_jig_number', 'sale_order', 'part_number', 'unitName', 
                     'requiredQuantity', 'currentStock', 'availability_status', 
                     'p_factor', 'recommendedQuantity', 'status', 'testerId', 'top_assy_no', 'officialIncharge']
    
    for col in df_cols_order:
        if col not in df.columns:
            if col in ['requiredQuantity', 'currentStock', 'p_factor', 'recommendedQuantity']:
                df[col] = 0
            else:
                df[col] = 'N/A'
    df = df[df_cols_order]

    output = io.BytesIO()
    df.to_excel(output, index=False, sheet_name='All_Parts_List')
    output.seek(0)

    return send_file(
        output,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        download_name=f'HAL_All_Parts_{tester_jig_number}.xlsx',
        as_attachment=True
    )

# NEW: Search documentation endpoint
@app.route('/api/search_docs', methods=['GET'])
def search_documentation():
    query_str = request.args.get('query', '')
    if not query_str:
        return jsonify({'message': 'Search query is required.'}), 400

    results_list = []
    # Ensure the search index directory exists before trying to open it
    if not os.path.exists(SEARCH_INDEX_DIR):
        print(f"Search documentation error: Index directory not found at {SEARCH_INDEX_DIR}. Please run build_search_index.py")
        return jsonify({'message': 'Error: Search index not built.', 'error': 'Index directory missing.'}), 500

    try:
        # Open the named index
        ix = open_dir(SEARCH_INDEX_DIR, indexname=SEARCH_INDEX_NAME)
        with ix.searcher() as searcher:
            query_parser = QueryParser("content", ix.schema)
            query = query_parser.parse(query_str)
            
            results = searcher.search(query, limit=10) # Limit to 10 results for example

            for hit in results:
                results_list.append({
                    'filename': hit['filename'],
                    'page_num': hit['page_num'],
                    'snippet': hit.highlights("content") 
                })

    except Exception as e:
        print(f"Search documentation error: {e}")
        # Return a more informative error for debugging
        return jsonify({'message': 'Error performing search.', 'error': str(e)}), 500

    return jsonify(results_list)

@app.route('/api/send_telegram_alert', methods=['POST'])
def send_telegram_alert_route():
    data = request.get_json()
    message = data.get('message')
    if not message:
        return jsonify({'message': 'Message content is required.'}), 400
    
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return jsonify({'message': 'Telegram is not configured on the server.'}), 500

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {'chat_id': TELEGRAM_CHAT_ID, 'text': message, 'parse_mode': 'Markdown'}
    
    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
        return jsonify({'message': 'Telegram alert sent successfully!'}), 200
    except requests.exceptions.RequestException as e:
        print(f"Telegram API error: {e}")
        return jsonify({'message': 'Failed to send Telegram alert.'}), 500

# --- Main Execution ---
if __name__ == '__main__':
    app.run(debug=True, port=5001)