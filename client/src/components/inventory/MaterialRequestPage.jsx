import { useState, useEffect } from 'react';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout.js';

export default function MaterialRequestPage({ currentPage: propCurrentPage }) {
    const Layout = usePortalLayout();
    const currentPage = propCurrentPage || 'material-requests';
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [projects, setProjects] = useState([]);
    const [items, setItems] = useState([]);
    const [error, setError] = useState('');
    const [showModal, setShowModal] = useState(false);

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
                    api.get('/projects'), // Fetch PM projects
                    inventoryService.getItems()
                ]);
                setRequests(reqRes.data);
                setProjects(projRes.data.filter(p => p.status === 'ACTIVE'));
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
        } catch (err) {
            alert(err.response?.data?.message || 'Submission failed');
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
                            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">
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
                    <div className="bg-surface-dark border border-border-dark rounded-xl shadow-xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface">
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
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
                                    <thead className="bg-background-dark/50">
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
                                            <tr key={req.id} className="hover:bg-background-dark/30 transition-colors">
                                                <td className="px-6 py-4 font-mono text-primary text-sm">{req.requestNumber}</td>
                                                <td className="px-6 py-4 text-white font-medium">{req.project?.name}</td>
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
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowModal(false)}></div>
                    <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface flex items-center justify-between">
                            <h2 className="text-xl font-bold text-white">Submit Material Request</h2>
                            <button onClick={() => setShowModal(false)} className="text-text-secondary hover:text-white">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">Select Project</label>
                                <select
                                    className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-primary"
                                    required
                                    value={formData.projectId}
                                    onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                                >
                                    <option value="">Choose a hardware project...</option>
                                    {projects.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">Item Requirements</label>
                                    <button type="button" onClick={handleAddItem} className="text-primary text-sm font-bold flex items-center gap-1 hover:underline">
                                        <span className="material-symbols-outlined text-sm">add</span> Add Item
                                    </button>
                                </div>
                                {formData.items.map((row, idx) => (
                                    <div key={idx} className="flex gap-4 items-end">
                                        <div className="flex-1">
                                            <select
                                                className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2 text-white text-sm"
                                                value={row.itemCode}
                                                onChange={(e) => handleItemChange(idx, 'itemCode', e.target.value)}
                                                required
                                            >
                                                <option value="">Select component...</option>
                                                {items.map(i => (
                                                    <option key={i.id} value={i.itemCode}>{i.name} ({i.itemCode})</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="w-24">
                                            <input
                                                type="number"
                                                className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2 text-white text-sm"
                                                value={row.quantity}
                                                onChange={(e) => handleItemChange(idx, 'quantity', parseFloat(e.target.value))}
                                                required
                                                min="1"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">Additional Notes</label>
                                <textarea
                                    className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-primary h-24"
                                    placeholder="Purpose of request..."
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                />
                            </div>

                            <div className="flex justify-end gap-4 pt-4">
                                <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2.5 rounded-lg border border-border-dark text-white font-bold hover:bg-background-dark">Cancel</button>
                                <button type="submit" disabled={loading} className="px-8 py-2.5 rounded-lg bg-gradient-primary text-white font-bold shadow-lg shadow-primary/20 disabled:opacity-50">
                                    {loading ? 'Submitting...' : 'Submit Request'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
}
