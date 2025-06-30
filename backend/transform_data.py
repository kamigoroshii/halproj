import pandas as pd
import os
import re

print("Script started.")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.join(BASE_DIR, '..')
DATA_DIR = os.path.join(PROJECT_ROOT, 'data')

INPUT_FILES_CONFIG = [
    {'path': os.path.join(DATA_DIR, 'merged_assembly_parts_list (1).xlsx'), 'sale_order': '04882'},
    {'path': os.path.join(DATA_DIR, 'assembly_parts_list_variant_1.xlsx'), 'sale_order': '04883'},
    {'path': os.path.join(DATA_DIR, 'assembly_parts_list_variant_2.xlsx'), 'sale_order': '04884'}
]
OUTPUT_CSV = os.path.join(DATA_DIR, 'processed_testers_data.csv')

def transform_data(input_configs, output_path):
    print(f"Attempting to transform data from multiple sources.")
    print(f"Output will be saved to: {output_path}")

    all_dfs = []
    for config in input_configs:
        file_path = config['path']
        sale_order = config['sale_order']
        file_basename = os.path.basename(file_path)
        print(f"\n--- Processing: {file_basename} for Sale Order: {sale_order} ---")

        try:
            df = pd.read_excel(file_path, sheet_name=0)
            original_columns = df.columns.tolist()
            print(f"Original columns: {original_columns}")

            df.columns = df.columns.str.strip().str.replace(' ', '_').str.lower()
            print(f"Cleaned columns: {df.columns.tolist()}")

            # --- Handle SL_NO ---
            if 'sl_no' not in df.columns or not pd.api.types.is_numeric_dtype(df['sl_no']):
                print(f"Warning: 'sl_no' column not found or not numeric in {file_basename}. Generating sequential SL No.")
                df['sl_no'] = range(1, len(df) + 1)
            df['sl_no'] = pd.to_numeric(df['sl_no'], errors='coerce').fillna(0).astype(int) # Ensure SL_NO is int

            # --- Handle PART_NUMBER (from sub_assembly_or_part_no or description) ---
            part_no_col_exists = 'sub_assembly_or_part_no' in df.columns
            if not part_no_col_exists:
                print(f"Warning: 'sub_assembly_or_part_no' column not found in {file_basename}. Using 'description' for part number.")
                df['sub_assembly_or_part_no'] = df.get('description', '').astype(str)
            else:
                df['sub_assembly_or_part_no'] = df['sub_assembly_or_part_no'].astype(str)

            df['part_number'] = df['sub_assembly_or_part_no'].apply(lambda x: re.sub(r'[^a-zA-Z0-9-]', '', str(x)).strip())
            df['tester_jig_number'] = 'TJ-706'
            df['sale_order'] = sale_order
            df['top_assy_no'] = '130575' # Assuming this is consistent for TJ-706

            df['testerId_raw'] = df['sl_no'].astype(str) + '-' + df['part_number']
            df['testerId'] = df['tester_jig_number'] + '-' + df['sale_order'] + '-' + df['testerId_raw']

            df['unitName'] = df.get('description', 'N/A').astype(str) # Ensure unitName is string

            # --- CRITICAL FIX FOR QUANTITIES (EXTREMELY ROBUST + DEBUG) ---
            # Use original column names for 'required_qty' and 'qty_ass' if possible for clarity
            # Check for common variants of quantity column names
            req_qty_col_name = next((col for col in ['required_qty', 'required_quantity', 'req_qty', 'quantity_required'] if col in df.columns), None)
            curr_qty_col_name = next((col for col in ['qty_ass', 'current_stock', 'quantity_available', 'qty_available'] if col in df.columns), None)
            
            if not req_qty_col_name: print(f"Warning: 'required_qty' column not found variants in {file_basename}. Defaulting requiredQuantity to 0.")
            if not curr_qty_col_name: print(f"Warning: 'qty_ass' column not found variants in {file_basename}. Defaulting currentStock to 0.")

            df['requiredQuantity_raw'] = df.get(req_qty_col_name, pd.Series()).astype(str).str.strip()
            df['currentStock_raw'] = df.get(curr_qty_col_name, pd.Series()).astype(str).str.strip()

            # Extract only leading digits, convert to float (handles decimals), fill NaN with 0, then to int
            df['requiredQuantity'] = pd.to_numeric(
                df['requiredQuantity_raw'].str.extract(r'^(\d+\.?\d*)')[0], # Extract leading numbers (int or float)
                errors='coerce' # Convert non-matching to NaN
            ).fillna(0).astype(int)

            df['currentStock'] = pd.to_numeric(
                df['currentStock_raw'].str.extract(r'^(\d+\.?\d*)')[0], # Extract leading numbers
                errors='coerce'
            ).fillna(0).astype(int)
            # --- END CRITICAL FIX FOR QUANTITIES ---

            df['officialIncharge'] = '+91-9876543210'

            df['status'] = df.apply(
                lambda row: 'delivered' if row['currentStock'] >= row['requiredQuantity'] else 'pending',
                axis=1
            )

            def get_availability_status(row):
                req_qty = int(row['requiredQuantity']) # Ensure int for comparison
                curr_stock = int(row['currentStock']) # Ensure int for comparison
                
                # Debugging status calculation
                # print(f"  Part: {row.get('part_number')}, Req: {req_qty}, Curr: {curr_stock}")

                if curr_stock == 0 and req_qty > 0:
                    return "Critical Shortage"
                elif curr_stock < req_qty:
                    return "Shortage"
                elif curr_stock > req_qty:
                    return "Surplus"
                else: # curr_stock == req_qty OR curr_stock = 0 and req_qty = 0
                    return "Adequate"

            df['availability_status'] = df.apply(get_availability_status, axis=1)

            # --- Debugging print for transform_data.py output ---
            print(f"Debug: Transformed Data Sample for {file_basename} (First 5 Rows):")
            print(df[['part_number', 'requiredQuantity_raw', 'currentStock_raw', 'requiredQuantity', 'currentStock', 'availability_status']].head().to_string())
            print(f"Debug: Rows with Status NOT 'Adequate' (First 5):")
            print(df[df['availability_status'] != 'Adequate'][['part_number', 'requiredQuantity', 'currentStock', 'availability_status']].head().to_string())
            print(f"Debug: Rows with Status 'Adequate' but Required > Current (potential issue):")
            # This check helps find cases where get_availability_status might incorrectly return 'Adequate'
            print(df[(df['availability_status'] == 'Adequate') & (df['requiredQuantity'] > df['currentStock'])][['part_number', 'requiredQuantity', 'currentStock', 'availability_status']].to_string())
            # --- End Debugging print ---

            all_dfs.append(df)

        except FileNotFoundError:
            print(f"Error: Input XLSX file not found at {file_path}. Skipping this file.")
        except KeyError as ke:
            print(f"Error: Missing expected column in {file_basename}: {ke}. Please check headers. Columns: {df.columns.tolist() if 'df' in locals() else 'None'}")
        except Exception as e:
            print(f"An unexpected error occurred processing {file_basename}: {e}")
            import traceback
            traceback.print_exc()

    if not all_dfs:
        print("No dataframes were successfully processed. Output CSV will not be created.")
        return

    final_combined_df = pd.concat(all_dfs, ignore_index=True)

    final_df_cols = final_combined_df[[
        'testerId', 'tester_jig_number', 'sale_order', 'top_assy_no', 'part_number', 'unitName',
        'requiredQuantity', 'currentStock', 'availability_status', 'officialIncharge', 'status'
    ]]

    final_df_cols.to_csv(output_path, index=False, encoding='utf-8')
    print(f"\nSuccessfully transformed and combined data and saved to: {output_path}")
    print(f"Generated {len(final_df_cols)} records across all files.")

if __name__ == "__main__":
    print(f"Starting data transformation process...")
    os.makedirs(DATA_DIR, exist_ok=True)
    transform_data(INPUT_FILES_CONFIG, OUTPUT_CSV)