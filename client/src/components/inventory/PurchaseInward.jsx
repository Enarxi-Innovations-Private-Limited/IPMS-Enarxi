import { useState, useEffect } from 'react';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout';
import { useNotifier } from '../common/AppNotificationProvider.jsx';

const getEntityId = (value) => value?.id || value?._id || '';
const getPendingQuantity = (line) => Math.max(0, Number(line?.orderQuantity || 0) - Number(line?.receivedQuantity || 0));

const normalizeOpenOrder = (order) => {
    const openLines = (order?.lines || []).filter((line) => getPendingQuantity(line) > 0);
    return {
        ...order,
        id: getEntityId(order),
        lines: openLines,
    };
};

export default function PurchaseInward() {
    const Layout = usePortalLayout();
    const { error: notifyError, success: notifySuccess } = useNotifier();
    const [orders, setOrders] = useState([]);
    const [locations, setLocations] = useState([]);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [receiving, setReceiving] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const [poRes, locRes] = await Promise.all([
                    inventoryService.getPurchaseOrders(),
                    inventoryService.getLocations()
                ]);
                const openOrders = (poRes.data || [])
                    .filter((order) => order.status === 'PLACED')
                    .map(normalizeOpenOrder)
                    .filter((order) => order.lines.length > 0);
                setOrders(openOrders);
                setLocations(locRes.data);
                if (selectedOrder) {
                    const refreshedSelected = openOrders.find((order) => getEntityId(order) === getEntityId(selectedOrder));
                    setSelectedOrder(refreshedSelected || null);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleReceive = async (e) => {
        e.preventDefault();
        const form = e.target;
        const lineIds = (selectedOrder.lines || [])
            .map((line) => getEntityId(line))
            .filter(Boolean);
        
        const payload = {
            purchaseOrderId: getEntityId(selectedOrder),
            locationId: form.locationId.value,
            documentNote: form.documentNote.value,
            remarks: form.remarks.value,
            lineIds: lineIds
        };

        lineIds.forEach(id => {
            payload[`receive:${id}`] = form[`qty-${id}`].value;
            // Capture serial numbers if present
            const serials = form[`serials-${id}`]?.value;
            if (serials) {
                payload[`serials:${id}`] = serials;
            }
        });

        try {
            setReceiving(true);
            await inventoryService.receivePO(payload);
            notifySuccess('Goods received successfully.');
            setSelectedOrder(null);
            const poRes = await inventoryService.getPurchaseOrders();
            const openOrders = (poRes.data || [])
                .filter((order) => order.status === 'PLACED')
                .map(normalizeOpenOrder)
                .filter((order) => order.lines.length > 0);
            setOrders(openOrders);
        } catch (err) {
            notifyError(err.response?.data?.message || 'Inward failed');
        } finally {
            setReceiving(false);
        }
    };

    return (
        <Layout currentPage="store-inward">
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-[#556070] tracking-tight">Purchase Inward (GRN)</h1>
                        <p className="text-text-secondary">Record incoming shipments with optional serial tracking.</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Pending Orders */}
                        <div className="lg:col-span-1 space-y-4">
                            <h2 className="text-xs font-black uppercase tracking-widest text-text-secondary px-2">Placed Orders</h2>
                            {loading ? (
                                <div className="p-10 text-center bg-surface-dark rounded-xl border border-border-dark animate-pulse">
                                    <div className="size-8 bg-border-dark rounded-full mx-auto mb-2"></div>
                                    <div className="h-4 bg-border-dark rounded w-2/3 mx-auto"></div>
                                </div>
                            ) : (
                                orders.map(order => (
                                    <button 
                                        key={getEntityId(order)}
                                        onClick={() => setSelectedOrder(order)}
                                        className={`w-full text-left p-4 rounded-xl border transition-all ${
                                            getEntityId(selectedOrder) === getEntityId(order)
                                            ? 'bg-primary/10 border-primary shadow-lg shadow-primary/10' 
                                            : 'bg-surface-dark border-border-dark hover:border-text-secondary/30'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="font-mono text-primary text-xs font-bold">{order.poNumber}</span>
                                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 uppercase">PLACED</span>
                                        </div>
                                        <div className="text-[#556070] font-bold truncate">{order.vendor?.name}</div>
                                        <div className="text-text-secondary text-xs mt-1">
                                            Expected: {order.expectedDeliveryDate ? new Date(order.expectedDeliveryDate).toLocaleDateString() : 'TBD'}
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>

                        {/* Receipt Form */}
                        <div className="lg:col-span-2">
                            {selectedOrder ? (
                                <form onSubmit={handleReceive} className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden shadow-2xl">
                                    <div className="p-6 border-b border-border-dark bg-gradient-surface">
                                        <h3 className="text-xl font-bold text-[#556070] mb-1">Receive Inward: {selectedOrder.poNumber}</h3>
                                        <p className="text-text-secondary text-sm">Vendor: {selectedOrder.vendor?.name}</p>
                                    </div>

                                    <div className="p-6 space-y-6">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1">Stock Location</label>
                                                <select name="locationId" className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white outline-none focus:ring-1 focus:ring-primary" required>
                                                    <option value="">Select storage bin/rack...</option>
                                                    {locations.map(loc => (
                                                        <option key={getEntityId(loc)} value={getEntityId(loc)}>{loc.name} ({loc.locationCode})</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1">Delivery Note #</label>
                                                <input name="documentNote" className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white outline-none focus:ring-1 focus:ring-primary" placeholder="Vendor Invoice/DC Number" required />
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <h4 className="text-xs font-bold text-text-secondary uppercase tracking-widest">Line Items</h4>
                                            {selectedOrder.lines?.map(line => {
                                                const lineId = getEntityId(line);
                                                return (
                                                <div key={lineId} className="bg-slate-50 border border-slate-200 shadow-sm rounded-xl p-4">
                                                    <div className="flex justify-between items-start mb-4">
                                                        <div>
                                                            <div className="text-[#556070] font-bold">{line.item?.name}</div>
                                                            <div className="text-primary text-xs font-mono">{line.item?.itemCode}</div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-text-secondary text-[10px] uppercase font-bold">Pending</div>
                                                            <div className="text-[#556070] font-black">{getPendingQuantity(line)} {line.item?.uom}</div>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="flex gap-4 items-end">
                                                        <div className="w-32">
                                                            <label className="block text-[9px] font-bold text-text-secondary uppercase mb-1">Qty to Receive</label>
                                                            <input 
                                                                type="number" 
                                                                name={`qty-${lineId}`}
                                                                className="w-full bg-background-dark border border-border-dark rounded-lg p-2 text-emerald-400 font-bold outline-none focus:border-emerald-500"
                                                                defaultValue={getPendingQuantity(line)}
                                                                max={getPendingQuantity(line)}
                                                                min="0"
                                                                required
                                                            />
                                                        </div>
                                                        {line.item?.classification?.tracksSerial && (
                                                            <div className="flex-1">
                                                                <label className="block text-[9px] font-bold text-amber-500 uppercase mb-1">Serial Numbers (Comma separated)</label>
                                                                <input 
                                                                    type="text" 
                                                                    name={`serials-${lineId}`}
                                                                    placeholder="e.g. SN1001, SN1002"
                                                                    className="w-full bg-background-dark border border-amber-500/30 rounded-lg p-2 text-white text-sm outline-none focus:border-amber-500"
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )})}
                                        </div>

                                        <div>
                                            <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1">Internal Remarks</label>
                                            <textarea name="remarks" className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white outline-none focus:ring-1 focus:ring-primary h-20" placeholder="Condition of goods, etc..."></textarea>
                                        </div>

                                        <button 
                                            type="submit" 
                                            disabled={receiving}
                                            className="w-full bg-emerald-500 py-3 rounded-xl text-black font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 transition-all disabled:opacity-50"
                                        >
                                            {receiving ? 'Processing...' : 'Complete Inward Receipt'}
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <div className="h-[400px] flex flex-col items-center justify-center bg-white/30 border border-dashed border-slate-200 shadow-sm rounded-2xl">
                                    <span className="material-symbols-outlined text-border-dark text-6xl mb-4">downloading</span>
                                    <p className="text-text-secondary font-medium tracking-wide">Select a PO from the list to record inwarding</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
