import { useState, useEffect } from 'react';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout';
import { useNotifier } from '../common/AppNotificationProvider.jsx';

export default function ClassificationsPage() {
    const Layout = usePortalLayout();
    const { error: notifyError, success: notifySuccess } = useNotifier();
    const [classifications, setClassifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingClassification, setEditingClassification] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        prefix: ''
    });

    useEffect(() => {
        fetchClassifications();
    }, []);

    const fetchClassifications = async () => {
        try {
            setLoading(true);
            const res = await inventoryService.getClassifications();
            setClassifications(res.data);
        } catch (err) {
            console.error('Failed to fetch classifications:', err);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({ name: '', prefix: '' });
        setEditingClassification(null);
        setShowModal(false);
    };

    const openCreateModal = () => {
        setEditingClassification(null);
        setFormData({ name: '', prefix: '' });
        setShowModal(true);
    };

    const openEditModal = (classification) => {
        setEditingClassification(classification);
        setFormData({
            name: classification.name || '',
            prefix: classification.prefix || ''
        });
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingClassification?._id) {
                await inventoryService.updateClassification(editingClassification._id, formData);
                notifySuccess('Classification updated successfully.');
            } else {
                await inventoryService.createClassification(formData);
                notifySuccess('Classification created successfully.');
            }
            resetForm();
            fetchClassifications();
        } catch (err) {
            notifyError(
                err.response?.data?.message ||
                (editingClassification ? 'Failed to update classification' : 'Failed to create classification')
            );
        }
    };

    return (
        <Layout currentPage="inv-classifications">
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="flex justify-between items-end mb-8">
                        <div>
                            <h1 className="text-3xl font-bold text-white tracking-tight">Classifications</h1>
                            <p className="text-text-secondary text-lg">Define categories and groups for your inventory items.</p>
                        </div>
                        <button 
                            onClick={openCreateModal}
                            className="bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-primary/20"
                        >
                            <span className="material-symbols-outlined">category</span>
                            New Classification
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {loading ? (
                            <div className="col-span-full p-20 text-center">
                                <div className="animate-spin size-10 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
                            </div>
                        ) : classifications.length === 0 ? (
                            <div className="col-span-full p-20 text-center bg-surface-dark border border-dashed border-border-dark rounded-2xl">
                                <span className="material-symbols-outlined text-6xl text-text-secondary/20 mb-4 block">label_off</span>
                                <h3 className="text-xl font-bold text-white mb-1">No classifications found</h3>
                                <p className="text-text-secondary">Categorize your items by creating your first classification.</p>
                            </div>
                        ) : classifications.map(cls => (
                            <div key={cls._id} className="bg-surface-dark border border-border-dark rounded-2xl p-6 shadow-xl hover:border-primary/30 transition-all group relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 blur-3xl -mr-12 -mt-12 group-hover:bg-primary/10 transition-all"></div>
                                <div className="flex items-start justify-between mb-4">
                                    <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                                        <span className="material-symbols-outlined">schema</span>
                                    </div>
                                    <span className="material-symbols-outlined text-text-secondary/50 group-hover:text-primary transition-colors">arrow_forward_ios</span>
                                </div>
                                <h3 className="text-xl font-bold text-white mb-1">{cls.name}</h3>
                                <div className="mt-6 pt-6 border-t border-border-dark flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-text-secondary font-bold uppercase tracking-widest">Active Status</span>
                                    </div>
                                    <button
                                        onClick={() => openEditModal(cls)}
                                        className="text-primary hover:underline text-xs font-bold"
                                    >
                                        Edit
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Create / Edit Classification Modal */}
            {showModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={resetForm}></div>
                    <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface flex items-center justify-between">
                            <h2 className="text-xl font-bold text-white">
                                {editingClassification ? 'Edit Classification' : 'Create Classification'}
                            </h2>
                            <button onClick={resetForm} className="text-text-secondary hover:text-white">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 tracking-widest">Category Name</label>
                                <input 
                                    className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white focus:border-primary outline-none transition-all"
                                    placeholder="e.g. ELECTRONICS, TOOLS, CONSUMABLES"
                                    value={formData.name}
                                    onChange={(e) => setFormData({...formData, name: e.target.value.toUpperCase()})}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 tracking-widest">Prefix (Internal Code)</label>
                                <input 
                                    className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white focus:border-primary outline-none transition-all"
                                    placeholder="e.g. ELE, TOL, CON"
                                    value={formData.prefix}
                                    onChange={(e) => setFormData({...formData, prefix: e.target.value.toUpperCase()})}
                                    maxLength={5}
                                    required
                                />
                                <p className="text-[10px] text-text-secondary/60 mt-1 italic">Used for auto-generating item codes (e.g. TOL-001)</p>
                            </div>
                            <div className="pt-2">
                                <button type="submit" className="w-full bg-primary py-3 rounded-xl text-white font-bold shadow-lg shadow-primary/20 hover:scale-[1.01] active:scale-95 transition-all">
                                    {editingClassification ? 'Update Classification' : 'Save Classification'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
}
