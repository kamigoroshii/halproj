import pandas as pd
import numpy as np
import os
import re
import sys

print("Transform script started.")

# --- Path Correction ---
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)

# --- Configuration ---
DATA_DIR = os.path.join(PROJECT_ROOT, 'data')

if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)
    print(f"Created data directory at: {DATA_DIR}")

INPUT_FILES_CONFIG = [
    {'path': os.path.join(DATA_DIR, 'merged_assembly_parts_list (1).xlsx'), 'sale_order': '04882'},
    {'path': os.path.join(DATA_DIR, 'assembly_parts_list_variant_1.xlsx'), 'sale_order': '04883'},
    {'path': os.path.join(DATA_DIR, 'assembly_parts_list_variant_2.xlsx'), 'sale_order': '04884'}
]
OUTPUT_CSV = os.path.join(DATA_DIR, 'processed_testers_data.csv')


def transform_data(input_configs, output_path):
    """
    Reads multiple Excel files and calculates the final status on the combined data.
    Adds P-Factor and initial recommendedQuantity column.
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
            df.columns = [re.sub(r'\s+', '', str(c)).lower() for c in df.columns]

            # --- Column Handling ---
            part_no_col = next((col for col in ['subassemblyorpartno', 'partno'] if col in df.columns), 'description')
            df['part_number'] = df.get(part_no_col, 'N/A').astype(str)

            req_qty_col = next((col for col in ['requiredqty', 'qtyrequired'] if col in df.columns), None)
            stock_qty_col = next((col for col in ['qtyass', 'stockqty'] if col in df.columns), None)

            if req_qty_col:
                df['requiredQuantity'] = pd.to_numeric(df[req_qty_col], errors='coerce').fillna(0)
            else:
                df['requiredQuantity'] = 0

            if stock_qty_col:
                df['currentStock'] = pd.to_numeric(df[stock_qty_col], errors='coerce').fillna(0)
            else:
                df['currentStock'] = 0

            df['tester_jig_number'] = df.get('testerjigno', 'TJ-706')
            df['top_assy_no'] = df.get('topassyno', '130575')
            df['testerId'] = df.get('testerid', 'HAL-TID-N/A')
            df['unitName'] = df.get('description', 'N/A')
            df['officialIncharge'] = df.get('officialincharge', '+91-0000000000')
            df['sale_order'] = sale_order

            # Calculate availability per part
            conditions = [
                (df['requiredQuantity'] <= 0),
                (df['currentStock'] == df['requiredQuantity']),
                (df['currentStock'] < df['requiredQuantity']),
                (df['currentStock'] > df['requiredQuantity'])
            ]
            choices = ['Not Applicable', 'Adequate', 'Shortage', 'Surplus']
            df['availability_status'] = np.select(conditions, choices, default='Unknown')
            
            # --- NEW: Add P-Factor and initial recommendedQuantity ---
            # Assign a random P-Factor (e.g., 5-30%) for each part
            df['p_factor'] = np.random.randint(5, 31, size=len(df)) # Random int between 5 and 30
            df['recommendedQuantity'] = 0 # Initialize, calculated in app.py

            all_dfs.append(df)

        except FileNotFoundError:
            print(f"Error: Input XLSX file not found at {file_path}. Skipping this file.")
        except Exception as e:
            print(f"FATAL ERROR processing {file_basename}: {e}")
            sys.exit(1)

    if not all_dfs:
        print("FATAL ERROR: No dataframes were successfully processed.")
        sys.exit(1)

    # Combine all dataframes first
    final_combined_df = pd.concat(all_dfs, ignore_index=True)

    # --- START: Corrected Global Status Calculation ---
    # Now, calculate the overall status on the complete, combined dataset.
    print("\nCalculating final launch status across all sale orders...")
    final_combined_df['status'] = final_combined_df.groupby('tester_jig_number')['availability_status'].transform(
        lambda x: 'Not Launched' if (x == 'Shortage').any() else 'Ready for Launch'
    )
    # --- END: Corrected Global Status Calculation ---

    final_cols = [
        'testerId', 'tester_jig_number', 'sale_order', 'top_assy_no', 'part_number', 'unitName',
        'requiredQuantity', 'currentStock', 'availability_status', 'officialIncharge', 'status',
        'p_factor', 'recommendedQuantity' # Include new columns
    ]
    for col in final_cols:
        if col not in final_combined_df.columns:
            final_combined_df[col] = None

    final_combined_df[final_cols].to_csv(output_path, index=False, encoding='utf-8')
    print(f"\nSuccessfully transformed and combined data and saved to: {output_path}")


if __name__ == '__main__':
    transform_data(INPUT_FILES_CONFIG, OUTPUT_CSV)
    print("\nScript finished.")