import { useState, useEffect } from 'react';
import StockAdminLayout from '../common/StockAdminLayout';
import api from '../../services/api';

export default function IssueReturnPage() {
    const [activeTab, setActiveTab] = useState('issue'); // 'issue' or 'issued'
    const [products, setProducts] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [issuedItems, setIssuedItems] = useState([]);
    const [loading, setLoading] = useState(false);

    // Issue form
    const [issueForm, setIssueForm] = useState({
        productId: '',
        quantity: '',
        employeeId: '',
        purpose: '',
        expectedReturnDate: '',
    });

    useEffect(() => {
        loadData();
    }, [activeTab]);

    const loadData = async () => {
        setLoading(true);
        try {
            if (activeTab === 'issue') {
                const [productsRes, employeesRes] = await Promise.all([
                    api.get('/stock/products'),
                    api.get('/users'),
                ]);
                setProducts(productsRes.data);
                setEmployees(employeesRes.data);
            } else {
                const issuedRes = await api.get('/stock/issued');
                setIssuedItems(issuedRes.data);
            }
        } catch (err) {
            console.error('Error loading data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleIssue = async (e) => {
        e.preventDefault();
        try {
            await api.post('/stock/issue', issueForm);
            alert('Product issued successfully');
            setIssueForm({ productId: '', quantity: '', employeeId: '', purpose: '', expectedReturnDate: '' });
            loadData();
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to issue product');
        }
    };

    const handleReturn = async (issuedItemId) => {
        if (!confirm('Mark this item as returned?')) return;
        try {
            await api.post(`/stock/return/${issuedItemId}`, { condition: 'GOOD' });
            alert('Product returned successfully');
            loadData();
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to return product');
        }
    };

    const getStatusBadge = (status) => {
        const badges = {
            'ISSUED': <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">Issued</span>,
            'RETURNED': <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">Returned</span>,
            'OVERDUE': <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400">Overdue</span>,
        };
        return badges[status] || status;
    };

    return (
        <StockAdminLayout currentPage="issue-return">
            <div className="p-8">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">Issue & Return Management</h1>
                    <p className="text-text-secondary">Track product assignments to employees</p>
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

                {/* Issue Form */}
                {activeTab === 'issue' && (
                    <div className="bg-surface-dark border border-border-dark rounded-xl p-6">
                        <h2 className="text-xl font-bold text-white mb-6">Issue Product to Employee</h2>
                        <form onSubmit={handleIssue} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-text-secondary mb-2">Product *</label>
                                    <select
                                        required
                                        value={issueForm.productId}
                                        onChange={(e) => setIssueForm({ ...issueForm, productId: e.target.value })}
                                        className="w-full px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary"
                                    >
                                        <option value="">Select Product</option>
                                        {products.filter(p => p.quantity > 0).map(product => (
                                            <option key={product.id} value={product.id}>
                                                {product.partNumber} - {product.name} (Stock: {product.quantity})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm text-text-secondary mb-2">Quantity *</label>
                                    <input
                                        type="number"
                                        required
                                        min="1"
                                        value={issueForm.quantity}
                                        onChange={(e) => setIssueForm({ ...issueForm, quantity: e.target.value })}
                                        className="w-full px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm text-text-secondary mb-2">Employee *</label>
                                    <select
                                        required
                                        value={issueForm.employeeId}
                                        onChange={(e) => setIssueForm({ ...issueForm, employeeId: e.target.value })}
                                        className="w-full px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary"
                                    >
                                        <option value="">Select Employee</option>
                                        {employees.map(emp => (
                                            <option key={emp.id} value={emp.id}>
                                                {emp.name} ({emp.employeeId})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm text-text-secondary mb-2">Expected Return Date</label>
                                    <input
                                        type="date"
                                        value={issueForm.expectedReturnDate}
                                        onChange={(e) => setIssueForm({ ...issueForm, expectedReturnDate: e.target.value })}
                                        className="w-full px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-text-secondary mb-2">Purpose</label>
                                <textarea
                                    value={issueForm.purpose}
                                    onChange={(e) => setIssueForm({ ...issueForm, purpose: e.target.value })}
                                    rows="3"
                                    className="w-full px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary"
                                    placeholder="Reason for issuing this product..."
                                ></textarea>
                            </div>

                            <button
                                type="submit"
                                className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
                            >
                                Issue Product
                            </button>
                        </form>
                    </div>
                )}

                {/* Issued Items Table */}
                {activeTab === 'issued' && (
                    <div className="bg-surface-dark border border-border-dark rounded-xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-border-dark">
                                        <th className="text-left p-4 text-text-secondary font-medium">Product</th>
                                        <th className="text-left p-4 text-text-secondary font-medium">Quantity</th>
                                        <th className="text-left p-4 text-text-secondary font-medium">Employee</th>
                                        <th className="text-left p-4 text-text-secondary font-medium">Issue Date</th>
                                        <th className="text-left p-4 text-text-secondary font-medium">Expected Return</th>
                                        <th className="text-left p-4 text-text-secondary font-medium">Status</th>
                                        <th className="text-left p-4 text-text-secondary font-medium">Actions</th>
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
                                            <tr key={item.id} className="border-b border-border-dark hover:bg-surface-light transition-colors">
                                                <td className="p-4 text-white">{item.product.name}</td>
                                                <td className="p-4 text-white">{item.quantity}</td>
                                                <td className="p-4 text-white">{item.employee.name}</td>
                                                <td className="p-4 text-text-secondary">{new Date(item.issueDate).toLocaleDateString()}</td>
                                                <td className="p-4 text-text-secondary">
                                                    {item.expectedReturnDate ? new Date(item.expectedReturnDate).toLocaleDateString() : 'N/A'}
                                                </td>
                                                <td className="p-4">{getStatusBadge(item.status)}</td>
                                                <td className="p-4">
                                                    {item.status === 'ISSUED' && (
                                                        <button
                                                            onClick={() => handleReturn(item.id)}
                                                            className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors text-sm"
                                                        >
                                                            Mark as Returned
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
        </StockAdminLayout>
    );
}
