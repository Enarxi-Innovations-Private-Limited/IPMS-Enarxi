import { useState, useEffect } from 'react';
import StockAdminLayout from '../common/StockAdminLayout';
import api from '../../services/api';

export default function PurchaseOrdersPage() {
    const [purchaseOrders, setPurchaseOrders] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [statusFilter, setStatusFilter] = useState('ALL');

    // Create PO form
    const [poForm, setPOForm] = useState({
        supplierId: '',
        items: [{ productId: '', quantity: '', unitPrice: '' }],
        expectedDelivery: '',
        notes: '',
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [posRes, suppliersRes, productsRes] = await Promise.all([
                api.get('/stock/purchase-orders'),
                api.get('/stock/suppliers'),
                api.get('/stock/products'),
            ]);
            setPurchaseOrders(posRes.data);
            setSuppliers(suppliersRes.data);
            setProducts(productsRes.data);
        } catch (err) {
            console.error('Error loading data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreatePO = async (e) => {
        e.preventDefault();
        try {
            await api.post('/stock/purchase-orders', poForm);
            alert('Purchase order created successfully');
            setShowCreateModal(false);
            setPOForm({ supplierId: '', items: [{ productId: '', quantity: '', unitPrice: '' }], expectedDelivery: '', notes: '' });
            loadData();
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to create purchase order');
        }
    };

    const handleReceivePO = async (poId) => {
        if (!confirm('Mark this purchase order as received? This will update stock levels.')) return;
        try {
            await api.post(`/stock/purchase-orders/${poId}/receive`);
            alert('Purchase order received and stock updated');
            loadData();
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to receive purchase order');
        }
    };

    const addItem = () => {
        setPOForm({
            ...poForm,
            items: [...poForm.items, { productId: '', quantity: '', unitPrice: '' }]
        });
    };

    const removeItem = (index) => {
        setPOForm({
            ...poForm,
            items: poForm.items.filter((_, i) => i !== index)
        });
    };

    const updateItem = (index, field, value) => {
        const newItems = [...poForm.items];
        newItems[index][field] = value;
        setPOForm({ ...poForm, items: newItems });
    };

    const getStatusBadge = (status) => {
        const badges = {
            'DRAFT': <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">Draft</span>,
            'SUBMITTED': <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">Submitted</span>,
            'APPROVED': <span className="px-3 py-1 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">Approved</span>,
            'RECEIVED': <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">Received</span>,
            'CANCELLED': <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400">Cancelled</span>,
        };
        return badges[status] || status;
    };

    const filteredPOs = statusFilter === 'ALL'
        ? purchaseOrders
        : purchaseOrders.filter(po => po.status === statusFilter);

    return (
        <StockAdminLayout currentPage="purchase-orders">
            <div className="p-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-2">Purchase Orders</h1>
                        <p className="text-text-secondary">{filteredPOs.length} purchase orders found</p>
                    </div>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors flex items-center gap-2"
                    >
                        <span className="material-symbols-outlined">add</span>
                        Create Purchase Order
                    </button>
                </div>

                {/* Filter */}
                <div className="mb-6">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-4 py-2 bg-surface-dark border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary"
                    >
                        <option value="ALL">All Status</option>
                        <option value="DRAFT">Draft</option>
                        <option value="SUBMITTED">Submitted</option>
                        <option value="APPROVED">Approved</option>
                        <option value="RECEIVED">Received</option>
                    </select>
                </div>

                {/* Purchase Orders Table */}
                <div className="bg-surface-dark border border-border-dark rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border-dark">
                                    <th className="text-left p-4 text-text-secondary font-medium">PO Number</th>
                                    <th className="text-left p-4 text-text-secondary font-medium">Supplier</th>
                                    <th className="text-left p-4 text-text-secondary font-medium">Items</th>
                                    <th className="text-left p-4 text-text-secondary font-medium">Total Amount</th>
                                    <th className="text-left p-4 text-text-secondary font-medium">Order Date</th>
                                    <th className="text-left p-4 text-text-secondary font-medium">Status</th>
                                    <th className="text-left p-4 text-text-secondary font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPOs.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="p-8 text-center text-text-secondary">
                                            No purchase orders found
                                        </td>
                                    </tr>
                                ) : (
                                    filteredPOs.map(po => (
                                        <tr key={po.id} className="border-b border-border-dark hover:bg-surface-light transition-colors">
                                            <td className="p-4 text-white font-mono">{po.poNumber}</td>
                                            <td className="p-4 text-white">{po.supplier.name}</td>
                                            <td className="p-4 text-text-secondary">{po.items.length} items</td>
                                            <td className="p-4 text-white">₹{po.totalAmount.toFixed(2)}</td>
                                            <td className="p-4 text-text-secondary">{new Date(po.orderDate).toLocaleDateString()}</td>
                                            <td className="p-4">{getStatusBadge(po.status)}</td>
                                            <td className="p-4">
                                                {po.status === 'APPROVED' && (
                                                    <button
                                                        onClick={() => handleReceivePO(po.id)}
                                                        className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors text-sm"
                                                    >
                                                        Receive
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

                {/* Create PO Modal */}
                {showCreateModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-surface-dark border border-border-dark rounded-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                            <h2 className="text-2xl font-bold text-white mb-6">Create Purchase Order</h2>
                            <form onSubmit={handleCreatePO} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-text-secondary mb-2">Supplier *</label>
                                        <select
                                            required
                                            value={poForm.supplierId}
                                            onChange={(e) => setPOForm({ ...poForm, supplierId: e.target.value })}
                                            className="w-full px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary"
                                        >
                                            <option value="">Select Supplier</option>
                                            {suppliers.map(s => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm text-text-secondary mb-2">Expected Delivery</label>
                                        <input
                                            type="date"
                                            value={poForm.expectedDelivery}
                                            onChange={(e) => setPOForm({ ...poForm, expectedDelivery: e.target.value })}
                                            className="w-full px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm text-text-secondary mb-2">Items</label>
                                    {poForm.items.map((item, index) => (
                                        <div key={index} className="grid grid-cols-4 gap-4 mb-2">
                                            <select
                                                required
                                                value={item.productId}
                                                onChange={(e) => updateItem(index, 'productId', e.target.value)}
                                                className="col-span-2 px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary"
                                            >
                                                <option value="">Select Product</option>
                                                {products.map(p => (
                                                    <option key={p.id} value={p.id}>{p.partNumber} - {p.name}</option>
                                                ))}
                                            </select>
                                            <input
                                                type="number"
                                                required
                                                min="1"
                                                placeholder="Quantity"
                                                value={item.quantity}
                                                onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                                                className="px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary"
                                            />
                                            <div className="flex gap-2">
                                                <input
                                                    type="number"
                                                    required
                                                    min="0"
                                                    step="0.01"
                                                    placeholder="Unit Price"
                                                    value={item.unitPrice}
                                                    onChange={(e) => updateItem(index, 'unitPrice', e.target.value)}
                                                    className="flex-1 px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => removeItem(index)}
                                                    className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg"
                                                >
                                                    <span className="material-symbols-outlined">delete</span>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={addItem}
                                        className="mt-2 px-4 py-2 bg-surface-light border border-border-dark text-white rounded-lg hover:bg-surface-dark transition-colors"
                                    >
                                        + Add Item
                                    </button>
                                </div>

                                <div>
                                    <label className="block text-sm text-text-secondary mb-2">Notes</label>
                                    <textarea
                                        value={poForm.notes}
                                        onChange={(e) => setPOForm({ ...poForm, notes: e.target.value })}
                                        rows="3"
                                        className="w-full px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary"
                                    ></textarea>
                                </div>

                                <div className="flex gap-3 justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setShowCreateModal(false)}
                                        className="px-6 py-2 bg-surface-light text-white rounded-lg hover:bg-surface-dark transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
                                    >
                                        Create Purchase Order
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </StockAdminLayout>
    );
}
