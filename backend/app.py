# HALPROJ/backend/app.py

import pandas as pd
from flask import Flask, request, jsonify, render_template, url_for, send_file
from flask_cors import CORS
import os
import requests
import io
from dotenv import load_dotenv

# Load environment variables from the .env file
load_dotenv()

# Define BASE_DIR relative to the current script (app.py)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# PROJECT_ROOT is the parent directory of 'backend', which is 'HALPROJ'
PROJECT_ROOT = os.path.join(BASE_DIR, '..')

# Initialize Flask application
# static_folder: Where Flask should look for static files (CSS, JS, images).
#                Set to PROJECT_ROOT so it can find files like index.html, style.css etc.
# static_url_path: The URL prefix for static files. '/' means they are served from the root.
# template_folder: Where Flask's render_template() function should look for HTML templates.
#                  Set to PROJECT_ROOT so it can find index.html directly at the root.
app = Flask(__name__,
            static_folder=PROJECT_ROOT,
            static_url_path='/',
            template_folder=PROJECT_ROOT)

# Enable Cross-Origin Resource Sharing (CORS) for your Flask app.
# This is important for the frontend (running on a different domain/port during development,
# or simply making API calls back to the same origin in production) to be able to
# make requests to this backend.
CORS(app)

# --- Routes ---

# Route to serve the main HTML page (index.html)
# This handles requests to the root URL of your deployed application.
@app.route('/')
def serve_index():
    """
    Serves the main index.html file when accessing the root URL.
    """
    return render_template('index.html')

# --- Configuration (from .env file) ---
# Telegram bot token (from BotFather)
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
# Specific Telegram chat ID to send alerts to (can be a user ID or a group chat ID)
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID')

# --- Data Paths ---
# Path to the processed CSV data file, relative to the project root.
DATA_FILE = os.path.join(PROJECT_ROOT, 'data', 'processed_testers_data.csv')

# In-memory store for tester data
testers_data = []

# --- Data Loading Function ---
def load_data():
    """
    Loads tester data from the processed CSV file into memory.
    This function is called once when the Flask application starts.
    """
    global testers_data # Declare testers_data as global to modify it
    try:
        df = pd.read_csv(DATA_FILE)
        testers_data = df.to_dict(orient='records')
        print(f"Successfully loaded {len(testers_data)} tester records from {DATA_FILE}")
    except FileNotFoundError:
        print(f"Error: Processed data file not found at {DATA_FILE}. "
              "Please ensure you ran transform_data.py to generate it.")
        testers_data = [] # Ensure testers_data is empty if file not found
    except Exception as e:
        print(f"An unexpected error occurred while loading data: {e}")
        testers_data = [] # Ensure testers_data is empty on other errors

# Load data when the Flask app starts.
# app.app_context() is used to run load_data() within Flask's application context,
# which can be useful for certain Flask extensions, though not strictly necessary here.
with app.app_context():
    load_data()

# --- Helper function for sending Telegram alerts ---
def send_telegram_message(message_text, parse_mode='Markdown'):
    """
    Sends a message to the pre-configured Telegram chat ID.
    Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to be set in .env.
    """
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("Telegram bot token or chat ID is not configured. Skipping Telegram message.")
        return False

    telegram_api_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        'chat_id': TELEGRAM_CHAT_ID, # Target chat ID from .env
        'text': message_text,
        'parse_mode': parse_mode # Use Markdown for formatting
    }
    try:
        response = requests.post(telegram_api_url, json=payload)
        response.raise_for_status() # Raise an HTTPError for bad responses (4xx or 5xx)
        print(f"Message sent to Telegram chat {TELEGRAM_CHAT_ID}. Telegram API response: {response.json()}")
        return True
    except requests.exceptions.RequestException as e:
        print(f"Error sending Telegram message to {TELEGRAM_CHAT_ID}: {e}")
        return False

# --- API Endpoints ---

# API endpoint to retrieve details for all parts belonging to a given tester_jig_number.
# The frontend will use this to display summary info and a detailed list of parts.
@app.route('/api/jig_details/<string:tester_jig_number>', methods=['GET'])
def get_jig_details(tester_jig_number):
    """
    Retrieves summary and detailed part information for a given tester jig number.
    The launching status is now managed by the frontend based on user input.
    """
    print(f"DEBUG: get_jig_details endpoint hit for jig: {tester_jig_number}")
    jig_number_lower = tester_jig_number.lower()

    # Filter all parts matching the requested tester jig number
    matching_parts = [
        t for t in testers_data
        if t.get('tester_jig_number', '').lower() == jig_number_lower
    ]

    if matching_parts:
        # Extract summary information from the first matching part
        first_part = matching_parts[0]
        summary_info = {
            'testerJigNumber': first_part.get('tester_jig_number', tester_jig_number),
            'saleOrder': first_part.get('sale_order', 'N/A'),
            'topAssyNo': first_part.get('top_assy_no', 'N/A'),
            # 'launchingStatus' is handled client-side now, not returned by backend
        }

        # Prepare a list of detailed part information
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
        # If no matching parts are found for the jig number
        print(f"DEBUG: Tester Jig Number '{tester_jig_number}' not found in loaded data.")
        return jsonify({'message': 'Tester Jig Number not found'}), 404

# Endpoint to render a standalone shortage list HTML page (if needed, otherwise can be removed)
# This might be a legacy route as the main app uses a modal for shortage list.
@app.route('/shortage_list_page/<string:tester_jig_number>', methods=['GET'])
def shortage_list_page(tester_jig_number):
    """
    Renders a dedicated HTML page for the shortage list of a specific tester_jig_number.
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
        'launchingStatus': "N/A" # Not directly displayed on this page, but included for consistency
    }

    return render_template(
        'shortage_list_page.html', # This would need a corresponding HTML file
        jig_details={'summary': summary_info, 'details': matching_parts}
    )

# API endpoint to download the shortage list as an Excel file.
@app.route('/api/download_shortage_excel/<string:tester_jig_number>', methods=['GET'])
def download_shortage_excel(tester_jig_number):
    """
    Generates an Excel file (.xlsx) of the shortage list for a given jig
    and sends it as a downloadable attachment.
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

    # Select and reorder columns for the Excel output with cleaner headings for the user
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

    # Create an in-memory Excel file using BytesIO
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df_shortage.to_excel(writer, index=False, sheet_name='Shortage List')
    output.seek(0) # Rewind the buffer to the beginning after writing

    return send_file(
        output,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        download_name=f'HAL_Shortage_List_{tester_jig_number}.xlsx',
        as_attachment=True
    )

# API endpoint to send a Telegram alert.
@app.route('/api/send_telegram_alert', methods=['POST'])
def send_telegram_alert_route():
    """
    Receives a message from the frontend and dispatches it via Telegram.
    """
    data = request.get_json()
    message_content = data.get('message')

    if not message_content:
        return jsonify({'message': 'Missing message content for Telegram alert'}), 400

    if send_telegram_message(message_content):
        return jsonify({'message': 'Telegram alert sent successfully!'}), 200
    else:
        return jsonify({'message': 'Failed to send Telegram alert. Check server logs.'}), 500

# API endpoint to simulate sending a WhatsApp alert.
# This is a simulation, as direct WhatsApp API integration requires specific setup.
@app.route('/api/send_whatsapp_alert', methods=['POST'])
def send_whatsapp_alert_simulation():
    """
    Simulates sending a WhatsApp alert by printing details to the server console.
    """
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

# --- Local Development Server Execution ---
# This block is for running the Flask app directly for local development.
# In a production environment (like Render), a WSGI server (Gunicorn, as per Procfile)
# will typically run the 'app' instance directly, making this block unnecessary.
if __name__ == '__main__':
    # Flask development server
    app.run(port=5000)