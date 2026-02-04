import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

import { getCurrentUser } from '../../services/authService';
import StockAdminLayout from '../common/StockAdminLayout';
import ManagerLayout from '../common/ManagerLayout';
import EmployeeLayout from '../common/EmployeeLayout';
import InternLayout from '../common/InternLayout';
import SuperUserLayout from '../common/SuperUserLayout';
import api from '../../services/api';

// Import Excel Modal Component
function ImportExcelModal({ isOpen, onClose, onSuccess }) {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const fileInputRef = useRef(null);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const ext = file.name.split('.').pop().toLowerCase();
            if (ext !== 'xlsx' && ext !== 'xls') {
                setError('Please select an Excel file (.xlsx or .xls)');
                setSelectedFile(null);
                return;
            }
            setSelectedFile(file);
            setError('');
            setResult(null);
        }
    };

    const handleUpload = async () => {
        if (!selectedFile) {
            setError('Please select a file first');
            return;
        }

        setUploading(true);
        setError('');
        setResult(null);

        const formData = new FormData();
        formData.append('file', selectedFile);

        try {
            const response = await api.post('/stock/import/excel', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            setResult(response.data);
            if (response.data.results.success > 0) {
                onSuccess?.();
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to import file');
        } finally {
            setUploading(false);
        }
    };

    const handleDownloadTemplate = async () => {
        try {
            const response = await api.get('/stock/import/template', {
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'stock_import_template.xlsx');
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            setError('Failed to download template');
        }
    };

    const handleClose = () => {
        setSelectedFile(null);
        setError('');
        setResult(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-surface-dark border border-border-dark rounded-xl w-full max-w-lg mx-4 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border-dark">
                    <h2 className="text-xl font-bold text-white">Import Products from Excel</h2>
                    <button
                        onClick={handleClose}
                        className="p-2 text-text-secondary hover:text-white hover:bg-surface-light rounded-lg transition-colors"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Template Download */}
                    <div className="bg-surface-light border border-border-dark rounded-lg p-4">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-primary/20 rounded-lg">
                                <span className="material-symbols-outlined text-primary">description</span>
                            </div>
                            <div className="flex-1">
                                <h3 className="text-white font-medium mb-1">Download Template</h3>
                                <p className="text-text-secondary text-sm mb-3">
                                    Download the Excel template with the correct format and sample data.
                                </p>
                                <button
                                    onClick={handleDownloadTemplate}
                                    className="px-4 py-2 bg-surface-dark border border-border-dark text-white rounded-lg hover:bg-surface-light transition-colors text-sm flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-sm">download</span>
                                    Download Template
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* File Upload */}
                    <div>
                        <label className="block text-sm text-text-secondary mb-2">Select Excel File</label>
                        <div className="relative">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={handleFileChange}
                                className="hidden"
                                id="excel-file-input"
                            />
                            <label
                                htmlFor="excel-file-input"
                                className="flex items-center justify-center gap-3 w-full p-8 border-2 border-dashed border-border-dark rounded-lg cursor-pointer hover:border-primary hover:bg-surface-light transition-all"
                            >
                                <span className="material-symbols-outlined text-3xl text-text-secondary">cloud_upload</span>
                                <div className="text-center">
                                    <p className="text-white">
                                        {selectedFile ? selectedFile.name : 'Click to select a file'}
                                    </p>
                                    <p className="text-text-secondary text-sm mt-1">
                                        {selectedFile
                                            ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                                            : 'Supports .xlsx and .xls files (max 5MB)'}
                                    </p>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 flex items-center gap-3">
                            <span className="material-symbols-outlined">error</span>
                            {error}
                        </div>
                    )}

                    {/* Result Message */}
                    {result && (
                        <div className={`p-4 rounded-lg border ${result.results.failed > 0 ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-green-500/10 border-green-500/20'}`}>
                            <div className="flex items-center gap-3 mb-3">
                                <span className={`material-symbols-outlined ${result.results.failed > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                                    {result.results.failed > 0 ? 'warning' : 'check_circle'}
                                </span>
                                <span className={result.results.failed > 0 ? 'text-yellow-400' : 'text-green-400'}>
                                    {result.message}
                                </span>
                            </div>

                            {result.results.errors && result.results.errors.length > 0 && (
                                <div className="mt-3 max-h-32 overflow-y-auto">
                                    <p className="text-sm text-text-secondary mb-2">Errors:</p>
                                    {result.results.errors.map((err, i) => (
                                        <p key={i} className="text-xs text-red-400">
                                            Row {err.row}: {err.error}
                                        </p>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-6 border-t border-border-dark">
                    <button
                        onClick={handleClose}
                        className="px-4 py-2 bg-surface-light border border-border-dark text-white rounded-lg hover:bg-surface-dark transition-colors"
                    >
                        {result ? 'Close' : 'Cancel'}
                    </button>
                    {!result && (
                        <button
                            onClick={handleUpload}
                            disabled={!selectedFile || uploading}
                            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {uploading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    Importing...
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-sm">upload</span>
                                    Import Products
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// Product Details Modal Component
function ProductDetailsModal({ isOpen, onClose, product }) {
    if (!isOpen || !product) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-surface-dark border border-border-dark rounded-xl w-full max-w-2xl mx-4 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between p-6 border-b border-border-dark">
                    <h2 className="text-xl font-bold text-white">Product Details</h2>
                    <button onClick={onClose} className="p-2 text-text-secondary hover:text-white hover:bg-surface-light rounded-lg transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm text-text-secondary mb-1">Name</label>
                            <p className="text-white font-medium text-lg">{product.name}</p>
                        </div>
                        <div>
                            <label className="block text-sm text-text-secondary mb-1">Part Number</label>
                            <p className="text-white font-mono">{product.partNumber || 'N/A'}</p>
                        </div>
                        <div>
                            <label className="block text-sm text-text-secondary mb-1">Brand</label>
                            <p className="text-white">{product.brand || 'N/A'}</p>
                        </div>
                        <div>
                            <label className="block text-sm text-text-secondary mb-1">Footprint</label>
                            <p className="text-white">{product.footprint || 'N/A'}</p>
                        </div>
                        <div>
                            <label className="block text-sm text-text-secondary mb-1">Category</label>
                            <p className="text-white">{product.category.replace('_', ' ')}</p>
                        </div>

                        <div>
                            <label className="block text-sm text-text-secondary mb-1">Current Stock</label>
                            <div className="flex items-center gap-2">
                                <span className="text-white font-bold text-xl">{product.quantity}</span>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm text-text-secondary mb-1">Unit Price</label>
                            <p className="text-white">₹{product.unitPrice.toFixed(2)}</p>
                        </div>
                        <div>
                            <label className="block text-sm text-text-secondary mb-1">Total Value</label>
                            <p className="text-white font-medium">₹{(product.quantity * product.unitPrice).toFixed(2)}</p>
                        </div>
                        <div>
                            <label className="block text-sm text-text-secondary mb-1">Stock Status</label>
                            <p className="text-white">{product.stockStatus.replace('_', ' ')}</p>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm text-text-secondary mb-1">Description</label>
                        <p className="text-white p-3 bg-surface-light rounded-lg">
                            {product.description || 'No description provided.'}
                        </p>
                    </div>


                </div>
                <div className="flex justify-end p-6 border-t border-border-dark">
                    <button onClick={onClose} className="px-4 py-2 bg-surface-light border border-border-dark text-white rounded-lg hover:bg-surface-dark transition-colors">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

// Product Form Modal Component (Add/Edit)
function ProductFormModal({ isOpen, onClose, onSuccess, product = null }) {
    const [formData, setFormData] = useState({
        name: '',
        partNumber: '',
        brand: '',
        footprint: '',
        category: 'OTHER',
        description: '',
        quantity: 0,
        unitPrice: 0,
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const categories = ['RESISTOR', 'CAPACITOR', 'IC', 'LED', 'TRANSISTOR', 'DIODE', 'SENSOR', 'MODULE', 'CONNECTOR', 'TOOLS', 'OTHER'];

    useEffect(() => {
        if (product) {
            setFormData({
                name: product.name,
                partNumber: product.partNumber || '',
                brand: product.brand || '',
                footprint: product.footprint || '',
                category: product.category,
                description: product.description || '',
                quantity: product.quantity,
                unitPrice: product.unitPrice,
            });
        } else {
            setFormData({
                name: '',
                partNumber: '',
                brand: '',
                footprint: '',
                category: 'OTHER',
                description: '',
                quantity: 0,
                unitPrice: 0,
            });
        }
        setError('');
    }, [product, isOpen]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            if (product) {
                await api.put(`/stock/products/${product.id}`, formData);
            } else {
                await api.post('/stock/products', formData);
            }
            onSuccess();
            onClose();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to save product');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-surface-dark border border-border-dark rounded-xl w-full max-w-2xl mx-4 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between p-6 border-b border-border-dark">
                    <h2 className="text-xl font-bold text-white">{product ? 'Edit Product' : 'Add New Product'}</h2>
                    <button onClick={onClose} className="p-2 text-text-secondary hover:text-white hover:bg-surface-light rounded-lg transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {error && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-sm text-text-secondary mb-2">Name *</label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary"
                            />
                        </div>
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-sm text-text-secondary mb-2">Part Number</label>
                            <input
                                type="text"
                                required
                                value={formData.partNumber}
                                onChange={e => setFormData({ ...formData, partNumber: e.target.value })}
                                className="w-full px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary"
                            />
                        </div>
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-sm text-text-secondary mb-2">Brand</label>
                            <input
                                type="text"
                                value={formData.brand}
                                onChange={e => setFormData({ ...formData, brand: e.target.value })}
                                className="w-full px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary"
                            />
                        </div>
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-sm text-text-secondary mb-2">Category *</label>
                            <select
                                value={formData.category}
                                onChange={e => setFormData({ ...formData, category: e.target.value })}
                                className="w-full px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary"
                            >
                                {categories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                        <div className="col-span-2">
                            <label className="block text-sm text-text-secondary mb-2">Description</label>
                            <textarea
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                className="w-full px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary h-24 resize-none"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-text-secondary mb-2">Quantity *</label>
                            <input
                                type="number"
                                required
                                min="0"
                                value={formData.quantity}
                                onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                                className="w-full px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-text-secondary mb-2">Unit Price (₹) *</label>
                            <input
                                type="number"
                                required
                                min="0"
                                step="0.01"
                                value={formData.unitPrice}
                                onChange={e => setFormData({ ...formData, unitPrice: parseFloat(e.target.value) || 0 })}
                                className="w-full px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-text-secondary mb-2">Footprint</label>
                            <input
                                type="text"
                                value={formData.footprint}
                                onChange={e => setFormData({ ...formData, footprint: e.target.value })}
                                className="w-full px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary"
                            />
                        </div>


                    </div>

                    <div className="flex justify-end gap-3 pt-6 border-t border-border-dark">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 bg-surface-light border border-border-dark text-white rounded-lg hover:bg-surface-dark transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-sm">save</span>
                                    Save Product
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function InventoryPage() {
    const user = getCurrentUser();
    const [searchParams] = useSearchParams();
    const [products, setProducts] = useState([]);
    const [filteredProducts, setFilteredProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('ALL');
    const [stockFilter, setStockFilter] = useState('ALL');

    // Modals
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);

    const categories = ['ALL', 'RESISTOR', 'CAPACITOR', 'IC', 'LED', 'TRANSISTOR', 'DIODE', 'SENSOR', 'MODULE', 'CONNECTOR', 'TOOLS', 'OTHER'];

    // Handle URL filter parameter
    useEffect(() => {
        const filter = searchParams.get('filter');
        if (filter === 'out_of_stock') {
            setStockFilter('OUT_OF_STOCK');
        } else if (filter === 'low_stock') {
            setStockFilter('LOW_STOCK');
        }
    }, [searchParams]);

    useEffect(() => {
        loadProducts();
    }, []);

    useEffect(() => {
        filterProducts();
    }, [products, searchTerm, categoryFilter, stockFilter]);

    const loadProducts = async () => {
        try {
            setLoading(true);
            const response = await api.get('/stock/products');
            setProducts(response.data);
            setError('');
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load products');
        } finally {
            setLoading(false);
        }
    };

    const filterProducts = () => {
        let filtered = [...products];

        // Search filter
        if (searchTerm) {
            filtered = filtered.filter(p =>
                p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.partNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.description.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        // Category filter
        if (categoryFilter !== 'ALL') {
            filtered = filtered.filter(p => p.category === categoryFilter);
        }

        // Stock filter
        if (stockFilter === 'LOW_STOCK') {
            filtered = filtered.filter(p => p.stockStatus === 'LOW_STOCK' || p.stockStatus === 'OUT_OF_STOCK');
        } else if (stockFilter === 'IN_STOCK') {
            filtered = filtered.filter(p => p.stockStatus === 'IN_STOCK');
        } else if (stockFilter === 'OUT_OF_STOCK') {
            filtered = filtered.filter(p => p.stockStatus === 'OUT_OF_STOCK');
        }

        setFilteredProducts(filtered);
    };

    const handleDelete = async (productId) => {
        try {
            console.log('Attempting to delete product:', productId);
            await api.delete(`/stock/products/${productId}`);
            console.log('Product deleted successfully');
            await loadProducts();
        } catch (err) {
            console.error('Failed to delete product:', err);
            setError(err.response?.data?.message || 'Failed to delete product');
        }
    };

    const getStockBadge = (status) => {
        const badges = {
            'IN_STOCK': <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">In Stock</span>,
            'LOW_STOCK': <span className="px-3 py-1 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">Low Stock</span>,
            'OUT_OF_STOCK': <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400">Out of Stock</span>,
            'OVERSTOCK': <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">Overstock</span>,
        };
        return badges[status] || status;
    };

    const getLayout = () => {
        if (user?.role === 'SUPER_USER') return SuperUserLayout;
        if (user?.role === 'MANAGER') return ManagerLayout;
        if (user?.role === 'EMPLOYEE') return EmployeeLayout;
        if (user?.role === 'INTERN') return InternLayout;
        return StockAdminLayout;
    };
    const Layout = getLayout();

    if (loading) {
        return (
            <Layout currentPage="inventory">
                <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                        <p className="text-text-secondary">Loading products...</p>
                    </div>
                </div>
            </Layout>
        );
    }

    return (
        <Layout currentPage="inventory">
            <div className="p-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-2">Inventory Management</h1>
                        <p className="text-text-secondary">{filteredProducts.length} products found</p>
                    </div>
                    <div className="flex gap-3">
                        {user?.role === 'STOCK_ADMIN' && (
                            <>
                                <button
                                    onClick={() => setShowImportModal(true)}
                                    className="px-4 py-2 bg-surface-dark border border-border-dark text-white rounded-lg hover:bg-surface-light transition-colors flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined">upload_file</span>
                                    Import Excel
                                </button>
                                <button
                                    onClick={() => { setSelectedProduct(null); setShowAddModal(true); }}
                                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined">add</span>
                                    Add Product
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
                        {error}
                    </div>
                )}

                {/* Filters */}
                <div className="mb-6 bg-surface-dark border border-border-dark rounded-xl p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Search */}
                        <div>
                            <label className="block text-sm text-text-secondary mb-2">Search</label>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search by name, part number..."
                                className="w-full px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary"
                            />
                        </div>

                        {/* Category Filter */}
                        <div>
                            <label className="block text-sm text-text-secondary mb-2">Category</label>
                            <select
                                value={categoryFilter}
                                onChange={(e) => setCategoryFilter(e.target.value)}
                                className="w-full px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary"
                            >
                                {categories.map(cat => (
                                    <option key={cat} value={cat}>{cat.replace('_', ' ')}</option>
                                ))}
                            </select>
                        </div>

                        {/* Stock Filter */}
                        <div>
                            <label className="block text-sm text-text-secondary mb-2">Stock Status</label>
                            <select
                                value={stockFilter}
                                onChange={(e) => setStockFilter(e.target.value)}
                                className="w-full px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary"
                            >
                                <option value="ALL">All Status</option>
                                <option value="IN_STOCK">In Stock</option>
                                <option value="LOW_STOCK">Low Stock</option>
                                <option value="OUT_OF_STOCK">Out of Stock</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Products Table */}
                <div className="bg-surface-dark border border-border-dark rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border-dark">
                                    <th className="text-left p-4 text-text-secondary font-medium">Part Number</th>
                                    <th className="text-left p-4 text-text-secondary font-medium">Name</th>
                                    <th className="text-left p-4 text-text-secondary font-medium">Category</th>
                                    <th className="text-left p-4 text-text-secondary font-medium">Quantity</th>
                                    <th className="text-left p-4 text-text-secondary font-medium">Unit Price</th>
                                    <th className="text-left p-4 text-text-secondary font-medium">Total Value</th>
                                    <th className="text-left p-4 text-text-secondary font-medium">Status</th>
                                    <th className="text-left p-4 text-text-secondary font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredProducts.length === 0 ? (
                                    <tr>
                                        <td colSpan="8" className="p-8 text-center text-text-secondary">
                                            No products found. Add your first product to get started.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredProducts.map(product => (
                                        <tr key={product.id} className="border-b border-border-dark hover:bg-surface-light transition-colors">
                                            <td className="p-4 text-white font-mono">{product.partNumber}</td>
                                            <td className="p-4 text-white">{product.name}</td>
                                            <td className="p-4 text-text-secondary">{product.category.replace('_', ' ')}</td>
                                            <td className="p-4 text-white">{product.quantity}</td>
                                            <td className="p-4 text-white">₹{product.unitPrice.toFixed(2)}</td>
                                            <td className="p-4 text-white">₹{product.totalValue.toFixed(2)}</td>
                                            <td className="p-4">{getStockBadge(product.stockStatus)}</td>
                                            <td className="p-4">
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => { setSelectedProduct(product); setShowDetailsModal(true); }}
                                                        className="p-2 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors"
                                                        title="View Details"
                                                    >
                                                        <span className="material-symbols-outlined text-sm">visibility</span>
                                                    </button>
                                                    {user?.role === 'STOCK_ADMIN' && (
                                                        <button
                                                            onClick={() => { setSelectedProduct(product); setShowEditModal(true); }}
                                                            className="p-2 text-green-400 hover:bg-green-500/20 rounded-lg transition-colors"
                                                            title="Edit"
                                                        >
                                                            <span className="material-symbols-outlined text-sm">edit</span>
                                                        </button>
                                                    )}
                                                    {user?.role === 'STOCK_ADMIN' && (
                                                        <button
                                                            onClick={() => handleDelete(product.id)}
                                                            className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                                                            title="Delete"
                                                        >
                                                            <span className="material-symbols-outlined text-sm">delete</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Import Excel Modal */}
            <ImportExcelModal
                isOpen={showImportModal}
                onClose={() => setShowImportModal(false)}
                onSuccess={loadProducts}
            />

            {/* Product Form Modal (Add/Edit) */}
            <ProductFormModal
                isOpen={showAddModal || showEditModal}
                onClose={() => {
                    setShowAddModal(false);
                    setShowEditModal(false);
                    setSelectedProduct(null);
                }}
                onSuccess={loadProducts}
                product={showEditModal ? selectedProduct : null}
            />

            {/* Product Details Modal */}
            <ProductDetailsModal
                isOpen={showDetailsModal}
                onClose={() => {
                    setShowDetailsModal(false);
                    setSelectedProduct(null);
                }}
                product={selectedProduct}
            />
        </Layout>
    );
}
