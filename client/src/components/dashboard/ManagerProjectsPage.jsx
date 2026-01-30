import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import api from '../../services/api.js';
import { getCurrentUser } from '../../services/authService.js';
import ManagerLayout from '../common/ManagerLayout.jsx';
import TaskDetailModal from '../tasks/TaskDetailModal.jsx';

// Draggable Task Component
const DraggableTask = ({ task, user, onClick }) => {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: task.id,
    });

    // Use translate3d for better performance
    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 9999, // Ensure it floats above everything
    } : undefined;

    const pendingQueries = task.queries?.filter(q => q.status === 'PENDING').length || 0;
    const hasUpdates = task.comments?.length > 0;

    // Deadline display logic
    const getDeadlineInfo = () => {
        if (!task.deadline) return null;
        const deadline = new Date(task.deadline);
        const now = new Date();
        const diffMs = deadline - now;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

        if (task.status === 'COMPLETED') {
            return { text: '✓', color: 'text-green-400', bg: 'bg-green-500/10' };
        }
        if (diffMs < 0) {
            return { text: 'Overdue', color: 'text-red-400', bg: 'bg-red-500/10' };
        }
        if (diffDays === 0) {
            return { text: `${diffHours}h left`, color: 'text-red-400', bg: 'bg-red-500/10' };
        }
        if (diffDays <= 2) {
            return { text: `${diffDays}d left`, color: 'text-yellow-400', bg: 'bg-yellow-500/10' };
        }
        return { text: `${diffDays}d left`, color: 'text-green-400', bg: 'bg-green-500/10' };
    };

    const deadlineInfo = getDeadlineInfo();

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            onClick={onClick}
            className="bg-background-dark/50 border border-border-dark rounded-lg px-4 py-3 flex items-center justify-between cursor-grab active:cursor-grabbing hover:bg-background-dark transition-colors touch-none group relative"
        >
            {/* Indicators */}
            {(pendingQueries > 0 || hasUpdates) && (
                <div className="absolute top-0 right-0 -mt-1 -mr-1 flex gap-1 z-10">
                    {pendingQueries > 0 && (
                        <span className="flex h-3 w-3 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                        </span>
                    )}
                    {hasUpdates && !pendingQueries && (
                        <span className="h-3 w-3 rounded-full bg-blue-500"></span>
                    )}
                </div>
            )}

            <div className="flex-1 min-w-0 pr-4">
                <p className="text-white font-medium truncate">{task.title}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <p className="text-text-secondary text-xs truncate">
                        Assigned to: {user ? user.name : 'Unassigned'}
                    </p>
                    {pendingQueries > 0 && (
                        <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                            Query
                        </span>
                    )}
                    {deadlineInfo && (
                        <span className={`text-[10px] ${deadlineInfo.color} ${deadlineInfo.bg} px-1.5 py-0.5 rounded`}>
                            {deadlineInfo.text}
                        </span>
                    )}
                </div>
            </div>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full shrink-0 ${task.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' :
                task.status === 'IN_PROGRESS' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'
                }`}>
                {task.status.replace('_', ' ')}
            </span>
        </div>
    );
};

// Draggable Version of Assigned Task (Mini)
const DraggableAssignedTask = ({ task, onUnassign, onApprove, onClick }) => {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: task.id,
    });
    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 9999,
    } : undefined;

    const pendingQueries = task.queries?.filter(q => q.status === 'PENDING').length || 0;

    // Deadline display logic
    const getDeadlineInfo = () => {
        if (!task.deadline) return null;
        const deadline = new Date(task.deadline);
        const now = new Date();
        const diffMs = deadline - now;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

        if (task.status === 'COMPLETED') return null; // Don't show on completed
        if (diffMs < 0) return { text: '!', color: 'text-red-400', bg: 'bg-red-500/20' };
        if (diffDays === 0) return { text: `${diffHours}h`, color: 'text-red-400', bg: 'bg-red-500/20' };
        if (diffDays <= 2) return { text: `${diffDays}d`, color: 'text-yellow-400', bg: 'bg-yellow-500/20' };
        return { text: `${diffDays}d`, color: 'text-green-400', bg: 'bg-green-500/20' };
    };

    const deadlineInfo = getDeadlineInfo();

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            onClick={onClick}
            className={`group relative text-xs bg-black/20 p-2 rounded text-text-secondary border hover:bg-black/40 transition-colors cursor-grab active:cursor-grabbing touch-none select-none ${task.status === 'WAITING_APPROVAL' ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-border-dark/30'}`}
        >
            {pendingQueries > 0 && (
                <div className="absolute top-0 left-0 -mt-1 -ml-1">
                    <span className="flex h-2.5 w-2.5 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                    </span>
                </div>
            )}
            <div className="flex justify-between items-start gap-2">
                <p className="text-white line-clamp-2 leading-tight pr-14">{task.title}</p>
                <span className="material-symbols-outlined text-[14px] opacity-0 group-hover:opacity-50">drag_indicator</span>
            </div>
            <div className="flex justify-between items-center mt-1.5">
                <span className={`text-[10px] uppercase font-bold ${task.status === 'COMPLETED' ? 'text-green-400' :
                    task.status === 'IN_PROGRESS' ? 'text-blue-400' :
                        task.status === 'WAITING_APPROVAL' ? 'text-yellow-400' : 'text-gray-400'
                    }`}>
                    {task.status.replace('_', ' ')}
                </span>
                {deadlineInfo && (
                    <span className={`text-[9px] ${deadlineInfo.color} ${deadlineInfo.bg} px-1 py-0.5 rounded font-medium`}>
                        {deadlineInfo.text}
                    </span>
                )}
            </div>

            {/* Manager Status Update Actions */}
            {onApprove && (
                <div className="absolute top-1 right-8 flex gap-1 z-20" onPointerDown={(e) => e.stopPropagation()}>
                    {/* Show approve/reject for waiting tasks */}
                    {task.status === 'WAITING_APPROVAL' ? (
                        <>
                            <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onApprove(task.id, 'COMPLETED'); }}
                                className="bg-green-500 text-black p-0.5 rounded shadow-sm hover:bg-green-400 transition-colors"
                                title="Approve"
                            >
                                <span className="material-symbols-outlined text-[14px] block font-bold">check</span>
                            </button>
                            <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onApprove(task.id, 'IN_PROGRESS'); }}
                                className="bg-red-500 text-white p-0.5 rounded shadow-sm hover:bg-red-600 transition-colors"
                                title="Return for rework"
                            >
                                <span className="material-symbols-outlined text-[14px] block font-bold">close</span>
                            </button>
                        </>
                    ) : (
                        /* Show status buttons for other tasks */
                        <>
                            {task.status !== 'IN_PROGRESS' && (
                                <button
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onApprove(task.id, 'IN_PROGRESS'); }}
                                    className="bg-blue-500 text-white px-1.5 py-0.5 rounded shadow-sm hover:bg-blue-400 transition-colors text-[10px] font-bold"
                                    title="Set In Progress"
                                >
                                    WIP
                                </button>
                            )}
                            {task.status !== 'COMPLETED' && (
                                <button
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onApprove(task.id, 'COMPLETED'); }}
                                    className="bg-green-500 text-black px-1.5 py-0.5 rounded shadow-sm hover:bg-green-400 transition-colors text-[10px] font-bold"
                                    title="Mark Completed"
                                >
                                    Done
                                </button>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Unassign Button */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('Unassign this task?')) {
                        onUnassign(task.id);
                    }
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-text-secondary hover:text-red-400 transition-opacity bg-black/50 rounded-full p-0.5"
                title="Unassign Task"
            >
                <span className="material-symbols-outlined text-[12px] block">close</span>
            </button>
        </div>
    );
};

// Droppable Team Member Component
const DroppableTeamMember = ({ member, isAssigned, onRemove, assignedTasks, onUnassignTask, onApproveTask, onTaskClick }) => {
    const { setNodeRef, isOver } = useDroppable({
        id: member.id, // Drop ID is the user ID
    });
    const [expanded, setExpanded] = useState(false);

    return (
        <div
            ref={setNodeRef}
            className={`rounded-lg border transition-all ${isOver ? 'bg-primary/20 border-primary shadow-[0_0_10px_rgba(59,130,246,0.5)]' :
                'bg-background-dark/50 border-transparent hover:border-border-dark'
                }`}
        >
            <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer group/member relative"
                onClick={() => setExpanded(!expanded)}
            >
                <div className={`size-8 rounded-full flex items-center justify-center shrink-0 ${isOver ? 'bg-primary text-white' : 'bg-gradient-primary'}`}>
                    <span className="text-white text-xs font-medium">{member.name.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{member.name}</p>
                    <p className="text-text-secondary text-xs truncate">{member.role}</p>
                </div>

                {assignedTasks && assignedTasks.length > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${assignedTasks.some(t => t.status === 'WAITING_APPROVAL') ? 'bg-yellow-500 text-black animate-pulse' : 'bg-primary/20 text-primary'}`}>
                        {assignedTasks.length}
                    </span>
                )}

                <span className={`material-symbols-outlined text-text-secondary text-sm transition-transform ${expanded ? 'rotate-180' : ''}`}>expand_more</span>

                {onRemove && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Remove ${member.name} from the team?`)) {
                                onRemove(member.id);
                            }
                        }}
                        className="opacity-0 group-hover/member:opacity-100 absolute right-8 top-1/2 -translate-y-1/2 text-text-secondary hover:text-red-400 p-1 rounded transition-all bg-surface-dark shadow-sm"
                        title="Remove member"
                    >
                        <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                )}
            </div>

            {expanded && (
                <div className="px-3 pb-3 space-y-1 animate-in slide-in-from-top-1 fade-in duration-200">
                    {assignedTasks && assignedTasks.length > 0 ? (
                        assignedTasks.map(task => (
                            <DraggableAssignedTask
                                key={task.id}
                                task={task}
                                onUnassign={onUnassignTask}
                                onApprove={onApproveTask}
                                onClick={(e) => { e.stopPropagation(); onTaskClick(task); }}
                            />
                        ))
                    ) : (
                        <p className="text-xs text-text-secondary italic text-center py-1">No assigned tasks.</p>
                    )}
                </div>
            )}
        </div>
    );
};

// Droppable Self-Assign Zone (Manager assigns task to themselves)
const DroppableSelfAssignZone = () => {
    const { setNodeRef, isOver } = useDroppable({
        id: 'SELF_ASSIGN_ZONE',
    });

    return (
        <div
            ref={setNodeRef}
            className={`rounded-lg border-2 border-dashed transition-all mb-3 ${isOver
                ? 'bg-blue-500/20 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)] scale-[1.02]'
                : 'bg-background-dark/30 border-border-dark hover:border-blue-500/50'
                }`}
        >
            <div className="p-4 flex flex-col items-center justify-center text-center gap-2">
                <div className={`size-10 rounded-full flex items-center justify-center transition-colors ${isOver ? 'bg-blue-500 text-white animate-bounce' : 'bg-blue-500/10 text-blue-500'
                    }`}>
                    <span className="material-symbols-outlined text-xl">person_add</span>
                </div>
                <div>
                    <p className={`text-sm font-bold ${isOver ? 'text-blue-400' : 'text-text-secondary'}`}>
                        Assign to Yourself
                    </p>
                    <p className="text-[10px] text-text-secondary/70">
                        Drag a task here to take it on
                    </p>
                </div>
            </div>
        </div>
    );
};

// Droppable Completed Zone (Only for tasks assigned to the manager)
const DroppableCompletedZone = ({ currentUserId, tasks }) => {
    const { setNodeRef, isOver } = useDroppable({
        id: 'COMPLETED_ZONE',
    });

    // Count of tasks assigned to current manager that can be completed
    const myTasks = tasks?.filter(t => t.assigneeId === currentUserId && t.status !== 'COMPLETED') || [];

    return (
        <div
            ref={setNodeRef}
            className={`rounded-lg border-2 border-dashed transition-all mb-4 ${isOver
                ? 'bg-green-500/20 border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)] scale-[1.02]'
                : 'bg-background-dark/30 border-border-dark hover:border-green-500/50'
                }`}
        >
            <div className="p-4 flex flex-col items-center justify-center text-center gap-2">
                <div className={`size-10 rounded-full flex items-center justify-center transition-colors ${isOver ? 'bg-green-500 text-white animate-bounce' : 'bg-green-500/10 text-green-500'
                    }`}>
                    <span className="material-symbols-outlined text-xl">check_circle</span>
                </div>
                <div>
                    <p className={`text-sm font-bold ${isOver ? 'text-green-400' : 'text-text-secondary'}`}>
                        Mark as Completed
                    </p>
                    <p className="text-[10px] text-text-secondary/70">
                        {myTasks.length > 0
                            ? `Drag YOUR task here (${myTasks.length} available)`
                            : 'Assign a task to yourself first'
                        }
                    </p>
                </div>
            </div>
        </div>
    );
};

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
    const [isUploading, setIsUploading] = useState(false);
    const [attachmentName, setAttachmentName] = useState('');

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
            const res = await api.put(`/tasks/${taskId}`, { assigneeId: null });
            // Update local state
            setTasks(tasks.map(t => t.id === taskId ? { ...t, assigneeId: null } : t));
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

    useEffect(() => {
        loadData();
    }, []);

    const handleStatusChange = async (projectId, status) => {
        try {
            await api.put(`/projects/${projectId}/status`, { status });
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
        if (!newTaskTitle.trim() || !selectedProject) return;
        try {
            const res = await api.post('/tasks', {
                title: newTaskTitle,
                projectId: selectedProject.id,
                deadline: newTaskDeadline || null,
                // Optionally assign to self or leave unassigned? 
                // Default API behavior assigns to creator if no assigneeId. 
                // We'll leave it unassigned (or assigned to creator) and let them drag to assign.
            });
            setTasks([...tasks, res.data]);
            setNewTaskTitle('');
            setNewTaskDeadline('');
            setShowAddTask(false);
        } catch (err) {
            alert('Failed to create task');
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
            alert('Failed to add member: ' + (err.response?.data?.message || err.message));
        }
    };

    const handleRemoveTeamMember = async (userId) => {
        if (!selectedProject) return;
        try {
            const updatedTeamIds = selectedProject.teamIds.filter(id => id !== userId);
            const res = await api.put(`/projects/${selectedProject.id}`, {
                teamIds: updatedTeamIds
            });
            // Update local state
            setProjects(projects.map(p => p.id === selectedProject.id ? { ...p, teamIds: updatedTeamIds } : p));
            setSelectedProject({ ...selectedProject, teamIds: updatedTeamIds });
        } catch (err) {
            alert('Failed to remove member: ' + (err.response?.data?.message || err.message));
        }
    };

    const handleDragEnd = async (event) => {
        const { active, over } = event;

        if (!over) return;

        const currentUser = getCurrentUser(); // Get logged in manager
        const taskId = active.id;
        const task = tasks.find(t => t.id === taskId);

        // Handle Drop to Self-Assign Zone (Assign to Yourself)
        if (over.id === 'SELF_ASSIGN_ZONE') {
            if (task?.assigneeId === currentUser.id) {
                alert('This task is already assigned to you!');
                return;
            }

            // Show deadline modal for self-assignment (required for performance tracking)
            setPendingAssignment({
                taskId,
                assigneeId: currentUser.id,
                task,
                isSelfAssign: true // Flag to indicate self-assignment
            });
            // Pre-fill with task's existing deadline if any
            if (task?.deadline) {
                const existingDeadline = new Date(task.deadline);
                setAssignDeadline(existingDeadline.toISOString().split('T')[0]);
            } else {
                setAssignDeadline('');
            }
            setShowAssignDeadlineModal(true);
            return;
        }

        // Handle Drop to Completed Zone (Mark as Completed)
        if (over.id === 'COMPLETED_ZONE') {
            // Only allow if task is assigned to the current manager
            if (task?.assigneeId !== currentUser.id) {
                alert('You can only mark tasks assigned to YOU as completed. Assign the task to yourself first!');
                return;
            }

            if (task?.status === 'COMPLETED') {
                alert('This task is already completed!');
                return;
            }

            if (window.confirm('Mark this task as COMPLETED?')) {
                try {
                    // Optimistic UI Update
                    setTasks(prev => prev.map(t =>
                        t.id === taskId ? {
                            ...t,
                            status: 'COMPLETED',
                            completedAt: new Date().toISOString(),
                            completedBy: currentUser.id
                        } : t
                    ));

                    await api.put(`/tasks/${taskId}`, {
                        status: 'COMPLETED',
                        completedAt: new Date().toISOString(),
                        completedBy: currentUser.id
                    });
                } catch (err) {
                    console.error("Failed to complete task", err);
                    alert("Failed to complete task");
                    loadData(); // Revert
                }
            }
            return;
        }

        if (active.id !== over.id) {
            // Task Assignment Logic
            // Active.id is Task ID
            // Over.id is User ID (Assignee ID)
            const taskId = active.id;
            const newAssigneeId = over.id;
            const task = tasks.find(t => t.id === taskId);

            console.log(`Dragging task ${taskId} to user ${newAssigneeId}`);

            // Show deadline modal before completing assignment
            setPendingAssignment({ taskId, assigneeId: newAssigneeId, task });
            // Initialize with date only (YYYY-MM-DD)
            setAssignDeadline(task?.deadline ? new Date(task.deadline).toISOString().slice(0, 10) : '');
            setShowAssignDeadlineModal(true);
        }
    };

    // Confirm assignment with deadline
    const handleConfirmAssignment = async () => {
        if (!pendingAssignment) return;

        const { taskId, assigneeId, isSelfAssign } = pendingAssignment;

        try {
            // Default time to 23:59:59 if only date is provided
            const deadlineDate = assignDeadline ? new Date(`${assignDeadline}T23:59:59`) : null;

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
            alert("Failed to assign task: " + (err.response?.data?.message || err.message));
            loadData(); // Revert on error
        }
    };

    // Skip deadline and just assign
    const handleSkipDeadline = async () => {
        if (!pendingAssignment) return;

        const { taskId, assigneeId, isSelfAssign } = pendingAssignment;

        // Warn about performance tracking impact
        if (isSelfAssign) {
            if (!window.confirm('Without a deadline, performance metrics cannot be calculated accurately. Continue anyway?')) {
                return;
            }
        }

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
            alert("Failed to assign task");
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

    return (
        <ManagerLayout currentPage="projects">
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

            {/* Enhanced Project Details Modal */}
            {showDetailsModal && selectedProject && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDetailsModal(false)}></div>
                    <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-6xl mx-4 h-[85vh] flex flex-col overflow-hidden">

                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface shrink-0 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary">folder</span>
                                    {selectedProject.name}
                                </h2>
                                <div className="flex items-center gap-2">
                                    {selectedProject.budget > 0 && (
                                        <div className="flex items-center gap-1 bg-surface-light px-3 py-1 rounded-lg border border-border-dark">
                                            <span className="text-text-secondary text-xs uppercase font-bold">Budget:</span>
                                            <span className="text-emerald-400 text-sm font-bold ml-1">₹ {selectedProject.budget.toLocaleString('en-IN')}</span>
                                        </div>
                                    )}
                                    <select
                                        className={`px-3 py-1 text-xs font-medium rounded-full outline-none focus:ring-2 focus:ring-primary border-none cursor-pointer ${getStatusColor(selectedProject.status)}`}
                                        value={selectedProject.status}
                                        onChange={(e) => handleStatusChange(selectedProject.id, e.target.value)}
                                    >
                                        <option value="PLANNING" className="bg-surface-dark text-white">Planning</option>
                                        <option value="ACTIVE" className="bg-surface-dark text-white">Active</option>
                                        <option value="ON_HOLD" className="bg-surface-dark text-white">On Hold</option>
                                        <option value="COMPLETED" className="bg-surface-dark text-white">Completed</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Approve Completion Button */}
                                {isProjectReadyForCompletion && (
                                    <button
                                        onClick={handleApproveCompletion}
                                        className="flex items-center gap-1.5 px-4 py-1.5 bg-green-500 text-black text-sm font-bold rounded-lg shadow-lg hover:bg-green-400 transition-all animate-pulse"
                                    >
                                        <span className="material-symbols-outlined">check_circle</span>
                                        Approve Completion
                                    </button>
                                )}
                                <button onClick={() => setShowDetailsModal(false)} className="text-text-secondary hover:text-white">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                        </div>

                        {/* Modal Body - 2 Columns */}
                        <div className="flex flex-1 overflow-hidden">
                            <DndContext onDragEnd={handleDragEnd}>
                                {/* Left Column: Tasks & Attachments */}
                                <div className="flex-1 border-r border-border-dark flex flex-col bg-background-dark/20 overflow-y-auto">

                                    {/* Unassigned Tasks Section */}
                                    <div className="border-b border-border-dark bg-surface-dark/50">
                                        <div
                                            className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
                                            onClick={() => setIsTasksExpanded(!isTasksExpanded)}
                                        >
                                            <h3 className="text-sm font-bold uppercase tracking-wider text-text-secondary flex items-center gap-2">
                                                <span className="material-symbols-outlined text-base">task_alt</span>
                                                Unassigned ({tasks.filter(t => t.projectId === selectedProject.id && !t.assigneeId).length})
                                            </h3>
                                            <span className={`material-symbols-outlined text-text-secondary transition-transform ${isTasksExpanded ? 'rotate-180' : ''}`}>expand_more</span>
                                        </div>

                                        {isTasksExpanded && (
                                            <div className="border-t border-border-dark/30">
                                                <div className="p-3 bg-background-dark/30 flex justify-end">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setShowAddTask(true); }}
                                                        className="text-xs flex items-center gap-1 bg-primary/20 text-primary px-3 py-1.5 rounded-lg hover:bg-primary/30 transition-colors font-medium border border-primary/30"
                                                    >
                                                        <span className="material-symbols-outlined text-sm">add</span>
                                                        Add Task
                                                    </button>
                                                </div>

                                                {/* Add Task Form */}
                                                {showAddTask && (
                                                    <div className="p-4 bg-background-dark/30 border-b border-border-dark animate-in fade-in slide-in-from-top-2 mx-4 rounded-lg mt-2 mb-2">
                                                        <form onSubmit={handleAddTask} className="space-y-3">
                                                            <div className="flex gap-2">
                                                                <input
                                                                    type="text"
                                                                    value={newTaskTitle}
                                                                    onChange={(e) => setNewTaskTitle(e.target.value)}
                                                                    placeholder="Task title..."
                                                                    className="flex-1 bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                                                    autoFocus
                                                                />
                                                            </div>
                                                            <div className="flex gap-2 items-center">
                                                                <label className="text-text-secondary text-sm whitespace-nowrap">Deadline:</label>
                                                                <input
                                                                    type="datetime-local"
                                                                    value={newTaskDeadline}
                                                                    onChange={(e) => setNewTaskDeadline(e.target.value)}
                                                                    className="flex-1 bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                                                />
                                                                <button type="submit" className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium">Add Task</button>
                                                                <button type="button" onClick={() => { setShowAddTask(false); setNewTaskDeadline(''); }} className="text-text-secondary hover:text-white px-2">
                                                                    <span className="material-symbols-outlined">close</span>
                                                                </button>
                                                            </div>
                                                        </form>
                                                    </div>
                                                )}

                                                {/* List */}
                                                <div className="p-4 space-y-2">
                                                    {tasks.filter(t => t.projectId === selectedProject.id && !t.assigneeId).length > 0 ? (
                                                        tasks
                                                            .filter(t => t.projectId === selectedProject.id && !t.assigneeId)
                                                            .map((task) => (
                                                                <DraggableTask
                                                                    key={task.id}
                                                                    task={task}
                                                                    user={null}
                                                                    onClick={(e) => { e.stopPropagation(); openTaskDetail(task); }}
                                                                />
                                                            ))
                                                    ) : (
                                                        <div className="text-center py-6">
                                                            <p className="text-text-secondary text-sm">No unassigned tasks.</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Attachments Section */}
                                    <div className="border-b border-border-dark bg-surface-dark/50">
                                        <div
                                            className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
                                            onClick={() => setIsAttachmentsExpanded(!isAttachmentsExpanded)}
                                        >
                                            <h3 className="text-sm font-bold uppercase tracking-wider text-text-secondary flex items-center gap-2">
                                                <span className="material-symbols-outlined text-base">attach_file</span>
                                                Attachments ({selectedProject.attachments?.length || 0})
                                            </h3>
                                            <span className={`material-symbols-outlined text-text-secondary transition-transform ${isAttachmentsExpanded ? 'rotate-180' : ''}`}>expand_more</span>
                                        </div>

                                        {isAttachmentsExpanded && (
                                            <div className="p-4 border-t border-border-dark/30">
                                                {/* List */}
                                                <div className="space-y-2 mb-4">
                                                    {selectedProject.attachments?.map((file, idx) => (
                                                        <div key={idx} className="flex items-center gap-3 p-3 bg-black/20 border border-border-dark rounded-lg hover:bg-black/30 transition-colors group relative">
                                                            <div className="size-8 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                                                                <span className="material-symbols-outlined text-lg">description</span>
                                                            </div>
                                                            <a href={`http://localhost:5000${file.url}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 hover:text-primary transition-colors">
                                                                <p className="text-white text-sm truncate">{file.name}</p>
                                                                <p className="text-text-secondary text-xs">{new Date(file.uploadedAt).toLocaleDateString()}</p>
                                                            </a>
                                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <a href={`http://localhost:5000${file.url}`} target="_blank" rel="noreferrer" className="text-text-secondary hover:text-white p-1" title="Preview">
                                                                    <span className="material-symbols-outlined text-lg">visibility</span>
                                                                </a>
                                                                <a href={`http://localhost:5000${file.url}`} download target="_blank" rel="noreferrer" className="text-primary hover:text-white p-1" title="Download">
                                                                    <span className="material-symbols-outlined text-lg">download</span>
                                                                </a>
                                                                <button
                                                                    onClick={() => handleRemoveAttachment(file.url)}
                                                                    className="text-text-secondary hover:text-red-400 p-1"
                                                                    title="Remove attachment"
                                                                >
                                                                    <span className="material-symbols-outlined text-lg">close</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {(!selectedProject.attachments || selectedProject.attachments.length === 0) && <p className="text-text-secondary text-sm italic text-center py-2">No attachments.</p>}
                                                </div>

                                                {/* Upload */}
                                                <div>
                                                    <label className="block text-xs uppercase text-text-secondary font-bold mb-2">Upload File</label>
                                                    <input
                                                        type="file"
                                                        multiple
                                                        onChange={handleUploadAttachment}
                                                        className="block w-full text-sm text-text-secondary file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary/20 file:text-primary hover:file:bg-primary/30 cursor-pointer"
                                                        disabled={isUploading}
                                                    />
                                                    {isUploading && <p className="text-xs text-primary mt-2 flex items-center gap-1"><span className="material-symbols-outlined text-sm animate-spin">refresh</span> Uploading...</p>}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Right Column: Team Members (Sidebar) */}
                                <div className="w-80 shrink-0 bg-surface-dark flex flex-col">
                                    <div className="p-4 border-b border-border-dark flex items-center justify-between bg-surface-dark/50">
                                        <h3 className="text-sm font-bold uppercase tracking-wider text-text-secondary flex items-center gap-2">
                                            <span className="material-symbols-outlined text-base">group</span>
                                            Team
                                        </h3>
                                        <button
                                            onClick={() => setShowAddMember(true)}
                                            className="text-xs p-1.5 rounded-lg hover:bg-background-dark text-text-secondary hover:text-white transition-colors"
                                            title="Add Team Member"
                                        >
                                            <span className="material-symbols-outlined">person_add</span>
                                        </button>
                                    </div>

                                    {/* Add Member Selection */}
                                    {showAddMember && (
                                        <div className="p-4 bg-background-dark/30 border-b border-border-dark">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-xs text-text-secondary font-medium">Add Member</span>
                                                <button onClick={() => setShowAddMember(false)} className="text-text-secondary hover:text-white">
                                                    <span className="material-symbols-outlined text-sm">close</span>
                                                </button>
                                            </div>
                                            <div className="space-y-1 max-h-40 overflow-y-auto">
                                                {getAvailableMembers(selectedProject).length > 0 ? (
                                                    getAvailableMembers(selectedProject).map(u => (
                                                        <button
                                                            key={u.id}
                                                            onClick={() => handleAddTeamMember(u.id)}
                                                            className="w-full text-left px-2 py-1.5 rounded hover:bg-primary/20 hover:text-primary text-sm text-text-secondary transition-colors truncate"
                                                        >
                                                            {u.name}
                                                        </button>
                                                    ))
                                                ) : (
                                                    <p className="text-xs text-text-secondary italic">No available users.</p>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-xs text-primary mb-2 text-center">
                                            <span className="material-symbols-outlined text-lg block mb-1">drag_indicator</span>
                                            Drag a task to a team member to assign it.
                                        </div>

                                        {/* Self-Assign Drop Zone */}
                                        <DroppableSelfAssignZone />

                                        {/* Completed Drop Zone */}
                                        <DroppableCompletedZone
                                            currentUserId={getCurrentUser()?.id}
                                            tasks={tasks.filter(t => t.projectId === selectedProject.id)}
                                        />

                                        {/* My Tasks Section - Tasks assigned to the manager */}
                                        {(() => {
                                            const currentUser = getCurrentUser();
                                            const myTasks = tasks.filter(t =>
                                                t.projectId === selectedProject.id &&
                                                t.assigneeId === currentUser?.id &&
                                                t.status !== 'COMPLETED'
                                            );

                                            if (myTasks.length === 0) return null;

                                            return (
                                                <div className="mb-4 bg-indigo-500/10 rounded-lg overflow-hidden border border-indigo-500/30">
                                                    <div className="px-3 py-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-indigo-400 border-b border-indigo-500/20">
                                                        <span className="flex items-center gap-2">
                                                            <span className="material-symbols-outlined text-sm">person</span>
                                                            My Tasks ({myTasks.length})
                                                        </span>
                                                        <span className="text-[10px] font-normal normal-case text-indigo-300">
                                                            Drag to complete ↓
                                                        </span>
                                                    </div>
                                                    <div className="p-2 space-y-1 max-h-40 overflow-y-auto">
                                                        {myTasks.map(task => (
                                                            <DraggableAssignedTask
                                                                key={task.id}
                                                                task={task}
                                                                onUnassign={handleUnassignTask}
                                                                onApprove={handleTaskApproval}
                                                                onClick={(e) => { e.stopPropagation(); openTaskDetail(task); }}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* Completed Tasks List (Sidebar) */}
                                        <div className="mb-4 bg-black/20 rounded-lg overflow-hidden border border-border-dark/50">
                                            <button
                                                onClick={() => setIsCompletedExpanded(!isCompletedExpanded)}
                                                className="w-full px-3 py-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-green-400 hover:bg-white/5 transition-colors"
                                            >
                                                <span className="flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-sm">check_circle</span>
                                                    Completed ({tasks.filter(t => t.projectId === selectedProject.id && t.status === 'COMPLETED').length})
                                                </span>
                                                <span className={`material-symbols-outlined text-sm transition-transform ${isCompletedExpanded ? 'rotate-180' : ''}`}>expand_more</span>
                                            </button>

                                            {isCompletedExpanded && (
                                                <div className="border-t border-border-dark/30 max-h-60 overflow-y-auto custom-scrollbar">
                                                    {tasks.filter(t => t.projectId === selectedProject.id && t.status === 'COMPLETED').length > 0 ? (
                                                        <div className="divide-y divide-border-dark/30">
                                                            {tasks
                                                                .filter(t => t.projectId === selectedProject.id && t.status === 'COMPLETED')
                                                                .map((task) => (
                                                                    <div
                                                                        key={task.id}
                                                                        onClick={() => openTaskDetail(task)}
                                                                        className="p-2 hover:bg-white/5 transition-colors cursor-pointer group"
                                                                    >
                                                                        <p className="text-white text-xs font-medium line-clamp-2 mb-1">{task.title}</p>
                                                                        <div className="flex items-center justify-between gap-2">
                                                                            <span className="text-[10px] text-text-secondary truncate">
                                                                                By: {(() => {
                                                                                    const currentUser = getCurrentUser();
                                                                                    // Check if it's the current user (self-assigned/completed)
                                                                                    if (task.assigneeId === currentUser?.id || task.completedBy === currentUser?.id) {
                                                                                        return <span className="text-indigo-400 font-medium">You</span>;
                                                                                    }
                                                                                    // Otherwise look up in users list
                                                                                    const assignee = users.find(u => u.id === task.assigneeId);
                                                                                    return assignee?.name || 'Team Member';
                                                                                })()}
                                                                            </span>
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    if (window.confirm('Reopen this task?')) {
                                                                                        handleTaskApproval(task.id, 'IN_PROGRESS');
                                                                                    }
                                                                                }}
                                                                                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-surface-dark text-text-secondary hover:text-white transition-all"
                                                                                title="Reopen"
                                                                            >
                                                                                <span className="material-symbols-outlined text-sm">undo</span>
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                        </div>
                                                    ) : (
                                                        <p className="text-[10px] text-text-secondary italic text-center py-2">No completed tasks.</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {getTeamMembers(selectedProject).length > 0 ? (
                                            getTeamMembers(selectedProject).map((member) => (
                                                <DroppableTeamMember
                                                    key={member.id}
                                                    member={member}
                                                    isAssigned={tasks.some(t => t.projectId === selectedProject.id && t.assigneeId === member.id)}
                                                    onRemove={handleRemoveTeamMember}
                                                    assignedTasks={tasks.filter(t => t.projectId === selectedProject.id && t.assigneeId === member.id)}
                                                    onUnassignTask={handleUnassignTask}
                                                    onApproveTask={handleTaskApproval}
                                                    onTaskClick={openTaskDetail}
                                                />
                                            ))
                                        ) : (
                                            <p className="text-text-secondary text-sm text-center py-4">No team members.</p>
                                        )}
                                    </div>
                                </div>
                            </DndContext>
                        </div>
                    </div>
                </div>
            )}

            {/* Shared Task Detail Modal */}
            {showTaskDetail && selectedTaskDetail && (
                <TaskDetailModal
                    task={selectedTaskDetail}
                    onClose={() => setShowTaskDetail(false)}
                    onUpdate={(updatedTask) => {
                        setTasks(tasks.map(t => t.id === updatedTask.id ? updatedTask : t));
                        setSelectedTaskDetail(updatedTask);
                    }}
                    users={users}
                />
            )}

            {/* Assignment Deadline Modal */}
            {showAssignDeadlineModal && pendingAssignment && (
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
            )}
        </ManagerLayout>
    );
}
