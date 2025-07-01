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

testers_data_by_jig_and_so = {}

def load_data():
    """
    Loads processed data, grouping it by tester_jig_number and sale_order.
    Ensures all numeric values are standard Python ints/floats for JSON serialization.
    """
    global testers_data_by_jig_and_so
    testers_data_by_jig_and_so = {} # Clear existing data
    try:
        df = pd.read_csv(DATA_FILE)
        print(f"Raw data loaded: {len(df)} records from {DATA_FILE}")

        # Explicitly convert numeric columns to Python native types before grouping
        for col in ['requiredQuantity', 'currentStock']:
            if col in df.columns:
                df[col] = df[col].apply(lambda x: int(x) if pd.api.types.is_integer_dtype(type(x)) else float(x) if pd.api.types.is_float_dtype(type(x)) else x)


        for jig_name, jig_group in df.groupby('tester_jig_number'):
            jig_summary = {
                'tester_jig_number': jig_name,
                'top_assy_no': str(jig_group['top_assy_no'].iloc[0]) if not jig_group.empty else 'N/A'
            }
            testers_data_by_jig_and_so[jig_name.lower()] = {
                'summary': jig_summary,
                'sale_orders': {}
            }

            for so_number, so_group in jig_group.groupby('sale_order'):
                parts_list = so_group.to_dict(orient='records')
                # Further ensure all values in parts_list are JSON serializable
                cleaned_parts_list = []
                for part in parts_list:
                    cleaned_part = {}
                    for key, value in part.items():
                        if pd.api.types.is_integer_dtype(type(value)) or isinstance(value, int):
                            cleaned_part[key] = int(value)
                        elif pd.api.types.is_float_dtype(type(value)) or isinstance(value, float):
                            cleaned_part[key] = float(value)
                        elif pd.isna(value):
                            cleaned_part[key] = None
                        else:
                            cleaned_part[key] = value
                    cleaned_parts_list.append(cleaned_part)
                    
                testers_data_by_jig_and_so[jig_name.lower()]['sale_orders'][str(so_number)] = cleaned_parts_list

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

@app.route('/api/jig_details/<string:tester_jig_number>', methods=['GET'])
def get_jig_details(tester_jig_number):
    print(f"DEBUG: get_jig_details endpoint hit for jig: {tester_jig_number}")
    jig_number_lower = tester_jig_number.lower()

    jig_data = testers_data_by_jig_and_so.get(jig_number_lower)

    if jig_data:
        summary_info = {
            'testerJigNumber': jig_data['summary']['tester_jig_number'],
            'topAssyNo': jig_data['summary']['top_assy_no']
        }
        sale_orders_list = sorted(list(jig_data['sale_orders'].keys()))

        return jsonify({
            'summary': summary_info,
            'saleOrders': sale_orders_list
        }), 200
    else:
        print(f"DEBUG: Tester Jig Number '{tester_jig_number}' not found.")
        return jsonify({'message': 'Tester Jig Number not found'}), 404

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

@app.route('/api/all_parts_for_jig/<string:tester_jig_number>', methods=['GET'])
def get_all_parts_for_jig(tester_jig_number):
    print(f"DEBUG: get_all_parts_for_jig endpoint hit for jig: {tester_jig_number}")
    jig_number_lower = tester_jig_number.lower()

    jig_data = testers_data_by_jig_and_so.get(jig_number_lower)

    if jig_data:
        all_parts = []
        for so_number, parts_list in jig_data['sale_orders'].items():
            for part in parts_list:
                part_copy = part.copy()
                part_copy['sale_order'] = so_number
                all_parts.append(part_copy)
        
        return jsonify(all_parts), 200
    else:
        print(f"DEBUG: Tester Jig Number '{tester_jig_number}' not found.")
        return jsonify({'message': 'Tester Jig Number not found'}), 404

@app.route('/api/download_shortage_excel/<string:tester_jig_number>/<string:sale_order>', methods=['GET'])
def download_specific_shortage_excel(tester_jig_number, sale_order):
    print(f"DEBUG: download_specific_shortage_excel for jig: {tester_jig_number}, SO: {sale_order}")
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

@app.route('/api/download_all_parts_excel/<string:tester_jig_number>', methods=['GET'])
def download_all_parts_excel(tester_jig_number):
    print(f"DEBUG: download_all_parts_excel for jig: {tester_jig_number}")
    jig_number_lower = tester_jig_number.lower()

    jig_data = testers_data_by_jig_and_so.get(jig_number_lower)

    if not jig_data:
        return jsonify({'message': 'Tester Jig Number not found for download.'}), 404

    all_parts = []
    for so_number, parts_list in jig_data['sale_orders'].items():
        for part in parts_list:
            part_copy = part.copy()
            part_copy['sale_order'] = so_number
            all_parts.append(part_copy)

    if not all_parts:
        return jsonify({'message': 'No parts found for this Tester Jig to download.'}), 404

    df_all_parts = pd.DataFrame(all_parts)

    df_all_parts = df_all_parts[[
        'testerId', 'sale_order', 'part_number', 'unitName', 'requiredQuantity',
        'currentStock', 'availability_status', 'officialIncharge', 'status'
    ]]
    df_all_parts.rename(columns={
        'testerId': 'Tester ID',
        'sale_order': 'Sale Order',
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
        df_all_parts.to_excel(writer, index=False, sheet_name=f'All Parts for {tester_jig_number}')
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