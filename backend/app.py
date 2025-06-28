import pandas as pd
from flask import Flask, request, jsonify, render_template, url_for, send_file
from flask_cors import CORS
import os
import requests
import io
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__,
            static_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'),
            static_url_path='/')

CORS(app)

# --- Configuration (from .env) ---
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID') # Re-added for single chat ID

# --- Paths ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, '..', 'data', 'processed_testers_data.csv')
# TELEGRAM_CHAT_IDS_FILE is removed as we are no longer storing multiple IDs

# In-memory store for tester data
testers_data = []

# subscribed_chat_ids is removed as we are no longer storing multiple IDs

def load_data():
    """Loads tester data from CSV into memory."""
    global testers_data
    try:
        df = pd.read_csv(DATA_FILE)
        testers_data = df.to_dict(orient='records')
        print(f"Successfully loaded {len(testers_data)} tester records from {DATA_FILE}")
    except FileNotFoundError:
        print(f"Error: Processed data file not found at {DATA_FILE}. Please ensure you ran transform_data.py.")
        testers_data = []
    except Exception as e:
        print(f"Error loading data: {e}")
        testers_data = []

# load_subscribed_chat_ids() and save_subscribed_chat_ids() are removed

# Load data when the Flask app starts
with app.app_context():
    load_data()

# --- Helper functions for sending alerts ---

def send_telegram_message(message_text, parse_mode='Markdown'): # Reverted to original signature
    """Sends a message to the configured Telegram chat ID."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("Telegram bot token or chat ID is not configured. Skipping Telegram message.")
        return False

    telegram_api_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        'chat_id': TELEGRAM_CHAT_ID, # Uses the single configured chat ID
        'text': message_text,
        'parse_mode': parse_mode
    }
    try:
        response = requests.post(telegram_api_url, json=payload)
        response.raise_for_status()
        print(f"Message sent to Telegram chat {TELEGRAM_CHAT_ID}. Telegram API response: {response.json()}")
        return True
    except requests.exceptions.RequestException as e:
        print(f"Error sending Telegram message to {TELEGRAM_CHAT_ID}: {e}")
        return False

# broadcast_telegram_message() is removed

# --- API Endpoints (Original) ---

@app.route('/api/jig_details/<string:tester_jig_number>', methods=['GET'])
def get_jig_details(tester_jig_number):
    """
    API endpoint to retrieve details for all parts belonging to a given tester_jig_number.
    Frontend will determine launching status based on user input.
    """
    print(f"DEBUG: get_jig_details endpoint hit for jig: {tester_jig_number}")
    jig_number_lower = tester_jig_number.lower()

    matching_parts = [
        t for t in testers_data
        if t.get('tester_jig_number', '').lower() == jig_number_lower
    ]

    if matching_parts:
        first_part = matching_parts[0]
        summary_info = {
            'testerJigNumber': first_part.get('tester_jig_number', tester_jig_number),
            'saleOrder': first_part.get('sale_order', 'N/A'),
            'topAssyNo': first_part.get('top_assy_no', 'N/A'),
            # 'launchingStatus' is no longer returned by backend - frontend will manage
        }

        detailed_parts_list = []
        for part in matching_parts:
            detailed_parts_list.append({
                'testerId': part.get('testerId', 'N/A'),
                'partNumber': part.get('part_number', 'N/A'),
                'unitName': part.get('unitName', 'N/A'),
                'requiredQuantity': part.get('requiredQuantity', 0),
                'currentStock': part.get('currentStock', 0),
                'availabilityStatus': part.get('availability_status', 'N/A'),
                'officialIncharge': part.get('officialIncharge', 'N/A'),
                'status': part.get('status', 'N/A')
            })
        print(f"DEBUG: Found {len(matching_parts)} matching parts for jig: {tester_jig_number}.")

        return jsonify({
            'summary': summary_info,
            'details': detailed_parts_list
        }), 200
    else:
        print(f"DEBUG: Tester Jig Number '{tester_jig_number}' not found in loaded data.")
        return jsonify({'message': 'Tester Jig Number not found'}), 404

# Endpoint to render the shortage list HTML page (still active)
@app.route('/shortage_list_page/<string:tester_jig_number>', methods=['GET'])
def shortage_list_page(tester_jig_number):
    """
    Renders the shortage list HTML page for a specific tester_jig_number.
    """
    jig_number_lower = tester_jig_number.lower()
    matching_parts = [
        t for t in testers_data
        if t.get('tester_jig_number', '').lower() == jig_number_lower
    ]

    if not matching_parts:
        return "<h1>Tester Jig Number not found or has no parts.</h1>", 404

    first_part = matching_parts[0]
    summary_info = {
        'testerJigNumber': first_part.get('tester_jig_number', tester_jig_number),
        'saleOrder': first_part.get('sale_order', 'N/A'),
        'topAssyNo': first_part.get('top_assy_no', 'N/A'),
        'launchingStatus': "N/A" # Not directly displayed on this page, but good to include for consistency
    }

    return render_template(
        'shortage_list_page.html',
        jig_details={'summary': summary_info, 'details': matching_parts}
    )

@app.route('/api/download_shortage_excel/<string:tester_jig_number>', methods=['GET'])
def download_shortage_excel(tester_jig_number):
    """
    Generates and serves an Excel file (.xlsx) of the shortage list for a given jig.
    """
    jig_number_lower = tester_jig_number.lower()

    matching_parts = [
        t for t in testers_data
        if t.get('tester_jig_number', '').lower() == jig_number_lower
    ]

    if not matching_parts:
        return jsonify({'message': 'No parts found for this Tester Jig Number to download.'}), 404

    # Create a DataFrame from the matching parts
    df_shortage = pd.DataFrame(matching_parts)

    # Select and reorder columns for the Excel output (cleaner headings for user)
    df_shortage = df_shortage[[
        'testerId', 'part_number', 'unitName', 'requiredQuantity',
        'currentStock', 'availability_status', 'officialIncharge', 'status'
    ]]
    df_shortage.rename(columns={
        'testerId': 'Tester ID',
        'part_number': 'Part Number',
        'unitName': 'Unit Name',
        'requiredQuantity': 'Required Quantity',
        'currentStock': 'Current Stock',
        'availability_status': 'Availability Status',
        'officialIncharge': 'Official Incharge (Contact)',
        'status': 'Part Status'
    }, inplace=True)

    # Create an in-memory Excel file
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df_shortage.to_excel(writer, index=False, sheet_name='Shortage List')
    output.seek(0) # Rewind to the beginning of the stream

    return send_file(
        output,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        download_name=f'HAL_Shortage_List_{tester_jig_number}.xlsx',
        as_attachment=True
    )


@app.route('/api/send_telegram_alert', methods=['POST'])
def send_telegram_alert_route():
    data = request.get_json()
    message_content = data.get('message')

    if not message_content:
        return jsonify({'message': 'Missing message content for Telegram alert'}), 400

    # Call the original send_telegram_message function
    if send_telegram_message(message_content):
        return jsonify({'message': 'Telegram alert sent successfully!'}), 200
    else:
        return jsonify({'message': 'Failed to send Telegram alert. Check server logs.'}), 500

@app.route('/api/send_whatsapp_alert', methods=['POST'])
def send_whatsapp_alert_simulation():
    data = request.get_json()
    tester_id = data.get('testerId')
    official_incharge = data.get('officialIncharge')
    message_content = data.get('message')

    if not tester_id or not official_incharge or not message_content:
        return jsonify({'message': 'Missing data for WhatsApp alert'}), 400

    print(f"--- SIMULATING WHATSAPP ALERT ---")
    print(f"To: {official_incharge}")
    print(f"For Tester ID: {tester_id}")
    print(f"Message: {message_content}")
    print(f"---------------------------------")

    return jsonify({'message': 'WhatsApp alert simulation successful!'}), 200

# telegram_webhook endpoint is removed

# --- Running the Flask App ---
if __name__ == '__main__':
    # No need to create data directory for chat_ids.json anymore
    app.run(port=5000)