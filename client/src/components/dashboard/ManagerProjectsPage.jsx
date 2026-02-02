import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import api from '../../services/api.js';
import { getCurrentUser } from '../../services/authService.js';
import ManagerLayout from '../common/ManagerLayout.jsx';
import TaskDetailModal from '../tasks/TaskDetailModal.jsx';

// Draggable Task Component


export default function ManagerProjectsPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const [projects, setProjects] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [users, setUsers] = useState([]); // All users available to manager (filtered by department backend side)
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('ALL');

    // Modal & Selection State
    const [selectedProject, setSelectedProject] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);

    // Task Detail Modal State
    const [showTaskDetail, setShowTaskDetail] = useState(false);
    const [selectedTaskDetail, setSelectedTaskDetail] = useState(null);

    // Add Task State
    const [showAddTask, setShowAddTask] = useState(false);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newTaskDescription, setNewTaskDescription] = useState('');
    const [newTaskDeadline, setNewTaskDeadline] = useState('');

    // Assignment Deadline Modal State
    const [showAssignDeadlineModal, setShowAssignDeadlineModal] = useState(false);
    const [pendingAssignment, setPendingAssignment] = useState(null); // { taskId, assigneeId, task }
    const [assignDeadline, setAssignDeadline] = useState('');

    // Add Member State
    const [showAddMember, setShowAddMember] = useState(false);

    // Collapsible & Attachments State
    const [isTasksExpanded, setIsTasksExpanded] = useState(true);
    const [isCompletedExpanded, setIsCompletedExpanded] = useState(false);
    const [isAttachmentsExpanded, setIsAttachmentsExpanded] = useState(false);

    const [showAttachmentsModal, setShowAttachmentsModal] = useState(false); // New State for Attachments Modal
    const [showMembersModal, setShowMembersModal] = useState(false); // New State for Members Modal
    const [isUploading, setIsUploading] = useState(false);
    const [attachmentName, setAttachmentName] = useState('');
    const [notification, setNotification] = useState(null); // { message, type: 'success' | 'error' }

    // Rejection Modal State
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [taskToReject, setTaskToReject] = useState(null);
    const [rejectionReason, setRejectionReason] = useState('');

    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => {
                setNotification(null);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    const handleUploadAttachment = async (e) => {
        if (!e.target.files || e.target.files.length === 0 || !selectedProject) return;

        const formData = new FormData();
        formData.append('customNames', attachmentName);
        Array.from(e.target.files).forEach(file => {
            formData.append('attachments', file);
        });

        try {
            setIsUploading(true);
            const res = await api.post(`/projects/${selectedProject.id}/attachments`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            // Update local state
            const updatedAttachments = res.data.attachments;
            setSelectedProject({ ...selectedProject, attachments: updatedAttachments });
            // Also update projects list if needed, though detail modal uses selectedProject
            setProjects(projects.map(p => p.id === selectedProject.id ? { ...p, attachments: updatedAttachments } : p));
            alert('Attachments uploaded successfully');
        } catch (err) {
            console.error(err);
            alert('Failed to upload attachments');
        } finally {
            setIsUploading(false);
            // Clear input
            e.target.value = null;
            setAttachmentName('');
        }
    };

    const handleRemoveAttachment = async (fileUrl) => {
        if (!selectedProject) return;
        if (!window.confirm('Are you sure you want to remove this attachment?')) return;

        try {
            const filename = fileUrl.split('/').pop();
            const res = await api.delete(`/projects/${selectedProject.id}/attachments/${filename}`);

            // Update local state
            const updatedAttachments = res.data.attachments;
            setSelectedProject({ ...selectedProject, attachments: updatedAttachments });
            setProjects(projects.map(p => p.id === selectedProject.id ? { ...p, attachments: updatedAttachments } : p));
        } catch (err) {
            console.error('Failed to remove attachment:', err);
            alert('Failed to remove attachment');
        }
    };

    const handleUnassignTask = async (taskId) => {
        try {
            const res = await api.put(`/tasks/${taskId}`, { assigneeId: null, status: 'NOT_STARTED' });
            // Update local state
            setTasks(tasks.map(t => t.id === taskId ? { ...t, assigneeId: null, status: 'NOT_STARTED' } : t));
        } catch (err) {
            console.error('Failed to unassign task:', err);
            // setError('Failed to unassign task'); // Optional
        }
    };

    const handleTaskApproval = async (taskId, status) => {
        try {
            await api.put(`/tasks/${taskId}`, { status });
            // Update local state
            setTasks(tasks.map(t => t.id === taskId ? { ...t, status } : t));
        } catch (err) {
            console.error('Failed to update task status:', err);
            alert('Failed to update task status');
        }
    };

    const handleRejectClick = (task) => {
        setTaskToReject(task);
        setRejectionReason('');
        setShowRejectModal(true);
    };

    const confirmReject = async (e) => {
        if (e) e.preventDefault();
        if (!taskToReject) return;

        try {
            await api.put(`/tasks/${taskToReject.id}`, {
                status: 'IN_PROGRESS',
                rejectionReason
            });
            // Update local state
            setTasks(tasks.map(t => t.id === taskToReject.id ? { ...t, status: 'IN_PROGRESS', rejectionReason } : t));
            setNotification({ message: 'Task Request Rejected', type: 'success' });
            setShowRejectModal(false);
            setTaskToReject(null);
        } catch (err) {
            console.error('Failed to reject task:', err);
            alert('Failed to reject task');
        }
    };

    const getCurrentPage = () => {
        if (location.pathname.startsWith('/manager')) return 'projects';
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

    const handleDeleteTask = async (taskId) => {
        try {
            console.log('Attempting to delete task:', taskId);
            await api.delete(`/tasks/${taskId}`);
            console.log('Task delete API success');
            setTasks(tasks.filter(t => t.id !== taskId));
            setNotification({ message: 'Task Deleted', type: 'success' });
        } catch (err) {
            console.error('Failed to delete task:', err);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleStatusChange = async (projectId, status) => {
        try {
            await api.put(`/projects/${projectId}`, { status });
            await loadData();
            // Update selected project if open
            if (selectedProject && selectedProject.id === projectId) {
                setSelectedProject(prev => ({ ...prev, status }));
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update status');
        }
    };

    const getTeamMembers = (project) => {
        if (!project || !project.teamIds) return [];
        return users.filter((u) => project.teamIds.includes(u.id));
    };

    const getAvailableMembers = (project) => {
        if (!project) return [];
        // Users NOT in the project team
        return users.filter(u => !project.teamIds?.includes(u.id));
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'ACTIVE': return 'bg-green-500/20 text-green-400';
            case 'COMPLETED': return 'bg-blue-500/20 text-blue-400';
            case 'ON_HOLD': return 'bg-orange-500/20 text-orange-400';
            default: return 'bg-gray-500/20 text-gray-400';
        }
    };

    const openDetailsModal = (project) => {
        setSelectedProject(project);
        setShowDetailsModal(true);
        setShowAddTask(false);
        setShowAddMember(false);
    };

    const openTaskDetail = (task) => {
        setSelectedTaskDetail(task);
        setShowTaskDetail(true);
    };

    // --- Actions ---

    const handleAddTask = async (e) => {
        e.preventDefault();
        try {
            const res = await api.post('/tasks', {
                title: newTaskTitle,
                description: newTaskDescription,
                projectId: selectedProject.id,
                deadline: newTaskDeadline ? new Date(newTaskDeadline) : null,
                // Assignee is left null intentionally so the manager can assign it later
            });
            setTasks([...tasks, res.data]);
            setNewTaskTitle('');
            setNewTaskDescription('');
            setNewTaskDeadline('');
            setShowAddTask(false);
            // Show notification
            setNotification({ message: 'New Task Created', type: 'success' });
        } catch (err) {
            console.error('Failed to create task', err);
        }
    };

    const handleAddTeamMember = async (userId) => {
        if (!selectedProject) return;
        try {
            const updatedTeamIds = [...(selectedProject.teamIds || []), userId];
            const res = await api.put(`/projects/${selectedProject.id}`, {
                teamIds: updatedTeamIds
            });
            // Update local state
            setProjects(projects.map(p => p.id === selectedProject.id ? { ...p, teamIds: updatedTeamIds } : p));
            setSelectedProject({ ...selectedProject, teamIds: updatedTeamIds });
        } catch (err) {
            console.error('Failed to add member', err);
        }
    };

    const handleRemoveTeamMember = async (userId) => {
        if (!selectedProject) return;
        try {
            // 1. Unassign tasks assigned to this user in this project
            const userTasks = tasks.filter(t => t.projectId === selectedProject.id && t.assigneeId === userId);

            if (userTasks.length > 0) {
                // Update local tasks state immediately (optimistic)
                setTasks(prevTasks => prevTasks.map(t => {
                    if (t.projectId === selectedProject.id && t.assigneeId === userId) {
                        return { ...t, assigneeId: null, status: 'NOT_STARTED' }; // Reset status to NOT_STARTED when unassigned
                    }
                    return t;
                }));

                // Execute unassignment requests in parallel
                await Promise.all(userTasks.map(task =>
                    api.put(`/tasks/${task.id}`, {
                        assigneeId: null,
                        status: 'NOT_STARTED'
                    })
                ));
            }

            // 2. Remove member from project
            const updatedTeamIds = selectedProject.teamIds.filter(id => id !== userId);
            const res = await api.put(`/projects/${selectedProject.id}`, {
                teamIds: updatedTeamIds
            });

            // Update local project state
            setProjects(projects.map(p => p.id === selectedProject.id ? { ...p, teamIds: updatedTeamIds } : p));
            setSelectedProject({ ...selectedProject, teamIds: updatedTeamIds });
        } catch (err) {
            console.error(err);
            loadData(); // Revert/Reload on error
        }
    };



    // Confirm assignment with deadline
    const handleConfirmAssignment = async () => {
        if (!pendingAssignment) return;

        const { taskId, assigneeId, isSelfAssign } = pendingAssignment;

        try {
            // Default to date only
            const deadlineDate = assignDeadline ? new Date(assignDeadline) : null;

            // Build update payload
            const updatePayload = {
                assigneeId,
                deadline: deadlineDate ? deadlineDate.toISOString() : null
            };

            // Add self-assignment tracking if this is a self-assign
            if (isSelfAssign) {
                updatePayload.selfAssignedBy = assigneeId;
                updatePayload.selfAssignedAt = new Date().toISOString();
            }

            // Optimistic UI Update
            setTasks(prev => prev.map(t =>
                t.id === taskId ? {
                    ...t,
                    assigneeId,
                    deadline: deadlineDate,
                    ...(isSelfAssign ? {
                        selfAssignedBy: assigneeId,
                        selfAssignedAt: new Date().toISOString()
                    } : {})
                } : t
            ));

            await api.put(`/tasks/${taskId}`, updatePayload);

            // Close modal
            setShowAssignDeadlineModal(false);
            setPendingAssignment(null);
            setAssignDeadline('');
        } catch (err) {
            console.error("Failed to assign task", err);
            loadData(); // Revert on error
        }
    };

    // Skip deadline and just assign
    const handleSkipDeadline = async () => {
        if (!pendingAssignment) return;

        const { taskId, assigneeId, isSelfAssign } = pendingAssignment;

        try {
            // Build update payload
            const updatePayload = { assigneeId };

            // Add self-assignment tracking if this is a self-assign
            if (isSelfAssign) {
                updatePayload.selfAssignedBy = assigneeId;
                updatePayload.selfAssignedAt = new Date().toISOString();
            }

            // Optimistic UI Update
            setTasks(prev => prev.map(t =>
                t.id === taskId ? {
                    ...t,
                    assigneeId,
                    ...(isSelfAssign ? {
                        selfAssignedBy: assigneeId,
                        selfAssignedAt: new Date().toISOString()
                    } : {})
                } : t
            ));

            await api.put(`/tasks/${taskId}`, updatePayload);

            // Close modal
            setShowAssignDeadlineModal(false);
            setPendingAssignment(null);
            setAssignDeadline('');
        } catch (err) {
            console.error("Failed to assign task", err);
            loadData(); // Revert on error
        }
    };

    // "Approve Completion" Logic
    const isProjectReadyForCompletion = selectedProject &&
        selectedProject.status !== 'COMPLETED' &&
        tasks.filter(t => t.projectId === selectedProject.id).length > 0 &&
        tasks.filter(t => t.projectId === selectedProject.id).every(t => t.status === 'COMPLETED');

    const handleApproveCompletion = async () => {
        if (!selectedProject) return;
        if (!window.confirm('All tasks are completed. Mark project as COMPLETED?')) return;
        await handleStatusChange(selectedProject.id, 'COMPLETED');
    };

    const filteredProjects = filter === 'ALL' ? projects : projects.filter((p) => p.status === filter);

    // --- New Design State (Table View) ---
    const [taskFilter, setTaskFilter] = useState('ALL'); // 'ALL', 'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'
    const [taskSearchQuery, setTaskSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 5;

    // User Picker State (Replacing Drag & Drop Assignment)
    const [showUserPicker, setShowUserPicker] = useState(null); // taskId or null
    const [userPickerPosition, setUserPickerPosition] = useState({ x: 0, y: 0 });

    // Function to handle "Assign" click
    const handleAssignClick = (e, task) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        // Position relative to viewport, handling edge cases
        setUserPickerPosition({ x: rect.left, y: rect.bottom + 5 });
        setShowUserPicker(task.id);
    };

    // Filter Logic for the Table
    const getProjectTasks = () => {
        if (!selectedProject) return [];
        let pTasks = tasks.filter(t => t.projectId === selectedProject.id);

        // Status Filter
        if (taskFilter !== 'ALL') {
            if (taskFilter === 'NOT_STARTED') {
                pTasks = pTasks.filter(t => !t.assigneeId && t.status !== 'COMPLETED');
            } else if (taskFilter === 'IN_PROGRESS') {
                pTasks = pTasks.filter(t => t.status === 'IN_PROGRESS' || (t.assigneeId && t.status !== 'COMPLETED'));
            } else if (taskFilter === 'COMPLETED') {
                pTasks = pTasks.filter(t => t.status === 'COMPLETED');
            }
        }

        // Search Filter
        if (taskSearchQuery) {
            const lowerQ = taskSearchQuery.toLowerCase();
            pTasks = pTasks.filter(t =>
                (t.title && t.title.toLowerCase().includes(lowerQ)) ||
                (t.description && t.description.toLowerCase().includes(lowerQ))
            );
        }

        return pTasks;
    };

    const projectTasks = getProjectTasks();
    const totalPages = Math.ceil(projectTasks.length / itemsPerPage);
    const paginatedTasks = projectTasks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    // Color Helpers for new design
    const getStatusBadgeStyles = (status, isAssigned) => {
        if (status === 'COMPLETED') return { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', label: 'COMPLETED' };

        // Fix: If not assigned, it cannot be IN PROGRESS effectively (unless we allow that). 
        // User requested: "task itself not assigned to but see status of tha is inprogrss something bug happened there"
        // So they view it as a bug. We should mask it as NOT STARTED or force NOT STARTED.
        // Let's hide IN_PROGRESS if no assignee.
        if (status === 'IN_PROGRESS' && isAssigned) return { bg: 'bg-emerald-500/10', text: 'text-emerald-500', border: 'border-emerald-500/20', label: 'IN PROGRESS' };

        if (isAssigned && status === 'NOT_STARTED') return { bg: 'bg-emerald-500/10', text: 'text-emerald-500', border: 'border-emerald-500/20', label: 'ASSIGNED' };
        return { bg: 'bg-slate-800', text: 'text-slate-400', border: 'border-slate-700', label: 'NOT STARTED' };
    };

    return (
        <ManagerLayout currentPage="projects">
            {notification && (
                <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[10000] animate-in fade-in zoom-in duration-300">
                    <div className="bg-[#0a0f1d] border border-slate-800 rounded-2xl shadow-2xl p-6 flex flex-col items-center gap-3 min-w-[200px]">
                        <button
                            onClick={() => setNotification(null)}
                            className="absolute top-2 right-2 text-slate-500 hover:text-white"
                        >
                            <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                        <div className="w-12 h-12 rounded-full border-2 border-emerald-500/20 flex items-center justify-center">
                            <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                                <span className="material-symbols-outlined text-white text-lg font-bold">check</span>
                            </div>
                        </div>
                        <div className="text-center">
                            <h3 className="text-white font-bold text-base">{notification.message}</h3>
                            <p className="text-slate-500 text-xs">Just now</p>
                        </div>
                    </div>
                </div>
            )}
            <div className="p-6 lg:px-12 pb-24 h-full">
                <div className="max-w-7xl mx-auto w-full h-full flex flex-col">
                    {/* Header & Filter */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 shrink-0">
                        <div>
                            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">Projects</h1>
                            <p className="text-text-secondary text-lg">Monitor and manage all team projects.</p>
                        </div>
                        <div className="flex gap-3">
                            {['ALL', 'ACTIVE', 'PLANNING', 'COMPLETED'].map((status) => (
                                <button
                                    key={status}
                                    onClick={() => setFilter(status)}
                                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${filter === status
                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                                        : 'bg-surface-dark text-text-secondary hover:text-white border border-border-dark'
                                        }`}
                                >
                                    {status === 'ALL' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase()}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Content */}
                    {loading ? (
                        <div className="bg-surface-dark border border-border-dark rounded-xl p-8 text-center">
                            <p className="text-text-secondary">Loading projects...</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-y-auto pb-4">
                            {filteredProjects.map((p) => {
                                const projectTasks = tasks.filter((t) => t.projectId === p.id);
                                const completed = projectTasks.filter((t) => t.status === 'COMPLETED').length;
                                const progress = projectTasks.length > 0 ? Math.round((completed / projectTasks.length) * 100) : 0;
                                const projectMembers = users.filter((u) => p.teamIds?.includes(u.id));

                                return (
                                    <div
                                        key={p.id}
                                        onClick={() => openDetailsModal(p)}
                                        className="bg-surface-dark border border-border-dark rounded-xl shadow-xl overflow-hidden hover:border-emerald-500/50 transition-colors cursor-pointer relative group h-full max-h-[300px] flex flex-col"
                                    >
                                        <div className="p-6 flex-1 flex flex-col">
                                            <div className="flex items-start justify-between mb-4">
                                                <div>
                                                    <h3 className="text-white font-semibold text-lg">{p.name}</h3>
                                                    {p.projectCode && (
                                                        <p className="text-primary text-xs font-mono">{p.projectCode}</p>
                                                    )}
                                                    <p className="text-text-secondary text-sm mt-1 line-clamp-2">
                                                        {p.description || 'No description'}
                                                    </p>
                                                </div>
                                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(p.status)}`}>
                                                    {p.status}
                                                </span>
                                            </div>

                                            {/* Budget Display (Manager only section - only shows if assigned by Super) */}
                                            {p.budget > 0 && (
                                                <div className="mb-4 flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-emerald-400 text-sm">payments</span>
                                                    <span className="text-white text-sm font-semibold">₹ {p.budget?.toLocaleString('en-IN')}</span>
                                                </div>
                                            )}

                                            {/* Progress */}
                                            <div className="mb-4">
                                                <div className="flex justify-between text-sm mb-2">
                                                    <span className="text-text-secondary">Progress</span>
                                                    <span className="text-white">{progress}%</span>
                                                </div>
                                                <div className="h-2 bg-background-dark rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-all"
                                                        style={{ width: `${progress}%` }}
                                                    ></div>
                                                </div>
                                            </div>

                                            {/* Stats */}
                                            <div className="flex items-center gap-4 text-sm mb-4">
                                                <div className="flex items-center gap-1 text-text-secondary">
                                                    <span className="material-symbols-outlined text-base">task_alt</span>
                                                    <span>{projectTasks.length} tasks</span>
                                                </div>
                                                <div className="flex items-center gap-1 text-text-secondary">
                                                    <span className="material-symbols-outlined text-base">group</span>
                                                    <span>{projectMembers.length} members</span>
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="mt-auto flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                <select
                                                    className="flex-1 bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none cursor-pointer"
                                                    value={p.status}
                                                    onChange={(e) => handleStatusChange(p.id, e.target.value)}
                                                >
                                                    <option value="PLANNING">Planning</option>
                                                    <option value="ACTIVE">Active</option>
                                                    <option value="COMPLETED">Completed</option>
                                                </select>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openDetailsModal(p);
                                                    }}
                                                    className="p-2 rounded-lg bg-background-dark border border-border-dark text-text-secondary hover:text-white hover:bg-surface-dark transition-colors"
                                                    title="View Details"
                                                >
                                                    <span className="material-symbols-outlined">visibility</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Enhanced Project Details Modal - NEW DESIGN VARIANT 2 */}
            {showDetailsModal && selectedProject && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <div
                        className="bg-[#0a0f1d] border border-slate-800 w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[85vh] max-h-[90vh]"
                        onClick={() => setShowUserPicker(null)}
                    >
                        {/* Header */}
                        <div className="px-4 py-4 md:px-8 md:py-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/20 shrink-0">
                            <div className="flex items-center space-x-4">
                                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                                    <span className="material-symbols-outlined text-2xl">assignment_turned_in</span>
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-xl font-bold text-white leading-tight truncate">{selectedProject.name}</h2>
                                    <p className="text-sm text-slate-500 truncate">Assign team members and track task status</p>
                                </div>
                            </div>
                            <div className="flex items-center space-x-4">
                                <button
                                    onClick={() => setShowDetailsModal(false)}
                                    className="p-2 text-slate-500 hover:text-white transition-colors"
                                >
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                        </div>

                        {/* Controls: Filter & Search */}
                        <div className="px-4 py-4 md:px-8 md:py-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
                            <div className="flex items-center space-x-1 bg-slate-900/40 p-1 rounded-xl border border-slate-800 self-start overflow-x-auto max-w-full no-scrollbar">
                                {['ALL', 'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'].map((f) => (
                                    <button
                                        key={f}
                                        onClick={() => { setTaskFilter(f); setCurrentPage(1); }}
                                        className={`px-3 py-1.5 md:px-5 md:py-2 rounded-lg text-xs font-bold transition-colors uppercase tracking-wider whitespace-nowrap ${taskFilter === f
                                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                            : 'text-slate-500 hover:text-white'
                                            }`}
                                    >
                                        {f.replace('_', ' ')}
                                    </button>
                                ))}
                            </div>
                            <div className="relative w-full md:w-80">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">search</span>
                                <input
                                    type="text"
                                    value={taskSearchQuery}
                                    onChange={(e) => { setTaskSearchQuery(e.target.value); setCurrentPage(1); }}
                                    className="w-full bg-slate-900/50 border border-slate-800 rounded-lg py-2 pl-10 pr-4 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 placeholder-slate-600"
                                    placeholder="Filter tasks..."
                                />
                            </div>
                        </div>

                        {/* Add Task Bar */}
                        <div className="px-4 pb-4 md:px-8 md:pb-6 shrink-0">
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    handleAddTask(e);
                                }}
                                className="flex flex-col md:flex-row items-stretch md:items-center gap-3"
                            >
                                <div className="flex-1 flex flex-col md:flex-row gap-3">
                                    <div className="flex-[1.5] relative">
                                        <input
                                            type="text"
                                            value={newTaskTitle}
                                            onChange={(e) => setNewTaskTitle(e.target.value)}
                                            className="w-full bg-slate-900/30 border-2 border-[#2563eb]/60 rounded-xl py-2 px-4 md:py-3 md:px-6 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-[#2563eb]/10 transition-all"
                                            placeholder="Task Title..."
                                        />
                                    </div>
                                    <div className="flex-[2] relative">
                                        <input
                                            type="text"
                                            value={newTaskDescription}
                                            onChange={(e) => setNewTaskDescription(e.target.value)}
                                            className="w-full bg-slate-900/30 border-2 border-[#2563eb]/60 rounded-xl py-2 pl-4 pr-12 md:py-3 md:pl-6 md:pr-36 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-[#2563eb]/10 transition-all"
                                            placeholder="Description (optional)..."
                                        />
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                            <div className="relative">
                                                <div className={`flex items-center gap-2 px-2 py-1 md:px-3 md:py-1.5 rounded-lg border transition-colors ${newTaskDeadline ? 'bg-blue-500/20 border-blue-500/30 text-blue-400' : 'bg-slate-800/50 border-slate-700/50 text-slate-500 hover:text-slate-400 hover:bg-slate-800'}`}>
                                                    <span className="material-symbols-outlined text-lg">calendar_today</span>
                                                    <span className={`text-xs font-medium whitespace-nowrap hidden md:inline ${!newTaskDeadline && 'hidden'}`}>
                                                        {newTaskDeadline ? new Date(newTaskDeadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
                                                    </span>
                                                </div>
                                                <input
                                                    type="date"
                                                    value={newTaskDeadline}
                                                    onChange={(e) => setNewTaskDeadline(e.target.value)}
                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                    title="Set Deadline"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <button type="submit" className="flex items-center justify-center space-x-2 px-6 py-2 md:py-3 bg-[#2563eb] hover:bg-blue-600 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-900/20 whitespace-nowrap">
                                    <span className="material-symbols-outlined text-lg">add</span>
                                    <span>Add Task</span>
                                </button>
                            </form>
                        </div>

                        {/* Table Content */}
                        <div className="flex-1 overflow-auto custom-scrollbar px-4 pb-4 md:px-8 md:pb-8">
                            <div className="bg-slate-900/20 border border-slate-800 rounded-xl overflow-hidden min-h-[300px]">
                                <table className="w-full text-left border-collapse">
                                    <thead className="sticky top-0 bg-[#0a0f1d] z-10">
                                        <tr className="bg-slate-900/50 border-b border-slate-800">
                                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Task</th>
                                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Assignee</th>
                                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Status</th>
                                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Deadline</th>
                                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800">
                                        {paginatedTasks.length > 0 ? (
                                            paginatedTasks.map((task) => {
                                                const currentUser = getCurrentUser();
                                                const assignee = users.find(u => u.id === task.assigneeId) || (task.assigneeId === currentUser?.id ? { ...currentUser, name: currentUser.name || 'Me' } : null);
                                                const badgeStyle = getStatusBadgeStyles(task.status, !!task.assigneeId);
                                                const deadline = task.deadline ? new Date(task.deadline) : null;
                                                const isOverdue = deadline && deadline < new Date() && task.status !== 'COMPLETED';

                                                return (
                                                    <tr key={task.id} className="hover:bg-slate-800/20 transition-colors group">
                                                        <td className="px-6 py-5">
                                                            <div className={`font-bold text-sm ${task.status === 'COMPLETED' ? 'text-slate-500 line-through' : 'text-white'}`}>
                                                                {task.title}
                                                            </div>
                                                            <div className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[200px]">
                                                                {task.description || 'No description provided'}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-5">
                                                            {assignee ? (
                                                                <div className="flex items-center space-x-2">
                                                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm ${assignee.id === getCurrentUser()?.id ? 'bg-indigo-500 shadow-indigo-900/20' : 'bg-emerald-600 shadow-emerald-900/20'}`}>
                                                                        {assignee.name.charAt(0)}
                                                                    </div>
                                                                    <span className="text-xs text-slate-300">{assignee.name}</span>
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center space-x-2">
                                                                    <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-400">?</div>
                                                                    <span className="text-xs text-slate-500 italic">Unassigned</span>
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-5">
                                                            <div className="flex justify-center flex-col items-center">
                                                                <span className={`px-2.5 py-1 text-[10px] font-bold rounded-md ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border} border uppercase whitespace-nowrap`}>
                                                                    {task.status === 'WAITING_APPROVAL' ? 'WAITING APPROVAL' : badgeStyle.label}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-5">
                                                            {deadline ? (
                                                                <div className={`flex items-center space-x-2 ${isOverdue ? 'text-rose-400' : task.status === 'COMPLETED' ? 'text-emerald-500' : 'text-slate-400'}`}>
                                                                    <span className="material-symbols-outlined text-base">
                                                                        {task.status === 'COMPLETED' ? 'check_circle' : isOverdue ? 'event_busy' : 'calendar_today'}
                                                                    </span>
                                                                    <span className="text-xs">{deadline.toLocaleDateString()}</span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-xs text-slate-600">-</span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-5">
                                                            <div className="flex items-center justify-center space-x-2 relative">
                                                                {!task.assigneeId && task.status !== 'COMPLETED' && (
                                                                    <button
                                                                        onClick={(e) => handleAssignClick(e, task)}
                                                                        className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[11px] font-bold transition-all shadow-lg shadow-emerald-900/20"
                                                                    >
                                                                        <span className="material-symbols-outlined text-sm">person_add</span>
                                                                        <span>Assign</span>
                                                                    </button>
                                                                )}

                                                                {/* Mark as Completed Button for Self-Assigned Tasks */}
                                                                {task.assigneeId === currentUser?.id && task.status !== 'COMPLETED' && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (window.confirm('Mark this task as completed?')) {
                                                                                handleTaskApproval(task.id, 'COMPLETED');
                                                                            }
                                                                        }}
                                                                        className="p-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-500 hover:text-green-400 rounded-lg transition-all"
                                                                        title="Mark as Completed"
                                                                    >
                                                                        <span className="material-symbols-outlined text-lg">check_circle</span>
                                                                    </button>
                                                                )}

                                                                {/* Re-assign or Change Status button for assigned tasks */}
                                                                {task.assigneeId && task.status !== 'COMPLETED' && (
                                                                    <button
                                                                        onClick={(e) => handleAssignClick(e, task)}
                                                                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-all"
                                                                        title="Reassign"
                                                                    >
                                                                        <span className="material-symbols-outlined text-lg">person_add</span>
                                                                    </button>
                                                                )}

                                                                {/* Reopen Completed Task */}
                                                                {task.status === 'COMPLETED' && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (window.confirm('Reopen this task? Status will be set to IN PROGRESS.')) {
                                                                                handleTaskApproval(task.id, 'IN_PROGRESS');
                                                                            }
                                                                        }}
                                                                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-all"
                                                                        title="Reopen Task"
                                                                    >
                                                                        <span className="material-symbols-outlined text-lg">undo</span>
                                                                    </button>
                                                                )}

                                                                {/* Approve/Reject for Waiting Approval */}
                                                                {task.status === 'WAITING_APPROVAL' && (
                                                                    <>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                if (window.confirm('Approve this task as COMPLETED?')) {
                                                                                    handleTaskApproval(task.id, 'COMPLETED');
                                                                                }
                                                                            }}
                                                                            className="p-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-500 hover:text-green-400 rounded-lg transition-all"
                                                                            title="Approve Task"
                                                                        >
                                                                            <span className="material-symbols-outlined text-lg">check_circle</span>
                                                                        </button>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleRejectClick(task);
                                                                            }}
                                                                            className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 rounded-lg transition-all"
                                                                            title="Reject Task"
                                                                        >
                                                                            <span className="material-symbols-outlined text-lg">cancel</span>
                                                                        </button>
                                                                    </>
                                                                )}

                                                                {/* Delete Task Button */}
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDeleteTask(task.id);
                                                                    }}
                                                                    className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 rounded-lg transition-all ml-1"
                                                                    title="Delete Task"
                                                                >
                                                                    <span className="material-symbols-outlined text-lg">delete</span>
                                                                </button>

                                                                <button
                                                                    onClick={() => openTaskDetail(task)}
                                                                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-all"
                                                                    title="View Details"
                                                                >
                                                                    <span className="material-symbols-outlined text-lg">visibility</span>
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        ) : (
                                            <tr>
                                                <td colSpan="5" className="px-6 py-10 text-center text-slate-500 text-sm">
                                                    No tasks found matching current filters.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-8 py-6 border-t border-slate-800 bg-slate-900/30 flex items-center justify-between mt-auto shrink-0">
                            <div className="flex items-center space-x-6">
                                <button
                                    onClick={() => setShowAttachmentsModal(true)}
                                    className="flex items-center space-x-2 text-slate-500 hover:text-emerald-400 transition-colors group"
                                >
                                    <span className="material-symbols-outlined text-xl group-hover:scale-110 transition-transform">attach_file</span>
                                    <span className="text-[10px] font-bold uppercase tracking-widest group-hover:underline decoration-emerald-500/50 underline-offset-4">{selectedProject.attachments?.length || 0} Attachments</span>
                                </button>

                                <button
                                    onClick={() => setShowMembersModal(true)}
                                    className="flex items-center space-x-2 text-slate-500 hover:text-blue-400 transition-colors group"
                                >
                                    <span className="material-symbols-outlined text-xl group-hover:scale-110 transition-transform">group</span>
                                    <span className="text-[10px] font-bold uppercase tracking-widest group-hover:underline decoration-blue-500/50 underline-offset-4">{getTeamMembers(selectedProject).length} Members</span>
                                </button>
                            </div>
                            <div className="flex items-center space-x-4">
                                <span className="text-[11px] text-slate-500 font-medium">
                                    Showing {Math.min((currentPage - 1) * itemsPerPage + 1, projectTasks.length)} - {Math.min(currentPage * itemsPerPage, projectTasks.length)} of {projectTasks.length} tasks
                                </span>
                                <div className="flex items-center space-x-2">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="p-1.5 rounded-lg bg-slate-800 text-slate-500 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <span className="material-symbols-outlined text-lg leading-none">chevron_left</span>
                                    </button>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages || totalPages === 0}
                                        className="p-1.5 rounded-lg bg-slate-800 text-slate-500 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <span className="material-symbols-outlined text-lg leading-none">chevron_right</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* User Picker Popover/Dropdown */}
                        {showUserPicker && (
                            <div
                                className="fixed z-[60] bg-[#111827] border border-slate-700 rounded-lg shadow-xl w-64 animate-in fade-in zoom-in-95 duration-100 p-2 max-h-60 overflow-y-auto custom-scrollbar"
                                style={{
                                    top: `${Math.min(userPickerPosition.y, window.innerHeight - 250)}px`,
                                    left: `${Math.min(userPickerPosition.x - 100, window.innerWidth - 270)}px`
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="text-[10px] font-bold text-slate-500 uppercase px-2 py-1 mb-1">Select Member</div>
                                {/* Assign to Self option */}
                                <button
                                    onClick={() => {
                                        const me = getCurrentUser();
                                        const task = tasks.find(t => t.id === showUserPicker);
                                        setPendingAssignment({ taskId: showUserPicker, assigneeId: me.id, task, isSelfAssign: true });
                                        setAssignDeadline(task?.deadline ? new Date(task.deadline).toISOString().slice(0, 10) : '');
                                        setShowAssignDeadlineModal(true);
                                        setShowUserPicker(null);
                                    }}
                                    className="w-full text-left px-3 py-2 rounded hover:bg-slate-800 flex items-center gap-2 group"
                                >
                                    <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-xs text-white">Me</div>
                                    <div className="flex-1">
                                        <p className="text-sm text-slate-200 group-hover:text-white">Assign to Myself</p>
                                    </div>
                                </button>

                                <div className="h-px bg-slate-700 my-1"></div>

                                {/* Project Members */}
                                {getTeamMembers(selectedProject).length > 0 ? (
                                    getTeamMembers(selectedProject).map(u => (
                                        <button
                                            key={u.id}
                                            onClick={() => {
                                                const task = tasks.find(t => t.id === showUserPicker);
                                                setPendingAssignment({ taskId: showUserPicker, assigneeId: u.id, task });
                                                setAssignDeadline(task?.deadline ? new Date(task.deadline).toISOString().slice(0, 10) : '');
                                                setShowAssignDeadlineModal(true);
                                                setShowUserPicker(null);
                                            }}
                                            className="w-full text-left px-3 py-2 rounded hover:bg-slate-800 flex items-center gap-2 group"
                                        >
                                            <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs text-slate-300">{u.name.charAt(0)}</div>
                                            <div className="flex-1">
                                                <p className="text-sm text-slate-300 group-hover:text-white">{u.name}</p>
                                                <p className="text-[10px] text-slate-500">{u.role}</p>
                                            </div>
                                        </button>
                                    ))
                                ) : (
                                    <div className="p-2 text-xs text-slate-500 text-center">No team members added.</div>
                                )}

                                <div className="h-px bg-slate-700 my-1"></div>
                                <div className="text-[10px] font-bold text-slate-500 uppercase px-2 py-1">Other Users</div>
                                {getAvailableMembers(selectedProject).map(u => (
                                    <button
                                        key={u.id}
                                        onClick={() => {
                                            if (window.confirm(`Add ${u.name} to project team and assign task?`)) {
                                                handleAddTeamMember(u.id).then(() => {
                                                    const task = tasks.find(t => t.id === showUserPicker);
                                                    setPendingAssignment({ taskId: showUserPicker, assigneeId: u.id, task });
                                                    setAssignDeadline(task?.deadline ? new Date(task.deadline).toISOString().slice(0, 10) : '');
                                                    setShowAssignDeadlineModal(true);
                                                    setShowUserPicker(null);
                                                });
                                            }
                                        }}
                                        className="w-full text-left px-3 py-2 rounded hover:bg-slate-800 flex items-center gap-2 group opacity-70 hover:opacity-100"
                                    >
                                        <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs text-slate-500">{u.name.charAt(0)}</div>
                                        <p className="text-sm text-slate-400 group-hover:text-white">{u.name}</p>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )
            }



            {/* Attachments Center Modal */}
            {
                showAttachmentsModal && selectedProject && (
                    <div className="fixed inset-0 z-[10000] flex items-center justify-center">
                        <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowAttachmentsModal(false)}></div>
                        <div className="relative bg-[#0F172A] border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-200">

                            {/* Header */}
                            <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                                        <span className="material-symbols-outlined">folder_open</span>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white">Attachment Center</h3>
                                        <p className="text-xs text-slate-400">Manage files for {selectedProject.name}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowAttachmentsModal(false)}
                                    className="p-2 rounded-full hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                                >
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6">

                                {/* Upload Section */}
                                <div className="relative bg-slate-900/30 border-2 border-dashed border-slate-700 hover:border-blue-500/50 rounded-xl p-6 transition-all group">
                                    <div className="flex flex-col items-center justify-center text-center gap-3">
                                        <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center group-hover:bg-blue-500/20 group-hover:text-blue-400 transition-colors">
                                            <span className="material-symbols-outlined text-2xl">cloud_upload</span>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-white">Click to upload files</p>
                                            <p className="text-xs text-slate-500 mt-1">SVG, PNG, JPG or PDF (max. 10MB)</p>
                                        </div>
                                        <input
                                            type="file"
                                            multiple
                                            onChange={handleUploadAttachment}
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                            disabled={isUploading}
                                        />
                                    </div>
                                    {isUploading && (
                                        <div className="mt-4 flex items-center justify-center gap-2 text-blue-400 text-sm">
                                            <span className="material-symbols-outlined animate-spin">progress_activity</span>
                                            Uploading...
                                        </div>
                                    )}
                                </div>

                                {/* Attachments List */}
                                <div>
                                    <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-3">
                                        Attached Files ({selectedProject.attachments?.length || 0})
                                    </h4>

                                    <div className="space-y-2">
                                        {selectedProject.attachments && selectedProject.attachments.length > 0 ? (
                                            selectedProject.attachments.map((file, idx) => (
                                                <div key={idx} className="flex items-center gap-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 hover:bg-slate-800 transition-colors group">
                                                    <div className="w-10 h-10 rounded bg-slate-700 flex items-center justify-center text-slate-400 shrink-0">
                                                        <span className="material-symbols-outlined">description</span>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-white truncate">{file.name}</p>
                                                        <p className="text-xs text-slate-500">
                                                            {new Date(file.uploadedAt).toLocaleDateString()} • {file.size ? (file.size / 1024).toFixed(1) + ' KB' : 'Unknown size'}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-1 transition-opacity">

                                                        <a
                                                            href={`/api${file.url}`}
                                                            download
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="p-2 rounded hover:bg-slate-700 text-slate-400 hover:text-emerald-400 transition-colors"
                                                            title="Download"
                                                        >
                                                            <span className="material-symbols-outlined text-xl">download</span>
                                                        </a>
                                                        <button
                                                            onClick={() => handleRemoveAttachment(file.url)}
                                                            className="p-2 rounded hover:bg-slate-700 text-slate-400 hover:text-red-400 transition-colors"
                                                            title="Delete"
                                                        >
                                                            <span className="material-symbols-outlined text-xl">delete</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center py-8 border border-dashed border-slate-800 rounded-lg">
                                                <span className="material-symbols-outlined text-4xl text-slate-700 mb-2">folder_off</span>
                                                <p className="text-slate-500 text-sm">No files attached to this project yet.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                )
            }




            {/* Members Management Modal */}
            {showMembersModal && selectedProject && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowMembersModal(false)}></div>
                    <div className="relative bg-[#0F172A] border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-200">

                        {/* Header */}
                        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                                    <span className="material-symbols-outlined">group</span>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">Team Management</h3>
                                    <p className="text-xs text-slate-400">Manage members for {selectedProject.name}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowMembersModal(false)}
                                className="p-2 rounded-full hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">

                            {/* Current Members */}
                            <div>
                                <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-3">
                                    Current Team ({getTeamMembers(selectedProject).length})
                                </h4>
                                <div className="space-y-2">
                                    {getTeamMembers(selectedProject).length > 0 ? (
                                        getTeamMembers(selectedProject).map(u => (
                                            <div key={u.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 group">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 font-medium text-sm">
                                                        {u.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium text-white">{u.name}</p>
                                                        <p className="text-[10px] text-slate-500">{u.role} • {u.department}</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        if (window.confirm(`Remove ${u.name} from the project team?`)) {
                                                            handleRemoveTeamMember(u.id);
                                                        }
                                                    }}
                                                    className="p-2 rounded hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Remove from team"
                                                >
                                                    <span className="material-symbols-outlined text-lg">person_remove</span>
                                                </button>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-slate-500 text-sm italic text-center py-2">No members assigned yet.</p>
                                    )}
                                </div>
                            </div>

                            <div className="h-px bg-slate-800"></div>

                            {/* Add Members */}
                            <div>
                                <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-3">
                                    Add Team Members
                                </h4>
                                <div className="space-y-2">
                                    {getAvailableMembers(selectedProject).length > 0 ? (
                                        getAvailableMembers(selectedProject).map(u => (
                                            <div key={u.id} className="flex items-center justify-between p-3 hover:bg-slate-800/30 rounded-lg border border-transparent hover:border-slate-800 transition-colors group">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 text-sm">
                                                        {u.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">{u.name}</p>
                                                        <p className="text-[10px] text-slate-600 group-hover:text-slate-500">{u.role} • {u.department}</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleAddTeamMember(u.id)}
                                                    className="px-3 py-1.5 rounded bg-indigo-500/10 hover:bg-indigo-500 text-indigo-400 hover:text-white text-xs font-medium transition-all"
                                                >
                                                    Add
                                                </button>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-slate-500 text-sm italic text-center py-2">No other users available to add.</p>
                                    )}
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            )}

            {/* Shared Task Detail Modal */}
            {
                showTaskDetail && selectedTaskDetail && (
                    <TaskDetailModal
                        task={selectedTaskDetail}
                        onClose={() => setShowTaskDetail(false)}
                        onUpdate={(updatedTask) => {
                            setTasks(tasks.map(t => t.id === updatedTask.id ? updatedTask : t));
                            setSelectedTaskDetail(updatedTask);
                        }}
                        users={users}
                    />
                )
            }

            {/* Assignment Deadline Modal */}
            {
                showAssignDeadlineModal && pendingAssignment && (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => {
                            setShowAssignDeadlineModal(false);
                            setPendingAssignment(null);
                            setAssignDeadline('');
                        }}></div>
                        <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200">
                            <div className={`px-6 py-4 border-b border-border-dark ${pendingAssignment.isSelfAssign ? 'bg-gradient-to-r from-indigo-900/50 to-purple-900/50' : 'bg-gradient-surface'}`}>
                                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                    <span className={`material-symbols-outlined ${pendingAssignment.isSelfAssign ? 'text-indigo-400' : 'text-primary'}`}>
                                        {pendingAssignment.isSelfAssign ? 'person_add' : 'schedule'}
                                    </span>
                                    {pendingAssignment.isSelfAssign ? 'Assign to Yourself' : 'Set Deadline for Assignment'}
                                </h2>
                            </div>
                            <div className="p-6 space-y-4">
                                {/* Task Info */}
                                <div className="bg-background-dark/50 rounded-lg p-4 border border-border-dark">
                                    <p className="text-white font-medium">{pendingAssignment.task?.title}</p>
                                    <p className="text-text-secondary text-sm mt-1">
                                        {pendingAssignment.isSelfAssign
                                            ? <span className="text-indigo-400 font-medium">Taking this task for yourself</span>
                                            : <>Assigning to: <span className="text-white">{users.find(u => u.id === pendingAssignment.assigneeId)?.name || 'Unknown'}</span></>
                                        }
                                    </p>
                                </div>

                                {/* Deadline Input */}
                                <div>
                                    <label className="block text-text-secondary text-sm mb-2">
                                        Deadline (when should this be completed?)
                                    </label>
                                    <input
                                        type="date"
                                        value={assignDeadline}
                                        min={(() => {
                                            const today = new Date().toISOString().split('T')[0];
                                            const start = selectedProject?.startDate ? new Date(selectedProject.startDate).toISOString().split('T')[0] : '';
                                            return start > today ? start : today;
                                        })()}
                                        max={selectedProject?.deadline ? new Date(selectedProject.deadline).toISOString().split('T')[0] : undefined}
                                        onChange={(e) => setAssignDeadline(e.target.value)}
                                        className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none [color-scheme:dark]"
                                    />
                                    {selectedProject?.deadline && (
                                        <p className="text-text-secondary text-xs mt-1">
                                            📅 Must be between <span className="text-white">{selectedProject.startDate ? new Date(selectedProject.startDate).toLocaleDateString() : 'Today'}</span> and <span className="text-primary font-medium">{new Date(selectedProject.deadline).toLocaleDateString()}</span>
                                        </p>
                                    )}
                                </div>

                                {/* Info */}
                                <p className="text-text-secondary text-xs">
                                    💡 Performance will be calculated based on when the task is completed vs. this deadline.
                                </p>
                            </div>
                            <div className="px-6 py-4 border-t border-border-dark flex justify-between gap-3">
                                <button
                                    onClick={handleSkipDeadline}
                                    className="px-4 py-2 rounded-lg border border-border-dark text-text-secondary hover:text-white hover:bg-background-dark transition-colors"
                                >
                                    Skip (No Deadline)
                                </button>
                                <button
                                    onClick={handleConfirmAssignment}
                                    disabled={!assignDeadline}
                                    className={`px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${pendingAssignment.isSelfAssign
                                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                        : 'bg-primary hover:bg-primary-dark text-white'
                                        }`}
                                >
                                    {pendingAssignment.isSelfAssign ? 'Take Task with Deadline' : 'Assign with Deadline'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
            {/* Rejection Reason Modal */}
            {
                showRejectModal && taskToReject && (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowRejectModal(false)}></div>
                        <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200">
                            <div className="px-6 py-4 border-b border-border-dark bg-gradient-to-r from-red-900/50 to-orange-900/50">
                                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-red-400">cancel</span>
                                    Reject Task Approval
                                </h2>
                            </div>
                            <form onSubmit={confirmReject} className="p-6 space-y-4">
                                <div>
                                    <p className="text-white font-medium mb-1">Task: {taskToReject.title}</p>
                                    <p className="text-text-secondary text-sm">Please provide a reason for rejecting this task approval request.</p>
                                </div>

                                <div>
                                    <label className="block text-text-secondary text-sm mb-2">
                                        Rejection Reason <span className="text-red-500">*</span>
                                    </label>
                                    <textarea
                                        value={rejectionReason}
                                        onChange={(e) => setRejectionReason(e.target.value)}
                                        required
                                        rows={4}
                                        className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none resize-none placeholder-slate-600"
                                        placeholder="Explain why the task is being rejected..."
                                    />
                                </div>

                                <div className="flex justify-end gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowRejectModal(false)}
                                        className="px-4 py-2 rounded-lg border border-border-dark text-text-secondary hover:text-white hover:bg-background-dark transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-6 py-2 rounded-lg font-medium bg-red-600 hover:bg-red-700 text-white transition-colors shadow-lg shadow-red-900/20"
                                    >
                                        Reject Task
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
        </ManagerLayout >
    );
}
