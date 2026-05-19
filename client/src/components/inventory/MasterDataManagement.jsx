import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout';
import { useNotifier } from '../common/AppNotificationProvider.jsx';

function buildSkuRow() {
    return {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        vendorId: '',
        sku: ''
    };
}

function formatSkuMappings(item) {
    const mappings = item?.skuMappings || [];
    const values = mappings
        .filter((mapping) => mapping?.sku)
        .map((mapping) => `${mapping.vendorCode || mapping.vendorId?.vendorCode || 'Vendor'}: ${mapping.sku}`);
    return values.length ? values.join(' | ') : '-';
}

function downloadWorkbook(workbook, filename) {
    const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([output], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function BulkItemUploadModal({ isOpen, onClose, classifications, vendors, onUploadSuccess }) {
    const { error: notifyError, success: notifySuccess } = useNotifier();
    const [file, setFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadResults, setUploadResults] = useState(null);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const resetModal = () => {
        setFile(null);
        setUploadResults(null);
        setError('');
        setIsUploading(false);
        onClose();
    };

    const handleDownloadTemplate = () => {
        const baseHeaders = ['Classification', 'Item Code', 'Item Name', 'Package', 'UOM', 'Description'];
        const vendorHeaders = vendors.map((vendor) => vendor.vendorCode);
        const templateHeaders = [...baseHeaders, ...vendorHeaders];

        const sheetData = [
            templateHeaders,
            [
                classifications[0]?.name || '',
                '',
                'RJ45 Connector',
                'RJ47',
                'Nos',
                'Optional description',
                ...vendorHeaders.map(() => '')
            ]
        ];

        const itemsSheet = XLSX.utils.aoa_to_sheet(sheetData);
        const referenceRows = [
            ['Instructions', 'Use classification names exactly as listed below. Vendor-code columns hold vendor SKU values for that item. Leave Item Code blank to auto-generate.'],
            [],
            ['Available Classifications', 'Prefix'],
            ...classifications.map((cls) => [cls.name, cls.prefix]),
            [],
            ['Vendor SKU Columns', 'Vendor Name'],
            ...vendors.map((vendor) => [vendor.vendorCode, vendor.name])
        ];
        const referenceSheet = XLSX.utils.aoa_to_sheet(referenceRows);

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, itemsSheet, 'Items');
        XLSX.utils.book_append_sheet(workbook, referenceSheet, 'Reference');
        downloadWorkbook(workbook, 'Item_Master_Bulk_Upload_Template.xlsx');
    };

    const handleFileChange = (e) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) {
            setFile(null);
            return;
        }

        const valid = /\.(xlsx|xls|csv)$/i.test(selectedFile.name);
        if (!valid) {
            setError('Please select a valid Excel or CSV file.');
            setFile(null);
            return;
        }

        setFile(selectedFile);
        setError('');
    };

    const parseRowsFromFile = async (selectedFile) => {
        const buffer = await selectedFile.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const firstSheet = workbook.Sheets[firstSheetName];
        const jsonRows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

        return jsonRows
            .map((row) => {
                const classificationId = String(row['Classification'] || '').trim();
                const itemCode = String(row['Item Code'] || '').trim();
                const name = String(row['Item Name'] || '').trim();
                const itemPackage = String(row['Package'] || '').trim();
                const uom = String(row['UOM'] || 'Nos').trim() || 'Nos';
                const description = String(row['Description'] || '').trim();
                const skuMappings = vendors
                    .map((vendor) => ({
                        vendorId: vendor._id || vendor.id,
                        vendorCode: vendor.vendorCode,
                        sku: String(row[vendor.vendorCode] || '').trim()
                    }))
                    .filter((mapping) => mapping.sku);

                return {
                    classificationId,
                    itemCode,
                    name,
                    package: itemPackage,
                    uom,
                    description,
                    skuMappings
                };
            })
            .filter((row) => row.classificationId || row.itemCode || row.name || row.package || row.description || row.skuMappings.length > 0);
    };

    const handleUpload = async () => {
        if (!file) return;

        try {
            setIsUploading(true);
            setError('');
            const rows = await parseRowsFromFile(file);
            if (rows.length === 0) {
                setError('The selected file does not contain any item rows.');
                return;
            }

            const res = await inventoryService.bulkImportItems(rows);
            setUploadResults(res.data);
            if ((res.data?.imported || 0) > 0) {
                notifySuccess(`Imported ${res.data.imported} items successfully.`);
                await onUploadSuccess();
            }
        } catch (err) {
            console.error(err);
            const message = err.response?.data?.message || err.message || 'Failed to upload items.';
            setError(message);
            notifyError(message);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" onClick={resetModal}></div>
            <div className="relative bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-slate-200 bg-white flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-[#16325c] flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">upload_file</span>
                        Bulk Item Upload
                    </h2>
                    <button onClick={resetModal} className="text-text-secondary hover:text-[#16325c] transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto max-h-[80vh]">
                    {!uploadResults ? (
                        <div className="space-y-6">
                            <div className="bg-[#f7faff] p-4 rounded-xl border border-slate-200 border-dashed">
                                <h3 className="text-[#16325c] font-medium mb-2 flex items-center gap-2">
                                    <span className="text-primary font-bold">1.</span> Download Template
                                </h3>
                                <p className="text-[#35507a] text-sm mb-4">
                                    Download the Excel template. It includes the base item columns and one SKU column for each vendor code.
                                </p>
                                <button
                                    onClick={handleDownloadTemplate}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-300 text-[#16325c] text-sm font-medium hover:bg-slate-50 transition-all shadow-sm"
                                >
                                    <span className="material-symbols-outlined text-base">download</span>
                                    Download Excel Template
                                </button>
                            </div>

                            <div className="bg-[#f7faff] p-4 rounded-xl border border-slate-200">
                                <h3 className="text-[#16325c] font-medium mb-4 flex items-center gap-2">
                                    <span className="text-primary font-bold">2.</span> Upload Completed File
                                </h3>
                                <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${file ? 'border-primary/50 bg-primary/5' : 'border-slate-300 hover:border-primary/30 bg-white'}`}>
                                    <input
                                        type="file"
                                        id="bulk-item-upload-input"
                                        className="hidden"
                                        accept=".xlsx,.xls,.csv"
                                        onChange={handleFileChange}
                                    />
                                    <label htmlFor="bulk-item-upload-input" className="cursor-pointer">
                                        <span className={`material-symbols-outlined text-4xl mb-2 ${file ? 'text-primary' : 'text-text-secondary'}`}>
                                            {file ? 'task' : 'cloud_upload'}
                                        </span>
                                        {file ? (
                                            <div className="space-y-1">
                                                <p className="text-[#16325c] font-medium">{file.name}</p>
                                                <p className="text-text-secondary text-xs">{(file.size / 1024).toFixed(1)} KB</p>
                                            </div>
                                        ) : (
                                            <div>
                                                <p className="text-[#16325c] font-medium">Click to select Excel/CSV file</p>
                                                <p className="text-text-secondary text-xs mt-1">Supported: .xlsx, .xls, .csv</p>
                                            </div>
                                        )}
                                    </label>
                                </div>
                            </div>

                            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-sm text-[#35507a]">
                                <p className="text-[#16325c] font-medium mb-2">Template columns</p>
                                <p>Classification, Item Code, Item Name, Package, UOM, Description, plus one column for each vendor code.</p>
                            </div>

                            {error && (
                                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
                                    <span className="material-symbols-outlined text-base">error</span>
                                    {error}
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    onClick={resetModal}
                                    className="px-4 py-2 rounded-lg text-[#16325c] font-medium hover:bg-slate-100 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    disabled={!file || isUploading}
                                    onClick={handleUpload}
                                    className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-gradient-primary text-white font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] transition-all"
                                >
                                    {isUploading ? (
                                        <><span className="material-symbols-outlined animate-spin">sync</span>Importing...</>
                                    ) : (
                                        <><span className="material-symbols-outlined">rocket_launch</span>Import Items</>
                                    )}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="text-center py-4">
                                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-500 mb-4">
                                    <span className="material-symbols-outlined text-4xl">check_circle</span>
                                </div>
                                <h3 className="text-xl font-bold text-[#16325c]">Import Complete</h3>
                                <p className="text-text-secondary">Successfully imported {uploadResults.imported || 0} items.</p>
                            </div>

                            {Array.isArray(uploadResults.errors) && uploadResults.errors.length > 0 && (
                                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                                    <h4 className="text-red-400 text-xs font-bold uppercase tracking-wider mb-3">Failed Rows ({uploadResults.errors.length})</h4>
                                    <div className="space-y-2 max-h-56 overflow-y-auto pr-2 custom-scrollbar">
                                        {uploadResults.errors.map((err, idx) => (
                                            <div key={idx} className="flex items-start gap-3 text-sm bg-background-dark/50 p-3 rounded-lg border border-red-500/10">
                                                <div className="bg-red-500/20 text-red-400 px-2 rounded font-bold text-xs mt-0.5">Row {err.row}</div>
                                                <div className="flex-1">
                                                    <p className="text-red-400/80 text-xs">{err.message}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={resetModal}
                                className="w-full py-3 rounded-xl bg-slate-100 border border-slate-300 text-[#16325c] font-bold hover:bg-slate-200 transition-all"
                            >
                                Done
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function MasterDataManagement() {
    const Layout = usePortalLayout();
    const { error: notifyError, success: notifySuccess } = useNotifier();
    const [activeTab, setActiveTab] = useState('items');
    const [items, setItems] = useState([]);
    const [classifications, setClassifications] = useState([]);
    const [locations, setLocations] = useState([]);
    const [vendors, setVendors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    const [itemForm, setItemForm] = useState({
        name: '',
        classificationId: '',
        uom: 'Nos',
        package: '',
        description: ''
    });
    const [itemSkuRows, setItemSkuRows] = useState([buildSkuRow()]);

    const [editItemForm, setEditItemForm] = useState({
        itemCode: '',
        name: '',
        classificationId: '',
        uom: 'Nos',
        package: '',
        description: '',
        isActive: true
    });
    const [editSkuRows, setEditSkuRows] = useState([buildSkuRow()]);

    const [locationForm, setLocationForm] = useState({
        name: '',
        locationCode: '',
        label: ''
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [itemRes, classRes, locRes, vendorRes] = await Promise.all([
                inventoryService.getItems(),
                inventoryService.getClassifications(),
                inventoryService.getLocations(),
                inventoryService.getVendors()
            ]);
            setItems(itemRes.data || []);
            setClassifications(classRes.data || []);
            setLocations(locRes.data || []);
            setVendors(vendorRes.data || []);
        } catch (err) {
            console.error(err);
            notifyError(err.response?.data?.message || 'Failed to load master data');
        } finally {
            setLoading(false);
        }
    };

    const resetItemForm = () => {
        setItemForm({
            name: '',
            classificationId: '',
            uom: 'Nos',
            package: '',
            description: ''
        });
        setItemSkuRows([buildSkuRow()]);
    };

    const syncSkuMappings = async (itemId, rows) => {
        const validRows = rows
            .map((row) => ({
                vendorId: row.vendorId?.trim(),
                sku: row.sku?.trim() || ''
            }))
            .filter((row) => row.vendorId);

        const existingRes = await inventoryService.getItemSkuMappings(itemId);
        const existing = existingRes.data || [];
        const existingByVendor = new Map(existing.map((mapping) => [String(mapping.vendorId?._id || mapping.vendorId), mapping]));
        const incomingVendorIds = new Set(validRows.map((row) => row.vendorId));

        for (const mapping of existing) {
            const vendorId = String(mapping.vendorId?._id || mapping.vendorId);
            if (!incomingVendorIds.has(vendorId)) {
                await inventoryService.deleteVendorSkuMapping(mapping._id || mapping.id);
            }
        }

        for (const row of validRows) {
            const current = existingByVendor.get(row.vendorId);
            if (!current || (current.sku || '') !== row.sku) {
                await inventoryService.createVendorSkuMapping({
                    itemId,
                    vendorId: row.vendorId,
                    sku: row.sku
                });
            }
        }
    };

    const handleCreateItem = async (e) => {
        e.preventDefault();
        try {
            setSubmitting(true);
            const res = await inventoryService.createItem(itemForm);
            const createdItem = res.data;
            await syncSkuMappings(createdItem._id || createdItem.id, itemSkuRows);
            setShowModal(false);
            resetItemForm();
            await fetchData();
            notifySuccess('Item and SKU mappings created successfully.');
        } catch (err) {
            notifyError(err.response?.data?.message || 'Failed to create item');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCreateLocation = async (e) => {
        e.preventDefault();
        try {
            setSubmitting(true);
            await inventoryService.createLocation(locationForm);
            setShowModal(false);
            setLocationForm({ name: '', locationCode: '', label: '' });
            await fetchData();
            notifySuccess('Location created successfully.');
        } catch (err) {
            notifyError(err.response?.data?.message || 'Failed to create location');
        } finally {
            setSubmitting(false);
        }
    };

    const openEditModal = async (item) => {
        try {
            setSubmitting(true);
            const itemId = item._id || item.id;
            const mappingsRes = await inventoryService.getItemSkuMappings(itemId);
            const mappings = mappingsRes.data || [];
            setEditingItem(item);
            setEditItemForm({
                itemCode: item.itemCode || '',
                name: item.name || '',
                classificationId: item.classification?._id || item.classificationId || '',
                uom: item.uom || 'Nos',
                package: item.package || '',
                description: item.description || '',
                isActive: item.isActive !== false
            });
            setEditSkuRows(
                mappings.length
                    ? mappings.map((mapping) => ({
                        id: mapping._id || mapping.id,
                        vendorId: String(mapping.vendorId?._id || mapping.vendorId || ''),
                        sku: mapping.sku || ''
                    }))
                    : [buildSkuRow()]
            );
            setShowEditModal(true);
        } catch (err) {
            notifyError(err.response?.data?.message || 'Failed to load item mappings');
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdateItem = async (e) => {
        e.preventDefault();
        if (!editingItem) return;

        try {
            setSubmitting(true);
            const itemId = editingItem._id || editingItem.id;
            await inventoryService.updateItem(itemId, editItemForm);
            await syncSkuMappings(itemId, editSkuRows);
            setShowEditModal(false);
            setEditingItem(null);
            await fetchData();
            notifySuccess('Item and SKU mappings updated successfully.');
        } catch (err) {
            notifyError(err.response?.data?.message || 'Failed to update item');
        } finally {
            setSubmitting(false);
        }
    };

    const renderSkuEditor = (rows, setRows) => (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-widest">Vendor SKU Mappings</label>
                <button
                    type="button"
                    onClick={() => setRows([...rows, buildSkuRow()])}
                    className="text-xs font-bold text-primary hover:text-white transition-colors"
                >
                    + Add SKU row
                </button>
            </div>
            <div className="space-y-3">
                {rows.map((row, index) => (
                    <div key={row.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                        <div>
                            <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 tracking-widest">Vendor</label>
                            <select
                                className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white outline-none focus:border-primary transition-all"
                                value={row.vendorId}
                                onChange={(e) => {
                                    const next = [...rows];
                                    next[index] = { ...row, vendorId: e.target.value };
                                    setRows(next);
                                }}
                            >
                                <option value="">No vendor mapping</option>
                                {vendors.map((vendor) => (
                                    <option key={vendor._id || vendor.id} value={vendor._id || vendor.id}>
                                        {vendor.vendorCode} - {vendor.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 tracking-widest">SKU</label>
                            <input
                                type="text"
                                className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white outline-none focus:border-primary transition-all"
                                placeholder="Vendor SKU or blank for local"
                                value={row.sku}
                                onChange={(e) => {
                                    const next = [...rows];
                                    next[index] = { ...row, sku: e.target.value };
                                    setRows(next);
                                }}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => setRows(rows.length > 1 ? rows.filter((entry) => entry.id !== row.id) : [buildSkuRow()])}
                            className="h-11 px-3 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                            Remove
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <Layout currentPage="purchase-items">
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                        <div>
                            <h1 className="text-3xl font-bold text-white tracking-tight">Master Data Management</h1>
                            <p className="text-text-secondary text-lg">Define components, warehouses, and vendor SKU mappings.</p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            {activeTab === 'items' && (
                                <button
                                    onClick={() => setShowBulkModal(true)}
                                    className="bg-white border border-slate-300 text-[#16325c] px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
                                >
                                    <span className="material-symbols-outlined">upload_file</span>
                                    Bulk Upload
                                </button>
                            )}
                            <button
                                onClick={() => setShowModal(true)}
                                className="bg-primary text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-primary/20"
                            >
                                <span className="material-symbols-outlined">add</span>
                                Add New {activeTab.slice(0, -1)}
                            </button>
                        </div>
                    </div>

                    <div className="flex gap-2 mb-6 bg-surface-dark p-1 rounded-xl w-fit border border-border-dark">
                        {['items', 'classifications', 'locations'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-6 py-2 rounded-lg text-sm font-bold capitalize transition-all ${activeTab === tab ? 'bg-primary text-white' : 'text-text-secondary hover:text-white'}`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

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
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-text-secondary">Vendor SKUs</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-text-secondary">Status</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-text-secondary">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-dark text-sm">
                                        {items.map((item) => (
                                            <tr key={item._id || item.id} className="hover:bg-primary/5">
                                                <td className="px-6 py-4">
                                                    <div className="text-white font-medium">{item.name}</div>
                                                    <div className="text-primary font-mono text-xs">{item.itemCode}</div>
                                                </td>
                                                <td className="px-6 py-4 text-text-secondary">{item.classification?.name}</td>
                                                <td className="px-6 py-4 text-text-secondary">{item.package || 'N/A'}</td>
                                                <td className="px-6 py-4 text-text-secondary">{item.uom}</td>
                                                <td className="px-6 py-4 text-text-secondary max-w-sm">{formatSkuMappings(item)}</td>
                                                <td className="px-6 py-4 text-text-secondary">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                                        {item.isActive ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <button
                                                        type="button"
                                                        onClick={() => openEditModal(item)}
                                                        className="px-3 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors text-xs font-bold"
                                                    >
                                                        Edit
                                                    </button>
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
                                        {classifications.map((cls) => (
                                            <tr key={cls._id} className="hover:bg-primary/5">
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
                                        {locations.map((loc) => (
                                            <tr key={loc._id} className="hover:bg-primary/5">
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

            {showBulkModal && (
                <BulkItemUploadModal
                    isOpen={showBulkModal}
                    onClose={() => setShowBulkModal(false)}
                    classifications={classifications}
                    vendors={vendors}
                    onUploadSuccess={fetchData}
                />
            )}

            {showModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-background-dark/80 backdrop-blur-sm" onClick={() => setShowModal(false)}></div>
                    <div className="relative w-full max-w-2xl bg-surface-dark border border-border-dark rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-border-dark bg-gradient-surface flex justify-between items-center">
                            <h2 className="text-xl font-bold text-white">Add New {activeTab === 'items' ? 'Item' : activeTab === 'classifications' ? 'Classification' : 'Location'}</h2>
                            <button onClick={() => setShowModal(false)} className="text-text-secondary hover:text-white transition-colors">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <form onSubmit={activeTab === 'items' ? handleCreateItem : activeTab === 'locations' ? handleCreateLocation : (e) => e.preventDefault()} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                            {activeTab === 'items' && (
                                <>
                                    <div>
                                        <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 tracking-widest">Classification</label>
                                        <select
                                            className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white outline-none focus:border-primary transition-all"
                                            value={itemForm.classificationId}
                                            onChange={(e) => setItemForm({ ...itemForm, classificationId: e.target.value })}
                                            required
                                        >
                                            <option value="">Select Category...</option>
                                            {classifications.map((cls) => <option key={cls._id} value={cls._id}>{cls.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 tracking-widest">Item Name</label>
                                        <input
                                            type="text"
                                            className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white outline-none focus:border-primary transition-all"
                                            placeholder="e.g. RJ45 Connectors"
                                            value={itemForm.name}
                                            onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 tracking-widest">Package</label>
                                            <input
                                                type="text"
                                                className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white outline-none focus:border-primary transition-all"
                                                placeholder="0603, SOT-23, optional"
                                                value={itemForm.package}
                                                onChange={(e) => setItemForm({ ...itemForm, package: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 tracking-widest">UOM</label>
                                            <input
                                                type="text"
                                                className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white outline-none focus:border-primary transition-all"
                                                placeholder="Nos, Mtrs, etc."
                                                value={itemForm.uom}
                                                onChange={(e) => setItemForm({ ...itemForm, uom: e.target.value })}
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 tracking-widest">Description</label>
                                        <textarea
                                            className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white outline-none focus:border-primary transition-all h-20 resize-none"
                                            value={itemForm.description}
                                            onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                                        />
                                    </div>
                                    {renderSkuEditor(itemSkuRows, setItemSkuRows)}
                                </>
                            )}

                            {activeTab === 'locations' && (
                                <>
                                    <div>
                                        <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 tracking-widest">Location Name</label>
                                        <input
                                            type="text"
                                            className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white outline-none focus:border-primary transition-all"
                                            placeholder="e.g. Main Warehouse"
                                            value={locationForm.name}
                                            onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 tracking-widest">Location Code (Optional)</label>
                                        <input
                                            type="text"
                                            className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white outline-none focus:border-primary transition-all"
                                            placeholder="e.g. WH-001"
                                            value={locationForm.locationCode}
                                            onChange={(e) => setLocationForm({ ...locationForm, locationCode: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 tracking-widest">Label / Tag</label>
                                        <input
                                            type="text"
                                            className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white outline-none focus:border-primary transition-all"
                                            placeholder="e.g. Storage Area A"
                                            value={locationForm.label}
                                            onChange={(e) => setLocationForm({ ...locationForm, label: e.target.value })}
                                        />
                                    </div>
                                </>
                            )}

                            <div className="pt-4">
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="w-full bg-primary py-3 rounded-xl text-white font-bold shadow-lg shadow-primary/20 hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-50"
                                >
                                    {submitting ? 'Saving...' : `Save ${activeTab.slice(0, -1)}`}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showEditModal && editingItem && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-background-dark/80 backdrop-blur-sm" onClick={() => setShowEditModal(false)}></div>
                    <div className="relative w-full max-w-2xl bg-surface-dark border border-border-dark rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-border-dark bg-gradient-surface flex justify-between items-center">
                            <h2 className="text-xl font-bold text-white">Edit Item</h2>
                            <button onClick={() => setShowEditModal(false)} className="text-text-secondary hover:text-white transition-colors">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <form onSubmit={handleUpdateItem} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                            <div>
                                <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 tracking-widest">Item Code</label>
                                <input
                                    type="text"
                                    className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white outline-none focus:border-primary transition-all"
                                    value={editItemForm.itemCode}
                                    onChange={(e) => setEditItemForm({ ...editItemForm, itemCode: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 tracking-widest">Classification</label>
                                <select
                                    className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white outline-none focus:border-primary transition-all"
                                    value={editItemForm.classificationId}
                                    onChange={(e) => setEditItemForm({ ...editItemForm, classificationId: e.target.value })}
                                    required
                                >
                                    {classifications.map((cls) => <option key={cls._id} value={cls._id}>{cls.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 tracking-widest">Item Name</label>
                                <input
                                    type="text"
                                    className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white outline-none focus:border-primary transition-all"
                                    value={editItemForm.name}
                                    onChange={(e) => setEditItemForm({ ...editItemForm, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 tracking-widest">Package</label>
                                    <input
                                        type="text"
                                        className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white outline-none focus:border-primary transition-all"
                                        value={editItemForm.package}
                                        onChange={(e) => setEditItemForm({ ...editItemForm, package: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 tracking-widest">UOM</label>
                                    <input
                                        type="text"
                                        className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white outline-none focus:border-primary transition-all"
                                        value={editItemForm.uom}
                                        onChange={(e) => setEditItemForm({ ...editItemForm, uom: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 tracking-widest">Description</label>
                                <textarea
                                    className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white outline-none focus:border-primary transition-all h-20 resize-none"
                                    value={editItemForm.description}
                                    onChange={(e) => setEditItemForm({ ...editItemForm, description: e.target.value })}
                                />
                            </div>
                            <label className="flex items-center gap-3 text-white text-sm font-medium">
                                <input
                                    type="checkbox"
                                    checked={editItemForm.isActive}
                                    onChange={(e) => setEditItemForm({ ...editItemForm, isActive: e.target.checked })}
                                    className="accent-primary"
                                />
                                Active
                            </label>
                            {renderSkuEditor(editSkuRows, setEditSkuRows)}
                            <div className="pt-4">
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="w-full bg-primary py-3 rounded-xl text-white font-bold shadow-lg shadow-primary/20 hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-50"
                                >
                                    {submitting ? 'Saving...' : 'Save Item Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
}
