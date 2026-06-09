import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout';
import { useNotifier } from '../common/AppNotificationProvider.jsx';
import { getCurrentUser } from '../../services/authService';

export default function StockUploadsPage() {
    const Layout = usePortalLayout();
    const user = getCurrentUser();
    const { error: notifyError, success: notifySuccess } = useNotifier();
    
    const [file, setFile] = useState(() => {
        const storedName = sessionStorage.getItem('stock_upload_fileName');
        return storedName ? { name: storedName } : null;
    });
    const [previewData, setPreviewData] = useState(() => {
        const storedData = sessionStorage.getItem('stock_upload_previewData');
        return storedData ? JSON.parse(storedData) : [];
    });
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState([]);
    const [locations, setLocations] = useState([]);
    const [currentStock, setCurrentStock] = useState([]);
    
    const [showManualModal, setShowManualModal] = useState(false);
    const [itemSearch, setItemSearch] = useState('');
    const [manualForm, setManualForm] = useState({
        itemCode: '',
        locationCode: '',
        quantity: 0,
        remarks: 'Manual Entry'
    });

    useEffect(() => {
        fetchMasterData();
    }, []);

    useEffect(() => {
        if (previewData.length > 0) {
            sessionStorage.setItem('stock_upload_previewData', JSON.stringify(previewData));
        } else {
            sessionStorage.removeItem('stock_upload_previewData');
        }
    }, [previewData]);

    useEffect(() => {
        if (file) {
            sessionStorage.setItem('stock_upload_fileName', file.name);
        } else {
            sessionStorage.removeItem('stock_upload_fileName');
        }
    }, [file]);

    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (previewData.length > 0) {
                const message = 'You have unsaved stock adjustment data. Are you sure you want to leave?';
                e.returnValue = message;
                return message;
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [previewData]);

    const fetchMasterData = async () => {
        try {
            const [itemsRes, locsRes, stockRes] = await Promise.all([
                inventoryService.getItems(),
                inventoryService.getLocations(),
                inventoryService.getCurrentStock()
            ]);
            setItems(itemsRes.data);
            setLocations(locsRes.data);
            setCurrentStock(stockRes.data);
        } catch (err) {
            console.error('Master Data Fetch Error:', err);
        }
    };

    const normalizeValue = (val) => (val || '').toString().trim().toUpperCase();

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            setFile(selectedFile);
            readExcel(selectedFile);
        }
    };

    const readExcel = (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = e.target.result;
            const workbook = XLSX.read(data, { type: 'binary' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const parsed = XLSX.utils.sheet_to_json(sheet);
            
            const processed = parsed.map((row, idx) => {
                const itemCode = normalizeValue(row.ItemCode || row['Item Code']);
                const locCode = normalizeValue(row.LocationCode || row['Location Code']);
                const qty = parseFloat(row.Quantity || row.Qty || 0);

                const item = items.find(i => normalizeValue(i.itemCode) === itemCode);
                const location = locations.find(l => normalizeValue(l.locationCode) === locCode || normalizeValue(l.name) === locCode);
                
                const stockInfo = currentStock.find(
                    (s) =>
                        s.itemCode === itemCode &&
                        String(s.locationId?._id || s.locationId?.id || '') === String(location?._id || location?.id || '')
                );
                const systemQty = stockInfo?.quantityOnHand || 0;

                return {
                    rowNumber: idx + 1,
                    itemCode,
                    itemName: item?.name || 'UNKNOWN ITEM',
                    locationCode: locCode,
                    locationName: location?.name || 'UNKNOWN LOCATION',
                    uploadedQuantity: qty,
                    systemQuantity: systemQty,
                    adjustment: qty - systemQty,
                    remarks: row.Remarks || '',
                    isValid: !!(item && location)
                };
            });
            setPreviewData(processed);
        };
        reader.readAsBinaryString(file);
    };

    const handleAddManualRow = () => {
        const item = items.find(i => normalizeValue(i.itemCode) === normalizeValue(manualForm.itemCode));
        const location = locations.find(l => normalizeValue(l.locationCode) === normalizeValue(manualForm.locationCode) || normalizeValue(l.name) === normalizeValue(manualForm.locationCode));
        
        if (!item || !location) {
            notifyError('Please select a valid Item and Location.');
            return;
        }

        const stockInfo = currentStock.find(
            (s) =>
                s.itemCode === manualForm.itemCode &&
                String(s.locationId?._id || s.locationId?.id || '') === String(location?._id || location?.id || '')
        );
        const systemQty = stockInfo?.quantityOnHand || 0;

        const newRow = {
            itemCode: manualForm.itemCode,
            itemName: item.name,
            locationCode: manualForm.locationCode,
            locationName: location.name,
            uploadedQuantity: manualForm.quantity,
            systemQuantity: systemQty,
            adjustment: manualForm.quantity - systemQty,
            remarks: manualForm.remarks,
            rowNumber: previewData.length + 1,
            isValid: true
        };

        setPreviewData([...previewData, newRow]);
        setShowManualModal(false);
        setManualForm({ itemCode: '', locationCode: '', quantity: 0, remarks: 'Manual Entry' });
    };

    const handleUpload = async () => {
        if (previewData.length === 0) return;
        const invalidRows = previewData.filter(r => !r.isValid);
        if (invalidRows.length > 0) {
            notifyError('Please fix invalid rows before applying.');
            return;
        }

        try {
            setLoading(true);
            const isAdmin = ['SUPER_ADMIN', 'SUPER_USER', 'ADMIN'].includes(user?.role);
            
            await inventoryService.submitStockAdjustment({
                batchType: 'RECONCILIATION',
                reason: `Stock Adjustment - ${new Date().toLocaleDateString()}`,
                rows: previewData.map(r => ({
                    itemCode: r.itemCode,
                    locationCode: r.locationCode,
                    quantity: r.uploadedQuantity,
                    remarks: r.remarks
                }))
            });

            notifySuccess(isAdmin ? 'Stock adjustment applied directly.' : 'Batch submitted for admin approval.');
            setFile(null);
            setPreviewData([]);
            // Refresh local stock data
            const stockRes = await inventoryService.getCurrentStock();
            setCurrentStock(stockRes.data);
        } catch (err) {
            notifyError(err.response?.data?.message || 'Update failed');
        } finally {
            setLoading(false);
        }
    };

    const downloadTemplate = () => {
        const template = [
            { 'Item Code': 'ITEM001', 'Location Code': 'LOC001', 'Quantity': 100, 'Remarks': 'Sample entry' }
        ];
        const worksheet = XLSX.utils.json_to_sheet(template);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
        XLSX.writeFile(workbook, 'Stock_Upload_Template.xlsx');
    };

    const filteredItems = items.filter(i => 
        normalizeValue(i.itemCode).includes(normalizeValue(itemSearch)) || 
        normalizeValue(i.name).includes(normalizeValue(itemSearch))
    );

    return (
        <Layout currentPage="store-uploads">
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-[#556070] tracking-tight">Stock Uploads</h1>
                        <p className="text-text-secondary text-lg">Reconcile stock using Excel or manual single entries.</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-1 space-y-6">
                            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl">
                                <h2 className="text-sm font-black uppercase tracking-widest text-text-secondary mb-4">Stock Entry</h2>
                                <div className="space-y-4">
                                    <div className="relative group">
                                        <input 
                                            type="file" 
                                            accept=".xlsx, .xls"
                                            onChange={handleFileChange}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                        />
                                        <div className="border-2 border-dashed border-border-dark rounded-xl p-8 text-center group-hover:border-primary/50 transition-all">
                                            <span className="material-symbols-outlined text-4xl text-border-dark mb-2">cloud_upload</span>
                                            <p className="text-sm text-text-secondary">Drag & drop or <span className="text-primary font-bold">Browse</span></p>
                                            {file && <p className="text-xs text-[#556070] mt-2 font-mono bg-slate-50 p-1 rounded border border-slate-200">{file.name}</p>}
                                        </div>
                                    </div>
                                    
                                    <button 
                                        onClick={() => setShowManualModal(true)}
                                        className="w-full bg-white border border-slate-200 py-3 rounded-xl text-[#556070] font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                                    >
                                        <span className="material-symbols-outlined text-sm">add_circle</span>
                                        Add Single Item
                                    </button>

                                    <button 
                                        onClick={downloadTemplate}
                                        className="w-full text-primary text-xs font-bold hover:underline"
                                    >
                                        Download Excel Template
                                    </button>
                                </div>

                                {previewData.length > 0 && (
                                    <div className="space-y-3 mt-6">
                                        <button 
                                            onClick={handleUpload}
                                            disabled={loading}
                                            className="w-full bg-primary py-4 rounded-xl text-white font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                                        >
                                            {loading ? 'Processing...' : 'Apply Stock Adjustment'}
                                        </button>
                                        <button 
                                            onClick={() => {
                                                setFile(null);
                                                setPreviewData([]);
                                            }}
                                            disabled={loading}
                                            className="w-full bg-slate-100 hover:bg-slate-200 py-3 rounded-xl text-slate-700 font-bold transition-all disabled:opacity-50"
                                        >
                                            Clear Preview
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="lg:col-span-2">
                            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xl">
                                <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                                    <h2 className="text-sm font-black uppercase tracking-widest text-[#556070]">Preview & Validation</h2>
                                    <span className="text-[10px] bg-white px-2 py-1 rounded text-text-secondary font-bold border border-slate-200">
                                        {previewData.length} Rows Identified
                                    </span>
                                </div>
                                <div className="overflow-x-auto max-h-[600px]">
                                    {previewData.length === 0 ? (
                                        <div className="p-20 text-center">
                                            <span className="material-symbols-outlined text-border-dark text-6xl mb-4">analytics</span>
                                            <p className="text-text-secondary font-medium tracking-wide">No data to display. Upload a file or add items manually.</p>
                                        </div>
                                    ) : (
                                        <table className="w-full text-left text-xs">
                                            <thead className="bg-slate-50 text-text-secondary uppercase font-bold sticky top-0">
                                                <tr>
                                                    <th className="p-4">Item</th>
                                                    <th className="p-4">Location</th>
                                                    <th className="p-4 text-center">System</th>
                                                    <th className="p-4 text-center">Uploaded</th>
                                                    <th className="p-4 text-right">Adj</th>
                                                    <th className="p-4 text-center">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-200">
                                                {previewData.map((row, idx) => (
                                                    <tr key={idx} className={row.isValid ? 'hover:bg-white/5' : 'bg-red-500/5'}>
                                                        <td className="p-4">
                                                            <div className="text-[#556070] font-medium">{row.itemName}</div>
                                                            <div className="text-primary font-mono text-[10px]">{row.itemCode}</div>
                                                        </td>
                                                        <td className="p-4 text-text-secondary">
                                                            {row.locationName}
                                                            <div className="text-[10px] opacity-50">{row.locationCode}</div>
                                                        </td>
                                                        <td className="p-4 text-center text-text-secondary">{row.systemQuantity}</td>
                                                        <td className="p-4 text-center text-[#556070] font-bold">{row.uploadedQuantity}</td>
                                                        <td className={`p-4 text-right font-bold ${row.adjustment >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                            {row.adjustment > 0 ? '+' : ''}{row.adjustment}
                                                        </td>
                                                        <td className="p-4 text-center">
                                                            {row.isValid ? (
                                                                <span className="material-symbols-outlined text-emerald-400 text-sm">check_circle</span>
                                                            ) : (
                                                                <span className="material-symbols-outlined text-red-400 text-sm">error</span>
                                                            )}
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

            {/* Simple Manual Entry Modal */}
            {showManualModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-background-dark/80 backdrop-blur-sm" onClick={() => setShowManualModal(false)}></div>
                    <div className="relative w-full max-w-lg bg-surface-dark border border-border-dark rounded-3xl shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-border-dark flex justify-between items-center">
                            <h2 className="text-xl font-bold text-white">Add Single Stock Entry</h2>
                            <button onClick={() => setShowManualModal(false)} className="text-text-secondary hover:text-white">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1">Search Component</label>
                                <input 
                                    type="text"
                                    className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2 text-white outline-none focus:border-primary transition-all text-xs mb-2"
                                    placeholder="Type to filter items..."
                                    value={itemSearch}
                                    onChange={(e) => setItemSearch(e.target.value)}
                                />
                                <select 
                                    className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white text-sm"
                                    value={manualForm.itemCode}
                                    onChange={(e) => setManualForm({...manualForm, itemCode: e.target.value})}
                                >
                                    <option value="">Select Item...</option>
                                    {filteredItems.slice(0, 50).map(i => <option key={i._id} value={i.itemCode}>{i.itemCode} - {i.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1">Select Location</label>
                                <select 
                                    className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white text-sm"
                                    value={manualForm.locationCode}
                                    onChange={(e) => setManualForm({...manualForm, locationCode: e.target.value})}
                                >
                                    <option value="">Select Warehouse...</option>
                                    {locations.map(l => <option key={l._id} value={l.locationCode}>{l.locationCode} - {l.name}</option>)}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1">Physical Quantity</label>
                                    <input 
                                        type="number"
                                        className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white text-sm"
                                        value={manualForm.quantity}
                                        onChange={(e) => setManualForm({...manualForm, quantity: parseFloat(e.target.value) || 0})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1">Remarks</label>
                                    <input 
                                        type="text"
                                        className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white text-sm"
                                        value={manualForm.remarks}
                                        onChange={(e) => setManualForm({...manualForm, remarks: e.target.value})}
                                    />
                                </div>
                            </div>

                            <button 
                                onClick={handleAddManualRow}
                                disabled={!manualForm.itemCode || !manualForm.locationCode}
                                className="w-full bg-primary py-3 rounded-xl text-white font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-50 mt-4"
                            >
                                Add to Preview Table
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
}
