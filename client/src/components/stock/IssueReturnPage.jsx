import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import StockAdminLayout from '../common/StockAdminLayout';
import api from '../../services/api';
import SearchableProductSelect from '../common/SearchableProductSelect';

export default function IssueReturnPage() {
    const [activeTab, setActiveTab] = useState('issue'); // 'issue' or 'issued'
    const [projects, setProjects] = useState([]);
    const [products, setProducts] = useState([]);
    const [issuedItems, setIssuedItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // Issue Form State
    const [selectedProject, setSelectedProject] = useState('');
    const [selectedMember, setSelectedMember] = useState('');
    const [projectMembers, setProjectMembers] = useState([]);
    const [items, setItems] = useState([{ productId: '', quantity: 1 }]);
    const [submitting, setSubmitting] = useState(false);

    // Return Modal State
    const [showReturnModal, setShowReturnModal] = useState(false);
    const [selectedReturnItem, setSelectedReturnItem] = useState(null);
    const [returnCondition, setReturnCondition] = useState('GOOD');
    const [returnRemarks, setReturnRemarks] = useState('');

    useEffect(() => {
        loadData();
    }, [activeTab]);

    const loadData = async () => {
        setLoading(true);
        setError('');
        try {
            if (activeTab === 'issue') {
                const [projectsRes, productsRes] = await Promise.all([
                    api.get('/projects'),
                    api.get('/stock/products')
                ]);
                setProjects(projectsRes.data);
                setProducts(productsRes.data);
            } else {
                const issuedRes = await api.get('/stock/issued');
                setIssuedItems(issuedRes.data);
            }
        } catch (err) {
            console.error('Error loading data:', err);
            setError('Failed to load data. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // --- Issue Form Logic ---
    const handleAddItem = () => {
        setItems([...items, { productId: '', quantity: 1 }]);
    };

    const handleRemoveItem = (index) => {
        if (items.length === 1) return;
        const newItems = [...items];
        newItems.splice(index, 1);
        setItems(newItems);
    };

    const handleItemChange = (index, field, value) => {
        const newItems = [...items];

        if (field === 'quantity') {
            const productId = newItems[index].productId;
            if (productId) {
                const max = getMaxQuantity(productId);
                if (value > max) {
                    value = max;
                    // Optional: You could set an error state here, or just clamp
                }
            }
        }

        newItems[index][field] = value;
        setItems(newItems);
    };

    const getMaxQuantity = (productId) => {
        const prod = products.find(p => p.id === productId);
        return prod ? prod.quantity : 0;
    };

    const handleExcelUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);

                const newItems = [];
                let matchCount = 0;

                data.forEach(row => {
                    // Normalize keys to lower case for easier matching
                    const keys = Object.keys(row).reduce((acc, k) => {
                        acc[k.toLowerCase()] = row[k];
                        return acc;
                    }, {});

                    // Look for Part Number or Part # or Product
                    const partNum = keys['part number'] || keys['part #'] || keys['part_number'] || keys['product'];
                    const qty = keys['quantity'] || keys['qty'] || 1;

                    if (partNum) {
                        // Find product
                        const product = products.find(p =>
                            (p.partNumber && p.partNumber.toLowerCase() === partNum.toString().toLowerCase()) ||
                            (p.name && p.name.toLowerCase() === partNum.toString().toLowerCase())
                        );

                        if (product) {
                            newItems.push({
                                productId: product.id,
                                quantity: parseInt(qty) || 1
                            });
                            matchCount++;
                        }
                    }
                });

                if (newItems.length > 0) {
                    // Combine with existing empty items if any, or just append
                    // If the current list has only one empty item, replace it
                    if (items.length === 1 && !items[0].productId) {
                        setItems(newItems);
                    } else {
                        setItems([...items, ...newItems]);
                    }
                    setSuccessMsg(`Successfully loaded ${matchCount} items from Excel.`);
                    setTimeout(() => setSuccessMsg(''), 3000);
                } else {
                    setError('No matching products found in the uploaded file. Please check column headers (Part Number, Quantity).');
                }
            } catch (err) {
                console.error("Excel parse error:", err);
                setError('Failed to parse Excel file.');
            }
        };
        reader.readAsBinaryString(file);
        e.target.value = null; // Reset input
    };

    const handleDownloadTemplate = () => {
        const ws = XLSX.utils.aoa_to_sheet([['Part Number', 'Quantity'], ['Example-Part-123', 5]]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Template");
        XLSX.writeFile(wb, "Issue-Products-Template.xlsx");
    };

    const handleIssueSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');
        setSuccessMsg('');

        try {
            if (!selectedProject) throw new Error("Please select a project");
            if (!selectedMember) throw new Error("Please select a team member");

            const validItems = items.filter(i => i.productId && i.quantity > 0);
            if (validItems.length === 0) throw new Error("Please add at least one product");

            // Validate quantities
            for (const item of validItems) {
                const max = getMaxQuantity(item.productId);
                if (item.quantity > max) {
                    const prodName = products.find(p => p.id === item.productId)?.name;
                    throw new Error(`Quantity for ${prodName} exceeds available stock (${max})`);
                }
            }

            await api.post('/stock/issue', {
                projectId: selectedProject,
                items: validItems,
                issuedTo: selectedMember
            });

            setSuccessMsg('Products issued successfully!');
            // Reset form
            setItems([{ productId: '', quantity: 1 }]);
            setSelectedProject('');
            setSelectedMember('');
            setProjectMembers([]);

            // Reload products to update stock
            const productsRes = await api.get('/stock/products');
            setProducts(productsRes.data);

            setTimeout(() => setSuccessMsg(''), 3000);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to issue items');
        } finally {
            setSubmitting(false);
        }
    };

    const handleReturnClick = (item) => {
        setSelectedReturnItem(item);
        setReturnCondition('GOOD');
        setReturnRemarks('');
        setShowReturnModal(true);
    };

    const handleReturnSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await api.post(`/stock/return/${selectedReturnItem._id || selectedReturnItem.id}`, {
                condition: returnCondition,
                remarks: returnRemarks
            });
            setSuccessMsg('Item returned successfully');
            setShowReturnModal(false);
            loadData(); // Reload list
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to return item');
        } finally {
            setSubmitting(false);
        }
    };



    const getStatusBadge = (status) => {
        const badges = {
            'ISSUED': <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">Issued</span>,
            'RETURNED': <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">Returned</span>,
            'CONSUMED': <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">Consumed</span>,
        };
        return badges[status] || status;
    };

    if (loading && !projects.length && !issuedItems.length) {
        return (
            <StockAdminLayout currentPage="issue-return">
                <div className="flex items-center justify-center h-full">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
            </StockAdminLayout>
        );
    }

    return (
        <StockAdminLayout currentPage="issue-return">
            <div className="p-8">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">Issue & Return Management</h1>
                    <p className="text-text-secondary">Track product assignments to projects</p>
                </div>

                {/* Tabs */}
                <div className="flex gap-4 mb-6">
                    <button
                        onClick={() => setActiveTab('issue')}
                        className={`px-6 py-3 rounded-lg font-medium transition-colors ${activeTab === 'issue'
                            ? 'bg-primary text-white'
                            : 'bg-surface-dark text-text-secondary hover:bg-surface-light'
                            }`}
                    >
                        Issue Products
                    </button>
                    <button
                        onClick={() => setActiveTab('issued')}
                        className={`px-6 py-3 rounded-lg font-medium transition-colors ${activeTab === 'issued'
                            ? 'bg-primary text-white'
                            : 'bg-surface-dark text-text-secondary hover:bg-surface-light'
                            }`}
                    >
                        Issued Items
                    </button>
                </div>

                {/* Messages */}
                {error && <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">{error}</div>}
                {successMsg && <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400">{successMsg}</div>}

                {/* Issue Form */}
                {activeTab === 'issue' && (
                    <div className="bg-surface-dark border border-border-dark rounded-xl p-6 max-w-4xl">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-white">Issue Product to Project</h2>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={handleDownloadTemplate}
                                    className="px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-600/50 rounded-lg hover:bg-blue-600/30 text-sm font-medium flex items-center gap-2 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-lg">download</span>
                                    Template
                                </button>
                                <label className="cursor-pointer px-4 py-2 bg-green-600/20 text-green-400 border border-green-600/50 rounded-lg hover:bg-green-600/30 text-sm font-medium flex items-center gap-2 transition-colors">
                                    <span className="material-symbols-outlined text-lg">upload_file</span>
                                    Upload Excel
                                    <input
                                        type="file"
                                        accept=".xlsx, .xls"
                                        className="hidden"
                                        onChange={handleExcelUpload}
                                    />
                                </label>
                            </div>
                        </div>
                        <form onSubmit={handleIssueSubmit} className="space-y-6">

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Project Selection */}
                                <div>
                                    <label className="block text-sm text-text-secondary mb-2">Project *</label>
                                    <select
                                        value={selectedProject}
                                        onChange={e => {
                                            const pid = e.target.value;
                                            setSelectedProject(pid);
                                            const proj = projects.find(p => (p._id || p.id) === pid);
                                            // Ensure teamIds is treated as an array of objects
                                            setProjectMembers(proj?.teamIds || []);
                                            setSelectedMember('');
                                        }}
                                        className="w-full px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary"
                                        required
                                    >
                                        <option value="">Select Project</option>
                                        {projects.map(p => (
                                            <option key={p._id || p.id} value={p._id || p.id}>{p.name} ({p.projectCode})</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Team Member Selection */}
                                <div>
                                    <label className="block text-sm text-text-secondary mb-2">Team Member (Issued To) *</label>
                                    <select
                                        value={selectedMember}
                                        onChange={e => setSelectedMember(e.target.value)}
                                        className="w-full px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary"
                                        required
                                        disabled={!selectedProject}
                                    >
                                        <option value="">{selectedProject ? 'Select Team Member' : 'Select Project First'}</option>
                                        {projectMembers.map(m => (
                                            <option key={m._id || m.id} value={m._id || m.id}>{m.name} ({m.employeeId})</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Products List */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="block text-sm text-text-secondary">Products *</label>
                                    <button type="button" onClick={handleAddItem} className="text-primary hover:text-primary-hover text-sm font-medium flex items-center gap-1">
                                        <span className="material-symbols-outlined text-sm">add</span> Add Product
                                    </button>
                                </div>

                                {items.map((item, index) => (
                                    <div key={index} className="flex flex-col md:flex-row gap-4 items-start bg-surface-light/50 p-4 rounded-lg border border-border-dark/50">
                                        <div className="flex-1 w-full">
                                            <div className="flex justify-between mb-1">
                                                <label className="block text-xs text-text-secondary">Product</label>
                                                {item.productId && (
                                                    <span className="text-xs text-text-secondary">
                                                        Stock: {products.find(p => p.id === item.productId)?.quantity || 0}
                                                    </span>
                                                )}
                                            </div>
                                            <SearchableProductSelect
                                                products={products}
                                                value={item.productId}
                                                onChange={(id) => handleItemChange(index, 'productId', id)}
                                                required
                                                placeholder="Search product by name, part #..."
                                            />
                                        </div>
                                        <div className="w-full md:w-32">
                                            <label className="block text-xs text-text-secondary mb-1">Quantity</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max={item.productId ? getMaxQuantity(item.productId) : undefined}
                                                value={item.quantity}
                                                onChange={e => handleItemChange(index, 'quantity', parseInt(e.target.value) || 0)}
                                                className="w-full px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary"
                                                placeholder="Qty"
                                                required
                                            />
                                        </div>
                                        <div className="pt-6">
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveItem(index)}
                                                className={`p-2 rounded-lg transition-colors ${items.length > 1 ? 'text-red-400 hover:bg-red-500/20' : 'text-gray-600 cursor-not-allowed'}`}
                                                disabled={items.length === 1}
                                            >
                                                <span className="material-symbols-outlined">delete</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="pt-4 border-t border-border-dark">
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {submitting && <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>}
                                    {submitting ? 'Issuing...' : 'Issue Products'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Issued Items Table */}
                {activeTab === 'issued' && (
                    <div className="bg-surface-dark border border-border-dark rounded-xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-border-dark bg-surface-light/30">
                                        <th className="text-left p-4 text-text-secondary font-medium uppercase text-xs">Project</th>
                                        <th className="text-left p-4 text-text-secondary font-medium uppercase text-xs">Product</th>
                                        <th className="text-left p-4 text-text-secondary font-medium uppercase text-xs">Quantity</th>
                                        <th className="text-left p-4 text-text-secondary font-medium uppercase text-xs">Issued To</th>
                                        <th className="text-left p-4 text-text-secondary font-medium uppercase text-xs">Issued By</th>
                                        <th className="text-left p-4 text-text-secondary font-medium uppercase text-xs">Date</th>
                                        <th className="text-left p-4 text-text-secondary font-medium uppercase text-xs">Status</th>
                                        <th className="text-left p-4 text-text-secondary font-medium uppercase text-xs">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {issuedItems.length === 0 ? (
                                        <tr>
                                            <td colSpan="7" className="p-8 text-center text-text-secondary">
                                                No issued items found
                                            </td>
                                        </tr>
                                    ) : (
                                        issuedItems.map(item => (
                                            <tr key={item.id || item._id} className="border-b border-border-dark hover:bg-surface-light/50 transition-colors">
                                                <td className="p-4 text-white font-medium">
                                                    {item.project?.name || 'Unknown Project'}
                                                    <div className="text-xs text-text-secondary">{item.project?.projectCode}</div>
                                                </td>
                                                <td className="p-4 text-white">
                                                    {item.product?.name || 'Unknown Product'}
                                                    <div className="text-xs text-text-secondary">{item.product?.partNumber}</div>
                                                </td>
                                                <td className="p-4 text-white">{item.quantity}</td>
                                                <td className="p-4 text-text-secondary text-sm">{item.issuedTo?.name || 'N/A'}</td>
                                                <td className="p-4 text-text-secondary text-sm">{item.issuedBy?.name}</td>
                                                <td className="p-4 text-text-secondary text-sm">{new Date(item.issuedAt || item.createdAt).toLocaleDateString()}</td>
                                                <td className="p-4">{getStatusBadge(item.status)}</td>
                                                <td className="p-4">
                                                    {item.status === 'ISSUED' && (
                                                        <button
                                                            onClick={() => handleReturnClick(item)}
                                                            className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                                                        >
                                                            Return
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Return Modal */}
            {showReturnModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-surface-dark border border-border-dark rounded-xl w-full max-w-md mx-4 shadow-2xl p-6">
                        <h2 className="text-xl font-bold text-white mb-4">Return Item</h2>
                        <form onSubmit={handleReturnSubmit}>
                            <div className="mb-4">
                                <label className="block text-sm text-text-secondary mb-1">Product</label>
                                <div className="text-white font-medium">{selectedReturnItem?.product?.name}</div>
                                <div className="text-xs text-text-secondary">{selectedReturnItem?.product?.partNumber}</div>
                            </div>
                            <div className="mb-4">
                                <label className="block text-sm text-text-secondary mb-1">Condition *</label>
                                <select
                                    value={returnCondition}
                                    onChange={(e) => setReturnCondition(e.target.value)}
                                    className="w-full px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary"
                                >
                                    <option value="GOOD">Good (Return to Stock)</option>
                                    <option value="DEFECTIVE">Defective (Do not Restock)</option>
                                    <option value="DAMAGED">Damaged (User Fault)</option>
                                </select>
                            </div>
                            <div className="mb-6">
                                <label className="block text-sm text-text-secondary mb-1">Remarks</label>
                                <textarea
                                    value={returnRemarks}
                                    onChange={(e) => setReturnRemarks(e.target.value)}
                                    placeholder="Any notes about the return..."
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
                                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
                                >
                                    {submitting ? 'Processing...' : 'Confirm Return'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </StockAdminLayout>
    );
}
