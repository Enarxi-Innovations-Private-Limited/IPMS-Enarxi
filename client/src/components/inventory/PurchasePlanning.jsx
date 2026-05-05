import { useState, useEffect } from 'react';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout';

export default function PurchasePlanning() {
    const Layout = usePortalLayout();
    const [requests, setRequests] = useState([]);
    const [vendors, setVendors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedLines, setSelectedLines] = useState([]);
    const [generating, setGenerating] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const [reqRes, venRes] = await Promise.all([
                    inventoryService.getPurchaseRequests(),
                    inventoryService.getVendors()
                ]);
                setRequests(reqRes.data);
                setVendors(venRes.data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleToggleLine = (lineId) => {
        if (selectedLines.includes(lineId)) {
            setSelectedLines(selectedLines.filter(id => id !== lineId));
        } else {
            setSelectedLines([...selectedLines, lineId]);
        }
    };

    const handleGeneratePOs = async () => {
        if (selectedLines.length === 0) return alert('Select items to purchase');
        
        try {
            setGenerating(true);
            // In a real scenario, we'd open a modal to set rates/vendors for each. 
            // For now, we'll demonstrate the bulk action.
            const payload = selectedLines.map(lineId => {
                const line = requests.find(r => r.id === lineId);
                return {
                    itemId: line.itemId,
                    sourceLineIds: [lineId],
                    vendorId: vendors[0]?.id, // Default to first vendor for demo
                    sku: '',
                    requestedQuantity: line.pendingQuantity,
                    orderQuantity: line.pendingQuantity,
                    rate: 0,
                    gstPercent: 18
                };
            });

            await inventoryService.generatePurchaseOrders({
                payload: JSON.stringify(payload),
                notes: 'Generated from IPMS Planning'
            });
            alert('Draft Purchase Orders generated successfully!');
            window.location.reload();
        } catch (err) {
            alert(err.response?.data?.message || 'PO Generation failed');
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
                            <p className="text-text-secondary">Consolidate hardware requirements into vendor orders.</p>
                        </div>
                        <button 
                            disabled={selectedLines.length === 0 || generating}
                            onClick={handleGeneratePOs}
                            className="bg-primary text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-primary/20 disabled:opacity-50 transition-all active:scale-95"
                        >
                            {generating ? 'Processing...' : `Generate ${selectedLines.length} PO Lines`}
                        </button>
                    </div>

                    <div className="bg-surface-dark border border-border-dark rounded-2xl overflow-hidden shadow-2xl">
                        <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-white">Pending Purchase Lines</h2>
                            <span className="text-xs text-text-secondary bg-background-dark px-2 py-1 rounded">
                                {requests.length} Items Awaiting PO
                            </span>
                        </div>

                        {loading ? (
                            <div className="p-20 text-center">
                                <div className="animate-spin size-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
                            </div>
                        ) : requests.length === 0 ? (
                            <div className="p-20 text-center">
                                <span className="material-symbols-outlined text-border-dark text-5xl mb-4">shopping_cart_checkout</span>
                                <p className="text-text-secondary font-medium">No pending purchase requirements found.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-background-dark/50">
                                        <tr>
                                            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-secondary">Select</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-secondary">Component</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-secondary">Req #</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-secondary text-center">Qty</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-text-secondary">Project</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-dark">
                                        {requests.map((line) => (
                                            <tr 
                                                key={line.id} 
                                                className={`hover:bg-primary/5 transition-colors cursor-pointer ${selectedLines.includes(line.id) ? 'bg-primary/5' : ''}`}
                                                onClick={() => handleToggleLine(line.id)}
                                            >
                                                <td className="px-6 py-4">
                                                    <div className={`size-5 rounded border flex items-center justify-center transition-all ${
                                                        selectedLines.includes(line.id) ? 'bg-primary border-primary' : 'border-border-dark bg-background-dark'
                                                    }`}>
                                                        {selectedLines.includes(line.id) && <span className="material-symbols-outlined text-white text-xs">check</span>}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-white font-medium">{line.item?.name}</div>
                                                    <div className="text-text-secondary text-xs">{line.item?.itemCode}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="font-mono text-primary text-xs font-bold">{line.batch?.materialRequest?.requestNumber}</span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <div className="text-white font-bold">{line.pendingQuantity}</div>
                                                    <div className="text-[10px] text-text-secondary uppercase">{line.item?.uom}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-text-secondary text-sm truncate max-w-[150px]">{line.batch?.materialRequest?.project?.name}</div>
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
        </Layout>
    );
}
