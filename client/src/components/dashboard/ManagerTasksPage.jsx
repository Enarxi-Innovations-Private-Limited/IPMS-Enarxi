import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    SortableContext,
    arrayMove,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import api from '../../services/api.js';
import ManagerLayout from '../common/ManagerLayout.jsx';
import TaskDetailModal from '../tasks/TaskDetailModal.jsx';
import { useSocket } from '../../context/SocketContext.jsx';

// ── Sortable row wrapper ──────────────────────────────────────────────────────
function SortableTaskRow({ task, children }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task._id || task.id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        background: isDragging ? 'rgba(16,185,129,0.06)' : undefined,
        boxShadow: isDragging ? '0 4px 24px rgba(0,0,0,0.3)' : undefined,
        position: 'relative',
        zIndex: isDragging ? 10 : undefined,
    };

    return (
        <tr ref={setNodeRef} style={style} className="hover:bg-background-dark/30 transition-colors">
            {/* Drag handle cell */}
            <td className="pl-3 pr-0 py-4 w-8 cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
                <span className="material-symbols-outlined text-[18px] text-slate-600 hover:text-emerald-400 select-none transition-colors">
                    drag_indicator
                </span>
            </td>
            {children}
        </tr>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ManagerTasksPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { socket } = useSocket();

    const [projects, setProjects] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [users, setUsers] = useState([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('ALL');
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [selectedTask, setSelectedTask] = useState(null);
    const [selectedUserId, setSelectedUserId] = useState('');
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [detailTask, setDetailTask] = useState(null);
    const [responseText, setResponseText] = useState('');
    const [respondingToQuery, setRespondingToQuery] = useState(null);
    const [submittingResponse, setSubmittingResponse] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Keep a stable ref to tasks so the socket listener always sees fresh state
    const tasksRef = useRef(tasks);
    useEffect(() => { tasksRef.current = tasks; }, [tasks]);

    // Debounce ref for persist-to-server
    const saveTimerRef = useRef(null);

    const getCurrentPage = () => {
        const p = location.pathname;
        if (p === '/manager' || p === '/manager/') return 'dashboard';
        if (p === '/manager/projects') return 'projects';
        if (p === '/manager/tasks') return 'tasks';
        if (p === '/manager/team') return 'team';
        return 'dashboard';
    };

    const loadData = async () => {
        try {
            setLoading(true);
            const [projRes, taskRes, usersRes] = await Promise.all([
                api.get('/projects'),
                api.get('/tasks'),
                api.get('/users'),
            ]);
            setProjects(projRes.data);
            setTasks(taskRes.data);
            setUsers(usersRes.data);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    // Deep-link support
    useEffect(() => {
        if (location.state?.filter) setFilter(location.state.filter);
        if (location.state?.openTaskId && tasks.length > 0) {
            const t = tasks.find(t => t.id === location.state.openTaskId);
            if (t) openDetailModal(t);
        }
    }, [tasks, location.state]);

    // ── Socket.IO — join room + listen for remote reorders ───────────────────
    useEffect(() => {
        const sock = socket?.current;
        if (!sock) return;

        sock.emit('join:tasks');

        const handleReordered = (items) => {
            // items = [{ taskId, order }] — apply to our local state
            setTasks(prev => {
                const orderMap = Object.fromEntries(items.map(i => [String(i.taskId), i.order]));
                return [...prev].sort((a, b) => {
                    const oa = orderMap[String(a._id ?? a.id)] ?? (a.order ?? 0);
                    const ob = orderMap[String(b._id ?? b.id)] ?? (b.order ?? 0);
                    return oa - ob;
                });
            });
        };

        sock.on('tasks:reordered', handleReordered);
        return () => sock.off('tasks:reordered', handleReordered);
    }, [socket]);

    // ── Drag sensors ─────────────────────────────────────────────────────────
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    // ── Drag end: optimistic UI update + debounced persist ───────────────────
    const handleDragEnd = ({ active, over }) => {
        if (!over || active.id === over.id) return;

        setTasks(prev => {
            const oldIdx = prev.findIndex(t => (t._id ?? t.id) === active.id);
            const newIdx = prev.findIndex(t => (t._id ?? t.id) === over.id);
            if (oldIdx === -1 || newIdx === -1) return prev;
            const reordered = arrayMove(prev, oldIdx, newIdx);

            // Debounce the API call so rapid drops don't spam the server
            clearTimeout(saveTimerRef.current);
            setIsSaving(true);
            saveTimerRef.current = setTimeout(async () => {
                try {
                    const payload = reordered.map((t, i) => ({ taskId: t._id ?? t.id, order: i }));
                    await api.put('/tasks/reorder', payload);
                } catch {
                    // Silent — server will log; next loadData will restore true order
                } finally {
                    setIsSaving(false);
                }
            }, 600);

            return reordered;
        });
    };

    // ── Other handlers ───────────────────────────────────────────────────────
    const handleStatusChange = async (taskId, status) => {
        try {
            await api.put(`/tasks/${taskId}/status`, { status });
            await loadData();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update status');
        }
    };

    const handleAssignTask = async () => {
        if (!selectedTask || !selectedUserId) return;
        try {
            await api.put(`/tasks/${selectedTask.id}`, { assigneeId: selectedUserId });
            setShowAssignModal(false);
            setSelectedTask(null);
            setSelectedUserId('');
            await loadData();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to assign task');
        }
    };

    const openDetailModal = (task) => {
        setDetailTask(task);
        setShowDetailModal(true);
        setResponseText('');
        setRespondingToQuery(null);
    };

    const handleRespondToQuery = async (queryId) => {
        if (!queryId || !responseText.trim() || !detailTask) return;
        try {
            setSubmittingResponse(true);
            await api.put(`/tasks/${detailTask.id}/queries/${queryId}/respond`, { response: responseText });
            setResponseText('');
            setRespondingToQuery(null);
            await loadData();
            const updated = tasks.find(t => t.id === detailTask.id);
            if (updated) setDetailTask(updated);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to respond to query');
        } finally {
            setSubmittingResponse(false);
        }
    };

    const handleManagerDelayReview = async (taskId, approved, rejectionReason = '') => {
        try {
            const payload = { approved };
            if (!approved) payload.rejectionReason = rejectionReason;
            await api.put(`/tasks/${taskId}/delay/manager-review`, payload);
            await loadData();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to submit review');
        }
    };

    // ── Filtered view (preserves drag order within filter) ───────────────────
    const filteredTasks =
        filter === 'ALL' ? tasks
            : filter === 'DELAYED' ? tasks.filter(t => t.delayStatus && t.delayStatus !== 'NONE')
                : tasks.filter(t => t.status === filter);

    const sortableIds = filteredTasks.map(t => t._id ?? t.id);

    return (
        <ManagerLayout currentPage={getCurrentPage()}>
            <div className="p-6 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">

                    {/* Breadcrumb */}
                    <nav aria-label="Breadcrumb" className="flex mb-6">
                        <ol className="inline-flex items-center space-x-2">
                            <li>
                                <button onClick={() => navigate('/manager')} className="text-text-secondary hover:text-white text-sm font-medium transition-colors">
                                    Dashboard
                                </button>
                            </li>
                            <li className="flex items-center">
                                <span className="material-symbols-outlined text-text-secondary text-base">chevron_right</span>
                                <span className="ml-2 text-white text-sm font-medium">Tasks</span>
                            </li>
                        </ol>
                    </nav>

                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Tasks</h1>
                                {isSaving && (
                                    <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                                        <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                                        Saving order…
                                    </span>
                                )}
                            </div>
                            <p className="text-text-secondary text-lg">Manage and track all team tasks. Drag <span className="material-symbols-outlined text-[14px] align-middle">drag_indicator</span> to reorder.</p>
                        </div>
                        <div className="flex gap-3 flex-wrap">
                            {['ALL', 'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED'].map((status) => (
                                <button
                                    key={status}
                                    onClick={() => setFilter(status)}
                                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${filter === status
                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                                        : 'bg-surface-dark text-text-secondary hover:text-white border border-border-dark'}`}
                                >
                                    {status === 'ALL' ? 'All' : status === 'DELAYED' ? 'Delay Requests' : status.replace('_', ' ')}
                                </button>
                            ))}
                        </div>
                    </div>

                    {loading && (
                        <div className="bg-surface-dark border border-border-dark rounded-xl p-8 text-center">
                            <p className="text-text-secondary">Loading tasks...</p>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-6">
                            {error}
                        </div>
                    )}

                    {!loading && (
                        <div className="bg-surface-dark border border-border-dark rounded-xl shadow-xl overflow-hidden">
                            <div className="overflow-x-auto">
                                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                    <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                                        <table className="w-full">
                                            <thead className="bg-background-dark/50">
                                                <tr>
                                                    {/* Drag handle column header */}
                                                    <th className="w-8 pl-3 pr-0" />
                                                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Task</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Project</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Assignee</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Status</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Actions</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Updates & Queries</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border-dark">
                                                {filteredTasks.map((t) => {
                                                    const assignee = users.find(u => u.id === t.assigneeId);
                                                    const pendingQueries = t.queries?.filter(q => q.status === 'PENDING').length || 0;
                                                    return (
                                                        <SortableTaskRow key={t._id ?? t.id} task={t}>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <div className="text-white font-medium">{t.title}</div>
                                                                <div className="text-text-secondary text-sm mt-1 max-w-xs truncate">
                                                                    {t.description || 'No description'}
                                                                </div>
                                                                {t.delayReason && (filter === 'DELAYED' || t.delayStatus === 'PENDING_MANAGER') && (
                                                                    <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded text-amber-200/90 text-xs italic break-words whitespace-normal max-w-xs">
                                                                        "Delay: {t.delayReason}"
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <span className="text-white">{t.projectName || 'Unknown'}</span>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="size-6 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-center">
                                                                        <span className="text-white text-xs font-medium">
                                                                            {assignee?.name?.charAt(0)?.toUpperCase() || '?'}
                                                                        </span>
                                                                    </div>
                                                                    <span className="text-white text-sm">{assignee?.name || 'Unassigned'}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <select
                                                                    className="bg-background-dark border border-border-dark rounded-lg px-3 py-1.5 text-white text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none cursor-pointer"
                                                                    value={t.status}
                                                                    onChange={(e) => handleStatusChange(t.id, e.target.value)}
                                                                >
                                                                    <option value="NOT_STARTED">Not Started</option>
                                                                    <option value="IN_PROGRESS">In Progress</option>
                                                                    <option value="COMPLETED">Completed</option>
                                                                </select>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                {t.delayStatus === 'PENDING_MANAGER' ? (
                                                                    <div className="flex gap-2">
                                                                        <button
                                                                            onClick={() => handleManagerDelayReview(t.id, true)}
                                                                            className="px-3 py-1 bg-green-600/20 text-green-400 border border-green-600/30 rounded text-xs font-bold hover:bg-green-600/30"
                                                                        >
                                                                            Approve
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                const reason = prompt('Enter rejection reason:');
                                                                                if (reason) handleManagerDelayReview(t.id, false, reason);
                                                                            }}
                                                                            className="px-3 py-1 bg-red-600/20 text-red-400 border border-red-600/30 rounded text-xs font-bold hover:bg-red-600/30"
                                                                        >
                                                                            Reject
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => {
                                                                            setSelectedTask(t);
                                                                            setSelectedUserId(t.assigneeId || '');
                                                                            setShowAssignModal(true);
                                                                        }}
                                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-sm font-medium hover:bg-emerald-500/30 transition-colors"
                                                                    >
                                                                        <span className="material-symbols-outlined text-base">person_add</span>
                                                                        Assign
                                                                    </button>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <div className="flex flex-col gap-2">
                                                                    <button
                                                                        onClick={() => openDetailModal(t)}
                                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 text-sm font-medium hover:bg-blue-500/30 transition-colors"
                                                                    >
                                                                        <span className="material-symbols-outlined text-base">visibility</span>
                                                                        View Details
                                                                    </button>
                                                                    <div className="flex gap-3 text-xs">
                                                                        {t.comments?.length > 0 && (
                                                                            <span className="text-text-secondary">📝 {t.comments.length} updates</span>
                                                                        )}
                                                                        {pendingQueries > 0 && (
                                                                            <span className="text-amber-400 font-medium">❓ {pendingQueries} pending</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </SortableTaskRow>
                                                    );
                                                })}
                                                {filteredTasks.length === 0 && (
                                                    <tr>
                                                        <td colSpan="8" className="px-6 py-8 text-center text-text-secondary">
                                                            No tasks found matching the filter.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </SortableContext>
                                </DndContext>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Assign Task Modal */}
            {showAssignModal && selectedTask && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAssignModal(false)} />
                    <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                        <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface">
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-emerald-500">person_add</span>
                                Assign Task
                            </h2>
                        </div>
                        <div className="p-6 space-y-5">
                            <div className="bg-background-dark/50 border border-border-dark rounded-lg p-4">
                                <p className="text-text-secondary text-xs uppercase tracking-wider mb-1">Task</p>
                                <p className="text-white font-medium">{selectedTask.title}</p>
                            </div>
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Assign To</label>
                                <select
                                    className="w-full appearance-none bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none cursor-pointer"
                                    value={selectedUserId}
                                    onChange={(e) => setSelectedUserId(e.target.value)}
                                >
                                    <option value="">Select a team member...</option>
                                    {users.map(user => (
                                        <option key={user.id} value={user.id}>{user.name} ({user.role})</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-border-dark flex justify-end gap-3">
                            <button onClick={() => setShowAssignModal(false)} className="px-4 py-2 rounded-lg border border-border-dark text-white font-medium hover:bg-background-dark transition-colors">
                                Cancel
                            </button>
                            <button
                                onClick={handleAssignTask}
                                disabled={!selectedUserId}
                                className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold shadow-lg shadow-emerald-900/50 hover:shadow-emerald-900/70 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                            >
                                <span className="material-symbols-outlined text-lg">check</span>
                                Assign Task
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Task Detail Modal */}
            {showDetailModal && detailTask && (
                <TaskDetailModal
                    task={detailTask}
                    users={users}
                    onClose={() => setShowDetailModal(false)}
                    onUpdate={async () => { await loadData(); }}
                    canRespond={true}
                />
            )}
        </ManagerLayout>
    );
}
