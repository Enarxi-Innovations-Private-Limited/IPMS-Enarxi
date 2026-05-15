import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import inventoryService from '../../services/inventoryService';
import { useNotifier } from '../common/AppNotificationProvider.jsx';

export default function BulkAddMRItemsModal({ isOpen, onClose, requestId, requestNumber, onComplete }) {
    const { error: notifyError, success: notifySuccess } = useNotifier();
    const [file, setFile] = useState(null);
    const [previewData, setPreviewData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState([]);

    useEffect(() => {
        if (isOpen) {
            fetchItems();
            setFile(null);
            setPreviewData([]);
        }
    }, [isOpen]);

    const fetchItems = async () => {
        try {
            const res = await inventoryService.getItems();
            setItems(res.data);
        } catch (err) {
            console.error('Failed to fetch items:', err);
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
                const itemCode = normalizeValue(row.ItemCode || row['Item Code'] || row['itemCode']);
                const qty = parseFloat(row.Quantity || row.Qty || row['quantity'] || 0);
                const remarks = row.Remarks || row.remarks || '';

                const item = items.find(i => normalizeValue(i.itemCode) === itemCode);
                
                return {
                    rowNumber: idx + 1,
                    itemCode,
                    itemName: item?.name || 'UNKNOWN ITEM',
                    package: item?.package || '-',
                    quantity: qty,
                    remarks,
                    isValid: !!item && qty > 0
                };
            });
            setPreviewData(processed);
        };
        reader.readAsBinaryString(file);
    };

    const handleUpload = async () => {
        if (previewData.length === 0) return;
        const invalidRows = previewData.filter(r => !r.isValid);
        if (invalidRows.length > 0) {
            notifyError('Please fix invalid item codes or quantities before adding.');
            return;
        }

        try {
            setLoading(true);
            await inventoryService.addItemsToMRBulk(requestId, previewData.map(r => ({
                itemCode: r.itemCode,
                quantity: r.quantity,
                remarks: r.remarks
            })));

            notifySuccess(`Successfully added ${previewData.length} items to ${requestNumber}`);
            onComplete();
            onClose();
        } catch (err) {
            notifyError(err.response?.data?.message || 'Bulk add failed');
        } finally {
            setLoading(false);
        }
    };

    const downloadTemplate = () => {
        const template = [
            { 'Item Code': 'RES-000001', 'Quantity': 50, 'Remarks': 'Batch 1 requirements' },
            { 'Item Code': 'IC-000042', 'Quantity': 10, 'Remarks': 'Sensor assembly' }
        ];
        const worksheet = XLSX.utils.json_to_sheet(template);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'MR_Items_Template');
        XLSX.writeFile(workbook, 'MR_Bulk_Add_Template.xlsx');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-white">Bulk Add Items: {requestNumber}</h2>
                        <p className="text-xs text-text-secondary mt-1">Upload Excel to append components to this Material Request.</p>
                    </div>
                    <button onClick={onClose} className="text-text-secondary hover:text-white">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-1 space-y-4">
                            <div className="relative group">
                                <input 
                                    type="file" 
                                    accept=".xlsx, .xls"
                                    onChange={handleFileChange}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                />
                                <div className="border-2 border-dashed border-border-dark rounded-xl p-8 text-center group-hover:border-primary/50 transition-all bg-background-dark/30">
                                    <span className="material-symbols-outlined text-4xl text-border-dark mb-2">upload_file</span>
                                    <p className="text-sm text-text-secondary font-medium">Select Excel BOM</p>
                                    {file && <p className="text-[10px] text-primary mt-2 font-mono truncate">{file.name}</p>}
                                </div>
                            </div>
                            
                            <button 
                                onClick={downloadTemplate}
                                className="w-full text-primary text-xs font-bold hover:underline flex items-center justify-center gap-1"
                            >
                                <span className="material-symbols-outlined text-sm">download</span>
                                Download Template
                            </button>

                            <div className="p-4 bg-background-dark/50 rounded-xl border border-border-dark">
                                <h3 className="text-[10px] font-black uppercase text-text-secondary mb-2 tracking-widest">Requirements</h3>
                                <ul className="text-[10px] text-text-secondary space-y-1">
                                    <li className="flex items-center gap-1"><span className="size-1 bg-primary rounded-full"></span> Column A: "Item Code"</li>
                                    <li className="flex items-center gap-1"><span className="size-1 bg-primary rounded-full"></span> Column B: "Quantity"</li>
                                    <li className="flex items-center gap-1"><span className="size-1 bg-primary rounded-full"></span> Column C: "Remarks"</li>
                                </ul>
                            </div>
                        </div>

                        <div className="md:col-span-2">
                            <div className="bg-background-dark/30 border border-border-dark rounded-xl overflow-hidden flex flex-col h-[400px]">
                                <div className="px-4 py-2 border-b border-border-dark bg-background-dark/50 flex justify-between items-center">
                                    <span className="text-[10px] font-bold text-text-secondary uppercase">Preview</span>
                                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{previewData.length} Items</span>
                                </div>
                                <div className="overflow-y-auto flex-1">
                                    {previewData.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-50">
                                            <span className="material-symbols-outlined text-4xl mb-2">dataset</span>
                                            <p className="text-xs">No data parsed yet. Upload an Excel file to see the preview.</p>
                                        </div>
                                    ) : (
                                        <table className="w-full text-left text-xs">
                                            <thead className="bg-background-dark sticky top-0">
                                                <tr>
                                                    <th className="px-4 py-3 font-bold text-text-secondary">Component</th>
                                                    <th className="px-4 py-3 font-bold text-text-secondary text-center">Qty</th>
                                                    <th className="px-4 py-3 font-bold text-text-secondary text-center">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border-dark">
                                                {previewData.map((row, idx) => (
                                                    <tr key={idx} className={row.isValid ? 'hover:bg-white/5' : 'bg-red-500/5'}>
                                                        <td className="px-4 py-3">
                                                            <div className="text-white font-medium">{row.itemName}</div>
                                                            <div className="text-[10px] text-primary font-mono">{row.itemCode}</div>
                                                        </td>
                                                        <td className="px-4 py-3 text-center text-white font-bold">{row.quantity}</td>
                                                        <td className="px-4 py-3 text-center">
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

                    <div className="flex justify-end gap-4 pt-4 border-t border-border-dark">
                        <button 
                            type="button" 
                            onClick={onClose} 
                            className="px-6 py-2.5 rounded-lg border border-border-dark text-white font-bold hover:bg-background-dark"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleUpload}
                            disabled={loading || previewData.length === 0}
                            className="px-8 py-2.5 rounded-lg bg-gradient-primary text-white font-bold shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center gap-2"
                        >
                            {loading ? (
                                <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                            ) : (
                                <span className="material-symbols-outlined text-sm">playlist_add</span>
                            )}
                            {loading ? 'Adding Items...' : 'Add to Request'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
