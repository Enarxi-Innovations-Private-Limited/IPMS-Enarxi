import { useEffect, useMemo, useState } from 'react';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout.js';
import { useNotifier } from '../common/AppNotificationProvider.jsx';

const createEmptyLine = () => ({
    itemId: '',
    goodQuantity: '',
    damagedQuantity: '',
    responsibleTeam: '',
    damageReason: '',
    remarks: ''
});

const getEntityId = (value) => value?.id || value?._id || '';

export default function ProjectReturn({ currentPage: propCurrentPage }) {
    const Layout = usePortalLayout();
    const { error: notifyError, success: notifySuccess } = useNotifier();
    const currentPage = propCurrentPage || 'returns';

    const [projects, setProjects] = useState([]);
    const [locations, setLocations] = useState([]);
    const [eligibleItems, setEligibleItems] = useState([]);
    const [recentReturns, setRecentReturns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [itemsLoading, setItemsLoading] = useState(false);
    const [formData, setFormData] = useState({
        projectId: '',
        locationId: '',
        overallRemarks: '',
        lines: [createEmptyLine()]
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [projectRes, locationRes, returnRes] = await Promise.all([
                    inventoryService.getEligibleProjectReturnProjects(),
                    inventoryService.getLocations(),
                    inventoryService.getProjectReturns()
                ]);
                setProjects(projectRes.data || []);
                setLocations(locationRes.data.filter((location) => location.isActive !== false));
                setRecentReturns(returnRes.data.slice(0, 5));
            } catch (err) {
                notifyError(err.response?.data?.message || 'Failed to load project return setup data.');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [notifyError]);

    useEffect(() => {
        if (!formData.projectId) {
            setEligibleItems([]);
            setFormData((prev) => ({ ...prev, lines: [createEmptyLine()] }));
            return;
        }

        const loadEligibleItems = async () => {
            try {
                setItemsLoading(true);
                const response = await inventoryService.getProjectReturnableItems(formData.projectId);
                setEligibleItems(response.data.items || []);
                setFormData((prev) => ({
                    ...prev,
                    lines: prev.lines.map((line) => {
                        const stillValid = (response.data.items || []).some((item) => getEntityId(item.item) === line.itemId || item.itemId === line.itemId);
                        return stillValid ? line : createEmptyLine();
                    })
                }));
            } catch (err) {
                setEligibleItems([]);
                notifyError(err.response?.data?.message || 'Failed to load returnable project items.');
            } finally {
                setItemsLoading(false);
            }
        };

        loadEligibleItems();
    }, [formData.projectId, notifyError]);

    const eligibleMap = useMemo(() => {
        const map = new Map();
        for (const item of eligibleItems) {
            map.set(item.itemId || getEntityId(item.item), item);
        }
        return map;
    }, [eligibleItems]);

    const handleAddLine = () => {
        setFormData((prev) => ({ ...prev, lines: [...prev.lines, createEmptyLine()] }));
    };

    const handleRemoveLine = (index) => {
        setFormData((prev) => ({
            ...prev,
            lines: prev.lines.filter((_, lineIndex) => lineIndex !== index)
        }));
    };

    const handleLineChange = (index, field, value) => {
        setFormData((prev) => ({
            ...prev,
            lines: prev.lines.map((line, lineIndex) => (
                lineIndex === index ? { ...line, [field]: value } : line
            ))
        }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        const payloadLines = formData.lines
            .map((line) => ({
                ...line,
                goodQuantity: Number(line.goodQuantity || 0),
                damagedQuantity: Number(line.damagedQuantity || 0)
            }))
            .filter((line) => line.itemId && (line.goodQuantity > 0 || line.damagedQuantity > 0));

        if (!payloadLines.length) {
            notifyError('Add at least one valid return line before submitting.');
            return;
        }

        try {
            setSubmitting(true);
            await inventoryService.submitProjectReturn({
                projectId: formData.projectId,
                destinationLocationId: formData.locationId,
                overallRemarks: formData.overallRemarks,
                lines: payloadLines
            });

            const returnRes = await inventoryService.getProjectReturns();
            setRecentReturns(returnRes.data.slice(0, 5));

            notifySuccess('Project return submitted for store/admin approval.');
            setFormData({
                projectId: '',
                locationId: '',
                overallRemarks: '',
                lines: [createEmptyLine()]
            });
            setEligibleItems([]);
        } catch (err) {
            notifyError(err.response?.data?.message || 'Failed to submit project return.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Layout currentPage={currentPage}>
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-5xl mx-auto w-full">
                    <div className="mb-8 text-center">
                        <h1 className="text-3xl font-bold text-white tracking-tight">Project Return to Store</h1>
                        <p className="text-text-secondary text-lg">Return unused and damaged project stock with accountability tracking.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="bg-surface-dark border border-border-dark rounded-2xl p-8 shadow-2xl space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs font-bold text-text-secondary uppercase mb-2 tracking-widest">Select Project</label>
                                <select
                                    className="w-full bg-background-dark border border-border-dark rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-primary"
                                    value={formData.projectId}
                                    onChange={(e) => setFormData((prev) => ({ ...prev, projectId: e.target.value }))}
                                    required
                                >
                                    <option value="">Select source project...</option>
                                    {projects.map((project) => (
                                        <option key={getEntityId(project)} value={getEntityId(project)}>
                                            {project.name}{project.returnableItemCount ? ` (${project.returnableItemCount} returnable item${project.returnableItemCount > 1 ? 's' : ''})` : ''}
                                        </option>
                                    ))}
                                </select>
                                {!loading && projects.length === 0 && (
                                    <p className="text-[11px] text-amber-300 mt-2">
                                        No project with dispatched returnable stock was found for your account yet.
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-text-secondary uppercase mb-2 tracking-widest">Good Return Location</label>
                                <select
                                    className="w-full bg-background-dark border border-border-dark rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                                    value={formData.locationId}
                                    onChange={(e) => setFormData((prev) => ({ ...prev, locationId: e.target.value }))}
                                    required
                                >
                                    <option value="">Select destination warehouse...</option>
                                    {locations.map((location) => (
                                        <option key={getEntityId(location)} value={getEntityId(location)}>
                                            {location.name} {location.locationCode ? `(${location.locationCode})` : ''}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-[11px] text-text-secondary mt-2">Damaged quantities will be moved automatically to the system damage hold location.</p>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-text-secondary uppercase mb-2 tracking-widest">Overall Remarks</label>
                            <textarea
                                className="w-full min-h-24 bg-background-dark border border-border-dark rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-primary"
                                placeholder="Optional return summary, packing note, or site context..."
                                value={formData.overallRemarks}
                                onChange={(e) => setFormData((prev) => ({ ...prev, overallRemarks: e.target.value }))}
                            />
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest">Components to Return</h3>
                                <button type="button" onClick={handleAddLine} className="text-primary text-sm font-bold flex items-center gap-1 hover:underline">
                                    <span className="material-symbols-outlined text-sm">add</span> Add Another
                                </button>
                            </div>

                            {itemsLoading && (
                                <div className="rounded-xl border border-border-dark bg-background-dark/30 p-4 text-sm text-text-secondary">
                                    Loading dispatched items for the selected project...
                                </div>
                            )}

                            {!itemsLoading && formData.projectId && eligibleItems.length === 0 && (
                                <div className="rounded-xl border border-border-dark bg-background-dark/30 p-4 text-sm text-text-secondary">
                                    No dispatched project items are currently available to return for this project.
                                </div>
                            )}

                            {formData.lines.map((line, index) => {
                                const selectedItem = eligibleMap.get(line.itemId);
                                const remaining = Number(selectedItem?.maxReturnableQuantity || 0);

                                return (
                                    <div key={index} className="space-y-4 bg-background-dark/30 p-4 rounded-xl border border-border-dark">
                                        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                                            <div className="xl:col-span-2">
                                                <label className="block text-[9px] font-bold text-text-secondary uppercase mb-1">Item</label>
                                                <select
                                                    className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-white text-sm"
                                                    value={line.itemId}
                                                    onChange={(e) => handleLineChange(index, 'itemId', e.target.value)}
                                                    required
                                                >
                                                    <option value="">Select dispatched item...</option>
                                                    {eligibleItems.map((item) => (
                                                        <option key={item.itemId} value={item.itemId}>
                                                            {item.item?.name} ({item.item?.itemCode}) - returnable {item.maxReturnableQuantity}
                                                        </option>
                                                    ))}
                                                </select>
                                                {selectedItem && (
                                                    <p className="text-[11px] text-text-secondary mt-2">
                                                        Issued: {selectedItem.issuedQuantity} | Already returned: {selectedItem.alreadyReturnedQuantity} | Remaining: {selectedItem.maxReturnableQuantity}
                                                    </p>
                                                )}
                                            </div>

                                            <div>
                                                <label className="block text-[9px] font-bold text-text-secondary uppercase mb-1">Good Qty</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    max={remaining || undefined}
                                                    className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-white text-sm"
                                                    value={line.goodQuantity}
                                                    onChange={(e) => handleLineChange(index, 'goodQuantity', e.target.value)}
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-[9px] font-bold text-text-secondary uppercase mb-1">Damaged Qty</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    max={remaining || undefined}
                                                    className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-white text-sm"
                                                    value={line.damagedQuantity}
                                                    onChange={(e) => handleLineChange(index, 'damagedQuantity', e.target.value)}
                                                />
                                            </div>

                                            <div className="flex items-end justify-end">
                                                {formData.lines.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveLine(index)}
                                                        className="px-3 py-2 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 text-sm font-semibold"
                                                    >
                                                        Remove
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-[9px] font-bold text-text-secondary uppercase mb-1">Responsible Team</label>
                                                <input
                                                    className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-white text-sm"
                                                    placeholder="Team / crew / subcontractor"
                                                    value={line.responsibleTeam}
                                                    onChange={(e) => handleLineChange(index, 'responsibleTeam', e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[9px] font-bold text-text-secondary uppercase mb-1">Damage Reason</label>
                                                <input
                                                    className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-white text-sm"
                                                    placeholder="Required if damaged qty is entered"
                                                    value={line.damageReason}
                                                    onChange={(e) => handleLineChange(index, 'damageReason', e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[9px] font-bold text-text-secondary uppercase mb-1">Remarks</label>
                                                <input
                                                    className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-white text-sm"
                                                    placeholder="Unused / bent / scratched / field note"
                                                    value={line.remarks}
                                                    onChange={(e) => handleLineChange(index, 'remarks', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <button
                            type="submit"
                            disabled={submitting || loading || itemsLoading}
                            className="w-full bg-emerald-500 py-4 rounded-xl text-black font-black uppercase tracking-widest shadow-xl shadow-emerald-500/20 hover:bg-emerald-400 transition-all disabled:opacity-50"
                        >
                            {submitting ? 'Submitting Return...' : 'Finalize Project Return'}
                        </button>
                    </form>

                    <div className="mt-8 bg-surface-dark border border-border-dark rounded-2xl p-6 shadow-2xl">
                        <div className="flex items-center justify-between gap-4 mb-4">
                            <div>
                                <h2 className="text-xl font-bold text-white">Recent Return Batches</h2>
                                <p className="text-sm text-text-secondary">Track whether your submitted returns are still waiting for store/admin review.</p>
                            </div>
                        </div>

                        {recentReturns.length === 0 ? (
                            <div className="rounded-xl border border-border-dark bg-background-dark/30 p-4 text-sm text-text-secondary">
                                No project return batches have been submitted yet.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {recentReturns.map((batch) => (
                                    <div key={getEntityId(batch)} className="rounded-xl border border-border-dark bg-background-dark/30 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                        <div>
                                            <div className="text-white font-semibold">{batch.returnNumber}</div>
                                            <div className="text-sm text-text-secondary">
                                                {batch.project?.name || 'Project'} | {batch.lines?.length || 0} line(s)
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                                batch.status === 'APPROVED'
                                                    ? 'bg-emerald-500/20 text-emerald-300'
                                                    : batch.status === 'REJECTED'
                                                    ? 'bg-red-500/20 text-red-300'
                                                    : 'bg-amber-500/20 text-amber-300'
                                            }`}>
                                                {batch.status}
                                            </span>
                                            <span className="text-xs text-text-secondary">
                                                {new Date(batch.createdAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Layout>
    );
}
