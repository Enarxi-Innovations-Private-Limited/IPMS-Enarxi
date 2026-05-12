import { useState, useEffect } from 'react';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout';
import { useNotifier } from '../common/AppNotificationProvider.jsx';

export default function VendorManagement() {
    const Layout = usePortalLayout();
    const { error: notifyError, success: notifySuccess } = useNotifier();
    const [vendors, setVendors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        vendorCode: '',
        name: '',
        contactPerson: '',
        email: '',
        phone: '',
        gstin: '',
        address: ''
    });

    useEffect(() => {
        fetchVendors();
    }, []);

    const fetchVendors = async () => {
        try {
            setLoading(true);
            const res = await inventoryService.getVendors();
            setVendors(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await inventoryService.createVendor(formData);
            setShowModal(false);
            setFormData({ vendorCode: '', name: '', contactPerson: '', email: '', phone: '', gstin: '', address: '' });
            fetchVendors();
            notifySuccess('Vendor created successfully.');
        } catch (err) {
            notifyError(err.response?.data?.message || 'Failed to create vendor');
        }
    };

    return (
        <Layout currentPage="purchase-vendors">
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="flex justify-between items-end mb-8">
                        <div>
                            <h1 className="text-3xl font-bold text-white tracking-tight">Hardware Vendors</h1>
                            <p className="text-text-secondary text-lg">Manage suppliers and service providers.</p>
                        </div>
                        <button 
                            onClick={() => setShowModal(true)}
                            className="bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-primary/20"
                        >
                            <span className="material-symbols-outlined">person_add</span>
                            Register Vendor
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {loading ? (
                            <div className="col-span-full p-20 text-center">
                                <div className="animate-spin size-10 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
                            </div>
                        ) : vendors.map(vendor => (
                            <div key={vendor.id} className="bg-surface-dark border border-border-dark rounded-2xl p-6 shadow-xl hover:border-primary/30 transition-all group relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 blur-3xl -mr-12 -mt-12 group-hover:bg-primary/10 transition-all"></div>
                                <div className="flex items-start justify-between mb-4">
                                    <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                                        <span className="material-symbols-outlined">store</span>
                                    </div>
                                    <span className="text-[10px] font-black tracking-widest text-text-secondary uppercase bg-background-dark px-2 py-1 rounded border border-border-dark">
                                        {vendor.vendorCode}
                                    </span>
                                </div>
                                <h3 className="text-xl font-bold text-white mb-1">{vendor.name}</h3>
                                <div className="space-y-3 mt-4">
                                    <div className="flex items-center gap-3 text-text-secondary text-sm">
                                        <span className="material-symbols-outlined text-sm">account_circle</span>
                                        {vendor.contactPerson || 'No contact specified'}
                                    </div>
                                    <div className="flex items-center gap-3 text-text-secondary text-sm">
                                        <span className="material-symbols-outlined text-sm">mail</span>
                                        {vendor.email || 'N/A'}
                                    </div>
                                    <div className="flex items-center gap-3 text-text-secondary text-sm">
                                        <span className="material-symbols-outlined text-sm">call</span>
                                        {vendor.phone || 'N/A'}
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-border-dark flex justify-between items-center">
                                        <span className="text-[10px] text-text-secondary font-bold uppercase">GST: {vendor.gstin || 'UNREGISTERED'}</span>
                                        <button className="text-primary hover:underline text-xs font-bold">View Profile</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Register Vendor Modal */}
            {showModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowModal(false)}></div>
                    <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface flex items-center justify-between">
                            <h2 className="text-xl font-bold text-white">Register New Vendor</h2>
                            <button onClick={() => setShowModal(false)} className="text-text-secondary hover:text-white">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1">Vendor Code</label>
                                    <input 
                                        className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white focus:border-primary outline-none"
                                        placeholder="e.g. VEN-001"
                                        value={formData.vendorCode}
                                        onChange={(e) => setFormData({...formData, vendorCode: e.target.value})}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1">Vendor Name</label>
                                    <input 
                                        className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white focus:border-primary outline-none"
                                        placeholder="Company Name"
                                        value={formData.name}
                                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1">Contact Person</label>
                                    <input 
                                        className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white focus:border-primary outline-none"
                                        value={formData.contactPerson}
                                        onChange={(e) => setFormData({...formData, contactPerson: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1">GSTIN</label>
                                    <input 
                                        className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white focus:border-primary outline-none"
                                        value={formData.gstin}
                                        onChange={(e) => setFormData({...formData, gstin: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1">Email</label>
                                    <input 
                                        type="email"
                                        className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white focus:border-primary outline-none"
                                        value={formData.email}
                                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1">Phone</label>
                                    <input 
                                        className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white focus:border-primary outline-none"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1">Address</label>
                                <textarea 
                                    className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white focus:border-primary outline-none h-20"
                                    value={formData.address}
                                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                                />
                            </div>
                            <button type="submit" className="w-full bg-primary py-3 rounded-xl text-white font-bold shadow-lg shadow-primary/20 hover:scale-[1.01] transition-all">
                                Complete Registration
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
}
