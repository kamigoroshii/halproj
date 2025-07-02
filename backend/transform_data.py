import pandas as pd
from flask import Flask, request, jsonify, render_template, send_file
from flask_cors import CORS
import os
import requests
import io
import sys
from dotenv import load_dotenv

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

# In-memory data store
testers_data_by_jig_and_so = {}

def load_data():
    """
    Loads and cleans processed data, grouping it by tester_jig_number and sale_order.
    """
    global testers_data_by_jig_and_so
    testers_data_by_jig_and_so = {}
    try:
        df = pd.read_csv(DATA_FILE)

        # --- Data Sanitization ---
        string_cols = ['availability_status', 'status', 'part_number', 'unitName', 'officialIncharge', 'tester_jig_number', 'sale_order', 'testerId', 'top_assy_no']
        for col in string_cols:
            if col in df.columns:
                df[col] = df[col].fillna('N/A') # Use N/A for clarity
        df[string_cols] = df[string_cols].astype(str)

        numeric_cols = ['requiredQuantity', 'currentStock']
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0).astype(int)
        
        for (jig, so), group in df.groupby(['tester_jig_number', 'sale_order']):
            jig_str = str(jig)
            so_str = str(so)
            if jig_str not in testers_data_by_jig_and_so:
                testers_data_by_jig_and_so[jig_str] = {}
            
            testers_data_by_jig_and_so[jig_str][so_str] = group.to_dict('records')
            
        print(f"Data loaded and sanitized successfully. {len(testers_data_by_jig_and_so)} unique jig numbers found.")
        
    except FileNotFoundError:
        print(f"ERROR: Data file not found at {DATA_FILE}. The build script may have failed.")
    except Exception as e:
        print(f"An error occurred during data loading: {e}")

load_data()

# --- API Routes (Restored to original structure) ---

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

@app.route('/api/shortage_list', methods=['GET'])
def get_shortage_list():
    jig_number = request.args.get('jig_number')
    sale_order = request.args.get('sale_order')

    if not jig_number or not sale_order:
        return jsonify({'message': 'Jig number and sale order are required.'}), 400

    parts_list = testers_data_by_jig_and_so.get(jig_number, {}).get(sale_order)
    if not parts_list:
        return jsonify({'message': f'No parts list found for Jig: {jig_number} and Sale Order: {sale_order}.'}), 404

    shortage_list = [p for p in parts_list if str(p.get('availability_status')).lower() == 'shortage']
    return jsonify(shortage_list)

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
    df = df[['tester_jig_number', 'sale_order', 'part_number', 'unitName', 'requiredQuantity', 'currentStock', 'availability_status', 'status']]
    
    output = io.BytesIO()
    df.to_excel(output, index=False, sheet_name='All_Parts_List')
    output.seek(0)

    return send_file(
        output,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        download_name=f'HAL_All_Parts_{tester_jig_number}.xlsx',
        as_attachment=True
    )

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
