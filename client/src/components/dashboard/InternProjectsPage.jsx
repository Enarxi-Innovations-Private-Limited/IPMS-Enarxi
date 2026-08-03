import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import api from '../../services/api.js';
import InternLayout from '../common/InternLayout.jsx';
import { getCurrentUser } from '../../services/authService.js';
import ProductionWorkerProjectView from './ProductionWorkerProjectView.jsx';

// Kanban Components (Duplicated for isolation as requested)
const KanbanTaskCard = ({ task, onClick }) => {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: task.id,
        data: { task }
    });

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 1000,
    } : undefined;

    const getBorderColor = (status) => {
        switch (status) {
            case 'NOT_STARTED': return 'border-l-blue-500'; // New
            case 'IN_PROGRESS': return 'border-l-amber-500'; // In Progress
            case 'WAITING_APPROVAL': return 'border-l-purple-500'; // Waiting
            case 'COMPLETED': return 'border-l-green-500'; // Closed
            default: return 'border-l-gray-500';
        }
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            onClick={onClick}
            className={`bg-white dark:bg-surface-dark p-3 rounded shadow-sm border border-border-dark ${getBorderColor(task.status)} border-l-4 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow mb-3`}
        >
            <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] uppercase font-bold text-text-secondary tracking-wider">TASK</span>
                <span className="text-[10px] text-text-secondary">#{task.id.slice(-4)}</span>
            </div>
            <h4 className="text-white font-medium text-sm mb-3 line-clamp-2">{task.title}</h4>
            <div className="flex justify-between items-center">
                <div className="size-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[10px] text-white font-bold">
                    ME
                </div>
            </div>
        </div>
    );
};

const KanbanColumn = ({ id, title, tasks, status, color, onTaskClick }) => {
    const { setNodeRef, isOver } = useDroppable({
        id: id,
        data: { status }
    });

    return (
        <div ref={setNodeRef} className={`flex-1 min-w-[280px] bg-background-dark/30 rounded-xl p-4 border border-border-dark/50 flex flex-col ${isOver ? 'ring-2 ring-primary/50 bg-primary/5' : ''}`}>
            <div className={`border-t-4 ${color} pt-3 mb-4 flex justify-between items-center`}>
                <h3 className="font-bold text-white text-base">{title}</h3>
                <span className="bg-white/10 text-text-secondary text-xs px-2 py-0.5 rounded-full">{tasks.length}</span>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 pb-2 min-h-[100px]">
                {tasks.map(task => (
                    <KanbanTaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
                ))}
                {tasks.length === 0 && (
                    <div className="text-center py-8 text-text-secondary text-xs italic">
                        No tasks
                    </div>
                )}
            </div>
        </div>
    );
};

export default function InternProjectsPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const user = getCurrentUser();
    const [projects, setProjects] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [productionAssignments, setProductionAssignments] = useState([]);
    const [productionDrafts, setProductionDrafts] = useState({});
    const [productionSaving, setProductionSaving] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [selectedProject, setSelectedProject] = useState(null);
    const [fullProjectTasks, setFullProjectTasks] = useState([]);

    useEffect(() => {
        if (!selectedProject) {
            setFullProjectTasks([]);
            return;
        }
        const fetchFullProjectTasks = async () => {
            try {
                const res = await api.get(`/projects/${selectedProject.id}/tasks`);
                setFullProjectTasks(res.data || []);
            } catch (err) {
                console.error('Failed to load full project tasks', err);
            }
        };
        fetchFullProjectTasks();
    }, [selectedProject]);

    // Attachments State
    const [isAttachmentsExpanded, setIsAttachmentsExpanded] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [attachmentName, setAttachmentName] = useState('');
    const [statusUpdate, setStatusUpdate] = useState({});

    // Mobile: current status tab for list view
    const [mobileStatus, setMobileStatus] = useState('NOT_STARTED');

    // Notification state
    const [notification, setNotification] = useState(null);

    const [confirmModal, setConfirmModal] = useState({
        show: false,
        title: '',
        message: '',
        onConfirm: null,
        type: 'primary'
    });

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (!loading && projects.length > 0) {
            const searchParams = new URLSearchParams(location.search);
            const projectId = searchParams.get('projectId');
            if (projectId) {
                const found = projects.find(p => p.id === projectId);
                if (found) {
                    setSelectedProject(found);
                }
            }
        }
    }, [location.search, loading, projects]);

    const loadData = async () => {
        try {
            setLoading(true);
            const [projRes, taskRes, productionRes] = await Promise.all([
                api.get('/projects'),
                api.get('/tasks'),
                api.get('/my/production-assignments')
            ]);
            setProjects(projRes.data);
            setTasks(taskRes.data);
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
            setError(err.response?.data?.message || 'Failed to load projects');
        } finally {
            setLoading(false);
        }
    };

    const getProjectTasks = (projectId) => {
        // Convert to string for comparison since MongoDB ObjectIds may not match directly
        return tasks.filter((t) => String(t.projectId) === String(projectId) && String(t.assigneeId) === String(user.id));
    };

    const getProjectStats = (projectId) => {
        const projectTasks = getProjectTasks(projectId);
        const total = projectTasks.length;
        const completed = projectTasks.filter((t) => t.status === 'COMPLETED').length;
        const inProgress = projectTasks.filter((t) => t.status === 'IN_PROGRESS').length;
        const notStarted = projectTasks.filter((t) => t.status === 'NOT_STARTED').length;
        const completion = total > 0 ? Math.round((completed / total) * 100) : 0;
        return { total, completed, inProgress, notStarted, completion };
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

            const updatedAttachments = res.data.attachments;
            setSelectedProject({ ...selectedProject, attachments: updatedAttachments });
            // Update in main list as well if needed
            setProjects(projects.map(p => p.id === selectedProject.id ? { ...p, attachments: updatedAttachments } : p));
            setNotification({ message: 'Attachments uploaded successfully', type: 'success' });
        } catch (err) {
            console.error(err);
            setNotification({ message: 'Failed to upload attachments', type: 'error' });
        } finally {
            setIsUploading(false);
            e.target.value = null;
            setAttachmentName('');
        }
    };

    const handleTaskStatusChange = async (taskId, status) => {
        try {
            await api.put(`/tasks/${taskId}/status`, { status });
            setStatusUpdate({ ...statusUpdate, [taskId]: status });
            // Refresh logic - update tasks list
            const updatedTasks = tasks.map(t =>
                t.id === taskId ? { ...t, status } : t
            );
            setTasks(updatedTasks);

            // Also update project list if needed (for stats)
            const updatedProjects = projects.map(p => {
                // Determine if this task belongs to this project
                // Since we don't know easily without looping, simpler to just re-calc stats on render or reload
                // But we can trigger a reload or optimistic update.
                // For now, simpler to just rely on local state or reload everything.
                // Let's just update local tasks state which drives the view.
                return p;
            });
            setProjects(updatedProjects);

        } catch (err) {
            console.error(err);
            setError(err.response?.data?.message || 'Failed to update task status');
        }
    };

    // Project Detail View
    if (selectedProject) {
        const stats = getProjectStats(selectedProject.id);
        const projectTasks = getProjectTasks(selectedProject.id);
        const projectProductionTasks = fullProjectTasks.filter((task) => task.isProductionTask || task.isFullProductStage);
        const projectProductionAssignments = productionAssignments.filter((assignment) => String(assignment.projectId) === String(selectedProject.id));

        const mobileTabs = [
            { key: 'NOT_STARTED', label: 'New' },
            { key: 'IN_PROGRESS', label: 'In Progress' },
            { key: 'WAITING_APPROVAL', label: 'Review' },
            { key: 'COMPLETED', label: 'Done' },
        ];

        const nextStatusMap = {
            NOT_STARTED: 'IN_PROGRESS',
            IN_PROGRESS: 'WAITING_APPROVAL',
            WAITING_APPROVAL: null,
            COMPLETED: null,
        };

        const handleMobileAdvance = async (task) => {
            const next = nextStatusMap[task.status];
            if (!next) return;
            await handleTaskStatusChange(task.id, next);
        };

        if (['PRODUCTION', 'FULL_PRODUCT_PRODUCTION'].includes(selectedProject.projectType)) {
            return (
                <InternLayout currentPage="projects">
                    <div className="p-6 lg:px-12 pb-24">
                        <div className="max-w-[1480px] mx-auto w-full">
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
                                        <button
                                            onClick={() => setSelectedProject(null)}
                                            className="ml-2 text-text-secondary hover:text-white text-sm font-medium transition-colors"
                                        >
                                            My Projects
                                        </button>
                                    </li>
                                    <li className="flex items-center">
                                        <span className="material-symbols-outlined text-text-secondary text-base">chevron_right</span>
                                        <span className="ml-2 text-white text-sm font-medium">{selectedProject.projectCode || selectedProject.name}</span>
                                    </li>
                                </ol>
                            </nav>

                            <ProductionWorkerProjectView
                                project={selectedProject}
                                tasks={projectProductionTasks}
                                assignments={projectProductionAssignments}
                                productionDrafts={productionDrafts}
                                productionSaving={productionSaving}
                                setProductionDrafts={setProductionDrafts}
                                submitProductionProgress={submitProductionProgress}
                                onBack={() => setSelectedProject(null)}
                            />

                            <div className="bg-surface-dark border border-border-dark rounded-xl shadow-xl overflow-hidden mt-8">
                                <div
                                    className="px-6 py-4 border-b border-border-dark bg-gradient-surface flex items-center justify-between cursor-pointer"
                                    onClick={() => setIsAttachmentsExpanded(!isAttachmentsExpanded)}
                                >
                                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary">attach_file</span>
                                        Attachments ({selectedProject.attachments?.length || 0})
                                    </h2>
                                    <span className={`material-symbols-outlined text-text-secondary transition-transform ${isAttachmentsExpanded ? 'rotate-180' : ''}`}>expand_more</span>
                                </div>

                                {isAttachmentsExpanded && (
                                    <div className="p-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                            {selectedProject.attachments?.map((file, idx) => (
                                                <div key={idx} className="flex items-center gap-3 p-3 bg-background-dark/50 border border-border-dark rounded-lg hover:bg-background-dark transition-colors group">
                                                    <div className="size-10 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                                                        <span className="material-symbols-outlined text-xl">description</span>
                                                    </div>
                                                    <a href={`/api${file.url}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 hover:text-primary transition-colors">
                                                        <p className="text-white text-sm font-medium truncate">{file.name}</p>
                                                        <p className="text-text-secondary text-xs">{new Date(file.uploadedAt).toLocaleDateString()}</p>
                                                    </a>
                                                    <a href={`/api${file.url}`} target="_blank" rel="noreferrer" className="text-text-secondary hover:text-white p-2" title="Open">
                                                        <span className="material-symbols-outlined">open_in_new</span>
                                                    </a>
                                                </div>
                                            ))}
                                            {(!selectedProject.attachments || selectedProject.attachments.length === 0) && (
                                                <div className="col-span-full py-4 text-center text-text-secondary text-sm">
                                                    No attachments yet.
                                                </div>
                                            )}
                                        </div>

                                        <div className="border-t border-border-dark pt-6">
                                            <h4 className="text-white text-sm font-medium mb-3">Upload New Document</h4>
                                            <div className="flex gap-2 mb-3">
                                                <input
                                                    type="text"
                                                    placeholder="Document Name (e.g., Project Plan v1)"
                                                    className="flex-1 bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                                    value={attachmentName}
                                                    onChange={(e) => setAttachmentName(e.target.value)}
                                                />
                                            </div>
                                            <label className={`block w-full border-2 border-dashed border-border-dark rounded-xl p-6 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all group ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                                                <input
                                                    type="file"
                                                    multiple
                                                    className="hidden"
                                                    onChange={handleUploadAttachment}
                                                    disabled={isUploading}
                                                />
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="material-symbols-outlined text-text-secondary group-hover:text-primary text-2xl">upload_file</span>
                                                    <p className="text-sm font-medium text-white">Click to select files</p>
                                                </div>
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </InternLayout>
            );
        }

        return (
            <InternLayout currentPage="projects">
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
                                    <button
                                        onClick={() => setSelectedProject(null)}
                                        className="ml-2 text-text-secondary hover:text-white text-sm font-medium transition-colors"
                                    >
                                        My Projects
                                    </button>
                                </li>
                                <li className="flex items-center">
                                    <span className="material-symbols-outlined text-text-secondary text-base">chevron_right</span>
                                    <span className="ml-2 text-white text-sm font-medium">{selectedProject.projectCode || 'No ID'}</span>
                                </li>
                            </ol>
                        </nav>

                        {/* Project Header */}
                        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
                                        {selectedProject.projectCode || 'No ID'}
                                    </h1>
                                    <span
                                        className={`px-3 py-1 text-sm font-medium rounded-full ${selectedProject.status === 'ACTIVE'
                                            ? 'bg-green-500/20 text-green-400'
                                            : 'bg-blue-500/20 text-blue-400'
                                            }`}
                                    >
                                        {selectedProject.status}
                                    </span>
                                </div>
                                <p className="text-text-secondary text-lg">
                                    {selectedProject.description || 'No description provided'}
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedProject(null)}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-text-secondary font-semibold hover:bg-slate-100 bg-white transition-colors"
                            >
                                <span className="material-symbols-outlined text-lg">arrow_back</span>
                                Back to Projects
                            </button>
                        </div>

                        {/* My Tasks Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                            <div className="bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider">My Tasks</h3>
                                    <span className="material-symbols-outlined text-primary">task_alt</span>
                                </div>
                                <p className="text-3xl font-bold text-white">{stats.total}</p>
                            </div>
                            <div className="bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider">Completed</h3>
                                    <span className="material-symbols-outlined text-green-500">check_circle</span>
                                </div>
                                <p className="text-3xl font-bold text-white">{stats.completed}</p>
                            </div>
                            <div className="bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider">In Progress</h3>
                                    <span className="material-symbols-outlined text-blue-500">pending</span>
                                </div>
                                <p className="text-3xl font-bold text-white">{stats.inProgress}</p>
                            </div>
                            <div className="bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider">Completion</h3>
                                    <span className="material-symbols-outlined text-amber-500">analytics</span>
                                </div>
                                <p className="text-3xl font-bold text-white">{stats.completion}%</p>
                            </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl mb-8">
                            <h3 className="text-white font-semibold mb-4">My Progress</h3>
                            <div className="h-4 bg-background-dark rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-primary transition-all duration-500"
                                    style={{ width: `${stats.completion}%` }}
                                ></div>
                            </div>
                            <div className="flex justify-between mt-2 text-sm text-text-secondary">
                                <span>{stats.completed} of {stats.total} tasks completed</span>
                                <span>{stats.completion}%</span>
                            </div>
                        </div>

                        {/* Desktop Kanban Board */}
                        <div
                            className={`hidden md:flex bg-surface-dark border border-border-dark rounded-xl shadow-xl overflow-hidden flex-col ${projectTasks.length > 0 ? 'min-h-[320px] max-h-[70vh]' : 'min-h-[220px] max-h-[50vh]'}`}
                        >
                            <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface shrink-0">
                                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary">view_kanban</span>
                                    My Tasks Board
                                </h2>
                            </div>

                            <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
                                <DndContext onDragEnd={(event) => {
                                    const { active, over } = event;
                                    if (!over) return;

                                    const taskId = active.id;
                                    const newStatus = over.data.current?.status;
                                    const task = projectTasks.find(t => t.id === taskId);

                                    if (task && newStatus && task.status !== newStatus) {
                                        if (task.status === 'COMPLETED') {
                                            setConfirmModal({
                                                show: true,
                                                title: 'Reopen Task?',
                                                message: 'This task is already approved and completed. Are you sure you want to reopen it?',
                                                type: 'primary',
                                                onConfirm: () => {
                                                    handleTaskStatusChange(taskId, newStatus);
                                                    setConfirmModal({ ...confirmModal, show: false });
                                                }
                                            });
                                            return;
                                        }
                                        handleTaskStatusChange(taskId, newStatus);
                                    }
                                }}>
                                    <div className="flex gap-6 h-full min-w-[900px]">
                                        {/* New / Not Started */}
                                        <KanbanColumn
                                            id="col-new"
                                            title="New"
                                            status="NOT_STARTED"
                                            color="border-t-blue-500"
                                            tasks={projectTasks.filter(t => t.status === 'NOT_STARTED')}
                                            onTaskClick={(t) => { }}
                                        />

                                        {/* In Progress */}
                                        <KanbanColumn
                                            id="col-progress"
                                            title="In Progress"
                                            status="IN_PROGRESS"
                                            color="border-t-amber-500"
                                            tasks={projectTasks.filter(t => t.status === 'IN_PROGRESS')}
                                            onTaskClick={(t) => { }}
                                        />

                                        {/* Ready for Approval / Closed */}
                                        <KanbanColumn
                                            id="col-review"
                                            title="Ready for Review"
                                            status="WAITING_APPROVAL"
                                            color="border-t-purple-500"
                                            tasks={projectTasks.filter(t => t.status === 'WAITING_APPROVAL')}
                                            onTaskClick={(t) => { }}
                                        />

                                        {/* Completed (Read Only/Reference) */}
                                        <KanbanColumn
                                            id="col-done"
                                            title="Approved / Closed"
                                            status="COMPLETED"
                                            color="border-t-green-500"
                                            tasks={projectTasks.filter(t => t.status === 'COMPLETED')}
                                            onTaskClick={(t) => { }}
                                        />
                                    </div>
                                </DndContext>
                            </div>
                        </div>

                        {/* Mobile Status Tabs + List */}
                        <div className="md:hidden bg-surface-dark border border-border-dark rounded-xl shadow-xl mt-6">
                            <div className="px-4 py-3 border-b border-border-dark bg-gradient-surface">
                                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary text-sm">view_kanban</span>
                                    My Tasks
                                </h2>
                            </div>
                            <div className="px-4 pt-3 flex gap-2 overflow-x-auto custom-scrollbar">
                                {mobileTabs.map((tab) => (
                                    <button
                                        key={tab.key}
                                        type="button"
                                        onClick={() => setMobileStatus(tab.key)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${mobileStatus === tab.key
                                            ? 'bg-primary text-white border-primary'
                                            : 'bg-background-dark text-text-secondary border-border-dark'}`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                            <div className="p-4 flex flex-col gap-3">
                                {projectTasks.filter(t => t.status === mobileStatus).length === 0 && (
                                    <p className="text-text-secondary text-xs text-center py-4">No tasks in this stage.</p>
                                )}
                                {projectTasks
                                    .filter(t => t.status === mobileStatus)
                                    .map((task) => (
                                        <div
                                            key={task.id}
                                            className="bg-background-dark/60 border border-border-dark rounded-lg p-3 flex flex-col gap-2"
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-mono text-primary">
                                                        {task.projectCode || 'Task'}
                                                    </span>
                                                    <span className="text-sm font-semibold text-white line-clamp-2">
                                                        {task.title}
                                                    </span>
                                                </div>
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/40 text-text-secondary uppercase">
                                                    {task.status.replace('_', ' ')}
                                                </span>
                                            </div>
                                            {task.description && (
                                                <p className="text-[11px] text-text-secondary line-clamp-2">
                                                    {task.description}
                                                </p>
                                            )}
                                            <div className="flex items-center justify-end gap-2 pt-1">
                                                <button
                                                    type="button"
                                                    onClick={() => handleMobileAdvance(task)}
                                                    disabled={!nextStatusMap[task.status]}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    {nextStatusMap[task.status] ? 'Move to Next Stage' : 'Completed'}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        </div>

                        {/* Attachments Section (moved below My Tasks Board) */}
                        <div className="bg-surface-dark border border-border-dark rounded-xl shadow-xl overflow-hidden mt-8">
                            <div
                                className="px-6 py-4 border-b border-border-dark bg-gradient-surface flex items-center justify-between cursor-pointer"
                                onClick={() => setIsAttachmentsExpanded(!isAttachmentsExpanded)}
                            >
                                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary">attach_file</span>
                                    Attachments ({selectedProject.attachments?.length || 0})
                                </h2>
                                <span className={`material-symbols-outlined text-text-secondary transition-transform ${isAttachmentsExpanded ? 'rotate-180' : ''}`}>expand_more</span>
                            </div>

                            {isAttachmentsExpanded && (
                                <div className="p-6">
                                    {/* List */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                        {selectedProject.attachments?.map((file, idx) => (
                                            <div key={idx} className="flex items-center gap-3 p-3 bg-background-dark/50 border border-border-dark rounded-lg hover:bg-background-dark transition-colors group">
                                                <div className="size-10 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                                                    <span className="material-symbols-outlined text-xl">description</span>
                                                </div>
                                                <a href={`/api${file.url}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 hover:text-primary transition-colors">
                                                    <p className="text-white text-sm font-medium truncate">{file.name}</p>
                                                    <p className="text-text-secondary text-xs">{new Date(file.uploadedAt).toLocaleDateString()}</p>
                                                </a>
                                                <a href={`/api${file.url}`} target="_blank" rel="noreferrer" className="text-text-secondary hover:text-white p-2" title="Open">
                                                    <span className="material-symbols-outlined">open_in_new</span>
                                                </a>
                                            </div>
                                        ))}
                                        {(!selectedProject.attachments || selectedProject.attachments.length === 0) && (
                                            <div className="col-span-full py-4 text-center text-text-secondary text-sm">
                                                No attachments yet.
                                            </div>
                                        )}
                                    </div>

                                    {/* Upload Form */}
                                    <div className="border-t border-border-dark pt-6">
                                        <h4 className="text-white text-sm font-medium mb-3">Upload New Document</h4>
                                        <div className="flex gap-2 mb-3">
                                            <input
                                                type="text"
                                                placeholder="Document Name (e.g., Project Plan v1)"
                                                className="flex-1 bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                                value={attachmentName}
                                                onChange={(e) => setAttachmentName(e.target.value)}
                                            />
                                        </div>
                                        <label className={`block w-full border-2 border-dashed border-border-dark rounded-xl p-6 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all group ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                                            <input
                                                type="file"
                                                multiple
                                                className="hidden"
                                                onChange={handleUploadAttachment}
                                                disabled={isUploading}
                                            />
                                            <div className="flex flex-col items-center gap-1">
                                                <span className="material-symbols-outlined text-text-secondary group-hover:text-primary text-2xl">upload_file</span>
                                                <p className="text-sm font-medium text-white">Click to select files</p>
                                            </div>
                                        </label>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </InternLayout>
        );
    }

    // Projects List View
    return (
        <InternLayout currentPage="projects">
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
                                <span className="ml-2 text-white text-sm font-medium">My Projects</span>
                            </li>
                        </ol>
                    </nav>

                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                        <div>
                            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">My Projects</h1>
                            <p className="text-text-secondary text-lg">View your assigned projects and track progress.</p>
                        </div>
                    </div>

                    {loading && (
                        <div className="bg-surface-dark border border-border-dark rounded-xl p-8 text-center">
                            <p className="text-text-secondary">Loading projects...</p>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-6">
                            {error}
                        </div>
                    )}

                    {!loading && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {projects.map((project) => {
                                const stats = getProjectStats(project.id);
                                return (
                                    <div
                                        key={project.id}
                                        onClick={() => setSelectedProject(project)}
                                        className="bg-surface-dark border border-border-dark rounded-xl shadow-xl overflow-hidden hover:border-primary/50 hover:shadow-primary/10 transition-all cursor-pointer group"
                                    >
                                        <div className="p-6">
                                            <div className="flex items-center justify-between mb-3">
                                                <span
                                                    className={`px-2 py-1 text-xs font-medium rounded-full ${project.status === 'ACTIVE'
                                                        ? 'bg-green-500/20 text-green-400'
                                                        : 'bg-blue-500/20 text-blue-400'
                                                        }`}
                                                >
                                                    {project.status}
                                                </span>
                                                <span className="material-symbols-outlined text-text-secondary group-hover:text-primary transition-colors">
                                                    arrow_forward
                                                </span>
                                            </div>
                                            <h3 className="text-primary font-bold text-lg mb-2 group-hover:text-white transition-colors font-mono">
                                                {project.projectCode || 'No ID'}
                                            </h3>
                                            <p className="text-text-secondary text-sm line-clamp-2 mb-4">
                                                {project.description || 'No description'}
                                            </p>

                                            {/* Progress Bar */}
                                            <div className="mb-3">
                                                <div className="flex justify-between text-xs text-text-secondary mb-1">
                                                    <span>My Progress</span>
                                                    <span>{stats.completion}%</span>
                                                </div>
                                                <div className="h-2 bg-background-dark rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-gradient-primary transition-all"
                                                        style={{ width: `${stats.completion}%` }}
                                                    ></div>
                                                </div>
                                            </div>

                                            {/* Stats */}
                                            <div className="flex items-center gap-4 text-xs text-text-secondary">
                                                <span className="flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-sm">task_alt</span>
                                                    {stats.total} tasks
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-sm text-green-500">check_circle</span>
                                                    {stats.completed} done
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {projects.length === 0 && (
                                <div className="col-span-full bg-surface-dark border border-border-dark rounded-xl p-12 text-center">
                                    <span className="material-symbols-outlined text-4xl text-text-secondary mb-4">folder_off</span>
                                    <p className="text-text-secondary">No projects assigned yet.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Notification Toast */}
            {notification && (
                <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[10000] animate-in fade-in zoom-in duration-300">
                    <div className={`bg-[#0a0f1d] border ${notification.type === 'error' ? 'border-red-500/50' : 'border-slate-800'} rounded-2xl shadow-2xl p-6 flex flex-col items-center gap-3 min-w-[200px]`}>
                        <div className={`size-12 rounded-full flex items-center justify-center ${notification.type === 'error' ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                            <span className="material-symbols-outlined text-3xl">
                                {notification.type === 'error' ? 'error' : 'check_circle'}
                            </span>
                        </div>
                        <p className="text-white font-medium text-center">{notification.message}</p>
                        <button
                            onClick={() => setNotification(null)}
                            className="mt-2 px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )}
            {notification && (
                <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[9999] animate-in fade-in duration-300"
                    onClick={() => setNotification(null)}
                />
            )}
            {/* Confirmation Modal */}
            {confirmModal.show && (
                <div className="fixed inset-0 z-[10001] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmModal({ ...confirmModal, show: false })}></div>
                    <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-4 mb-6">
                            <div className={`size-12 rounded-full flex items-center justify-center shrink-0 ${confirmModal.type === 'danger' ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'
                                }`}>
                                <span className="material-symbols-outlined text-3xl">
                                    {confirmModal.type === 'danger' ? 'warning' : 'help_outline'}
                                </span>
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white">{confirmModal.title}</h3>
                                <p className="text-text-secondary mt-1 text-sm">{confirmModal.message}</p>
                            </div>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setConfirmModal({ ...confirmModal, show: false })}
                                className="px-5 py-2 rounded-xl border border-border-dark text-white font-medium hover:bg-white/5 transition-colors text-sm"
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
        </InternLayout>
    );
}
