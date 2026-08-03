import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../../services/api.js';
import InternLayout from '../common/InternLayout.jsx';
import { getCurrentUser } from '../../services/authService.js';

export default function InternTasksPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const user = getCurrentUser();
    const [projects, setProjects] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [productionAssignments, setProductionAssignments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [statusUpdate, setStatusUpdate] = useState({});
    const [commentText, setCommentText] = useState({});
    const [productionDrafts, setProductionDrafts] = useState({});
    const [productionSaving, setProductionSaving] = useState({});

    // Query state
    const [showQueryModal, setShowQueryModal] = useState(false);
    const [selectedTaskForQuery, setSelectedTaskForQuery] = useState(null);
    const [queryText, setQueryText] = useState('');
    const [submittingQuery, setSubmittingQuery] = useState(false);

    // Filter state
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [projectFilter, setProjectFilter] = useState('ALL');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    // Handle deep linking
    useEffect(() => {
        if (location.state?.openTaskId && tasks.length > 0) {
            const taskToOpen = tasks.find(t => t.id === location.state.openTaskId);
            if (taskToOpen) {
                setSearchTerm(taskToOpen.title); // Filter to show this task
                // Optional: Scroll to it if needed
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    }, [tasks, location.state]);

    const loadData = async () => {
        try {
            setLoading(true);
            const [projRes, taskRes] = await Promise.all([
                api.get('/projects'),
                api.get('/tasks'),
            ]);
            setProjects(projRes.data);
            setTasks(taskRes.data);
            const productionRes = await api.get('/my/production-assignments');
            setProductionAssignments(productionRes.data || []);
            setProductionDrafts(
                (productionRes.data || []).reduce((acc, item) => {
                    acc[item.id] = {
                        boardsCompletedDraft: String(item.boardsCompletedDraft ?? item.boardsCompletedApproved ?? 0),
                        delayReason: item.delayReason || ''
                    };
                    return acc;
                }, {})
            );
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load tasks');
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = async (taskId, status) => {
        try {
            await api.put(`/tasks/${taskId}/status`, { status });
            setStatusUpdate({ ...statusUpdate, [taskId]: status });
            await loadData();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update status');
        }
    };

    const handleAddComment = async (taskId) => {
        const text = commentText[taskId];
        if (!text) return;
        try {
            await api.post(`/tasks/${taskId}/comments`, { text });
            setCommentText({ ...commentText, [taskId]: '' });
            await loadData();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to add comment');
        }
    };

    // Open query modal
    const openQueryModal = (task) => {
        setSelectedTaskForQuery(task);
        setQueryText('');
        setShowQueryModal(true);
    };

    // Raise a query for manager
    const handleRaiseQuery = async () => {
        if (!queryText.trim() || !selectedTaskForQuery) return;
        try {
            setSubmittingQuery(true);
            await api.post(`/tasks/${selectedTaskForQuery.id}/queries`, { question: queryText });
            setShowQueryModal(false);
            setQueryText('');
            setSelectedTaskForQuery(null);
            await loadData();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to raise query');
        } finally {
            setSubmittingQuery(false);
        }
    };


    const myTasks = tasks.filter((t) => t.assigneeId === user.id);
    const myProductionAssignments = productionAssignments;

    // Apply filters
    const filteredTasks = myTasks.filter((t) => {
        if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
        if (projectFilter !== 'ALL' && t.projectId !== projectFilter) return false;
        // Search filter
        if (searchTerm) {
            const search = searchTerm.toLowerCase();
            const matchesTitle = t.title?.toLowerCase().includes(search);
            const matchesDescription = t.description?.toLowerCase().includes(search);
            const projectCode = projects.find(p => p.id === t.projectId)?.projectCode?.toLowerCase();
            const matchesProject = projectCode?.includes(search);
            if (!matchesTitle && !matchesDescription && !matchesProject) return false;
        }
        return true;
    });

    // Stats
    const stats = {
        total: myTasks.length,
        notStarted: myTasks.filter((t) => t.status === 'NOT_STARTED').length,
        inProgress: myTasks.filter((t) => t.status === 'IN_PROGRESS').length,
        completed: myTasks.filter((t) => t.status === 'COMPLETED').length,
    };

    const submitProductionProgress = async (assignment) => {
        const assignmentId = assignment.id;
        const draft = productionDrafts[assignmentId] || {};
        const boardsCompletedDraft = Number(draft.boardsCompletedDraft);
        const delayReason = draft.delayReason || '';

        if (!Number.isInteger(boardsCompletedDraft) || boardsCompletedDraft < 0) {
            setError('Completed boards must be a whole number 0 or greater.');
            return;
        }

        try {
            setProductionSaving((prev) => ({ ...prev, [assignmentId]: true }));
            await api.put(`/production/assignments/${assignmentId}/progress`, {
                boardsCompletedDraft,
                delayReason
            });
            await loadData();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to submit production progress');
        } finally {
            setProductionSaving((prev) => ({ ...prev, [assignmentId]: false }));
        }
    };

    return (
        <InternLayout currentPage="tasks">
            <div className="p-6 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    {/* Breadcrumb */}
                    <nav aria-label="Breadcrumb" className="flex mb-6">
                        <ol className="inline-flex items-center space-x-2">
                            <li>
                                <button
                                    onClick={() => navigate('/intern')}
                                    className="text-text-secondary hover:text-white text-sm font-medium transition-colors"
                                >
                                    Dashboard
                                </button>
                            </li>
                            <li className="flex items-center">
                                <span className="material-symbols-outlined text-text-secondary text-base">chevron_right</span>
                                <span className="ml-2 text-white text-sm font-medium">My Tasks</span>
                            </li>
                        </ol>
                    </nav>

                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                        <div>
                            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">My Tasks</h1>
                            <p className="text-text-secondary text-lg">View and update your assigned tasks.</p>
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-6">
                            {error}
                        </div>
                    )}

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                        <div className="bg-surface-dark border border-border-dark rounded-xl p-4 shadow-xl">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-text-secondary text-xs font-medium uppercase tracking-wider">Total</h3>
                                <span className="material-symbols-outlined text-primary text-lg">task_alt</span>
                            </div>
                            <p className="text-2xl font-bold text-white">{stats.total}</p>
                        </div>
                        <div className="bg-surface-dark border border-border-dark rounded-xl p-4 shadow-xl">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-text-secondary text-xs font-medium uppercase tracking-wider">Not Started</h3>
                                <span className="material-symbols-outlined text-gray-400 text-lg">circle</span>
                            </div>
                            <p className="text-2xl font-bold text-white">{stats.notStarted}</p>
                        </div>
                        <div className="bg-surface-dark border border-border-dark rounded-xl p-4 shadow-xl">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-text-secondary text-xs font-medium uppercase tracking-wider">In Progress</h3>
                                <span className="material-symbols-outlined text-blue-500 text-lg">pending</span>
                            </div>
                            <p className="text-2xl font-bold text-white">{stats.inProgress}</p>
                        </div>
                        <div className="bg-surface-dark border border-border-dark rounded-xl p-4 shadow-xl">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-text-secondary text-xs font-medium uppercase tracking-wider">Completed</h3>
                                <span className="material-symbols-outlined text-green-500 text-lg">check_circle</span>
                            </div>
                            <p className="text-2xl font-bold text-white">{stats.completed}</p>
                        </div>
                    </div>

                    {myProductionAssignments.length > 0 && (
                        <div className="bg-surface-dark border border-border-dark rounded-xl p-4 mb-8">
                            <div className="mb-4">
                                <h2 className="text-xl font-bold text-white">My Production Allocations</h2>
                                <p className="text-text-secondary text-sm">Submit completed boards for manager approval.</p>
                            </div>
                            <div className="space-y-4">
                                {myProductionAssignments.map((assignment) => {
                                    const draft = productionDrafts[assignment.id] || {
                                        boardsCompletedDraft: String(assignment.boardsCompletedDraft ?? assignment.boardsCompletedApproved ?? 0),
                                        delayReason: assignment.delayReason || ''
                                    };
                                    const isOverdue = assignment.deadline && new Date() > new Date(assignment.deadline);

                                    return (
                                        <div key={assignment.id} className="rounded-xl border border-border-dark bg-background-dark/40 p-4">
                                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                <div>
                                                    <p className="text-white font-bold">{assignment.productionPhase}</p>
                                                    <p className="text-text-secondary text-sm">{assignment.projectCode} · {assignment.projectName}</p>
                                                    <p className="text-text-secondary text-xs mt-2">
                                                        Assigned: <span className="text-white">{assignment.boardsAssigned}</span> · Approved: <span className="text-white">{assignment.boardsCompletedApproved}</span> · Status: <span className="text-white">{assignment.status}</span>
                                                    </p>
                                                    <p className="text-text-secondary text-xs mt-1">
                                                        Deadline: <span className={isOverdue ? 'text-red-400' : 'text-white'}>{assignment.deadline ? new Date(assignment.deadline).toLocaleDateString() : 'Not set'}</span>
                                                    </p>
                                                </div>
                                                <div className="grid gap-3 md:min-w-[360px]">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="1"
                                                        value={draft.boardsCompletedDraft}
                                                        onChange={(e) => setProductionDrafts((prev) => ({ ...prev, [assignment.id]: { ...draft, boardsCompletedDraft: e.target.value } }))}
                                                        className="w-full rounded-lg bg-background-dark border border-border-dark px-4 py-2 text-white"
                                                        placeholder="Completed boards"
                                                    />
                                                    <textarea
                                                        value={draft.delayReason}
                                                        onChange={(e) => setProductionDrafts((prev) => ({ ...prev, [assignment.id]: { ...draft, delayReason: e.target.value } }))}
                                                        className="w-full rounded-lg bg-background-dark border border-border-dark px-4 py-2 text-white text-sm"
                                                        placeholder={isOverdue ? 'Delay reason is required if overdue' : 'Optional delay reason'}
                                                        rows={2}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => submitProductionProgress(assignment)}
                                                        disabled={productionSaving[assignment.id]}
                                                        className="rounded-lg bg-primary px-4 py-2 text-white font-semibold disabled:opacity-60"
                                                    >
                                                        {productionSaving[assignment.id] ? 'Submitting...' : 'Submit for Approval'}
                                                    </button>
                                                </div>
                                            </div>
                                            {assignment.rejectionReason && (
                                                <p className="mt-3 text-xs text-red-400">Last rejection: {assignment.rejectionReason}</p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Search & Filters */}
                    <div className="bg-surface-dark border border-border-dark rounded-xl p-4 mb-6">
                        <div className="flex flex-col md:flex-row gap-4">
                            {/* Search Input */}
                            <div className="flex-1">
                                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">
                                    Search
                                </label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-3 flex items-center text-text-secondary">
                                        <span className="material-symbols-outlined text-xl">search</span>
                                    </span>
                                    <input
                                        type="text"
                                        placeholder="Search tasks..."
                                        className="w-full pl-10 pr-4 py-2 bg-background-dark border border-border-dark rounded-lg text-white placeholder-text-secondary/50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                            </div>
                            {/* Status Filter */}
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">
                                    Status
                                </label>
                                <select
                                    className="bg-background-dark border border-border-dark rounded-lg px-4 py-2 text-white text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none cursor-pointer"
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                >
                                    <option value="ALL">All Status</option>
                                    <option value="NOT_STARTED">Not Started</option>
                                    <option value="IN_PROGRESS">In Progress</option>
                                    <option value="COMPLETED">Completed</option>
                                </select>
                            </div>
                            {/* Project Filter */}
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">
                                    Project
                                </label>
                                <select
                                    className="bg-background-dark border border-border-dark rounded-lg px-4 py-2 text-white text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none cursor-pointer"
                                    value={projectFilter}
                                    onChange={(e) => setProjectFilter(e.target.value)}
                                >
                                    <option value="ALL">All Projects</option>
                                    {projects.map((p) => (
                                        <option key={p.id} value={p.id}>{p.projectCode || 'No ID'}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="bg-surface-dark border border-border-dark rounded-xl p-8 text-center">
                            <p className="text-text-secondary">Loading tasks...</p>
                        </div>
                    ) : (
                        /* Tasks List */
                        <div className="bg-surface-dark border border-border-dark rounded-xl shadow-xl overflow-hidden">
                            <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface">
                                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary">task_alt</span>
                                    Tasks ({filteredTasks.length})
                                </h2>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-background-dark/50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                                                Title
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                                                Project
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                                                Status
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                                                Update Status
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                                                Work Updates
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                                                Queries
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-dark">
                                        {filteredTasks.map((t) => (
                                            <tr key={t.id} className="hover:bg-background-dark/30 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="text-white font-medium">{t.title}</div>
                                                    <div className="text-text-secondary text-sm mt-1 line-clamp-1">
                                                        {t.description || 'No description'}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className="text-white font-mono">
                                                        {projects.find((p) => p.id === t.projectId)?.projectCode || '-'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span
                                                        className={`px-2 py-1 text-xs font-medium rounded-full ${t.status === 'COMPLETED'
                                                            ? 'bg-green-500/20 text-green-400'
                                                            : t.status === 'IN_PROGRESS'
                                                                ? 'bg-blue-500/20 text-blue-400'
                                                                : 'bg-gray-500/20 text-gray-400'
                                                            }`}
                                                    >
                                                        {t.status.replace('_', ' ')}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {/* Rejection Warning */}
                                                    {t.rejectionReason && t.status === 'IN_PROGRESS' && (
                                                        <div className="mb-2 p-2 bg-red-500/10 border border-red-500/30 rounded flex items-start gap-2 max-w-[200px] whitespace-normal">
                                                            <span className="material-symbols-outlined text-red-400 text-sm mt-0.5">error</span>
                                                            <div>
                                                                <p className="text-[10px] font-bold text-red-400 uppercase">Rejected</p>
                                                                <p className="text-xs text-red-300 leading-tight">{t.rejectionReason}</p>
                                                            </div>
                                                        </div>
                                                    )}

                                                    <select
                                                        className="bg-background-dark border border-border-dark rounded-lg px-3 py-1.5 text-white text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none cursor-pointer"
                                                        value={statusUpdate[t.id] || t.status}
                                                        onChange={(e) => handleStatusChange(t.id, e.target.value)}
                                                    >
                                                        <option value="NOT_STARTED">Not Started</option>
                                                        <option value="IN_PROGRESS">In Progress</option>
                                                        <option value="COMPLETED">Completed</option>
                                                        <option value="WAITING_APPROVAL">📤 Ask for Approval</option>
                                                    </select>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-2 min-w-[200px]">
                                                        <div className="flex gap-2">
                                                            <input
                                                                className="flex-1 bg-background-dark border border-border-dark rounded-lg px-3 py-1.5 text-white placeholder-text-secondary/50 text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                                                placeholder="Add work update..."
                                                                value={commentText[t.id] || ''}
                                                                onChange={(e) =>
                                                                    setCommentText({ ...commentText, [t.id]: e.target.value })
                                                                }
                                                            />
                                                            <button
                                                                onClick={() => handleAddComment(t.id)}
                                                                className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition-colors"
                                                                disabled={!commentText[t.id]}
                                                            >
                                                                Add
                                                            </button>
                                                        </div>
                                                        {t.comments && t.comments.length > 0 && (
                                                            <div className="text-xs text-text-secondary mt-1">
                                                                {t.comments.length} update{t.comments.length !== 1 ? 's' : ''}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                {/* Queries Column */}
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-2 min-w-[150px]">
                                                        <button
                                                            onClick={() => openQueryModal(t)}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 rounded-lg text-sm font-semibold transition-colors"
                                                        >
                                                            <span className="material-symbols-outlined text-base">help</span>
                                                            Raise Query
                                                        </button>
                                                        {t.queries && t.queries.length > 0 && (
                                                            <div className="text-xs">
                                                                <span className={`${t.queries.some(q => q.status === 'PENDING') ? 'text-amber-700' : 'text-green-700'}`}>
                                                                    {t.queries.filter(q => q.status === 'PENDING').length} pending
                                                                </span>
                                                                {' / '}
                                                                <span className="text-text-secondary">{t.queries.length} total</span>
                                                            </div>
                                                        )}
                                                        {t.queries && t.queries.filter(q => q.status === 'RESOLVED').length > 0 && (
                                                            <div className="text-xs text-green-700 font-medium">
                                                                ✓ {t.queries.filter(q => q.status === 'RESOLVED').length} resolved
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredTasks.length === 0 && (
                                            <tr>
                                                <td colSpan="6" className="px-6 py-8 text-center text-text-secondary">
                                                    {myTasks.length === 0
                                                        ? 'No tasks assigned yet.'
                                                        : 'No tasks match the selected filters.'}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Query Modal */}
            {showQueryModal && selectedTaskForQuery && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={() => setShowQueryModal(false)}
                    ></div>
                    <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                        <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface">
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-amber-500">help</span>
                                Raise Query to Manager
                            </h2>
                        </div>

                        <div className="p-6 space-y-5">
                            <div className="bg-background-dark/50 border border-border-dark rounded-lg p-4">
                                <p className="text-text-secondary text-xs uppercase tracking-wider mb-1">Task</p>
                                <p className="text-white font-medium">{selectedTaskForQuery.title}</p>
                            </div>

                            <div>
                                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">
                                    Your Query
                                </label>
                                <textarea
                                    className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none"
                                    placeholder="Describe your question or issue..."
                                    rows={4}
                                    value={queryText}
                                    onChange={(e) => setQueryText(e.target.value)}
                                ></textarea>
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-border-dark flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setShowQueryModal(false)}
                                className="px-4 py-2 rounded-lg border border-border-dark text-white font-medium hover:bg-background-dark transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleRaiseQuery}
                                disabled={!queryText.trim() || submittingQuery}
                                className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold shadow-lg shadow-amber-900/50 hover:shadow-amber-900/70 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                            >
                                <span className="material-symbols-outlined text-lg">send</span>
                                {submittingQuery ? 'Sending...' : 'Send Query'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </InternLayout>
    );
}
