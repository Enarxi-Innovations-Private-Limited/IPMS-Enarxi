import { useState, useEffect } from 'react';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout';
import { useNotifier } from '../common/AppNotificationProvider.jsx';

export default function POApprovalsPage() {
    const Layout = usePortalLayout();
    const { error: notifyError, success: notifySuccess } = useNotifier();
    const [orders, setOrders] = useState([]);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [remarks, setRemarks] = useState('');

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        try {
            setLoading(true);
            const res = await inventoryService.getPurchaseOrders();
            // In the reference system, status is PENDING_ADMIN_APPROVAL
            setOrders(res.data.filter(o => o.status === 'PENDING_ADMIN_APPROVAL'));
        } catch (err) {
            console.error('Failed to fetch POs:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleReview = async (decision) => {
        if (!selectedOrder) return;
        if (!remarks && decision === 'REJECT') {
            notifyError('Please provide remarks for rejection.');
            return;
        }

        try {
            setProcessing(true);
            await inventoryService.reviewPO(selectedOrder.id, decision, remarks);
            notifySuccess(`Purchase Order ${decision === 'APPROVE' ? 'Approved' : 'Rejected'} successfully.`);
            setSelectedOrder(null);
            setRemarks('');
            fetchOrders();
        } catch (err) {
            notifyError(err.response?.data?.message || 'Review failed');
        } finally {
            setProcessing(false);
        }
    };

    const fetchOrderDetails = async (order) => {
        try {
            setProcessing(true);
            const res = await inventoryService.getPurchaseOrderDetails(order.id);
            setSelectedOrder(res.data);
        } catch (err) {
            notifyError('Failed to load order details');
        } finally {
            setProcessing(false);
        }
    };

    return (
        <Layout currentPage="purchase-approvals">
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-white tracking-tight">PO Approvals</h1>
                        <p className="text-text-secondary text-lg">Review and authorize pending purchase orders.</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Pending List */}
                        <div className="lg:col-span-1 space-y-4">
                            <h2 className="text-xs font-black uppercase tracking-widest text-text-secondary px-2">Pending Review</h2>
                            {loading ? (
                                <div className="space-y-4">
                                    {[1, 2, 3].map(i => (
                                        <div key={i} className="h-24 bg-surface-dark border border-border-dark rounded-xl animate-pulse"></div>
                                    ))}
                                </div>
                            ) : orders.length === 0 ? (
                                <div className="p-10 text-center bg-surface-dark/30 border border-dashed border-border-dark rounded-xl">
                                    <span className="material-symbols-outlined text-4xl text-text-secondary/20 mb-2 block">task_alt</span>
                                    <p className="text-text-secondary text-sm font-bold">Queue is empty</p>
                                    <p className="text-[10px] text-text-secondary mt-1">No purchase orders awaiting approval.</p>
                                </div>
                            ) : (
                                orders.map(order => (
                                    <button 
                                        key={order.id}
                                        onClick={() => fetchOrderDetails(order)}
                                        className={`w-full text-left p-4 rounded-xl border transition-all ${selectedOrder?.id === order.id ? 'bg-primary/10 border-primary shadow-lg' : 'bg-surface-dark border-border-dark hover:border-text-secondary/30'}`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="font-mono text-primary text-xs font-bold">{order.poNumber}</span>
                                            <span className="text-[10px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded font-black uppercase tracking-widest">Pending</span>
                                        </div>
                                        <div className="text-white font-bold truncate">{order.vendor?.name}</div>
                                        <div className="flex justify-between items-center mt-3 text-[10px]">
                                            <span className="text-text-secondary">{order._count?.lines || 0} Items</span>
                                            <span className="text-white font-bold">₹{Number(order.totalAmount || 0).toLocaleString()}</span>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>

                        {/* Detail View */}
                        <div className="lg:col-span-2">
                            {selectedOrder ? (
                                <div className="bg-surface-dark border border-border-dark rounded-2xl overflow-hidden shadow-2xl flex flex-col h-full">
                                    <div className="p-6 border-b border-border-dark bg-gradient-surface">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="text-2xl font-bold text-white">{selectedOrder.poNumber}</h3>
                                                <p className="text-text-secondary text-sm">Vendor: <span className="text-white">{selectedOrder.vendor?.name}</span></p>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-text-secondary text-xs font-black uppercase mb-1">Total Value</div>
                                                <div className="text-2xl font-black text-primary">₹{Number(selectedOrder.totalAmount || 0).toLocaleString()}</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-auto p-6 space-y-8 custom-scrollbar">
                                        {/* Line Items */}
                                        <div className="space-y-4">
                                            <h4 className="text-xs font-black uppercase tracking-widest text-text-secondary border-b border-border-dark pb-2">Order Line Items</h4>
                                            <table className="w-full text-left text-xs">
                                                <thead>
                                                    <tr className="text-text-secondary">
                                                        <th className="py-2">Item Details</th>
                                                        <th className="py-2 text-right">Qty</th>
                                                        <th className="py-2 text-right">Unit Price</th>
                                                        <th className="py-2 text-right">Subtotal</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-border-dark">
                                                    {selectedOrder.lines?.map(line => (
                                                        <tr key={line.id}>
                                                            <td className="py-3">
                                                                <div className="text-white font-bold">{line.item?.name}</div>
                                                                <div className="text-[10px] text-text-secondary">{line.item?.itemCode}</div>
                                                            </td>
                                                            <td className="py-3 text-right text-white font-mono">{line.quantity}</td>
                                                            <td className="py-3 text-right text-text-secondary">₹{Number(line.unitPrice).toLocaleString()}</td>
                                                            <td className="py-3 text-right text-white font-bold">₹{Number(line.totalPrice).toLocaleString()}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Actions */}
                                        <div className="bg-background-dark/50 rounded-2xl p-6 border border-border-dark space-y-4">
                                            <h4 className="text-xs font-black uppercase tracking-widest text-text-secondary">Review Decision</h4>
                                            <textarea 
                                                className="w-full bg-surface-dark border border-border-dark rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-primary h-24 transition-all"
                                                placeholder="Add approval/rejection remarks here..."
                                                value={remarks}
                                                onChange={(e) => setRemarks(e.target.value)}
                                            />
                                            <div className="flex gap-4">
                                                <button 
                                                    onClick={() => handleReview('REJECT')}
                                                    disabled={processing}
                                                    className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                                                >
                                                    <span className="material-symbols-outlined">close</span>
                                                    Reject PO
                                                </button>
                                                <button 
                                                    onClick={() => handleReview('APPROVE')}
                                                    disabled={processing}
                                                    className="flex-[2] bg-primary hover:bg-primary/90 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/20"
                                                >
                                                    <span className="material-symbols-outlined">check_circle</span>
                                                    Approve & Release
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-[400px] flex flex-col items-center justify-center bg-surface-dark/30 border border-dashed border-border-dark rounded-2xl">
                                    <span className="material-symbols-outlined text-border-dark text-6xl mb-4">description</span>
                                    <p className="text-text-secondary font-medium tracking-wide">Select a purchase order to view and review</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
