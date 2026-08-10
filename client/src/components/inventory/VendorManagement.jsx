import { useState, useEffect } from 'react';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout';
import { useNotifier } from '../common/AppNotificationProvider.jsx';

const getNextVendorCode = (vendors = []) => {
    const maxNumber = vendors.reduce((highest, vendor) => {
        const match = String(vendor?.vendorCode || '')
            .trim()
            .toUpperCase()
            .match(/^VEN-(\d+)$/);

        if (!match) return highest;
        return Math.max(highest, Number(match[1]));
    }, 0);

    return `VEN-${String(maxNumber + 1).padStart(3, '0')}`;
};

const TAX_BASIS_OPTIONS = [
    { value: 'INCLUSIVE', label: 'Inclusive GST' },
    { value: 'EXCLUSIVE', label: 'Exclusive GST' },
    { value: 'UNKNOWN', label: 'Unknown' }
];

const getTaxBasisLabel = (value) =>
    TAX_BASIS_OPTIONS.find((option) => option.value === value)?.label || 'Unknown';

export default function VendorManagement() {
    const Layout = usePortalLayout();
    const { error: notifyError, success: notifySuccess } = useNotifier();
    const emptyForm = {
        vendorCode: '',
        name: '',
        contactPerson: '',
        email: '',
        phone: '',
        gstin: '',
        address: '',
        priceTaxBasis: 'UNKNOWN'
    };
    const [vendors, setVendors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingVendorId, setEditingVendorId] = useState(null);
    const [formData, setFormData] = useState(emptyForm);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const generatedVendorCode = editingVendorId ? formData.vendorCode : getNextVendorCode(vendors);

    useEffect(() => {
        fetchVendors();
    }, []);

    async function fetchVendors() {
        try {
            setLoading(true);
            const res = await inventoryService.getVendors();
            setVendors(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    const resetModal = () => {
        setShowModal(false);
        setEditingVendorId(null);
        setFormData(emptyForm);
    };

    const openCreateModal = () => {
        setEditingVendorId(null);
        setFormData(emptyForm);
        setShowModal(true);
    };

    const openEditModal = (vendor) => {
        setEditingVendorId(vendor._id || vendor.id);
        setFormData({
            vendorCode: vendor.vendorCode || '',
            name: vendor.name || '',
            contactPerson: vendor.contactPerson || '',
            email: vendor.email || '',
            phone: vendor.phone || '',
            gstin: vendor.gstin || '',
            address: vendor.address || '',
            priceTaxBasis: vendor.priceTaxBasis || 'UNKNOWN'
        });
        setShowModal(true);
    };

    const openDeleteModal = (vendor) => {
        setDeleteTarget(vendor);
    };

    const closeDeleteModal = () => {
        if (isDeleting) return;
        setDeleteTarget(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (formData.priceTaxBasis === 'UNKNOWN') {
                notifyError('Select whether this vendor price is Inclusive GST or Exclusive GST before saving.');
                return;
            }
            if (editingVendorId) {
                await inventoryService.updateVendor(editingVendorId, formData);
                notifySuccess('Vendor updated successfully.');
            } else {
                await inventoryService.createVendor({ ...formData, vendorCode: generatedVendorCode });
                notifySuccess('Vendor created successfully.');
            }
            resetModal();
            fetchVendors();
        } catch (err) {
            notifyError(err.response?.data?.message || `Failed to ${editingVendorId ? 'update' : 'create'} vendor`);
        }
    };

    const handleDeleteVendor = async () => {
        if (!deleteTarget) return;
        try {
            setIsDeleting(true);
            await inventoryService.deleteVendor(deleteTarget._id || deleteTarget.id);
            notifySuccess('Vendor deleted successfully.');
            setDeleteTarget(null);
            fetchVendors();
        } catch (err) {
            notifyError(err.response?.data?.message || 'Failed to delete vendor.');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <Layout currentPage="purchase-vendors">
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="flex justify-between items-end mb-8">
                        <div>
                            <h1 className="text-3xl font-bold text-[#556070] tracking-tight">Hardware Vendors</h1>
                            <p className="text-text-secondary text-lg">Manage suppliers and service providers.</p>
                        </div>
                        <button 
                            onClick={openCreateModal}
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
                            <div key={vendor._id || vendor.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl hover:border-primary/30 transition-all group relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 blur-3xl -mr-12 -mt-12 group-hover:bg-primary/10 transition-all"></div>
                                <div className="flex items-start justify-between mb-4">
                                    <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                                        <span className="material-symbols-outlined">store</span>
                                    </div>
                                    <span className="text-[10px] font-black tracking-widest text-text-secondary uppercase bg-slate-50 px-2 py-1 rounded border border-slate-200">
                                        {vendor.vendorCode}
                                    </span>
                                </div>
                                <h3 className="text-xl font-bold text-[#556070] mb-1">{vendor.name}</h3>
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
                                    <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between items-center">
                                        <div className="space-y-1">
                                            <div className="text-[10px] text-text-secondary font-bold uppercase">GST: {vendor.gstin || 'UNREGISTERED'}</div>
                                            <div className="text-[10px] text-text-secondary font-bold uppercase">Price Basis: {getTaxBasisLabel(vendor.priceTaxBasis || 'UNKNOWN')}</div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <button
                                                onClick={() => openEditModal(vendor)}
                                                className="text-text-secondary hover:text-primary text-xs font-bold"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => openDeleteModal(vendor)}
                                                className="text-red-600 hover:text-red-700 text-xs font-bold"
                                            >
                                                Delete
                                            </button>
                                        </div>
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
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={resetModal}></div>
                    <div className="relative bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-200 bg-[#ECF1FF]/40 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-[#556070]">{editingVendorId ? 'Edit Vendor' : 'Register New Vendor'}</h2>
                            <button onClick={resetModal} className="text-text-secondary hover:text-[#556070]">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1">Vendor Code</label>
                                    <input 
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-[#556070] outline-none"
                                        placeholder="Auto-generated"
                                        value={generatedVendorCode}
                                        readOnly
                                    />
                                    {!editingVendorId && (
                                        <p className="mt-1 text-[11px] text-text-secondary">This code is generated automatically.</p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1">Vendor Name</label>
                                    <input 
                                        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-[#556070] focus:border-primary outline-none"
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
                                        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-[#556070] focus:border-primary outline-none"
                                        value={formData.contactPerson}
                                        onChange={(e) => setFormData({...formData, contactPerson: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1">GSTIN</label>
                                    <input 
                                        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-[#556070] focus:border-primary outline-none"
                                        value={formData.gstin}
                                        onChange={(e) => setFormData({...formData, gstin: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1">Price Tax Basis</label>
                                <select
                                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-[#556070] focus:border-primary outline-none"
                                    value={formData.priceTaxBasis}
                                    onChange={(e) => setFormData({ ...formData, priceTaxBasis: e.target.value })}
                                    required
                                >
                                    <option value="UNKNOWN" disabled>Select tax basis</option>
                                    {TAX_BASIS_OPTIONS.filter((option) => option.value !== 'UNKNOWN').map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                                <p className="mt-1 text-[11px] text-text-secondary">
                                    Inclusive GST uses fetched price as-is. Exclusive GST adds 18% only for BOM comparison.
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1">Email</label>
                                    <input 
                                        type="email"
                                        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-[#556070] focus:border-primary outline-none"
                                        value={formData.email}
                                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1">Phone</label>
                                    <input 
                                        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-[#556070] focus:border-primary outline-none"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1">Address</label>
                                <textarea 
                                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-[#556070] focus:border-primary outline-none h-20"
                                    value={formData.address}
                                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                                />
                            </div>
                            <button type="submit" className="w-full bg-primary py-3 rounded-xl text-white font-bold shadow-lg shadow-primary/20 hover:scale-[1.01] transition-all">
                                {editingVendorId ? 'Save Vendor Changes' : 'Complete Registration'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {deleteTarget && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeDeleteModal}></div>
                    <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
                        <div className="px-6 py-5 border-b border-slate-200">
                            <h2 className="text-xl font-bold text-[#556070]">Delete Vendor</h2>
                            <p className="mt-2 text-sm text-text-secondary">
                                Delete <span className="font-semibold text-[#556070]">{deleteTarget.name}</span> ({deleteTarget.vendorCode})?
                                This cannot be undone.
                            </p>
                        </div>
                        <div className="px-6 py-4 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={closeDeleteModal}
                                className="px-4 py-2 rounded-xl border border-slate-200 text-text-secondary font-semibold"
                                disabled={isDeleting}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDeleteVendor}
                                className="px-4 py-2 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-60"
                                disabled={isDeleting}
                            >
                                {isDeleting ? 'Deleting...' : 'Delete Vendor'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
}
