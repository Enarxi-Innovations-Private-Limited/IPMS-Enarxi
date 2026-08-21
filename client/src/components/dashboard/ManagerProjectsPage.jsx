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
import { getCurrentUser } from '../../services/authService.js';
import ManagerLayout from '../common/ManagerLayout.jsx';
import TaskDetailModal from '../tasks/TaskDetailModal.jsx';
import ProductionDashboard from './ProductionDashboard.jsx';
import { useSocket } from '../../context/SocketContext.jsx';

// Sortable table row for drag-to-reorder
function SortableTaskRow({ task, children }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task._id || task.id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        background: isDragging ? 'rgba(16,185,129,0.05)' : undefined,
        zIndex: isDragging ? 10 : undefined,
        position: 'relative',
    };
    return (
        <tr ref={setNodeRef} style={style} className="hover:bg-slate-800/20 transition-colors group">
            <td className="pl-3 pr-0 py-5 w-8 cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
                <span className="material-symbols-outlined text-[18px] text-slate-600 hover:text-emerald-400 select-none transition-colors">
                    drag_indicator
                </span>
            </td>
            {children}
        </tr>
    );
}


export default function ManagerProjectsPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { socket } = useSocket();
    const [projects, setProjects] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const saveTimerRef = useRef(null);
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
    const [showDeadlineExtensionModal, setShowDeadlineExtensionModal] = useState(false);
    const [deadlineExtensionReason, setDeadlineExtensionReason] = useState('');
    const [deadlineExtensionDate, setDeadlineExtensionDate] = useState('');
    const [deadlineExtensionRequests, setDeadlineExtensionRequests] = useState([]);
    const [loadingDeadlineExtensionRequests, setLoadingDeadlineExtensionRequests] = useState(false);
    const [submittingDeadlineExtension, setSubmittingDeadlineExtension] = useState(false);

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

    const [confirmModal, setConfirmModal] = useState({
        show: false,
        title: '',
        message: '',
        onConfirm: null,
        type: 'primary'
    });

    // Member Details Modal State
    const [showMemberDetailsModal, setShowMemberDetailsModal] = useState(false);
    const [selectedTeamMember, setSelectedTeamMember] = useState(null);
    const [memberPerformance, setMemberPerformance] = useState(null);

    const isProductionOnlyProject = (project, tasksForProject = []) => {
        if (!project) return false;
        return project.projectType === 'PRODUCTION' || (!project.projectType && tasksForProject.some((task) => task.isProductionTask));
    };

    const isFullProductProductionProject = (project) => project?.projectType === 'FULL_PRODUCT_PRODUCTION';
    const isBoardProjectView = (project, tasksForProject = []) =>
        isProductionOnlyProject(project, tasksForProject) || isFullProductProductionProject(project);

    const isProjectOverdue = (project) => {
        if (!project?.deadline) return false;
        const deadline = new Date(project.deadline);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        deadline.setHours(0, 0, 0, 0);
        return deadline < today;
    };

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
            setNotification({ message: 'Attachments uploaded successfully', type: 'success' });
        } catch (err) {
            console.error(err);
            setNotification({ message: 'Failed to upload attachments', type: 'error' });
        } finally {
            setIsUploading(false);
            // Clear input
            e.target.value = null;
            setAttachmentName('');
        }
    };

    const handleRemoveAttachment = async (fileUrl) => {
        if (!selectedProject) return;
        setConfirmModal({
            show: true,
            title: 'Remove Attachment?',
            message: 'Are you sure you want to remove this attachment? This action cannot be undone.',
            type: 'danger',
            onConfirm: async () => {
                try {
                    const filename = fileUrl.split('/').pop();
                    const res = await api.delete(`/projects/${selectedProject.id}/attachments/${filename}`);

                    // Update local state
                    const updatedAttachments = res.data.attachments;
                    setSelectedProject({ ...selectedProject, attachments: updatedAttachments });
                    setProjects(projects.map(p => p.id === selectedProject.id ? { ...p, attachments: updatedAttachments } : p));
                    setConfirmModal({ ...confirmModal, show: false });
                } catch (err) {
                    console.error('Failed to remove attachment:', err);
                    setNotification({ message: 'Failed to remove attachment', type: 'error' });
                    setConfirmModal({ ...confirmModal, show: false });
                }
            }
        });
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
            setNotification({ message: 'Failed to update task status', type: 'error' });
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
            setNotification({ message: 'Failed to reject task', type: 'error' });
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

    const loadDeadlineExtensionRequests = async (projectId) => {
        if (!projectId) return;
        try {
            setLoadingDeadlineExtensionRequests(true);
            const res = await api.get('/project-deadline-extension-requests', { params: { projectId } });
            setDeadlineExtensionRequests(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error('Failed to load deadline extension requests:', err);
            setDeadlineExtensionRequests([]);
        } finally {
            setLoadingDeadlineExtensionRequests(false);
        }
    };

    const openDeadlineExtensionModal = () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setDeadlineExtensionDate(tomorrow.toISOString().slice(0, 10));
        setDeadlineExtensionReason('');
        setShowDeadlineExtensionModal(true);
    };

    const handleSubmitDeadlineExtensionRequest = async (e) => {
        if (e) e.preventDefault();
        if (!selectedProject) return;
        if (!deadlineExtensionDate) {
            setNotification({ message: 'Requested deadline is required.', type: 'error' });
            return;
        }
        if (!deadlineExtensionReason.trim()) {
            setNotification({ message: 'Reason is required for deadline extension.', type: 'error' });
            return;
        }

        try {
            setSubmittingDeadlineExtension(true);
            const res = await api.post(`/projects/${selectedProject.id}/deadline-extension-requests`, {
                requestedDeadline: deadlineExtensionDate,
                reason: deadlineExtensionReason.trim()
            });
            setNotification({ message: res.data?.message || 'Deadline extension request submitted.', type: 'success' });
            setShowDeadlineExtensionModal(false);
            await loadDeadlineExtensionRequests(selectedProject.id);
        } catch (err) {
            setNotification({
                message: err.response?.data?.message || 'Failed to submit deadline extension request.',
                type: 'error'
            });
        } finally {
            setSubmittingDeadlineExtension(false);
        }
    };

    const handleDeleteTask = async (taskId) => {
        try {
            console.log('Attempting to delete task:', taskId);
            await api.delete(`/tasks/${taskId}`);
            console.log('Task delete API success');
            setTasks(tasks.filter(t => t.id !== taskId && t._id !== taskId));
            setNotification({ message: 'Task Deleted', type: 'success' });
        } catch (err) {
            console.error('Failed to delete task:', err);
            setNotification({
                message: err.response?.data?.message || 'Failed to delete task.',
                type: 'error'
            });
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // Socket.IO — receive reorder events from other clients
    useEffect(() => {
        const sock = socket?.current;
        if (!sock) return;
        sock.emit('join:tasks');
        const handleReordered = (items) => {
            const orderMap = Object.fromEntries(items.map(i => [String(i.taskId), i.order]));
            setTasks(prev => [...prev].sort((a, b) => {
                const oa = orderMap[String(a._id ?? a.id)] ?? (a.order ?? 0);
                const ob = orderMap[String(b._id ?? b.id)] ?? (b.order ?? 0);
                return oa - ob;
            }));
        };
        sock.on('tasks:reordered', handleReordered);
        return () => sock.off('tasks:reordered', handleReordered);
    }, [socket]);

    // DnD sensors
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

    // Drag end — optimistic reorder within the current project's task list
    const handleTaskDragEnd = ({ active, over }) => {
        if (!over || active.id === over.id) return;
        setTasks(prev => {
            const oldIdx = prev.findIndex(t => (t._id ?? t.id) === active.id);
            const newIdx = prev.findIndex(t => (t._id ?? t.id) === over.id);
            if (oldIdx === -1 || newIdx === -1) return prev;
            const reordered = arrayMove(prev, oldIdx, newIdx);
            clearTimeout(saveTimerRef.current);
            setIsSaving(true);
            saveTimerRef.current = setTimeout(async () => {
                try {
                    const payload = reordered.map((t, i) => ({ taskId: t._id ?? t.id, order: i }));
                    await api.put('/tasks/reorder', payload);
                } catch { /* silent */ } finally {
                    setIsSaving(false);
                }
            }, 600);
            return reordered;
        });
    };

    useEffect(() => {
        if (!loading && projects.length > 0) {
            const searchParams = new URLSearchParams(location.search);
            const projectId = searchParams.get('projectId');
            if (projectId) {
                const found = projects.find(p => p.id === projectId);
                if (found) {
                    openDetailsModal(found);
                }
            }
        }
    }, [location.search, loading, projects]);

    const handleStatusChange = async (projectId, status) => {
        try {
            const res = await api.put(`/projects/${projectId}/status`, { status });
            const updatedStatus = res.data?.status || status;
            await loadData();
            if (selectedProject && selectedProject.id === projectId) {
                setSelectedProject(prev => ({ ...prev, status: updatedStatus }));
            }
            if (updatedStatus === 'WAITING_APPROVAL') {
                setNotification({ message: 'Project closure request submitted to Super Admin for approval.', type: 'success' });
            } else {
                setNotification({ message: `Project status updated to ${updatedStatus.replace('_', ' ')}`, type: 'success' });
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update status');
        }
    };

    const getTeamMembers = (project) => {
        if (!project || !project.teamIds) return [];
        // Support both populated objects and ID strings
        const memberIds = project.teamIds.map(m => (typeof m === 'object' && m ? m.id || m._id : m));
        return users.filter((u) => memberIds.includes(u.id));
    };

    const getAvailableMembers = (project) => {
        if (!project) return [];
        // Support both populated objects and ID strings
        const memberIds = project.teamIds?.map(m => (typeof m === 'object' && m ? m.id || m._id : m)) || [];
        const currentUser = getCurrentUser();
        return users.filter(u => !memberIds.includes(u.id) && u.id !== currentUser?.id);
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
        loadDeadlineExtensionRequests(project.id);
    };

    const openTaskDetail = (task) => {
        setSelectedTaskDetail(task);
        setShowTaskDetail(true);
    };

    const handleViewMemberDetails = async (member) => {
        setSelectedTeamMember(member);
        setShowMemberDetailsModal(true);
        try {
            const res = await api.get(`/users/${member.id}/performance`);
            setMemberPerformance(res.data);
        } catch (err) {
            console.error('Failed to load member performance:', err);
            setMemberPerformance(null);
        }
    };

    // --- Actions ---

    const handleAddTask = async (e) => {
        if (e) e.preventDefault();
        const trimmedTitle = newTaskTitle.trim();
        if (!newTaskDeadline) {
            setNotification({ message: 'Task deadline is mandatory', type: 'error' });
            return;
        }
        if (!trimmedTitle) {
            setNotification({ message: 'Task title is required', type: 'error' });
            return;
        }

        let deadlineDate = null;
        if (newTaskDeadline) {
            const [y, m, d] = newTaskDeadline.split('-').map(Number);
            deadlineDate = new Date(y, m - 1, d, 23, 59, 59, 999);
        }

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        if (deadlineDate < todayStart) {
            setNotification({ message: 'Task deadline cannot be in the past', type: 'error' });
            return;
        }

        if (selectedProject?.deadline) {
            const projectDeadline = new Date(selectedProject.deadline);
            projectDeadline.setHours(23, 59, 59, 999);
            if (deadlineDate > projectDeadline) {
                setNotification({ message: 'Task deadline cannot be later than the project deadline', type: 'error' });
                return;
            }
        }

        try {
            const res = await api.post('/tasks', {
                title: trimmedTitle,
                description: newTaskDescription,
                projectId: selectedProject.id,
                deadline: deadlineDate,
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
            setNotification({
                message: err.response?.data?.message || 'Failed to create task. Check the title and deadline and try again.',
                type: 'error'
            });
        }
    };

    const handleAddTeamMember = async (userId) => {
        if (!selectedProject) return;
        try {
            // Always work with ID strings
            const currentIds = (selectedProject.teamIds || []).map(m => (typeof m === 'object' && m ? m.id || m._id : m));
            if (currentIds.includes(userId)) return;

            const updatedTeamIds = [...currentIds, userId];
            const res = await api.put(`/projects/${selectedProject.id}`, {
                teamIds: updatedTeamIds
            });
            // Update local state with normalized IDs
            const normalizedTeamIds = res.data.teamIds || updatedTeamIds;
            setProjects(projects.map(p => p.id === selectedProject.id ? { ...p, teamIds: normalizedTeamIds } : p));
            setSelectedProject({ ...selectedProject, teamIds: normalizedTeamIds });
        } catch (err) {
            console.error('Failed to add member', err);
            setNotification({ message: 'Failed to add member', type: 'error' });
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

            // 2. Remove member from project (normalize current IDs first)
            const currentIds = (selectedProject.teamIds || []).map(m => (typeof m === 'object' && m ? m.id || m._id : m));
            const updatedTeamIds = currentIds.filter(id => id !== userId);

            await api.put(`/projects/${selectedProject.id}`, {
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
        if (selectedProjectIsOverdue) {
            setNotification({ message: 'Project deadline has passed. Request super admin approval to extend the deadline before assigning tasks.', type: 'error' });
            setShowAssignDeadlineModal(false);
            openDeadlineExtensionModal();
            return;
        }

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

            // AUTO-SYNC: Ensure assignee is in the project team
            const currentTeamIds = (selectedProject.teamIds || []).map(m => (typeof m === 'object' && m ? m.id || m._id : m));
            if (selectedProject && !currentTeamIds.includes(assigneeId)) {
                console.log("Syncing assignee to project team...");
                await handleAddTeamMember(assigneeId);
            }

            // Close modal
            setShowAssignDeadlineModal(false);
            setPendingAssignment(null);
            setAssignDeadline('');
        } catch (err) {
            console.error("Failed to assign task", err);
            setNotification({ message: err.response?.data?.message || 'Failed to assign task.', type: 'error' });
            loadData(); // Revert on error
        }
    };

    // handleSkipDeadline removed as mandatory deadline is now required.


    // "Approve Completion" Logic
    const isProjectReadyForCompletion = selectedProject &&
        selectedProject.status !== 'COMPLETED' &&
        tasks.filter(t => t.projectId === selectedProject.id).length > 0 &&
        tasks.filter(t => t.projectId === selectedProject.id).every(t => t.status === 'COMPLETED');

    const handleApproveCompletion = async () => {
        if (!selectedProject) return;
        setConfirmModal({
            show: true,
            title: 'Complete Project?',
            message: 'All tasks are completed. Do you want to mark this project as COMPLETED?',
            type: 'primary',
            onConfirm: async () => {
                await handleStatusChange(selectedProject.id, 'COMPLETED');
                setConfirmModal({ ...confirmModal, show: false });
            }
        });
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
        if (isProjectOverdue(selectedProject)) {
            setNotification({ message: 'Project deadline has passed. Request super admin approval to extend the deadline before assigning tasks.', type: 'error' });
            openDeadlineExtensionModal();
            return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        // Position relative to viewport, handling edge cases
        setUserPickerPosition({ x: rect.left, y: rect.bottom + 5 });
        setShowUserPicker(task.id);
    };

    // Filter Logic for the Table
    const getProjectTasks = () => {
        if (!selectedProject) return [];
        let pTasks = tasks.filter(t => t.projectId === selectedProject.id);
        if (isFullProductProductionProject(selectedProject)) {
            pTasks = pTasks.filter((task) => !task.isProductionTask);
        }

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

    const selectedProjectAllTasks = selectedProject
        ? tasks.filter(t => t.projectId === selectedProject.id || (t.project && t.project._id === selectedProject.id))
        : [];
    const projectTasks = getProjectTasks();
    const selectedProjectIsOverdue = isProjectOverdue(selectedProject);
    const latestDeadlineExtensionRequest = deadlineExtensionRequests[0] || null;
    const totalPages = Math.ceil(projectTasks.length / itemsPerPage);
    const paginatedTasks = projectTasks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const todayDateString = new Date().toISOString().split('T')[0];
    const projectStartDateString = selectedProject?.startDate ? new Date(selectedProject.startDate).toISOString().split('T')[0] : '';
    const projectDeadlineDateString = selectedProject?.deadline ? new Date(selectedProject.deadline).toISOString().split('T')[0] : '';
    const addTaskMinDate = projectStartDateString && projectStartDateString > todayDateString ? projectStartDateString : todayDateString;

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
                            <h1 className="text-3xl md:text-4xl font-bold text-[#556070] tracking-tight mb-2">Projects</h1>
                            <p className="text-text-secondary text-lg">Monitor and manage all team projects.</p>
                        </div>
                        <div className="flex gap-3">
                            {['ALL', 'ACTIVE', 'PLANNING', 'COMPLETED'].map((status) => (
                                <button
                                    key={status}
                                    onClick={() => setFilter(status)}
                                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${filter === status
                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                                        : 'bg-white text-text-secondary hover:text-[#1e293b] border border-slate-200'
                                        }`}
                                >
                                    {status === 'ALL' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase()}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Content */}
                    {loading ? (
                        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
                            <p className="text-text-secondary">Loading projects...</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-y-auto pb-4">
                            {filteredProjects.map((p) => {
                                const projectTasks = tasks.filter((t) => t.projectId === p.id && (p.projectType !== 'FULL_PRODUCT_PRODUCTION' || !t.isProductionTask));
                                const completed = projectTasks.filter((t) => t.status === 'COMPLETED').length;
                                const progress = projectTasks.length > 0 ? Math.round((completed / projectTasks.length) * 100) : 0;
                                const projectMembers = users.filter((u) => p.teamIds?.includes(u.id));

                                return (
                                    <div
                                        key={p.id}
                                        onClick={() => openDetailsModal(p)}
                                        className="bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden hover:border-emerald-500/50 transition-colors cursor-pointer relative group h-full max-h-[300px] flex flex-col"
                                    >
                                        <div className="p-6 flex-1 flex flex-col">
                                            <div className="flex items-start justify-between mb-4">
                                                <div>
                                                    <h3 className="text-[#556070] font-semibold text-lg">{p.name}</h3>
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
                                                    <span className="text-[#556070] text-sm font-semibold">₹ {p.budget?.toLocaleString('en-IN')}</span>
                                                </div>
                                            )}

                                            {/* Progress */}
                                            <div className="mb-4">
                                                <div className="flex justify-between text-sm mb-2">
                                                    <span className="text-text-secondary">Progress</span>
                                                    <span className="text-[#556070]">{progress}%</span>
                                                </div>
                                                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
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
                                                    className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-[#556070] text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none cursor-pointer disabled:opacity-60"
                                                    value={p.status}
                                                    onChange={(e) => handleStatusChange(p.id, e.target.value)}
                                                    disabled={p.status === 'COMPLETED'}
                                                >
                                                    <option value="PLANNING">Planning</option>
                                                    <option value="ACTIVE">Active</option>
                                                    {p.status === 'WAITING_APPROVAL' && <option value="WAITING_APPROVAL">⏳ Waiting Approval</option>}
                                                    {p.status === 'COMPLETED' ? (
                                                        <option value="COMPLETED">Completed</option>
                                                    ) : (
                                                        <option value="COMPLETED">Request Closure (Submit to Admin)</option>
                                                    )}
                                                </select>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openDetailsModal(p);
                                                    }}
                                                    className="p-2 rounded-lg bg-white border border-slate-200 text-text-secondary hover:text-[#1e293b] hover:bg-slate-50 transition-colors"
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
                        className="bg-[#0a0f1d] border border-slate-800 w-full max-w-[94vw] rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[88vh] max-h-[94vh]"
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

                        {isBoardProjectView(selectedProject, selectedProjectAllTasks) ? (
                            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 md:p-8">
                                <ProductionDashboard
                                    project={selectedProject}
                                    tasks={selectedProjectAllTasks}
                                    users={users}
                                    showManagerActions={true}
                                    onTaskSelect={openTaskDetail}
                                    onAssignTask={handleAssignClick}
                                    onDeleteTask={handleDeleteTask}
                                    onRefresh={async () => {
                                        await loadData();
                                    }}
                                />
                            </div>
                        ) : (
                            <>
                                {selectedProjectIsOverdue && (
                                    <div className="px-4 pt-4 md:px-8 md:pt-6 shrink-0">
                                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                <div>
                                                    <p className="text-sm font-bold text-amber-300">Project deadline has already passed.</p>
                                                    <p className="mt-1 text-xs text-amber-100/80">
                                                        Managers cannot assign or self-assign tasks until a super admin approves a deadline extension request.
                                                    </p>
                                                    {latestDeadlineExtensionRequest && (
                                                        <p className="mt-2 text-xs text-amber-100/70">
                                                            Latest request: <span className="font-semibold">{latestDeadlineExtensionRequest.status}</span>
                                                            {' '}for {new Date(latestDeadlineExtensionRequest.requestedDeadline).toLocaleDateString('en-GB')}
                                                        </p>
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={openDeadlineExtensionModal}
                                                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-amber-400"
                                                >
                                                    <span className="material-symbols-outlined text-base">event_repeat</span>
                                                    Request Deadline Extension
                                                </button>
                                            </div>
                                            <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/30 p-3">
                                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-300">Request History</p>
                                                {loadingDeadlineExtensionRequests ? (
                                                    <p className="mt-2 text-xs text-slate-400">Loading requests...</p>
                                                ) : deadlineExtensionRequests.length > 0 ? (
                                                    <div className="mt-2 space-y-2">
                                                        {deadlineExtensionRequests.slice(0, 3).map((request) => (
                                                            <div key={request.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-slate-900/40 px-3 py-2 text-xs">
                                                                <div>
                                                                    <p className="text-slate-200">
                                                                        Requested <span className="font-semibold">{new Date(request.requestedDeadline).toLocaleDateString('en-GB')}</span>
                                                                    </p>
                                                                    <p className="text-slate-400 line-clamp-1">{request.reason}</p>
                                                                </div>
                                                                <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                                                                    request.status === 'APPROVED'
                                                                        ? 'bg-emerald-500/15 text-emerald-300'
                                                                        : request.status === 'REJECTED'
                                                                            ? 'bg-rose-500/15 text-rose-300'
                                                                            : 'bg-amber-500/15 text-amber-300'
                                                                }`}>
                                                                    {request.status}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="mt-2 text-xs text-slate-400">No extension requests submitted yet.</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Controls: Filter & Search */}
                                <div className="px-4 py-4 md:px-8 md:py-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
                                    <div className="flex items-center space-x-2 overflow-x-auto pb-2 scrollbar-hide lg:pb-0">
                                        {['ALL', 'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'].map((f) => (
                                            <button
                                                key={f}
                                                onClick={() => { setTaskFilter(f); setCurrentPage(1); }}
                                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wider transition-all whitespace-nowrap ${taskFilter === f
                                                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
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
                                        className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3"
                                    >
                                        <div className="flex-1 flex flex-col md:flex-row gap-3">
                                            <div className="flex-[1.5] relative">
                                                <input
                                                    type="text"
                                                    value={newTaskTitle}
                                                    onChange={(e) => setNewTaskTitle(e.target.value)}
                                            className="w-full bg-slate-900/30 border-2 border-[#2563eb]/60 rounded-xl py-2 px-4 md:py-3 md:px-6 text-sm text-slate-100 placeholder:text-[#8ea4c9] focus:outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-[#2563eb]/10 transition-all"
                                            placeholder="Task Title..."
                                        />
                                    </div>
                                    <div className="flex-[2] relative">
                                        <input
                                                    type="text"
                                                    value={newTaskDescription}
                                                    onChange={(e) => setNewTaskDescription(e.target.value)}
                                            className="w-full bg-slate-900/30 border-2 border-[#2563eb]/60 rounded-xl py-2 pl-4 pr-12 md:py-3 md:pl-6 md:pr-36 text-sm text-slate-100 placeholder:text-[#8ea4c9] focus:outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-[#2563eb]/10 transition-all"
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
                                                            min={addTaskMinDate}
                                                            max={projectDeadlineDateString || undefined}
                                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                            title="Set Deadline"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={!newTaskTitle || !newTaskDeadline}
                                            className="flex items-center justify-center space-x-2 px-6 py-2 md:py-3 bg-[#2563eb] hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-900/20 whitespace-nowrap"
                                        >
                                            <span className="material-symbols-outlined text-lg">add</span>
                                            <span>Add Task</span>
                                        </button>
                                    </form>
                                </div>

                                {/* Table Content */}
                                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 pb-4 md:px-8 md:pb-8">
                                    <div className="bg-slate-900/20 border border-slate-800 rounded-xl overflow-hidden min-h-[300px]">
                                        <table className="w-full text-left border-collapse hidden lg:table">
                                            <thead className="sticky top-0 bg-[#0a0f1d] z-10">
                                                <tr className="bg-slate-900/50 border-b border-slate-800">
                                                    <th className="w-8 pl-3 pr-0">
                                                        {isSaving && <span className="material-symbols-outlined text-[14px] text-emerald-400 animate-spin">progress_activity</span>}
                                                    </th>
                                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Task</th>
                                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Assignee</th>
                                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Status</th>
                                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Deadline</th>
                                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Actions</th>
                                                </tr>
                                            </thead>
                                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTaskDragEnd}>
                                            <SortableContext items={paginatedTasks.map(t => t._id ?? t.id)} strategy={verticalListSortingStrategy}>
                                            <tbody className="divide-y divide-slate-800">
                                                {paginatedTasks.length > 0 ? (
                                                    paginatedTasks.map((task) => {
                                                        const currentUser = getCurrentUser();
                                                        const assignee = users.find(u => u.id === task.assigneeId) || (task.assigneeId === currentUser?.id ? { ...currentUser, name: currentUser.name || 'Me' } : null);
                                                        const badgeStyle = getStatusBadgeStyles(task.status, !!task.assigneeId);
                                                        const deadline = task.deadline ? new Date(task.deadline) : null;
                                                        const isOverdue = deadline && new Date(deadline).setHours(23, 59, 59, 999) < Date.now() && task.status !== 'COMPLETED';

                                                        return (
                                                            <SortableTaskRow key={task._id ?? task.id} task={task}>
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
                                                                                    if (true) {
                                                                                        setConfirmModal({
                                                                                            show: true,
                                                                                            title: 'Complete Task?',
                                                                                            message: 'Mark this task as completed?',
                                                                                            type: 'primary',
                                                                                            onConfirm: () => {
                                                                                                handleTaskApproval(task.id, 'COMPLETED');
                                                                                                setConfirmModal({ ...confirmModal, show: false });
                                                                                            }
                                                                                        });
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
                                                                                    if (true) {
                                                                                        setConfirmModal({
                                                                                            show: true,
                                                                                            title: 'Reopen Task?',
                                                                                            message: 'Reopen this task? Status will be set to IN PROGRESS.',
                                                                                            type: 'primary',
                                                                                            onConfirm: () => {
                                                                                                handleTaskApproval(task.id, 'IN_PROGRESS');
                                                                                                setConfirmModal({ ...confirmModal, show: false });
                                                                                            }
                                                                                        });
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
                                                                                        if (true) {
                                                                                            setConfirmModal({
                                                                                                show: true,
                                                                                                title: 'Approve Task?',
                                                                                                message: 'Approve this task as COMPLETED?',
                                                                                                type: 'primary',
                                                                                                onConfirm: () => {
                                                                                                    handleTaskApproval(task.id, 'COMPLETED');
                                                                                                    setConfirmModal({ ...confirmModal, show: false });
                                                                                                }
                                                                                            });
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
                                                                                setConfirmModal({
                                                                                    show: true,
                                                                                    title: 'Delete Task',
                                                                                    message: `Are you sure you want to delete the task "${task.title}"? This action cannot be undone.`,
                                                                                    type: 'danger',
                                                                                    onConfirm: async () => {
                                                                                        setConfirmModal(prev => ({ ...prev, show: false }));
                                                                                        await handleDeleteTask(task.id || task._id);
                                                                                    }
                                                                                });
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
                                                            </SortableTaskRow>
                                                        );
                                                    })
                                                ) : (
                                                    <tr>
                                                        <td colSpan="6" className="px-6 py-10 text-center text-slate-500 text-sm">
                                                            No tasks found matching current filters.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                            </SortableContext>
                                            </DndContext>
                                        </table>

                                        {/* Mobile Card View */}
                                        <div className="lg:hidden divide-y divide-white/5">
                                            {paginatedTasks.length > 0 ? (
                                                paginatedTasks.map((task) => {
                                                    const currentUser = getCurrentUser();
                                                    const assignee = users.find(u => u.id === task.assigneeId) || (task.assigneeId === currentUser?.id ? { ...currentUser, name: currentUser.name || 'Me' } : null);
                                                    const badgeStyle = getStatusBadgeStyles(task.status, !!task.assigneeId);
                                                    const deadline = task.deadline ? new Date(task.deadline) : null;
                                                    const isOverdue = deadline && deadline < new Date() && task.status !== 'COMPLETED';

                                                    return (
                                                        <div key={task.id} className="p-4 space-y-3">
                                                            <div className="flex justify-between items-start gap-3">
                                                                <div className="min-w-0">
                                                                    <div className={`font-bold text-sm truncate ${task.status === 'COMPLETED' ? 'text-slate-500 line-through' : 'text-white'}`}>
                                                                        {task.title}
                                                                    </div>
                                                                    <div className="text-[11px] text-slate-500 mt-1 line-clamp-1">{task.description || 'No description'}</div>
                                                                </div>
                                                                <span className={`px-2 py-1 rounded text-[9px] font-bold border shrink-0 uppercase tracking-wider ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border}`}>
                                                                    {badgeStyle.label}
                                                                </span>
                                                            </div>

                                                            <div className="flex items-center justify-between pt-2">
                                                                <div className="flex items-center gap-2">
                                                                    {assignee ? (
                                                                        <>
                                                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shadow-sm ${assignee.id === getCurrentUser()?.id ? 'bg-indigo-500 shadow-indigo-900/20' : 'bg-emerald-600 shadow-emerald-900/20'}`}>
                                                                                {assignee.name.charAt(0)}
                                                                            </div>
                                                                            <span className="text-xs text-slate-300 font-medium truncate max-w-[100px]">{assignee.name}</span>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[9px] font-bold text-slate-400">?</div>
                                                                            <span className="text-xs text-slate-500 italic">Unassigned</span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                                {deadline && (
                                                                    <div className={`text-[10px] font-mono border px-2 py-0.5 rounded ${isOverdue ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                                                                        {deadline.toLocaleDateString()}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Mobile Actions */}
                                                            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/5 mt-2">
                                                                {/* Assign Button */}
                                                                {!task.assigneeId && (
                                                                    <button
                                                                        onClick={(e) => handleAssignClick(e, task)}
                                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase hover:bg-emerald-500 hover:text-white transition-colors"
                                                                    >
                                                                        <span className="material-symbols-outlined text-sm">person_add</span> Assign
                                                                    </button>
                                                                )}

                                                                {/* Unassign Button */}
                                                                {task.assigneeId && task.status !== 'COMPLETED' && (
                                                                    <button
                                                                        onClick={() => handleUnassignTask(task.id)}
                                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-500 text-[10px] font-bold uppercase hover:bg-amber-500 hover:text-white transition-colors"
                                                                    >
                                                                        <span className="material-symbols-outlined text-sm">person_remove</span> Unassign
                                                                    </button>
                                                                )}

                                                                {/* Delete Button */}
                                                                <button
                                                                    onClick={() => {
                                                                        setConfirmModal({
                                                                            show: true,
                                                                            title: 'Delete Task',
                                                                            message: `Are you sure you want to delete the task "${task.title}"? This action cannot be undone.`,
                                                                            type: 'danger',
                                                                            onConfirm: async () => {
                                                                                setConfirmModal(prev => ({ ...prev, show: false }));
                                                                                await handleDeleteTask(task.id || task._id);
                                                                            }
                                                                        });
                                                                    }}
                                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 text-[10px] font-bold uppercase hover:bg-red-500 hover:text-white transition-colors"
                                                                >
                                                                    <span className="material-symbols-outlined text-sm">delete</span>
                                                                </button>

                                                                {/* View Button */}
                                                                <button
                                                                    onClick={() => openTaskDetail(task)}
                                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-300 text-[10px] font-bold uppercase hover:bg-slate-700 hover:text-white transition-colors"
                                                                >
                                                                    <span className="material-symbols-outlined text-sm">visibility</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <div className="p-8 text-center text-slate-500 italic">
                                                    No tasks found matching current filters.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Footer */}
                        <div className="px-4 py-4 md:px-8 md:py-6 border-t border-slate-800 bg-slate-900/30 flex flex-col md:flex-row items-center justify-between mt-auto shrink-0 gap-4">
                            <div className="flex items-center justify-between w-full md:w-auto md:justify-start gap-6">
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
                            {!isBoardProjectView(selectedProject, selectedProjectAllTasks) && (
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
                            )}
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
                                            setConfirmModal({
                                                show: true,
                                                title: 'Add & Assign?',
                                                message: `Add ${u.name} to project team and assign task?`,
                                                type: 'primary',
                                                onConfirm: async () => {
                                                    await handleAddTeamMember(u.id);
                                                    const task = tasks.find(t => t.id === showUserPicker);
                                                    setPendingAssignment({ taskId: showUserPicker, assigneeId: u.id, task });
                                                    setAssignDeadline(task?.deadline ? new Date(task.deadline).toISOString().slice(0, 10) : '');
                                                    setShowAssignDeadlineModal(true);
                                                    setShowUserPicker(null);
                                                    setConfirmModal({ ...confirmModal, show: false });
                                                }
                                            });
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
                                            <div key={u.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 hover:bg-slate-800 hover:border-indigo-500/30 transition-all group cursor-pointer"
                                                onClick={() => handleViewMemberDetails(u)}>
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-slate-700 group-hover:bg-indigo-600 flex items-center justify-center text-slate-300 group-hover:text-white font-medium text-sm transition-colors">
                                                        {u.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium text-white">{u.name}</p>
                                                        <p className="text-[10px] text-slate-500">{u.role} • {u.department}</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setConfirmModal({
                                                            show: true,
                                                            title: 'Remove Member?',
                                                            message: `Are you sure you want to remove ${u.name} from the project team? Their assigned tasks will be unassigned.`,
                                                            type: 'danger',
                                                            onConfirm: async () => {
                                                                await handleRemoveTeamMember(u.id);
                                                                setConfirmModal({ ...confirmModal, show: false });
                                                            }
                                                        });
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
                                            <div key={u.id} className="flex items-center justify-between p-3 hover:bg-slate-800/30 rounded-lg border border-transparent hover:border-indigo-500/30 transition-all group cursor-pointer"
                                                onClick={() => handleViewMemberDetails(u)}>
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-slate-800 group-hover:bg-indigo-600 flex items-center justify-center text-slate-500 group-hover:text-white text-sm transition-colors">
                                                        {u.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">{u.name}</p>
                                                        <p className="text-[10px] text-slate-600 group-hover:text-slate-500">{u.role} • {u.department}</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleAddTeamMember(u.id);
                                                    }}
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
                        <div className="relative w-full max-w-md mx-4 rounded-2xl border border-slate-700 bg-[#0F172A] shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                            <div className={`px-6 py-4 border-b border-slate-700 ${pendingAssignment.isSelfAssign ? 'bg-gradient-to-r from-indigo-900/80 to-purple-900/70' : 'bg-slate-900/80'}`}>
                                <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                                    <span className={`material-symbols-outlined ${pendingAssignment.isSelfAssign ? 'text-indigo-400' : 'text-primary'}`}>
                                        {pendingAssignment.isSelfAssign ? 'person_add' : 'schedule'}
                                    </span>
                                    {pendingAssignment.isSelfAssign ? 'Assign to Yourself' : 'Set Deadline for Assignment'}
                                </h2>
                            </div>
                            <div className="p-6 space-y-4">
                                {/* Task Info */}
                                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                                    <p className="text-slate-100 font-medium">{pendingAssignment.task?.title}</p>
                                    <p className="text-slate-300 text-sm mt-1">
                                        {pendingAssignment.isSelfAssign
                                            ? <span className="text-indigo-400 font-medium">Taking this task for yourself</span>
                                            : <>Assigning to: <span className="text-slate-100">{users.find(u => u.id === pendingAssignment.assigneeId)?.name || 'Unknown'}</span></>
                                        }
                                    </p>
                                </div>

                                {selectedProjectIsOverdue ? (
                                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                                        <p className="text-sm font-semibold text-amber-300">
                                            Assignment is blocked because this project deadline has passed.
                                        </p>
                                        <p className="mt-2 text-xs text-amber-100/80">
                                            Managers must request a super-admin deadline extension before assigning or self-assigning tasks again.
                                        </p>
                                        {latestDeadlineExtensionRequest && (
                                            <p className="mt-2 text-xs text-amber-100/70">
                                                Latest request: <span className="font-semibold">{latestDeadlineExtensionRequest.status}</span>
                                                {' '}for {new Date(latestDeadlineExtensionRequest.requestedDeadline).toLocaleDateString('en-GB')}
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                {/* Deadline Input */}
                                <div>
                                    <label className="block text-slate-300 text-sm mb-2">
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
                                        className="date-input-dark w-full bg-slate-950 border border-slate-600 rounded-lg px-4 py-3 text-slate-100 focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                    />
                                    {selectedProject?.deadline && (
                                        <p className="text-slate-300 text-xs mt-1">
                                            📅 Must be between <span className="text-white">{selectedProject.startDate ? new Date(selectedProject.startDate).toLocaleDateString() : 'Today'}</span> and <span className="text-primary font-medium">{new Date(selectedProject.deadline).toLocaleDateString()}</span>
                                        </p>
                                    )}
                                </div>

                                {/* Info */}
                                <p className="text-slate-300 text-xs">
                                    💡 Performance will be calculated based on when the task is completed vs. this deadline.
                                </p>
                                    </>
                                )}
                            </div>
                            <div className="px-6 py-4 border-t border-border-dark flex justify-between gap-3">
                                <button
                                    onClick={() => {
                                        setShowAssignDeadlineModal(false);
                                        setPendingAssignment(null);
                                        setAssignDeadline('');
                                    }}
                                    className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={selectedProjectIsOverdue ? openDeadlineExtensionModal : handleConfirmAssignment}
                                    disabled={!selectedProjectIsOverdue && !assignDeadline}
                                    className={`px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${selectedProjectIsOverdue
                                        ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                                        : pendingAssignment.isSelfAssign
                                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                            : 'bg-primary hover:bg-primary-dark text-white'
                                        }`}
                                >
                                    {selectedProjectIsOverdue
                                        ? 'Request Deadline Extension'
                                        : pendingAssignment.isSelfAssign ? 'Take Task with Deadline' : 'Assign with Deadline'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
            {showDeadlineExtensionModal && selectedProject && (
                <div className="fixed inset-0 z-[10001] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowDeadlineExtensionModal(false)}></div>
                    <div className="relative mx-4 w-full max-w-lg overflow-hidden rounded-2xl border border-slate-700 bg-[#0F172A] shadow-2xl">
                        <div className="border-b border-slate-800 bg-slate-900/60 px-6 py-4">
                            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                                <span className="material-symbols-outlined text-amber-400">event_repeat</span>
                                Request Deadline Extension
                            </h2>
                            <p className="mt-1 text-sm text-slate-400">
                                Submit a new deadline and business reason for super-admin approval.
                            </p>
                        </div>
                        <form onSubmit={handleSubmitDeadlineExtensionRequest} className="space-y-4 p-6">
                            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                                <p className="text-sm font-semibold text-white">{selectedProject.name}</p>
                                <p className="mt-1 text-xs text-slate-400">
                                    Current deadline: {selectedProject.deadline ? new Date(selectedProject.deadline).toLocaleDateString('en-GB') : 'Not set'}
                                </p>
                            </div>
                            <div>
                                <label className="mb-2 block text-sm font-medium text-slate-300">
                                    Requested New Deadline
                                </label>
                                <input
                                    type="date"
                                    value={deadlineExtensionDate}
                                    min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                                    onChange={(e) => setDeadlineExtensionDate(e.target.value)}
                                    className="date-input-dark w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-500/30"
                                    required
                                />
                            </div>
                            <div>
                                <label className="mb-2 block text-sm font-medium text-slate-300">
                                    Reason for Extension
                                </label>
                                <textarea
                                    value={deadlineExtensionReason}
                                    onChange={(e) => setDeadlineExtensionReason(e.target.value)}
                                    rows={4}
                                    placeholder="Explain why this project deadline must be extended."
                                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white placeholder-slate-500 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-500/30"
                                    required
                                />
                            </div>
                            <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowDeadlineExtensionModal(false)}
                                    className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submittingDeadlineExtension}
                                    className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {submittingDeadlineExtension ? 'Submitting...' : 'Submit Request'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* Rejection Reason Modal */}
            {
                showRejectModal && taskToReject && (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowRejectModal(false)}></div>
                        <div className="relative bg-[#0F172A] border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200">
                            <div className="px-6 py-4 border-b border-slate-700 bg-gradient-to-r from-red-950/80 to-red-900/40">
                                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-red-500">cancel</span>
                                    Reject Task Approval
                                </h2>
                            </div>
                            <form onSubmit={confirmReject} className="p-6 space-y-4">
                                <div>
                                    <p className="text-white font-medium mb-1">Task: {taskToReject.title}</p>
                                    <p className="text-slate-400 text-sm">Please provide a reason for rejecting this task approval request.</p>
                                </div>

                                <div>
                                    <label className="block text-slate-300 text-sm mb-2 font-medium">
                                        Rejection Reason <span className="text-red-500">*</span>
                                    </label>
                                    <textarea
                                        value={rejectionReason}
                                        onChange={(e) => setRejectionReason(e.target.value)}
                                        required
                                        rows={4}
                                        className="w-full bg-[#1E293B] border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none resize-none placeholder-slate-500"
                                        placeholder="Explain why the task is being rejected..."
                                    />
                                </div>

                                <div className="flex justify-end gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowRejectModal(false)}
                                        className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-6 py-2 rounded-lg font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors shadow-lg shadow-red-900/30"
                                    >
                                        Reject Task
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Team Member Details Modal */}
            {showMemberDetailsModal && selectedTeamMember && (
                <div className="fixed inset-0 z-[10002] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowMemberDetailsModal(false)}></div>
                    <div className="relative bg-[#0F172A] border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="px-6 py-5 border-b border-white/5 bg-gradient-to-r from-indigo-600/10 to-purple-600/10">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                                        {selectedTeamMember.name.charAt(0)}
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                                            <span className="material-symbols-outlined text-indigo-400">person</span>
                                            Team Member Details & Performance
                                        </h3>
                                        <p className="text-slate-400 text-sm mt-1">{selectedTeamMember.name}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowMemberDetailsModal(false)}
                                    className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                                >
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* User Info */}
                            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h4 className="text-xl font-bold text-white">{selectedTeamMember.name}</h4>
                                        <p className="text-slate-400 mt-1">{selectedTeamMember.email}</p>
                                        <div className="flex gap-2 mt-3">
                                            <span className={`px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider ${selectedTeamMember.role === 'EMPLOYEE' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                                                selectedTeamMember.role === 'INTERN' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                                                    'bg-green-500/20 text-green-400 border border-green-500/30'
                                                }`}>
                                                {selectedTeamMember.role}
                                            </span>
                                            <span className="px-3 py-1 text-xs font-bold rounded-full bg-slate-700/50 text-slate-300 border border-slate-600">
                                                {selectedTeamMember.employeeId || selectedTeamMember.id}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>


                            {/* Pending Tasks (NOT_STARTED and IN_PROGRESS only) */}
                            {memberPerformance?.tasks && (
                                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                                    <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-base">task</span>
                                        Pending Tasks ({memberPerformance.tasks.filter(t => t.status !== 'COMPLETED').length})
                                    </h4>
                                    {memberPerformance.tasks.filter(t => t.status !== 'COMPLETED').length > 0 ? (
                                        <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                                            {memberPerformance.tasks
                                                .filter(t => t.status !== 'COMPLETED')
                                                .map((task) => (
                                                    <div key={task.id} className="p-3 bg-white/5 border border-white/5 rounded-lg">
                                                        <div className="flex items-start justify-between">
                                                            <div className="flex-1">
                                                                <p className="text-sm font-medium text-white">{task.title}</p>
                                                                <p className="text-xs text-slate-500 mt-1">{task.projectName}</p>
                                                                {task.deadline && (
                                                                    <p className="text-xs text-slate-500 mt-1">
                                                                        Due: {new Date(task.deadline).toLocaleDateString()}
                                                                    </p>
                                                                )}
                                                            </div>
                                                            <span className={`px-2 py-1 text-[10px] font-bold rounded uppercase ml-2 ${task.status === 'IN_PROGRESS' ? 'bg-blue-500/20 text-blue-400' :
                                                                'bg-slate-700 text-slate-400'
                                                                }`}>
                                                                {task.status === 'NOT_STARTED' ? 'NOT STARTED' : task.status.replace('_', ' ')}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 text-slate-500 text-sm">
                                            <span className="material-symbols-outlined text-4xl opacity-50">check_circle</span>
                                            <p className="mt-2">No pending tasks.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-white/5 bg-white/5 flex justify-between items-center">
                            <button
                                onClick={() => setShowMemberDetailsModal(false)}
                                className="px-6 py-2.5 rounded-lg border border-slate-600 hover:bg-slate-700 text-white font-semibold transition-colors"
                            >
                                Close
                            </button>
                            {/* Show Add button only if member is NOT in current team */}
                            {!getTeamMembers(selectedProject).some(m => m.id === selectedTeamMember.id) && (
                                <button
                                    onClick={async () => {
                                        await handleAddTeamMember(selectedTeamMember.id);
                                        setShowMemberDetailsModal(false);
                                    }}
                                    className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-lg">person_add</span>
                                    Add to Team
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmation Modal */}
            {confirmModal.show && (
                <div className="fixed inset-0 z-[10001] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmModal({ ...confirmModal, show: false })}></div>
                    <div className="relative bg-[#0F172A] border border-slate-700 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-4 mb-6">
                            <div className={`size-12 rounded-full flex items-center justify-center shrink-0 ${confirmModal.type === 'danger' ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'
                                }`}>
                                <span className="material-symbols-outlined text-3xl">
                                    {confirmModal.type === 'danger' ? 'warning' : 'help_outline'}
                                </span>
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white">{confirmModal.title}</h3>
                                <p className="text-slate-400 mt-1 text-sm">{confirmModal.message}</p>
                            </div>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setConfirmModal({ ...confirmModal, show: false })}
                                className="px-5 py-2 rounded-xl border border-slate-700 text-slate-300 font-medium hover:bg-slate-800 transition-colors text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmModal.onConfirm}
                                className={`px-5 py-2 rounded-xl text-white font-bold shadow-lg transition-all text-sm ${confirmModal.type === 'danger'
                                    ? 'bg-red-600 hover:bg-red-700 shadow-red-900/20'
                                    : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-900/20'
                                    }`}
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </ManagerLayout>
    );
}
