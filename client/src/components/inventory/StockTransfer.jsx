import { useState, useEffect } from 'react';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout';
import { useNotifier } from '../common/AppNotificationProvider.jsx';

export default function StockTransfer() {
    const Layout = usePortalLayout();
    const { error: notifyError, success: notifySuccess } = useNotifier();
    const [stock, setStock] = useState([]);
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [transferring, setTransferring] = useState(false);
    const [formData, setFormData] = useState({
        itemId: '',
        fromLocationId: '',
        toLocationId: '',
        quantity: 0,
        remarks: ''
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const [stockRes, locRes] = await Promise.all([
                    inventoryService.getItems(),
                    inventoryService.getLocations()
                ]);
                setStock(stockRes.data);
                setLocations(locRes.data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (formData.fromLocationId === formData.toLocationId) {
            notifyError('Source and destination locations must be different.');
            return;
        }

        try {
            setTransferring(true);
            await inventoryService.transferStock(formData);
            notifySuccess('Stock transfer completed successfully.');
            setFormData({ itemId: '', fromLocationId: '', toLocationId: '', quantity: 0, remarks: '' });
        } catch (err) {
            notifyError(err.response?.data?.message || 'Transfer failed');
        } finally {
            setTransferring(false);
        }
    };

    return (
        <Layout currentPage="inv-transfers">
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-4xl mx-auto w-full">
                    <div className="mb-8 text-center">
                        <h1 className="text-3xl font-bold text-white tracking-tight">Internal Stock Transfer</h1>
                        <p className="text-text-secondary">Relocate hardware components between warehouses or bins.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="bg-surface-dark border border-border-dark rounded-2xl p-8 shadow-2xl space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-text-secondary uppercase mb-2 tracking-widest">Select Component</label>
                                <select 
                                    className="w-full bg-background-dark border border-border-dark rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-primary transition-all"
                                    value={formData.itemId}
                                    onChange={(e) => setFormData({...formData, itemId: e.target.value})}
                                    required
                                >
                                    <option value="">Choose item to transfer...</option>
                                    {stock.map(s => (
                                        <option key={s.id || s._id} value={s.id || s._id}>{s.name} ({s.itemCode})</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-red-400 uppercase mb-2 tracking-widest">From Location</label>
                                <select 
                                    className="w-full bg-background-dark border border-red-500/20 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-red-500 transition-all"
                                    value={formData.fromLocationId}
                                    onChange={(e) => setFormData({...formData, fromLocationId: e.target.value})}
                                    required
                                >
                                    <option value="">Source location...</option>
                                    {locations.map(loc => (
                                        <option key={loc.id || loc._id} value={loc.id || loc._id}>{loc.name} ({loc.locationCode})</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-emerald-400 uppercase mb-2 tracking-widest">To Location</label>
                                <select 
                                    className="w-full bg-background-dark border border-emerald-500/20 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                                    value={formData.toLocationId}
                                    onChange={(e) => setFormData({...formData, toLocationId: e.target.value})}
                                    required
                                >
                                    <option value="">Destination location...</option>
                                    {locations.map(loc => (
                                        <option key={loc.id || loc._id} value={loc.id || loc._id}>{loc.name} ({loc.locationCode})</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-text-secondary uppercase mb-2 tracking-widest">Quantity</label>
                                <input 
                                    type="number"
                                    className="w-full bg-background-dark border border-border-dark rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-primary transition-all"
                                    value={formData.quantity}
                                    onChange={(e) => setFormData({...formData, quantity: parseFloat(e.target.value)})}
                                    required
                                    min="0.01"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-text-secondary uppercase mb-2 tracking-widest">Remarks</label>
                                <input 
                                    type="text"
                                    className="w-full bg-background-dark border border-border-dark rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-primary transition-all"
                                    placeholder="Purpose of transfer"
                                    value={formData.remarks}
                                    onChange={(e) => setFormData({...formData, remarks: e.target.value})}
                                />
                            </div>
                        </div>

                        <button 
                            type="submit" 
                            disabled={transferring || loading}
                            className="w-full bg-gradient-primary py-4 rounded-xl text-white font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.01] transition-all disabled:opacity-50"
                        >
                            {transferring ? 'Executing Transfer...' : 'Confirm Stock Relocation'}
                        </button>
                    </form>
                </div>
            </div>
        </Layout>
    );
}
