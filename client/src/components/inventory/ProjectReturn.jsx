import { useState, useEffect } from 'react';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout.js';

export default function ProjectReturn({ currentPage: propCurrentPage }) {
    const Layout = usePortalLayout();
    const currentPage = propCurrentPage || 'returns';
    const [projects, setProjects] = useState([]);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        projectId: '',
        locationId: '',
        items: [{ itemCode: '', quantity: 1, remarks: '' }]
    });
    const [locations, setLocations] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [projRes, itemRes, locRes] = await Promise.all([
                    api.get('/projects'),
                    inventoryService.getItems(),
                    inventoryService.getLocations()
                ]);
                setProjects(projRes.data.filter(p => p.status === 'ACTIVE'));
                setItems(itemRes.data);
                setLocations(locRes.data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleAddItem = () => {
        setFormData({ ...formData, items: [...formData.items, { itemCode: '', quantity: 1, remarks: '' }] });
    };

    const handleItemChange = (idx, field, value) => {
        const newItems = [...formData.items];
        newItems[idx][field] = value;
        setFormData({ ...formData, items: newItems });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setSubmitting(true);
            // Using Stock Adjustment as the backend for returns (Manual Addition type)
            const payload = formData.items.map((it, i) => ({
                rowNumber: i + 1,
                itemCode: it.itemCode,
                locationCode: locations.find(l => l.id === formData.locationId)?.locationCode,
                quantity: it.quantity,
                remarks: `Return from Project: ${it.remarks}`
            }));

            await inventoryService.submitStockAdjustment({
                batchType: 'MANUAL_ADDITION',
                reason: `Project Return: ${projects.find(p => p.id === formData.projectId)?.name}`,
                payload: JSON.stringify(payload)
            });
            alert('Project return submitted for approval!');
            setFormData({ projectId: '', locationId: '', items: [{ itemCode: '', quantity: 1, remarks: '' }] });
        } catch (err) {
            alert('Submission failed. Ensure all fields are correct.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Layout currentPage={currentPage}>
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-4xl mx-auto w-full">
                    <div className="mb-8 text-center">
                        <h1 className="text-3xl font-bold text-white tracking-tight">Project Return to Store</h1>
                        <p className="text-text-secondary text-lg">Return leftover or unused hardware components to the warehouse.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="bg-surface-dark border border-border-dark rounded-2xl p-8 shadow-2xl space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs font-bold text-text-secondary uppercase mb-2 tracking-widest">Select Project</label>
                                <select
                                    className="w-full bg-background-dark border border-border-dark rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-primary"
                                    value={formData.projectId}
                                    onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                                    required
                                >
                                    <option value="">Source project...</option>
                                    {projects.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-text-secondary uppercase mb-2 tracking-widest">Return To (Warehouse)</label>
                                <select
                                    className="w-full bg-background-dark border border-border-dark rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                                    value={formData.locationId}
                                    onChange={(e) => setFormData({ ...formData, locationId: e.target.value })}
                                    required
                                >
                                    <option value="">Select destination bin...</option>
                                    {locations.map(loc => (
                                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest">Components to Return</h3>
                                <button type="button" onClick={handleAddItem} className="text-primary text-sm font-bold flex items-center gap-1 hover:underline">
                                    <span className="material-symbols-outlined text-sm">add</span> Add Another
                                </button>
                            </div>

                            {formData.items.map((row, idx) => (
                                <div key={idx} className="flex flex-col md:flex-row gap-4 items-end bg-background-dark/30 p-4 rounded-xl border border-border-dark">
                                    <div className="flex-1 w-full">
                                        <label className="block text-[9px] font-bold text-text-secondary uppercase mb-1">Item</label>
                                        <select
                                            className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-white text-sm"
                                            value={row.itemCode}
                                            onChange={(e) => handleItemChange(idx, 'itemCode', e.target.value)}
                                            required
                                        >
                                            <option value="">Select...</option>
                                            {items.map(i => (
                                                <option key={i.id} value={i.itemCode}>{i.name} ({i.itemCode})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="w-full md:w-24">
                                        <label className="block text-[9px] font-bold text-text-secondary uppercase mb-1">Qty</label>
                                        <input
                                            type="number"
                                            className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-white text-sm"
                                            value={row.quantity}
                                            onChange={(e) => handleItemChange(idx, 'quantity', parseFloat(e.target.value))}
                                            required
                                            min="0.01"
                                        />
                                    </div>
                                    <div className="flex-1 w-full">
                                        <label className="block text-[9px] font-bold text-text-secondary uppercase mb-1">Condition/Remarks</label>
                                        <input
                                            className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-white text-sm"
                                            placeholder="e.g. Unused, minor scratch"
                                            value={row.remarks}
                                            onChange={(e) => handleItemChange(idx, 'remarks', e.target.value)}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            type="submit"
                            disabled={submitting || loading}
                            className="w-full bg-emerald-500 py-4 rounded-xl text-black font-black uppercase tracking-widest shadow-xl shadow-emerald-500/20 hover:bg-emerald-400 transition-all disabled:opacity-50"
                        >
                            {submitting ? 'Submitting Return...' : 'Finalize Project Return'}
                        </button>
                    </form>
                </div>
            </div>
        </Layout>
    );
}
