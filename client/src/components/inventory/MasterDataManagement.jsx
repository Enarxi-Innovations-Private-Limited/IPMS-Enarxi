import { useState, useEffect } from 'react';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout';

export default function MasterDataManagement() {
    const Layout = usePortalLayout();
    const [activeTab, setActiveTab] = useState('items');
    const [items, setItems] = useState([]);
    const [classifications, setClassifications] = useState([]);
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [itemRes, classRes, locRes] = await Promise.all([
                inventoryService.getItems(),
                inventoryService.getClassifications(),
                inventoryService.getLocations()
            ]);
            setItems(itemRes.data);
            setClassifications(classRes.data);
            setLocations(locRes.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Layout currentPage="purchase-items">
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                        <div>
                            <h1 className="text-3xl font-bold text-white tracking-tight">Master Data Management</h1>
                            <p className="text-text-secondary text-lg">Define components, warehouses, and item hierarchies.</p>
                        </div>
                        <button
                            onClick={() => setShowModal(true)}
                            className="bg-primary text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-primary/20"
                        >
                            <span className="material-symbols-outlined">add</span>
                            Add New {activeTab.slice(0, -1)}
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-2 mb-6 bg-surface-dark p-1 rounded-xl w-fit border border-border-dark">
                        {['items', 'classifications', 'locations'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-6 py-2 rounded-lg text-sm font-bold capitalize transition-all ${activeTab === tab ? 'bg-primary text-white' : 'text-text-secondary hover:text-white'
                                    }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    {/* Content */}
                    <div className="bg-surface-dark border border-border-dark rounded-2xl shadow-xl overflow-hidden">
                        {loading ? (
                            <div className="p-20 text-center">
                                <div className="animate-spin size-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
                            </div>
                        ) : activeTab === 'items' ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-background-dark/50">
                                        <tr>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-text-secondary">Item</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-text-secondary">Class</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-text-secondary">Package</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-text-secondary">UOM</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-text-secondary">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-dark text-sm">
                                        {items.map(item => (
                                            <tr key={item.id} className="hover:bg-primary/5">
                                                <td className="px-6 py-4">
                                                    <div className="text-white font-medium">{item.name}</div>
                                                    <div className="text-primary font-mono text-xs">{item.itemCode}</div>
                                                </td>
                                                <td className="px-6 py-4 text-text-secondary">{item.classification?.name}</td>
                                                <td className="px-6 py-4 text-text-secondary">{item.package || 'N/A'}</td>
                                                <td className="px-6 py-4 text-text-secondary">{item.uom}</td>
                                                <td className="px-6 py-4 text-text-secondary">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                                        {item.isActive ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : activeTab === 'classifications' ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-background-dark/50">
                                        <tr>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-text-secondary">Name</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-text-secondary">Prefix</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-text-secondary">Next Seq</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-text-secondary">Serial Tracking</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-dark text-sm">
                                        {classifications.map(cls => (
                                            <tr key={cls.id} className="hover:bg-primary/5">
                                                <td className="px-6 py-4 text-white font-medium">{cls.name}</td>
                                                <td className="px-6 py-4 text-primary font-bold">{cls.prefix}</td>
                                                <td className="px-6 py-4 text-text-secondary">{cls.nextSequenceNumber}</td>
                                                <td className="px-6 py-4 text-text-secondary">
                                                    <span className={`material-symbols-outlined text-sm ${cls.tracksSerial ? 'text-emerald-400' : 'text-slate-600'}`}>
                                                        {cls.tracksSerial ? 'check_circle' : 'cancel'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-background-dark/50">
                                        <tr>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-text-secondary">Location Code</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-text-secondary">Name</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-text-secondary">Label</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-text-secondary">Is Default</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-dark text-sm">
                                        {locations.map(loc => (
                                            <tr key={loc.id} className="hover:bg-primary/5">
                                                <td className="px-6 py-4 text-primary font-bold">{loc.locationCode}</td>
                                                <td className="px-6 py-4 text-white font-medium">{loc.name}</td>
                                                <td className="px-6 py-4 text-text-secondary">{loc.label || 'N/A'}</td>
                                                <td className="px-6 py-4 text-text-secondary">
                                                    {loc.isDefault && <span className="px-2 py-0.5 bg-primary/20 text-primary text-[10px] font-bold rounded-full">Primary</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Layout>
    );
}
