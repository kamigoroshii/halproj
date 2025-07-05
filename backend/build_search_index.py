# build_search_index.py
import os
from whoosh.index import create_in, open_dir
from whoosh.fields import Schema, TEXT, ID
from whoosh.qparser import QueryParser # This import isn't strictly needed here but harmless
import fitz  # PyMuPDF

# --- Configuration ---
# PROJECT_ROOT needs to be adjusted if this script is run from project root, not backend/
# If backend/build_search_index.py is run directly, os.path.abspath(__file__) points to it.
# os.path.dirname(__file__) is backend/.
# os.path.dirname(os.path.dirname(__file__)) is the project root.
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR) # Assumes backend/build_search_index.py is one level below project root

DOCS_DIR = os.path.join(PROJECT_ROOT, 'static', 'docs')
INDEX_DIR = os.path.join(PROJECT_ROOT, 'search_index') 
INDEX_NAME = 'main' # Explicitly define the index name

def build_index():
    if not os.path.exists(INDEX_DIR):
        os.makedirs(INDEX_DIR)

    schema = Schema(
        filename=ID(stored=True),
        page_num=ID(stored=True),
        content=TEXT(stored=True)
    )

    # Explicitly create/open the named index
    # Use indexname=INDEX_NAME
    ix = create_in(INDEX_DIR, schema, indexname=INDEX_NAME)
    writer = ix.writer()
    print(f"Indexing documents from: {DOCS_DIR}")

    pdf_files = [f for f in os.listdir(DOCS_DIR) if f.endswith('.pdf')]
    if not pdf_files:
        print("No PDF files found in the documentation directory.")
        return

    for pdf_file in pdf_files:
        file_path = os.path.join(DOCS_DIR, pdf_file)
        try:
            doc = fitz.open(file_path) # Open PDF with PyMuPDF
            for page_num in range(doc.page_count):
                page = doc.load_page(page_num)
                text = page.get_text("text")
                writer.add_document(
                    filename=pdf_file,
                    page_num=str(page_num + 1), # Page numbers are 1-indexed for users
                    content=text
                )
                print(f" - Added page {page_num + 1} from {pdf_file}")
            doc.close()
        except Exception as e:
            print(f"Error processing {pdf_file}: {e}")

    writer.commit()
    print(f"Indexing complete. Total documents in index: {ix.doc_count()}")

if __name__ == '__main__':
    build_index()
    print("Search index build script finished.")