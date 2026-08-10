import { useState, useEffect } from 'react';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout.js';
import { getCurrentUser } from '../../services/authService.js';
import { useNotifier } from '../common/AppNotificationProvider.jsx';
import BulkAddMRItemsModal from './BulkAddMRItemsModal.jsx';
import MRDeleteConfirmModal from './MRDeleteConfirmModal.jsx';
import * as XLSX from 'xlsx';

export default function MaterialRequestPage({ currentPage: propCurrentPage }) {
    const Layout = usePortalLayout();
    const currentUser = getCurrentUser();
    const isSuperInventoryAdmin = ['SUPER_ADMIN', 'SUPER_USER'].includes((currentUser?.role || '').toUpperCase());
    const { error: notifyError, success: notifySuccess } = useNotifier();
    const currentPage = propCurrentPage || 'material-requests';
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [projects, setProjects] = useState([]);
    const [items, setItems] = useState([]);
    const [error, setError] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [selectedMR, setSelectedMR] = useState(null);
    const [viewingMR, setViewingMR] = useState(null);
    const [viewingDetails, setViewingDetails] = useState(null);
    const [itemsLoading, setItemsLoading] = useState(false);
    const [deletingRequestId, setDeletingRequestId] = useState(null);
    const [deletePreviewRequestId, setDeletePreviewRequestId] = useState(null);
    const [deleteModalRequest, setDeleteModalRequest] = useState(null);
    const [deleteConfirmValue, setDeleteConfirmValue] = useState('');

    // Unknown-item request state
    const [showUnknownPanel, setShowUnknownPanel] = useState(false);
    const [unknownItems, setUnknownItems] = useState([{ name: '', description: '' }]);
    const [classifications, setClassifications] = useState([]);
    const [vendors, setVendors] = useState([]);
    const [locations, setLocations] = useState([]);

    // Form State
    const [formData, setFormData] = useState({
        projectId: '',
        items: [{ itemCode: '', quantity: 1 }],
        notes: ''
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const [reqRes, projRes, itemsRes] = await Promise.all([
                    inventoryService.getMaterialRequests(),
                    inventoryService.getProjects(),
                    inventoryService.getItems()
                ]);
                setRequests(reqRes.data);
                setProjects(projRes.data.filter(p => ['ACTIVE', 'PLANNING'].includes(p.status)));
                setItems(itemsRes.data);
            } catch (err) {
                setError('Failed to load data. Please check connections.');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    // Re-fetch all reference data every time the modal opens so newly created items always appear
    useEffect(() => {
        if (!showModal) return;
        setShowUnknownPanel(false);
        setUnknownItems([{ name: '', description: '' }]);
        setItemsLoading(true);
        Promise.all([
            inventoryService.getItems(),
            inventoryService.getClassifications(),
            inventoryService.getVendors(),
            inventoryService.getLocations(),
        ])
            .then(([itemRes, classRes, vendorRes, locationRes]) => {
                setItems(itemRes.data || []);
                setClassifications(classRes.data || []);
                setVendors(vendorRes.data || []);
                setLocations(locationRes.data || []);
            })
            .catch(() => {})
            .finally(() => setItemsLoading(false));
    }, [showModal]);

    const handleAddItem = () => {
        setFormData({ ...formData, items: [...formData.items, { itemCode: '', quantity: 1 }] });
    };

    const refreshRequests = async () => {
        const res = await inventoryService.getMaterialRequests();
        setRequests(res.data);
    };

    const closeDeleteModal = (force = false) => {
        if (!force && deletingRequestId) return;
        setDeleteModalRequest(null);
        setDeleteConfirmValue('');
    };

    const canDeleteRequest = (request) => isSuperInventoryAdmin || request?.status === 'SUBMITTED';

    const openDeleteModal = async (request) => {
        const requestId = request?.id || request?._id;
        if (!requestId) return;
        if (!isSuperInventoryAdmin) return;

        try {
            setDeletePreviewRequestId(requestId);
            const res = await inventoryService.getMaterialRequestDetails(requestId);
            setDeleteModalRequest(res.data);
            setDeleteConfirmValue('');
        } catch (err) {
            notifyError(err.response?.data?.message || 'Failed to load material request details.');
        } finally {
            setDeletePreviewRequestId(null);
        }
    };

    const buildDeleteSuccessMessage = (responseData) => {
        const counts = responseData?.counts || {};
        const fragments = [
            counts.storeBatches ? `${counts.storeBatches} store batch${counts.storeBatches === 1 ? '' : 'es'}` : null,
            counts.purchaseBatches ? `${counts.purchaseBatches} purchase batch${counts.purchaseBatches === 1 ? '' : 'es'}` : null,
            counts.purchaseOrders ? `${counts.purchaseOrders} PO${counts.purchaseOrders === 1 ? '' : 's'}` : null,
            counts.dispatches ? `${counts.dispatches} dispatch${counts.dispatches === 1 ? '' : 'es'}` : null,
            counts.purchaseInwards ? `${counts.purchaseInwards} inward${counts.purchaseInwards === 1 ? '' : 's'}` : null
        ].filter(Boolean);

        return fragments.length
            ? `Deleted ${responseData.requestNumber}. Removed ${fragments.join(', ')}.`
            : `Deleted ${responseData.requestNumber}.`;
    };

    const handleDeleteRequest = async (request) => {
        const requestId = request?.id || request?._id;
        if (!requestId) return;

        if (isSuperInventoryAdmin) {
            await openDeleteModal(request);
            return;
        }

        const confirmed = window.confirm(`Delete ${request.requestNumber}? This cannot be undone.`);
        if (!confirmed) return;

        try {
            setDeletingRequestId(requestId);
            await inventoryService.deleteMaterialRequest(requestId);

            if ((viewingMR?.id || viewingMR?._id) === requestId) {
                setViewingMR(null);
                setViewingDetails(null);
            }

            await refreshRequests();
            notifySuccess(`Deleted ${request.requestNumber}.`);
        } catch (err) {
            notifyError(err.response?.data?.message || 'Failed to delete material request.');
        } finally {
            setDeletingRequestId(null);
        }
    };

    const handleConfirmDeepDelete = async () => {
        const requestId = deleteModalRequest?.id || deleteModalRequest?._id;
        if (!requestId) return;

        try {
            setDeletingRequestId(requestId);
            const res = await inventoryService.deleteMaterialRequestDeep(requestId);

            if ((viewingMR?.id || viewingMR?._id) === requestId) {
                setViewingMR(null);
                setViewingDetails(null);
            }

            closeDeleteModal(true);
            await refreshRequests();
            notifySuccess(buildDeleteSuccessMessage(res.data));
        } catch (err) {
            notifyError(err.response?.data?.message || 'Failed to deep delete material request.');
        } finally {
            setDeletingRequestId(null);
        }
    };

    const handleItemChange = (index, field, value) => {
        const newItems = [...formData.items];
        newItems[index][field] = value;
        setFormData({ ...formData, items: newItems });
    };

    const handleBulkUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';

        // Always fetch the latest item list before validating so newly-created items are visible
        let latestItems = items;
        try {
            const freshRes = await inventoryService.getItems();
            latestItems = freshRes.data || items;
            setItems(latestItems);
        } catch {
            // fall back to whatever we already have
        }

        const reader = new FileReader();
        reader.onload = (evt) => {
            const data = evt.target.result;
            const workbook = XLSX.read(data, { type: 'binary' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const parsed = XLSX.utils.sheet_to_json(sheet);

            const normalize = (s) => (s || '').toString().trim().toUpperCase();

            const notFound = [];
            const importedItems = parsed.map(row => {
                const rawCode = (row.ItemCode || row['Item Code'] || row['itemCode'] || '').toString().trim();
                const code = normalize(rawCode);
                const qty = parseFloat(row.Quantity || row.Qty || row['quantity'] || 0);

                if (!code || qty <= 0) return null;

                // Match case-insensitively — store the exact code from our master list
                const matched = latestItems.find(i => normalize(i.itemCode) === code);
                if (!matched) {
                    notFound.push(rawCode);
                    return null;
                }
                return { itemCode: matched.itemCode, quantity: qty };
            }).filter(Boolean);

            // Add recognised items to the component requirements
            if (importedItems.length > 0) {
                setFormData(prev => ({
                    ...prev,
                    items: [...prev.items.filter(i => i.itemCode !== ''), ...importedItems]
                }));
            }

            // Auto-route unrecognised codes straight into the "Items Not in System" panel
            if (notFound.length > 0) {
                const newUnknown = notFound.map(code => ({ name: code, description: '' }));
                setUnknownItems(newUnknown);
                setShowUnknownPanel(true);

                if (importedItems.length > 0) {
                    notifySuccess(
                        `${importedItems.length} component(s) added. ` +
                        `${notFound.length} unrecognised item(s) moved to "Items Not in System" below — ` +
                        `review the names and download the creation request for your Super Admin.`
                    );
                } else {
                    notifySuccess(
                        `${notFound.length} item(s) from your upload aren't in the Item Master yet. ` +
                        `They've been added to "Items Not in System" below — ` +
                        `download the creation request and forward to your Super Admin.`
                    );
                }
            } else if (importedItems.length > 0) {
                notifySuccess(`${importedItems.length} component(s) imported successfully.`);
            } else {
                notifyError('No valid rows found. Ensure the file has "Item Code" and "Quantity" columns.');
            }
        };
        reader.readAsBinaryString(file);
    };

    // Unknown-item helpers
    const handleUnknownItemChange = (index, field, value) => {
        const next = [...unknownItems];
        next[index] = { ...next[index], [field]: value };
        setUnknownItems(next);
    };

    const handleAddUnknownRow = () => setUnknownItems([...unknownItems, { name: '', description: '' }]);

    const handleRemoveUnknownRow = (index) => {
        const next = unknownItems.filter((_, i) => i !== index);
        setUnknownItems(next.length ? next : [{ name: '', description: '' }]);
    };

    // ── Download helpers (all close over state) ──

    const _makeImportSheet = (filledRows) => {
        // Exact format the MasterDataManagement bulk importer reads:
        // Base columns + one column per active vendor (vendorCode as header, cell = SKU)
        const activeVendors = vendors.filter(v => v.isActive !== false);
        const vendorCols = activeVendors.map(v => v.vendorCode);
        const headers = [
            'Classification *',
            'Item Code  (leave blank to auto-generate)',
            'Item Name *',
            'Package  (e.g. SMD, THT, DIP-8, TO-92)',
            'UOM *  (Nos / Kg / Meters / Liters)',
            'Description',
            ...vendorCols,
        ];
        const dataRows = filledRows.map(r => [
            '',        // Classification — admin fills
            '',        // Item Code — auto-generate
            r.name.trim(),
            '',        // Package — admin fills
            '',        // UOM — admin fills
            r.description.trim(),
            ...vendorCols.map(() => ''),  // one blank per vendor for SKU
        ]);
        const sheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
        const baseCols = [{ wch: 28 }, { wch: 32 }, { wch: 34 }, { wch: 30 }, { wch: 24 }, { wch: 38 }];
        sheet['!cols'] = [...baseCols, ...vendorCols.map(() => ({ wch: 22 }))];
        return sheet;
    };

    const _makeClassSheet = () => {
        const sheet = XLSX.utils.aoa_to_sheet([
            ['Classification Name', 'Prefix', 'Tracks Serial Numbers', 'Department'],
            ...classifications.map(c => [c.name, c.prefix, c.tracksSerial ? 'Yes' : 'No', c.department || '']),
        ]);
        sheet['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 22 }, { wch: 20 }];
        return sheet;
    };

    const _makeVendorSheet = () => {
        const sheet = XLSX.utils.aoa_to_sheet([
            ['Vendor Code  (use as column header above)', 'Vendor Name', 'Contact Person', 'Email', 'Local Source'],
            ...vendors
                .filter(v => v.isActive !== false)
                .map(v => [v.vendorCode, v.name, v.contactPerson || '', v.email || '', v.isLocalSource ? 'Yes' : 'No']),
        ]);
        sheet['!cols'] = [{ wch: 36 }, { wch: 30 }, { wch: 24 }, { wch: 28 }, { wch: 14 }];
        return sheet;
    };

    const _makeLocationSheet = () => {
        const sheet = XLSX.utils.aoa_to_sheet([
            ['Location Code', 'Location Name', 'Label / Zone', 'Address', 'Default Location'],
            ...locations
                .filter(l => l.isActive !== false)
                .map(l => [l.locationCode, l.name, l.label || '', l.address || '', l.isDefault ? 'Yes' : '']),
        ]);
        sheet['!cols'] = [{ wch: 18 }, { wch: 28 }, { wch: 20 }, { wch: 32 }, { wch: 16 }];
        return sheet;
    };

    const _makeMasterSheet = () => {
        const activeVendors = vendors.filter(v => v.isActive !== false);
        const vendorCols = activeVendors.map(v => v.vendorCode);
        const headers = ['Item Code', 'Item Name', 'Classification', 'Package', 'UOM', 'Description', ...vendorCols];
        const rows = items
            .filter(i => i.isActive !== false)
            .map(i => {
                const skuByVendorCode = {};
                (i.skuMappings || []).forEach(m => {
                    const code = m.vendorCode || m.vendorId?.vendorCode || '';
                    if (code && m.sku) skuByVendorCode[code] = m.sku;
                });
                return [
                    i.itemCode,
                    i.name,
                    i.classification?.name || i.classificationId?.name || '',
                    i.package || '',
                    i.uom || '',
                    i.description || '',
                    ...vendorCols.map(vc => skuByVendorCode[vc] || ''),
                ];
            });
        const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const baseCols = [{ wch: 18 }, { wch: 34 }, { wch: 24 }, { wch: 16 }, { wch: 10 }, { wch: 38 }];
        sheet['!cols'] = [...baseCols, ...vendorCols.map(() => ({ wch: 20 }))];
        return sheet;
    };

    /**
     * "Download for Admin" — clean Excel for forwarding via Teams.
     * Admin opens Sheet 1, fills Classification + UOM + vendor SKUs, then bulk-imports directly.
     */
    const downloadForAdmin = () => {
        const filledRows = unknownItems.filter(r => r.name.trim());
        if (filledRows.length === 0) {
            notifyError('Add at least one item name before downloading.');
            return;
        }
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, _makeImportSheet(filledRows), 'New Items (Admin Import)');
        XLSX.utils.book_append_sheet(wb, _makeClassSheet(), 'Classification Reference');
        XLSX.utils.book_append_sheet(wb, _makeVendorSheet(), 'Vendor Reference');
        XLSX.utils.book_append_sheet(wb, _makeLocationSheet(), 'Stock Location Reference');

        const date = new Date().toISOString().slice(0, 10);
        const filename = `New_Item_Request_For_Admin_${date}.xlsx`;
        XLSX.writeFile(wb, filename);
        notifySuccess(
            `Downloaded ${filledRows.length} item(s). ` +
            `Forward "${filename}" to your Super Admin via Teams — ` +
            `they fill Classification, UOM & vendor SKUs on Sheet 1, then bulk-import directly.`
        );
    };

    /**
     * "With Item Master" — same as above plus the full existing active item master as an extra sheet.
     * Useful when the admin needs context about what already exists.
     */
    const downloadWithMasterReference = () => {
        const filledRows = unknownItems.filter(r => r.name.trim());
        if (filledRows.length === 0) {
            notifyError('Add at least one item name before downloading.');
            return;
        }
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, _makeImportSheet(filledRows), 'New Items (Admin Import)');
        XLSX.utils.book_append_sheet(wb, _makeClassSheet(), 'Classification Reference');
        XLSX.utils.book_append_sheet(wb, _makeVendorSheet(), 'Vendor Reference');
        XLSX.utils.book_append_sheet(wb, _makeLocationSheet(), 'Stock Location Reference');
        XLSX.utils.book_append_sheet(wb, _makeMasterSheet(), 'Existing Item Master');

        const date = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `New_Item_Request_With_Reference_${date}.xlsx`);
        notifySuccess(
            `Downloaded with full reference (${items.filter(i => i.isActive !== false).length} existing items + ` +
            `${vendors.filter(v => v.isActive !== false).length} vendors + ` +
            `${locations.filter(l => l.isActive !== false).length} stock locations).`
        );
    };

    const handleViewDetails = async (req) => {
        try {
            setViewingMR(req);
            const res = await inventoryService.getMaterialRequestDetails(req.id || req._id);
            setViewingDetails(res.data);
        } catch (err) {
            notifyError('Failed to load request details.');
        }
    };

    const downloadTemplate = () => {
        // Sheet 1: blank template with two example rows using real item codes where possible
        const examples = items.slice(0, 2).map(i => ({ "Item Code": i.itemCode, "Quantity": 1 }));
        if (examples.length === 0) examples.push({ "Item Code": "ENTER-ITEM-CODE", "Quantity": 1 });
        const templateSheet = XLSX.utils.json_to_sheet(examples);

        // Sheet 2: full item master reference so users can copy-paste exact codes
        const referenceRows = [
            ["Item Code", "Item Name", "Classification", "Package", "UOM"],
            ...items
                .filter(i => i.isActive !== false)
                .map(i => [
                    i.itemCode,
                    i.name,
                    i.classification?.name || i.classificationId?.name || '',
                    i.package || '',
                    i.uom || ''
                ])
        ];
        const referenceSheet = XLSX.utils.aoa_to_sheet(referenceRows);

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, templateSheet, "Request");
        XLSX.utils.book_append_sheet(wb, referenceSheet, "Item Master Reference");
        XLSX.writeFile(wb, "Material_Request_Template.xlsx");
        notifySuccess(`Template downloaded. Use the "Item Master Reference" sheet for valid item codes.`);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);
            await inventoryService.submitMaterialRequest({
                projectId: formData.projectId,
                payload: JSON.stringify(formData.items.map((item, i) => ({
                    rowNumber: i + 1,
                    itemCode: item.itemCode,
                    requiredQuantity: item.quantity
                }))),
                notes: formData.notes
            });
            setShowModal(false);
            // Refresh requests
            await refreshRequests();
            notifySuccess('Material request submitted successfully.');
        } catch (err) {
            notifyError(err.response?.data?.message || 'Submission failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Layout currentPage={currentPage}>
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                        <div>
                            <h1 className="text-3xl md:text-4xl font-bold text-[#556070] tracking-tight mb-2">
                                Material Requests
                            </h1>
                            <p className="text-text-secondary text-lg">
                                Source components for your hardware projects.
                            </p>
                        </div>
                        <button
                            onClick={() => setShowModal(true)}
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-primary text-white font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all"
                        >
                            <span className="material-symbols-outlined">add</span>
                            New Request
                        </button>
                    </div>

                    {/* Request List */}
                    <div className="bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-200 bg-[#ECF1FF]/40">
                            <h2 className="text-lg font-semibold text-[#556070] flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">history</span>
                                Request History
                            </h2>
                        </div>

                        {loading && requests.length === 0 ? (
                            <div className="p-20 text-center">
                                <div className="animate-spin size-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                                <p className="text-text-secondary">Loading your requests...</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-6 py-4 text-xs font-medium uppercase text-text-secondary">Req #</th>
                                            <th className="px-6 py-4 text-xs font-medium uppercase text-text-secondary">Project</th>
                                            <th className="px-6 py-4 text-xs font-medium uppercase text-text-secondary">Items</th>
                                            <th className="px-6 py-4 text-xs font-medium uppercase text-text-secondary">Status</th>
                                            <th className="px-6 py-4 text-xs font-medium uppercase text-text-secondary">Date</th>
                                            <th className="px-6 py-4 text-xs font-medium uppercase text-text-secondary text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-dark">
                                        {requests.map((req) => (
                                            <tr key={req.id || req._id} className="hover:bg-background-dark/30 transition-colors">
                                                <td className="px-6 py-4">
                                                    <button 
                                                        onClick={() => handleViewDetails(req)}
                                                        className="font-mono text-primary text-sm hover:underline hover:text-[#1e293b] transition-all text-left"
                                                    >
                                                        {req.requestNumber}
                                                    </button>
                                                </td>
                                                <td className="px-6 py-4 text-[#556070] font-medium">{req.project?.name}</td>
                                                <td className="px-6 py-4 text-text-secondary">{req._count?.lines || 0} items</td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${req.status === 'SUBMITTED' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                                                            req.status === 'ROUTED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                                                'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                                                        }`}>
                                                        {req.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-text-secondary text-sm">
                                                    {new Date(req.createdAt).toLocaleDateString()}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    {canDeleteRequest(req) ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteRequest(req)}
                                                            disabled={deletingRequestId === (req.id || req._id) || deletePreviewRequestId === (req.id || req._id)}
                                                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                                                        >
                                                            <span className="material-symbols-outlined text-[16px]">delete</span>
                                                            {deletingRequestId === (req.id || req._id)
                                                                ? 'Deleting...'
                                                                : deletePreviewRequestId === (req.id || req._id)
                                                                    ? 'Loading...'
                                                                    : 'Delete'}
                                                        </button>
                                                    ) : (
                                                        <span className="text-xs text-slate-400">Processed</span>
                                                    )}
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

            {/* New Request Modal */}
            {showModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowModal(false)}></div>
                    
                    {/* Modal Container */}
                    <div className="relative bg-white w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl rounded-xl border border-slate-200">
                        {/* Modal Header */}
                        <header className="flex justify-between items-center px-8 py-6 border-b border-slate-200 bg-[#ECF1FF]/50">
                            <div className="flex flex-col text-left">
                                <h1 className="text-2xl font-bold text-[#002045]">Submit Material Request</h1>
                                <p className="text-[11px] text-slate-500 uppercase tracking-widest mt-1 font-medium">Multi-Project Hardware Procurement</p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-[#002045] transition-colors">
                                <span className="material-symbols-outlined text-[28px]">close</span>
                            </button>
                        </header>

                        {/* Modal Content */}
                        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-8 py-6 space-y-8">
                            {/* Summary Section */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="md:col-span-2 text-left">
                                    <label className="text-[12px] font-bold text-slate-500 uppercase mb-2 block">Request Overview</label>
                                    <p className="text-[14px] text-slate-600">Please select a project and specify the components required for procurement. This request will be processed through the central procurement audit trail.</p>
                                </div>
                                <div className="flex flex-col justify-end items-start md:items-end">
                                    <div className="flex items-center gap-4">
                                        <button 
                                            type="button"
                                            onClick={downloadTemplate}
                                            className="text-[#002045] text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 hover:underline"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">download</span>
                                            Template
                                        </button>
                                        <div className="relative">
                                            <input 
                                                type="file" 
                                                accept=".xlsx, .xls" 
                                                onChange={handleBulkUpload}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            />
                                            <button className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 transition-all rounded-lg text-[12px] uppercase font-bold" type="button">
                                                <span className="material-symbols-outlined text-[18px]">upload_file</span>
                                                Bulk Upload CSV
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Project Selection */}
                            <div className="space-y-2 text-left">
                                <label className="text-[12px] font-bold text-slate-500 uppercase block">Target Project</label>
                                <select 
                                    className="w-full md:w-1/2 h-11 px-3 bg-white border border-slate-200 focus:border-[#002045] focus:ring-0 rounded-lg text-[14px] text-slate-800 outline-none"
                                    required
                                    value={formData.projectId}
                                    onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                                >
                                    <option value="">Choose a hardware project...</option>
                                    {projects.map(p => (
                                        <option key={p._id || p.id} value={p._id || p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Item Table */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-[12px] font-bold text-slate-500 uppercase">Component Requirements</h3>
                                        {itemsLoading && (
                                            <span className="flex items-center gap-1 text-[11px] text-slate-400">
                                                <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                                                Refreshing items…
                                            </span>
                                        )}
                                        {!itemsLoading && (
                                            <span className="text-[11px] text-slate-400">{items.length} items available</span>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAddItem}
                                        className="text-[#002045] text-[12px] font-bold uppercase flex items-center gap-1 hover:underline"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">add</span>
                                        Add Row
                                    </button>
                                </div>
                                
                                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-[#ECF1FF]/30 border-b border-slate-200">
                                                <th className="px-4 py-3 text-[12px] font-bold text-slate-600 uppercase">COMPONENT DETAILS</th>
                                                <th className="px-4 py-3 text-[12px] font-bold text-slate-600 uppercase w-32">QTY REQUIRED</th>
                                                <th className="px-4 py-3 text-[12px] font-bold text-slate-600 uppercase w-12 text-center"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {formData.items.map((row, idx) => {
                                                const selectedItem = items.find(i => i.itemCode === row.itemCode);
                                                return (
                                                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="px-4 py-4">
                                                            <div className="flex flex-col gap-1">
                                                                <select
                                                                    className="w-full h-10 px-3 bg-white border border-slate-200 focus:border-[#002045] focus:ring-0 rounded-lg text-[13px] font-medium"
                                                                    value={row.itemCode}
                                                                    onChange={(e) => handleItemChange(idx, 'itemCode', e.target.value)}
                                                                    required
                                                                >
                                                                    <option value="">Select component...</option>
                                                                    {items.map(i => (
                                                                        <option key={i._id || i.id} value={i.itemCode}>
                                                                            [{i.itemCode}] {i.name}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                                {selectedItem && (
                                                                    <div className="px-3 py-1 bg-blue-50/50 rounded text-[11px] text-blue-700 flex items-center gap-2">
                                                                        <span className="material-symbols-outlined text-[14px]">info</span>
                                                                        <span>{selectedItem.classificationId?.name || 'Electronic'} | {selectedItem.package || 'SMD'}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-4">
                                                            <input 
                                                                type="number"
                                                                className="w-full h-10 px-3 bg-white border border-slate-200 focus:border-[#002045] focus:ring-0 rounded-lg text-[13px] font-bold text-center"
                                                                value={row.quantity}
                                                                onChange={(e) => handleItemChange(idx, 'quantity', parseFloat(e.target.value))}
                                                                required
                                                                min="1"
                                                            />
                                                        </td>
                                                        <td className="px-4 py-4 text-center">
                                                            <button 
                                                                type="button"
                                                                onClick={() => {
                                                                    const newItems = formData.items.filter((_, i) => i !== idx);
                                                                    setFormData({ ...formData, items: newItems.length ? newItems : [{ itemCode: '', quantity: 1 }] });
                                                                }}
                                                                className="text-slate-400 hover:text-red-500 transition-colors"
                                                            >
                                                                <span className="material-symbols-outlined text-[20px]">delete</span>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* ── Items Not in System ── */}
                            <div className="space-y-3">
                                <button
                                    type="button"
                                    onClick={() => setShowUnknownPanel(p => !p)}
                                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-dashed border-amber-300 bg-amber-50 hover:bg-amber-100 transition-colors text-left"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-amber-500 text-[20px]">help_outline</span>
                                        <div>
                                            <p className="text-[12px] font-bold text-amber-800 uppercase tracking-wider">Items Not in System?</p>
                                            <p className="text-[11px] text-amber-600 mt-0.5">Can't find a component above? List it here and send a creation request to your Super Admin.</p>
                                        </div>
                                    </div>
                                    <span className={`material-symbols-outlined text-amber-500 text-[18px] transition-transform duration-200 ${showUnknownPanel ? 'rotate-180' : ''}`}>
                                        expand_more
                                    </span>
                                </button>

                                {showUnknownPanel && (
                                    <div className="border border-amber-200 rounded-xl overflow-hidden bg-white shadow-sm">
                                        {/* Panel Header */}
                                        <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
                                            <div>
                                                <p className="text-[12px] font-bold text-amber-800 uppercase tracking-wider">New Item Creation Request</p>
                                                <p className="text-[11px] text-amber-600 mt-0.5">
                                                    Fill in what you know. Download the form and share with your Super Admin — they complete the technical fields and bulk-import directly.
                                                </p>
                                            </div>
                                        </div>

                                        {/* Rows */}
                                        <div className="divide-y divide-amber-50">
                                            {unknownItems.map((row, idx) => (
                                                <div key={idx} className="px-5 py-4 flex gap-3 items-start">
                                                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                                                                Item Name <span className="text-red-500">*</span>
                                                            </label>
                                                            <input
                                                                type="text"
                                                                placeholder="e.g. 100nF 0402 Ceramic Capacitor"
                                                                value={row.name}
                                                                onChange={e => handleUnknownItemChange(idx, 'name', e.target.value)}
                                                                className="w-full h-10 px-3 border border-slate-200 rounded-lg text-[13px] text-slate-700 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200 bg-white"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                                                                Description / Notes
                                                            </label>
                                                            <input
                                                                type="text"
                                                                placeholder="e.g. X5R, 10V, for power supply filter"
                                                                value={row.description}
                                                                onChange={e => handleUnknownItemChange(idx, 'description', e.target.value)}
                                                                className="w-full h-10 px-3 border border-slate-200 rounded-lg text-[13px] text-slate-700 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200 bg-white"
                                                            />
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveUnknownRow(idx)}
                                                        className="mt-6 text-slate-300 hover:text-red-400 transition-colors shrink-0"
                                                    >
                                                        <span className="material-symbols-outlined text-[20px]">delete</span>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Panel Footer */}
                                        <div className="px-5 py-3 bg-amber-50 border-t border-amber-100 flex items-center justify-between gap-3 flex-wrap">
                                            <button
                                                type="button"
                                                onClick={handleAddUnknownRow}
                                                className="text-[12px] font-bold text-amber-700 uppercase flex items-center gap-1 hover:underline"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">add</span>
                                                Add Another Item
                                            </button>

                                            <div className="flex items-center gap-2 flex-wrap justify-end">
                                                {/* Secondary — includes full item master for context */}
                                                <button
                                                    type="button"
                                                    onClick={downloadWithMasterReference}
                                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-amber-400 text-amber-700 bg-white hover:bg-amber-50 text-[11px] font-bold uppercase tracking-wider transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">download</span>
                                                    With Item Master
                                                </button>

                                                {/* Primary — clean, send to admin via Teams */}
                                                <button
                                                    type="button"
                                                    onClick={downloadForAdmin}
                                                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[12px] font-bold uppercase tracking-wider transition-colors shadow-sm"
                                                >
                                                    <span className="material-symbols-outlined text-[15px]">send</span>
                                                    Download for Admin
                                                </button>
                                            </div>
                                        </div>

                                        {/* Workflow note */}
                                        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
                                            <p className="text-[11px] text-slate-500 flex items-start gap-1.5">
                                                <span className="material-symbols-outlined text-[13px] mt-0.5 shrink-0">tips_and_updates</span>
                                                <span>
                                                    <strong>Download for Admin</strong> — clean 2-sheet Excel (new items + classification guide). Forward via Teams to your Super Admin — they fill Classification &amp; UOM and bulk-import directly.{' '}
                                                    <strong>With Item Master</strong> — same plus the full existing item master as a reference sheet.
                                                </span>
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Additional Notes Section */}
                            <div className="space-y-4 text-left">
                                <label className="text-[12px] font-bold text-slate-500 uppercase block">Additional Project Notes</label>
                                <textarea 
                                    className="w-full p-4 bg-white border border-slate-200 focus:border-[#002045] focus:ring-0 rounded-xl text-[14px] text-slate-700 resize-none h-24 outline-none"
                                    placeholder="Briefly state the purpose of this multi-project request (e.g., prototype run for Q3 hardware milestones)..."
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                ></textarea>
                            </div>
                        </form>

                        {/* Modal Footer */}
                        <footer className="px-8 py-6 bg-[#ECF1FF]/20 border-t border-slate-200 flex justify-between items-center">
                            <div className="flex items-center gap-2 text-slate-500">
                                <span className="material-symbols-outlined text-[18px]">info</span>
                                <span className="text-[11px] font-bold uppercase tracking-wider">Procurement Routing: Central Office</span>
                            </div>
                            <div className="flex gap-4">
                                <button 
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="px-6 py-2.5 text-[12px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    onClick={handleSubmit}
                                    disabled={loading}
                                    className="px-8 py-2.5 bg-[#002045] text-white text-[12px] font-bold uppercase tracking-widest rounded-lg hover:shadow-lg transition-all active:scale-95 disabled:opacity-50"
                                >
                                    {loading ? 'Submitting...' : 'Submit Request'}
                                </button>
                            </div>
                        </footer>
                    </div>
                </div>
            )}

            <BulkAddMRItemsModal 
                isOpen={showBulkModal}
                onClose={() => setShowBulkModal(false)}
                requestId={selectedMR?.id || selectedMR?._id}
                requestNumber={selectedMR?.requestNumber}
                onComplete={refreshRequests}
            />

            {/* View Details Modal */}
            {viewingMR && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => { setViewingMR(null); setViewingDetails(null); }}></div>
                    <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-white">Request Details: {viewingMR.requestNumber}</h2>
                                <div className="flex gap-4 mt-1">
                                    <span className="text-xs text-text-secondary flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[14px]">account_tree</span> {viewingMR.project?.name}
                                    </span>
                                    <span className="text-xs text-text-secondary flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[14px]">calendar_today</span> {new Date(viewingMR.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>
                            <button onClick={() => { setViewingMR(null); setViewingDetails(null); }} className="text-text-secondary hover:text-white p-2">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto">
                            {!viewingDetails ? (
                                <div className="py-20 text-center">
                                    <div className="animate-spin size-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                                    <p className="text-text-secondary text-sm">Fetching line items...</p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="bg-background-dark/30 border border-border-dark rounded-xl overflow-hidden">
                                        <table className="w-full text-left text-xs">
                                            <thead className="bg-background-dark/50">
                                                <tr>
                                                    <th className="px-4 py-3 font-bold text-text-secondary uppercase">#</th>
                                                    <th className="px-4 py-3 font-bold text-text-secondary uppercase">Component</th>
                                                    <th className="px-4 py-3 font-bold text-text-secondary uppercase text-center">Required Qty</th>
                                                    <th className="px-4 py-3 font-bold text-text-secondary uppercase text-center">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border-dark">
                                                {viewingDetails.lines?.map((line, idx) => (
                                                    <tr key={line._id || idx} className="hover:bg-white/5 transition-colors">
                                                        <td className="px-4 py-3 text-text-secondary font-mono">{line.rowNumber || idx + 1}</td>
                                                        <td className="px-4 py-3">
                                                            <div className="text-white font-medium">{line.itemId?.name || 'N/A'}</div>
                                                            <div className="text-[10px] text-primary font-mono">{line.itemId?.itemCode || line.itemCode}</div>
                                                        </td>
                                                        <td className="px-4 py-3 text-center text-white font-bold">{line.requiredQuantity}</td>
                                                        <td className="px-4 py-3 text-center">
                                                            <div className="flex flex-col items-center gap-1">
                                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                                                    line.status === 'SUBMITTED' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                                                                    line.status === 'ROUTED_TO_STORE' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                                                                    line.status === 'ROUTED_TO_PURCHASE' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                                                                    'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                                                                }`}>
                                                                    {line.status.replace(/_/g, ' ')}
                                                                </span>
                                                                
                                                                {line.lifecycle?.details && (
                                                                    <div className="text-[10px] text-text-secondary flex flex-col items-center">
                                                                        <span className="font-bold text-white/80">{line.lifecycle.details.label}</span>
                                                                        {line.lifecycle.details.expectedDate && (
                                                                            <span className="text-[9px] text-primary mt-0.5">
                                                                                ETD: {new Date(line.lifecycle.details.expectedDate).toLocaleDateString()}
                                                                            </span>
                                                                        )}
                                                                        {line.lifecycle.details.dispatchNumber && (
                                                                            <span className="text-[9px] text-emerald-400 mt-0.5">
                                                                                Ref: {line.lifecycle.details.dispatchNumber}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    
                                    {viewingDetails.notes && (
                                        <div className="p-4 bg-background-dark/30 border border-border-dark rounded-xl">
                                            <h3 className="text-[10px] font-black uppercase text-text-secondary mb-2 tracking-widest">Notes</h3>
                                            <p className="text-sm text-text-secondary leading-relaxed">{viewingDetails.notes}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        
                        <div className="p-4 border-t border-border-dark bg-background-dark/20 flex justify-end">
                            <button 
                                onClick={() => { setViewingMR(null); setViewingDetails(null); }}
                                className="px-6 py-2 rounded-lg bg-surface-light border border-border-dark text-white font-bold hover:bg-border-dark transition-all text-sm"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <MRDeleteConfirmModal
                isOpen={Boolean(deleteModalRequest)}
                request={deleteModalRequest}
                summary={deleteModalRequest?.deletionSummary}
                confirmValue={deleteConfirmValue}
                onConfirmValueChange={setDeleteConfirmValue}
                onClose={() => closeDeleteModal(false)}
                onDelete={handleConfirmDeepDelete}
                deleting={Boolean(deletingRequestId)}
            />
        </Layout>
    );
}
