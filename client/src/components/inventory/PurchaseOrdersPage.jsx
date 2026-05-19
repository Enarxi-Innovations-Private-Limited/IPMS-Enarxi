import { useState, useEffect } from 'react';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout';
import { useNotifier } from '../common/AppNotificationProvider.jsx';
import { getCurrentUser } from '../../services/authService';

const ENARXI_LOGO = '/enarxi-front-logo-black-d1m9Cf6C.png';

export default function PurchaseOrdersPage() {
    const Layout = usePortalLayout();
    const user = getCurrentUser();
    const isAdmin = ['ADMIN', 'SUPER_ADMIN', 'SUPER_USER'].includes(user?.role);
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

    const handleDownloadPDF = async (orderId, poNumber) => {
        try {
            setProcessing(true);
            const response = await inventoryService.downloadPurchaseOrderPDF(orderId);

            const blob = new Blob([response.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `PO_${poNumber}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            notifySuccess(`PDF Generated: PO_${poNumber}.pdf`);
        } catch (err) {
            console.error('PDF Download Error:', err);
            notifyError('Could not download PO PDF. Please log out and back in if this persists.');
        } finally {
            setProcessing(false);
        }
    };

    const filteredOrders = filterStatus === 'ALL'
        ? orders
        : orders.filter(o => o.status === filterStatus);
    const canMarkPlaced = selectedOrder?.nextAllowedActions?.includes('MARK_PLACED') || selectedOrder?.status === 'APPROVED';

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
                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div>
                            <h1 className="text-2xl font-bold text-[#0b2850] tracking-tight">Purchase Order Details</h1>
                            <p className="text-[#556070] text-sm">Financial Suite & Procurement Management</p>
                        </div>
                        <div className="flex flex-wrap gap-1 bg-white/95 p-1 rounded-xl border border-[#d7dfeb] shadow-sm">
                            {['ALL', 'PENDING_ADMIN_APPROVAL', 'APPROVED', 'PLACED', 'REJECTED'].map(status => (
                                <button
                                    key={status}
                                    onClick={() => setFilterStatus(status)}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${filterStatus === status
                                        ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                        : 'text-[#5b6880] hover:bg-[#eef3ff] hover:text-[#0b2850]'
                                        }`}
                                >
                                    {status.replace(/_/g, ' ')}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
                        {/* List Sidebar */}
                        <div className="lg:col-span-1 space-y-3 overflow-y-auto max-h-[calc(100vh-250px)] custom-scrollbar pr-2">
                            {loading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <div key={i} className="h-24 bg-white rounded-xl border border-[#d7dfeb] shadow-sm animate-pulse"></div>
                                ))
                            ) : filteredOrders.length === 0 ? (
                                <div className="p-8 text-center bg-white/80 border border-dashed border-[#d7dfeb] rounded-xl shadow-sm">
                                    <p className="text-[#6d7890] text-xs">No orders found.</p>
                                </div>
                            ) : (
                                filteredOrders.map(order => (
                                    <button
                                        key={order._id || order.id}
                                        onClick={() => setSelectedOrder(order)}
                                        className={`w-full text-left p-4 rounded-xl border transition-all group ${selectedOrder?.id === order.id
                                            ? 'bg-[#edf3ff] border-[#9cb6e7] shadow-lg shadow-[#b9c8e4]/35'
                                            : 'bg-white border-[#d7dfeb] shadow-sm hover:border-[#9cb6e7] hover:shadow-md'
                                            }`}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <span className={`font-mono text-[10px] font-bold ${selectedOrder?.id === order.id ? 'text-[#0b2850]' : 'text-primary'}`}>{order.poNumber}</span>
                                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${selectedOrder?.id === order.id ? 'bg-[#d9e5fb] text-[#0b2850]' : getStatusColor(order.status)}`}>
                                                {order.status}
                                            </span>
                                        </div>
                                        <div className={`font-bold truncate text-sm ${selectedOrder?.id === order.id ? 'text-[#102f57]' : 'text-slate-700'}`}>{order.vendor?.name}</div>
                                        <div className={`flex justify-between items-center mt-3 pt-2 ${selectedOrder?.id === order.id ? 'border-t border-[#d3def2]' : 'border-t border-[#edf1f7]'}`}>
                                            <div className={`text-[9px] uppercase font-black ${selectedOrder?.id === order.id ? 'text-[#6c7a90]' : 'text-text-secondary'}`}>
                                                {order.lines?.length || 0} Items
                                            </div>
                                            <div className={`font-mono text-[10px] font-bold ${selectedOrder?.id === order.id ? 'text-[#0b2850]' : 'text-primary'}`}>
                                                ₹{order.lines?.reduce((sum, l) => sum + Number(l.lineTotal), 0).toLocaleString()}
                                            </div>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>

                        {/* Redesigned Details View */}
                        <div className="lg:col-span-3">
                            {selectedOrder ? (
                                <div className="space-y-6">
                                    {/* Action Bar */}
                                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between bg-white border border-[#d7dfeb] p-4 rounded-xl shadow-sm">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-black text-[#6d7890] uppercase tracking-widest">Status:</span>
                                            <span className={`text-[10px] font-black px-3 py-1 rounded uppercase ${getStatusColor(selectedOrder.status)}`}>
                                                {selectedOrder.status}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {canMarkPlaced && (
                                                <button
                                                    disabled={processing}
                                                    onClick={() => handleMarkPlaced(selectedOrder.id || selectedOrder._id)}
                                                    className="flex items-center gap-2 bg-emerald-500 text-black px-5 py-2 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-emerald-400 transition-all disabled:opacity-50"
                                                >
                                                    <span className="material-symbols-outlined text-sm">local_shipping</span>
                                                    Place Order
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDownloadPDF(selectedOrder.id || selectedOrder._id, selectedOrder.poNumber)}
                                                className="flex items-center gap-2 bg-[#001f3f] text-white px-5 py-2 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-primary transition-all"
                                            >
                                                <span className="material-symbols-outlined text-sm">print</span>
                                                Print / Export
                                            </button>
                                            <button className="flex items-center gap-2 bg-[#eef3ff] text-[#2b45a2] border border-[#c8d7fb] px-5 py-2 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-[#2b45a2] hover:text-white transition-all">
                                                <span className="material-symbols-outlined text-sm">edit</span>
                                                Edit Order
                                            </button>
                                        </div>
                                    </div>
                                    <div className="bg-white border border-[#d7dfeb] p-4 rounded-xl shadow-sm">
                                        <h4 className="text-[10px] font-black text-[#6d7890] uppercase tracking-widest mb-3">Lifecycle Timeline</h4>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
                                            <div className={`${selectedOrder.createdAt ? 'text-emerald-600 font-semibold' : 'text-[#6d7890]'}`}>Submitted</div>
                                            <div className={`${selectedOrder.approvedAt ? 'text-emerald-600 font-semibold' : 'text-[#6d7890]'}`}>Approved</div>
                                            <div className={`${selectedOrder.placedAt ? 'text-emerald-600 font-semibold' : 'text-[#6d7890]'}`}>Placed</div>
                                            <div className={`${selectedOrder.status === 'RECEIVED' ? 'text-emerald-600 font-semibold' : 'text-[#6d7890]'}`}>
                                                Inward {selectedOrder.inwardProgress ? `(${selectedOrder.inwardProgress.receivedQty}/${selectedOrder.inwardProgress.orderedQty})` : ''}
                                            </div>
                                        </div>
                                    </div>

                                    {/* The Document View */}
                                    <div className="bg-white rounded-sm shadow-[0_10px_40px_rgba(0,0,0,0.3)] mx-auto p-12 max-w-[850px] text-slate-800 font-sans min-h-[1000px] relative overflow-hidden">
                                        {/* Watermark/Accent */}
                                        <div className="absolute top-0 left-0 w-full h-1 bg-[#2b45a2]"></div>

                                        <div className="flex justify-between items-start mb-12">
                                            <div className="flex gap-4 items-start">
                                                <img src={ENARXI_LOGO} alt="Enarxi" className="h-14 w-auto object-contain" />
                                            </div>
                                            <div className="text-right">
                                                <h1 className="text-4xl font-serif text-[#001f3f] font-light tracking-tight mb-4">PURCHASE ORDER</h1>
                                                <div className="space-y-1">
                                                    <div className="text-[10px] uppercase font-bold text-slate-400">PO Number: <span className="text-slate-900 ml-1">{selectedOrder.poNumber}</span></div>
                                                    <div className="text-[10px] uppercase font-bold text-slate-400">Date: <span className="text-slate-900 ml-1">{new Date(selectedOrder.createdAt).toLocaleDateString()}</span></div>
                                                    <div className="text-[10px] uppercase font-bold text-slate-400">Status: <span className="text-slate-900 ml-1">{selectedOrder.status}</span></div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-8 mb-12">
                                            <div className="bg-[#f8f9fa] border border-slate-200 rounded p-5">
                                                <div className="text-[10px] font-black text-[#2b45a2] uppercase tracking-widest mb-4 border-b border-slate-200 pb-2">Vendor Details</div>
                                                <div className="text-sm font-bold text-slate-900 mb-1">{selectedOrder.vendor?.name}</div>
                                                <div className="text-[11px] text-slate-500 leading-relaxed mb-3">
                                                    {selectedOrder.vendor?.address || 'Address not provided'}
                                                </div>
                                                <div className="text-[10px] font-bold text-slate-400">GSTIN: <span className="text-slate-700 ml-1">{selectedOrder.vendor?.gstin || 'N/A'}</span></div>
                                            </div>
                                            <div className="bg-[#f8f9fa] border border-slate-200 rounded p-5">
                                                <div className="text-[10px] font-black text-[#2b45a2] uppercase tracking-widest mb-4 border-b border-slate-200 pb-2">Ship To</div>
                                                <div className="text-sm font-bold text-slate-900 mb-1">Enarxi Innovations Pvt Ltd</div>
                                            </div>
                                        </div>

                                        <table className="w-full text-left mb-12">
                                            <thead>
                                                <tr className="text-[10px] font-black uppercase text-slate-400 bg-[#f1f3f5] border-y border-slate-200">
                                                    <th className="px-4 py-3">Item / SKU</th>
                                                    <th className="px-4 py-3 text-right">Qty</th>
                                                    <th className="px-4 py-3 text-right">Rate</th>
                                                    <th className="px-4 py-3 text-right">GST%</th>
                                                    <th className="px-4 py-3 text-right">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {selectedOrder.lines?.map(line => (
                                                    <tr key={line._id || line.id} className="text-[11px]">
                                                        <td className="px-4 py-4">
                                                            <div className="font-bold text-slate-900">{line.item?.name}</div>
                                                            <div className="text-[9px] text-slate-400 mt-0.5">{line.item?.itemCode}</div>
                                                        </td>
                                                        <td className="px-4 py-4 text-right font-bold">{line.orderQuantity}</td>
                                                        <td className="px-4 py-4 text-right">{Number(line.rate).toFixed(2)}</td>
                                                        <td className="px-4 py-4 text-right">{line.gstPercent}%</td>
                                                        <td className="px-4 py-4 text-right font-bold text-slate-900">₹{Number(line.lineTotal).toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>

                                        <div className="flex justify-end pt-8 border-t border-slate-200">
                                            <div className="w-64 space-y-3">
                                                <div className="flex justify-between text-[11px] font-bold">
                                                    <span className="text-slate-400 uppercase tracking-widest">Subtotal:</span>
                                                    <span className="text-slate-900">INR {selectedOrder.lines?.reduce((sum, l) => sum + (Number(l.rate) * Number(l.orderQuantity)), 0).toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between text-[11px] font-bold">
                                                    <span className="text-slate-400 uppercase tracking-widest">Total Tax (GST):</span>
                                                    <span className="text-slate-900">INR {(selectedOrder.lines?.reduce((sum, l) => sum + Number(l.lineTotal), 0) - selectedOrder.lines?.reduce((sum, l) => sum + (Number(l.rate) * Number(l.orderQuantity)), 0)).toFixed(2)}</span>
                                                </div>
                                                <div className="bg-white border-2 border-[#001f3f] text-[#001f3f] p-4 rounded flex justify-between items-center shadow-lg">
                                                    <span className="text-lg font-serif italic">Grand Total:</span>
                                                    <div className="text-right">
                                                        <div className="text-[8px] uppercase font-black text-[#001f3f]/60">INR</div>
                                                        <div className="text-xl font-bold">₹{selectedOrder.lines?.reduce((sum, l) => sum + Number(l.lineTotal), 0).toLocaleString()}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-24 pt-12 border-t border-slate-100 flex justify-between text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                                            <div>Authorized Signature</div>
                                            <div>Generated via Enarxi ERP Financial Suite</div>
                                        </div>
                                    </div>

                                    {/* Action Footers (Review/Approve) */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-12">
                                        {selectedOrder.status === 'PENDING_ADMIN_APPROVAL' && isAdmin && (
                                            <div className="bg-[#f3fbf7] border border-[#c8edd8] rounded-xl p-6 col-span-2 shadow-sm">
                                                <h4 className="text-[#113b2b] font-bold mb-4 flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-emerald-400">rate_review</span>
                                                    Administrative Review
                                                </h4>
                                                <textarea
                                                    className="w-full bg-white border border-[#cfe1d6] rounded-lg p-3 text-[#1c2b40] text-sm outline-none focus:border-emerald-400 mb-4 h-24"
                                                    placeholder="Enter approval/rejection remarks..."
                                                    value={reviewRemarks}
                                                    onChange={(e) => setReviewRemarks(e.target.value)}
                                                ></textarea>
                                                <div className="flex gap-3">
                                                    <button
                                                        disabled={processing}
                                                        onClick={() => handleReview(selectedOrder.id || selectedOrder._id, 'APPROVED')}
                                                        className="flex-1 bg-emerald-500 text-black font-black py-3 rounded-xl uppercase tracking-widest hover:bg-emerald-400 transition-all disabled:opacity-50"
                                                    >
                                                        Approve PO
                                                    </button>
                                                    <button
                                                        disabled={processing}
                                                        onClick={() => handleReview(selectedOrder.id || selectedOrder._id, 'REJECTED')}
                                                        className="flex-1 bg-red-500 text-white font-black py-3 rounded-xl uppercase tracking-widest hover:bg-red-400 transition-all disabled:opacity-50"
                                                    >
                                                        Reject PO
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {(selectedOrder.status === 'DRAFT' || selectedOrder.status === 'REJECTED') && (
                                            <div className="bg-[#fff9ec] border border-[#f2dfab] rounded-xl p-6 col-span-2 shadow-sm">
                                                <h4 className="text-[#5d4500] font-bold mb-4 flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-amber-400">approval</span>
                                                    Submit For Approval
                                                </h4>
                                                <button
                                                    disabled={processing}
                                                    onClick={() => handleSubmitForApproval(selectedOrder.id || selectedOrder._id)}
                                                    className="w-full bg-amber-500 text-black font-black py-3 rounded-xl uppercase tracking-widest hover:bg-amber-400 transition-all disabled:opacity-50 shadow-lg shadow-amber-500/20"
                                                >
                                                    Submit to Admin Queue
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="h-[600px] flex flex-col items-center justify-center bg-white/80 border border-dashed border-[#d7dfeb] rounded-2xl shadow-sm">
                                    <span className="material-symbols-outlined text-[#b0bccd] text-6xl mb-4">description</span>
                                    <p className="text-[#6d7890] font-medium tracking-wide">Select a Purchase Order to view the document details</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
