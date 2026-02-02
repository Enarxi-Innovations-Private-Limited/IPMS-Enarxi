import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import api from '../../services/api.js';
import EmployeeLayout from '../common/EmployeeLayout.jsx';
import { getCurrentUser } from '../../services/authService.js';

// Kanban Components
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
                {/* Placeholder for Avatar if needed, using user initial or generic */}
                <div className="size-6 rounded-full bg-gradient-to-br from-gray-700 to-gray-600 flex items-center justify-center text-[10px] text-white font-bold">
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

export default function EmployeeProjectsPage() {
    const navigate = useNavigate();
    const [projects, setProjects] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedProject, setSelectedProject] = useState(null);
    const user = getCurrentUser();

    // Attachments State
    const [isAttachmentsExpanded, setIsAttachmentsExpanded] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [attachmentName, setAttachmentName] = useState('');

    // Task Status State
    const [statusUpdate, setStatusUpdate] = useState({});

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [projRes, taskRes] = await Promise.all([
                api.get('/projects'),
                api.get('/tasks'),
            ]);
            setProjects(projRes.data);
            setTasks(taskRes.data);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load projects');
        } finally {
            setLoading(false);
        }
    };

    const getProjectTasks = (projectId) => {
        // Convert to string for comparison since MongoDB ObjectIds may not match directly
        // Filter by projectId AND assigneeId (only show tasks assigned to current user)
        return tasks.filter((t) => String(t.projectId) === String(projectId) && String(t.assigneeId) === String(user?.id));
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

    const handleUpdateProjectStatus = async (status) => {
        try {
            await api.put(`/projects/${selectedProject.id}/status`, { status });
            setSelectedProject({ ...selectedProject, status });
            // Also update the project in the main list
            setProjects(projects.map(p => p.id === selectedProject.id ? { ...p, status } : p));
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update project status');
        }
    };

    const handleTaskStatusChange = async (taskId, status) => {
        try {
            await api.put(`/tasks/${taskId}/status`, { status });
            setStatusUpdate({ ...statusUpdate, [taskId]: status });
            // Refresh data to keep stats in sync
            await loadData();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update task status');
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
            alert('Attachments uploaded successfully');
        } catch (err) {
            console.error(err);
            alert('Failed to upload attachments');
        } finally {
            setIsUploading(false);
            e.target.value = null;
            setAttachmentName('');
        }
    };

    // Project Detail View
    if (selectedProject) {
        const stats = getProjectStats(selectedProject.id);
        const projectTasks = getProjectTasks(selectedProject.id);

        return (
            <EmployeeLayout currentPage="projects">
                <div className="p-6 lg:px-12 pb-24">
                    <div className="max-w-7xl mx-auto w-full">
                        {/* Breadcrumb */}
                        <nav aria-label="Breadcrumb" className="flex mb-6">
                            <ol className="inline-flex items-center space-x-2">
                                <li>
                                    <button
                                        onClick={() => navigate('/employee')}
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
                                    <div className={`px-4 py-1.5 text-sm font-bold uppercase tracking-wider rounded-full border-none ${selectedProject.status === 'ACTIVE' ? 'bg-green-500/20 text-green-400' :
                                        selectedProject.status === 'COMPLETED' ? 'bg-purple-500/20 text-purple-400' :
                                            selectedProject.status === 'ON_HOLD' ? 'bg-orange-500/20 text-orange-400' :
                                                'bg-blue-500/20 text-blue-400'
                                        }`}>
                                        {selectedProject.status}
                                    </div>
                                </div>
                                <p className="text-text-secondary text-lg">
                                    {selectedProject.description || 'No description provided'}
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedProject(null)}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border-dark text-white font-medium hover:bg-surface-dark transition-colors"
                            >
                                <span className="material-symbols-outlined text-lg">arrow_back</span>
                                Back to Projects
                            </button>
                        </div>

                        {/* Progress Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                            <div className="bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider">Total Tasks</h3>
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
                            <h3 className="text-white font-semibold mb-4">Project Progress</h3>
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

                        {/* Attachments Section */}
                        <div className="bg-surface-dark border border-border-dark rounded-xl shadow-xl overflow-hidden mb-8">
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

                        {/* Kanban Board */}
                        <div className="bg-surface-dark border border-border-dark rounded-xl shadow-xl overflow-hidden h-[calc(100vh-200px)] flex flex-col">
                            <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface">
                                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary">view_kanban</span>
                                    Project Board
                                </h2>
                            </div>

                            <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
                                <DndContext onDragEnd={(event) => {
                                    const { active, over } = event;
                                    if (!over) return;

                                    const taskId = active.id;
                                    const newStatus = over.data.current?.status;
                                    const task = projectTasks.find(t => t.id === taskId); // Changed 'tasks' to 'projectTasks'

                                    if (task && newStatus && task.status !== newStatus) {
                                        // Logic handling:
                                        // Employees can move NOT_STARTED -> IN_PROGRESS -> WAITING_APPROVAL
                                        // They cannot move to COMPLETED directly (Manager does that)
                                        // They cannot move back from COMPLETED (usually)

                                        if (task.status === 'COMPLETED') {
                                            if (!window.confirm("This task is already approved and completed. Are you sure you want to reopen it?")) return;
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
                                            onTaskClick={(t) => { }} // Could open detail
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
                    </div>
                </div>
            </EmployeeLayout >
        );
    }

    // Projects List View
    return (
        <EmployeeLayout currentPage="projects">
            <div className="p-6 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    {/* Breadcrumb */}
                    <nav aria-label="Breadcrumb" className="flex mb-6">
                        <ol className="inline-flex items-center space-x-2">
                            <li>
                                <button
                                    onClick={() => navigate('/employee')}
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
                            <p className="text-text-secondary text-lg">View and manage your assigned projects.</p>
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
                                                    <span>Progress</span>
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
        </EmployeeLayout>
    );
}
