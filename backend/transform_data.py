import pandas as pd
import os
import re
from itertools import cycle

print("Script started.")

# Define paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.join(BASE_DIR, '..') # Points to HALPROJ/
DATA_DIR = os.path.join(PROJECT_ROOT, 'data') # Points to HALPROJ/data/

# List of input Excel files with their associated Sale Orders
# IMPORTANT: Ensure these filenames exactly match what you have in your data folder.
INPUT_FILES_CONFIG = [
    {'path': os.path.join(DATA_DIR, 'merged_assembly_parts_list (1).xlsx'), 'sale_order': '04882'},
    {'path': os.path.join(DATA_DIR, 'assembly_parts_list_variant_1.xlsx'), 'sale_order': '04883'},
    {'path': os.path.join(DATA_DIR, 'assembly_parts_list_variant_2.xlsx'), 'sale_order': '04884'}
]
OUTPUT_CSV = os.path.join(DATA_DIR, 'processed_testers_data.csv')

def transform_data(input_configs, output_path):
    """
    Transforms multiple raw XLSX data files into a structured CSV format,
    assigning all records to a single Tester Jig Number (TJ-706),
    and preserving their associated sale_order.
    """
    print(f"Attempting to transform data from multiple sources.")
    print(f"Output will be saved to: {output_path}")

    all_dfs = []
    for config in input_configs:
        file_path = config['path']
        sale_order = config['sale_order']
        print(f"Processing: {os.path.basename(file_path)} for Sale Order: {sale_order}")

        try:
            df = pd.read_excel(file_path, sheet_name=0)

            # 1. Clean Column Names
            df.columns = df.columns.str.strip().str.replace(' ', '_').str.lower()

            # Ensure 'sl_no' exists and is numeric, create if not
            if 'sl_no' not in df.columns or not pd.api.types.is_numeric_dtype(df['sl_no']):
                print(f"Warning: 'sl_no' column not found or not numeric in {os.path.basename(file_path)}. Generating simple sequential SL No.")
                df['sl_no'] = range(1, len(df) + 1)

            # Ensure 'sub_assembly_or_part_no' exists and is string type
            if 'sub_assembly_or_part_no' not in df.columns:
                print(f"Warning: 'sub_assembly_or_part_no' column not found in {os.path.basename(file_path)}. Using 'description' for part number.")
                df['sub_assembly_or_part_no'] = df.get('description', '').astype(str).apply(lambda x: re.sub(r'[^a-zA-Z0-9-]', '', x)).str.replace('_', '-')
            else:
                df['sub_assembly_or_part_no'] = df['sub_assembly_or_part_no'].astype(str) # Ensure it's string

            # 'part_number' is the cleaned SUB ASSEMBLY OR PART NO
            df['part_number'] = df['sub_assembly_or_part_no'].apply(lambda x: re.sub(r'[^a-zA-Z0-9-]', '', str(x)).strip())

            # Assign ALL records to the single Tester Jig Number TJ-706
            df['tester_jig_number'] = 'TJ-706'

            # Assign the current sale order from the config
            df['sale_order'] = sale_order
            df['top_assy_no'] = '130575' # This can remain fixed for TJ-706 if it's overall Top Assy No

            # Generate unique testerId (unique per row across all files)
            # This makes sure each row from original sheets gets a unique ID if needed.
            # We'll generate a global unique ID later if needed for individual parts across SOs.
            df['testerId_raw'] = df['sl_no'].astype(str) + '-' + df['part_number']
            # Make it unique across all files being processed in this run by adding SO
            df['testerId'] = df['tester_jig_number'] + '-' + df['sale_order'] + '-' + df['testerId_raw']

            # Original description
            df['unitName'] = df.get('description', 'N/A')

            # Quantities - Ensure conversion to numeric types and handle NaN before availability check
            df['requiredQuantity'] = pd.to_numeric(df.get('required_qty', 0).astype(str).str.extract(r'(\d+\.?\d*)')[0], errors='coerce').fillna(0).astype(int)
            df['currentStock'] = pd.to_numeric(df.get('qty_ass', 0).astype(str).str.extract(r'(\d+\.?\d*)')[0], errors='coerce').fillna(0).astype(int)

            # Official Incharge (per part)
            df['officialIncharge'] = '+91-9876543210' # Placeholder number

            # Derived status (for individual item tracking - e.g., if a single part is delivered)
            df['status'] = df.apply(
                lambda row: 'delivered' if row['currentStock'] >= row['requiredQuantity'] else 'pending',
                axis=1
            )

            # availability_status (for individual parts)
            def get_availability_status(row):
                req_qty = row['requiredQuantity']
                curr_stock = row['currentStock']

                if curr_stock == 0:
                    return "Critical Shortage"
                elif curr_stock < req_qty:
                    return "Shortage"
                elif curr_stock > req_qty:
                    return "Surplus"
                else: # curr_stock == req_qty
                    return "Adequate"

            df['availability_status'] = df.apply(get_availability_status, axis=1)

            all_dfs.append(df)

        except FileNotFoundError:
            print(f"Error: Input XLSX file not found at {file_path}. Skipping this file.")
        except KeyError as ke:
            print(f"Error: Missing expected column in {os.path.basename(file_path)}: {ke}. Please check headers. Columns: {df.columns.tolist() if 'df' in locals() else 'None'}")
        except Exception as e:
            print(f"An unexpected error occurred processing {os.path.basename(file_path)}: {e}")
            import traceback
            traceback.print_exc()

    if not all_dfs:
        print("No dataframes were successfully processed. Output CSV will not be created.")
        return

    final_combined_df = pd.concat(all_dfs, ignore_index=True)

    # Select and reorder desired columns for the output CSV
    final_df_cols = final_combined_df[[
        'testerId', 'tester_jig_number', 'sale_order', 'top_assy_no', 'part_number', 'unitName',
        'requiredQuantity', 'currentStock', 'availability_status', 'officialIncharge', 'status'
    ]]

    final_df_cols.to_csv(output_path, index=False, encoding='utf-8')
    print(f"Successfully transformed and combined data and saved to: {output_path}")
    print(f"Generated {len(final_df_cols)} records across all files.")

if __name__ == "__main__":
    print(f"Starting data transformation process...")
    # Ensure data directory exists
    os.makedirs(DATA_DIR, exist_ok=True)
    transform_data(INPUT_FILES_CONFIG, OUTPUT_CSV)