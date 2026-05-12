import { useState, useEffect } from 'react';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout';
import { useNotifier } from '../common/AppNotificationProvider.jsx';

export default function PurchaseOrdersPage() {
    const Layout = usePortalLayout();
    const { error: notifyError, success: notifySuccess } = useNotifier();
    const [orders, setOrders] = useState([]);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [reviewRemarks, setReviewRemarks] = useState('');
    const [filterStatus, setFilterStatus] = useState('ALL');
    const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
    const [vendorDocumentNote, setVendorDocumentNote] = useState('');

    useEffect(() => {
        fetchOrders();
    }, []);

    useEffect(() => {
        if (!selectedOrder) {
            setExpectedDeliveryDate('');
            setVendorDocumentNote('');
            return;
        }

        setExpectedDeliveryDate(
            selectedOrder.expectedDeliveryDate
                ? new Date(selectedOrder.expectedDeliveryDate).toISOString().slice(0, 10)
                : ''
        );
        setVendorDocumentNote(selectedOrder.vendorDocumentNote || '');
    }, [selectedOrder]);

    const fetchOrders = async () => {
        try {
            setLoading(true);
            const res = await inventoryService.getPurchaseOrders();
            setOrders(res.data);
        } catch (err) {
            console.error('Failed to fetch POs:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleReview = async (orderId, decision) => {
        if (decision === 'REJECTED' && !reviewRemarks) {
            notifyError('Please provide remarks for rejection');
            return;
        }

        try {
            setProcessing(true);
            await inventoryService.reviewPO(orderId, decision, reviewRemarks);
            notifySuccess(`Purchase Order ${decision.toLowerCase()} successfully`);
            setReviewRemarks('');
            setSelectedOrder(null);
            fetchOrders();
        } catch (err) {
            notifyError(err.response?.data?.message || 'Review failed');
        } finally {
            setProcessing(false);
        }
    };

    const handleMarkPlaced = async (orderId) => {
        try {
            setProcessing(true);
            await inventoryService.markPOPlaced({
                purchaseOrderId: orderId,
                expectedDeliveryDate: expectedDeliveryDate || null,
                vendorDocumentNote: vendorDocumentNote.trim() || null,
            });
            notifySuccess('Purchase Order marked as PLACED');
            setSelectedOrder(null);
            fetchOrders();
        } catch (err) {
            notifyError(err.response?.data?.message || 'Failed to mark as placed');
        } finally {
            setProcessing(false);
        }
    };

    const handleSubmitForApproval = async (orderId) => {
        try {
            setProcessing(true);
            await inventoryService.submitPOForApproval(orderId);
            notifySuccess('Purchase Order submitted for admin approval.');
            setSelectedOrder(null);
            fetchOrders();
        } catch (err) {
            notifyError(err.response?.data?.message || 'Failed to submit PO for approval');
        } finally {
            setProcessing(false);
        }
    };

    const filteredOrders = filterStatus === 'ALL' 
        ? orders 
        : orders.filter(o => o.status === filterStatus);

    const getStatusColor = (status) => {
        switch (status) {
            case 'DRAFT': return 'bg-slate-500/20 text-slate-400';
            case 'PENDING_ADMIN_APPROVAL': return 'bg-amber-500/20 text-amber-500';
            case 'APPROVED': return 'bg-emerald-500/20 text-emerald-400';
            case 'REJECTED': return 'bg-red-500/20 text-red-400';
            case 'PLACED': return 'bg-blue-500/20 text-blue-400';
            default: return 'bg-slate-500/20 text-slate-400';
        }
    };

    return (
        <Layout currentPage="purchase-orders">
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                        <div>
                            <h1 className="text-3xl font-bold text-white tracking-tight">Purchase Orders</h1>
                            <p className="text-text-secondary">Manage and approve vendor procurement documents.</p>
                        </div>
                        <div className="flex gap-2">
                            {['ALL', 'PENDING_ADMIN_APPROVAL', 'APPROVED', 'PLACED', 'REJECTED'].map(status => (
                                <button
                                    key={status}
                                    onClick={() => setFilterStatus(status)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                        filterStatus === status 
                                        ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                                        : 'bg-surface-dark text-text-secondary border border-border-dark hover:border-text-secondary/30'
                                    }`}
                                >
                                    {status.replace(/_/g, ' ')}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* PO List */}
                        <div className="lg:col-span-1 space-y-4 overflow-y-auto max-h-[calc(100vh-250px)] custom-scrollbar pr-2">
                            {loading ? (
                                <div className="p-10 text-center bg-surface-dark rounded-xl border border-border-dark animate-pulse">
                                    <div className="size-8 bg-border-dark rounded-full mx-auto mb-2"></div>
                                    <div className="h-4 bg-border-dark rounded w-2/3 mx-auto"></div>
                                </div>
                            ) : filteredOrders.length === 0 ? (
                                <div className="p-10 text-center bg-surface-dark/30 border border-dashed border-border-dark rounded-xl">
                                    <p className="text-text-secondary text-sm">No purchase orders found.</p>
                                </div>
                            ) : (
                                filteredOrders.map(order => (
                                    <button 
                                        key={order._id || order.id}
                                        onClick={() => setSelectedOrder(order)}
                                        className={`w-full text-left p-4 rounded-xl border transition-all ${
                                            selectedOrder?.id === order.id 
                                            ? 'bg-primary/10 border-primary shadow-lg shadow-primary/10' 
                                            : 'bg-surface-dark border-border-dark hover:border-text-secondary/30'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="font-mono text-primary text-xs font-bold">{order.poNumber}</span>
                                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase ${getStatusColor(order.status)}`}>
                                                {order.status.replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                        <div className="text-white font-bold truncate">{order.vendor?.name}</div>
                                        <div className="flex justify-between items-center mt-2">
                                            <div className="text-text-secondary text-[10px] uppercase font-bold">
                                                {order.lines?.length || 0} Items
                                            </div>
                                            <div className="text-white font-mono text-xs font-bold">
                                                ₹{order.lines?.reduce((sum, l) => sum + Number(l.lineTotal), 0).toLocaleString()}
                                            </div>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>

                        {/* Details & Actions */}
                        <div className="lg:col-span-2">
                            {selectedOrder ? (
                                <div className="bg-surface-dark border border-border-dark rounded-2xl overflow-hidden shadow-2xl">
                                    <div className="p-6 border-b border-border-dark bg-gradient-surface">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <h3 className="text-2xl font-bold text-white">{selectedOrder.poNumber}</h3>
                                                <p className="text-text-secondary text-sm">Vendor: <span className="text-white">{selectedOrder.vendor?.name}</span></p>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-text-secondary text-xs uppercase font-bold tracking-widest mb-1">Status</div>
                                                <span className={`text-xs font-black px-3 py-1 rounded-full uppercase ${getStatusColor(selectedOrder.status)}`}>
                                                    {selectedOrder.status.replace(/_/g, ' ')}
                                                </span>
                                            </div>
                                        </div>
                                        
                                        <div className="grid grid-cols-3 gap-4 mt-6">
                                            <div className="bg-background-dark/50 p-3 rounded-lg border border-border-dark">
                                                <div className="text-[10px] text-text-secondary uppercase font-bold mb-1">Date Created</div>
                                                <div className="text-white text-sm">{new Date(selectedOrder.createdAt).toLocaleDateString()}</div>
                                            </div>
                                            <div className="bg-background-dark/50 p-3 rounded-lg border border-border-dark">
                                                <div className="text-[10px] text-text-secondary uppercase font-bold mb-1">Expected Delivery</div>
                                                <div className="text-white text-sm">{selectedOrder.expectedDeliveryDate ? new Date(selectedOrder.expectedDeliveryDate).toLocaleDateString() : 'TBD'}</div>
                                            </div>
                                            <div className="bg-background-dark/50 p-3 rounded-lg border border-border-dark">
                                                <div className="text-[10px] text-text-secondary uppercase font-bold mb-1">Total Value</div>
                                                <div className="text-primary text-sm font-bold">₹{selectedOrder.lines?.reduce((sum, l) => sum + Number(l.lineTotal), 0).toLocaleString()}</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-6">
                                        <table className="w-full text-left mb-8">
                                            <thead>
                                                <tr className="text-xs font-bold uppercase tracking-wider text-text-secondary border-b border-border-dark">
                                                    <th className="pb-4">Item Description</th>
                                                    <th className="pb-4 text-center">Qty</th>
                                                    <th className="pb-4 text-right">Rate</th>
                                                    <th className="pb-4 text-right">GST</th>
                                                    <th className="pb-4 text-right">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border-dark">
                                                {selectedOrder.lines?.map(line => (
                                                    <tr key={line._id || line.id}>
                                                        <td className="py-4">
                                                            <div className="text-white font-medium">{line.item?.name}</div>
                                                            <div className="text-text-secondary text-xs">{line.item?.itemCode}</div>
                                                        </td>
                                                        <td className="py-4 text-center text-white font-bold">{line.orderQuantity}</td>
                                                        <td className="py-4 text-right text-text-secondary">₹{Number(line.rate).toLocaleString()}</td>
                                                        <td className="py-4 text-right text-text-secondary">{line.gstPercent}%</td>
                                                        <td className="py-4 text-right text-white font-bold">₹{Number(line.lineTotal).toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>

                                        {/* Review Section */}
                                        {selectedOrder.status === 'PENDING_ADMIN_APPROVAL' && (
                                            <div className="bg-background-dark/50 border border-primary/20 rounded-xl p-6">
                                                <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-primary">rate_review</span>
                                                    Administrative Review
                                                </h4>
                                                <textarea 
                                                    className="w-full bg-surface-dark border border-border-dark rounded-lg p-3 text-white text-sm outline-none focus:border-primary mb-4 h-24"
                                                    placeholder="Enter approval/rejection remarks..."
                                                    value={reviewRemarks}
                                                    onChange={(e) => setReviewRemarks(e.target.value)}
                                                ></textarea>
                                                <div className="flex gap-3">
                                                    <button 
                                                        disabled={processing}
                                                        onClick={() => handleReview(selectedOrder.id, 'APPROVED')}
                                                        className="flex-1 bg-emerald-500 text-black font-black py-3 rounded-xl uppercase tracking-widest hover:bg-emerald-400 transition-all disabled:opacity-50"
                                                    >
                                                        Approve PO
                                                    </button>
                                                    <button 
                                                        disabled={processing}
                                                        onClick={() => handleReview(selectedOrder.id, 'REJECTED')}
                                                        className="flex-1 bg-red-500 text-white font-black py-3 rounded-xl uppercase tracking-widest hover:bg-red-400 transition-all disabled:opacity-50"
                                                    >
                                                        Reject PO
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {(selectedOrder.status === 'DRAFT' || selectedOrder.status === 'REJECTED') && (
                                            <div className="bg-background-dark/50 border border-amber-500/20 rounded-xl p-6">
                                                <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-amber-400">approval</span>
                                                    Submit For Approval
                                                </h4>
                                                <p className="text-text-secondary text-sm mb-6">
                                                    This purchase order matches the tracker flow only after it is formally submitted into the admin approval queue.
                                                </p>
                                                <button
                                                    disabled={processing}
                                                    onClick={() => handleSubmitForApproval(selectedOrder.id)}
                                                    className="w-full bg-amber-500 text-black font-black py-3 rounded-xl uppercase tracking-widest hover:bg-amber-400 transition-all disabled:opacity-50 shadow-lg shadow-amber-500/20"
                                                >
                                                    Submit to Admin Queue
                                                </button>
                                            </div>
                                        )}

                                        {/* Action Section for Approved POs */}
                                        {selectedOrder.status === 'APPROVED' && (
                                            <div className="bg-background-dark/50 border border-blue-500/20 rounded-xl p-6">
                                                <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-blue-400">send</span>
                                                    Execution Action
                                                </h4>
                                                <p className="text-text-secondary text-sm mb-6">Confirm that this Purchase Order has been officially sent to the vendor.</p>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                                    <div>
                                                        <label className="block text-[10px] text-text-secondary uppercase font-bold mb-2 tracking-widest">Expected Delivery</label>
                                                        <input
                                                            type="date"
                                                            value={expectedDeliveryDate}
                                                            onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                                                            className="w-full bg-surface-dark border border-border-dark rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-blue-400"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] text-text-secondary uppercase font-bold mb-2 tracking-widest">Vendor Note</label>
                                                        <input
                                                            type="text"
                                                            value={vendorDocumentNote}
                                                            onChange={(e) => setVendorDocumentNote(e.target.value)}
                                                            placeholder="PO email ref / vendor doc note"
                                                            className="w-full bg-surface-dark border border-border-dark rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-blue-400"
                                                        />
                                                    </div>
                                                </div>
                                                <button 
                                                    disabled={processing}
                                                    onClick={() => handleMarkPlaced(selectedOrder.id)}
                                                    className="w-full bg-blue-500 text-white font-black py-3 rounded-xl uppercase tracking-widest hover:bg-blue-400 transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20"
                                                >
                                                    Mark as PLACED with Vendor
                                                </button>
                                            </div>
                                        )}

                                        {selectedOrder.adminRemarks && (
                                            <div className="mt-6 p-4 bg-surface-dark border border-border-dark rounded-lg italic text-slate-400 text-sm">
                                                <span className="font-bold text-white not-italic block mb-1">Admin Remarks:</span>
                                                "{selectedOrder.adminRemarks}"
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="h-[500px] flex flex-col items-center justify-center bg-surface-dark/30 border border-dashed border-border-dark rounded-2xl">
                                    <span className="material-symbols-outlined text-border-dark text-6xl mb-4">description</span>
                                    <p className="text-text-secondary font-medium tracking-wide">Select a Purchase Order to view details and perform actions</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
