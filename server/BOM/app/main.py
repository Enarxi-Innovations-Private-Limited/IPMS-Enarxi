from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import io
import json
import asyncio
from .processor import BOMProcessor

import sys

app = FastAPI()

print("\n🔥 [BOM] API SERVER IS STARTING UP (DEBUG VERSION 2.0) 🔥")
sys.stdout.flush()

# Enable CORS for frontend connectivity
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

processor = BOMProcessor()

# Storage for the current session (persists while backend is running)
current_data = {
    "df": None,
    "detected_mapping": None,
    "columns": [],
    "results": None,
    "processing": False
}

@app.get("/session")
async def get_session():
    return {
        "has_data": current_data["df"] is not None,
        "columns": current_data["columns"],
        "detected": current_data["detected_mapping"],
        "results": current_data["results"],
        "processing": current_data["processing"]
    }

@app.post("/clear")
async def clear_session():
    from .processor import stop_all_processes
    stop_all_processes()
    current_data["df"] = None
    current_data["detected_mapping"] = None
    current_data["columns"] = []
    current_data["results"] = None
    current_data["processing"] = False
    return {"message": "Session cleared and processes stopped"}

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload an Excel file.")
    
    contents = await file.read()
    try:
        raw_io = io.BytesIO(contents)
        full_df = pd.read_excel(raw_io, header=None)
        
        header_row_idx = 0
        found_header = False
        
        for i, row in full_df.iterrows():
            row_vals = [str(val).strip().upper() for val in row.values if not pd.isna(val)]
            if (any(hp in row_vals for hp in ["RESISTOR", "COMPONENT", "ITEM", "PART NUMBER"])) and \
               (any(qp in row_vals for qp in ["QTY", "QUANTITY", "QUANTITIES"])):
                header_row_idx = i
                found_header = True
                break
        
        df = pd.read_excel(io.BytesIO(contents), header=header_row_idx)
        df = df.loc[:, ~df.columns.str.contains('^Unnamed')]
        print(f"[UPLOAD] File processed. Header row: {header_row_idx}, Shape: {df.shape}, Columns: {df.columns.tolist()}")
        
        header_info = processor.find_header_and_map(df.head(10)) 
        df = df.replace([float('inf'), float('-inf')], 0).fillna("")
            
        detected = {
            "component": header_info.get("component"),
            "quantity": header_info.get("quantity"),
            "footprint": header_info.get("footprint"),
            "vendor_codes": header_info.get("vendor_codes", {}),
            "vendors": ["ROBU", "EVELTA", "KTRON", "SHARVI"] # Default vendors
        }
        
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

        current_data["df"] = df
        current_data["detected_mapping"] = detected
        current_data["columns"] = df.columns.tolist()
        
        return {
            "columns": df.columns.tolist(),
            "detected": detected,
            "preview": df.head(5).to_dict(orient='records')
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@app.post("/process")
async def process_bom(mapping: str = Form(...)):
    if current_data["df"] is None:
        raise HTTPException(status_code=400, detail="No file uploaded.")
    
    try:
        current_data["processing"] = True
        current_data["results"] = None # Clear old results
        
        user_mapping = json.loads(mapping)
        if not user_mapping.get("vendors") or len(user_mapping.get("vendors", [])) == 0:
            user_mapping["vendors"] = ["ROBU", "EVELTA", "KTRON", "SHARVI"]
        
        if "vendors" in user_mapping:
            user_mapping["vendor_codes"] = current_data["detected_mapping"].get("vendor_codes", {})
            user_mapping["footprint"] = current_data["detected_mapping"].get("footprint")

        print(f"[PROCESS] Received Mapping: {mapping}")
        print(f"[PROCESS] Starting ASYNC BOM processing for {len(current_data['df'])} items...")
        sys.stdout.flush()
        
        # Define the background task
        async def run_optimization():
            try:
                loop = asyncio.get_event_loop()
                results = await loop.run_in_executor(
                    None, 
                    processor.process_bom, 
                    current_data["df"], 
                    user_mapping
                )
                current_data["results"] = results
                current_data["processing"] = False
                print("[PROCESS] Background optimization complete.")
            except Exception as e:
                current_data["processing"] = False
                print(f"[ERROR] Background optimization failed: {e}")

        # Start it without awaiting
        asyncio.create_task(run_optimization())
        
        return {"status": "started", "message": "Optimization running in background"}
    except Exception as e:
        current_data["processing"] = False
        print(f"[ERROR] Error starting /process: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/export")
async def export_results():
    if "results" not in current_data or not current_data["results"]:
        raise HTTPException(status_code=400, detail="No processed data to export.")
    
    results = current_data["results"]
    items_data = []
    
    for item in results["items"]:
        row = {
            "Component": item.get("component", "-"),
            "Quantity": item.get("qty", 0)
        }
        for vendor in results["vendors"]:
            price = item.get(vendor, "-")
            row[f"{vendor} Price"] = price
        
        row["Best Vendor"] = item.get("best_vendor", "-")
        row["Best Price"] = item.get("best_price", "-")
        row["Total Item Cost"] = item.get("total_amt", "-")
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
    uvicorn.run(app, host="0.0.0.0", port=8000)
