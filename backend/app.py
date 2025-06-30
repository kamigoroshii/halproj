import pandas as pd
from flask import Flask, request, jsonify, render_template, url_for, send_file
from flask_cors import CORS
import os
import requests
import io
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.join(BASE_DIR, '..')

app = Flask(__name__,
            static_folder=PROJECT_ROOT,
            static_url_path='/',
            template_folder=PROJECT_ROOT)

CORS(app)

@app.route('/')
def serve_index():
    return render_template('index.html')

TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID')

DATA_FILE = os.path.join(PROJECT_ROOT, 'data', 'processed_testers_data.csv')

# --- New Data Structure in Memory ---
# This will store data like:
# {
#   'TJ-706': {
#       'summary': {'tester_jig_number': 'TJ-706', 'top_assy_no': '130575'},
#       'sale_orders': {
#           '04882': [ {part_data}, {part_data} ],
#           '04883': [ {part_data}, {part_data} ],
#           '04884': [ {part_data}, {part_data} ]
#       }
#   }
# }
testers_data_by_jig_and_so = {}

def load_data():
    """
    Loads processed data, grouping it by tester_jig_number and sale_order.
    """
    global testers_data_by_jig_and_so
    testers_data_by_jig_and_so = {} # Clear existing data
    try:
        df = pd.read_csv(DATA_FILE)
        print(f"Raw data loaded: {len(df)} records from {DATA_FILE}")

        # Group by tester_jig_number and then by sale_order
        for jig_name, jig_group in df.groupby('tester_jig_number'):
            jig_summary = {
                'tester_jig_number': jig_name,
                # Assuming top_assy_no is consistent across all SOs for one jig
                'top_assy_no': jig_group['top_assy_no'].iloc[0] if not jig_group.empty else 'N/A'
            }
            testers_data_by_jig_and_so[jig_name.lower()] = {
                'summary': jig_summary,
                'sale_orders': {}
            }

            for so_number, so_group in jig_group.groupby('sale_order'):
                # Convert this group to a list of dictionaries for frontend
                parts_list = so_group.to_dict(orient='records')
                testers_data_by_jig_and_so[jig_name.lower()]['sale_orders'][so_number] = parts_list

        print(f"Successfully loaded and grouped data for {len(testers_data_by_jig_and_so)} unique Tester Jigs.")
    except FileNotFoundError:
        print(f"Error: Processed data file not found at {DATA_FILE}. Please ensure you ran transform_data.py.")
    except Exception as e:
        print(f"Error loading and grouping data: {e}")
        import traceback
        traceback.print_exc()

with app.app_context():
    load_data()

def send_telegram_message(message_text, parse_mode='Markdown'):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("Telegram bot token or chat ID is not configured. Skipping Telegram message.")
        return False
    telegram_api_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        'chat_id': TELEGRAM_CHAT_ID,
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

# --- API Endpoints ---

# Endpoint to get general jig details and list of associated Sale Orders
@app.route('/api/jig_details/<string:tester_jig_number>', methods=['GET'])
def get_jig_details(tester_jig_number):
    print(f"DEBUG: get_jig_details endpoint hit for jig: {tester_jig_number}")
    jig_number_lower = tester_jig_number.lower()

    jig_data = testers_data_by_jig_and_so.get(jig_number_lower)

    if jig_data:
        summary_info = {
            'testerJigNumber': jig_data['summary']['tester_jig_number'],
            'topAssyNo': str(jig_data['summary']['top_assy_no'])
        }
        # Return a list of all sale order numbers for this jig
        sale_orders_list = list(jig_data['sale_orders'].keys())

        return jsonify({
            'summary': summary_info,
            'saleOrders': sale_orders_list
        }), 200
    else:
        print(f"DEBUG: Tester Jig Number '{tester_jig_number}' not found.")
        return jsonify({'message': 'Tester Jig Number not found'}), 404

# NEW Endpoint: Get shortage list for a specific Tester Jig and Sale Order
@app.route('/api/shortage_list/<string:tester_jig_number>/<string:sale_order>', methods=['GET'])
def get_specific_shortage_list(tester_jig_number, sale_order):
    print(f"DEBUG: get_specific_shortage_list for jig: {tester_jig_number}, SO: {sale_order}")
    jig_number_lower = tester_jig_number.lower()

    jig_data = testers_data_by_jig_and_so.get(jig_number_lower)

    if jig_data:
        parts_for_so = jig_data['sale_orders'].get(sale_order)
        if parts_for_so:
            return jsonify(parts_for_so), 200
        else:
            print(f"DEBUG: Sale Order '{sale_order}' not found for jig '{tester_jig_number}'.")
            return jsonify({'message': f'Sale Order {sale_order} not found for this Tester Jig'}), 404
    else:
        print(f"DEBUG: Tester Jig Number '{tester_jig_number}' not found for shortage list request.")
        return jsonify({'message': 'Tester Jig Number not found'}), 404

@app.route('/api/download_shortage_excel/<string:tester_jig_number>/<string:sale_order>', methods=['GET'])
def download_shortage_excel(tester_jig_number, sale_order):
    print(f"DEBUG: download_shortage_excel for jig: {tester_jig_number}, SO: {sale_order}")
    jig_number_lower = tester_jig_number.lower()

    jig_data = testers_data_by_jig_and_so.get(jig_number_lower)

    if not jig_data:
        return jsonify({'message': 'Tester Jig Number not found for download.'}), 404

    matching_parts = jig_data['sale_orders'].get(sale_order)

    if not matching_parts:
        return jsonify({'message': f'No parts found for Sale Order {sale_order} to download.'}), 404

    df_shortage = pd.DataFrame(matching_parts)

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

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df_shortage.to_excel(writer, index=False, sheet_name=f'Shortage List SO {sale_order}')
    output.seek(0)

    return send_file(
        output,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        download_name=f'HAL_Shortage_List_{tester_jig_number}_SO_{sale_order}.xlsx',
        as_attachment=True
    )

@app.route('/api/send_telegram_alert', methods=['POST'])
def send_telegram_alert_route():
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

if __name__ == '__main__':
    app.run(port=5000)