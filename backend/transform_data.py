import pandas as pd
import os
import re
from itertools import cycle 

print("Script started.")

# Define paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_FILE = os.path.join(BASE_DIR, '..', 'data', 'merged_assembly_parts_list (1).xlsx')
OUTPUT_CSV = os.path.join(BASE_DIR, '..', 'data', 'processed_testers_data.csv')

def transform_data(input_path, output_path):
    """
    Transforms the raw XLSX data into a structured CSV format,
    assigning all records to a single Tester Jig Number (TJ-706),
    and including mock sale_order, top_assy_no, and availability_status.
    Ensures quantities are numeric (handling NaN) for availability status calculation.
    """
    print(f"Attempting to transform data from: {input_path}")
    print(f"Output will be saved to: {output_path}")

    try:
        df = pd.read_excel(input_path, sheet_name=0) 
        
        # 1. Clean Column Names
        df.columns = df.columns.str.strip().str.replace(' ', '_').str.lower()
        
        # --- New Core Mappings & Derivations ---

        # Ensure 'sl_no' exists and is numeric, create if not
        if 'sl_no' not in df.columns or not pd.api.types.is_numeric_dtype(df['sl_no']):
            print("Warning: 'sl_no' column not found or not numeric. Generating simple sequential SL No.")
            df['sl_no'] = range(1, len(df) + 1)
        
        # Ensure 'sub_assembly_or_part_no' exists and is string type
        if 'sub_assembly_or_part_no' not in df.columns:
            print("Warning: 'sub_assembly_or_part_no' column not found. Using 'description' for part number.")
            df['sub_assembly_or_part_no'] = df.get('description', '').astype(str).apply(lambda x: re.sub(r'[^a-zA-Z0-9-]', '', x)).str.replace('_', '-')
        else:
            df['sub_assembly_or_part_no'] = df['sub_assembly_or_part_no'].astype(str) # Ensure it's string

        # 'part_number' is the cleaned SUB ASSEMBLY OR PART NO
        df['part_number'] = df['sub_assembly_or_part_no'].apply(lambda x: re.sub(r'[^a-zA-Z0-9-]', '', str(x)).strip())
        
        # NEW & CRITICAL: Assign ALL records to the single Tester Jig Number TJ-706
        df['tester_jig_number'] = 'TJ-706' 

        # Mock Sale Order and Top Assy No. for TJ-706
        # These will be fixed for TJ-706 as there's only one jig
        df['sale_order'] = '04882' 
        df['top_assy_no'] = '130575'
        
        # Retain original testerId (SL NO - PART NO combination) for unique row identification if needed
        # This testerId is still unique per row from the original sheet
        df['testerId'] = df['sl_no'].astype(str) + '-' + df['part_number']
        df['testerId'] = df['testerId'].mask(df['testerId'].duplicated(keep='first'),
                                             df['testerId'] + '-' + df.groupby('testerId').cumcount().astype(str))

        # Original description
        df['unitName'] = df.get('description', 'N/A')

        # Quantities - Ensure conversion to numeric types and handle NaN before availability check
        # Use a more explicit conversion to float first, then fillna(0) to handle NaN from 'coerce', then convert to int
        df['requiredQuantity'] = pd.to_numeric(df.get('required_qty', 0).astype(str).str.extract(r'(\d+\.?\d*)')[0], errors='coerce').fillna(0).astype(int)
        df['currentStock'] = pd.to_numeric(df.get('qty_ass', 0).astype(str).str.extract(r'(\d+\.?\d*)')[0], errors='coerce').fillna(0).astype(int)

        # Official Incharge (per part)
        df['officialIncharge'] = '+91-9876543210' # Placeholder number

        # Derived status (for individual item tracking - e.g., if a single part is delivered)
        # This is distinct from the overall launching status
        df['status'] = df.apply(
            lambda row: 'delivered' if row['currentStock'] >= row['requiredQuantity'] else 'pending',
            axis=1
        )

        # NEW: availability_status (for individual parts)
        def get_availability_status(row):
            # Ensure these are indeed numeric types for comparison
            req_qty = row['requiredQuantity']
            curr_stock = row['currentStock']

            # Since we've done .fillna(0).astype(int) above, these should always be numeric.
            # This check is now primarily for logical validation, not type conversion.
            if not isinstance(req_qty, (int, float)) or not isinstance(curr_stock, (int, float)):
                return "Error_Non_Numeric_Qty" # Should ideally not be reached
            
            if curr_stock == 0:
                return "Critical Shortage"
            elif curr_stock < req_qty:
                return "Shortage"
            elif curr_stock > req_qty:
                return "Surplus"
            else: # curr_stock == req_qty
                return "Adequate"

        df['availability_status'] = df.apply(get_availability_status, axis=1)

        # Select and reorder desired columns for the output CSV
        final_df = df[[
            'testerId', 'tester_jig_number', 'part_number', 'unitName', 'sale_order', 'top_assy_no',
            'requiredQuantity', 'currentStock', 'availability_status', 'officialIncharge', 'status'
        ]]

        final_df.to_csv(output_path, index=False, encoding='utf-8')
        print(f"Successfully transformed data and saved to: {output_path}")
        print(f"Generated {len(final_df)} records.")

    except FileNotFoundError:
        print(f"Error: Input XLSX file not found at {input_path}. Please ensure the original XLSX is in the 'data' folder and its filename is exactly 'merged_assembly_parts_list (1).xlsx'.")
    except KeyError as ke:
        print(f"Error: Missing expected column in XLSX: {ke}. Please check your XLSX headers. Available columns: {df.columns.tolist() if 'df' in locals() else 'None'}")
    except Exception as e:
        print(f"An unexpected error occurred during transformation: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print(f"Starting data transformation process...")
    transform_data(INPUT_FILE, OUTPUT_CSV)
