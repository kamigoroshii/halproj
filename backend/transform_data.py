import pandas as pd
import numpy as np
import os
import re

print("Transform script started.")

# --- START OF PATH CORRECTION ---

# Get the directory where this script (transform_data.py) is located (e.g., /.../backend)
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
# Get the project's root directory, which is one level up from the backend directory
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)

# --- Configuration ---
# Point to the 'data' folder at the project root
DATA_DIR = os.path.join(PROJECT_ROOT, 'data')

# Ensure the data directory exists
if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)
    print(f"Created data directory at: {DATA_DIR}")

# Define input files and their corresponding sale orders, using the corrected DATA_DIR
INPUT_FILES_CONFIG = [
    {'path': os.path.join(DATA_DIR, 'merged_assembly_parts_list (1).xlsx'), 'sale_order': '04882'},
    {'path': os.path.join(DATA_DIR, 'assembly_parts_list_variant_1.xlsx'), 'sale_order': '04883'},
    {'path': os.path.join(DATA_DIR, 'assembly_parts_list_variant_2.xlsx'), 'sale_order': '04884'}
]
OUTPUT_CSV = os.path.join(DATA_DIR, 'processed_testers_data.csv')

# --- END OF PATH CORRECTION ---


def transform_data(input_configs, output_path):
    """
    Reads multiple Excel files, cleans and transforms the data, calculates
    availability and launch status, and saves it to a single CSV file.
    """
    print("Attempting to transform data from multiple sources.")
    print(f"Output will be saved to: {output_path}")

    all_dfs = []
    for config in input_configs:
        file_path = config['path']
        sale_order = config['sale_order']
        file_basename = os.path.basename(file_path)
        print(f"\n--- Processing: {file_basename} for Sale Order: {sale_order} ---")

        try:
            df = pd.read_excel(file_path, sheet_name=0, engine='openpyxl')
            # Sanitize headers: remove spaces and convert to lowercase
            df.columns = [re.sub(r'\s+', '', str(c)).lower() for c in df.columns]

            # --- START OF CORRECTED LOGIC ---
            df['requiredQuantity'] = pd.to_numeric(df.get('requiredqty', 0), errors='coerce').fillna(0)
            df['currentStock'] = pd.to_numeric(df.get('stockqty', 0), errors='coerce').fillna(0)

            conditions = [
                (df['requiredQuantity'] <= 0),
                (df['currentStock'] == df['requiredQuantity']),
                (df['currentStock'] < df['requiredQuantity']),
                (df['currentStock'] > df['requiredQuantity'])
            ]
            choices = ['Not Applicable', 'Adequate', 'Shortage', 'Surplus']
            df['availability_status'] = np.select(conditions, choices, default='Unknown')

            df['status'] = df.groupby('testerjigno')['availability_status'].transform(
                lambda x: 'Launch Delayed - Shortages Exist' if (x == 'Shortage').any() else 'Ready for Launch'
            )
            # --- END OF CORRECTED LOGIC ---

            df['sale_order'] = sale_order
            df.rename(columns={
                'testerid': 'testerId',
                'testerjigno': 'tester_jig_number',
                'topassyno': 'top_assy_no',
                'partno': 'part_number',
                'unit': 'unitName',
                'officialincharge': 'officialIncharge'
            }, inplace=True)

            all_dfs.append(df)

        except FileNotFoundError:
            print(f"Error: Input XLSX file not found at {file_path}. Skipping this file.")
        except Exception as e:
            print(f"An unexpected error occurred processing {file_basename}: {e}")

    if not all_dfs:
        print("No dataframes were successfully processed. Output CSV will not be created.")
        return

    final_combined_df = pd.concat(all_dfs, ignore_index=True)

    final_cols = [
        'testerId', 'tester_jig_number', 'sale_order', 'top_assy_no', 'part_number', 'unitName',
        'requiredQuantity', 'currentStock', 'availability_status', 'officialIncharge', 'status'
    ]
    for col in final_cols:
        if col not in final_combined_df.columns:
            final_combined_df[col] = None

    final_combined_df[final_cols].to_csv(output_path, index=False, encoding='utf-8')
    print(f"\nSuccessfully transformed and combined data and saved to: {output_path}")


if __name__ == '__main__':
    transform_data(INPUT_FILES_CONFIG, OUTPUT_CSV)
    print("\nScript finished.")
