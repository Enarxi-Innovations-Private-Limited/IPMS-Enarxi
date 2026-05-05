import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout';

export default function StockUploadsPage() {
    const Layout = usePortalLayout();
    const [file, setFile] = useState(null);
    const [previewData, setPreviewData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState([]);
    const [locations, setLocations] = useState([]);
    const [currentStock, setCurrentStock] = useState([]);

    useEffect(() => {
        const loadMasterData = async () => {
            try {
                const [itemRes, locRes, stockRes] = await Promise.all([
                    inventoryService.getItems(),
                    inventoryService.getLocations(),
                    inventoryService.getCurrentStock()
                ]);
                setItems(itemRes.data);
                setLocations(locRes.data);
                setCurrentStock(stockRes.data);
            } catch (err) {
                console.error('Failed to load master data:', err);
            }
        };
        loadMasterData();
    }, []);

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            setFile(selectedFile);
            parseExcel(selectedFile);
        }
    };

    const parseExcel = (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet);
            
            // Map excel data to internal format
            const mapped = json.map(row => {
                const itemCode = row['Item Code']?.toString().trim();
                const locationCode = row['Location Code']?.toString().trim();
                const newQty = parseFloat(row['New Quantity']) || 0;
                
                const item = items.find(i => i.itemCode === itemCode);
                const location = locations.find(l => l.locationCode === locationCode);
                
                // Find system quantity for this item at this location
                // currentStock is list of { id, itemCode, locations: [{location, onHand}] }
                const stockInfo = currentStock.find(s => s.itemCode === itemCode);
                const locInfo = stockInfo?.locations.find(l => l.location === location?.name);
                const systemQty = locInfo ? locInfo.onHand : 0;

                return {
                    itemCode,
                    itemName: item?.name || 'UNKNOWN ITEM',
                    itemId: item?.id,
                    locationCode,
                    locationName: location?.name || 'UNKNOWN LOCATION',
                    locationId: location?.id,
                    systemQuantity: systemQty,
                    uploadedQuantity: newQty,
                    adjustment: newQty - systemQty,
                    remarks: row['Remarks'] || 'Bulk Upload',
                    isValid: !!(item && location)
                };
            });
            setPreviewData(mapped);
        };
        reader.readAsArrayBuffer(file);
    };

    const handleUpload = async () => {
        if (previewData.length === 0) return;
        const invalidRows = previewData.filter(r => !r.isValid);
        if (invalidRows.length > 0) {
            alert('Please fix invalid rows (unknown Item or Location codes) before uploading.');
            return;
        }

        try {
            setLoading(true);
            await inventoryService.submitStockAdjustment({
                batchType: 'RECONCILIATION_UPLOAD',
                reason: `Bulk Stock Upload - ${new Date().toLocaleDateString()}`,
                lines: previewData.map(r => ({
                    itemId: r.itemId,
                    locationId: r.locationId,
                    systemQuantity: r.systemQuantity,
                    uploadedQuantity: r.uploadedQuantity,
                    remarks: r.remarks
                }))
            });
            alert('Stock adjustment batch submitted for approval!');
            setFile(null);
            setPreviewData([]);
        } catch (err) {
            alert(err.response?.data?.message || 'Upload failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Layout currentPage="store-uploads">
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-white tracking-tight">Stock Uploads</h1>
                        <p className="text-text-secondary text-lg">Perform bulk stock reconciliation using Excel templates.</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Upload Controls */}
                        <div className="lg:col-span-1 space-y-6">
                            <div className="bg-surface-dark border border-border-dark rounded-2xl p-6 shadow-xl">
                                <h2 className="text-sm font-black uppercase tracking-widest text-text-secondary mb-4">Step 1: Upload File</h2>
                                <div className="space-y-4">
                                    <div className="relative group">
                                        <input 
                                            type="file" 
                                            accept=".xlsx, .xls"
                                            onChange={handleFileChange}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                        />
                                        <div className="border-2 border-dashed border-border-dark rounded-xl p-8 text-center group-hover:border-primary/50 transition-all bg-background-dark/30">
                                            <span className="material-symbols-outlined text-4xl text-text-secondary mb-2 block">cloud_upload</span>
                                            <span className="text-sm text-white font-bold">{file ? file.name : 'Select Excel File'}</span>
                                            <span className="text-[10px] text-text-secondary block mt-1">.xlsx or .xls files only</span>
                                        </div>
                                    </div>
                                    
                                    <div className="bg-background-dark/50 rounded-xl p-4 border border-border-dark">
                                        <h3 className="text-xs font-bold text-white mb-2 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-sm text-primary">info</span>
                                            Template Columns:
                                        </h3>
                                        <ul className="text-[10px] text-text-secondary space-y-1 ml-6 list-disc">
                                            <li><span className="text-white font-bold">Item Code</span> (Internal code)</li>
                                            <li><span className="text-white font-bold">Location Code</span> (Bin/Wh code)</li>
                                            <li><span className="text-white font-bold">New Quantity</span> (Actual count)</li>
                                            <li><span className="text-white font-bold">Remarks</span> (Optional)</li>
                                        </ul>
                                    </div>

                                    <button 
                                        onClick={handleUpload}
                                        disabled={loading || previewData.length === 0}
                                        className="w-full bg-primary hover:bg-primary/90 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                                    >
                                        {loading ? (
                                            <div className="animate-spin size-5 border-2 border-white border-t-transparent rounded-full"></div>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined">publish</span>
                                                Submit for Approval
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Preview Table */}
                        <div className="lg:col-span-2">
                            <div className="bg-surface-dark border border-border-dark rounded-2xl shadow-xl overflow-hidden h-full flex flex-col">
                                <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface flex justify-between items-center">
                                    <h2 className="text-sm font-black uppercase tracking-widest text-text-secondary">Step 2: Preview & Validate</h2>
                                    <span className="text-[10px] bg-background-dark px-2 py-1 rounded border border-border-dark text-text-secondary">
                                        {previewData.length} Rows Detected
                                    </span>
                                </div>
                                
                                <div className="flex-1 overflow-auto custom-scrollbar">
                                    {previewData.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center p-12 text-center opacity-50">
                                            <span className="material-symbols-outlined text-6xl mb-4">table_view</span>
                                            <p className="text-text-secondary">Upload a file to see the data preview here.</p>
                                        </div>
                                    ) : (
                                        <table className="w-full text-left text-xs">
                                            <thead className="bg-background-dark/50 sticky top-0">
                                                <tr className="text-text-secondary font-black uppercase">
                                                    <th className="px-4 py-3">Status</th>
                                                    <th className="px-4 py-3">Item</th>
                                                    <th className="px-4 py-3">Location</th>
                                                    <th className="px-4 py-3 text-right">System</th>
                                                    <th className="px-4 py-3 text-right">Physical</th>
                                                    <th className="px-4 py-3 text-right">Adj</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border-dark">
                                                {previewData.map((row, idx) => (
                                                    <tr key={idx} className={`${row.isValid ? 'hover:bg-white/5' : 'bg-red-500/5'} transition-colors`}>
                                                        <td className="px-4 py-3">
                                                            {row.isValid ? (
                                                                <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                                                            ) : (
                                                                <span className="material-symbols-outlined text-red-500 text-sm" title="Unknown Code">error</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="text-white font-bold">{row.itemCode}</div>
                                                            <div className="text-[10px] text-text-secondary truncate max-w-[150px]">{row.itemName}</div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="text-white">{row.locationCode}</div>
                                                            <div className="text-[10px] text-text-secondary">{row.locationName}</div>
                                                        </td>
                                                        <td className="px-4 py-3 text-right font-mono text-text-secondary">{row.systemQuantity}</td>
                                                        <td className="px-4 py-3 text-right font-mono text-white font-bold">{row.uploadedQuantity}</td>
                                                        <td className={`px-4 py-3 text-right font-mono font-bold ${row.adjustment > 0 ? 'text-emerald-400' : row.adjustment < 0 ? 'text-red-400' : 'text-text-secondary'}`}>
                                                            {row.adjustment > 0 ? '+' : ''}{row.adjustment}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
