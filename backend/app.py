import pandas as pd
from flask import Flask, request, jsonify, render_template, send_file
from flask_cors import CORS
import os
import requests
import io
from dotenv import load_dotenv

# Load environment variables from a .env file for local development
load_dotenv()

# --- START OF PATH CORRECTION ---

# Get the directory where this script (app.py) is located (e.g., /.../backend)
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
# Get the project's root directory, which is one level up from the backend directory
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)

# --- Flask App Initialization for Production ---
# Point Flask to the correct 'static' and 'templates' folders at the project root
app = Flask(__name__,
            static_folder=os.path.join(PROJECT_ROOT, 'static'),
            template_folder=os.path.join(PROJECT_ROOT, 'templates'))

CORS(app)

# --- Environment Variables & Configuration ---
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID')

# Corrected data file path, pointing to the 'data' folder at the project root
DATA_FILE = os.path.join(PROJECT_ROOT, 'data', 'processed_testers_data.csv')

# --- END OF PATH CORRECTION ---


# In-memory data store
testers_data_by_jig_and_so = {}

def load_data():
    """
    Loads and cleans processed data, grouping it by tester_jig_number and sale_order.
    This version explicitly handles data types to prevent backend errors.
    """
    global testers_data_by_jig_and_so
    testers_data_by_jig_and_so = {} # Clear existing data
    try:
        df = pd.read_csv(DATA_FILE)

        # --- START OF DATA SANITIZATION FIX ---
        string_cols = ['availability_status', 'status', 'part_number', 'unitName', 'officialIncharge', 'tester_jig_number', 'sale_order', 'testerId', 'top_assy_no']
        for col in string_cols:
            if col in df.columns:
                df[col] = df[col].fillna('')
        df[string_cols] = df[string_cols].astype(str)

        numeric_cols = ['requiredQuantity', 'currentStock']
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0).astype(int)
        # --- END OF DATA SANITIZATION FIX ---

        for (jig, so), group in df.groupby(['tester_jig_number', 'sale_order']):
            jig_str = str(jig)
            so_str = str(so)
            if jig_str not in testers_data_by_jig_and_so:
                testers_data_by_jig_and_so[jig_str] = {}
            
            testers_data_by_jig_and_so[jig_str][so_str] = group.to_dict('records')
            
        print(f"Data loaded and sanitized successfully. {len(testers_data_by_jig_and_so)} unique jig numbers found.")
        
    except FileNotFoundError:
        print(f"ERROR: Data file not found at {DATA_FILE}. Make sure 'transform_data.py' has been run and succeeded.")
    except Exception as e:
        print(f"An error occurred during data loading: {e}")
        import traceback
        traceback.print_exc()

# Load data on application startup
load_data()


def send_telegram_message(message_text):
    """Sends a message to the configured Telegram chat."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("Telegram environment variables not set. Skipping alert.")
        return False
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        'chat_id': TELEGRAM_CHAT_ID,
        'text': message_text,
        'parse_mode': 'Markdown'
    }
    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
        print("Telegram alert sent successfully!")
        return True
    except requests.exceptions.RequestException as e:
        print(f"Failed to send Telegram message: {e}")
        return False

# --- API Routes ---

@app.route('/')
def serve_index():
    """Serves the main HTML page from the 'templates' folder."""
    return render_template('index.html')

@app.route('/api/jig_details', methods=['GET'])
def get_jig_details():
    """Returns high-level details for a given jig number."""
    jig_number = request.args.get('jig_number')
    if not jig_number:
        return jsonify({'message': 'Jig number is required.'}), 400

    jig_data = testers_data_by_jig_and_so.get(jig_number)
    if not jig_data:
        return jsonify({'message': f'No details found for Jig Number: {jig_number}. Please check the number.'}), 404

    sale_orders = list(jig_data.keys())
    first_record = next(iter(jig_data.values()))[0]

    response_data = {
        'testerId': first_record.get('testerId'),
        'tester_jig_number': first_record.get('tester_jig_number'),
        'sale_orders': sale_orders,
        'top_assy_no': first_record.get('top_assy_no'),
        'officialIncharge': first_record.get('officialIncharge'),
        'status': first_record.get('status')
    }
    return jsonify(response_data)

@app.route('/api/shortage_list', methods=['GET'])
def get_shortage_list():
    """Returns a list of parts with a 'Shortage' status for a specific jig and sale order."""
    jig_number = request.args.get('jig_number')
    sale_order = request.args.get('sale_order')

    if not jig_number or not sale_order:
        return jsonify({'message': 'Jig number and sale order are required.'}), 400

    parts_list = testers_data_by_jig_and_so.get(jig_number, {}).get(sale_order)
    if not parts_list:
        return jsonify({'message': f'No parts list found for Jig: {jig_number} and Sale Order: {sale_order}.'}), 404

    shortage_list = [
        part for part in parts_list if str(part.get('availability_status')).lower() == 'shortage'
    ]
    return jsonify(shortage_list)

@app.route('/api/download_all_parts_excel', methods=['GET'])
def download_all_parts():
    """Generates and downloads an Excel file of all parts for a given jig number."""
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
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='All_Parts_List')
    output.seek(0)

    return send_file(
        output,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        download_name=f'HAL_All_Parts_{tester_jig_number}.xlsx',
        as_attachment=True
    )

@app.route('/api/send_telegram_alert', methods=['POST'])
def send_telegram_alert_route():
    """Endpoint to trigger a Telegram message."""
    data = request.get_json()
    message_content = data.get('message')
    if not message_content:
        return jsonify({'message': 'Missing message content for Telegram alert'}), 400
    if send_telegram_message(message_content):
        return jsonify({'message': 'Telegram alert sent successfully!'}), 200
    else:
        return jsonify({'message': 'Failed to send Telegram alert. Check server logs.'}), 500

@app.route('/api/send_whatsapp_alert', methods=['POST'])
def send_whatsapp_alert_simulation():
    """This is a simulation endpoint as a placeholder."""
    data = request.get_json()
    if not data or 'message' not in data:
        return jsonify({'message': 'Missing data for WhatsApp alert'}), 400
    print(f"--- SIMULATING WHATSAPP ALERT ---")
    print(f"Message: {data.get('message')}")
    print(f"--- END SIMULATION ---")
    return jsonify({'message': 'WhatsApp alert simulation completed. Check server logs.'}), 200


# --- Main Execution ---
# This part is for local development only. Gunicorn will run the 'app' object in production.
if __name__ == '__main__':
    app.run(debug=True, port=5001)
