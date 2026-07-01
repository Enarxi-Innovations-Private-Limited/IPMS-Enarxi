import { useState, useEffect } from 'react';
import inventoryService from '../../services/inventoryService';
import { getCurrentUser } from '../../services/authService.js';
import { usePortalLayout } from '../../services/usePortalLayout';
import { useNotifier } from '../common/AppNotificationProvider.jsx';
import MRDeleteConfirmModal from './MRDeleteConfirmModal.jsx';

export default function AdminMRRouting() {
    const Layout = usePortalLayout();
    const currentUser = getCurrentUser();
    const isSuperInventoryAdmin = ['SUPER_ADMIN', 'SUPER_USER'].includes((currentUser?.role || '').toUpperCase());
    const { error: notifyError, success: notifySuccess } = useNotifier();
    const [requests, setRequests] = useState([]);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [selectedLines, setSelectedLines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [deleteModalRequest, setDeleteModalRequest] = useState(null);
    const [deleteConfirmValue, setDeleteConfirmValue] = useState('');
    const [deletePreviewRequestId, setDeletePreviewRequestId] = useState(null);
    const [deletingRequestId, setDeletingRequestId] = useState(null);

    useEffect(() => {
        fetchRequests();
        setSelectedLines([]);
    }, [selectedRequest?._id, selectedRequest?.id]);

    const getId = (value) => value?._id || value?.id || '';

    const fetchRequests = async () => {
        try {
            setLoading(true);
            const res = await inventoryService.getMaterialRequests();
            setRequests((res.data || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
        } catch (err) {
            console.error(err);
            notifyError(err.response?.data?.message || 'Failed to load material requests');
        } finally {
            setLoading(false);
        }
    };

    const refreshSelectedRequest = async (requestId) => {
        if (!requestId) {
            setSelectedRequest(null);
            return;
        }

        const res = await inventoryService.getMaterialRequestDetails(requestId);
        setSelectedRequest(res.data);
    };

    const handleSelectRequest = async (requestSummary) => {
        try {
            setLoading(true);
            const requestId = getId(requestSummary);
            await refreshSelectedRequest(requestId);
            setSelectedLines([]);
        } catch (err) {
            notifyError(err.response?.data?.message || 'Failed to load request details');
        } finally {
            setLoading(false);
        }
    };

    const handleRouteLine = async (lineId, storeQty, purchaseQty) => {
        try {
            setProcessing(true);
            await inventoryService.routeMaterialRequestLine({
                lineId,
                plannedStoreQuantity: storeQty,
                plannedPurchaseQuantity: purchaseQty,
                adminRemarks: 'Routed via IPMS Admin Portal'
            });
            await refreshSelectedRequest(getId(selectedRequest));
            await fetchRequests();
            notifySuccess('Request line routed successfully.');
        } catch (err) {
            notifyError(err.response?.data?.message || 'Routing failed');
        } finally {
            setProcessing(false);
        }
    };

    const handleBulkRoute = async (target) => {
        try {
            setProcessing(true);
            const payload = {
                requestId: getId(selectedRequest),
                routeTarget: target,
                lineId: selectedLines
            };

            selectedLines.forEach((lineId) => {
                const line = selectedRequest.lines.find((entry) => getId(entry) === lineId);
                if (!line) return;

                if (target === 'store') {
                    payload[`store:${lineId}`] = line.requiredQuantity;
                    payload[`purchase:${lineId}`] = 0;
                } else {
                    payload[`store:${lineId}`] = 0;
                    payload[`purchase:${lineId}`] = line.requiredQuantity;
                }

                payload[`remarks:${lineId}`] = `Bulk routed to ${target} via IPMS`;
            });

            await inventoryService.routeMaterialRequestBulk(payload);
            notifySuccess(`Bulk routed ${selectedLines.length} lines to ${target}.`);
            setSelectedLines([]);

            await refreshSelectedRequest(getId(selectedRequest));
            await fetchRequests();
        } catch (err) {
            notifyError(err.response?.data?.message || 'Bulk routing failed');
        } finally {
            setProcessing(false);
        }
    };

    const closeDeleteModal = (force = false) => {
        if (!force && deletingRequestId) return;
        setDeleteModalRequest(null);
        setDeleteConfirmValue('');
    };

    const buildDeleteSuccessMessage = (responseData) => {
        const counts = responseData?.counts || {};
        const fragments = [
            counts.storeBatches ? `${counts.storeBatches} store batch${counts.storeBatches === 1 ? '' : 'es'}` : null,
            counts.purchaseBatches ? `${counts.purchaseBatches} purchase batch${counts.purchaseBatches === 1 ? '' : 'es'}` : null,
            counts.purchaseOrders ? `${counts.purchaseOrders} PO${counts.purchaseOrders === 1 ? '' : 's'}` : null,
            counts.dispatches ? `${counts.dispatches} dispatch${counts.dispatches === 1 ? '' : 'es'}` : null,
            counts.purchaseInwards ? `${counts.purchaseInwards} inward${counts.purchaseInwards === 1 ? '' : 's'}` : null
        ].filter(Boolean);

        return fragments.length
            ? `Deleted ${responseData.requestNumber}. Removed ${fragments.join(', ')}.`
            : `Deleted ${responseData.requestNumber}.`;
    };

    const handleOpenDeleteModal = async (requestSummary) => {
        if (!isSuperInventoryAdmin) return;

        const requestId = getId(requestSummary);
        if (!requestId) return;

        try {
            setDeletePreviewRequestId(requestId);
            const res = await inventoryService.getMaterialRequestDetails(requestId);
            setDeleteModalRequest(res.data);
            setDeleteConfirmValue('');
        } catch (err) {
            notifyError(err.response?.data?.message || 'Failed to load material request details');
        } finally {
            setDeletePreviewRequestId(null);
        }
    };

    const handleConfirmDeepDelete = async () => {
        const requestId = getId(deleteModalRequest);
        if (!requestId) return;

        try {
            setDeletingRequestId(requestId);
            const res = await inventoryService.deleteMaterialRequestDeep(requestId);

            if (getId(selectedRequest) === requestId) {
                setSelectedRequest(null);
                setSelectedLines([]);
            }

            closeDeleteModal(true);
            await fetchRequests();
            notifySuccess(buildDeleteSuccessMessage(res.data));
        } catch (err) {
            notifyError(err.response?.data?.message || 'Failed to deep delete material request');
        } finally {
            setDeletingRequestId(null);
        }
    };

    return (
        <Layout currentPage="inv-store-routing">
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-white tracking-tight">Material Request Routing</h1>
                        <p className="text-text-secondary">Process and source incoming hardware requirements.</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-1 space-y-4">
                            <h2 className="text-xs font-black uppercase tracking-widest text-text-secondary px-2">Incoming Queue</h2>
                            {loading ? (
                                <div className="p-10 text-center bg-surface-dark rounded-xl border border-border-dark animate-pulse">
                                    <div className="size-8 bg-border-dark rounded-full mx-auto mb-2"></div>
                                    <div className="h-4 bg-border-dark rounded w-2/3 mx-auto"></div>
                                </div>
                            ) : (
                                requests.map((req) => {
                                    const requestId = getId(req);
                                    const selectedId = getId(selectedRequest);
                                    return (
                                        <div
                                            key={requestId}
                                            className={`rounded-xl border transition-all ${selectedId === requestId
                                                ? 'bg-primary/10 border-primary shadow-lg shadow-primary/10'
                                                : 'bg-surface-dark border-border-dark hover:border-text-secondary/30'
                                                }`}
                                        >
                                            <button
                                                onClick={() => handleSelectRequest(req)}
                                                className="w-full text-left p-4"
                                            >
                                                <div className="flex justify-between items-start mb-2 gap-3">
                                                    <span className="font-mono text-primary text-xs font-bold">{req.requestNumber}</span>
                                                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${req.status === 'SUBMITTED' ? 'bg-amber-500/20 text-amber-500' : 'bg-emerald-500/20 text-emerald-400'
                                                        }`}>
                                                        {req.status}
                                                    </span>
                                                </div>
                                                <div className="text-white font-bold truncate">{req.project?.name}</div>
                                                <div className="text-text-secondary text-xs mt-1 flex justify-between">
                                                    <span>{req._count?.lines || req.lines?.length || 0} items</span>
                                                    <span>{req.createdAt ? new Date(req.createdAt).toLocaleDateString() : ''}</span>
                                                </div>
                                            </button>
                                            {isSuperInventoryAdmin && (
                                                <div className="px-4 pb-4">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenDeleteModal(req)}
                                                        disabled={deletePreviewRequestId === requestId || deletingRequestId === requestId}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-red-300 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                                                    >
                                                        <span className="material-symbols-outlined text-[14px]">delete</span>
                                                        {deletePreviewRequestId === requestId ? 'Loading' : deletingRequestId === requestId ? 'Deleting' : 'Delete MR'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        <div className="lg:col-span-2">
                            {selectedRequest ? (
                                <div className="bg-surface-dark border border-border-dark rounded-2xl overflow-hidden shadow-2xl">
                                    <div className="p-6 border-b border-border-dark bg-gradient-surface">
                                        <div className="flex justify-between items-center mb-4 gap-4">
                                            <div>
                                                <h3 className="text-2xl font-bold text-white">{selectedRequest.requestNumber}</h3>
                                                <p className="text-text-secondary text-sm">Project: <span className="text-white">{selectedRequest.project?.name}</span></p>
                                            </div>
                                            <div className="flex items-start gap-3">
                                                <div className="text-right">
                                                    <div className="text-text-secondary text-xs uppercase font-bold tracking-widest mb-1">Engineer</div>
                                                    <div className="text-white font-medium">{selectedRequest.engineer?.name}</div>
                                                </div>
                                                {isSuperInventoryAdmin && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenDeleteModal(selectedRequest)}
                                                        disabled={deletePreviewRequestId === getId(selectedRequest) || deletingRequestId === getId(selectedRequest)}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-red-300 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                                                    >
                                                        <span className="material-symbols-outlined text-[14px]">delete</span>
                                                        {deletePreviewRequestId === getId(selectedRequest) ? 'Loading' : deletingRequestId === getId(selectedRequest) ? 'Deleting' : 'Delete MR'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {selectedRequest.notes && (
                                            <div className="bg-background-dark/50 p-3 rounded-lg border border-border-dark text-slate-300 text-sm italic">
                                                "{selectedRequest.notes}"
                                            </div>
                                        )}
                                    </div>

                                    <div className="p-6">
                                        <div className="flex justify-between items-center mb-6">
                                            <h4 className="text-xs font-bold text-text-secondary uppercase tracking-widest">Line Items</h4>
                                            {selectedLines.length > 0 && (
                                                <div className="flex gap-2 animate-in fade-in slide-in-from-right-4">
                                                    <span className="text-xs text-white font-medium mr-2 flex items-center">
                                                        {selectedLines.length} selected
                                                    </span>
                                                    <button
                                                        onClick={() => handleBulkRoute('store')}
                                                        disabled={processing}
                                                        className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/30 transition-all disabled:opacity-50"
                                                    >
                                                        Route to Store
                                                    </button>
                                                    {/* Hide Route to Purchase button as per user request */}
                                                    {/* <button
                                                        onClick={() => handleBulkRoute('purchase')}
                                                        disabled={processing}
                                                        className="px-3 py-1.5 bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded text-[10px] font-black uppercase tracking-widest hover:bg-amber-500/30 transition-all disabled:opacity-50"
                                                    >
                                                        Route to Purchase
                                                    </button> */}
                                                </div>
                                            )}
                                        </div>
                                        <table className="w-full">
                                            <thead>
                                                <tr className="text-left text-xs font-bold uppercase tracking-wider text-text-secondary">
                                                    <th className="pb-4 w-10">
                                                        <input
                                                            type="checkbox"
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    const ids = (selectedRequest.lines || [])
                                                                        .filter((line) => line.status === 'SUBMITTED')
                                                                        .map((line) => getId(line));
                                                                    setSelectedLines(ids);
                                                                } else {
                                                                    setSelectedLines([]);
                                                                }
                                                            }}
                                                            checked={selectedLines.length > 0 && selectedLines.length === (selectedRequest.lines || []).filter((line) => line.status === 'SUBMITTED').length}
                                                            className="accent-primary"
                                                        />
                                                    </th>
                                                    <th className="pb-4">Component</th>
                                                    <th className="pb-4 text-center">Required</th>
                                                    <th className="pb-4 text-center">Available</th>
                                                    <th className="pb-4 text-center">Store</th>
                                                    <th className="pb-4 text-center">Purchase</th>
                                                    <th className="pb-4"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border-dark">
                                                {(selectedRequest.lines || []).map((line) => {
                                                    const lineId = getId(line);
                                                    return (
                                                        <tr key={lineId} className={`group transition-colors ${selectedLines.includes(lineId) ? 'bg-primary/5' : ''}`}>
                                                            <td className="py-4">
                                                                {line.status === 'SUBMITTED' && (
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={selectedLines.includes(lineId)}
                                                                        onChange={() => {
                                                                            if (selectedLines.includes(lineId)) {
                                                                                setSelectedLines(selectedLines.filter((id) => id !== lineId));
                                                                            } else {
                                                                                setSelectedLines([...selectedLines, lineId]);
                                                                            }
                                                                        }}
                                                                        className="accent-primary"
                                                                    />
                                                                )}
                                                            </td>
                                                            <td className="py-4">
                                                                <div className="text-white font-medium">{line.item?.name}</div>
                                                                <div className="text-text-secondary text-xs">{line.item?.itemCode}</div>
                                                            </td>
                                                            <td className="py-4 text-center font-bold text-white">{line.requiredQuantity}</td>
                                                            <td className="py-4 text-center">
                                                                <span className={`text-sm font-bold ${(line.availableAtUpload || 0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                    {line.availableAtUpload || 0}
                                                                </span>
                                                            </td>
                                                            <td className="py-4 text-center">
                                                                {line.status === 'SUBMITTED' ? (
                                                                     <input
                                                                         type="number"
                                                                         placeholder="Store"
                                                                         className="w-16 bg-background-dark border border-border-dark rounded p-1 text-xs text-emerald-400 font-bold outline-none focus:border-emerald-500 mx-auto block"
                                                                         defaultValue={Math.min(line.requiredQuantity, line.availableAtUpload || 0)}
                                                                         id={`store-${lineId}`}
                                                                     />
                                                                 ) : (
                                                                     <div className="text-[10px] font-bold text-emerald-400">
                                                                         {line.plannedStoreQuantity > 0 ? line.plannedStoreQuantity : '-'}
                                                                     </div>
                                                                 )}
                                                             </td>
                                                             <td className="py-4 text-center">
                                                                 {line.status === 'SUBMITTED' ? (
                                                                     <input
                                                                         type="number"
                                                                         placeholder="Purchase"
                                                                         className="w-16 bg-background-dark border border-border-dark rounded p-1 text-xs text-amber-400 font-bold outline-none focus:border-amber-500 mx-auto block"
                                                                         defaultValue={Math.max(0, line.requiredQuantity - (line.availableAtUpload || 0))}
                                                                         id={`pur-${lineId}`}
                                                                     />
                                                                 ) : (
                                                                     <div className="text-[10px] font-bold text-amber-400">
                                                                         {line.plannedPurchaseQuantity > 0 ? line.plannedPurchaseQuantity : '-'}
                                                                     </div>
                                                                 )}
                                                             </td>
                                                             <td className="py-4 px-2">
                                                                 {line.status !== 'SUBMITTED' && (
                                                                     <span className="text-[9px] uppercase tracking-tighter text-text-secondary font-black">{line.status?.replace(/_/g, ' ')}</span>
                                                                 )}
                                                             </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-[400px] flex flex-col items-center justify-center bg-surface-dark/30 border border-dashed border-border-dark rounded-2xl">
                                    <span className="material-symbols-outlined text-border-dark text-6xl mb-4">move_to_inbox</span>
                                    <p className="text-text-secondary font-medium tracking-wide">Select a request from the queue to start routing</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <MRDeleteConfirmModal
                isOpen={Boolean(deleteModalRequest)}
                request={deleteModalRequest}
                summary={deleteModalRequest?.deletionSummary}
                confirmValue={deleteConfirmValue}
                onConfirmValueChange={setDeleteConfirmValue}
                onClose={() => closeDeleteModal(false)}
                onDelete={handleConfirmDeepDelete}
                deleting={Boolean(deletingRequestId)}
            />
        </Layout>
    );
}
