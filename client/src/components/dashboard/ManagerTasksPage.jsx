import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../../services/api.js';
import ManagerLayout from '../common/ManagerLayout.jsx';
import TaskDetailModal from '../tasks/TaskDetailModal.jsx';

export default function ManagerTasksPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const [projects, setProjects] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [users, setUsers] = useState([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('ALL');
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [selectedTask, setSelectedTask] = useState(null);
    const [selectedUserId, setSelectedUserId] = useState('');

    // Task detail modal state
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [detailTask, setDetailTask] = useState(null);
    const [responseText, setResponseText] = useState('');
    const [respondingToQuery, setRespondingToQuery] = useState(null);
    const [submittingResponse, setSubmittingResponse] = useState(false);

    const getCurrentPage = () => {
        if (location.pathname === '/manager' || location.pathname === '/manager/') return 'dashboard';
        if (location.pathname === '/manager/projects') return 'projects';
        if (location.pathname === '/manager/tasks') return 'tasks';
        if (location.pathname === '/manager/team') return 'team';
        return 'dashboard';
    };

    const currentPage = getCurrentPage();

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

    useEffect(() => {
        loadData();
    }, []);

    // Handle deep linking from search or dashboard
    useEffect(() => {
        if (location.state?.filter) {
            setFilter(location.state.filter);
        }
        if (location.state?.openTaskId && tasks.length > 0) {
            const taskToOpen = tasks.find(t => t.id === location.state.openTaskId);
            if (taskToOpen) {
                openDetailModal(taskToOpen);
                // Optional: Clear state to avoid reopening on refresh, but for now it's fine
                // window.history.replaceState({}, document.title);
            }
        }
    }, [tasks, location.state]);

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

    // Open task detail modal
    const openDetailModal = (task) => {
        setDetailTask(task);
        setShowDetailModal(true);
        setResponseText('');
        setRespondingToQuery(null);
    };

    // Respond to a query
    const handleRespondToQuery = async (queryId) => {
        console.log('📝 Manager responding to query:', { queryId, hasResponse: !!responseText.trim(), taskId: detailTask?.id });

        if (!queryId) {
            console.error('❌ Query ID is missing!');
            setError('Query ID is missing. Please refresh and try again.');
            return;
        }

        if (!responseText.trim() || !detailTask) return;
        try {
            setSubmittingResponse(true);
            await api.put(`/tasks/${detailTask.id}/queries/${queryId}/respond`, { response: responseText });
            setResponseText('');
            setRespondingToQuery(null);
            await loadData();
            // Refresh detail task with updated data
            const updatedTask = tasks.find(t => t.id === detailTask.id);
            if (updatedTask) setDetailTask(updatedTask);
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
            console.error('Failed to review delay:', err);
            setError(err.response?.data?.message || 'Failed to submit review');
        }
    };

    const filteredTasks =
        filter === 'ALL' ? tasks
            : filter === 'DELAYED' ? tasks.filter((t) => t.delayStatus && t.delayStatus !== 'NONE')
                : tasks.filter((t) => t.status === filter);


    return (
        <ManagerLayout currentPage={currentPage}>
            <div className="p-6 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    {/* Breadcrumb */}
                    <nav aria-label="Breadcrumb" className="flex mb-6">
                        <ol className="inline-flex items-center space-x-2">
                            <li>
                                <button
                                    onClick={() => navigate('/manager')}
                                    className="text-text-secondary hover:text-white text-sm font-medium transition-colors"
                                >
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
                            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">Tasks</h1>
                            <p className="text-text-secondary text-lg">Manage and track all team tasks.</p>
                        </div>
                        <div className="flex gap-3 flex-wrap">
                            {['ALL', 'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED'].map((status) => (
                                <button
                                    key={status}
                                    onClick={() => setFilter(status)}
                                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${filter === status
                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                                        : 'bg-surface-dark text-text-secondary hover:text-white border border-border-dark'
                                        }`}
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
                                <table className="w-full">
                                    <thead className="bg-background-dark/50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                                                Task
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                                                Project
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                                                Assignee
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                                                Status
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                                                Actions
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                                                Updates & Queries
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-dark">
                                        {filteredTasks.map((t) => {
                                            const assignee = users.find((u) => u.id === t.assigneeId);
                                            const pendingQueries = t.queries?.filter(q => q.status === 'PENDING').length || 0;
                                            return (
                                                <tr key={t.id} className="hover:bg-background-dark/30 transition-colors">
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
                                                                        if (reason) {
                                                                            handleManagerDelayReview(t.id, false, reason);
                                                                        }
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
                                                    {/* Updates & Queries Column */}
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
                                                                {t.comments && t.comments.length > 0 && (
                                                                    <span className="text-text-secondary">
                                                                        📝 {t.comments.length} updates
                                                                    </span>
                                                                )}
                                                                {pendingQueries > 0 && (
                                                                    <span className="text-amber-400 font-medium">
                                                                        ❓ {pendingQueries} pending
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {filteredTasks.length === 0 && (
                                            <tr>
                                                <td colSpan="6" className="px-6 py-8 text-center text-text-secondary">
                                                    No tasks found matching the filter.
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

            {/* Assign Task Modal */}
            {showAssignModal && selectedTask && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={() => setShowAssignModal(false)}
                    ></div>
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
                                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">
                                    Assign To
                                </label>
                                <select
                                    className="w-full appearance-none bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none cursor-pointer"
                                    value={selectedUserId}
                                    onChange={(e) => setSelectedUserId(e.target.value)}
                                >
                                    <option value="">Select a team member...</option>
                                    {users.map((user) => (
                                        <option key={user.id} value={user.id}>
                                            {user.name} ({user.role})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-border-dark flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setShowAssignModal(false)}
                                className="px-4 py-2 rounded-lg border border-border-dark text-white font-medium hover:bg-background-dark transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
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

            {/* Task Detail Modal - View Work Updates & Respond to Queries */}
            {showDetailModal && detailTask && (
                <TaskDetailModal
                    task={detailTask}
                    users={users}
                    onClose={() => setShowDetailModal(false)}
                    onUpdate={async () => {
                        await loadData();
                        // Also update the selected task in the list if needed, but loadData handles it
                    }}
                    canRespond={true}
                />
            )}
        </ManagerLayout>
    );
}
