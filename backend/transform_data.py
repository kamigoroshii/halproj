import pandas as pd
import numpy as np
import os
import re

print("Transform script started.")

# --- Configuration ---
# Assumes the script is in the root project folder.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')

# Ensure the data directory exists
if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)
    print(f"Created data directory at: {DATA_DIR}")

# Define input files and their corresponding sale orders.
# Place your Excel files inside the 'data' folder.
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
            # Sanitize headers: remove spaces and convert to lowercase
            df.columns = [re.sub(r'\s+', '', str(c)).lower() for c in df.columns]

            # --- START OF CORRECTED LOGIC ---

            # Convert quantity columns to numeric, coercing errors to NaN, then filling with 0.
            df['requiredQuantity'] = pd.to_numeric(df.get('requiredqty', 0), errors='coerce').fillna(0)
            df['currentStock'] = pd.to_numeric(df.get('stockqty', 0), errors='coerce').fillna(0)

            # Correctly ordered conditions for availability status calculation
            conditions = [
                (df['requiredQuantity'] <= 0),
                (df['currentStock'] == df['requiredQuantity']),
                (df['currentStock'] < df['requiredQuantity']),
                (df['currentStock'] > df['requiredQuantity'])
            ]
            choices = ['Not Applicable', 'Adequate', 'Shortage', 'Surplus']
            df['availability_status'] = np.select(conditions, choices, default='Unknown')

            # Group by jig number to determine the overall launch status for all parts of that jig.
            # If ANY part for a jig has a 'Shortage', the entire jig's status is 'Launch Delayed'.
            df['status'] = df.groupby('testerjigno')['availability_status'].transform(
                lambda x: 'Launch Delayed - Shortages Exist' if (x == 'Shortage').any() else 'Ready for Launch'
            )

            # --- END OF CORRECTED LOGIC ---

            df['sale_order'] = sale_order
            # Rename columns to a consistent format for the backend
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

    # Define the final set of columns to ensure consistency in the output CSV
    final_cols = [
        'testerId', 'tester_jig_number', 'sale_order', 'top_assy_no', 'part_number', 'unitName',
        'requiredQuantity', 'currentStock', 'availability_status', 'officialIncharge', 'status'
    ]
    # Ensure all final columns exist, filling missing ones with None
    for col in final_cols:
        if col not in final_combined_df.columns:
            final_combined_df[col] = None

    # Save the final dataframe with only the specified columns
    final_combined_df[final_cols].to_csv(output_path, index=False, encoding='utf-8')
    print(f"\nSuccessfully transformed and combined data and saved to: {output_path}")


if __name__ == '__main__':
    # This allows the script to be run directly from the command line
    transform_data(INPUT_FILES_CONFIG, OUTPUT_CSV)
    print("\nScript finished.")
