import { useState, useEffect } from 'react';
import { getCurrentUser } from '../../services/authService';
import EmployeeLayout from '../common/EmployeeLayout';
import InternLayout from '../common/InternLayout';
import ManagerLayout from '../common/ManagerLayout';
import api from '../../services/api';

export default function MyIssuedItemsPage() {
    const user = getCurrentUser();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // Action States
    const [selectedItem, setSelectedItem] = useState(null);
    const [showReturnModal, setShowReturnModal] = useState(false);
    const [showConsumeModal, setShowConsumeModal] = useState(false);
    const [returnCondition, setReturnCondition] = useState('GOOD');
    const [returnRemarks, setReturnRemarks] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        loadItems();
    }, []);

    const loadItems = async () => {
        try {
            setLoading(true);
            const response = await api.get('/stock/issued/my-items');
            setItems(response.data);
            setError('');
        } catch (err) {
            console.error('Failed to load items:', err);
            setError('Failed to load your issued items.');
        } finally {
            setLoading(false);
        }
    };

    const handleConsumeClick = (item) => {
        setSelectedItem(item);
        setShowConsumeModal(true);
    };

    const handleReturnClick = (item) => {
        setSelectedItem(item);
        setReturnCondition('GOOD');
        setReturnRemarks('');
        setShowReturnModal(true);
    };

    const handleConsumeSubmit = async () => {
        setSubmitting(true);
        try {
            await api.post(`/stock/issued/${selectedItem._id}/consume`);
            setSuccessMsg('Item marked as consumed.');
            setTimeout(() => setSuccessMsg(''), 3000);
            setShowConsumeModal(false);
            loadItems();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to mark as consumed.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleReturnSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await api.post(`/stock/issued/${selectedItem._id}/request-return`, {
                condition: returnCondition,
                remarks: returnRemarks
            });
            setSuccessMsg('Return requested successfully.');
            setTimeout(() => setSuccessMsg(''), 3000);
            setShowReturnModal(false);
            loadItems();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to request return.');
        } finally {
            setSubmitting(false);
        }
    };

    const getStatusBadge = (status) => {
        if (status === 'RETURN_REQUESTED') return <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-orange-500/20 text-orange-400">Return Requested</span>;
        if (status === 'ISSUED') return <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-blue-500/20 text-blue-400">Issued</span>;
        return status;
    };

    // Determine layout based on role
    const getLayout = () => {
        if (user?.role === 'MANAGER') return ManagerLayout;
        if (user?.role === 'EMPLOYEE') return EmployeeLayout;
        if (user?.role === 'INTERN') return InternLayout;
        return EmployeeLayout; // Fallback
    };
    const Layout = getLayout();

    return (
        <Layout currentPage="my-items">
            <div className="p-6 md:p-8">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-white mb-2">My Issued Items</h1>
                    <p className="text-text-secondary">Tools and equipment currently assigned to you.</p>
                </div>

                {successMsg && <div className="mb-4 p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400">{successMsg}</div>}

                {loading ? (
                    <div className="flex justify-center p-12">
                        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : error ? (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg">
                        {error}
                    </div>
                ) : items.length === 0 ? (
                    <div className="bg-surface-dark border border-border-dark rounded-xl p-12 text-center">
                        <span className="material-symbols-outlined text-4xl text-text-secondary mb-4">inventory_2</span>
                        <p className="text-text-secondary text-lg">You don't have any items currently issued.</p>
                    </div>
                ) : (
                    <div className="bg-surface-dark border border-border-dark rounded-xl overflow-hidden shadow-lg">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-border-dark bg-surface-light/30">
                                        <th className="text-left p-4 text-text-secondary font-medium uppercase text-xs">Product</th>
                                        <th className="text-left p-4 text-text-secondary font-medium uppercase text-xs">Category</th>
                                        <th className="text-left p-4 text-text-secondary font-medium uppercase text-xs">Quantity</th>
                                        <th className="text-left p-4 text-text-secondary font-medium uppercase text-xs">Project</th>
                                        <th className="text-left p-4 text-text-secondary font-medium uppercase text-xs">Date Issued</th>
                                        <th className="text-left p-4 text-text-secondary font-medium uppercase text-xs">Status</th>
                                        <th className="text-left p-4 text-text-secondary font-medium uppercase text-xs">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-dark">
                                    {items.map(item => (
                                        <tr key={item._id} className="hover:bg-surface-light/10 transition-colors">
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-lg bg-surface-light flex items-center justify-center text-primary">
                                                        <span className="material-symbols-outlined">
                                                            {item.product?.category === 'TOOLS' ? 'build' : 'memory'}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <div className="text-white font-medium">{item.product?.name}</div>
                                                        <div className="text-xs text-text-secondary">{item.product?.partNumber}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-surface-light text-text-secondary">
                                                    {item.product?.category || 'General'}
                                                </span>
                                            </td>
                                            <td className="p-4 text-white font-medium">{item.quantity}</td>
                                            <td className="p-4 text-text-secondary text-sm">
                                                {item.project?.name || 'N/A'}
                                            </td>
                                            <td className="p-4 text-text-secondary text-sm">
                                                {new Date(item.issuedAt).toLocaleDateString()}
                                            </td>
                                            <td className="p-4">
                                                {getStatusBadge(item.status)}
                                            </td>
                                            <td className="p-4">
                                                {item.status === 'ISSUED' && (
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleConsumeClick(item)}
                                                            className="px-3 py-1.5 rounded-lg border border-border-dark hover:bg-surface-light text-text-secondary text-xs font-medium transition-colors"
                                                            title="Mark as used for project"
                                                        >
                                                            Used
                                                        </button>
                                                        <button
                                                            onClick={() => handleReturnClick(item)}
                                                            className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 text-xs font-medium transition-colors"
                                                            title="Request Return"
                                                        >
                                                            Return
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Consume Modal */}
            {showConsumeModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-surface-dark border border-border-dark rounded-xl w-full max-w-sm mx-4 shadow-2xl p-6">
                        <h2 className="text-xl font-bold text-white mb-2">Mark as Used?</h2>
                        <p className="text-text-secondary mb-6">
                            Did you use <b>{selectedItem?.quantity} {selectedItem?.product?.name}</b> for the project?
                            <br /><br />
                            This will remove it from your active list status.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowConsumeModal(false)}
                                className="px-4 py-2 text-text-secondary hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConsumeSubmit}
                                disabled={submitting}
                                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
                            >
                                {submitting ? 'Processing...' : 'Yes, Mark Used'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Return Request Modal */}
            {showReturnModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-surface-dark border border-border-dark rounded-xl w-full max-w-md mx-4 shadow-2xl p-6">
                        <h2 className="text-xl font-bold text-white mb-4">Request Return</h2>
                        <p className="text-sm text-text-secondary mb-4">
                            You are requesting to return <b>{selectedItem?.product?.name}</b> to stock.
                        </p>
                        <form onSubmit={handleReturnSubmit}>
                            <div className="mb-4">
                                <label className="block text-sm text-text-secondary mb-1">Condition *</label>
                                <select
                                    value={returnCondition}
                                    onChange={(e) => setReturnCondition(e.target.value)}
                                    className="w-full px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary"
                                >
                                    <option value="GOOD">Good (Unused/Reusable)</option>
                                    <option value="DEFECTIVE">Defective (Faulty)</option>
                                    <option value="DAMAGED">Damaged (Broken)</option>
                                </select>
                            </div>
                            <div className="mb-6">
                                <label className="block text-sm text-text-secondary mb-1">Remarks</label>
                                <textarea
                                    value={returnRemarks}
                                    onChange={(e) => setReturnRemarks(e.target.value)}
                                    placeholder="Any notes (e.g., reason for defect)..."
                                    className="w-full px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary h-24 resize-none"
                                />
                            </div>
                            <div className="flex gap-3 justify-end">
                                <button
                                    type="button"
                                    onClick={() => setShowReturnModal(false)}
                                    className="px-4 py-2 text-text-secondary hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    {submitting ? 'Sending...' : 'Send Request'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
}
