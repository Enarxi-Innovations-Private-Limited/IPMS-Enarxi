import { Fragment, useEffect, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import {
    DndContext,
    PointerSensor,
    closestCenter,
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
import { ENARXI_LOGO_B64 } from '../../assets/enarxi-logo-b64.js';
import { useSocket } from '../../context/SocketContext.jsx';

function SortableProdRow({ task, children, className = '' }) {
    const id = task._id || task.id;
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.45 : 1 };
    return (
        <tr ref={setNodeRef} style={style} className={className}>
            <td className="w-8 pl-3 pr-0 py-5 cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
                <span className="material-symbols-outlined text-[18px] text-[#434656] hover:text-[#b8c3ff] select-none transition-colors">drag_indicator</span>
            </td>
            {children}
        </tr>
    );
}

const PHASE_ICONS = {
    Procurement: 'check_circle',
    'Component delivery': 'local_shipping',
    'Smd soldering': 'settings',
    'Smd rework': 'build',
    'Controller soldering': 'memory',
    'Dip soldering': 'conveyor_belt',
    'Board cleaning': 'cleaning_services',
    'Electrical testing': 'electric_bolt',
    'Peripheral testing': 'microwave',
    'Functionality testing': 'fact_check',
    'Conformal coating': 'water_drop',
    'Final qc': 'verified'
};

const formatDate = (value) => {
    if (!value) return 'Not set';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not set' : date.toLocaleDateString();
};

const getProjectId = (project) => project?.id || project?._id;
const getTaskId = (task) => task?.id || task?._id;
const getUserId = (user) => user?.id || user?._id;
const getManagerId = (project) => project?.managerId?._id || project?.managerId || null;
const getInitial = (value, fallback = 'U') => (value || fallback).slice(0, 1).toUpperCase();

const getTaskState = (task) => {
    if (task.status === 'COMPLETED') return 'completed';
    if (Number(task.unitsCurrentlyHere || 0) > 0) return 'active';
    return 'pending';
};

const getAvailableCapacity = (task, index, sortedTasks, totalBatch) => Number(totalBatch || 0);

const getWorkflowCompletionPercent = (workflowTasks, totalBatch) => {
    const capacity = Number(totalBatch || 0);
    if (capacity <= 0 || workflowTasks.length === 0) return 0;
    const completedTotal = workflowTasks.reduce((sum, task) => sum + Math.min(Number(task.unitsCompleted || 0), capacity), 0);
    const totalRequired = workflowTasks.length * capacity;
    return Math.min(100, Math.round((completedTotal / totalRequired) * 100));
};

const getDaysLeftLabel = (deadline) => {
    if (!deadline) return 'No deadline';
    const today = new Date();
    const end = new Date(deadline);
    if (Number.isNaN(end.getTime())) return 'No deadline';

    today.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return `${Math.abs(diffDays)} Days Overdue`;
    if (diffDays === 0) return 'Due Today';
    if (diffDays === 1) return '1 Day Left';
    return `${diffDays} Days Left`;
};

const getStepLabel = (task) => {
    const phase = task.productionPhase || task.title || '';
    if (phase === 'Smd soldering') return 'SMT';
    if (phase === 'Controller soldering') return 'Controller';
    if (phase === 'Dip soldering') return 'DIP';
    if (phase === 'Electrical testing') return 'Testing';
    if (phase === 'Final qc') return 'QC';
    return phase;
};

export default function ProductionDashboard({
    project,
    tasks,
    users,
    onRefresh,
    showManagerActions = true,
    onTaskSelect = null,
    onAssignTask = null,
    onDeleteTask = null
}) {
    const [editingTaskId, setEditingTaskId] = useState(null);
    const [draft, setDraft] = useState({ unitsCompleted: '', assigneeId: '' });
    const [rowLoading, setRowLoading] = useState({});
    const [rowErrors, setRowErrors] = useState({});
    const [feedback, setFeedback] = useState({ type: '', message: '' });

    // ── Drag-to-reorder state ──
    const [orderedProdTasks, setOrderedProdTasks] = useState([]);
    const [orderedFullStages, setOrderedFullStages] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const saveTimerRef = useRef(null);
    const { socket } = useSocket();
    const [assignments, setAssignments] = useState([]);
    const [assignmentLoading, setAssignmentLoading] = useState(false);
    const [assignmentSaving, setAssignmentSaving] = useState({});
    const [assignmentErrors, setAssignmentErrors] = useState({});
    const [expandedTasks, setExpandedTasks] = useState({});
    const [assignmentDrafts, setAssignmentDrafts] = useState({});
    const [newAssignmentDrafts, setNewAssignmentDrafts] = useState({});
    const [progressDrafts, setProgressDrafts] = useState({}); // { [assignmentId]: boardsCompletedDraft }

    // ── Tab system ──
    const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'dispatches'

    // ── Dispatch state ──
    const [dispatches, setDispatches] = useState([]);
    const [dispatchLoading, setDispatchLoading] = useState(false);
    const [showCreateDispatch, setShowCreateDispatch] = useState(false);
    const [dispatchSaving, setDispatchSaving] = useState(false);
    const [dispatchError, setDispatchError] = useState('');
    const [fullProductDraft, setFullProductDraft] = useState({ title: '', description: '', deadline: '' });
    const [fullProductSaving, setFullProductSaving] = useState(false);
    const emptyDispatchForm = {
        customerName: '', customerAddress: '', customerGSTIN: '', placeOfSupply: '',
        boardFrom: '', boardTo: '',
        productDescription: 'PCB Assembly', hsnCode: '', ratePerBoard: '', igstPercent: '18',
        challanType: 'Job Work', notes: '',
    };
    const [dispatchForm, setDispatchForm] = useState(emptyDispatchForm);
    const isFullProductProject = project?.projectType === 'FULL_PRODUCT_PRODUCTION';

    const sortedTasks = [...(tasks || [])]
        .filter((task) => task.isProductionTask)
        .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
    const fullProductStages = [...(tasks || [])]
        .filter((task) => !task.isProductionTask)
        .sort((a, b) => {
            const seqDiff = Number(a.sequence || 0) - Number(b.sequence || 0);
            if (seqDiff !== 0) return seqDiff;
            return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        });

    const projectId = getProjectId(project);
    const currentUser = getCurrentUser();
    const currentUserId = getUserId(currentUser);
    const projectManagerId = getManagerId(project);
    const canEditProduction = Boolean(
        currentUserId &&
        projectManagerId &&
        String(currentUserId) === String(projectManagerId)
    );
    const showActionsColumn = showManagerActions && canEditProduction;
    const totalBatch = Number(project?.totalBatchSize || 0);
    const hasProjectCapacity = totalBatch > 0;
    const assignableUserIds = new Set(
        (project?.teamIds || [])
            .map((member) => (typeof member === 'object' && member ? member.id || member._id : member))
            .filter(Boolean)
            .map((id) => String(id))
    );

    if (projectManagerId) {
        assignableUserIds.add(String(projectManagerId));
    }

    const assignableUsers = (users || [])
        .filter((user) => assignableUserIds.size === 0 || assignableUserIds.has(String(getUserId(user))))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const assignmentsByTaskId = assignments.reduce((acc, assignment) => {
        const key = String(assignment.taskId);
        if (!acc[key]) acc[key] = [];
        acc[key].push(assignment);
        return acc;
    }, {});
    const boardsPassed = sortedTasks.reduce((sum, task) => sum + Number(task.unitsCompleted || 0), 0);
    const activeStations = sortedTasks.filter((task) => Number(task.unitsCompleted || 0) > 0 || Number(task.unitsCurrentlyHere || 0) < totalBatch).length;
    const activePct = sortedTasks.length > 0 ? Math.round((activeStations / sortedTasks.length) * 100) : 0;
    const overallCompletion = getWorkflowCompletionPercent(sortedTasks, totalBatch);
    const projectState = sortedTasks.length > 0 && sortedTasks.every((task) => Number(task.unitsCompleted || 0) >= totalBatch)
        ? 'COMPLETED'
        : sortedTasks.some((task) => Number(task.unitsCompleted || 0) > 0 || Number(task.unitsCurrentlyHere || 0) < totalBatch || (assignmentsByTaskId[String(getTaskId(task))] || []).length > 0)
            ? 'ACTIVE'
            : 'PLANNING';
    const fullProductCompletedCount = fullProductStages.filter((task) => task.status === 'COMPLETED').length;
    const fullProductActiveCount = fullProductStages.filter((task) => task.status === 'IN_PROGRESS' || task.status === 'WAITING_APPROVAL').length;
    const fullProductBoardsPassed = fullProductStages.reduce((sum, task) => sum + Number(task.unitsCompleted || 0), 0);
    const fullProductProgress = getWorkflowCompletionPercent(fullProductStages, totalBatch);
    const canManageFullProductBoard = Boolean(showManagerActions && currentUserId && projectManagerId && String(currentUserId) === String(projectManagerId));

    // Sync ordered lists when tasks prop changes (e.g. after refresh)
    useEffect(() => {
        const sortByOrder = (list) => [...list].sort((a, b) => {
            const oa = Number(a.order || 0), ob = Number(b.order || 0);
            if (oa !== ob) return oa - ob;
            return Number(a.sequence || 0) - Number(b.sequence || 0);
        });
        setOrderedProdTasks(sortByOrder(sortedTasks));
        setOrderedFullStages(sortByOrder(fullProductStages));
    }, [tasks]);

    // Socket: listen for remote reorders
    useEffect(() => {
        const s = socket?.current;
        if (!s) return;
        const handleReorder = (items) => {
            const idToOrder = Object.fromEntries(items.map(({ taskId, order }) => [String(taskId), order]));
            setOrderedProdTasks(prev => [...prev].sort((a, b) => {
                const oa = idToOrder[String(a._id || a.id)] ?? Number(a.order || 0);
                const ob = idToOrder[String(b._id || b.id)] ?? Number(b.order || 0);
                return oa - ob;
            }));
            setOrderedFullStages(prev => [...prev].sort((a, b) => {
                const oa = idToOrder[String(a._id || a.id)] ?? Number(a.order || 0);
                const ob = idToOrder[String(b._id || b.id)] ?? Number(b.order || 0);
                return oa - ob;
            }));
        };
        s.emit('join:tasks');
        s.on('tasks:reordered', handleReorder);
        return () => s.off('tasks:reordered', handleReorder);
    }, [socket]);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

    const handleProdDragEnd = ({ active, over }) => {
        if (!over || active.id === over.id) return;
        setOrderedProdTasks((prev) => {
            const oldIndex = prev.findIndex(t => (t._id || t.id) === active.id);
            const newIndex = prev.findIndex(t => (t._id || t.id) === over.id);
            const next = arrayMove(prev, oldIndex, newIndex);
            persistOrder(next);
            return next;
        });
    };

    const handleFullStageDragEnd = ({ active, over }) => {
        if (!over || active.id === over.id) return;
        setOrderedFullStages((prev) => {
            const oldIndex = prev.findIndex(t => (t._id || t.id) === active.id);
            const newIndex = prev.findIndex(t => (t._id || t.id) === over.id);
            const next = arrayMove(prev, oldIndex, newIndex);
            persistOrder(next);
            return next;
        });
    };

    const persistOrder = (orderedList) => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        setIsSaving(true);
        saveTimerRef.current = setTimeout(async () => {
            try {
                const items = orderedList.map((t, i) => ({ taskId: t._id || t.id, order: i }));
                await api.put('/tasks/reorder', items);
            } catch (err) {
                console.error('Failed to persist task order', err);
            } finally {
                setIsSaving(false);
            }
        }, 600);
    };

    useEffect(() => {
        if (!editingTaskId) return;
        const activeTask = sortedTasks.find((task) => getTaskId(task) === editingTaskId);
        if (!activeTask) {
            setEditingTaskId(null);
            setDraft({ unitsCompleted: '', assigneeId: '' });
        }
    }, [editingTaskId, sortedTasks]);

    useEffect(() => {
        if (!projectId || sortedTasks.length === 0) {
            if (isFullProductProject && fullProductStages.length > 0) {
                // Allow full-product boards to load their worker allocations even without fixed production tasks.
            } else {
                setAssignments([]);
                return;
            }
        }
        if (!projectId || (sortedTasks.length === 0 && fullProductStages.length === 0)) {
            setAssignments([]);
            return;
        }

        const loadAssignments = async () => {
            setAssignmentLoading(true);
            try {
                const response = await api.get(`/projects/${projectId}/production/assignments`);
                const list = response.data || [];
                setAssignments(list);
                setAssignmentDrafts(
                    list.reduce((acc, item) => {
                        acc[String(item.id || item._id)] = {
                            boardsAssigned: String(item.boardsAssigned ?? 0),
                            boardsCompletedApproved: String(item.boardsCompletedApproved ?? item.boardsCompleted ?? 0),
                            deadline: item.deadline ? new Date(item.deadline).toISOString().slice(0, 10) : ''
                        };
                        return acc;
                    }, {})
                );
                setAssignmentErrors({});
            } catch (err) {
                setAssignmentErrors((prev) => ({
                    ...prev,
                    global: err.response?.data?.message || 'Failed to load worker allocations.'
                }));
            } finally {
                setAssignmentLoading(false);
            }
        };

        loadAssignments();
    }, [fullProductStages.length, isFullProductProject, projectId, sortedTasks.length]);

    const beginEdit = (task) => {
        const taskId = getTaskId(task);
        setEditingTaskId(taskId);
        setDraft({
            unitsCompleted: String(task.unitsCompleted ?? 0),
            assigneeId: task.assigneeId?._id || task.assigneeId || ''
        });
        setRowErrors((prev) => ({ ...prev, [taskId]: '' }));
        setFeedback({ type: '', message: '' });
    };

    const cancelEdit = () => {
        setEditingTaskId(null);
        setDraft({ unitsCompleted: '', assigneeId: '' });
    };

    const saveTask = async (task) => {
        const taskId = getTaskId(task);
        const unitsCompleted = Number(draft.unitsCompleted);
        const assigneeId = draft.assigneeId ? String(draft.assigneeId) : null;

        setRowErrors((prev) => ({ ...prev, [taskId]: '' }));
        setFeedback({ type: '', message: '' });

        if (!Number.isInteger(unitsCompleted) || unitsCompleted < 0) {
            setRowErrors((prev) => ({ ...prev, [taskId]: 'Completed boards must be a whole number 0 or greater.' }));
            return;
        }

        setRowLoading((prev) => ({ ...prev, [taskId]: true }));

        try {
            const response = await api.put(`/projects/${projectId}/production/tasks/${taskId}`, {
                unitsCompleted,
                assigneeId
            });

            setFeedback({
                type: 'success',
                message: response.data?.message || `${task.productionPhase || task.title} updated successfully.`
            });
            cancelEdit();
            if (onRefresh) await onRefresh();
        } catch (err) {
            setRowErrors((prev) => ({
                ...prev,
                [taskId]: err.response?.data?.message || 'Failed to update this production phase.'
            }));
            setFeedback({
                type: 'error',
                message: err.response?.data?.message || 'Failed to update this production phase.'
            });
        } finally {
            setRowLoading((prev) => ({ ...prev, [taskId]: false }));
        }
    };

    const refreshProductionData = async () => {
        if (onRefresh) {
            await onRefresh();
        }
        const response = await api.get(`/projects/${projectId}/production/assignments`);
        const list = response.data || [];
        setAssignments(list);
        setAssignmentDrafts(
            list.reduce((acc, item) => {
                acc[String(item.id || item._id)] = {
                    boardsAssigned: String(item.boardsAssigned ?? 0),
                    boardsCompletedApproved: String(item.boardsCompletedApproved ?? item.boardsCompleted ?? 0),
                    deadline: item.deadline ? new Date(item.deadline).toISOString().slice(0, 10) : ''
                };
                return acc;
            }, {})
        );
    };

    const toggleExpandedTask = (taskId) => {
        setExpandedTasks((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
        setAssignmentErrors((prev) => ({ ...prev, [taskId]: '' }));
    };

    const saveAssignment = async (taskId, assignmentId) => {
        const draftValues = assignmentDrafts[assignmentId] || {};
        const boardsAssigned = Number(draftValues.boardsAssigned);
        const deadline = draftValues.deadline;

        if (!Number.isInteger(boardsAssigned) || boardsAssigned < 0) {
            setAssignmentErrors((prev) => ({ ...prev, [assignmentId]: 'Assigned boards must be a whole number 0 or greater.' }));
            return;
        }
        if (!deadline) {
            setAssignmentErrors((prev) => ({ ...prev, [assignmentId]: 'Deadline is required for each worker allocation.' }));
            return;
        }

        setAssignmentSaving((prev) => ({ ...prev, [assignmentId]: true }));
        setAssignmentErrors((prev) => ({ ...prev, [assignmentId]: '' }));

        try {
            const response = await api.put(`/projects/${projectId}/production/tasks/${taskId}/assignments/${assignmentId}`, {
                boardsAssigned,
                deadline
            });
            setFeedback({
                type: 'success',
                message: response.data?.message || 'Worker allocation updated successfully.'
            });
            await refreshProductionData();
        } catch (err) {
            setAssignmentErrors((prev) => ({
                ...prev,
                [assignmentId]: err.response?.data?.message || 'Failed to update worker allocation.'
            }));
        } finally {
            setAssignmentSaving((prev) => ({ ...prev, [assignmentId]: false }));
        }
    };

    const createAssignment = async (taskId) => {
        const allocationDraft = newAssignmentDrafts[taskId] || {};
        const userId = allocationDraft.userId || '';
        const boardsAssigned = Number(allocationDraft.boardsAssigned);
        const deadline = allocationDraft.deadline || '';

        if (!userId) {
            setAssignmentErrors((prev) => ({ ...prev, [taskId]: 'Select a worker before creating the allocation.' }));
            return;
        }

        if (!Number.isInteger(boardsAssigned) || boardsAssigned < 0) {
            setAssignmentErrors((prev) => ({ ...prev, [taskId]: 'Assigned boards must be a whole number 0 or greater.' }));
            return;
        }
        if (!deadline) {
            setAssignmentErrors((prev) => ({ ...prev, [taskId]: 'Deadline is required before adding a worker allocation.' }));
            return;
        }

        setAssignmentSaving((prev) => ({ ...prev, [taskId]: true }));
        setAssignmentErrors((prev) => ({ ...prev, [taskId]: '' }));

        try {
            const response = await api.post(`/projects/${projectId}/production/tasks/${taskId}/assignments`, {
                userId,
                boardsAssigned,
                deadline
            });
            setFeedback({
                type: 'success',
                message: response.data?.message || 'Worker allocation created successfully.'
            });
            setNewAssignmentDrafts((prev) => ({
                ...prev,
                [taskId]: { userId: '', boardsAssigned: '', deadline: '' }
            }));
            await refreshProductionData();
            setExpandedTasks((prev) => ({ ...prev, [taskId]: true }));
        } catch (err) {
            setAssignmentErrors((prev) => ({
                ...prev,
                [taskId]: err.response?.data?.message || 'Failed to create worker allocation.'
            }));
        } finally {
            setAssignmentSaving((prev) => ({ ...prev, [taskId]: false }));
        }
    };

    const createSelfAssignment = async (taskId, unassignedBoards) => {
        const allocationDraft = newAssignmentDrafts[taskId] || {};
        const boardsAssigned = Number(allocationDraft.boardsAssigned) || unassignedBoards;
        const deadline = allocationDraft.deadline || (project?.deadline ? new Date(project.deadline).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));

        if (!currentUserId) {
            setAssignmentErrors((prev) => ({ ...prev, [taskId]: 'User not identified for self assignment.' }));
            return;
        }

        if (!Number.isInteger(boardsAssigned) || boardsAssigned <= 0) {
            setAssignmentErrors((prev) => ({ ...prev, [taskId]: 'Assigned boards must be greater than 0.' }));
            return;
        }

        setAssignmentSaving((prev) => ({ ...prev, [taskId]: true }));
        setAssignmentErrors((prev) => ({ ...prev, [taskId]: '' }));

        try {
            const response = await api.post(`/projects/${projectId}/production/tasks/${taskId}/assignments`, {
                userId: currentUserId,
                boardsAssigned,
                deadline
            });
            setFeedback({
                type: 'success',
                message: response.data?.message || 'Self assignment created successfully.'
            });
            setNewAssignmentDrafts((prev) => ({
                ...prev,
                [taskId]: { userId: '', boardsAssigned: '', deadline: '' }
            }));
            await refreshProductionData();
            setExpandedTasks((prev) => ({ ...prev, [taskId]: true }));
        } catch (err) {
            setAssignmentErrors((prev) => ({
                ...prev,
                [taskId]: err.response?.data?.message || 'Failed to create self assignment.'
            }));
        } finally {
            setAssignmentSaving((prev) => ({ ...prev, [taskId]: false }));
        }
    };

    const reviewAssignment = async (assignmentId, approved, rejectionReason = '') => {
        setAssignmentSaving((prev) => ({ ...prev, [assignmentId]: true }));
        setAssignmentErrors((prev) => ({ ...prev, [assignmentId]: '' }));
        try {
            const response = await api.put(`/production/assignments/${assignmentId}/review`, {
                approved,
                rejectionReason
            });
            setFeedback({
                type: 'success',
                message: response.data?.message || 'Production review completed.'
            });
            await refreshProductionData();
        } catch (err) {
            setAssignmentErrors((prev) => ({
                ...prev,
                [assignmentId]: err.response?.data?.message || 'Failed to review production submission.'
            }));
        } finally {
            setAssignmentSaving((prev) => ({ ...prev, [assignmentId]: false }));
        }
    };

    const submitProgress = async (assignmentId, boardsAssigned) => {
        const raw = progressDrafts[assignmentId];
        const boardsCompletedDraft = Number(raw);

        if (raw === undefined || raw === '') {
            setAssignmentErrors((prev) => ({ ...prev, [assignmentId]: 'Enter number of boards completed.' }));
            return;
        }
        if (!Number.isInteger(boardsCompletedDraft) || boardsCompletedDraft < 0) {
            setAssignmentErrors((prev) => ({ ...prev, [assignmentId]: 'Boards completed must be a whole number ≥ 0.' }));
            return;
        }
        if (boardsCompletedDraft > boardsAssigned) {
            setAssignmentErrors((prev) => ({ ...prev, [assignmentId]: `Cannot exceed assigned boards (${boardsAssigned}).` }));
            return;
        }

        setAssignmentSaving((prev) => ({ ...prev, [assignmentId]: true }));
        setAssignmentErrors((prev) => ({ ...prev, [assignmentId]: '' }));

        try {
            // Submit progress draft
            await api.put(`/production/assignments/${assignmentId}/progress`, {
                boardsCompletedDraft
            });

            // Managers skip the approval queue — auto-approve immediately
            if (canEditProduction) {
                await api.put(`/production/assignments/${assignmentId}/review`, {
                    approved: true,
                    rejectionReason: ''
                });
                setFeedback({
                    type: 'success',
                    message: `Progress updated: ${boardsCompletedDraft} boards completed.`
                });
            } else {
                setFeedback({
                    type: 'success',
                    message: 'Progress submitted for manager approval.'
                });
            }

            setProgressDrafts((prev) => ({ ...prev, [assignmentId]: undefined }));
            await refreshProductionData();
        } catch (err) {
            setAssignmentErrors((prev) => ({
                ...prev,
                [assignmentId]: err.response?.data?.message || 'Failed to submit progress.'
            }));
        } finally {
            setAssignmentSaving((prev) => ({ ...prev, [assignmentId]: false }));
        }
    };

    useEffect(() => {
        if (isFullProductProject) return;
        if (activeTab !== 'dispatches' || !projectId) return;
        const loadDispatches = async () => {
            setDispatchLoading(true);
            try {
                const res = await api.get(`/projects/${projectId}/production/dispatches`);
                setDispatches(res.data || []);
            } catch (err) {
                console.error('Failed to load dispatches:', err);
            } finally {
                setDispatchLoading(false);
            }
        };
        loadDispatches();
    }, [activeTab, isFullProductProject, projectId]);

    const showInitializingState = sortedTasks.length === 0;

    // ── Load dispatches when Dispatches tab is activated ──
    useEffect(() => {
        if (isFullProductProject) return;
        if (activeTab !== 'dispatches' || !projectId) return;
        const loadDispatches = async () => {
            setDispatchLoading(true);
            try {
                const res = await api.get(`/projects/${projectId}/production/dispatches`);
                setDispatches(res.data || []);
            } catch (err) {
                console.error('Failed to load dispatches:', err);
            } finally {
                setDispatchLoading(false);
            }
        };
        loadDispatches();
    }, [activeTab, isFullProductProject, projectId]);

    const handleCreateFullProductStage = async (event) => {
        event.preventDefault();

        const trimmedTitle = fullProductDraft.title.trim();
        if (!trimmedTitle) {
            setFeedback({ type: 'error', message: 'Stage title is required.' });
            return;
        }
        if (!fullProductDraft.deadline) {
            setFeedback({ type: 'error', message: 'Stage deadline is required.' });
            return;
        }

        setFullProductSaving(true);
        setFeedback({ type: '', message: '' });
        try {
            await api.post('/tasks', {
                title: trimmedTitle,
                description: fullProductDraft.description.trim(),
                projectId,
                deadline: fullProductDraft.deadline
            });
            setFullProductDraft({ title: '', description: '', deadline: '' });
            setFeedback({ type: 'success', message: 'Board stage created successfully.' });
            if (onRefresh) await onRefresh();
        } catch (err) {
            setFeedback({
                type: 'error',
                message: err.response?.data?.message || 'Failed to create board stage.'
            });
        } finally {
            setFullProductSaving(false);
        }
    };

    // ── Create dispatch ──
    const getFullProductStageBadge = (status) => {
        switch (status) {
            case 'COMPLETED':
                return 'border-[#007e46] bg-[#007e46]/15 text-[#c2ffd1]';
            case 'IN_PROGRESS':
                return 'border-[#2e5bff] bg-[#2e5bff]/15 text-[#dbe4ff]';
            case 'WAITING_APPROVAL':
                return 'border-[#f59e0b] bg-[#f59e0b]/15 text-[#fde68a]';
            case 'ON_HOLD':
                return 'border-[#93000a] bg-[#93000a]/20 text-[#ffdad6]';
            default:
                return 'border-[#343b4f] bg-[#11192d] text-[#8e90a2]';
        }
    };

    const handleCreateDispatch = async (e) => {
        e.preventDefault();
        setDispatchError('');
        const from = Number(dispatchForm.boardFrom);
        const to = Number(dispatchForm.boardTo);
        if (!dispatchForm.customerName.trim()) { setDispatchError('Customer name is required.'); return; }
        if (!from || !to || from < 1 || to < from) { setDispatchError('Board From must be \u2265 1 and Board To must be \u2265 Board From.'); return; }
        setDispatchSaving(true);
        try {
            const res = await api.post(`/projects/${projectId}/production/dispatches`, {
                ...dispatchForm,
                boardFrom: from,
                boardTo: to,
                ratePerBoard: Number(dispatchForm.ratePerBoard) || 0,
                igstPercent: Number(dispatchForm.igstPercent) || 18,
            });
            const newDC = res.data;
            setDispatches(prev => [newDC, ...prev]);
            setShowCreateDispatch(false);
            setDispatchForm(emptyDispatchForm);
            generateDCPdf(newDC);
        } catch (err) {
            setDispatchError(err.response?.data?.message || 'Failed to create dispatch.');
        } finally {
            setDispatchSaving(false);
        }
    };

    // ── PDF Generator ── (matches reference design)
    const generateDCPdf = (dc) => {
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        const W = 210;
        const mL = 14;
        const mR = 196;
        let y = 14;

        // ─── Helper: number to words ───
        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
            'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
            'Seventeen', 'Eighteen', 'Nineteen'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        const toWords = (n) => {
            n = Math.round(n);
            if (n === 0) return 'Zero';
            if (n < 20) return ones[n];
            if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
            if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + toWords(n % 100) : '');
            if (n < 100000) return toWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + toWords(n % 1000) : '');
            if (n < 10000000) return toWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + toWords(n % 100000) : '');
            return toWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + toWords(n % 10000000) : '');
        };
        const amountInWords = (amount) => {
            const rupees = Math.floor(amount);
            const paise = Math.round((amount - rupees) * 100);
            let words = 'Indian Rupee ' + toWords(rupees);
            if (paise > 0) words += ' and ' + toWords(paise) + ' Paise';
            return words + ' Only';
        };

        // ─── LOGO (actual Enarxi logo image) ───
        // Logo dimensions: keep aspect ratio, fit within ~55mm wide x 18mm tall
        doc.addImage(ENARXI_LOGO_B64, 'PNG', mL, y, 55, 18);
        y += 21;

        // Company details
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(30, 41, 59);
        doc.text('ENARXI INNOVATIONS PVT LTD', mL, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        const companyAddr = 'No. 12, Industrial Area, Patna, Bihar - 800001';
        doc.text(companyAddr, mL, y); y += 4.5;
        doc.text('Chennai Tamil Nadu 600034', mL, y); y += 4.5;
        doc.text('India', mL, y); y += 4.5;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text('GSTIN 10AAGCE7875R1ZJ', mL, y);

        // ─── DELIVERY CHALLAN title (right side) ───
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.setTextColor(30, 41, 59);
        doc.text('Delivery Challan', mR, 20, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text('Delivery Challan# ' + (dc.dcNumber || ''), mR, 28, { align: 'right' });

        y += 10;

        // ─── Divider ───
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.4);
        doc.line(mL, y, mR, y);
        y += 7;

        // ─── DELIVER TO (left) + CHALLAN DETAILS (right) ───
        const leftX = mL;
        const rightX = 115;

        // Deliver To
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(0, 153, 153);
        doc.text('Deliver To', leftX, y);
        y += 5;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(30, 41, 59);
        doc.text(dc.customerName || '', leftX, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        const addrLines = doc.splitTextToSize(dc.customerAddress || '', 85);
        addrLines.slice(0, 4).forEach(line => { doc.text(line, leftX, y); y += 4.5; });
        if (dc.customerGSTIN) {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 41, 59);
            doc.text('GST- ' + dc.customerGSTIN, leftX, y);
            y += 4.5;
        }
        if (dc.placeOfSupply) {
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(71, 85, 105);
            doc.text('Place Of Supply: ' + dc.placeOfSupply, leftX, y);
            y += 4.5;
        }

        // Challan Details (right column, starts at same y as deliver to section)
        const detailsStartY = y - (addrLines.slice(0, 4).length * 4.5) - (dc.customerGSTIN ? 4.5 : 0) - (dc.placeOfSupply ? 4.5 : 0) - 5 - 5;
        let ry = detailsStartY;
        const challanDetails = [
            ['Challan Date :', dc.createdAt ? new Date(dc.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''],
            ['Challan Type :', dc.challanType || 'Job Work'],
            ['Place of Supply :', dc.placeOfSupply || ''],
            ['Project Ref :', dc.projectCode || ''],
        ];
        doc.setFontSize(8);
        challanDetails.forEach(([label, val]) => {
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 116, 139);
            doc.text(label, rightX, ry);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(30, 41, 59);
            doc.text(val, rightX + 38, ry);
            ry += 6;
        });

        y += 6;

        // ─── Divider ───
        doc.setDrawColor(203, 213, 225);
        doc.line(mL, y, mR, y);
        y += 6;

        // ─── TABLE HEADER ───
        doc.setFillColor(30, 41, 59);
        doc.rect(mL, y, 182, 8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        const cols = [
            { x: mL + 3, label: '#' },
            { x: mL + 13, label: 'Item & Description' },
            { x: mL + 105, label: 'HSN/SAC' },
            { x: mL + 128, label: 'Qty' },
            { x: mL + 143, label: 'Rate' },
            { x: mR - 2, label: 'Amount', align: 'right' },
        ];
        cols.forEach(col => doc.text(col.label, col.x, y + 5.5, { align: col.align }));
        y += 8;

        // ─── TABLE ROW ───
        const bCount = dc.boardCount || (dc.boardTo - dc.boardFrom + 1);
        const ratePerBoard = dc.ratePerBoard || 0;
        const rowAmount = ratePerBoard * bCount;

        doc.setFillColor(250, 252, 255);
        doc.rect(mL, y, 182, 14, 'F');
        doc.setDrawColor(220, 226, 240);
        doc.rect(mL, y, 182, 14);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(30, 41, 59);
        doc.text('1', mL + 3, y + 6);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text(dc.productDescription || 'PCB Assembly', mL + 13, y + 6);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text('Batch Ref: ' + (dc.projectCode || '') + '  |  Boards #' + dc.boardFrom + '–#' + dc.boardTo, mL + 13, y + 11);
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(8);
        doc.text(dc.hsnCode || '—', mL + 105, y + 8);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(String(bCount) + '.00', mL + 128, y + 8);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(ratePerBoard > 0 ? ratePerBoard.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—', mL + 143, y + 8);
        doc.text(rowAmount > 0 ? rowAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—', mR - 2, y + 8, { align: 'right' });
        y += 14;

        // ─── TOTALS ───
        if (ratePerBoard > 0) {
            const subtotal = rowAmount;
            const igstAmt = (subtotal * (dc.igstPercent || 18)) / 100;
            const total = subtotal + igstAmt;

            y += 2;
            const totRows = [
                { label: 'Sub Total', val: subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 }), bold: false },
                { label: `IGST${dc.igstPercent || 18} (${dc.igstPercent || 18}%)`, val: igstAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 }), bold: false },
                { label: 'Total', val: '\u20B9' + total.toLocaleString('en-IN', { minimumFractionDigits: 2 }), bold: true },
            ];
            totRows.forEach(({ label, val, bold }) => {
                if (bold) {
                    doc.setFillColor(245, 247, 255);
                    doc.rect(mL + 95, y, 101, 8, 'F');
                    doc.setDrawColor(200, 210, 230);
                    doc.rect(mL + 95, y, 101, 8);
                }
                doc.setFont('helvetica', bold ? 'bold' : 'normal');
                doc.setFontSize(bold ? 9 : 8);
                doc.setTextColor(bold ? 30 : 71, bold ? 41 : 85, bold ? 59 : 105);
                doc.text(label, mL + 130, y + 5.5);
                doc.setTextColor(30, 41, 59);
                doc.text(val, mR - 2, y + 5.5, { align: 'right' });
                y += bold ? 8 : 7;
            });

            // ─── Total In Words ───
            y += 4;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(100, 116, 139);
            doc.text('Total In Words:', mL + 95, y);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(30, 41, 59);
            const wordsText = doc.splitTextToSize(amountInWords(total), 85);
            wordsText.forEach((line, i) => doc.text(line, mL + 125, y + i * 4.5));
            y += wordsText.length * 4.5 + 6;
        } else {
            // No price — just board count summary
            y += 6;
            doc.setFillColor(254, 252, 232);
            doc.roundedRect(mL, y, 182, 12, 2, 2, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(146, 64, 14);
            doc.text('Total Qty: ' + bCount + ' Nos  |  Unit Numbers: #' + dc.boardFrom + ' to #' + dc.boardTo, mL + 3, y + 5);
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(6.5);
            doc.setTextColor(120, 53, 15);
            doc.text('This delivery challan is for traceability. Boards are covered under warranty as per agreement terms.', mL + 3, y + 10);
            y += 16;
        }

        if (dc.notes) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(71, 85, 105);
            doc.text('Notes: ' + dc.notes, mL, y);
            y += 7;
        }

        // ─── AUTHORIZED SIGNATURE (bottom left) ───
        const sigY = Math.max(y + 10, 240);
        // Signature line
        doc.setDrawColor(100, 116, 139);
        doc.setLineWidth(0.5);
        doc.line(mL, sigY + 14, mL + 52, sigY + 14);

        // Draw a simple stamp circle to mimic seal
        doc.setDrawColor(0, 100, 140);
        doc.setLineWidth(0.5);
        doc.circle(mL + 20, sigY + 6, 8, 'S');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(4.5);
        doc.setTextColor(0, 80, 120);
        doc.text('ENARXI INNOVATIONS', mL + 9.5, sigY + 4.5);
        doc.text('PRIVATE LIMITED', mL + 12, sigY + 7);
        doc.text('INDIA', mL + 17.5, sigY + 9.5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(30, 41, 59);
        doc.text('Authorized Signature', mL, sigY + 19);

        // ─── FOOTER ───
        doc.setFillColor(235, 240, 255);
        doc.rect(0, 285, W, 12, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139);
        doc.text(
            (dc.dcNumber || 'DC') + '  |  Generated ' + new Date().toLocaleDateString('en-IN') + '  |  System-generated document — Enarxi Innovations Pvt Ltd',
            W / 2, 292, { align: 'center' }
        );

        doc.save((dc.dcNumber || 'DC') + '_' + (dc.customerName || 'Customer').replace(/\s+/g, '_') + '.pdf');
    };

    if (isFullProductProject) {
        return (
            <div className="space-y-6 text-[#dae2fd]">
                {feedback.message && (
                    <div className={`flex items-center justify-between rounded-xl border px-4 py-3 text-xs ${
                        feedback.type === 'success'
                            ? 'border-[#007e46] bg-[#007e46]/15 text-[#c2ffd1]'
                            : 'border-[#93000a] bg-[#93000a]/20 text-[#ffdad6]'
                    }`}>
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">
                                {feedback.type === 'success' ? 'check_circle' : 'error'}
                            </span>
                            <span>{feedback.message}</span>
                        </div>
                        <button type="button" onClick={() => setFeedback({ type: '', message: '' })} className="text-current/70 hover:text-current">
                            <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                    </div>
                )}
                {assignmentErrors.global && (
                    <div className="rounded-xl border border-[#93000a] bg-[#93000a]/20 px-4 py-3 text-xs text-[#ffdad6]">
                        {assignmentErrors.global}
                    </div>
                )}
                {!hasProjectCapacity && (
                    <div className="rounded-xl border border-[#8a5a00] bg-[#8a5a00]/15 px-4 py-3 text-xs text-[#ffe2b7]">
                        Project quantity is not set for this board. A super admin must save the project with a valid total batch size before manager assignments can start.
                    </div>
                )}

                <div className="overflow-hidden rounded-[20px] border border-[#434656] bg-[#0b1326] shadow-[0_24px_80px_rgba(6,14,32,0.45)]">
                    <div className="border-b border-[#222a3d] bg-[#171f33] px-6 py-4">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div className="flex items-start gap-4">
                                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2e5bff]/20 text-[#b8c3ff]">
                                    <span className="material-symbols-outlined">manufacturing</span>
                                </div>
                                <div>
                                    <div className="flex flex-wrap items-center gap-3">
                                        <h2 className="font-['Hanken_Grotesk'] text-[28px] font-bold tracking-[-0.02em] text-[#efefff]">
                                            {project?.name}
                                        </h2>
                                        <span className="rounded-full bg-[#2e5bff]/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#dbe4ff]">
                                            Full Product Board
                                        </span>
                                    </div>
                                    <div className="mt-3 flex flex-wrap items-center gap-4 text-[12px] text-[#c4c5d9]">
                                        <span className="flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                                            {formatDate(project?.startDate)}
                                        </span>
                                        <span className="flex items-center gap-1.5 text-[#b8c3ff]">
                                            <span className="material-symbols-outlined text-[16px]">timer</span>
                                            {getDaysLeftLabel(project?.deadline || project?.endDate)}
                                        </span>
                                        <span className="rounded-full bg-[#11192d] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#8e90a2]">
                                            {fullProductStages.length} Stages
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3 xl:min-w-[420px]">
                                <div className="rounded-2xl border border-[#2a3144] bg-[#0a1020] px-4 py-3">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8e90a2]">Target</p>
                                    <p className="mt-2 text-2xl font-bold text-[#efefff]">{hasProjectCapacity ? totalBatch : 'Not set'}</p>
                                </div>
                                <div className="rounded-2xl border border-[#2a3144] bg-[#0a1020] px-4 py-3">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8e90a2]">Completion</p>
                                    <p className="mt-2 text-2xl font-bold text-[#efefff]">{fullProductProgress}%</p>
                                </div>
                                <div className="rounded-2xl border border-[#2a3144] bg-[#0a1020] px-4 py-3">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8e90a2]">Total Units Done</p>
                                    <p className="mt-2 text-2xl font-bold text-[#dbe4ff]">{fullProductBoardsPassed}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="border-b border-[#222a3d] px-6 py-6">
                        <div className="overflow-x-auto pb-2">
                            <div className="flex min-w-max items-center gap-4">
                                {orderedFullStages.length > 0 ? orderedFullStages.map((task, index) => (
                                    <Fragment key={getTaskId(task)}>
                                        <div className="flex min-w-[164px] flex-col items-center gap-2 text-center">
                                            <div className={`flex h-14 w-14 items-center justify-center rounded-full border text-sm font-bold ${
                                                task.status === 'COMPLETED'
                                                    ? 'border-[#007e46] bg-[#007e46]/20 text-[#c2ffd1]'
                                                    : task.status === 'IN_PROGRESS' || task.status === 'WAITING_APPROVAL'
                                                        ? 'border-[#2e5bff] bg-[#2e5bff]/20 text-[#dbe4ff]'
                                                        : 'border-[#4a5269] bg-[#11192d] text-[#8e90a2]'
                                            }`}>
                                                {index + 1}
                                            </div>
                                            <div>
                                                <p className="max-w-[164px] truncate text-sm font-semibold text-[#efefff]">{task.title}</p>
                                                <p className="mt-1 text-[11px] text-[#8e90a2]">{task.status.replaceAll('_', ' ')}</p>
                                            </div>
                                        </div>
                                        {index < fullProductStages.length - 1 && (
                                            <div className="h-px w-10 bg-[#343b4f]" />
                                        )}
                                    </Fragment>
                                )) : (
                                    <div className="rounded-2xl border border-dashed border-[#343b4f] bg-[#0a1020] px-5 py-4 text-sm text-[#8e90a2]">
                                        No stages created yet. Add the first manager stage to start this board.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-8 p-6 pb-28">
                        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
                            <div className="min-w-0 space-y-4 lg:w-[calc(100%-360px)] lg:shrink">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[#b8c3ff]">format_list_bulleted</span>
                                    <h3 className="font-['Hanken_Grotesk'] text-[24px] font-semibold text-[#efefff]">Task Management</h3>
                                </div>

                                {canManageFullProductBoard && (
                                    <form
                                        onSubmit={handleCreateFullProductStage}
                                        className="grid gap-3 xl:grid-cols-[minmax(220px,1.15fr)_minmax(280px,1.8fr)_180px_160px]"
                                    >
                                        <input
                                            type="text"
                                            value={fullProductDraft.title}
                                            onChange={(event) => setFullProductDraft((prev) => ({ ...prev, title: event.target.value }))}
                                            placeholder="Task Title..."
                                            className="w-full rounded-xl border-2 border-[#2563eb]/55 bg-[#0b1326] px-4 py-3 text-sm text-[#efefff] placeholder:text-[#8ea4c9] transition-all focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#2563eb]/10"
                                        />
                                        <input
                                            type="text"
                                            value={fullProductDraft.description}
                                            onChange={(event) => setFullProductDraft((prev) => ({ ...prev, description: event.target.value }))}
                                            placeholder="Description (optional)..."
                                            className="w-full rounded-xl border-2 border-[#2563eb]/55 bg-[#0b1326] px-4 py-3 text-sm text-[#efefff] placeholder:text-[#8ea4c9] transition-all focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#2563eb]/10"
                                        />
                                        <div className="relative">
                                            <input
                                                type="date"
                                                value={fullProductDraft.deadline}
                                                min={new Date().toISOString().slice(0, 10)}
                                                max={project?.deadline ? new Date(project.deadline).toISOString().slice(0, 10) : undefined}
                                                onChange={(event) => setFullProductDraft((prev) => ({ ...prev, deadline: event.target.value }))}
                                                className="date-input-dark w-full rounded-xl border-2 border-[#2563eb]/55 bg-[#0b1326] px-4 py-3 pr-12 text-sm text-[#efefff] transition-all focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#2563eb]/10"
                                                aria-label="Stage deadline"
                                            />
                                            <span className="material-symbols-outlined pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#7f8aa4]">
                                                calendar_today
                                            </span>
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={!fullProductDraft.title.trim() || !fullProductDraft.deadline || fullProductSaving || !hasProjectCapacity}
                                            className="flex items-center justify-center gap-2 rounded-xl bg-[#4b5871] px-6 py-3 text-sm font-bold text-white transition-all hover:bg-[#5b6882] disabled:cursor-not-allowed disabled:bg-[#313b50] disabled:text-[#7f8aa4]"
                                        >
                                            <span className="material-symbols-outlined text-lg">add</span>
                                            <span>{fullProductSaving ? 'Creating...' : 'Add Task'}</span>
                                        </button>
                                    </form>
                                )}

                                <div className="overflow-hidden rounded-xl border border-[#434656] bg-[#131b2e]">
                                    {fullProductStages.length === 0 ? (
                                        <div className="flex min-h-[320px] flex-col items-center justify-center px-6 py-12 text-center">
                                            <span className="material-symbols-outlined text-5xl text-[#4a5269]">view_kanban</span>
                                            <p className="mt-4 text-lg font-semibold text-[#efefff]">This board is empty.</p>
                                            <p className="mt-2 text-sm text-[#8e90a2]">Create the first stage and it will appear here in production order.</p>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="hidden lg:block">
                                                <table className="w-full border-collapse text-left">
                                                    <thead>
                                                        <tr className="border-b border-[#434656] bg-[#222a3d]">
                                                            <th className="w-8 pl-3 pr-0">
                                                                {isSaving && <span className="material-symbols-outlined text-[14px] text-[#b8c3ff] animate-spin">progress_activity</span>}
                                                            </th>
                                                            <th className="px-6 py-4 text-[12px] font-medium uppercase tracking-wider text-[#c4c5d9]">Production Phase</th>
                                                            <th className="px-6 py-4 text-[12px] font-medium uppercase tracking-wider text-[#c4c5d9]">Unit Tracking</th>
                                                            <th className="px-6 py-4 text-[12px] font-medium uppercase tracking-wider text-[#c4c5d9]">Status</th>
                                                            <th className="px-6 py-4 text-[12px] font-medium uppercase tracking-wider text-[#c4c5d9]">Lead</th>
                                                            <th className="px-6 py-4 text-right text-[12px] font-medium uppercase tracking-wider text-[#c4c5d9]">Actions</th>
                                                        </tr>
                                                    </thead>
                                                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFullStageDragEnd}>
                                                    <SortableContext items={orderedFullStages.map(t => t._id || t.id)} strategy={verticalListSortingStrategy}>
                                                    <tbody className="divide-y divide-[#434656]/70">
                                                        {orderedFullStages.map((task, index) => {
                                                            const taskId = String(getTaskId(task));
                                                            const state = getTaskState(task);
                                                            const availableCapacity = getAvailableCapacity(task, index, fullProductStages, totalBatch);
                                                            const taskAssignments = assignmentsByTaskId[taskId] || [];
                                                            const singleAssigneeName = taskAssignments.length === 1 ? taskAssignments[0].userName : null;
                                                            const fallbackAssignee = taskAssignments.length === 0
                                                                ? users?.find((user) => String(getUserId(user)) === String(task.assigneeId?._id || task.assigneeId))
                                                                : null;
                                                            const assignedBoards = taskAssignments.reduce((sum, item) => sum + Number(item.boardsAssigned || 0), 0);
                                                            const unassignedBoards = Math.max(0, availableCapacity - assignedBoards);
                                                            const progressWidth = availableCapacity > 0 ? Math.min(100, (Number(task.unitsCompleted || 0) / availableCapacity) * 100) : 0;

                                                            return (
                                                                <Fragment key={taskId}>
                                                                    <SortableProdRow task={task} className={`transition-colors ${state === 'active' ? 'bg-[#2e5bff]/8' : 'hover:bg-[#2d3449]/25'} ${state === 'pending' ? 'opacity-70' : ''}`}>
                                                                        <td className={`px-6 py-5 ${state === 'active' ? 'border-l-4 border-[#2e5bff]' : ''}`}>
                                                                            <p className="font-bold text-[#dae2fd]">{task.title}</p>
                                                                            <p className="mt-1 text-[11px] text-[#c4c5d9]">
                                                                                {taskAssignments.length > 0
                                                                                    ? `${taskAssignments.length} worker allocation${taskAssignments.length > 1 ? 's' : ''} configured`
                                                                                    : state === 'completed'
                                                                                        ? `Stage complete for ${Number(task.unitsCompleted || 0)} units`
                                                                                        : state === 'active'
                                                                                            ? `${Number(task.unitsCurrentlyHere || 0)} units remaining in this stage`
                                                                                            : 'Ready for allocation and manager planning'}
                                                                            </p>
                                                                            {rowErrors[taskId] && (
                                                                                <div className="mt-3 rounded-lg border border-[#93000a] bg-[#93000a]/20 px-3 py-2 text-[11px] text-[#ffdad6]">
                                                                                    {rowErrors[taskId]}
                                                                                </div>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-6 py-5">
                                                                            <div className="flex flex-col gap-1">
                                                                                <span className={`font-mono text-[18px] font-semibold ${state === 'completed' ? 'text-[#00e383]' : state === 'active' ? 'text-[#00e3fd]' : 'text-[#c4c5d9]'}`}>
                                                                                    {Number(task.unitsCompleted || 0)} / {availableCapacity}
                                                                                </span>
                                                                                <div className="h-1 w-24 overflow-hidden rounded-full bg-[#2d3449]">
                                                                                    <div
                                                                                        className={`h-full ${state === 'completed' ? 'bg-[#00e383]' : state === 'active' ? 'bg-[#00e3fd]' : 'bg-[#8e90a2]'}`}
                                                                                        style={{ width: `${progressWidth}%` }}
                                                                                    />
                                                                                </div>
                                                                                <span className="text-[10px] text-[#c4c5d9]">{Number(task.unitsCurrentlyHere || 0)} units remaining here</span>
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-6 py-5">
                                                                            <span className={`inline-flex rounded-lg px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${
                                                                                task.status === 'COMPLETED'
                                                                                    ? 'bg-[#007e46]/25 text-[#5bffa1]'
                                                                                    : task.status === 'IN_PROGRESS'
                                                                                        ? 'bg-[#00e3fd]/18 text-[#9cf0ff] shadow-[0_0_10px_rgba(0,227,253,0.18)]'
                                                                                        : task.status === 'WAITING_APPROVAL'
                                                                                            ? 'bg-[#2e5bff]/20 text-[#b8c3ff]'
                                                                                            : 'bg-[#2d3449] text-[#c4c5d9]'
                                                                            }`}>
                                                                                {task.status === 'NOT_STARTED' ? 'Pending' : task.status.replace('_', ' ')}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-6 py-5">
                                                                            {taskAssignments.length > 1 ? (
                                                                                <div>
                                                                                    <p className="text-[12px] font-bold leading-none text-[#dae2fd]">{taskAssignments.length} workers assigned</p>
                                                                                    <p className="mt-1 text-[10px] font-bold uppercase text-[#00e383]">{assignedBoards} units allocated</p>
                                                                                </div>
                                                                            ) : singleAssigneeName ? (
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#b8c3ff] text-[10px] font-bold text-[#002388]">
                                                                                        {singleAssigneeName.slice(0, 1).toUpperCase()}
                                                                                    </div>
                                                                                    <div>
                                                                                        <p className="text-[12px] font-bold leading-none text-[#dae2fd]">{singleAssigneeName}</p>
                                                                                        <p className="mt-1 text-[10px] font-bold uppercase text-[#00e383]">Assigned</p>
                                                                                    </div>
                                                                                </div>
                                                                            ) : fallbackAssignee ? (
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#b8c3ff] text-[10px] font-bold text-[#002388]">
                                                                                        {fallbackAssignee.name?.slice(0, 1) || 'U'}
                                                                                    </div>
                                                                                    <div>
                                                                                        <p className="text-[12px] font-bold leading-none text-[#dae2fd]">{fallbackAssignee.name}</p>
                                                                                        <p className="mt-1 text-[10px] font-bold uppercase text-[#00e383]">Assigned</p>
                                                                                    </div>
                                                                                </div>
                                                                            ) : (
                                                                                <div className="flex items-center gap-2 text-[#c4c5d9]">
                                                                                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2d3449] text-[14px]">
                                                                                        <span className="material-symbols-outlined text-[16px]">person</span>
                                                                                    </div>
                                                                                    <span className="text-[12px]">Unassigned</span>
                                                                                </div>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-6 py-5 text-right">
                                                                            <div className="flex justify-end gap-2">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => toggleExpandedTask(taskId)}
                                                                                    className="rounded-lg border border-[#2e5bff]/35 bg-[#2e5bff]/12 px-3 py-2 text-[11px] font-semibold text-[#b8c3ff] transition-colors hover:bg-[#2e5bff]/20 hover:text-[#dde1ff]"
                                                                                >
                                                                                    {expandedTasks[taskId] ? 'Hide split' : 'Manage split'}
                                                                                </button>
                                                                                {typeof onTaskSelect === 'function' && (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => onTaskSelect(task)}
                                                                                        className="rounded-lg border border-[#434656] bg-[#11192d] px-3 py-2 text-[11px] font-semibold text-[#c4c5d9] transition-colors hover:bg-[#2d3449] hover:text-white"
                                                                                    >
                                                                                        Details
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                    </SortableProdRow>
                                                                    {expandedTasks[taskId] && (
                                                                        <tr className="bg-[#10192d]">
                                                                            <td colSpan="6" className="px-6 py-5">
                                                                                <div className="rounded-2xl border border-[#3f485d] bg-[#0d1529] p-4">
                                                                                    <div className="mb-4">
                                                                                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#c4c5d9]">Split Allocation</p>
                                                                                        <p className="mt-1 text-[12px] text-[#dae2fd]">
                                                                                            Capacity: {hasProjectCapacity ? availableCapacity : 'Not set'} units. Assigned: {assignedBoards}. Remaining unassigned: {hasProjectCapacity ? unassignedBoards : 'Not set'}.
                                                                                        </p>
                                                                                    </div>
                                                                                    {assignmentErrors[taskId] && (
                                                                                        <div className="mb-4 rounded-lg border border-[#93000a] bg-[#93000a]/20 px-3 py-2 text-[11px] text-[#ffdad6]">
                                                                                            {assignmentErrors[taskId]}
                                                                                        </div>
                                                                                    )}
                                                                                    <div className="space-y-3">
                                                                                        {taskAssignments.map((assignment) => {
                                                                                            const assignmentId = String(assignment.id || assignment._id);
                                                                                            const assignmentDraft = assignmentDrafts[assignmentId] || {
                                                                                                boardsAssigned: String(assignment.boardsAssigned ?? 0),
                                                                                                boardsCompletedApproved: String(assignment.boardsCompletedApproved ?? assignment.boardsCompleted ?? 0),
                                                                                                deadline: assignment.deadline ? new Date(assignment.deadline).toISOString().slice(0, 10) : ''
                                                                                            };

                                                                                            return (
                                                                                                <div key={assignmentId} className="grid grid-cols-[minmax(0,1.2fr)_100px_100px_140px_180px] items-center gap-3 rounded-xl border border-[#313a50] bg-[#131b2e] p-3">
                                                                                                    <div>
                                                                                                        <p className="text-[13px] font-bold text-[#dae2fd]">{assignment.userName}</p>
                                                                                                        <p className="text-[10px] uppercase tracking-[0.14em] text-[#00e383]">{assignment.userRole || 'Worker'}</p>
                                                                                                        <p className="mt-1 text-[10px] text-[#c4c5d9]">Draft: {assignment.boardsCompletedDraft ?? 0} | Approved: {assignment.boardsCompletedApproved ?? assignment.boardsCompleted ?? 0}</p>
                                                                                                        <p className="mt-1 text-[10px] text-[#8ea4c9]">Edit assigned units or deadline here, then save.</p>
                                                                                                        <p className="mt-1 text-[10px] text-[#c4c5d9]">{assignment.status === 'WAITING_APPROVAL' ? 'Waiting for manager approval' : assignment.status.replace('_', ' ')}</p>
                                                                                                    </div>
                                                                                                    <input
                                                                                                        type="number"
                                                                                                        min="0"
                                                                                                        step="1"
                                                                                                        value={assignmentDraft.boardsAssigned}
                                                                                                        onChange={(e) => setAssignmentDrafts((prev) => ({ ...prev, [assignmentId]: { ...assignmentDraft, boardsAssigned: e.target.value } }))}
                                                                                                        className="rounded-lg border border-[#434656] bg-[#0b1326] px-3 py-2 text-sm text-[#dae2fd] placeholder:text-[#8ea4c9] outline-none focus:border-[#2e5bff]"
                                                                                                    />
                                                                                                    <input
                                                                                                        type="number"
                                                                                                        readOnly
                                                                                                        value={assignment.boardsCompletedApproved ?? assignment.boardsCompleted ?? 0}
                                                                                                        className="rounded-lg border border-[#434656] bg-[#0b1326] px-3 py-2 text-sm text-[#dae2fd]"
                                                                                                    />
                                                                                                    <div className="relative">
                                                                                                        <input
                                                                                                            type="date"
                                                                                                            value={assignmentDraft.deadline}
                                                                                                            onChange={(e) => setAssignmentDrafts((prev) => ({ ...prev, [assignmentId]: { ...assignmentDraft, deadline: e.target.value } }))}
                                                                                                            className="date-input-dark w-full rounded-lg border border-[#434656] bg-[#0b1326] px-3 py-2 pr-10 text-sm text-[#dae2fd] outline-none focus:border-[#2e5bff]"
                                                                                                        />
                                                                                                        <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-[#8ea4c9]">
                                                                                                            calendar_today
                                                                                                        </span>
                                                                                                    </div>
                                                                                                    <div className="flex flex-wrap justify-end gap-2">
                                                                                                        {String(assignment.userId?._id || assignment.userId) === String(currentUserId) && assignment.status !== 'COMPLETED' && (
                                                                                                            <div className="flex items-center gap-2">
                                                                                                                <input
                                                                                                                    type="number"
                                                                                                                    min="0"
                                                                                                                    step="1"
                                                                                                                    placeholder="Done"
                                                                                                                    value={progressDrafts[assignmentId] ?? ''}
                                                                                                                    onChange={(e) => setProgressDrafts((prev) => ({ ...prev, [assignmentId]: e.target.value }))}
                                                                                                                    className="w-20 rounded-lg border border-[#00e383]/40 bg-[#0b1326] px-2 py-2 text-sm text-[#dae2fd] placeholder:text-[#8ea4c9] outline-none focus:border-[#00e383]"
                                                                                                                />
                                                                                                                <button
                                                                                                                    type="button"
                                                                                                                    onClick={() => submitProgress(assignmentId, assignment.boardsAssigned)}
                                                                                                                    disabled={assignmentSaving[assignmentId]}
                                                                                                                    className="rounded bg-[#00e383] px-3 py-2 text-[11px] font-bold text-[#00210e] disabled:opacity-60"
                                                                                                                >
                                                                                                                    {assignmentSaving[assignmentId] ? 'Saving...' : 'Submit'}
                                                                                                                </button>
                                                                                                            </div>
                                                                                                        )}
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            onClick={() => saveAssignment(taskId, assignmentId)}
                                                                                                            disabled={assignmentSaving[assignmentId]}
                                                                                                            className="rounded bg-[#2e5bff] px-3 py-2 text-[11px] font-bold text-[#efefff] disabled:opacity-60"
                                                                                                        >
                                                                                                            {assignmentSaving[assignmentId] ? 'Saving...' : 'Save edit'}
                                                                                                        </button>
                                                                                                        {assignment.status === 'WAITING_APPROVAL' && (
                                                                                                            <>
                                                                                                                <button
                                                                                                                    type="button"
                                                                                                                    onClick={() => reviewAssignment(assignmentId, true)}
                                                                                                                    disabled={assignmentSaving[assignmentId]}
                                                                                                                    className="rounded bg-[#00e383] px-3 py-2 text-[11px] font-bold text-[#00210e] disabled:opacity-60"
                                                                                                                >
                                                                                                                    Approve
                                                                                                                </button>
                                                                                                                <button
                                                                                                                    type="button"
                                                                                                                    onClick={() => reviewAssignment(assignmentId, false, 'Rejected by manager')}
                                                                                                                    disabled={assignmentSaving[assignmentId]}
                                                                                                                    className="rounded border border-[#93000a] bg-[#93000a]/15 px-3 py-2 text-[11px] font-bold text-[#ffdad6] disabled:opacity-60"
                                                                                                                >
                                                                                                                    Reject
                                                                                                                </button>
                                                                                                            </>
                                                                                                        )}
                                                                                                    </div>
                                                                                                </div>
                                                                                            );
                                                                                        })}
                                                                                        <div className="grid grid-cols-[minmax(0,1.2fr)_100px_100px_140px_180px] items-center gap-3 rounded-xl border border-[#3f485d] bg-[#182236] p-3">
                                                                                            <select
                                                                                                value={newAssignmentDrafts[taskId]?.userId || ''}
                                                                                                onChange={(e) => setNewAssignmentDrafts((prev) => ({ ...prev, [taskId]: { ...(prev[taskId] || {}), userId: e.target.value } }))}
                                                                                                className="rounded-lg border border-[#434656] bg-[#0b1326] px-3 py-2 text-sm text-[#dae2fd] outline-none focus:border-[#2e5bff]"
                                                                                            >
                                                                                                <option value="">Select worker</option>
                                                                                                {assignableUsers.map((user) => (
                                                                                                    <option key={getUserId(user)} value={getUserId(user)}>
                                                                                                        {user.name} ({user.role})
                                                                                                    </option>
                                                                                                ))}
                                                                                            </select>
                                                                                            <input
                                                                                                type="number"
                                                                                                min="0"
                                                                                                step="1"
                                                                                                value={newAssignmentDrafts[taskId]?.boardsAssigned || ''}
                                                                                                onChange={(e) => setNewAssignmentDrafts((prev) => ({ ...prev, [taskId]: { ...(prev[taskId] || {}), boardsAssigned: e.target.value } }))}
                                                                                                placeholder="Assigned"
                                                                                                className="rounded-lg border border-[#434656] bg-[#0b1326] px-3 py-2 text-sm text-[#dae2fd] placeholder:text-[#8ea4c9] outline-none focus:border-[#2e5bff]"
                                                                                            />
                                                                                            <input
                                                                                                type="text"
                                                                                                readOnly
                                                                                                value="0"
                                                                                                className="rounded-lg border border-[#434656] bg-[#0b1326] px-3 py-2 text-sm text-[#dae2fd]"
                                                                                            />
                                                                                            <div className="relative">
                                                                                                <input
                                                                                                    type="date"
                                                                                                    value={newAssignmentDrafts[taskId]?.deadline || ''}
                                                                                                    onChange={(e) => setNewAssignmentDrafts((prev) => ({ ...prev, [taskId]: { ...(prev[taskId] || {}), deadline: e.target.value } }))}
                                                                                                    className="date-input-dark w-full rounded-lg border border-[#434656] bg-[#0b1326] px-3 py-2 pr-10 text-sm text-[#dae2fd] outline-none focus:border-[#2e5bff]"
                                                                                                />
                                                                                                <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-[#8ea4c9]">
                                                                                                    calendar_today
                                                                                                </span>
                                                                                            </div>
                                                                                            <div className="flex items-center justify-end gap-2">
                                                                                                {(assignableUserIds.size === 0 || assignableUserIds.has(String(currentUserId))) && (
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        onClick={() => createSelfAssignment(taskId, unassignedBoards)}
                                                                                                        disabled={assignmentSaving[taskId] || !hasProjectCapacity}
                                                                                                        className="rounded border border-[#00e3fd] bg-transparent px-3 py-2 text-[11px] font-bold text-[#00e3fd] transition-colors hover:bg-[#00e3fd]/10 disabled:opacity-60"
                                                                                                    >
                                                                                                        {assignmentSaving[taskId] ? 'Saving...' : 'Self Assign'}
                                                                                                    </button>
                                                                                                )}
                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={() => createAssignment(taskId)}
                                                                                                    disabled={assignmentSaving[taskId] || !hasProjectCapacity}
                                                                                                    className="rounded bg-[#00e3fd] px-3 py-2 text-[11px] font-bold text-[#001f24] disabled:opacity-60"
                                                                                                >
                                                                                                    {assignmentSaving[taskId] ? 'Saving...' : 'Add worker'}
                                                                                                </button>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    )}
                                                                </Fragment>
                                                            );
                                                        })}
                                                    </tbody>
                                                    </SortableContext>
                                                    </DndContext>
                                                </table>
                                            </div>

                                            <div className="space-y-4 p-4 lg:hidden">
                                                {orderedFullStages.map((task, index) => {
                                                    const taskId = String(getTaskId(task));
                                                    const availableCapacity = getAvailableCapacity(task, index, orderedFullStages, totalBatch);
                                                    const assignee = users?.find((user) => String(getUserId(user)) === String(task.assigneeId || task.assigneeId?._id));

                                                    return (
                                                        <div key={taskId} className="rounded-xl border border-[#434656] bg-[#171f33] p-4">
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div>
                                                                    <p className="font-bold text-[#dae2fd]">{task.title}</p>
                                                                    <p className="mt-1 text-[11px] text-[#c4c5d9]">{Number(task.unitsCompleted || 0)} / {availableCapacity}</p>
                                                                </div>
                                                                <span className={`rounded-lg px-3 py-1 text-[10px] font-bold uppercase ${
                                                                    task.status === 'COMPLETED'
                                                                        ? 'bg-[#007e46]/25 text-[#5bffa1]'
                                                                        : task.status === 'IN_PROGRESS'
                                                                            ? 'bg-[#00e3fd]/18 text-[#9cf0ff]'
                                                                            : task.status === 'WAITING_APPROVAL'
                                                                                ? 'bg-[#2e5bff]/20 text-[#b8c3ff]'
                                                                                : 'bg-[#2d3449] text-[#c4c5d9]'
                                                                }`}>
                                                                    {task.status === 'NOT_STARTED' ? 'Pending' : task.status.replace('_', ' ')}
                                                                </span>
                                                            </div>
                                                            <div className="mt-3 text-[12px] text-[#c4c5d9]">
                                                                Lead: <span className="font-semibold text-[#dae2fd]">{assignee?.name || 'Unassigned'}</span>
                                                            </div>
                                                            <div className="mt-3 text-[12px] text-[#c4c5d9]">
                                                                Remaining here: {Number(task.unitsCurrentlyHere || 0)}
                                                            </div>
                                                            <div className="mt-4 flex flex-wrap gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleExpandedTask(taskId)}
                                                                    className="rounded border border-[#2e5bff]/30 bg-[#2e5bff]/15 px-3 py-2 text-[11px] font-semibold text-[#b8c3ff]"
                                                                >
                                                                    {expandedTasks[taskId] ? 'Hide split' : 'Manage split'}
                                                                </button>
                                                                {typeof onTaskSelect === 'function' && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => onTaskSelect(task)}
                                                                        className="rounded border border-[#434656] bg-[#11192d] px-3 py-2 text-[11px] font-semibold text-[#c4c5d9]"
                                                                    >
                                                                        Details
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            <aside className="min-w-0 lg:sticky lg:top-0 lg:w-[360px] lg:shrink-0 xl:w-[380px]">
                                <div className="flex h-full flex-col gap-4 rounded-[18px] border border-[#3f485d] bg-[#10192d] p-4 shadow-[0_18px_50px_rgba(6,14,32,0.34)]">
                                    <div>
                                        <h3 className="font-['Hanken_Grotesk'] text-[18px] font-semibold text-[#efefff]">Project Stats</h3>
                                    </div>

                                    <div className="rounded-2xl border border-[#4b5468] bg-[#182236] px-4 py-4">
                                        <div className="mb-3 flex items-center justify-between gap-3">
                                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#cfd5e6]">Project Status</p>
                                            <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] ${
                                                fullProductProgress >= 100
                                                    ? 'bg-[#007e46] text-[#c2ffd1]'
                                                    : fullProductActiveCount > 0
                                                        ? 'bg-[#2e5bff] text-[#efefff]'
                                                        : 'bg-[#222a3d] text-[#c4c5d9]'
                                            }`}>
                                                {fullProductProgress >= 100 ? 'Completed' : fullProductActiveCount > 0 ? 'Active' : 'Planning'}
                                            </span>
                                        </div>
                                        <div className="flex items-end justify-between gap-3">
                                            <div>
                                                <p className="text-[11px] text-[#9ea8bf]">Overall completion</p>
                                                <p className="mt-1 font-mono text-[26px] font-semibold leading-none text-[#e7ecff]">{fullProductProgress}%</p>
                                            </div>
                                            <div className="min-w-[86px]">
                                                <div className="h-2 w-full overflow-hidden rounded-full bg-[#313a50]">
                                                    <div className="h-full bg-[#11d7ff]" style={{ width: `${fullProductProgress}%` }} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="rounded-2xl border border-[#4b5468] bg-[#2b3448] px-4 py-4">
                                            <p className="mb-2 text-[10px] font-bold uppercase text-[#cfd5e6]">Total Batch</p>
                                            <p className="font-mono text-[28px] font-semibold leading-none text-[#e7ecff]">{hasProjectCapacity ? totalBatch : 'Not set'}</p>
                                        </div>
                                        <div className="rounded-2xl border border-[#4b5468] bg-[#2b3448] px-4 py-4">
                                            <p className="mb-2 text-[10px] font-bold uppercase text-[#cfd5e6]">Total Units Done</p>
                                            <p className="font-mono text-[28px] font-semibold leading-none text-[#00e383]">{fullProductBoardsPassed}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="rounded-2xl border border-[#4b5468] bg-[#2b3448] px-4 py-4">
                                            <p className="mb-2 text-[10px] font-bold uppercase text-[#cfd5e6]">Stages Done</p>
                                            <p className="font-mono text-[28px] font-semibold leading-none text-[#e7ecff]">{fullProductCompletedCount}</p>
                                        </div>
                                        <div className="rounded-2xl border border-[#4b5468] bg-[#2b3448] px-4 py-4">
                                            <p className="mb-2 text-[10px] font-bold uppercase text-[#cfd5e6]">Active Stages</p>
                                            <p className="font-mono text-[28px] font-semibold leading-none text-[#e7ecff]">{fullProductActiveCount}</p>
                                        </div>
                                    </div>
                                </div>
                            </aside>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 text-[#dae2fd]">
            {feedback.message && (
                <div className={`flex items-center justify-between rounded-xl border px-4 py-3 text-xs ${
                    feedback.type === 'success'
                        ? 'border-[#007e46] bg-[#007e46]/15 text-[#c2ffd1]'
                        : 'border-[#93000a] bg-[#93000a]/20 text-[#ffdad6]'
                }`}>
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">
                            {feedback.type === 'success' ? 'check_circle' : 'error'}
                        </span>
                        <span>{feedback.message}</span>
                    </div>
                    <button type="button" onClick={() => setFeedback({ type: '', message: '' })} className="text-current/70 hover:text-current">
                        <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                </div>
            )}

            <div className="overflow-hidden rounded-[20px] border border-[#434656] bg-[#0b1326] shadow-[0_24px_80px_rgba(6,14,32,0.45)]">
                <div className="border-b border-[#222a3d] bg-[#171f33] px-6 py-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2e5bff]/20 text-[#b8c3ff]">
                                <span className="material-symbols-outlined">folder</span>
                            </div>
                            <div>
                                <div className="flex flex-wrap items-center gap-3">
                                    <h2 className="font-['Hanken_Grotesk'] text-[28px] font-bold tracking-[-0.02em] text-[#efefff]">
                                        {project?.name}
                                    </h2>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-4 text-[12px] text-[#c4c5d9]">
                                    <span className="flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                                        {formatDate(project?.startDate)}
                                    </span>
                                    <span className="flex items-center gap-1.5 text-[#b8c3ff]">
                                        <span className="material-symbols-outlined text-[16px]">timer</span>
                                        {getDaysLeftLabel(project?.deadline || project?.endDate)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto lg:justify-end">
                            {/* Tab Switcher */}
                            <div className="flex gap-1 rounded-lg border border-[#434656] bg-[#060d1e] p-1">
                                {['dashboard', 'dispatches'].map(tab => (
                                    <button
                                        key={tab}
                                        type="button"
                                        onClick={() => setActiveTab(tab)}
                                        className={`px-4 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-[0.12em] transition-all ${
                                            activeTab === tab
                                                ? 'bg-[#2e5bff] text-white shadow-[0_0_12px_rgba(46,91,255,0.4)]'
                                                : 'text-[#8e90a2] hover:text-[#dae2fd]'
                                        }`}
                                    >
                                        {tab === 'dashboard' ? 'Dashboard' : 'Dispatches'}
                                    </button>
                                ))}
                            </div>

                            <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
                                projectState === 'COMPLETED'
                                    ? 'bg-[#007e46] text-[#c2ffd1]'
                                    : projectState === 'ACTIVE'
                                        ? 'bg-[#2e5bff] text-[#efefff]'
                                        : 'bg-[#222a3d] text-[#c4c5d9]'
                            }`}>
                                {projectState === 'ACTIVE' ? 'ACTIVE' : projectState}
                            </span>
                            <div className="flex items-center gap-2 rounded border border-[#434656] bg-[#0b1326] px-3 py-1.5 text-[11px]">
                                <span className="font-semibold text-[#00daf3]">Batch: {project?.projectCode || 'N/A'}</span>
                                <span className="h-3 w-px bg-[#434656]" />
                                <span className="text-[#dae2fd]">{totalBatch} Boards</span>
                            </div>
                            {activeTab === 'dispatches' && (
                                <button
                                    type="button"
                                    onClick={() => setShowCreateDispatch(true)}
                                    className="flex items-center gap-2 rounded border border-[#434656] px-4 py-2 text-[11px] font-semibold text-[#dae2fd] transition-colors hover:bg-[#2d3449]"
                                >
                                    <span className="material-symbols-outlined text-[18px]">add</span>
                                    Create Dispatch
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {activeTab === 'dispatches' && (
                <div className="space-y-6">

                    {/* Summary pill */}
                    {dispatches.length > 0 && (
                        <div className="flex flex-wrap gap-4">
                            <div className="flex items-center gap-2 rounded-full border border-[#2e5bff]/30 bg-[#2e5bff]/10 px-4 py-1.5">
                                <span className="material-symbols-outlined text-[16px] text-[#b8c3ff]">receipt_long</span>
                                <span className="text-[12px] font-semibold text-[#b8c3ff]">{dispatches.length} Dispatch{dispatches.length !== 1 ? 'es' : ''}</span>
                            </div>
                            <div className="flex items-center gap-2 rounded-full border border-[#00e383]/30 bg-[#00e383]/10 px-4 py-1.5">
                                <span className="material-symbols-outlined text-[16px] text-[#00e383]">conveyor_belt</span>
                                <span className="text-[12px] font-semibold text-[#00e383]">{dispatches.reduce((s, d) => s + (d.boardCount || 0), 0)} Boards Dispatched</span>
                            </div>
                        </div>
                    )}

                    {/* Dispatch list */}
                    {dispatchLoading ? (
                        <div className="flex items-center justify-center py-16">
                            <span className="material-symbols-outlined animate-spin text-4xl text-[#2e5bff]">progress_activity</span>
                        </div>
                    ) : dispatches.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#434656] bg-[#0d1529] py-20 text-center">
                            <span className="material-symbols-outlined mb-4 text-5xl text-[#434656]">local_shipping</span>
                            <p className="text-[14px] font-semibold text-[#c4c5d9]">No dispatches yet</p>
                            <p className="mt-1 text-[12px] text-[#8e90a2]">Create a dispatch to track board deliveries to customers.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {dispatches.map(dc => {
                                const isDispatched = dc.status === 'DISPATCHED';
                                return (
                                    <div key={dc.id || dc._id} className={`rounded-2xl border ${isDispatched ? 'border-[#007e46]/40 bg-[#0a1e14]' : 'border-[#2e5bff]/30 bg-[#0d1529]'} p-5 transition-all`}>
                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                            {/* Left info */}
                                            <div className="flex items-start gap-4">
                                                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${isDispatched ? 'bg-[#007e46]/20 text-[#00e383]' : 'bg-[#2e5bff]/15 text-[#b8c3ff]'}`}>
                                                    <span className="material-symbols-outlined text-[22px]">package_2</span>
                                                </div>
                                                <div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="font-['Hanken_Grotesk'] text-[16px] font-bold text-[#efefff]">{dc.dcNumber}</span>
                                                        <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] ${isDispatched ? 'bg-[#007e46] text-[#c2ffd1]' : 'bg-[#1c2a42] text-[#00daf3]'}`}>
                                                            {dc.status}
                                                        </span>
                                                    </div>
                                                    <p className="mt-1 text-[13px] font-semibold text-[#dae2fd]">{dc.customerName}</p>
                                                    {dc.customerAddress && <p className="text-[11px] text-[#8e90a2]">{dc.customerAddress}</p>}
                                                    <div className="mt-2 flex flex-wrap items-center gap-3">
                                                        <span className="flex items-center gap-1 rounded-lg border border-[#00daf3]/25 bg-[#00daf3]/10 px-2.5 py-1 text-[11px] font-bold text-[#00daf3]">
                                                            <span className="material-symbols-outlined text-[13px]">pin</span>
                                                            Unit #{dc.boardFrom} &ndash; #{dc.boardTo}
                                                        </span>
                                                        <span className="flex items-center gap-1 rounded-lg border border-[#434656] bg-[#131b2e] px-2.5 py-1 text-[11px] font-bold text-[#c4c5d9]">
                                                            <span className="material-symbols-outlined text-[13px]">dashboard</span>
                                                            {dc.boardCount} boards
                                                        </span>
                                                        <span className="text-[10px] text-[#8e90a2]">{dc.createdAt ? new Date(dc.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            {/* Actions */}
                                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => generateDCPdf(dc)}
                                                    className="flex items-center gap-1.5 rounded-lg border border-[#00daf3]/30 bg-[#00daf3]/10 px-3 py-2 text-[11px] font-bold text-[#00daf3] transition-all hover:bg-[#00daf3]/20"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">download</span>
                                                    Download DC
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Create Dispatch Modal */}
                    {showCreateDispatch && (
                        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ backdropFilter: 'blur(6px)', background: 'rgba(6,14,32,0.82)' }}>
                            <div className="relative w-full max-w-2xl rounded-2xl border border-[#2e5bff]/40 bg-[#0b1326] shadow-[0_32px_80px_rgba(6,14,32,0.7)]">
                                {/* Modal header */}
                                <div className="flex items-center justify-between border-b border-[#222a3d] px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2e5bff]/15 text-[#b8c3ff]">
                                            <span className="material-symbols-outlined">local_shipping</span>
                                        </div>
                                        <div>
                                            <h3 className="font-['Hanken_Grotesk'] text-[18px] font-bold text-[#efefff]">Create Batch Dispatch</h3>
                                            <p className="text-[11px] text-[#8e90a2]">{project?.name} — {project?.projectCode}</p>
                                        </div>
                                    </div>
                                    <button type="button" onClick={() => setShowCreateDispatch(false)} className="text-[#8e90a2] hover:text-white">
                                        <span className="material-symbols-outlined">close</span>
                                    </button>
                                </div>

                                <form onSubmit={handleCreateDispatch} className="max-h-[78vh] overflow-y-auto custom-scrollbar p-6 space-y-5">
                                    {dispatchError && (
                                        <div className="rounded-xl border border-[#93000a] bg-[#93000a]/20 px-4 py-3 text-[12px] text-[#ffdad6]">{dispatchError}</div>
                                    )}

                                    {/* Customer Details */}
                                    <div>
                                        <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-[#8e90a2]">Customer Details</p>
                                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                            <div className="md:col-span-2">
                                                <label className="mb-1 block text-[11px] font-semibold text-[#c4c5d9]">Customer Name <span className="text-red-400">*</span></label>
                                                <input required value={dispatchForm.customerName} onChange={e => setDispatchForm(p => ({ ...p, customerName: e.target.value }))}
                                                    className="w-full rounded-xl border border-[#434656] bg-[#131b2e] px-4 py-2.5 text-[13px] text-[#dae2fd] outline-none focus:border-[#2e5bff] placeholder-[#434656]"
                                                    placeholder="e.g. Bihar State Electronics Pvt Ltd" />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="mb-1 block text-[11px] font-semibold text-[#c4c5d9]">Customer Address</label>
                                                <textarea value={dispatchForm.customerAddress} onChange={e => setDispatchForm(p => ({ ...p, customerAddress: e.target.value }))}
                                                    rows={2} className="w-full rounded-xl border border-[#434656] bg-[#131b2e] px-4 py-2.5 text-[13px] text-[#dae2fd] outline-none focus:border-[#2e5bff] placeholder-[#434656] resize-none"
                                                    placeholder="Full delivery address" />
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-[11px] font-semibold text-[#c4c5d9]">GSTIN (optional)</label>
                                                <input value={dispatchForm.customerGSTIN} onChange={e => setDispatchForm(p => ({ ...p, customerGSTIN: e.target.value }))}
                                                    className="w-full rounded-xl border border-[#434656] bg-[#131b2e] px-4 py-2.5 text-[13px] text-[#dae2fd] outline-none focus:border-[#2e5bff] placeholder-[#434656]"
                                                    placeholder="e.g. 10AAGCE7875R1ZJ" />
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-[11px] font-semibold text-[#c4c5d9]">Place of Supply</label>
                                                <input value={dispatchForm.placeOfSupply} onChange={e => setDispatchForm(p => ({ ...p, placeOfSupply: e.target.value }))}
                                                    className="w-full rounded-xl border border-[#434656] bg-[#131b2e] px-4 py-2.5 text-[13px] text-[#dae2fd] outline-none focus:border-[#2e5bff] placeholder-[#434656]"
                                                    placeholder="e.g. Bihar" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Board Range */}
                                    <div>
                                        <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-[#8e90a2]">Board Unit Range (Traceability)</p>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="mb-1 block text-[11px] font-semibold text-[#c4c5d9]">Unit Number From <span className="text-red-400">*</span></label>
                                                <input required type="number" min="1" value={dispatchForm.boardFrom} onChange={e => setDispatchForm(p => ({ ...p, boardFrom: e.target.value }))}
                                                    className="w-full rounded-xl border border-[#434656] bg-[#131b2e] px-4 py-2.5 text-[13px] font-mono text-[#00daf3] outline-none focus:border-[#2e5bff]"
                                                    placeholder="e.g. 1" />
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-[11px] font-semibold text-[#c4c5d9]">Unit Number To <span className="text-red-400">*</span></label>
                                                <input required type="number" min="1" value={dispatchForm.boardTo} onChange={e => setDispatchForm(p => ({ ...p, boardTo: e.target.value }))}
                                                    className="w-full rounded-xl border border-[#434656] bg-[#131b2e] px-4 py-2.5 text-[13px] font-mono text-[#00daf3] outline-none focus:border-[#2e5bff]"
                                                    placeholder="e.g. 50" />
                                            </div>
                                        </div>
                                        {dispatchForm.boardFrom && dispatchForm.boardTo && Number(dispatchForm.boardTo) >= Number(dispatchForm.boardFrom) && (
                                            <div className="mt-2 flex items-center gap-2 rounded-lg border border-[#00e383]/25 bg-[#00e383]/10 px-3 py-2">
                                                <span className="material-symbols-outlined text-[14px] text-[#00e383]">check_circle</span>
                                                <span className="text-[11px] font-bold text-[#00e383]">
                                                    {Number(dispatchForm.boardTo) - Number(dispatchForm.boardFrom) + 1} boards in this dispatch
                                                    &nbsp;(Unit #{dispatchForm.boardFrom} &ndash; #{dispatchForm.boardTo})
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Challan Details */}
                                    <div>
                                        <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-[#8e90a2]">Challan Details</p>
                                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                            <div className="md:col-span-2">
                                                <label className="mb-1 block text-[11px] font-semibold text-[#c4c5d9]">Product Description</label>
                                                <input value={dispatchForm.productDescription} onChange={e => setDispatchForm(p => ({ ...p, productDescription: e.target.value }))}
                                                    className="w-full rounded-xl border border-[#434656] bg-[#131b2e] px-4 py-2.5 text-[13px] text-[#dae2fd] outline-none focus:border-[#2e5bff]"
                                                    placeholder="e.g. PCB Assembly – Weighing System" />
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-[11px] font-semibold text-[#c4c5d9]">HSN / SAC Code</label>
                                                <input value={dispatchForm.hsnCode} onChange={e => setDispatchForm(p => ({ ...p, hsnCode: e.target.value }))}
                                                    className="w-full rounded-xl border border-[#434656] bg-[#131b2e] px-4 py-2.5 text-[13px] text-[#dae2fd] outline-none focus:border-[#2e5bff]"
                                                    placeholder="e.g. 85340000" />
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-[11px] font-semibold text-[#c4c5d9]">Challan Type</label>
                                                <select value={dispatchForm.challanType} onChange={e => setDispatchForm(p => ({ ...p, challanType: e.target.value }))}
                                                    className="w-full rounded-xl border border-[#434656] bg-[#131b2e] px-4 py-2.5 text-[13px] text-[#dae2fd] outline-none focus:border-[#2e5bff]">
                                                    {['Job Work', 'Supply', 'Returns', 'Others'].map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-[11px] font-semibold text-[#c4c5d9]">Rate per Board (&#8377;) <span className="text-[#8e90a2] font-normal">(optional)</span></label>
                                                <input type="number" min="0" step="0.01" value={dispatchForm.ratePerBoard} onChange={e => setDispatchForm(p => ({ ...p, ratePerBoard: e.target.value }))}
                                                    className="w-full rounded-xl border border-[#434656] bg-[#131b2e] px-4 py-2.5 text-[13px] text-[#dae2fd] outline-none focus:border-[#2e5bff]"
                                                    placeholder="Leave blank for logistics-only DC" />
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-[11px] font-semibold text-[#c4c5d9]">IGST %</label>
                                                <input type="number" min="0" max="100" value={dispatchForm.igstPercent} onChange={e => setDispatchForm(p => ({ ...p, igstPercent: e.target.value }))}
                                                    className="w-full rounded-xl border border-[#434656] bg-[#131b2e] px-4 py-2.5 text-[13px] text-[#dae2fd] outline-none focus:border-[#2e5bff]" />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="mb-1 block text-[11px] font-semibold text-[#c4c5d9]">Notes</label>
                                                <textarea value={dispatchForm.notes} onChange={e => setDispatchForm(p => ({ ...p, notes: e.target.value }))}
                                                    rows={2} className="w-full rounded-xl border border-[#434656] bg-[#131b2e] px-4 py-2.5 text-[13px] text-[#dae2fd] outline-none focus:border-[#2e5bff] resize-none"
                                                    placeholder="Any delivery notes or special instructions..." />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Footer */}
                                    <div className="flex items-center justify-end gap-3 border-t border-[#222a3d] pt-4">
                                        <button type="button" onClick={() => { setShowCreateDispatch(false); setDispatchError(''); }}
                                            className="rounded-xl border border-[#434656] px-5 py-2.5 text-[12px] font-bold text-[#c4c5d9] hover:bg-[#2d3449]">
                                            Cancel
                                        </button>
                                        <button type="submit" disabled={dispatchSaving}
                                            className="flex items-center gap-2 rounded-xl bg-[#2e5bff] px-6 py-2.5 text-[12px] font-bold text-white shadow-[0_0_20px_rgba(46,91,255,0.35)] transition-all hover:bg-[#4a6fff] disabled:opacity-60">
                                            {dispatchSaving ? (
                                                <><span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>Creating...</>
                                            ) : (
                                                <><span className="material-symbols-outlined text-[16px]">download</span>Create & Download DC</>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ══ DASHBOARD TAB ══ */}
            {activeTab === 'dashboard' && showInitializingState && (
                <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[20px] border border-[#434656] bg-[#0b1326] px-6 py-16 text-center text-[#dae2fd]">
                    <span className="material-symbols-outlined mb-4 text-6xl text-[#9cf0ff]">inventory_2</span>
                    <h3 className="text-xl font-bold">Initializing production phases</h3>
                    <p className="mt-2 text-sm text-[#c4c5d9]">The PCB production flow is syncing for this project.</p>
                </div>
            )}

            {activeTab === 'dashboard' && !showInitializingState && (
                <div className="space-y-8 p-6 pb-28">
                    <section className="overflow-x-auto pb-2">
                        <div className="relative flex min-w-[920px] items-center justify-between gap-2">
                            <div className="absolute left-0 right-0 top-5 h-[2px] bg-[#434656]" />
                            {orderedProdTasks.map((task, index) => {
                                const state = getTaskState(task);
                                const isCompleted = state === 'completed';
                                const isActive = state === 'active';
                                const icon = PHASE_ICONS[task.productionPhase || task.title] || 'radio_button_checked';

                                return (
                                    <div key={getTaskId(task)} className="relative z-10 flex w-[88px] flex-col items-center gap-2 text-center">
                                        <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm transition-all ${
                                            isCompleted
                                                ? 'border-[#00e383] bg-[#00e383] text-[#00210e]'
                                                : isActive
                                                    ? 'border-[#0b1326] bg-[#2e5bff] text-[#efefff] shadow-[0_0_15px_rgba(46,91,255,0.4)]'
                                                    : 'border-[#8e90a2] bg-[#222a3d] text-[#c4c5d9]'
                                        }`}>
                                            <span
                                                className={`material-symbols-outlined ${isActive ? 'animate-pulse' : ''}`}
                                                style={isCompleted || isActive ? { fontVariationSettings: "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24" } : undefined}
                                            >
                                                {isCompleted ? 'check_circle' : icon}
                                            </span>
                                        </div>
                                        <span className={`text-[11px] font-bold ${
                                            isCompleted ? 'text-[#00e383]' : isActive ? 'text-[#b8c3ff]' : 'text-[#c4c5d9]'
                                        }`}>
                                            {getStepLabel(task)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
                        <div className="min-w-0 space-y-4 lg:w-[calc(100%-360px)] lg:shrink">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[#b8c3ff]">format_list_bulleted</span>
                                <h3 className="font-['Hanken_Grotesk'] text-[24px] font-semibold text-[#efefff]">Task Management</h3>
                            </div>

                            <div className="overflow-hidden rounded-xl border border-[#434656] bg-[#131b2e]">
                                <div className="hidden lg:block">
                                    <table className="w-full border-collapse text-left">
                                        <thead>
                                            <tr className="border-b border-[#434656] bg-[#222a3d]">
                                                <th className="w-8 pl-3 pr-0">
                                                    {isSaving && <span className="material-symbols-outlined text-[14px] text-[#b8c3ff] animate-spin">progress_activity</span>}
                                                </th>
                                                <th className="px-6 py-4 text-[12px] font-medium uppercase tracking-wider text-[#c4c5d9]">Production Phase</th>
                                                <th className="px-6 py-4 text-[12px] font-medium uppercase tracking-wider text-[#c4c5d9]">Unit Tracking</th>
                                                <th className="px-6 py-4 text-[12px] font-medium uppercase tracking-wider text-[#c4c5d9]">Status</th>
                                                <th className="px-6 py-4 text-[12px] font-medium uppercase tracking-wider text-[#c4c5d9]">Lead</th>
                                                {showActionsColumn && (
                                                    <th className="px-6 py-4 text-right text-[12px] font-medium uppercase tracking-wider text-[#c4c5d9]">Actions</th>
                                                )}
                                            </tr>
                                        </thead>
                                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleProdDragEnd}>
                                        <SortableContext items={orderedProdTasks.map(t => t._id || t.id)} strategy={verticalListSortingStrategy}>
                                        <tbody className="divide-y divide-[#434656]/70">
                                            {orderedProdTasks.map((task, index) => {
                                                const taskId = getTaskId(task);
                                                const isEditing = editingTaskId === taskId;
                                                const state = getTaskState(task);
                                                const availableCapacity = getAvailableCapacity(task, index, orderedProdTasks, totalBatch);
                                                const taskAssignments = assignmentsByTaskId[String(taskId)] || [];
                                                // For the Lead column: use userName directly from assignment data (avoids ObjectId vs string mismatch)
                                                const singleAssigneeName = taskAssignments.length === 1 ? taskAssignments[0].userName : null;
                                                // Fallback to users list only when no split allocations exist
                                                const fallbackAssignee = taskAssignments.length === 0
                                                    ? users?.find((user) => String(getUserId(user)) === String(task.assigneeId?._id || task.assigneeId))
                                                    : null;
                                                const assignedBoards = taskAssignments.reduce((sum, item) => sum + Number(item.boardsAssigned || 0), 0);
                                                const unassignedBoards = Math.max(0, availableCapacity - assignedBoards);
                                                const progressWidth = availableCapacity > 0 ? Math.min(100, (Number(task.unitsCompleted || 0) / availableCapacity) * 100) : 0;

                                                return (
                                                    <Fragment key={taskId}>
                                                        <SortableProdRow
                                                            task={task}
                                                            className={`transition-colors ${
                                                                state === 'active' ? 'bg-[#2e5bff]/8' : 'hover:bg-[#2d3449]/25'
                                                            } ${state === 'pending' ? 'opacity-70' : ''}`}
                                                        >
                                                            <td className={`px-6 py-5 ${state === 'active' ? 'border-l-4 border-[#2e5bff]' : ''}`}>
                                                                <p className="font-bold text-[#dae2fd]">{task.productionPhase || task.title}</p>
                                                                <p className="mt-1 text-[11px] text-[#c4c5d9]">
                                                                    {taskAssignments.length > 0
                                                                        ? `${taskAssignments.length} worker allocation${taskAssignments.length > 1 ? 's' : ''} configured`
                                                                        : state === 'completed'
                                                                            ? `Phase complete for ${Number(task.unitsCompleted || 0)} boards`
                                                                            : state === 'active'
                                                                                ? `${Number(task.unitsCurrentlyHere || 0)} boards remaining in this phase`
                                                                                : 'Ready for allocation and manager planning'}
                                                                </p>
                                                                {rowErrors[taskId] && (
                                                                    <div className="mt-3 rounded-lg border border-[#93000a] bg-[#93000a]/20 px-3 py-2 text-[11px] text-[#ffdad6]">
                                                                        {rowErrors[taskId]}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-5">
                                                                <div className="flex flex-col gap-1">
                                                                    <span className={`font-mono text-[18px] font-semibold ${
                                                                        state === 'completed' ? 'text-[#00e383]' : state === 'active' ? 'text-[#00e3fd]' : 'text-[#c4c5d9]'
                                                                    }`}>
                                                                        {Number(task.unitsCompleted || 0)} / {availableCapacity}
                                                                    </span>
                                                                    <div className="h-1 w-24 overflow-hidden rounded-full bg-[#2d3449]">
                                                                        <div
                                                                            className={`h-full ${
                                                                                state === 'completed' ? 'bg-[#00e383]' : state === 'active' ? 'bg-[#00e3fd]' : 'bg-[#8e90a2]'
                                                                            }`}
                                                                            style={{ width: `${progressWidth}%` }}
                                                                        />
                                                                    </div>
                                                                    <span className="text-[10px] text-[#c4c5d9]">{Number(task.unitsCurrentlyHere || 0)} boards remaining here</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-5">
                                                                <span className={`inline-flex rounded-lg px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${
                                                                    task.status === 'COMPLETED'
                                                                        ? 'bg-[#007e46]/25 text-[#5bffa1]'
                                                                        : task.status === 'IN_PROGRESS'
                                                                            ? 'bg-[#00e3fd]/18 text-[#9cf0ff] shadow-[0_0_10px_rgba(0,227,253,0.18)]'
                                                                            : 'bg-[#2d3449] text-[#c4c5d9]'
                                                                }`}>
                                                                    {task.status === 'NOT_STARTED' ? 'Pending' : task.status.replace('_', ' ')}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-5">
                                                                {taskAssignments.length > 1 ? (
                                                                    <div>
                                                                        <p className="text-[12px] font-bold leading-none text-[#dae2fd]">{taskAssignments.length} workers assigned</p>
                                                                        <p className="mt-1 text-[10px] font-bold uppercase text-[#00e383]">{assignedBoards} boards allocated</p>
                                                                    </div>
                                                                ) : singleAssigneeName ? (
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#b8c3ff] text-[10px] font-bold text-[#002388]">
                                                                            {singleAssigneeName.slice(0, 1).toUpperCase()}
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-[12px] font-bold leading-none text-[#dae2fd]">{singleAssigneeName}</p>
                                                                            <p className="mt-1 text-[10px] font-bold uppercase text-[#00e383]">Assigned</p>
                                                                        </div>
                                                                    </div>
                                                                ) : fallbackAssignee ? (
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#b8c3ff] text-[10px] font-bold text-[#002388]">
                                                                            {fallbackAssignee.name?.slice(0, 1) || 'U'}
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-[12px] font-bold leading-none text-[#dae2fd]">{fallbackAssignee.name}</p>
                                                                            <p className="mt-1 text-[10px] font-bold uppercase text-[#00e383]">Assigned</p>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex items-center gap-2 text-[#c4c5d9]">
                                                                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2d3449] text-[14px]">
                                                                            <span className="material-symbols-outlined text-[16px]">person</span>
                                                                        </div>
                                                                        <span className="text-[12px]">Unassigned</span>
                                                                    </div>
                                                                )}
                                                            </td>
                                                            {showActionsColumn && (
                                                                <td className="px-6 py-5 text-right">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => toggleExpandedTask(taskId)}
                                                                        className="rounded-lg border border-[#2e5bff]/35 bg-[#2e5bff]/12 px-3 py-2 text-[11px] font-semibold text-[#b8c3ff] transition-colors hover:bg-[#2e5bff]/20 hover:text-[#dde1ff]"
                                                                    >
                                                                        {expandedTasks[taskId] ? 'Hide split' : 'Manage split'}
                                                                    </button>
                                                                </td>
                                                            )}
                                                        </SortableProdRow>
                                                        {expandedTasks[taskId] && (
                                                            <tr className="bg-[#10192d]">
                                                                <td colSpan={showActionsColumn ? 6 : 5} className="px-6 py-5">
                                                                    <div className="rounded-2xl border border-[#3f485d] bg-[#0d1529] p-4">
                                                                        <div className="mb-4">
                                                                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#c4c5d9]">Split Allocation</p>
                                                                            <p className="mt-1 text-[12px] text-[#dae2fd]">
                                                                                Capacity: {hasProjectCapacity ? availableCapacity : 'Not set'} boards. Assigned: {assignedBoards}. Remaining unassigned: {hasProjectCapacity ? unassignedBoards : 'Not set'}.
                                                                            </p>
                                                                        </div>
                                                                        {assignmentErrors[taskId] && (
                                                                            <div className="mb-4 rounded-lg border border-[#93000a] bg-[#93000a]/20 px-3 py-2 text-[11px] text-[#ffdad6]">
                                                                                {assignmentErrors[taskId]}
                                                                            </div>
                                                                        )}
                                                                        <div className="space-y-3">
                                                                            {taskAssignments.map((assignment) => {
                                                                                const assignmentId = String(assignment.id || assignment._id);
                                                                                const assignmentDraft = assignmentDrafts[assignmentId] || {
                                                                                    boardsAssigned: String(assignment.boardsAssigned ?? 0),
                                                                                    boardsCompletedApproved: String(assignment.boardsCompletedApproved ?? assignment.boardsCompleted ?? 0),
                                                                                    deadline: assignment.deadline ? new Date(assignment.deadline).toISOString().slice(0, 10) : ''
                                                                                };

                                                                                return (
                                                                                    <div key={assignmentId} className="grid grid-cols-[minmax(0,1.2fr)_100px_100px_140px_180px] items-center gap-3 rounded-xl border border-[#313a50] bg-[#131b2e] p-3">
                                                                                        <div>
                                                                                            <p className="text-[13px] font-bold text-[#dae2fd]">{assignment.userName}</p>
                                                                                            <p className="text-[10px] uppercase tracking-[0.14em] text-[#00e383]">{assignment.userRole || 'Worker'}</p>
                                                                                            <p className="mt-1 text-[10px] text-[#c4c5d9]">
                                                                                                Draft: {assignment.boardsCompletedDraft ?? 0} | Approved: {assignment.boardsCompletedApproved ?? 0}
                                                                                            </p>
                                                                                            <p className="mt-1 text-[10px] text-[#c4c5d9]">
                                                                                                {assignment.status === 'WAITING_APPROVAL' ? 'Waiting for manager approval' : assignment.status.replace('_', ' ')}
                                                                                            </p>
                                                                                            <p className="mt-1 text-[10px] text-[#8ea4c9]">Edit assigned boards or deadline here, then save.</p>
                                                                                        </div>
                                                                                        <input
                                                                                            type="number"
                                                                                            min="0"
                                                                                            step="1"
                                                                                            value={assignmentDraft.boardsAssigned}
                                                                                            onChange={(e) => setAssignmentDrafts((prev) => ({ ...prev, [assignmentId]: { ...assignmentDraft, boardsAssigned: e.target.value } }))}
                                                                                            className="rounded-lg border border-[#434656] bg-[#0b1326] px-3 py-2 text-sm text-[#dae2fd] placeholder:text-[#8ea4c9] outline-none focus:border-[#2e5bff]"
                                                                                        />
                                                                                        <input
                                                                                            type="number"
                                                                                            readOnly
                                                                                            value={assignment.boardsCompletedApproved ?? assignment.boardsCompleted ?? 0}
                                                                                            className="rounded-lg border border-[#434656] bg-[#0b1326] px-3 py-2 text-sm text-[#dae2fd] outline-none focus:border-[#2e5bff]"
                                                                                        />
                                                                                        <div className="relative">
                                                                                            <input
                                                                                                type="date"
                                                                                                value={assignmentDraft.deadline}
                                                                                                onChange={(e) => setAssignmentDrafts((prev) => ({ ...prev, [assignmentId]: { ...assignmentDraft, deadline: e.target.value } }))}
                                                                                                className="date-input-dark w-full rounded-lg border border-[#434656] bg-[#0b1326] px-3 py-2 pr-10 text-sm text-[#dae2fd] outline-none focus:border-[#2e5bff]"
                                                                                            />
                                                                                            <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-[#8ea4c9]">
                                                                                                calendar_today
                                                                                            </span>
                                                                                        </div>
                                                                                        <div className="text-right">
                                                                                            <div className="flex flex-wrap justify-end gap-2">
                                                                                                {/* Progress submit — visible to the assigned user (including self-assigned manager) */}
                                                                                                {String(assignment.userId?._id || assignment.userId) === String(currentUserId) && assignment.status !== 'COMPLETED' && (
                                                                                                    <div className="flex items-center gap-2">
                                                                                                        <input
                                                                                                            type="number"
                                                                                                            min="0"
                                                                                                            step="1"
                                                                                                            placeholder="Done"
                                                                                                            value={progressDrafts[assignmentId] ?? ''}
                                                                                                            onChange={(e) => setProgressDrafts((prev) => ({ ...prev, [assignmentId]: e.target.value }))}
                                                                                                            className="w-20 rounded-lg border border-[#00e383]/40 bg-[#0b1326] px-2 py-2 text-sm text-[#dae2fd] placeholder:text-[#8ea4c9] outline-none focus:border-[#00e383]"
                                                                                                        />
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            onClick={() => submitProgress(assignmentId, assignment.boardsAssigned)}
                                                                                                            disabled={assignmentSaving[assignmentId]}
                                                                                                            className="rounded bg-[#00e383] px-3 py-2 text-[11px] font-bold text-[#00210e] disabled:opacity-60"
                                                                                                        >
                                                                                                            {assignmentSaving[assignmentId] ? 'Saving...' : 'Submit Progress'}
                                                                                                        </button>
                                                                                                    </div>
                                                                                                )}
                                                                                                {/* Manager controls */}
                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={() => saveAssignment(taskId, assignmentId)}
                                                                                                    disabled={assignmentSaving[assignmentId]}
                                                                                                    className="rounded bg-[#2e5bff] px-3 py-2 text-[11px] font-bold text-[#efefff] disabled:opacity-60"
                                                                                                >
                                                                                                    {assignmentSaving[assignmentId] ? 'Saving...' : 'Save edit'}
                                                                                                </button>
                                                                                                {assignment.status === 'WAITING_APPROVAL' && (
                                                                                                    <>
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            onClick={() => reviewAssignment(assignmentId, true)}
                                                                                                            disabled={assignmentSaving[assignmentId]}
                                                                                                            className="rounded bg-[#00e383] px-3 py-2 text-[11px] font-bold text-[#00210e] disabled:opacity-60"
                                                                                                        >
                                                                                                            Approve
                                                                                                        </button>
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            onClick={() => reviewAssignment(assignmentId, false, 'Rejected by manager')}
                                                                                                            disabled={assignmentSaving[assignmentId]}
                                                                                                            className="rounded border border-[#93000a] bg-[#93000a]/15 px-3 py-2 text-[11px] font-bold text-[#ffdad6] disabled:opacity-60"
                                                                                                        >
                                                                                                            Reject
                                                                                                        </button>
                                                                                                    </>
                                                                                                )}
                                                                                            </div>
                                                                                            {assignmentErrors[assignmentId] && (
                                                                                                <p className="mt-2 text-[10px] text-[#ffdad6]">{assignmentErrors[assignmentId]}</p>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                            <div className="grid grid-cols-[minmax(0,1.2fr)_100px_100px_140px_180px] items-center gap-3 rounded-xl border border-[#3f485d] bg-[#182236] p-3">
                                                                                <select
                                                                                    value={newAssignmentDrafts[taskId]?.userId || ''}
                                                                                    onChange={(e) => setNewAssignmentDrafts((prev) => ({ ...prev, [taskId]: { ...(prev[taskId] || {}), userId: e.target.value } }))}
                                                                                    className="rounded-lg border border-[#434656] bg-[#0b1326] px-3 py-2 text-sm text-[#dae2fd] outline-none focus:border-[#2e5bff]"
                                                                                >
                                                                                    <option value="">Select worker</option>
                                                                                    {assignableUsers.map((user) => (
                                                                                        <option key={getUserId(user)} value={getUserId(user)}>
                                                                                            {user.name} ({user.role})
                                                                                        </option>
                                                                                    ))}
                                                                                </select>
                                                                                <input
                                                                                    type="number"
                                                                                    min="0"
                                                                                    step="1"
                                                                                    value={newAssignmentDrafts[taskId]?.boardsAssigned || ''}
                                                                                    onChange={(e) => setNewAssignmentDrafts((prev) => ({ ...prev, [taskId]: { ...(prev[taskId] || {}), boardsAssigned: e.target.value } }))}
                                                                                    placeholder="Assigned"
                                                                                    className="rounded-lg border border-[#434656] bg-[#0b1326] px-3 py-2 text-sm text-[#dae2fd] placeholder:text-[#8ea4c9] outline-none focus:border-[#2e5bff]"
                                                                                />
                                                                                <input
                                                                                    type="text"
                                                                                    readOnly
                                                                                    value="0"
                                                                                    placeholder="Approved"
                                                                                    className="rounded-lg border border-[#434656] bg-[#0b1326] px-3 py-2 text-sm text-[#dae2fd] outline-none focus:border-[#2e5bff]"
                                                                                />
                                                                                <div className="relative">
                                                                                    <input
                                                                                        type="date"
                                                                                        value={newAssignmentDrafts[taskId]?.deadline || ''}
                                                                                        onChange={(e) => setNewAssignmentDrafts((prev) => ({ ...prev, [taskId]: { ...(prev[taskId] || {}), deadline: e.target.value } }))}
                                                                                        className="date-input-dark w-full rounded-lg border border-[#434656] bg-[#0b1326] px-3 py-2 pr-10 text-sm text-[#dae2fd] outline-none focus:border-[#2e5bff]"
                                                                                    />
                                                                                    <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-[#8ea4c9]">
                                                                                        calendar_today
                                                                                    </span>
                                                                                </div>
                                                                                <div className="flex items-center justify-end gap-2">
                                                                                    {(assignableUserIds.size === 0 || assignableUserIds.has(String(currentUserId))) && (
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => createSelfAssignment(taskId, unassignedBoards)}
                                                                                            disabled={assignmentSaving[taskId] || !hasProjectCapacity}
                                                                                            className="rounded border border-[#00e3fd] bg-transparent px-3 py-2 text-[11px] font-bold text-[#00e3fd] transition-colors hover:bg-[#00e3fd]/10 disabled:opacity-60"
                                                                                        >
                                                                                            {assignmentSaving[taskId] ? 'Saving...' : 'Self Assign'}
                                                                                        </button>
                                                                                    )}
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => createAssignment(taskId)}
                                                                                        disabled={assignmentSaving[taskId] || !hasProjectCapacity}
                                                                                        className="rounded bg-[#00e3fd] px-3 py-2 text-[11px] font-bold text-[#001f24] disabled:opacity-60"
                                                                                    >
                                                                                        {assignmentSaving[taskId] ? 'Saving...' : 'Add worker'}
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </Fragment>
                                                );
                                            })}
                                        </tbody>
                                        </SortableContext>
                                        </DndContext>
                                    </table>
                                    <div className="flex items-center justify-between bg-[#131b2e] px-6 py-3 text-[11px] text-[#c4c5d9]">
                                        <p>Current Lead: {activeStations > 0 ? `${activeStations} active stations` : 'No active stations'}</p>
                                        <div className="flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-[#00e383]" />
                                            <p>Production dashboard synced</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4 p-4 lg:hidden">
                                    {orderedProdTasks.map((task, index) => {
                                        const taskId = getTaskId(task);
                                        const isEditing = editingTaskId === taskId;
                                        const state = getTaskState(task);
                                        const availableCapacity = getAvailableCapacity(task, index, orderedProdTasks, totalBatch);
                                        const assignee = users?.find((user) => getUserId(user) === (task.assigneeId || task.assigneeId?._id));

                                        return (
                                            <div key={taskId} className="rounded-xl border border-[#434656] bg-[#171f33] p-4">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <p className="font-bold text-[#dae2fd]">{task.productionPhase || task.title}</p>
                                                        <p className="mt-1 text-[11px] text-[#c4c5d9]">{Number(task.unitsCompleted || 0)} / {availableCapacity}</p>
                                                    </div>
                                                    <span className={`rounded-lg px-3 py-1 text-[10px] font-bold uppercase ${
                                                        task.status === 'COMPLETED'
                                                            ? 'bg-[#007e46]/25 text-[#5bffa1]'
                                                            : task.status === 'IN_PROGRESS'
                                                                ? 'bg-[#00e3fd]/18 text-[#9cf0ff]'
                                                                : 'bg-[#2d3449] text-[#c4c5d9]'
                                                    }`}>
                                                        {task.status === 'NOT_STARTED' ? 'Pending' : task.status.replace('_', ' ')}
                                                    </span>
                                                </div>
                                                <div className="mt-3 text-[12px] text-[#c4c5d9]">
                                                    Lead: <span className="font-semibold text-[#dae2fd]">{assignee?.name || 'Unassigned'}</span>
                                                </div>
                                                    <div className="mt-3 text-[12px] text-[#c4c5d9]">
                                                        Remaining here: {Number(task.unitsCurrentlyHere || 0)}
                                                    </div>
                                                {rowErrors[taskId] && (
                                                    <div className="mt-3 rounded-lg border border-[#93000a] bg-[#93000a]/20 px-3 py-2 text-[11px] text-[#ffdad6]">
                                                        {rowErrors[taskId]}
                                                    </div>
                                                )}
                                                {showActionsColumn && isEditing ? (
                                                    <div className="mt-4 space-y-3">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max={availableCapacity}
                                                            step="1"
                                                            value={draft.unitsCompleted}
                                                            onChange={(e) => setDraft({ unitsCompleted: e.target.value })}
                                                            className="w-full rounded-lg border border-[#434656] bg-[#0b1326] px-3 py-2 text-sm text-[#dae2fd] outline-none focus:border-[#2e5bff]"
                                                            placeholder="Enter board count"
                                                        />
                                                        <select
                                                            value={draft.assigneeId}
                                                            onChange={(e) => setDraft((prev) => ({ ...prev, assigneeId: e.target.value }))}
                                                            className="w-full rounded-lg border border-[#434656] bg-[#0b1326] px-3 py-2 text-sm text-[#dae2fd] outline-none focus:border-[#2e5bff]"
                                                        >
                                                            <option value="">Unassigned</option>
                                                            {assignableUsers.map((user) => (
                                                                <option key={getUserId(user)} value={getUserId(user)}>
                                                                    {user.name} ({user.role})
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <div className="flex gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={cancelEdit}
                                                                className="flex-1 rounded border border-[#434656] px-3 py-2 text-[11px] font-bold text-[#c4c5d9]"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => saveTask(task)}
                                                                disabled={rowLoading[taskId]}
                                                                className="flex-1 rounded bg-[#2e5bff] px-3 py-2 text-[11px] font-bold text-[#efefff] disabled:opacity-60"
                                                            >
                                                                {rowLoading[taskId] ? 'Saving...' : 'Save'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : showActionsColumn ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => beginEdit(task)}
                                                        className="mt-4 w-full rounded border border-[#2e5bff]/30 bg-[#2e5bff]/15 px-3 py-2 text-[11px] font-semibold text-[#b8c3ff]"
                                                    >
                                                        Enter boards
                                                    </button>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <aside className="min-w-0 lg:sticky lg:top-0 lg:w-[360px] lg:shrink-0 xl:w-[380px]">
                            <div className="flex h-full flex-col gap-4 rounded-[18px] border border-[#3f485d] bg-[#10192d] p-4 shadow-[0_18px_50px_rgba(6,14,32,0.34)]">
                                <div>
                                    <h3 className="font-['Hanken_Grotesk'] text-[18px] font-semibold text-[#efefff]">Project Stats</h3>
                                </div>

                                <div className="rounded-2xl border border-[#4b5468] bg-[#182236] px-4 py-4">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#cfd5e6]">Project Status</p>
                                        <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] ${
                                            projectState === 'COMPLETED'
                                                ? 'bg-[#007e46] text-[#c2ffd1]'
                                                : projectState === 'ACTIVE'
                                                    ? 'bg-[#2e5bff] text-[#efefff]'
                                                    : 'bg-[#222a3d] text-[#c4c5d9]'
                                        }`}>
                                            {projectState === 'ACTIVE' ? 'Active' : projectState}
                                        </span>
                                    </div>
                                    <div className="flex items-end justify-between gap-3">
                                        <div>
                                            <p className="text-[11px] text-[#9ea8bf]">Overall completion</p>
                                            <p className="mt-1 font-mono text-[26px] font-semibold leading-none text-[#e7ecff]">{overallCompletion}%</p>
                                        </div>
                                        <div className="min-w-[86px]">
                                            <div className="h-2 w-full overflow-hidden rounded-full bg-[#313a50]">
                                                <div className="h-full bg-[#11d7ff]" style={{ width: `${overallCompletion}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-2xl border border-[#4b5468] bg-[#2b3448] px-4 py-4">
                                        <p className="mb-2 text-[10px] font-bold uppercase text-[#cfd5e6]">Total Batch</p>
                                        <p className="font-mono text-[28px] font-semibold leading-none text-[#e7ecff]">{hasProjectCapacity ? totalBatch : 'Not set'}</p>
                                    </div>
                                    <div className="rounded-2xl border border-[#4b5468] bg-[#2b3448] px-4 py-4">
                                        <p className="mb-2 text-[10px] font-bold uppercase text-[#cfd5e6]">Total Units Done</p>
                                        <p className="font-mono text-[28px] font-semibold leading-none text-[#00e383]">{boardsPassed}</p>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-[#4b5468] bg-[#2b3448] px-4 py-4">
                                    <div className="mb-3 flex items-center justify-between">
                                        <p className="text-[10px] font-bold uppercase text-[#cfd5e6]">In Progress</p>
                                        <span className="text-[10px] font-bold text-[#00e3fd]">{activePct}% Active</span>
                                    </div>
                                    <div className="mb-4 flex items-end gap-2">
                                        <span className="font-mono text-[30px] font-semibold leading-none text-[#e7ecff]">
                                            {String(activeStations).padStart(2, '0')}
                                        </span>
                                        <span className="pb-1 text-[13px] text-[#d4d9e8]">active stations</span>
                                    </div>
                                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#3a4359]">
                                        <div className="h-full bg-[#11d7ff]" style={{ width: `${activePct}%` }} />
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-[#4b5468] bg-[#1a2438] px-4 py-4">
                                    <p className="mb-3 text-[10px] font-bold uppercase text-[#cfd5e6]">Assigned Manager</p>
                                    <div className="flex items-center gap-3 rounded-xl border border-[#3f485e] bg-[#0d1529] p-3">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2e5bff] text-xl font-bold text-[#efefff] shadow-[0_10px_24px_rgba(46,91,255,0.28)]">
                                            {getInitial(project?.managerName)}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate text-[14px] font-bold text-[#e7ecff]">{project?.managerName || 'Not Assigned'}</p>
                                            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#6da8ff]">Project Manager</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-auto rounded-xl border border-[#3f485e] bg-[#232c40] px-4 py-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-[12px] text-[#cfd5e6]">Expected Dispatch</span>
                                        <span className="text-[13px] font-bold text-[#f1f4ff]">{formatDate(project?.deadline || project?.endDate)}</span>
                                    </div>
                                </div>

                                {showActionsColumn && (
                                    <div className="rounded-xl border border-[#2e5bff]/30 bg-[#12203d] px-4 py-3 text-[12px] text-[#cfd5e6]">
                                        Manager mode is enabled. Use each row&apos;s <span className="font-semibold text-[#b8c3ff]">Enter boards</span> action to record completed boards.
                                    </div>
                                )}
                            </div>
                        </aside>
                    </div>
                </div>
            )}
        </div>
    );
}
