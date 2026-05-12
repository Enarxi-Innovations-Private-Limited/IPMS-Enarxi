import { useEffect, useMemo, useState } from 'react';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout';
import { useNotifier } from '../common/AppNotificationProvider.jsx';

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export default function PurchasePlanning() {
    const Layout = usePortalLayout();
    const { error: notifyError, success: notifySuccess } = useNotifier();
    const [rows, setRows] = useState([]);
    const [vendors, setVendors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [notes, setNotes] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const [reqRes, venRes] = await Promise.all([
                    inventoryService.getPurchasePlanning(),
                    inventoryService.getVendors()
                ]);

                const initialRows = (reqRes.data || []).map((row) => ({
                    ...row,
                    selected: false,
                    vendorId: '',
                    orderQuantity: String(row.requestedQuantity || 0),
                    rate: '',
                    gstPercent: '18'
                }));

                setRows(initialRows);
                setVendors(venRes.data || []);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const selectedCount = rows.filter((row) => row.selected).length;

    const payload = useMemo(
        () =>
            rows
                .filter((row) => row.selected)
                .map((row) => ({
                    itemId: row.itemId,
                    itemCode: row.itemCode,
                    sourceLineIds: row.sourceLineIds,
                    sourceLines: row.sourceLines,
                    vendorId: row.vendorId,
                    sku: row.skuMappings?.find((mapping) => mapping.vendorId === row.vendorId)?.sku || '',
                    requestedQuantity: toNumber(row.requestedQuantity),
                    orderQuantity: toNumber(row.orderQuantity),
                    rate: toNumber(row.rate),
                    gstPercent: toNumber(row.gstPercent)
                })),
        [rows]
    );

    const updateRow = (itemId, patch) => {
        setRows((current) =>
            current.map((row) => (row.itemId === itemId ? { ...row, ...patch } : row))
        );
    };

    const handleGeneratePOs = async () => {
        if (payload.length === 0) {
            notifyError('Select at least one item to generate purchase orders.');
            return;
        }

        const invalidRow = payload.find(
            (row) => !row.vendorId || row.orderQuantity <= 0 || row.rate <= 0
        );
        if (invalidRow) {
            notifyError(`Vendor, order quantity, and rate are required for ${invalidRow.itemCode}.`);
            return;
        }

        try {
            setGenerating(true);
            await inventoryService.generatePurchaseOrders({
                payload: JSON.stringify(payload),
                notes
            });
            notifySuccess('Draft Purchase Orders generated successfully.');
            window.location.reload();
        } catch (err) {
            notifyError(err.response?.data?.message || 'PO generation failed');
        } finally {
            setGenerating(false);
        }
    };

    return (
        <Layout currentPage="purchase-requests">
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                        <div>
                            <h1 className="text-3xl font-bold text-white tracking-tight">Purchase Planning</h1>
                            <p className="text-text-secondary">Group shortage demand, select vendors, and prepare commercially complete PO drafts.</p>
                        </div>
                        <button
                            disabled={selectedCount === 0 || generating}
                            onClick={handleGeneratePOs}
                            className="bg-primary text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-primary/20 disabled:opacity-50 transition-all active:scale-95"
                        >
                            {generating ? 'Generating...' : `Generate ${selectedCount} Planned PO Lines`}
                        </button>
                    </div>

                    <div className="bg-surface-dark border border-border-dark rounded-2xl overflow-hidden shadow-2xl">
                        <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-white">Combined Purchase Pool</h2>
                                <p className="text-xs text-text-secondary mt-1">Demand is grouped by item across open purchase request batches.</p>
                            </div>
                            <span className="text-xs text-text-secondary bg-background-dark px-2 py-1 rounded">
                                {rows.length} Items Awaiting PO
                            </span>
                        </div>

                        {loading ? (
                            <div className="p-20 text-center">
                                <div className="animate-spin size-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
                            </div>
                        ) : rows.length === 0 ? (
                            <div className="p-20 text-center">
                                <span className="material-symbols-outlined text-border-dark text-5xl mb-4">shopping_cart_checkout</span>
                                <p className="text-text-secondary font-medium">No pending purchase requirements found.</p>
                            </div>
                        ) : (
                            <>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-background-dark/50">
                                            <tr>
                                                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-secondary">Select</th>
                                                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-secondary">Item</th>
                                                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-secondary">Class</th>
                                                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-secondary text-center">Requested</th>
                                                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-secondary">Vendor</th>
                                                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-secondary">SKU</th>
                                                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-secondary text-center">Qty to Order</th>
                                                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-secondary text-right">Rate</th>
                                                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-secondary text-right">GST %</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border-dark">
                                            {rows.map((row) => {
                                                const selectedVendorMapping = row.skuMappings?.find((mapping) => mapping.vendorId === row.vendorId);
                                                return (
                                                    <tr
                                                        key={row.itemId}
                                                        className={`transition-colors ${row.selected ? 'bg-primary/5' : 'hover:bg-primary/5'}`}
                                                    >
                                                        <td className="px-6 py-4">
                                                            <input
                                                                type="checkbox"
                                                                checked={row.selected}
                                                                onChange={(e) => updateRow(row.itemId, { selected: e.target.checked })}
                                                                className="accent-primary"
                                                            />
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="text-white font-medium">{row.itemCode} - {row.name}</div>
                                                            <div className="text-text-secondary text-xs">Package: {row.package || '-'}</div>
                                                        </td>
                                                        <td className="px-6 py-4 text-text-secondary text-sm">{row.classification || '-'}</td>
                                                        <td className="px-6 py-4 text-center">
                                                            <div className="text-white font-bold">{row.requestedQuantity}</div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <select
                                                                value={row.vendorId}
                                                                onChange={(e) => updateRow(row.itemId, { vendorId: e.target.value, selected: true })}
                                                                className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary"
                                                            >
                                                                <option value="">Select vendor</option>
                                                                {vendors.map((vendor) => (
                                                                    <option key={vendor.id || vendor._id} value={vendor.id || vendor._id}>
                                                                        {(vendor.vendorCode || '').trim()} - {vendor.name}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="text-white text-sm font-medium">{selectedVendorMapping?.sku || '-'}</div>
                                                            <div className="text-text-secondary text-[10px] mt-1">
                                                                {row.skuMappings?.length
                                                                    ? row.skuMappings
                                                                        .filter((mapping) => mapping.sku)
                                                                        .map((mapping) => `${mapping.vendorCode}: ${mapping.sku}`)
                                                                        .join(' | ')
                                                                    : 'No mapped SKUs'}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 text-center">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.001"
                                                                value={row.orderQuantity}
                                                                onChange={(e) => updateRow(row.itemId, { orderQuantity: e.target.value, selected: true })}
                                                                className="w-24 bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white text-center outline-none focus:border-primary"
                                                            />
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                value={row.rate}
                                                                onChange={(e) => updateRow(row.itemId, { rate: e.target.value, selected: true })}
                                                                className="w-28 bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white text-right outline-none focus:border-primary"
                                                            />
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                value={row.gstPercent}
                                                                onChange={(e) => updateRow(row.itemId, { gstPercent: e.target.value, selected: true })}
                                                                className="w-20 bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white text-right outline-none focus:border-primary"
                                                            />
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="border-t border-border-dark p-6">
                                    <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">
                                        PO / RFQ Notes
                                    </label>
                                    <textarea
                                        rows="3"
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        className="w-full bg-background-dark border border-border-dark rounded-xl p-3 text-white outline-none focus:border-primary"
                                        placeholder="Quotation, delivery commitments, vendor follow-up, or sourcing notes..."
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </Layout>
    );
}
