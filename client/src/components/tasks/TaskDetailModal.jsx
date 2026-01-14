import { useState, useEffect } from 'react';
import api from '../../services/api.js';
import { getCurrentUser } from '../../services/authService.js';

export default function TaskDetailModal({ task, onClose, onUpdate, users = [], canRespond = true }) {
    const [currentTask, setCurrentTask] = useState(task);
    const [responseText, setResponseText] = useState('');
    const [respondingToQuery, setRespondingToQuery] = useState(null);
    const [submittingResponse, setSubmittingResponse] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Deadline editing state
    const [editingDeadline, setEditingDeadline] = useState(false);
    const [deadlineInput, setDeadlineInput] = useState('');
    const [savingDeadline, setSavingDeadline] = useState(false);

    const currentUser = getCurrentUser();
    const isManager = currentUser?.role === 'MANAGER' || currentUser?.role === 'SUPER_USER';

    useEffect(() => {
        let isMounted = true;
        const fetchTaskDetails = async () => {
            if (!task?.id) return;
            try {
                setLoading(true);
                const res = await api.get(`/tasks/${task.id}`);
                if (isMounted) {
                    setCurrentTask(res.data);
                    // Initialize deadline input if exists
                    if (res.data.deadline) {
                        const d = new Date(res.data.deadline);
                        setDeadlineInput(d.toISOString().slice(0, 16));
                    }
                }
            } catch (err) {
                console.error("Failed to fetch task details", err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        fetchTaskDetails();
        return () => { isMounted = false; };
    }, [task]);

    // Query helper
    const activeTask = currentTask || task;

    // Handle deadline update
    const handleDeadlineUpdate = async () => {
        const taskId = activeTask._id || activeTask.id;
        if (!taskId) return;
        try {
            setSavingDeadline(true);
            const res = await api.put(`/tasks/${taskId}`, {
                deadline: deadlineInput ? new Date(deadlineInput).toISOString() : null
            });

            // Update local task
            const updatedTask = { ...activeTask, deadline: deadlineInput ? new Date(deadlineInput) : null };
            setCurrentTask(updatedTask);
            if (onUpdate) onUpdate(updatedTask);
            setEditingDeadline(false);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.message || 'Failed to update deadline');
        } finally {
            setSavingDeadline(false);
        }
    };

    // Respond to a query
    const handleRespondToQuery = async (queryId) => {
        const taskId = activeTask._id || activeTask.id;
        if (!responseText.trim() || !taskId) return;
        try {
            setSubmittingResponse(true);
            const res = await api.put(`/tasks/${taskId}/queries/${queryId}/respond`, { response: responseText });

            // Local update of the task object
            const updatedTask = { ...activeTask };
            // Ensure queries array exists
            if (!updatedTask.queries) updatedTask.queries = [];

            const queryIndex = updatedTask.queries.findIndex(q => (q._id || q.id) === queryId);
            if (queryIndex !== -1) {
                updatedTask.queries[queryIndex] = res.data;
            } else {
                // If not found (shouldn't happen), reload the whole task
                const freshRes = await api.get(`/tasks/${taskId}`);
                setCurrentTask(freshRes.data);
                setResponseText('');
                setRespondingToQuery(null);
                setSubmittingResponse(false);
                return;
            }

            setCurrentTask(updatedTask);
            if (onUpdate) onUpdate(updatedTask);
            setResponseText('');
            setRespondingToQuery(null);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.message || 'Failed to respond to query');
        } finally {
            setSubmittingResponse(false);
        }
    };

    const handleCompleteTask = async () => {
        const taskId = activeTask._id || activeTask.id;
        if (!taskId) return;
        if (!window.confirm("Are you sure you want to mark this task as completed?")) return;

        try {
            setLoading(true);
            const res = await api.put(`/tasks/${taskId}`, { status: 'COMPLETED' });

            const updatedTask = res.data;
            setCurrentTask(updatedTask);
            if (onUpdate) onUpdate(updatedTask);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.message || 'Failed to complete task');
        } finally {
            setLoading(false);
        }
    };

    const isAssignee = currentUser && (currentUser.id === (activeTask.assigneeId?._id || activeTask.assigneeId));
    const showCompleteButton = activeTask.status !== 'COMPLETED' && (isManager || isAssignee);

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            ></div>
            <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface flex items-center justify-between shrink-0">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-blue-500">info</span>
                        Task Details
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-text-secondary hover:text-white transition-colors"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto flex-1">
                    {/* Task Info */}
                    <div className="bg-background-dark/30 rounded-lg p-4 border border-border-dark">
                        <h3 className="text-xl font-bold text-white mb-2">{activeTask.title}</h3>
                        <p className="text-text-secondary text-sm">{activeTask.description || 'No description provided.'}</p>
                        <div className="flex flex-wrap gap-4 mt-3 text-xs">
                            <span className={`px-2 py-0.5 rounded-full ${activeTask.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                {activeTask.status?.replace('_', ' ') || 'UNKNOWN'}
                            </span>
                            <span className="text-text-secondary flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">person</span>
                                {users.find(u => u.id === (activeTask.assigneeId?._id || activeTask.assigneeId))?.name || 'Unassigned'}
                            </span>
                        </div>

                        {/* Deadline Section */}
                        <div className="mt-4 pt-4 border-t border-border-dark/50">
                            <div className="flex items-center justify-between">
                                <span className="text-text-secondary text-sm flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[16px]">schedule</span>
                                    Deadline:
                                </span>
                                {editingDeadline ? (
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="datetime-local"
                                            value={deadlineInput}
                                            onChange={(e) => setDeadlineInput(e.target.value)}
                                            className="bg-background-dark border border-border-dark rounded px-2 py-1 text-white text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                        />
                                        <button
                                            onClick={handleDeadlineUpdate}
                                            disabled={savingDeadline}
                                            className="bg-primary hover:bg-primary-dark text-white px-2 py-1 rounded text-xs font-medium disabled:opacity-50"
                                        >
                                            {savingDeadline ? 'Saving...' : 'Save'}
                                        </button>
                                        <button
                                            onClick={() => setEditingDeadline(false)}
                                            className="text-text-secondary hover:text-white px-1"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">close</span>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        {activeTask.deadline ? (
                                            <span className="text-white text-sm">
                                                {new Date(activeTask.deadline).toLocaleString()}
                                            </span>
                                        ) : (
                                            <span className="text-text-secondary text-sm italic">Not set</span>
                                        )}
                                        {isManager && (
                                            <button
                                                onClick={() => setEditingDeadline(true)}
                                                className="text-primary hover:text-primary-light text-xs flex items-center gap-1"
                                            >
                                                <span className="material-symbols-outlined text-[14px]">edit</span>
                                                {activeTask.deadline ? 'Edit' : 'Set'}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Performance Info (if completed) */}
                            {activeTask.status === 'COMPLETED' && activeTask.performanceScore && (
                                <div className="mt-3 flex items-center gap-4 text-sm">
                                    <span className="text-text-secondary">Performance:</span>
                                    <span className={`font-bold ${activeTask.performanceScore >= 150 ? 'text-green-400' :
                                        activeTask.performanceScore >= 90 ? 'text-blue-400' :
                                            activeTask.performanceScore >= 50 ? 'text-yellow-400' :
                                                'text-red-400'
                                        }`}>
                                        {activeTask.performanceScore >= 150 ? '🚀' :
                                            activeTask.performanceScore >= 90 ? '✅' :
                                                activeTask.performanceScore >= 50 ? '⚠️' : '❌'} {activeTask.performanceScore}%
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    {/* Work Updates Section */}
                    <div>
                        <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-lg">edit_note</span>
                            Work Updates ({activeTask.comments?.length || 0})
                        </h3>
                        {activeTask.comments && activeTask.comments.length > 0 ? (
                            <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
                                {activeTask.comments.map((c, idx) => (
                                    <div key={c._id || c.id || idx} className="bg-background-dark/50 border border-border-dark rounded-lg p-3">
                                        <p className="text-white text-sm whitespace-pre-wrap">{c.text}</p>
                                        <p className="text-text-secondary text-xs mt-2 flex items-center gap-2">
                                            <span className="size-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] text-primary">
                                                {users.find(u => u.id === (c.userId?._id || c.userId))?.name?.charAt(0) || '?'}
                                            </span>
                                            {users.find(u => u.id === (c.userId?._id || c.userId))?.name || 'Unknown'} • {new Date(c.createdAt).toLocaleString()}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-text-secondary text-sm italic">No work updates yet.</p>
                        )}
                    </div>

                    {/* Queries Section */}
                    <div>
                        <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                            <span className="material-symbols-outlined text-amber-500 text-lg">help</span>
                            Queries ({activeTask.queries?.length || 0})
                        </h3>
                        {activeTask.queries && activeTask.queries.length > 0 ? (
                            <div className="space-y-4">
                                {activeTask.queries.map((q, idx) => {
                                    const qId = q._id || q.id;
                                    return (
                                        <div key={qId || idx} className={`border rounded-lg p-4 transition-colors ${q.status === 'PENDING' ? 'bg-amber-500/5 border-amber-500/30 hover:border-amber-500/50' : 'bg-green-500/5 border-green-500/30'}`}>
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1">
                                                    <p className="text-white text-sm font-medium">{q.question}</p>
                                                    <p className="text-text-secondary text-xs mt-1">
                                                        From: {q.userName || 'Unknown'} • {new Date(q.createdAt).toLocaleString()}
                                                    </p>
                                                </div>
                                                <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full ${q.status === 'PENDING' ? 'bg-amber-500/20 text-amber-400' : 'bg-green-500/20 text-green-400'}`}>
                                                    {q.status}
                                                </span>
                                            </div>

                                            {q.status === 'RESOLVED' && q.response && (
                                                <div className="mt-3 pt-3 border-t border-border-dark/50">
                                                    <p className="text-green-400 text-sm">
                                                        <span className="font-medium">Response:</span> {q.response}
                                                    </p>
                                                    <p className="text-text-secondary text-xs mt-1">
                                                        By: {q.respondedByName || 'Manager'} • {new Date(q.respondedAt).toLocaleString()}
                                                    </p>
                                                </div>
                                            )}

                                            {q.status === 'PENDING' && canRespond && (
                                                <div className="mt-3 pt-3 border-t border-border-dark/50">
                                                    {respondingToQuery === qId ? (
                                                        <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                                                            <textarea
                                                                className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none resize-none"
                                                                placeholder="Type your response..."
                                                                rows={2}
                                                                value={responseText}
                                                                onChange={(e) => setResponseText(e.target.value)}
                                                                autoFocus
                                                            ></textarea>
                                                            <div className="flex gap-2 justify-end">
                                                                <button
                                                                    onClick={() => { setRespondingToQuery(null); setResponseText(''); }}
                                                                    className="px-3 py-1.5 rounded-lg border border-border-dark text-white text-xs font-medium hover:bg-background-dark transition-colors"
                                                                >
                                                                    Cancel
                                                                </button>
                                                                <button
                                                                    onClick={() => handleRespondToQuery(qId)}
                                                                    disabled={!responseText.trim() || submittingResponse}
                                                                    className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 transition-colors disabled:opacity-50"
                                                                >
                                                                    {submittingResponse ? 'Sending...' : 'Send Response'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => setRespondingToQuery(qId)}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-colors border border-emerald-500/20"
                                                        >
                                                            <span className="material-symbols-outlined text-sm">reply</span>
                                                            Respond
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-text-secondary text-sm italic">No queries raised.</p>
                        )}
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-border-dark flex justify-end gap-3 bg-surface-dark shrink-0">
                    {showCompleteButton && (
                        <button
                            type="button"
                            onClick={handleCompleteTask}
                            disabled={loading}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                            <span className="material-symbols-outlined text-lg">check_circle</span>
                            Mark as Completed
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg border border-border-dark text-white font-medium hover:bg-background-dark transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
