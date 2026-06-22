import { useState, useEffect } from 'react';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout';
import { useNotifier } from '../common/AppNotificationProvider.jsx';

export default function StockLocationsPage() {
    const Layout = usePortalLayout();
    const { error: notifyError, success: notifySuccess } = useNotifier();
    const emptyForm = {
        locationCode: '',
        name: '',
        description: ''
    };
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingLocationId, setEditingLocationId] = useState(null);
    const [formData, setFormData] = useState(emptyForm);

    useEffect(() => {
        fetchLocations();
    }, []);

    const fetchLocations = async () => {
        try {
            setLoading(true);
            const res = await inventoryService.getLocations();
            setLocations(res.data);
        } catch (err) {
            console.error('Failed to fetch locations:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingLocationId) {
                await inventoryService.updateLocation(editingLocationId, formData);
                notifySuccess('Location updated successfully.');
            } else {
                await inventoryService.createLocation(formData);
                notifySuccess('Location created successfully.');
            }
            resetModal();
            fetchLocations();
        } catch (err) {
            notifyError(err.response?.data?.message || `Failed to ${editingLocationId ? 'update' : 'create'} location`);
        }
    };

    const resetModal = () => {
        setShowModal(false);
        setEditingLocationId(null);
        setFormData(emptyForm);
    };

    const openCreateModal = () => {
        setEditingLocationId(null);
        setFormData(emptyForm);
        setShowModal(true);
    };

    const openEditModal = (location) => {
        setEditingLocationId(location._id || location.id);
        setFormData({
            locationCode: location.locationCode || '',
            name: location.name || '',
            description: location.description || ''
        });
        setShowModal(true);
    };

    return (
        <Layout currentPage="store-locations">
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="flex justify-between items-end mb-8">
                        <div>
                            <h1 className="text-3xl font-bold text-[#556070] tracking-tight">Stock Locations</h1>
                            <p className="text-text-secondary text-lg">Manage warehouses, zones, and storage bins.</p>
                        </div>
                        <button 
                            onClick={openCreateModal}
                            className="bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-primary/20"
                        >
                            <span className="material-symbols-outlined">add_location</span>
                            Add Location
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {loading ? (
                            <div className="col-span-full p-20 text-center">
                                <div className="animate-spin size-10 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
                            </div>
                        ) : locations.length === 0 ? (
                            <div className="col-span-full p-20 text-center bg-white border border-dashed border-slate-200 rounded-2xl">
                                <span className="material-symbols-outlined text-6xl text-text-secondary/20 mb-4 block">location_off</span>
                                <h3 className="text-xl font-bold text-[#556070] mb-1">No locations found</h3>
                                <p className="text-text-secondary">Start by adding a warehouse or storage zone.</p>
                            </div>
                        ) : locations.map(loc => (
                            <div key={loc._id || loc.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl hover:border-primary/30 transition-all group relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 blur-3xl -mr-12 -mt-12 group-hover:bg-primary/10 transition-all"></div>
                                <div className="flex items-start justify-between mb-4">
                                    <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                                        <span className="material-symbols-outlined">location_on</span>
                                    </div>
                                    <span className="text-[10px] font-black tracking-widest text-text-secondary uppercase bg-slate-50 px-2 py-1 rounded border border-slate-200">
                                        {loc.locationCode}
                                    </span>
                                </div>
                                <h3 className="text-xl font-bold text-[#556070] mb-1">{loc.name}</h3>
                                <p className="text-text-secondary text-sm line-clamp-2 mt-2">
                                    {loc.description || 'No description provided.'}
                                </p>
                                <div className="mt-6 pt-6 border-t border-slate-200 flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <div className="size-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50"></div>
                                        <span className="text-[10px] text-text-secondary font-bold uppercase tracking-wider">Active Location</span>
                                    </div>
                                    <button
                                        onClick={() => openEditModal(loc)}
                                        className="text-primary hover:underline text-xs font-bold"
                                    >
                                        Edit Details
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Create Location Modal */}
            {showModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={resetModal}></div>
                    <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface flex items-center justify-between">
                            <h2 className="text-xl font-bold text-white">{editingLocationId ? 'Edit Location' : 'Add New Location'}</h2>
                            <button onClick={resetModal} className="text-text-secondary hover:text-white">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 tracking-widest">Location Code</label>
                                <input 
                                    className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white focus:border-primary outline-none transition-all"
                                    placeholder="e.g. WH-01, ZONE-A"
                                    value={formData.locationCode}
                                    onChange={(e) => setFormData({...formData, locationCode: e.target.value.toUpperCase()})}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 tracking-widest">Display Name</label>
                                <input 
                                    className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white focus:border-primary outline-none transition-all"
                                    placeholder="Main Warehouse"
                                    value={formData.name}
                                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 tracking-widest">Description</label>
                                <textarea 
                                    className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white focus:border-primary outline-none transition-all h-24 resize-none"
                                    placeholder="Detailed location information..."
                                    value={formData.description}
                                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                                />
                            </div>
                            <div className="pt-2">
                                <button type="submit" className="w-full bg-primary py-3 rounded-xl text-white font-bold shadow-lg shadow-primary/20 hover:scale-[1.01] active:scale-95 transition-all">
                                    {editingLocationId ? 'Save Location Changes' : 'Create Location'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
}
