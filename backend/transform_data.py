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
            print(f"Original columns detected: {original_columns}")

            df.columns = df.columns.str.strip().str.replace(' ', '_').str.lower()
            print(f"Cleaned columns: {df.columns.tolist()}")

            if 'sl_no' not in df.columns or not pd.api.types.is_numeric_dtype(df['sl_no']):
                print(f"Warning: 'sl_no' column not found or not numeric in {file_basename}. Generating sequential SL No.")
                df['sl_no'] = range(1, len(df) + 1)
            df['sl_no'] = pd.to_numeric(df['sl_no'], errors='coerce').fillna(0).astype(int)

            part_no_col_name = next((col for col in ['sub_assembly_or_part_no', 'part_no'] if col in df.columns), None)
            
            if not part_no_col_name:
                print(f"Warning: No explicit part number column ('sub_assembly_or_part_no'/'part_no') found in {file_basename}. Using 'description' for part number.")
                df['sub_assembly_or_part_no'] = df.get('description', '').astype(str)
            else:
                df['sub_assembly_or_part_no'] = df[part_no_col_name].astype(str)

            df['part_number'] = df['sub_assembly_or_part_no'].apply(lambda x: re.sub(r'[^a-zA-Z0-9-]', '', str(x)).strip())
            df['tester_jig_number'] = 'TJ-706'
            df['sale_order'] = sale_order
            df['top_assy_no'] = '130575'

            df['testerId_raw'] = df['sl_no'].astype(str) + '-' + df['part_number']
            df['testerId'] = df['tester_jig_number'] + '-' + df['sale_order'] + '-' + df['testerId_raw']

            df['unitName'] = df.get('description', 'N/A').astype(str).str.strip()

            req_qty_col_name = next((col for col in ['required_qty', 'required_quantity', 'qty_required', 'quantity_req'] if col in df.columns), None)
            curr_qty_col_name = next((col for col in ['qty_ass', 'current_stock', 'quantity_available', 'qty_available', 'available_qty'] if col in df.columns), None)
            
            if not req_qty_col_name: print(f"Warning: 'required_qty' column variants not found in {file_basename}. Defaulting requiredQuantity to 0.")
            if not curr_qty_col_name: print(f"Warning: 'qty_ass' column variants not found in {file_basename}. Defaulting currentStock to 0.")

            df['requiredQuantity_raw'] = df.get(req_qty_col_name, pd.Series(dtype=object)).astype(str).str.strip()
            df['currentStock_raw'] = df.get(curr_qty_col_name, pd.Series(dtype=object)).astype(str).str.strip()

            df['requiredQuantity'] = pd.to_numeric(
                df['requiredQuantity_raw'].str.replace(',', '', regex=False).str.extract(r'^(-?\d+\.?\d*)')[0],
                errors='coerce'
            ).fillna(0).astype(int)

            df['currentStock'] = pd.to_numeric(
                df['currentStock_raw'].str.replace(',', '', regex=False).str.extract(r'^(-?\d+\.?\d*)')[0],
                errors='coerce'
            ).fillna(0).astype(int)

            df['officialIncharge'] = '+91-9876543210'

            df['status'] = df.apply(
                lambda row: 'delivered' if row['currentStock'] >= row['requiredQuantity'] else 'pending',
                axis=1
            )

            def get_availability_status(row):
                req_qty = int(row['requiredQuantity'])
                curr_stock = int(row['currentStock'])

                if not isinstance(req_qty, (int, float)) or not isinstance(curr_stock, (int, float)):
                    print(f"Error: Non-numeric quantity detected before status calc for part {row.get('part_number')}: Req={req_qty}, Curr={curr_stock} (Types: {type(req_qty)}, {type(curr_stock)})")
                    return "Error_Non_Numeric_Qty"
                
                req_qty = max(0, req_qty)
                curr_stock = max(0, curr_stock)
                
                if curr_stock == 0 and req_qty > 0:
                    return "Critical Shortage"
                elif curr_stock < req_qty:
                    return "Shortage"
                elif curr_stock > req_qty:
                    return "Surplus"
                else: # curr_stock == req_qty OR curr_stock = 0 and req_qty = 0
                    return "Adequate"

            df['availability_status'] = df.apply(get_availability_status, axis=1)
            df['availability_status'] = df['availability_status'].astype(str).str.strip()

            print(f"Debug: Transformed Data Sample for {file_basename} (First 5 Rows for Key Columns):")
            print(df[['part_number', 'requiredQuantity_raw', 'currentStock_raw', 'requiredQuantity', 'currentStock', 'availability_status']].head().to_string())
            print(f"\nDebug: Rows with Status 'Shortage' or 'Critical Shortage' (Sample):")
            print(df[df['availability_status'].isin(['Shortage', 'Critical Shortage'])][['part_number', 'requiredQuantity', 'currentStock', 'availability_status']].head(10).to_string())
            print(f"\nDebug: Rows with Status 'Surplus' (Sample):")
            print(df[df['availability_status'] == 'Surplus'][['part_number', 'requiredQuantity', 'currentStock', 'availability_status']].head(10).to_string())
            print(f"\nDebug: Rows with Status 'Adequate' where (Req != Curr) and Req>0 (potential issue check):")
            print(df[(df['availability_status'] == 'Adequate') & (df['requiredQuantity'] != df['currentStock']) & (df['requiredQuantity'] > 0)][['part_number', 'requiredQuantity', 'currentStock', 'availability_status']].to_string())
            print(f"\nDebug: Rows with Status 'Error_Non_Numeric_Qty' (if any):")
            print(df[df['availability_status'] == 'Error_Non_Numeric_Qty'][['part_number', 'requiredQuantity_raw', 'currentStock_raw', 'availability_status']].to_string())

            status_counts = df['availability_status'].value_counts()
            print(f"\nDebug: Availability Status Counts for {file_basename}:\n{status_counts.to_string()}")

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