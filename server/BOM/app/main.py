from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
import pandas as pd
import io
import json
import asyncio
import sys
import traceback
from .processor import BOMProcessor

app = FastAPI()

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Headless API - No static files served directly from Python
processor = BOMProcessor()

# Storage for the current dataframe and detected columns
current_data = {
    "df": None,
    "detected_mapping": None
}

# Real-time progress tracking
progress_state = {
    "percent": 0,
    "status": "Ready",
    "is_running": False
}

@app.get("/progress")
async def get_progress():
    return JSONResponse(progress_state)

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload an Excel file.")
    
    contents = await file.read()
    try:
        # Load the entire sheet without headers to find the real column header row
        raw_io = io.BytesIO(contents)
        full_df = pd.read_excel(raw_io, header=None)
        
        # DYNAMIC HEADER DETECTION
        header_row_idx = 0
        found_header = False
        
        # Search every row for keywords: RESISTOR (or Component) and QTY
        for i, row in full_df.iterrows():
            row_vals = [str(val).strip().upper() for val in row.values if not pd.isna(val)]
            if (any(hp in row_vals for hp in ["RESISTOR", "COMPONENT", "ITEM", "PART NUMBER"])) and \
               (any(qp in row_vals for qp in ["QTY", "QUANTITY", "QUANTITIES"])):
                header_row_idx = i
                found_header = True
                break
        
        # Re-read the file starting from the detected header row
        df = pd.read_excel(io.BytesIO(contents), header=header_row_idx)
        
        # Clean unnamed columns
        df = df.loc[:, ~df.columns.str.contains('^Unnamed')]
        
        # AI Fallback/Verification for columns based on current head
        header_info = processor.find_header_and_map(df.head(10)) 
        
        # Replace NaN/Infinity
        df = df.replace([float('inf'), float('-inf')], 0).fillna("")
            
        detected = {
            "component": header_info.get("component"),
            "quantity": header_info.get("quantity"),
            "footprint": header_info.get("footprint"),
            "vendor_codes": header_info.get("vendor_codes", {})
        }
        
        # Force manual mapping if AI missed standard names
        if not detected["component"]:
            for col in df.columns:
                if str(col).strip().upper() in ["RESISTOR", "COMPONENT", "PART NUMBER"]:
                    detected["component"] = col
                    break
        
        if not detected["quantity"]:
            for col in df.columns:
                if str(col).strip().upper() in ["QTY", "QUANTITY"]:
                    detected["quantity"] = col
                    break

        # Save to memory
        current_data["df"] = df
        current_data["detected_mapping"] = detected
        
        return {
            "columns": df.columns.tolist(),
            "detected": detected,
            "preview": df.head(5).to_dict(orient='records')
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@app.post("/inject")
async def inject_data(payload: dict):
    """
    Inject JSON data directly into the processor.
    Expected format: { "items": [{ "component": "...", "qty": 10 }, ...] }
    """
    try:
        items = payload.get("items", [])
        if not items:
            raise HTTPException(status_code=400, detail="No items provided.")
        
        df = pd.DataFrame(items)
        df = df.replace([float('inf'), float('-inf')], "").fillna("")
        
        # Ensure standard column names if they don't exist
        if "component" not in df.columns and "Component" not in df.columns:
             # Try to find a column that looks like a component
             pass 

        # Simple mapping for injected data
        detected = {
            "component": "component" if "component" in df.columns else "Component",
            "quantity": "qty" if "qty" in df.columns else "Quantity",
            "footprint": "footprint" if "footprint" in df.columns else None,
            "vendor_codes": {}
        }

        for vendor in ["ROBU", "EVELTA", "ELEVTA", "KTRON", "SHARVI", "ELEMENT14"]:
            if vendor in df.columns:
                detected["vendor_codes"][vendor] = vendor
        
        # Save to memory
        current_data["df"] = df
        current_data["detected_mapping"] = detected
        
        return {
            "columns": df.columns.tolist(),
            "detected": detected,
            "preview": df.head(5).to_dict(orient='records')
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error injecting data: {str(e)}")

@app.post("/process")
async def process_bom(payload: dict):
    if current_data["df"] is None:
        raise HTTPException(status_code=400, detail="No file uploaded.")
    
    try:
        # payload expected to have a 'mapping' key which is a dict or a JSON string
        user_mapping = payload.get("mapping", {})
        if isinstance(user_mapping, str):
            user_mapping = json.loads(user_mapping)
        
        # If no vendors were selected in the UI, use all default vendors
        if not user_mapping.get("vendors") or len(user_mapping.get("vendors", [])) == 0:
            user_mapping["vendors"] = ["ROBU", "EVELTA", "KTRON", "SHARVI"]
        
        # Ensure vendor_codes or vendor logic is correctly passed to processor
        # If user selected vendors in UI, update mapping
        if "vendors" in user_mapping:
            # Re-map vendor selections to codes if needed
            vendor_codes = dict(current_data["detected_mapping"].get("vendor_codes", {}))
            # Fallback: if injected payload has direct vendor columns (ROBU/EVELTA/KTRON/SHARVI),
            # map vendor to same column name so processor can use those SKU values.
            for vendor in user_mapping.get("vendors", []):
                if vendor not in vendor_codes and vendor in current_data["df"].columns:
                    vendor_codes[vendor] = vendor
            user_mapping["vendor_codes"] = vendor_codes
            user_mapping["footprint"] = current_data["detected_mapping"].get("footprint")

        print("[BOM] API triggered processor via thread executor")
        
        # Reset progress
        progress_state["percent"] = 0
        progress_state["status"] = "Initializing..."
        progress_state["is_running"] = True

        def update_progress(p, s):
            p = min(100, round(p, 2))
            progress_state["percent"] = p
            progress_state["status"] = s

        # Run the blocking Playwright code in a separate thread to prevent FastAPI from freezing
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(
            None, 
            lambda: processor.process_bom(
                current_data["df"], 
                user_mapping,
                progress_callback=update_progress
            )
        )
        
        progress_state["percent"] = 100
        progress_state["status"] = "Complete"
        progress_state["is_running"] = False
        
        # Store processed results for export
        current_data["results"] = results
        
        return results
    except Exception as e:
        try:
            traceback.print_exc()
        except Exception:
            pass
        detail = str(e).strip() or "Unknown BOM processing error."
        raise HTTPException(status_code=500, detail=detail)

@app.get("/export")
async def export_results():
    if "results" not in current_data or not current_data["results"]:
        raise HTTPException(status_code=400, detail="No processed data to export.")
    
    results = current_data["results"]
    items_data = []
    
    for item in results["items"]:
        row = {
            "Component": item["component"],
            "Quantity": item["qty"]
        }
        # Add vendor prices
        for vendor in results["vendors"]:
            price = item["prices"].get(vendor, "-")
            row[f"{vendor} Price"] = price
        
        row["Best Vendor"] = item["best_vendor"]
        row["Best Price"] = item["best_price"]
        row["Total Item Cost"] = item["total_amt"]
        items_data.append(row)
    
    output_df = pd.DataFrame(items_data)
    
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        output_df.to_excel(writer, index=False, sheet_name='Comparison')
    
    output.seek(0)
    
    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=BOM_Price_Comparison.xlsx"}
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
