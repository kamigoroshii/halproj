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
            df.columns = [re.sub(r'\s+', '', str(c)).lower() for c in df.columns]

            # --- Robust Column Handling ---
            if 'requiredqty' in df.columns:
                df['requiredQuantity'] = pd.to_numeric(df['requiredqty'], errors='coerce').fillna(0)
            else:
                print(f"Warning: 'requiredqty' column not found in {file_basename}. Defaulting to 0.")
                df['requiredQuantity'] = 0

            if 'stockqty' in df.columns:
                df['currentStock'] = pd.to_numeric(df['stockqty'], errors='coerce').fillna(0)
            else:
                print(f"Warning: 'stockqty' column not found in {file_basename}. Defaulting to 0.")
                df['currentStock'] = 0
            
            # --- START OF FINAL DATA FIX ---
            # If 'testerjigno' column is missing, create 'tester_jig_number' with a default value.
            # Otherwise, rename 'testerjigno' to 'tester_jig_number'.
            if 'testerjigno' not in df.columns:
                print(f"Warning: 'testerjigno' column not found in {file_basename}. Assigning default 'TJ-706'.")
                df['tester_jig_number'] = 'TJ-706'
            else:
                df.rename(columns={'testerjigno': 'tester_jig_number'}, inplace=True)
            # --- END OF FINAL DATA FIX ---
            
            conditions = [
                (df['requiredQuantity'] <= 0),
                (df['currentStock'] == df['requiredQuantity']),
                (df['currentStock'] < df['requiredQuantity']),
                (df['currentStock'] > df['requiredQuantity'])
            ]
            choices = ['Not Applicable', 'Adequate', 'Shortage', 'Surplus']
            df['availability_status'] = np.select(conditions, choices, default='Unknown')

            # Now, group by the guaranteed 'tester_jig_number' column.
            df['status'] = df.groupby('tester_jig_number')['availability_status'].transform(
                lambda x: 'Launch Delayed - Shortages Exist' if (x == 'Shortage').any() else 'Ready for Launch'
            )

            df['sale_order'] = sale_order
            df.rename(columns={
                'testerid': 'testerId',
                'topassyno': 'top_assy_no',
                'partno': 'part_number',
                'unit': 'unitName',
                'officialincharge': 'officialIncharge'
            }, inplace=True)

            all_dfs.append(df)

        except FileNotFoundError:
            print(f"Error: Input XLSX file not found at {file_path}. Skipping this file.")
        except Exception as e:
            print(f"FATAL ERROR processing {file_basename}: {e}")
            sys.exit(1)

    if not all_dfs:
        print("FATAL ERROR: No dataframes were successfully processed. Output CSV will not be created.")
        sys.exit(1)

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
