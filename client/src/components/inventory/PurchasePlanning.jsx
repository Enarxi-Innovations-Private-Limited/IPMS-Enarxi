import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout';
import { useNotifier } from '../common/AppNotificationProvider.jsx';

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function tabButtonClass(active) {
    return `px-4 py-2 rounded-lg text-xs font-bold transition-all ${active ? 'bg-primary text-white shadow-lg' : 'text-text-secondary hover:text-white'}`;
}

const reasonLabel = {
    no_sku: 'Needs SKU mapping',
    no_quote: 'No quote returned',
    vendor_unmapped: 'Vendor not mapped',
    cart_failed: 'Cart failed',
    partial_fulfillment: 'Partially fulfilled'
};

function formatMappedSkus(mappings = []) {
    const values = (mappings || [])
        .filter((mapping) => mapping?.sku)
        .map((mapping) => `${mapping.vendorName || mapping.vendorCode || 'Vendor'}: ${mapping.sku}`);
    return values;
}

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const AUTO_QUOTE_STORAGE_KEY = 'purchase-planning-auto-quote-job';

function normalizeVendorDisplayName(value = '') {
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized === 'ELEVTA') return 'EVELTA';
    return normalized;
}

function escapeCsv(value) {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function normalizeText(value) {
    return String(value || '').trim().toUpperCase();
}

function resolveVendorFromCell(rawValue, vendorOptions) {
    const normalized = normalizeText(rawValue);
    if (!normalized) return null;
    return vendorOptions.find((vendor) =>
        normalizeText(vendor.id) === normalized ||
        normalizeText(vendor.code) === normalized ||
        normalizeText(vendor.name) === normalized
    ) || null;
}

export default function PurchasePlanning() {
    const Layout = usePortalLayout();
    const { error: notifyError, success: notifySuccess } = useNotifier();
    const uploadInputRef = useRef(null);
    const [tab, setTab] = useState('individual');
    const [queueRows, setQueueRows] = useState([]);
    const [combinedRows, setCombinedRows] = useState([]);
    const [orders, setOrders] = useState([]);
    const [selectedBatchId, setSelectedBatchId] = useState('');
    const [lineStates, setLineStates] = useState({});
    const [combinedStates, setCombinedStates] = useState({});
    const [vendors, setVendors] = useState([]);
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [analysisSummary, setAnalysisSummary] = useState(null);
    const [analysisJobId, setAnalysisJobId] = useState('');
    const [analysisProgress, setAnalysisProgress] = useState(0);
    const [analysisProgressStatus, setAnalysisProgressStatus] = useState('');
    const restoreJobRef = useRef(false);
    const pendingRestoreRef = useRef(null);

    const persistAutoQuoteJob = (payload) => {
        try {
            window.localStorage.setItem(AUTO_QUOTE_STORAGE_KEY, JSON.stringify(payload));
        } catch (_) {
            // Ignore localStorage failures in private / restricted contexts.
        }
    };

    const clearPersistedAutoQuoteJob = () => {
        try {
            window.localStorage.removeItem(AUTO_QUOTE_STORAGE_KEY);
        } catch (_) {
            // Ignore localStorage failures.
        }
    };

    const readPersistedAutoQuoteJob = () => {
        try {
            const raw = window.localStorage.getItem(AUTO_QUOTE_STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null;
        }
    };

    const fetchData = async () => {
        try {
            setLoading(true);
            const [queueRes, combinedRes, orderRes, vendorRes] = await Promise.all([
                inventoryService.getPurchaseRequestQueue(),
                inventoryService.getCombinedPurchaseDemand(),
                inventoryService.getPurchaseOrders(),
                inventoryService.getVendors()
            ]);
            const queue = queueRes.data || [];
            const selectedFallbackId = selectedBatchId && queue.some((batch) => batch.id === selectedBatchId)
                ? selectedBatchId
                : (queue[0]?.id || '');

            setQueueRows(queue);
            setCombinedRows(combinedRes.data || []);
            setOrders(orderRes.data || []);
            setVendors(vendorRes.data || []);
            setSelectedBatchId(selectedFallbackId);
        } catch (err) {
            notifyError(err.response?.data?.message || 'Failed to load purchase planning data.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const selectedBatch = useMemo(
        () => queueRows.find((batch) => batch.id === selectedBatchId) || null,
        [queueRows, selectedBatchId]
    );

    useEffect(() => {
        if (!selectedBatch) return;
        const next = {};
        (selectedBatch.lines || []).forEach((line) => {
            next[line.purchaseRequestLineId] = {
                selected: false,
                vendorId: '',
                vendorName: '',
                orderQuantity: String(line.pendingQuantity || 0),
                rate: '',
                gstPercent: '18',
                resolved: false,
                reason: '',
                matchedSku: '',
                quoteMeta: null,
                cartStatus: '',
                cartMessage: '',
                cartVendorUrl: '',
                cartAllocatedQty: 0,
                cartUnfulfilledQty: 0,
                cartAllocations: []
            };
        });
        setLineStates(next);
        setAnalysisSummary(null);
    }, [selectedBatch?.id]);

    useEffect(() => {
        const next = {};
        (combinedRows || []).forEach((row) => {
            next[row.itemId] = {
                selected: false,
                vendorId: '',
                vendorName: '',
                orderQuantity: String(row.totalRequiredQuantity || 0),
                rate: '',
                gstPercent: '18',
                resolved: false,
                reason: '',
                matchedSku: '',
                quoteMeta: null,
                cartStatus: '',
                cartMessage: '',
                cartVendorUrl: '',
                cartAllocatedQty: 0,
                cartUnfulfilledQty: 0,
                cartAllocations: []
            };
        });
        setCombinedStates(next);
        setAnalysisSummary(null);
    }, [combinedRows]);

    const individualPayload = useMemo(() => {
        if (!selectedBatch) return [];
        return (selectedBatch.lines || [])
            .filter((line) => lineStates[line.purchaseRequestLineId]?.selected)
            .map((line) => ({
                itemId: line.itemId,
                itemCode: line.itemCode,
                vendorId: lineStates[line.purchaseRequestLineId]?.vendorId || '',
                requestedQuantity: toNumber(line.pendingQuantity),
                orderQuantity: toNumber(lineStates[line.purchaseRequestLineId]?.orderQuantity),
                rate: toNumber(lineStates[line.purchaseRequestLineId]?.rate),
                gstPercent: toNumber(lineStates[line.purchaseRequestLineId]?.gstPercent || 18),
                sourceLines: [{
                    purchaseRequestLineId: line.purchaseRequestLineId,
                    requestedQuantity: toNumber(line.pendingQuantity)
                }],
                resolved: Boolean(lineStates[line.purchaseRequestLineId]?.resolved),
                matchedSku: lineStates[line.purchaseRequestLineId]?.matchedSku || '',
                quoteMeta: lineStates[line.purchaseRequestLineId]?.quoteMeta || null,
                cartStatus: lineStates[line.purchaseRequestLineId]?.cartStatus || '',
                cartMessage: lineStates[line.purchaseRequestLineId]?.cartMessage || '',
                cartVendorUrl: lineStates[line.purchaseRequestLineId]?.cartVendorUrl || '',
                cartAllocatedQty: toNumber(lineStates[line.purchaseRequestLineId]?.cartAllocatedQty),
                cartUnfulfilledQty: toNumber(lineStates[line.purchaseRequestLineId]?.cartUnfulfilledQty),
                cartAllocations: lineStates[line.purchaseRequestLineId]?.cartAllocations || []
            }));
    }, [selectedBatch, lineStates]);

    const combinedPayload = useMemo(
        () =>
            (combinedRows || [])
                .filter((row) => combinedStates[row.itemId]?.selected)
                .map((row) => ({
                    itemId: row.itemId,
                    itemCode: row.itemCode,
                    vendorId: combinedStates[row.itemId]?.vendorId || '',
                    requestedQuantity: toNumber(row.totalRequiredQuantity),
                    orderQuantity: toNumber(combinedStates[row.itemId]?.orderQuantity),
                    rate: toNumber(combinedStates[row.itemId]?.rate),
                    gstPercent: toNumber(combinedStates[row.itemId]?.gstPercent || 18),
                    sourceLines: (row.requestLines || []).map((entry) => ({
                        purchaseRequestLineId: entry.purchaseRequestLineId,
                        requestedQuantity: toNumber(entry.quantity)
                    })),
                    resolved: Boolean(combinedStates[row.itemId]?.resolved),
                    matchedSku: combinedStates[row.itemId]?.matchedSku || '',
                    quoteMeta: combinedStates[row.itemId]?.quoteMeta || null,
                    cartStatus: combinedStates[row.itemId]?.cartStatus || '',
                    cartMessage: combinedStates[row.itemId]?.cartMessage || '',
                    cartVendorUrl: combinedStates[row.itemId]?.cartVendorUrl || '',
                    cartAllocatedQty: toNumber(combinedStates[row.itemId]?.cartAllocatedQty),
                    cartUnfulfilledQty: toNumber(combinedStates[row.itemId]?.cartUnfulfilledQty),
                    cartAllocations: combinedStates[row.itemId]?.cartAllocations || []
                })),
        [combinedRows, combinedStates]
    );

    const activePayload = tab === 'combined' ? combinedPayload : individualPayload;

    const vendorOptions = useMemo(
        () => (vendors || []).map((vendor) => ({
            id: vendor._id || vendor.id,
            name: vendor.name || vendor.vendorName || '',
            code: vendor.vendorCode || ''
        })),
        [vendors]
    );

    const selectedIndividualLines = useMemo(
        () => (selectedBatch?.lines || []).filter((line) => lineStates[line.purchaseRequestLineId]?.selected),
        [selectedBatch, lineStates]
    );

    const selectedCombinedRows = useMemo(
        () => (combinedRows || []).filter((row) => combinedStates[row.itemId]?.selected),
        [combinedRows, combinedStates]
    );

    const unresolvedBlocking = useMemo(
        () => activePayload.filter((line) => {
            const hasCartAllocations = Array.isArray(line.cartAllocations) && line.cartAllocations.length > 0;
            const manualReady = Boolean(line.vendorId) && line.rate > 0 && Boolean(line.matchedSku);
            return (
                (!line.resolved && !manualReady) ||
                (!manualReady && line.cartStatus !== 'VERIFIED') ||
                (!manualReady && line.cartUnfulfilledQty > 0) ||
                (!hasCartAllocations && !manualReady)
            );
        }),
        [activePayload]
    );

    const canGenerate = activePayload.length > 0 && unresolvedBlocking.length === 0 && !generating;

    const updateIndividualState = (lineId, patch) => {
        setLineStates((prev) => ({
            ...prev,
            [lineId]: { ...(prev[lineId] || {}), ...patch }
        }));
    };

    const updateCombinedState = (itemId, patch) => {
        setCombinedStates((prev) => ({
            ...prev,
            [itemId]: { ...(prev[itemId] || {}), ...patch }
        }));
    };

    const handleManualVendorChange = (mode, key, vendorId) => {
        const vendor = vendorOptions.find((entry) => String(entry.id) === String(vendorId));
        const patch = {
            vendorId,
            vendorName: vendor?.name || '',
            resolved: false,
            reason: '',
            cartStatus: '',
            cartMessage: '',
            cartAllocatedQty: 0,
            cartUnfulfilledQty: 0,
            cartAllocations: []
        };
        if (mode === 'individual') {
            updateIndividualState(key, patch);
            return;
        }
        updateCombinedState(key, patch);
    };

    const handleDownloadRequest = () => {
        const rows = tab === 'individual'
            ? (selectedBatch?.lines || []).map((line) => {
                const state = lineStates[line.purchaseRequestLineId] || {};
                return {
                    request: selectedBatch?.batchNumber || '',
                    itemCode: line.itemCode || '',
                    itemName: line.itemName || '',
                    pendingQuantity: line.pendingQuantity || 0,
                    vendor: state.vendorName || '',
                    rate: state.rate || '',
                    sku: state.matchedSku || formatMappedSkus(line.skuMappings).join(' | ')
                };
            })
            : (combinedRows || []).map((row) => {
                const state = combinedStates[row.itemId] || {};
                return {
                    request: 'COMBINED',
                    itemCode: row.itemCode || '',
                    itemName: row.itemName || '',
                    pendingQuantity: row.totalRequiredQuantity || 0,
                    vendor: state.vendorName || '',
                    rate: state.rate || '',
                    sku: state.matchedSku || formatMappedSkus(row.skuMappings).join(' | ')
                };
            });

        if (!rows.length) {
            notifyError('No request rows available to download.');
            return;
        }

        const header = ['Request', 'Item Code', 'Item Name', 'Pending Quantity', 'Vendor', 'Rate', 'SKU'];
        const csv = [
            header.join(','),
            ...rows.map((row) => [
                escapeCsv(row.request),
                escapeCsv(row.itemCode),
                escapeCsv(row.itemName),
                escapeCsv(row.pendingQuantity),
                escapeCsv(row.vendor),
                escapeCsv(row.rate),
                escapeCsv(row.sku)
            ].join(','))
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = tab === 'individual'
            ? `${selectedBatch?.batchNumber || 'purchase-request'}.csv`
            : 'combined-demand.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    const handleOpenUpload = () => {
        uploadInputRef.current?.click();
    };

    const handleUploadRequestSheet = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

            if (!Array.isArray(rows) || rows.length === 0) {
                notifyError('The uploaded file does not contain any rows.');
                return;
            }

            let updatedCount = 0;

            if (tab === 'individual') {
                const lineByItemCode = new Map((selectedBatch?.lines || []).map((line) => [normalizeText(line.itemCode), line]));
                setLineStates((prev) => {
                    const next = { ...prev };
                    rows.forEach((row) => {
                        const line = lineByItemCode.get(normalizeText(row['Item Code'] || row['ITEM CODE']));
                        if (!line) return;
                        const vendor = resolveVendorFromCell(
                            row['Vendor'] || row['Vendor Name'] || row['Vendor Code'] || row['VENDOR'],
                            vendorOptions
                        );
                        const rate = String(row['Rate'] || row['RATE'] || '').trim();
                        const matchedSku = String(row['SKU'] || row['Matched SKU'] || row['Vendor SKU'] || '').trim();
                        const orderQuantity = String(row['Order Quantity'] || row['Pending Quantity'] || '').trim();
                        next[line.purchaseRequestLineId] = {
                            ...next[line.purchaseRequestLineId],
                            selected: true,
                            vendorId: vendor?.id || next[line.purchaseRequestLineId]?.vendorId || '',
                            vendorName: vendor?.name || next[line.purchaseRequestLineId]?.vendorName || '',
                            rate: rate || next[line.purchaseRequestLineId]?.rate || '',
                            matchedSku: matchedSku || next[line.purchaseRequestLineId]?.matchedSku || '',
                            orderQuantity: orderQuantity || next[line.purchaseRequestLineId]?.orderQuantity || '',
                            resolved: false,
                            reason: '',
                            cartStatus: '',
                            cartMessage: '',
                            cartUnfulfilledQty: 0,
                            cartAllocations: []
                        };
                        updatedCount += 1;
                    });
                    return next;
                });
            } else {
                const rowByItemCode = new Map((combinedRows || []).map((row) => [normalizeText(row.itemCode), row]));
                setCombinedStates((prev) => {
                    const next = { ...prev };
                    rows.forEach((sheetRow) => {
                        const demandRow = rowByItemCode.get(normalizeText(sheetRow['Item Code'] || sheetRow['ITEM CODE']));
                        if (!demandRow) return;
                        const vendor = resolveVendorFromCell(
                            sheetRow['Vendor'] || sheetRow['Vendor Name'] || sheetRow['Vendor Code'] || sheetRow['VENDOR'],
                            vendorOptions
                        );
                        const rate = String(sheetRow['Rate'] || sheetRow['RATE'] || '').trim();
                        const matchedSku = String(sheetRow['SKU'] || sheetRow['Matched SKU'] || sheetRow['Vendor SKU'] || '').trim();
                        const orderQuantity = String(sheetRow['Order Quantity'] || sheetRow['Pending Quantity'] || '').trim();
                        next[demandRow.itemId] = {
                            ...next[demandRow.itemId],
                            selected: true,
                            vendorId: vendor?.id || next[demandRow.itemId]?.vendorId || '',
                            vendorName: vendor?.name || next[demandRow.itemId]?.vendorName || '',
                            rate: rate || next[demandRow.itemId]?.rate || '',
                            matchedSku: matchedSku || next[demandRow.itemId]?.matchedSku || '',
                            orderQuantity: orderQuantity || next[demandRow.itemId]?.orderQuantity || '',
                            resolved: false,
                            reason: '',
                            cartStatus: '',
                            cartMessage: '',
                            cartUnfulfilledQty: 0,
                            cartAllocations: []
                        };
                        updatedCount += 1;
                    });
                    return next;
                });
            }

            if (!updatedCount) {
                notifyError('No matching item codes were found in the uploaded file.');
                return;
            }

            notifySuccess(`Imported pricing details for ${updatedCount} line(s).`);
        } catch (err) {
            notifyError(err.message || 'Failed to import the uploaded Excel/CSV file.');
        }
    };

    const applyPartialProgress = (partialItems = []) => {
        if (!Array.isArray(partialItems) || partialItems.length === 0) return;

        const byLineId = new Map();
        const byItemId = new Map();
        partialItems.forEach((entry) => {
            if (entry?.lineId) byLineId.set(String(entry.lineId), entry);
            if (entry?.itemId) byItemId.set(String(entry.itemId), entry);
        });

        if (tab === 'individual') {
            setLineStates((prev) => {
                const next = { ...prev };
                selectedIndividualLines.forEach((line) => {
                    const partial = byLineId.get(String(line.purchaseRequestLineId));
                    if (!partial) return;
                    const bestVendor = normalizeVendorDisplayName(partial.best_vendor || partial.allocations?.[0]?.vendor || '');
                    const bestRate = partial.best_price ? String(partial.best_price).replace(/^₹/, '') : '';
                    next[line.purchaseRequestLineId] = {
                        ...next[line.purchaseRequestLineId],
                        selected: true,
                        vendorName: bestVendor || next[line.purchaseRequestLineId]?.vendorName || '',
                        rate: bestRate || next[line.purchaseRequestLineId]?.rate || '',
                        matchedSku: next[line.purchaseRequestLineId]?.matchedSku || '',
                        cartStatus: next[line.purchaseRequestLineId]?.cartStatus || 'PROCESSING',
                        cartMessage: next[line.purchaseRequestLineId]?.cartMessage || 'Pricing captured. Cart automation in progress...'
                    };
                });
                return next;
            });
            return;
        }

        setCombinedStates((prev) => {
            const next = { ...prev };
            selectedCombinedRows.forEach((row) => {
                const partial = byItemId.get(String(row.itemId));
                if (!partial) return;
                const bestVendor = normalizeVendorDisplayName(partial.best_vendor || partial.allocations?.[0]?.vendor || '');
                const bestRate = partial.best_price ? String(partial.best_price).replace(/^₹/, '') : '';
                next[row.itemId] = {
                    ...next[row.itemId],
                    selected: true,
                    vendorName: bestVendor || next[row.itemId]?.vendorName || '',
                    rate: bestRate || next[row.itemId]?.rate || '',
                    cartStatus: next[row.itemId]?.cartStatus || 'PROCESSING',
                    cartMessage: next[row.itemId]?.cartMessage || 'Pricing captured. Cart automation in progress...'
                };
            });
            return next;
        });
    };

    const applyAutoQuoteResults = (mode, resultRows = [], summary = null, selectedLineIds = []) => {
        setAnalysisSummary(summary || null);
        const selectedIdSet = new Set((selectedLineIds || []).map(String));

        if (mode === 'individual') {
            const byLine = new Map((resultRows || []).map((entry) => [String(entry.lineId), entry]));
            setLineStates((prev) => {
                const next = { ...prev };
                Object.keys(next).forEach((lineId) => {
                    if (selectedIdSet.has(String(lineId))) {
                        next[lineId] = {
                            ...next[lineId],
                            selected: true
                        };
                    }
                });
                byLine.forEach((quoted, lineId) => {
                    next[lineId] = {
                        ...(next[lineId] || {}),
                        selected: true,
                        resolved: Boolean(quoted.resolved),
                        reason: quoted.reason || '',
                        vendorId: quoted.vendorId || '',
                        vendorName: quoted.vendorName || '',
                        rate: quoted.rate ? String(quoted.rate) : '',
                        matchedSku: quoted.matchedSku || '',
                        quoteMeta: quoted.quoteMeta || null,
                        cartStatus: quoted.cartStatus || '',
                        cartMessage: quoted.cartMessage || '',
                        cartVendorUrl: quoted.cartVendorUrl || '',
                        cartAllocatedQty: toNumber(quoted.cartAllocatedQty),
                        cartUnfulfilledQty: toNumber(quoted.cartUnfulfilledQty),
                        cartAllocations: quoted.cartAllocations || []
                    };
                });
                return next;
            });
            return;
        }

        const byLine = new Map((resultRows || []).map((entry) => [String(entry.lineId), entry]));
        setCombinedStates((prev) => {
            const next = { ...prev };
            (combinedRows || []).forEach((row) => {
                const rowResults = (row.requestLines || [])
                    .filter((entry) => selectedIdSet.has(String(entry.purchaseRequestLineId)))
                    .map((entry) => byLine.get(String(entry.purchaseRequestLineId)))
                    .filter(Boolean);
                if (!rowResults.length) return;

                const unresolved = rowResults.find((entry) => !entry.resolved);
                const resolved = rowResults.find((entry) => entry.resolved);

                if (unresolved || !resolved) {
                    next[row.itemId] = {
                        ...(next[row.itemId] || {}),
                        selected: true,
                        resolved: false,
                        reason: unresolved?.reason || 'no_quote',
                        vendorId: '',
                        vendorName: '',
                        rate: '',
                        matchedSku: '',
                        quoteMeta: null,
                        cartStatus: unresolved?.cartStatus || 'FAILED',
                        cartMessage: unresolved?.cartMessage || '',
                        cartVendorUrl: unresolved?.cartVendorUrl || '',
                        cartAllocatedQty: toNumber(unresolved?.cartAllocatedQty),
                        cartUnfulfilledQty: toNumber(unresolved?.cartUnfulfilledQty),
                        cartAllocations: unresolved?.cartAllocations || []
                    };
                    return;
                }

                next[row.itemId] = {
                    ...(next[row.itemId] || {}),
                    selected: true,
                    resolved: true,
                    reason: '',
                    vendorId: resolved.vendorId || '',
                    vendorName: resolved.vendorName || '',
                    rate: resolved.rate ? String(resolved.rate) : '',
                    matchedSku: resolved.matchedSku || '',
                    quoteMeta: resolved.quoteMeta || null,
                    cartStatus: resolved.cartStatus || 'VERIFIED',
                    cartMessage: resolved.cartMessage || '',
                    cartVendorUrl: resolved.cartVendorUrl || '',
                    cartAllocatedQty: toNumber(resolved.cartAllocatedQty),
                    cartUnfulfilledQty: toNumber(resolved.cartUnfulfilledQty),
                    cartAllocations: resolved.cartAllocations || []
                };
            });
            return next;
        });
    };

    const monitorAutoQuoteJob = async (jobId, mode, selectedLineIds = [], { keepCompletedState = true } = {}) => {
        setAnalyzing(true);
        setAnalysisJobId(jobId);

        while (true) {
            await sleep(1500);
            const statusResponse = await inventoryService.getAutoQuotePurchasePlanningStatus(jobId);
            const job = statusResponse.data || {};

            setAnalysisProgress(toNumber(job.progress));
            setAnalysisProgressStatus(job.progressStatus || 'Processing BOM...');
            applyPartialProgress(job.partialItems || []);

            if (job.status === 'FAILED') {
                clearPersistedAutoQuoteJob();
                const error = new Error(job.error?.message || 'Failed to analyze selected lines with BOM.');
                error.detail = job.error?.detail || '';
                throw error;
            }

            if (job.status === 'COMPLETED') {
                const finalPayload = job.result || {};
                applyAutoQuoteResults(mode, finalPayload.results || [], finalPayload.summary || null, selectedLineIds);
                if (keepCompletedState) {
                    persistAutoQuoteJob({
                        jobId,
                        tab: mode,
                        batchId: mode === 'individual' ? selectedBatchId : null,
                        lineIds: selectedLineIds
                    });
                }
                setAnalyzing(false);
                setAnalysisJobId('');
                return finalPayload;
            }
        }
    };

    const handleAnalyzeWithBom = async () => {
        const lineIds = tab === 'individual'
            ? selectedIndividualLines.map((line) => line.purchaseRequestLineId)
            : selectedCombinedRows.flatMap((row) => (row.requestLines || []).map((entry) => entry.purchaseRequestLineId));

        if (!lineIds.length) {
            notifyError('Select at least one line before BOM analysis.');
            return;
        }

        try {
            setAnalyzing(true);
            setAnalysisJobId('');
            setAnalysisProgress(0);
            setAnalysisProgressStatus('Queued BOM analysis...');

            const startResponse = await inventoryService.startAutoQuotePurchasePlanning({
                batchId: tab === 'individual' ? selectedBatchId : null,
                lineIds
            });
            const jobId = startResponse.data?.jobId;
            if (!jobId) {
                throw new Error('BOM analysis job could not be started.');
            }

            persistAutoQuoteJob({
                jobId,
                tab,
                batchId: tab === 'individual' ? selectedBatchId : null,
                lineIds
            });

            const finalPayload = await monitorAutoQuoteJob(jobId, tab, lineIds);
            const unresolvedCount = toNumber(finalPayload?.summary?.unresolved || 0);
            if (unresolvedCount > 0) {
                notifyError(`BOM analysis and cart automation completed with ${unresolvedCount} blocked line(s). Review cart/SKU/vendor issues and retry.`);
            } else {
                notifySuccess('BOM analysis and cart automation completed. Final vendor, rate, and SKU were verified.');
            }
        } catch (err) {
            const detail = err.detail || err.response?.data?.detail;
            const message = err.response?.data?.message || err.message || 'Failed to analyze selected lines with BOM.';
            notifyError(detail ? `${message} ${detail}` : message);
        } finally {
            setAnalyzing(false);
            setAnalysisJobId('');
        }
    };

    useEffect(() => {
        if (loading || restoreJobRef.current) return;
        const saved = readPersistedAutoQuoteJob();
        if (!saved?.jobId || !Array.isArray(saved.lineIds) || saved.lineIds.length === 0) {
            restoreJobRef.current = true;
            return;
        }

        restoreJobRef.current = true;
        pendingRestoreRef.current = saved;

        if (saved.tab === 'individual' && saved.batchId) {
            setTab('individual');
            setSelectedBatchId(saved.batchId);
            return;
        }

        if (saved.tab === 'combined') {
            setTab('combined');
        }
    }, [loading]);

    useEffect(() => {
        const saved = pendingRestoreRef.current;
        if (!saved) return;

        const applyRestore = async () => {
            try {
                const statusResponse = await inventoryService.getAutoQuotePurchasePlanningStatus(saved.jobId);
                const job = statusResponse.data || {};
                setAnalysisProgress(toNumber(job.progress));
                setAnalysisProgressStatus(job.progressStatus || 'Processing BOM...');

                if (saved.tab === 'individual') {
                    if (!selectedBatch || selectedBatch.id !== saved.batchId) return;
                    setLineStates((prev) => {
                        const next = { ...prev };
                        saved.lineIds.forEach((lineId) => {
                            next[lineId] = {
                                ...(next[lineId] || {}),
                                selected: true
                            };
                        });
                        return next;
                    });
                } else {
                    setCombinedStates((prev) => {
                        const next = { ...prev };
                        (combinedRows || []).forEach((row) => {
                            const matches = (row.requestLines || []).some((entry) => saved.lineIds.includes(entry.purchaseRequestLineId));
                            if (matches) {
                                next[row.itemId] = {
                                    ...(next[row.itemId] || {}),
                                    selected: true
                                };
                            }
                        });
                        return next;
                    });
                }

                applyPartialProgress(job.partialItems || []);

                if (job.status === 'COMPLETED') {
                    applyAutoQuoteResults(saved.tab, job.result?.results || [], job.result?.summary || null, saved.lineIds);
                } else if (job.status === 'RUNNING') {
                    await monitorAutoQuoteJob(saved.jobId, saved.tab, saved.lineIds, { keepCompletedState: true });
                } else if (job.status === 'FAILED') {
                    clearPersistedAutoQuoteJob();
                } else if (job.status === 'NOT_FOUND' || job.message === 'BOM analysis job not found.') {
                    clearPersistedAutoQuoteJob();
                }
            } catch (err) {
                if (err.response?.status === 404) {
                    clearPersistedAutoQuoteJob();
                }
            } finally {
                pendingRestoreRef.current = null;
            }
        };

        applyRestore();
    }, [selectedBatch?.id, combinedRows]);

    const handleGenerate = async () => {
        if (!activePayload.length) {
            notifyError('Select at least one line to generate purchase orders.');
            return;
        }
        if (unresolvedBlocking.length > 0) {
            notifyError('Complete BOM/cart validation or fill vendor, rate, and SKU manually for every selected line before PO generation.');
            return;
        }

        try {
            setGenerating(true);
            await inventoryService.generatePurchaseOrders({ payload: activePayload, notes });
            clearPersistedAutoQuoteJob();
            notifySuccess('Vendor purchase orders generated successfully.');
            setNotes('');
            await fetchData();
            setTab('generated');
        } catch (err) {
            notifyError(err.response?.data?.message || 'Failed to generate purchase orders.');
        } finally {
            setGenerating(false);
        }
    };

    const handleDownloadPdf = async (poId, poNumber) => {
        try {
            const response = await inventoryService.downloadPurchaseOrderPDF(poId);
            const blobUrl = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
            window.open(blobUrl, '_blank', 'noopener,noreferrer');
            notifySuccess(`Opened PDF for ${poNumber}.`);
        } catch (err) {
            notifyError(err.response?.data?.message || 'Failed to download PO PDF.');
        }
    };

    return (
        <Layout currentPage="purchase-requests">
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
                        <div>
                            <h1 className="text-3xl font-bold text-[#556070] tracking-tight">Purchase Requests</h1>
                            <p className="text-text-secondary">Process individual PRQ demand or merged combined demand and generate vendor POs.</p>
                        </div>
                        <div className="flex bg-background-dark/50 p-1 rounded-xl border border-border-dark">
                            <button onClick={() => setTab('individual')} className={tabButtonClass(tab === 'individual')}>Individual PRQ</button>
                            <button onClick={() => setTab('combined')} className={tabButtonClass(tab === 'combined')}>Combined Demand</button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="p-20 text-center">
                            <div className="animate-spin size-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
                        </div>
                    ) : (
                        <>
                            {(tab === 'individual' || tab === 'combined') && (
                                <div className="mb-4 flex flex-wrap gap-3">
                                    <input
                                        ref={uploadInputRef}
                                        type="file"
                                        accept=".xlsx,.xls,.csv"
                                        onChange={handleUploadRequestSheet}
                                        className="hidden"
                                    />
                                    <button
                                        onClick={handleAnalyzeWithBom}
                                        disabled={analyzing}
                                        className="bg-primary/90 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-primary/20 disabled:opacity-50 transition-all active:scale-95"
                                    >
                                        {analyzing ? 'Analyzing BOM...' : 'Analyze with BOM'}
                                    </button>
                                    <button
                                        onClick={handleOpenUpload}
                                        className="bg-white border border-slate-300 text-[#556070] px-6 py-3 rounded-xl font-bold shadow-sm transition-all active:scale-95"
                                    >
                                        Upload Price Sheet
                                    </button>
                                    <button
                                        onClick={handleDownloadRequest}
                                        className="bg-white border border-slate-300 text-[#556070] px-6 py-3 rounded-xl font-bold shadow-sm transition-all active:scale-95"
                                    >
                                        Download Request
                                    </button>
                                    <button
                                        onClick={handleGenerate}
                                        disabled={!canGenerate}
                                        className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-emerald-500/20 disabled:opacity-50 transition-all active:scale-95"
                                    >
                                        {generating ? 'Generating...' : 'Generate Vendor POs'}
                                    </button>
                                </div>
                            )}

                            {analyzing && (
                                <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                                    <div className="flex items-center justify-between gap-3 mb-2">
                                        <p className="text-sm font-semibold text-[#556070]">BOM analysis in progress</p>
                                        <span className="text-xs font-bold text-primary">{Math.min(100, Math.max(0, Math.round(analysisProgress)))}%</span>
                                    </div>
                                    <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
                                        <div
                                            className="h-full bg-primary transition-all duration-500"
                                            style={{ width: `${Math.min(100, Math.max(3, analysisProgress || 3))}%` }}
                                        />
                                    </div>
                                    <div className="mt-2 flex items-center justify-between gap-3">
                                        <p className="text-xs text-text-secondary">{analysisProgressStatus || 'Preparing BOM job...'}</p>
                                        {analysisJobId && <p className="text-[11px] text-slate-400">Job: {analysisJobId.slice(0, 8)}</p>}
                                    </div>
                                </div>
                            )}

                            {analysisSummary && (
                                <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#556070]">
                                    BOM Summary: {analysisSummary.resolved}/{analysisSummary.total} resolved
                                    {analysisSummary.unresolved > 0 ? `, ${analysisSummary.unresolved} unresolved` : ''}
                                </div>
                            )}

                            {tab === 'individual' && (
                                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                                    <div className="xl:col-span-1 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
                                        <div className="px-4 py-3 border-b border-slate-200 bg-[#ECF1FF]/40 text-[#556070] font-semibold">
                                            Individual Request Queue
                                        </div>
                                        <div className="max-h-[600px] overflow-y-auto">
                                            {queueRows.map((batch) => (
                                                <button
                                                    key={batch.id}
                                                    type="button"
                                                    onClick={() => setSelectedBatchId(batch.id)}
                                                    className={`w-full text-left px-4 py-4 border-b border-slate-100 transition ${selectedBatchId === batch.id ? 'bg-primary/10' : 'hover:bg-slate-50'}`}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <p className="font-bold text-[#556070]">{batch.batchNumber}</p>
                                                        <span className="text-[10px] px-2 py-1 rounded bg-slate-100 text-text-secondary">{batch.status}</span>
                                                    </div>
                                                    <p className="text-xs text-text-secondary mt-1">{batch.materialRequestNumber} • {batch.projectName}</p>
                                                    <p className="text-xs text-text-secondary mt-1">{batch.lineCount} lines • Remaining {batch.remainingQuantity}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
                                        <div className="px-4 py-3 border-b border-slate-200 bg-[#ECF1FF]/40">
                                            <p className="text-[#556070] font-semibold">{selectedBatch?.batchNumber || 'Select a PRQ'}</p>
                                            <p className="text-xs text-text-secondary mt-1">{selectedBatch?.materialRequestNumber || ''} {selectedBatch?.projectName ? `• ${selectedBatch.projectName}` : ''}</p>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left">
                                                <thead className="bg-slate-50">
                                                    <tr>
                                                        <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary">Sel</th>
                                                        <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary">Item</th>
                                                        <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary text-center">Pending</th>
                                                        <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary">Vendor</th>
                                                        <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary text-right">Rate</th>
                                                        <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary">SKU</th>
                                                        <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary">Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-border-dark">
                                                    {(selectedBatch?.lines || []).map((line) => {
                                                        const state = lineStates[line.purchaseRequestLineId] || {};
                                                        return (
                                                            <tr key={line.purchaseRequestLineId} className="hover:bg-slate-50">
                                                                <td className="px-4 py-3">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={state.selected || false}
                                                                        onChange={(e) => updateIndividualState(line.purchaseRequestLineId, { selected: e.target.checked })}
                                                                        className="accent-primary"
                                                                    />
                                                                </td>
                                                                <td className="px-4 py-3 text-[#556070]">
                                                                    <p className="font-semibold">{line.itemCode}</p>
                                                                    <p className="text-xs text-text-secondary">{line.itemName}</p>
                                                                    {!state.matchedSku && formatMappedSkus(line.skuMappings).length > 0 && (
                                                                        <div className="mt-1 space-y-1">
                                                                            {formatMappedSkus(line.skuMappings).slice(0, 3).map((text) => (
                                                                                <p key={text} className="text-[11px] text-slate-500">{text}</p>
                                                                            ))}
                                                                            {formatMappedSkus(line.skuMappings).length > 3 && (
                                                                                <p className="text-[11px] text-slate-400">+{formatMappedSkus(line.skuMappings).length - 3} more</p>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-3 text-center">
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        value={state.orderQuantity || ''}
                                                                        onChange={(e) => updateIndividualState(line.purchaseRequestLineId, {
                                                                            orderQuantity: e.target.value,
                                                                            cartStatus: '',
                                                                            cartMessage: '',
                                                                            cartAllocatedQty: 0,
                                                                            cartUnfulfilledQty: 0,
                                                                            cartAllocations: []
                                                                        })}
                                                                        className="w-20 text-center bg-slate-50 border border-slate-200 rounded px-1 py-1 font-semibold text-[#556070] focus:border-primary outline-none"
                                                                    />
                                                                </td>
                                                                <td className="px-4 py-3 text-[#556070] text-sm">
                                                                    <select
                                                                        value={state.vendorId || ''}
                                                                        onChange={(e) => handleManualVendorChange('individual', line.purchaseRequestLineId, e.target.value)}
                                                                        className="w-44 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[#556070] focus:border-primary outline-none"
                                                                    >
                                                                        <option value="">Select vendor</option>
                                                                        {vendorOptions.map((vendor) => (
                                                                            <option key={vendor.id} value={vendor.id}>
                                                                                {vendor.name}{vendor.code ? ` (${vendor.code})` : ''}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                </td>
                                                                <td className="px-4 py-3 text-right text-[#556070] font-semibold">
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        step="0.01"
                                                                        value={state.rate || ''}
                                                                        onChange={(e) => updateIndividualState(line.purchaseRequestLineId, { rate: e.target.value, resolved: false, reason: '', cartStatus: '', cartMessage: '', cartUnfulfilledQty: 0, cartAllocations: [] })}
                                                                        className="w-24 text-right bg-slate-50 border border-slate-200 rounded px-1 py-1 font-semibold text-[#556070] focus:border-primary outline-none"
                                                                    />
                                                                </td>
                                                                <td className="px-4 py-3 text-xs text-text-secondary">
                                                                    <input
                                                                        type="text"
                                                                        value={state.matchedSku || ''}
                                                                        onChange={(e) => updateIndividualState(line.purchaseRequestLineId, { matchedSku: e.target.value, resolved: false, reason: '', cartStatus: '', cartMessage: '', cartUnfulfilledQty: 0, cartAllocations: [] })}
                                                                        placeholder={formatMappedSkus(line.skuMappings)[0] || 'Enter SKU'}
                                                                        className="w-56 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[#556070] focus:border-primary outline-none"
                                                                    />
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    {state.cartStatus === 'PARTIAL' ? (
                                                                        <span title={state.cartMessage || ''} className="text-[10px] px-2 py-1 rounded bg-amber-100 text-amber-700">Partially fulfilled</span>
                                                                    ) : state.reason === 'cart_failed' || state.cartStatus === 'FAILED' ? (
                                                                        <span title={state.cartMessage || ''} className="text-[10px] px-2 py-1 rounded bg-rose-100 text-rose-700">Cart failed</span>
                                                                    ) : state.cartStatus === 'PROCESSING' ? (
                                                                        <span title={state.cartMessage || ''} className="text-[10px] px-2 py-1 rounded bg-sky-100 text-sky-700">In progress</span>
                                                                    ) : state.vendorId && toNumber(state.rate) > 0 && state.matchedSku ? (
                                                                        <span className="text-[10px] px-2 py-1 rounded bg-indigo-100 text-indigo-700">Manual ready</span>
                                                                    ) : state.resolved ? (
                                                                        <span className="text-[10px] px-2 py-1 rounded bg-emerald-100 text-emerald-700">Resolved</span>
                                                                    ) : state.reason ? (
                                                                        <span title={state.cartMessage || ''} className="text-[10px] px-2 py-1 rounded bg-amber-100 text-amber-700">{reasonLabel[state.reason] || state.reason}</span>
                                                                    ) : (
                                                                        <span className="text-[10px] px-2 py-1 rounded bg-slate-100 text-slate-600">Not analyzed</span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {tab === 'combined' && (
                                <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
                                    <div className="px-6 py-4 border-b border-slate-200 bg-[#ECF1FF]/40 text-[#556070] font-semibold">
                                        Combined Demand Projection
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead className="bg-slate-50">
                                                <tr>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary">Sel</th>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary">Item</th>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary text-center">Total Required</th>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary">Vendor</th>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary text-right">Rate</th>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary">SKU</th>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary">Status</th>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary">Breakdown</th>
                                                </tr>
                                                </thead>
                                            <tbody className="divide-y divide-border-dark">
                                                {combinedRows.map((row) => {
                                                    const state = combinedStates[row.itemId] || {};
                                                    return (
                                                        <tr key={row.itemId} className="hover:bg-slate-50">
                                                            <td className="px-4 py-3">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={state.selected || false}
                                                                    onChange={(e) => updateCombinedState(row.itemId, { selected: e.target.checked })}
                                                                    className="accent-primary"
                                                                />
                                                            </td>
                                                            <td className="px-4 py-3 text-[#556070]">
                                                                <p className="font-semibold">{row.itemCode}</p>
                                                                <p className="text-xs text-text-secondary">{row.itemName}</p>
                                                                {!state.matchedSku && formatMappedSkus(row.skuMappings).length > 0 && (
                                                                    <div className="mt-1 space-y-1">
                                                                        {formatMappedSkus(row.skuMappings).slice(0, 3).map((text) => (
                                                                            <p key={text} className="text-[11px] text-slate-500">{text}</p>
                                                                        ))}
                                                                        {formatMappedSkus(row.skuMappings).length > 3 && (
                                                                            <p className="text-[11px] text-slate-400">+{formatMappedSkus(row.skuMappings).length - 3} more</p>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3 text-center">
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        value={state.orderQuantity || ''}
                                                                        onChange={(e) => updateCombinedState(row.itemId, {
                                                                            orderQuantity: e.target.value,
                                                                            cartStatus: '',
                                                                            cartMessage: '',
                                                                            cartAllocatedQty: 0,
                                                                            cartUnfulfilledQty: 0,
                                                                            cartAllocations: []
                                                                        })}
                                                                        className="w-20 text-center bg-slate-50 border border-slate-200 rounded px-1 py-1 font-semibold text-[#556070] focus:border-primary outline-none"
                                                                    />
                                                            </td>
                                                            <td className="px-4 py-3 text-[#556070] text-sm">
                                                                <select
                                                                    value={state.vendorId || ''}
                                                                    onChange={(e) => handleManualVendorChange('combined', row.itemId, e.target.value)}
                                                                    className="w-44 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[#556070] focus:border-primary outline-none"
                                                                >
                                                                    <option value="">Select vendor</option>
                                                                    {vendorOptions.map((vendor) => (
                                                                        <option key={vendor.id} value={vendor.id}>
                                                                            {vendor.name}{vendor.code ? ` (${vendor.code})` : ''}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </td>
                                                            <td className="px-4 py-3 text-right text-[#556070] font-semibold">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="0.01"
                                                                    value={state.rate || ''}
                                                                    onChange={(e) => updateCombinedState(row.itemId, { rate: e.target.value, resolved: false, reason: '', cartStatus: '', cartMessage: '', cartUnfulfilledQty: 0, cartAllocations: [] })}
                                                                    className="w-24 text-right bg-slate-50 border border-slate-200 rounded px-1 py-1 font-semibold text-[#556070] focus:border-primary outline-none"
                                                                />
                                                            </td>
                                                            <td className="px-4 py-3 text-xs text-text-secondary">
                                                                <input
                                                                    type="text"
                                                                    value={state.matchedSku || ''}
                                                                    onChange={(e) => updateCombinedState(row.itemId, { matchedSku: e.target.value, resolved: false, reason: '', cartStatus: '', cartMessage: '', cartUnfulfilledQty: 0, cartAllocations: [] })}
                                                                    placeholder={formatMappedSkus(row.skuMappings)[0] || 'Enter SKU'}
                                                                    className="w-56 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[#556070] focus:border-primary outline-none"
                                                                />
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                {state.cartStatus === 'PARTIAL' ? (
                                                                    <span title={state.cartMessage || ''} className="text-[10px] px-2 py-1 rounded bg-amber-100 text-amber-700">Partially fulfilled</span>
                                                                ) : state.reason === 'cart_failed' || state.cartStatus === 'FAILED' ? (
                                                                    <span title={state.cartMessage || ''} className="text-[10px] px-2 py-1 rounded bg-rose-100 text-rose-700">Cart failed</span>
                                                                ) : state.cartStatus === 'PROCESSING' ? (
                                                                    <span title={state.cartMessage || ''} className="text-[10px] px-2 py-1 rounded bg-sky-100 text-sky-700">In progress</span>
                                                                ) : state.vendorId && toNumber(state.rate) > 0 && state.matchedSku ? (
                                                                    <span className="text-[10px] px-2 py-1 rounded bg-indigo-100 text-indigo-700">Manual ready</span>
                                                                ) : state.resolved ? (
                                                                    <span className="text-[10px] px-2 py-1 rounded bg-emerald-100 text-emerald-700">Resolved</span>
                                                                ) : state.reason ? (
                                                                    <span title={state.cartMessage || ''} className="text-[10px] px-2 py-1 rounded bg-amber-100 text-amber-700">{reasonLabel[state.reason] || state.reason}</span>
                                                                ) : (
                                                                    <span className="text-[10px] px-2 py-1 rounded bg-slate-100 text-slate-600">Not analyzed</span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3 text-xs text-text-secondary">
                                                                {(row.requestLines || []).slice(0, 3).map((entry) => (
                                                                    <p key={entry.purchaseRequestLineId}>{entry.materialRequestNumber} • {entry.quantity}</p>
                                                                ))}
                                                                {(row.requestLines || []).length > 3 && <p>+{row.requestLines.length - 3} more</p>}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                    {tab === 'generated' && (
                                <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
                                    <div className="px-6 py-4 border-b border-slate-200 bg-[#ECF1FF]/40 text-[#556070] font-semibold">
                                        Generated Purchase Orders
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead className="bg-slate-50">
                                                <tr>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary">PO #</th>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary">Vendor</th>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary text-center">Lines</th>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase text-text-secondary">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border-dark">
                                                {(orders || []).map((order) => (
                                                    <tr key={order.id || order._id}>
                                                        <td className="px-4 py-3 text-[#556070] font-semibold">{order.poNumber}</td>
                                                        <td className="px-4 py-3 text-text-secondary">{order.vendor?.name || order.vendorId?.name || 'N/A'}</td>
                                                        <td className="px-4 py-3 text-center text-[#556070] font-semibold">{(order.lines || []).length}</td>
                                                        <td className="px-4 py-3 text-text-secondary">{order.status}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {(tab === 'individual' || tab === 'combined') && (
                                <div className="mt-6">
                                    <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">
                                        Purchase Notes
                                    </label>
                                    <textarea
                                        rows="3"
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        className="w-full bg-white border border-slate-200 rounded-xl p-3 text-[#556070] outline-none focus:border-primary"
                                        placeholder="Vendor follow-up, delivery commitments, RFQ notes..."
                                    />
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </Layout>
    );
}
