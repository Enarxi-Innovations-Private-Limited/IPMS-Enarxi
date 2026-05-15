import { useState, useEffect } from 'react';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout.js';
import { useNotifier } from '../common/AppNotificationProvider.jsx';
import BulkAddMRItemsModal from './BulkAddMRItemsModal.jsx';
import * as XLSX from 'xlsx';

export default function MaterialRequestPage({ currentPage: propCurrentPage }) {
    const Layout = usePortalLayout();
    const { error: notifyError, success: notifySuccess } = useNotifier();
    const currentPage = propCurrentPage || 'material-requests';
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [projects, setProjects] = useState([]);
    const [items, setItems] = useState([]);
    const [error, setError] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [selectedMR, setSelectedMR] = useState(null);
    const [viewingMR, setViewingMR] = useState(null);
    const [viewingDetails, setViewingDetails] = useState(null);

    // Form State
    const [formData, setFormData] = useState({
        projectId: '',
        items: [{ itemCode: '', quantity: 1 }],
        notes: ''
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const [reqRes, projRes, itemsRes] = await Promise.all([
                    inventoryService.getMaterialRequests(),
                    inventoryService.getProjects(),
                    inventoryService.getItems()
                ]);
                setRequests(reqRes.data);
                setProjects(projRes.data.filter(p => ['ACTIVE', 'PLANNING'].includes(p.status)));
                setItems(itemsRes.data);
            } catch (err) {
                setError('Failed to load data. Please check connections.');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleAddItem = () => {
        setFormData({ ...formData, items: [...formData.items, { itemCode: '', quantity: 1 }] });
    };

    const handleItemChange = (index, field, value) => {
        const newItems = [...formData.items];
        newItems[index][field] = value;
        setFormData({ ...formData, items: newItems });
    };

    const handleBulkUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const data = evt.target.result;
            const workbook = XLSX.read(data, { type: 'binary' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const parsed = XLSX.utils.sheet_to_json(sheet);

            const normalize = (s) => (s || '').toString().trim().toUpperCase();

            const importedItems = parsed.map(row => {
                const code = normalize(row.ItemCode || row['Item Code'] || row['itemCode']);
                const qty = parseFloat(row.Quantity || row.Qty || row['quantity'] || 0);
                
                // Only include if item exists in our master list
                const itemExists = items.some(i => normalize(i.itemCode) === code);
                return itemExists && qty > 0 ? { itemCode: code, quantity: qty } : null;
            }).filter(Boolean);

            if (importedItems.length > 0) {
                setFormData(prev => ({
                    ...prev,
                    items: [...prev.items.filter(i => i.itemCode !== ''), ...importedItems]
                }));
                notifySuccess(`Imported ${importedItems.length} items from Excel.`);
            } else {
                notifyError('No valid items found in Excel. Check Item Codes and Quantities.');
            }
        };
        reader.readAsBinaryString(file);
        // Reset input
        e.target.value = '';
    };

    const handleViewDetails = async (req) => {
        try {
            setViewingMR(req);
            const res = await inventoryService.getMaterialRequestDetails(req.id || req._id);
            setViewingDetails(res.data);
        } catch (err) {
            notifyError('Failed to load request details.');
        }
    };

    const downloadTemplate = () => {
        const data = [
            { "Item Code": "RES-10K", "Quantity": 100 },
            { "Item Code": "CAP-0.1UF", "Quantity": 50 }
        ];
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Template");
        XLSX.writeFile(wb, "Material_Request_Template.xlsx");
        notifySuccess("Template downloaded. Fill 'Item Code' and 'Quantity' columns.");
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);
            await inventoryService.submitMaterialRequest({
                projectId: formData.projectId,
                payload: JSON.stringify(formData.items.map((item, i) => ({
                    rowNumber: i + 1,
                    itemCode: item.itemCode,
                    requiredQuantity: item.quantity
                }))),
                notes: formData.notes
            });
            setShowModal(false);
            // Refresh requests
            const res = await inventoryService.getMaterialRequests();
            setRequests(res.data);
            notifySuccess('Material request submitted successfully.');
        } catch (err) {
            notifyError(err.response?.data?.message || 'Submission failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Layout currentPage={currentPage}>
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                        <div>
                            <h1 className="text-3xl md:text-4xl font-bold text-[#556070] tracking-tight mb-2">
                                Material Requests
                            </h1>
                            <p className="text-text-secondary text-lg">
                                Source components for your hardware projects.
                            </p>
                        </div>
                        <button
                            onClick={() => setShowModal(true)}
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-primary text-white font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all"
                        >
                            <span className="material-symbols-outlined">add</span>
                            New Request
                        </button>
                    </div>

                    {/* Request List */}
                    <div className="bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-200 bg-[#ECF1FF]/40">
                            <h2 className="text-lg font-semibold text-[#556070] flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">history</span>
                                Request History
                            </h2>
                        </div>

                        {loading && requests.length === 0 ? (
                            <div className="p-20 text-center">
                                <div className="animate-spin size-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                                <p className="text-text-secondary">Loading your requests...</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-6 py-4 text-xs font-medium uppercase text-text-secondary">Req #</th>
                                            <th className="px-6 py-4 text-xs font-medium uppercase text-text-secondary">Project</th>
                                            <th className="px-6 py-4 text-xs font-medium uppercase text-text-secondary">Items</th>
                                            <th className="px-6 py-4 text-xs font-medium uppercase text-text-secondary">Status</th>
                                            <th className="px-6 py-4 text-xs font-medium uppercase text-text-secondary">Date</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-dark">
                                        {requests.map((req) => (
                                            <tr key={req.id || req._id} className="hover:bg-background-dark/30 transition-colors">
                                                <td className="px-6 py-4">
                                                    <button 
                                                        onClick={() => handleViewDetails(req)}
                                                        className="font-mono text-primary text-sm hover:underline hover:text-[#1e293b] transition-all text-left"
                                                    >
                                                        {req.requestNumber}
                                                    </button>
                                                </td>
                                                <td className="px-6 py-4 text-[#556070] font-medium">{req.project?.name}</td>
                                                <td className="px-6 py-4 text-text-secondary">{req._count?.lines || 0} items</td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${req.status === 'SUBMITTED' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                                                            req.status === 'ROUTED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                                                'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                                                        }`}>
                                                        {req.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-text-secondary text-sm">
                                                    {new Date(req.createdAt).toLocaleDateString()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* New Request Modal */}
            {showModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowModal(false)}></div>
                    
                    {/* Modal Container */}
                    <div className="relative bg-white w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl rounded-xl border border-slate-200">
                        {/* Modal Header */}
                        <header className="flex justify-between items-center px-8 py-6 border-b border-slate-200 bg-[#ECF1FF]/50">
                            <div className="flex flex-col text-left">
                                <h1 className="text-2xl font-bold text-[#002045]">Submit Material Request</h1>
                                <p className="text-[11px] text-slate-500 uppercase tracking-widest mt-1 font-medium">Multi-Project Hardware Procurement</p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-[#002045] transition-colors">
                                <span className="material-symbols-outlined text-[28px]">close</span>
                            </button>
                        </header>

                        {/* Modal Content */}
                        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-8 py-6 space-y-8">
                            {/* Summary Section */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="md:col-span-2 text-left">
                                    <label className="text-[12px] font-bold text-slate-500 uppercase mb-2 block">Request Overview</label>
                                    <p className="text-[14px] text-slate-600">Please select a project and specify the components required for procurement. This request will be processed through the central procurement audit trail.</p>
                                </div>
                                <div className="flex flex-col justify-end items-start md:items-end">
                                    <div className="flex items-center gap-4">
                                        <button 
                                            type="button"
                                            onClick={downloadTemplate}
                                            className="text-[#002045] text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 hover:underline"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">download</span>
                                            Template
                                        </button>
                                        <div className="relative">
                                            <input 
                                                type="file" 
                                                accept=".xlsx, .xls" 
                                                onChange={handleBulkUpload}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            />
                                            <button className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 transition-all rounded-lg text-[12px] uppercase font-bold" type="button">
                                                <span className="material-symbols-outlined text-[18px]">upload_file</span>
                                                Bulk Upload CSV
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Project Selection */}
                            <div className="space-y-2 text-left">
                                <label className="text-[12px] font-bold text-slate-500 uppercase block">Target Project</label>
                                <select 
                                    className="w-full md:w-1/2 h-11 px-3 bg-white border border-slate-200 focus:border-[#002045] focus:ring-0 rounded-lg text-[14px] text-slate-800 outline-none"
                                    required
                                    value={formData.projectId}
                                    onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                                >
                                    <option value="">Choose a hardware project...</option>
                                    {projects.map(p => (
                                        <option key={p._id || p.id} value={p._id || p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Item Table */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-[12px] font-bold text-slate-500 uppercase">Component Requirements</h3>
                                    <button 
                                        type="button"
                                        onClick={handleAddItem}
                                        className="text-[#002045] text-[12px] font-bold uppercase flex items-center gap-1 hover:underline"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">add</span>
                                        Add Row
                                    </button>
                                </div>
                                
                                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-[#ECF1FF]/30 border-b border-slate-200">
                                                <th className="px-4 py-3 text-[12px] font-bold text-slate-600 uppercase">COMPONENT DETAILS</th>
                                                <th className="px-4 py-3 text-[12px] font-bold text-slate-600 uppercase w-32">QTY REQUIRED</th>
                                                <th className="px-4 py-3 text-[12px] font-bold text-slate-600 uppercase w-12 text-center"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {formData.items.map((row, idx) => {
                                                const selectedItem = items.find(i => i.itemCode === row.itemCode);
                                                return (
                                                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="px-4 py-4">
                                                            <div className="flex flex-col gap-1">
                                                                <select
                                                                    className="w-full h-10 px-3 bg-white border border-slate-200 focus:border-[#002045] focus:ring-0 rounded-lg text-[13px] font-medium"
                                                                    value={row.itemCode}
                                                                    onChange={(e) => handleItemChange(idx, 'itemCode', e.target.value)}
                                                                    required
                                                                >
                                                                    <option value="">Select component...</option>
                                                                    {items.map(i => (
                                                                        <option key={i._id || i.id} value={i.itemCode}>
                                                                            [{i.itemCode}] {i.name}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                                {selectedItem && (
                                                                    <div className="px-3 py-1 bg-blue-50/50 rounded text-[11px] text-blue-700 flex items-center gap-2">
                                                                        <span className="material-symbols-outlined text-[14px]">info</span>
                                                                        <span>{selectedItem.classificationId?.name || 'Electronic'} | {selectedItem.package || 'SMD'}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-4">
                                                            <input 
                                                                type="number"
                                                                className="w-full h-10 px-3 bg-white border border-slate-200 focus:border-[#002045] focus:ring-0 rounded-lg text-[13px] font-bold text-center"
                                                                value={row.quantity}
                                                                onChange={(e) => handleItemChange(idx, 'quantity', parseFloat(e.target.value))}
                                                                required
                                                                min="1"
                                                            />
                                                        </td>
                                                        <td className="px-4 py-4 text-center">
                                                            <button 
                                                                type="button"
                                                                onClick={() => {
                                                                    const newItems = formData.items.filter((_, i) => i !== idx);
                                                                    setFormData({ ...formData, items: newItems.length ? newItems : [{ itemCode: '', quantity: 1 }] });
                                                                }}
                                                                className="text-slate-400 hover:text-red-500 transition-colors"
                                                            >
                                                                <span className="material-symbols-outlined text-[20px]">delete</span>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Additional Notes Section */}
                            <div className="space-y-4 text-left">
                                <label className="text-[12px] font-bold text-slate-500 uppercase block">Additional Project Notes</label>
                                <textarea 
                                    className="w-full p-4 bg-white border border-slate-200 focus:border-[#002045] focus:ring-0 rounded-xl text-[14px] text-slate-700 resize-none h-24 outline-none"
                                    placeholder="Briefly state the purpose of this multi-project request (e.g., prototype run for Q3 hardware milestones)..."
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                ></textarea>
                            </div>
                        </form>

                        {/* Modal Footer */}
                        <footer className="px-8 py-6 bg-[#ECF1FF]/20 border-t border-slate-200 flex justify-between items-center">
                            <div className="flex items-center gap-2 text-slate-500">
                                <span className="material-symbols-outlined text-[18px]">info</span>
                                <span className="text-[11px] font-bold uppercase tracking-wider">Procurement Routing: Central Office</span>
                            </div>
                            <div className="flex gap-4">
                                <button 
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="px-6 py-2.5 text-[12px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    onClick={handleSubmit}
                                    disabled={loading}
                                    className="px-8 py-2.5 bg-[#002045] text-white text-[12px] font-bold uppercase tracking-widest rounded-lg hover:shadow-lg transition-all active:scale-95 disabled:opacity-50"
                                >
                                    {loading ? 'Submitting...' : 'Submit Request'}
                                </button>
                            </div>
                        </footer>
                    </div>
                </div>
            )}

            <BulkAddMRItemsModal 
                isOpen={showBulkModal}
                onClose={() => setShowBulkModal(false)}
                requestId={selectedMR?.id || selectedMR?._id}
                requestNumber={selectedMR?.requestNumber}
                onComplete={async () => {
                    const res = await inventoryService.getMaterialRequests();
                    setRequests(res.data);
                }}
            />

            {/* View Details Modal */}
            {viewingMR && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => { setViewingMR(null); setViewingDetails(null); }}></div>
                    <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-white">Request Details: {viewingMR.requestNumber}</h2>
                                <div className="flex gap-4 mt-1">
                                    <span className="text-xs text-text-secondary flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[14px]">account_tree</span> {viewingMR.project?.name}
                                    </span>
                                    <span className="text-xs text-text-secondary flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[14px]">calendar_today</span> {new Date(viewingMR.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>
                            <button onClick={() => { setViewingMR(null); setViewingDetails(null); }} className="text-text-secondary hover:text-white p-2">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto">
                            {!viewingDetails ? (
                                <div className="py-20 text-center">
                                    <div className="animate-spin size-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                                    <p className="text-text-secondary text-sm">Fetching line items...</p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="bg-background-dark/30 border border-border-dark rounded-xl overflow-hidden">
                                        <table className="w-full text-left text-xs">
                                            <thead className="bg-background-dark/50">
                                                <tr>
                                                    <th className="px-4 py-3 font-bold text-text-secondary uppercase">#</th>
                                                    <th className="px-4 py-3 font-bold text-text-secondary uppercase">Component</th>
                                                    <th className="px-4 py-3 font-bold text-text-secondary uppercase text-center">Required Qty</th>
                                                    <th className="px-4 py-3 font-bold text-text-secondary uppercase text-center">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border-dark">
                                                {viewingDetails.lines?.map((line, idx) => (
                                                    <tr key={line._id || idx} className="hover:bg-white/5 transition-colors">
                                                        <td className="px-4 py-3 text-text-secondary font-mono">{line.rowNumber || idx + 1}</td>
                                                        <td className="px-4 py-3">
                                                            <div className="text-white font-medium">{line.itemId?.name || 'N/A'}</div>
                                                            <div className="text-[10px] text-primary font-mono">{line.itemId?.itemCode || line.itemCode}</div>
                                                        </td>
                                                        <td className="px-4 py-3 text-center text-white font-bold">{line.requiredQuantity}</td>
                                                        <td className="px-4 py-3 text-center">
                                                            <div className="flex flex-col items-center gap-1">
                                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                                                    line.status === 'SUBMITTED' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                                                                    line.status === 'ROUTED_TO_STORE' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                                                                    line.status === 'ROUTED_TO_PURCHASE' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                                                                    'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                                                                }`}>
                                                                    {line.status.replace(/_/g, ' ')}
                                                                </span>
                                                                
                                                                {line.lifecycle?.details && (
                                                                    <div className="text-[10px] text-text-secondary flex flex-col items-center">
                                                                        <span className="font-bold text-white/80">{line.lifecycle.details.label}</span>
                                                                        {line.lifecycle.details.expectedDate && (
                                                                            <span className="text-[9px] text-primary mt-0.5">
                                                                                ETD: {new Date(line.lifecycle.details.expectedDate).toLocaleDateString()}
                                                                            </span>
                                                                        )}
                                                                        {line.lifecycle.details.dispatchNumber && (
                                                                            <span className="text-[9px] text-emerald-400 mt-0.5">
                                                                                Ref: {line.lifecycle.details.dispatchNumber}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    
                                    {viewingDetails.notes && (
                                        <div className="p-4 bg-background-dark/30 border border-border-dark rounded-xl">
                                            <h3 className="text-[10px] font-black uppercase text-text-secondary mb-2 tracking-widest">Notes</h3>
                                            <p className="text-sm text-text-secondary leading-relaxed">{viewingDetails.notes}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        
                        <div className="p-4 border-t border-border-dark bg-background-dark/20 flex justify-end">
                            <button 
                                onClick={() => { setViewingMR(null); setViewingDetails(null); }}
                                className="px-6 py-2 rounded-lg bg-surface-light border border-border-dark text-white font-bold hover:bg-border-dark transition-all text-sm"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
}
