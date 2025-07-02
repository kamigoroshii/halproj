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

def send_telegram_message(message_text):
    """Sends a message to the configured Telegram chat."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("Telegram environment variables not set. Skipping alert.")
        return False
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {'chat_id': TELEGRAM_CHAT_ID, 'text': message_text, 'parse_mode': 'Markdown'}
    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
        print(f"Successfully sent Telegram alert for: {message_text.splitlines()[2]}")
        return True
    except requests.exceptions.RequestException as e:
        print(f"Failed to send Telegram message: {e}")
        return False

def check_and_send_launch_alerts():
    """
    Iterates through all loaded jigs and sends a Telegram alert for any
    jig with a status of 'Not Launched'. This runs once on startup.
    """
    print("Checking for any jigs that are 'Not Launched' to send alerts...")
    alerted_jigs = set()

    for jig_number, sale_orders_data in testers_data_by_jig_and_so.items():
        if not sale_orders_data or jig_number in alerted_jigs:
            continue

        first_so_parts = next(iter(sale_orders_data.values()), None)
        if not first_so_parts:
            continue
        
        status = first_so_parts[0].get('status')

        if status == 'Not Launched':
            alerted_jigs.add(jig_number) # Ensure we only alert once per jig number
            
            total_shortages = sum(
                1 for so_parts in sale_orders_data.values() 
                for part in so_parts if part.get('availability_status') == 'Shortage'
            )

            message = (
                f"🚨 *Automatic Alert: Tester Jig Launch Status*\n"
                f"------------------------------------\n"
                f"⚙️ *Jig Number:* `{jig_number}`\n"
                f"📉 *Status:* *{status}* (Due to {total_shortages} part shortage(s))\n"
                f"------------------------------------\n"
                f"Please review requirements in the tracking system."
            )
            send_telegram_message(message.strip())


def load_data():
    """
    Loads and cleans processed data, then triggers automated alerts.
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

        numeric_cols = ['requiredQuantity', 'currentStock']
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0).astype(int)
        
        for (jig, so), group in df.groupby(['tester_jig_number', 'sale_order']):
            jig_str, so_str = str(jig), str(so)
            if jig_str not in testers_data_by_jig_and_so:
                testers_data_by_jig_and_so[jig_str] = {}
            testers_data_by_jig_and_so[jig_str][so_str] = group.to_dict('records')
            
        print(f"Data loaded and sanitized successfully. {len(testers_data_by_jig_and_so)} unique jig numbers found.")
        
        # After loading, automatically check for statuses and send alerts
        check_and_send_launch_alerts()
        
    except FileNotFoundError:
        print(f"ERROR: Data file not found at {DATA_FILE}. The build script may have failed.")
    except Exception as e:
        print(f"An error occurred during data loading: {e}")

# Load data on application startup, which will also trigger the alert check
load_data()

# --- API Routes ---
# (The rest of the API routes remain the same as the last correct version)

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
    
    if send_telegram_message(message):
        return jsonify({'message': 'Telegram alert sent successfully!'}), 200
    else:
        return jsonify({'message': 'Failed to send Telegram alert.'}), 500

# --- Main Execution ---
if __name__ == '__main__':
    app.run(debug=True, port=5001)

