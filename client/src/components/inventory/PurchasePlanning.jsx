import { useEffect, useMemo, useState } from 'react';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout';
import { useNotifier } from '../common/AppNotificationProvider.jsx';

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function tabButtonClass(active) {
    return `px-4 py-2 rounded-lg text-xs font-bold transition-all ${active ? 'bg-primary text-white shadow-lg' : 'text-text-secondary hover:text-white'}`;
}

export default function PurchasePlanning() {
    const Layout = usePortalLayout();
    const { error: notifyError, success: notifySuccess } = useNotifier();
    const [tab, setTab] = useState('individual');
    const [vendors, setVendors] = useState([]);
    const [queueRows, setQueueRows] = useState([]);
    const [combinedRows, setCombinedRows] = useState([]);
    const [orders, setOrders] = useState([]);
    const [selectedBatchId, setSelectedBatchId] = useState('');
    const [lineStates, setLineStates] = useState({});
    const [combinedStates, setCombinedStates] = useState({});
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [queueRes, combinedRes, vendorRes, orderRes] = await Promise.all([
                inventoryService.getPurchaseRequestQueue(),
                inventoryService.getCombinedPurchaseDemand(),
                inventoryService.getVendors(),
                inventoryService.getPurchaseOrders()
            ]);
            const queue = queueRes.data || [];
            const selectedFallbackId = selectedBatchId && queue.some((batch) => batch.id === selectedBatchId)
                ? selectedBatchId
                : (queue[0]?.id || '');

            setQueueRows(queue);
            setCombinedRows(combinedRes.data || []);
            setVendors(vendorRes.data || []);
            setOrders(orderRes.data || []);
            setSelectedBatchId(selectedFallbackId);
        } catch (err) {
            notifyError(err.response?.data?.message || 'Failed to load purchase planning data.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const selectedBatch = useMemo(
        () => queueRows.find((batch) => batch.id === selectedBatchId) || null,
        [queueRows, selectedBatchId]
    );

    useEffect(() => {
        if (!selectedBatch) return;
        const next = {};
        (selectedBatch.lines || []).forEach((line) => {
            next[line.purchaseRequestLineId] = {
                selected: false,
                vendorId: '',
                orderQuantity: String(line.pendingQuantity || 0),
                rate: '',
                gstPercent: '18'
            };
        });
        setLineStates(next);
    }, [selectedBatch?.id]);

    useEffect(() => {
        const next = {};
        (combinedRows || []).forEach((row) => {
            next[row.itemId] = {
                selected: false,
                vendorId: '',
                orderQuantity: String(row.totalRequiredQuantity || 0),
                rate: '',
                gstPercent: '18'
            };
        });
        setCombinedStates(next);
    }, [combinedRows]);

    const individualPayload = useMemo(() => {
        if (!selectedBatch) return [];
        return (selectedBatch.lines || [])
            .filter((line) => lineStates[line.purchaseRequestLineId]?.selected)
            .map((line) => ({
                itemId: line.itemId,
                itemCode: line.itemCode,
                vendorId: lineStates[line.purchaseRequestLineId]?.vendorId || '',
                requestedQuantity: toNumber(line.pendingQuantity),
                orderQuantity: toNumber(lineStates[line.purchaseRequestLineId]?.orderQuantity),
                rate: toNumber(lineStates[line.purchaseRequestLineId]?.rate),
                gstPercent: toNumber(lineStates[line.purchaseRequestLineId]?.gstPercent || 18),
                sourceLines: [{
                    purchaseRequestLineId: line.purchaseRequestLineId,
                    requestedQuantity: toNumber(line.pendingQuantity)
                }]
            }));
    }, [selectedBatch, lineStates]);

    const combinedPayload = useMemo(
        () =>
            (combinedRows || [])
                .filter((row) => combinedStates[row.itemId]?.selected)
                .map((row) => ({
                    itemId: row.itemId,
                    itemCode: row.itemCode,
                    vendorId: combinedStates[row.itemId]?.vendorId || '',
                    requestedQuantity: toNumber(row.totalRequiredQuantity),
                    orderQuantity: toNumber(combinedStates[row.itemId]?.orderQuantity),
                    rate: toNumber(combinedStates[row.itemId]?.rate),
                    gstPercent: toNumber(combinedStates[row.itemId]?.gstPercent || 18),
                    sourceLines: (row.requestLines || []).map((entry) => ({
                        purchaseRequestLineId: entry.purchaseRequestLineId,
                        requestedQuantity: toNumber(entry.quantity)
                    }))
                })),
        [combinedRows, combinedStates]
    );

    const activePayload = tab === 'combined' ? combinedPayload : individualPayload;

    const updateIndividualState = (lineId, patch) => {
        setLineStates((prev) => ({
            ...prev,
            [lineId]: { ...(prev[lineId] || {}), ...patch }
        }));
    };

    const updateCombinedState = (itemId, patch) => {
        setCombinedStates((prev) => ({
            ...prev,
            [itemId]: { ...(prev[itemId] || {}), ...patch }
        }));
    };

    const validatePayload = (payload) => {
        if (!payload.length) {
            notifyError('Select at least one line to generate purchase orders.');
            return false;
        }
        const invalid = payload.find((line) => !line.vendorId || line.orderQuantity <= 0 || line.rate <= 0);
        if (invalid) {
            notifyError(`Vendor, quantity, and rate are required for ${invalid.itemCode || invalid.itemId}.`);
            return false;
        }
        return true;
    };

    const handleGenerate = async () => {
        if (!validatePayload(activePayload)) return;
        try {
            setGenerating(true);
            await inventoryService.generatePurchaseOrders({ payload: activePayload, notes });
            notifySuccess('Vendor purchase orders generated successfully.');
            setNotes('');
            await fetchData();
            setTab('generated');
        } catch (err) {
            notifyError(err.response?.data?.message || 'Failed to generate purchase orders.');
        } finally {
            setGenerating(false);
        }
    };

    const handleDownloadPdf = async (poId, poNumber) => {
        try {
            const response = await inventoryService.downloadPurchaseOrderPDF(poId);
            const blobUrl = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
            window.open(blobUrl, '_blank', 'noopener,noreferrer');
            notifySuccess(`Opened PDF for ${poNumber}.`);
        } catch (err) {
            notifyError(err.response?.data?.message || 'Failed to download PO PDF.');
        }
    };

    return (
        <Layout currentPage="purchase-requests">
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
                        <div>
                            <h1 className="text-3xl font-bold text-[#556070] tracking-tight">Purchase Requests</h1>
                            <p className="text-text-secondary">Process individual PRQ demand or merged combined demand and generate vendor POs.</p>
                        </div>
                        <div className="flex bg-background-dark/50 p-1 rounded-xl border border-border-dark">
                            <button onClick={() => setTab('individual')} className={tabButtonClass(tab === 'individual')}>Individual PRQ</button>
                            <button onClick={() => setTab('combined')} className={tabButtonClass(tab === 'combined')}>Combined Demand</button>
                            <button onClick={() => setTab('generated')} className={tabButtonClass(tab === 'generated')}>Generated POs</button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="p-20 text-center">
                            <div className="animate-spin size-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
                        </div>
                    ) : (
                        <>
                            {(tab === 'individual' || tab === 'combined') && (
                                <div className="mb-4">
                                    <button
                                        onClick={handleGenerate}
                                        disabled={generating}
                                        className="bg-primary text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-primary/20 disabled:opacity-50 transition-all active:scale-95"
                                    >
                                        {generating ? 'Generating...' : 'Generate Vendor POs'}
                                    </button>
                                </div>
                            )}

                            {tab === 'individual' && (
                                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                                    <div className="xl:col-span-1 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
                                        <div className="px-4 py-3 border-b border-slate-200 bg-[#ECF1FF]/40 text-[#556070] font-semibold">
                                            Individual Request Queue
                                        </div>
                                        <div className="max-h-[600px] overflow-y-auto">
                                            {queueRows.map((batch) => (
                                                <button
                                                    key={batch.id}
                                                    type="button"
                                                    onClick={() => setSelectedBatchId(batch.id)}
                                                    className={`w-full text-left px-4 py-4 border-b border-slate-100 transition ${selectedBatchId === batch.id ? 'bg-primary/10' : 'hover:bg-slate-50'}`}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <p className="font-bold text-[#556070]">{batch.batchNumber}</p>
                                                        <span className="text-[10px] px-2 py-1 rounded bg-slate-100 text-text-secondary">{batch.status}</span>
                                                    </div>
                                                    <p className="text-xs text-text-secondary mt-1">{batch.materialRequestNumber} • {batch.projectName}</p>
                                                    <p className="text-xs text-text-secondary mt-1">{batch.lineCount} lines • Remaining {batch.remainingQuantity}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
                                        <div className="px-4 py-3 border-b border-slate-200 bg-[#ECF1FF]/40">
                                            <p className="text-[#556070] font-semibold">{selectedBatch?.batchNumber || 'Select a PRQ'}</p>
                                            <p className="text-xs text-text-secondary mt-1">{selectedBatch?.materialRequestNumber || ''} {selectedBatch?.projectName ? `• ${selectedBatch.projectName}` : ''}</p>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left">
                                                <thead className="bg-slate-50">
                                                    <tr>
                                                        <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary">Sel</th>
                                                        <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary">Item</th>
                                                        <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary text-center">Pending</th>
                                                        <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary">Vendor</th>
                                                        <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary text-center">Order Qty</th>
                                                        <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary text-right">Rate</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-border-dark">
                                                    {(selectedBatch?.lines || []).map((line) => (
                                                        <tr key={line.purchaseRequestLineId} className="hover:bg-slate-50">
                                                            <td className="px-4 py-3">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={lineStates[line.purchaseRequestLineId]?.selected || false}
                                                                    onChange={(e) => updateIndividualState(line.purchaseRequestLineId, { selected: e.target.checked })}
                                                                    className="accent-primary"
                                                                />
                                                            </td>
                                                            <td className="px-4 py-3 text-[#556070]">
                                                                <p className="font-semibold">{line.itemCode}</p>
                                                                <p className="text-xs text-text-secondary">{line.itemName}</p>
                                                            </td>
                                                            <td className="px-4 py-3 text-center font-semibold text-[#556070]">{line.pendingQuantity}</td>
                                                            <td className="px-4 py-3">
                                                                <select
                                                                    value={lineStates[line.purchaseRequestLineId]?.vendorId || ''}
                                                                    onChange={(e) => updateIndividualState(line.purchaseRequestLineId, { vendorId: e.target.value, selected: true })}
                                                                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-sm text-[#556070] outline-none focus:border-primary"
                                                                >
                                                                    <option value="">Select vendor</option>
                                                                    {vendors.map((vendor) => (
                                                                        <option key={vendor.id || vendor._id} value={vendor.id || vendor._id}>
                                                                            {(vendor.vendorCode || '').trim()} - {vendor.name}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </td>
                                                            <td className="px-4 py-3 text-center">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="0.001"
                                                                    value={lineStates[line.purchaseRequestLineId]?.orderQuantity || ''}
                                                                    onChange={(e) => updateIndividualState(line.purchaseRequestLineId, { orderQuantity: e.target.value, selected: true })}
                                                                    className="w-24 bg-white border border-slate-200 rounded-lg px-2 py-2 text-sm text-[#556070] text-center outline-none focus:border-primary"
                                                                />
                                                            </td>
                                                            <td className="px-4 py-3 text-right">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="0.01"
                                                                    value={lineStates[line.purchaseRequestLineId]?.rate || ''}
                                                                    onChange={(e) => updateIndividualState(line.purchaseRequestLineId, { rate: e.target.value, selected: true })}
                                                                    className="w-24 bg-white border border-slate-200 rounded-lg px-2 py-2 text-sm text-[#556070] text-right outline-none focus:border-primary"
                                                                />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {tab === 'combined' && (
                                <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
                                    <div className="px-6 py-4 border-b border-slate-200 bg-[#ECF1FF]/40 text-[#556070] font-semibold">
                                        Combined Demand Projection
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead className="bg-slate-50">
                                                <tr>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary">Sel</th>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary">Item</th>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary text-center">Total Required</th>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary">Vendor</th>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary text-center">Order Qty</th>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary text-right">Rate</th>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary">Breakdown</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border-dark">
                                                {combinedRows.map((row) => (
                                                    <tr key={row.itemId} className="hover:bg-slate-50">
                                                        <td className="px-4 py-3">
                                                            <input
                                                                type="checkbox"
                                                                checked={combinedStates[row.itemId]?.selected || false}
                                                                onChange={(e) => updateCombinedState(row.itemId, { selected: e.target.checked })}
                                                                className="accent-primary"
                                                            />
                                                        </td>
                                                        <td className="px-4 py-3 text-[#556070]">
                                                            <p className="font-semibold">{row.itemCode}</p>
                                                            <p className="text-xs text-text-secondary">{row.itemName}</p>
                                                        </td>
                                                        <td className="px-4 py-3 text-center font-semibold text-[#556070]">{row.totalRequiredQuantity}</td>
                                                        <td className="px-4 py-3">
                                                            <select
                                                                value={combinedStates[row.itemId]?.vendorId || ''}
                                                                onChange={(e) => updateCombinedState(row.itemId, { vendorId: e.target.value, selected: true })}
                                                                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-sm text-[#556070] outline-none focus:border-primary"
                                                            >
                                                                <option value="">Select vendor</option>
                                                                {vendors.map((vendor) => (
                                                                    <option key={vendor.id || vendor._id} value={vendor.id || vendor._id}>
                                                                        {(vendor.vendorCode || '').trim()} - {vendor.name}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.001"
                                                                value={combinedStates[row.itemId]?.orderQuantity || ''}
                                                                onChange={(e) => updateCombinedState(row.itemId, { orderQuantity: e.target.value, selected: true })}
                                                                className="w-24 bg-white border border-slate-200 rounded-lg px-2 py-2 text-sm text-[#556070] text-center outline-none focus:border-primary"
                                                            />
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                value={combinedStates[row.itemId]?.rate || ''}
                                                                onChange={(e) => updateCombinedState(row.itemId, { rate: e.target.value, selected: true })}
                                                                className="w-24 bg-white border border-slate-200 rounded-lg px-2 py-2 text-sm text-[#556070] text-right outline-none focus:border-primary"
                                                            />
                                                        </td>
                                                        <td className="px-4 py-3 text-xs text-text-secondary">
                                                            {(row.requestLines || []).slice(0, 3).map((entry) => (
                                                                <p key={entry.purchaseRequestLineId}>{entry.materialRequestNumber} • {entry.quantity}</p>
                                                            ))}
                                                            {(row.requestLines || []).length > 3 && <p>+{row.requestLines.length - 3} more</p>}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {tab === 'generated' && (
                                <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
                                    <div className="px-6 py-4 border-b border-slate-200 bg-[#ECF1FF]/40 text-[#556070] font-semibold">
                                        Generated Purchase Orders
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead className="bg-slate-50">
                                                <tr>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary">PO #</th>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary">Vendor</th>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary text-center">Lines</th>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary">Status</th>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border-dark">
                                                {(orders || []).map((order) => (
                                                    <tr key={order.id || order._id}>
                                                        <td className="px-4 py-3 text-[#556070] font-semibold">{order.poNumber}</td>
                                                        <td className="px-4 py-3 text-text-secondary">{order.vendor?.name || order.vendorId?.name || 'N/A'}</td>
                                                        <td className="px-4 py-3 text-center text-[#556070] font-semibold">{(order.lines || []).length}</td>
                                                        <td className="px-4 py-3 text-text-secondary">{order.status}</td>
                                                        <td className="px-4 py-3 text-right">
                                                            <button
                                                                onClick={() => handleDownloadPdf(order.id || order._id, order.poNumber)}
                                                                className="text-xs font-semibold px-3 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20"
                                                            >
                                                                View PDF
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {(tab === 'individual' || tab === 'combined') && (
                                <div className="mt-6">
                                    <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">
                                        Purchase Notes
                                    </label>
                                    <textarea
                                        rows="3"
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        className="w-full bg-white border border-slate-200 rounded-xl p-3 text-[#556070] outline-none focus:border-primary"
                                        placeholder="Vendor follow-up, delivery commitments, RFQ notes..."
                                    />
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </Layout>
    );
}
