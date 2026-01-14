import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api.js';
import SuperUserLayout from '../common/SuperUserLayout.jsx';

export default function SuperUserProjectsPage() {
    const navigate = useNavigate();
    const [projects, setProjects] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('ALL');
    const [filterDepartment, setFilterDepartment] = useState('ALL');

    // Modal states
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [showTeamModal, setShowTeamModal] = useState(false);
    const [selectedProject, setSelectedProject] = useState(null);
    const [projectTasks, setProjectTasks] = useState([]);
    const [loadingTasks, setLoadingTasks] = useState(false);

    // Form states
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState('');
    const [managers, setManagers] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [editFiles, setEditFiles] = useState([]);
    const [existingAttachments, setExistingAttachments] = useState([]);
    const [nextProjectCode, setNextProjectCode] = useState('');
    const [createForm, setCreateForm] = useState({
        name: '',
        description: '',
        department: 'SOFTWARE',
        managerId: '',
        startDate: '',
        endDate: '',
        budget: '',
        templateName: '',
    });
    const [editForm, setEditForm] = useState({
        name: '',
        description: '',
        department: 'SOFTWARE',
        status: 'PLANNING',
        startDate: '',
        endDate: '',
    });

    const formatBudgetDisplay = (val) => {
        if (!val) return '';
        const parts = val.toString().split('.');
        parts[0] = Number(parts[0]).toLocaleString('en-IN');
        return parts.join('.');
    };

    useEffect(() => {
        loadProjects();
        loadUsers();
    }, []);

    const loadProjects = async () => {
        try {
            setLoading(true);
            const res = await api.get('/projects');
            setProjects(res.data);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load projects');
        } finally {
            setLoading(false);
        }
    };

    const loadUsers = async () => {
        try {
            const res = await api.get('/users');
            setUsers(res.data);
            // Filter managers for the manager dropdown
            setManagers(res.data.filter(u => u.role === 'MANAGER'));
        } catch (err) {
            console.error('Failed to load users:', err);
        }
    };

    const loadTemplates = async (department) => {
        try {
            const res = await api.get(`/task-templates/${department}`);
            setTemplates(res.data);
        } catch (err) {
            console.error('Failed to load templates:', err);
            setTemplates([]);
        }
    };

    const loadProjectTasks = async (projectId) => {
        try {
            setLoadingTasks(true);
            const res = await api.get(`/projects/${projectId}/tasks`);
            setProjectTasks(res.data);
        } catch (err) {
            console.error('Failed to load tasks:', err);
        } finally {
            setLoadingTasks(false);
        }
    };

    const handleCreateProject = async (e) => {
        e.preventDefault();
        try {
            setIsSubmitting(true);
            setFormError('');
            const res = await api.post('/projects', {
                ...createForm,
                budget: createForm.budget ? parseFloat(createForm.budget) : 0,
            });

            // Upload attachments if any files selected
            if (selectedFiles.length > 0 && res.data.id) {
                const formData = new FormData();
                selectedFiles.forEach(file => {
                    formData.append('attachments', file);
                });
                try {
                    await api.post(`/projects/${res.data.id}/attachments`, formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                } catch (uploadErr) {
                    console.error('Failed to upload attachments:', uploadErr);
                }
            }

            setShowCreateModal(false);
            setCreateForm({ name: '', description: '', department: 'SOFTWARE', managerId: '', startDate: '', endDate: '', budget: '', templateName: '' });
            setTemplates([]);
            setSelectedFiles([]);
            await loadProjects();
        } catch (err) {
            setFormError(err.response?.data?.message || 'Failed to create project');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEditProject = async (e) => {
        e.preventDefault();
        if (!selectedProject) return;
        try {
            setIsSubmitting(true);
            setFormError('');
            await api.put(`/projects/${selectedProject.id}`, editForm);

            // Upload new attachments if any
            if (editFiles.length > 0) {
                const formData = new FormData();
                editFiles.forEach(file => {
                    formData.append('attachments', file);
                });
                try {
                    await api.post(`/projects/${selectedProject.id}/attachments`, formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                } catch (uploadErr) {
                    console.error('Failed to upload attachments:', uploadErr);
                }
            }

            setShowEditModal(false);
            setSelectedProject(null);
            setEditFiles([]);
            setExistingAttachments([]);
            await loadProjects();
        } catch (err) {
            setFormError(err.response?.data?.message || 'Failed to update project');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteProject = async () => {
        if (!selectedProject) return;
        try {
            await api.delete(`/projects/${selectedProject.id}`);
            setShowDeleteConfirm(false);
            setSelectedProject(null);
            await loadProjects();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to delete project');
        }
    };

    const handleAssignTeam = async (userId) => {
        if (!selectedProject) return;
        try {
            const currentTeam = selectedProject.teamIds || [];
            const isAssigned = currentTeam.includes(userId);
            const newTeam = isAssigned
                ? currentTeam.filter((id) => id !== userId)
                : [...currentTeam, userId];
            await api.put(`/projects/${selectedProject.id}`, { teamIds: newTeam });
            setSelectedProject({ ...selectedProject, teamIds: newTeam });
            await loadProjects();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update team');
        }
    };

    const handleTaskApproval = async (taskId, status) => {
        try {
            await api.put(`/tasks/${taskId}`, { status });
            // Update local state
            setProjectTasks(projectTasks.map(t => t.id === taskId ? { ...t, status } : t));
            // Reload projects to update progress stats in the background
            loadProjects();
        } catch (err) {
            console.error('Failed to update task status:', err);
            // Optionally set error
        }
    };

    const handleProjectApproval = async (projectId, status) => {
        try {
            await api.put(`/projects/${projectId}/status`, { status });
            // Update local state
            setProjects(projects.map(p => p.id === projectId ? { ...p, status } : p));
            // Close details modal if open
            if (showDetailsModal && selectedProject?.id === projectId) {
                setSelectedProject({ ...selectedProject, status });
            }
        } catch (err) {
            console.error('Failed to update project status:', err);
        }
    };

    const openEditModal = async (project) => {
        setSelectedProject(project);
        setEditForm({
            name: project.name,
            description: project.description || '',
            department: project.department || 'SOFTWARE',
            status: project.status,
            deadline: project.deadline || '',
        });
        setFormError('');
        setEditFiles([]);

        // Load existing attachments from project details
        try {
            const res = await api.get(`/projects/${project.id}`);
            setExistingAttachments(res.data.attachments || []);
        } catch (err) {
            setExistingAttachments([]);
        }

        setShowEditModal(true);
    };

    const openCreateModal = async () => {
        try {
            const res = await api.get('/projects/next-code');
            setNextProjectCode(res.data.nextCode);
        } catch (err) {
            console.error('Failed to get next project code:', err);
            setNextProjectCode('');
        }
        setShowCreateModal(true);
    };

    const openDetailsModal = async (project) => {
        setSelectedProject(project);
        setShowDetailsModal(true);
        await loadProjectTasks(project.id);
    };

    const openTeamModal = (project) => {
        setSelectedProject(project);
        setShowTeamModal(true);
    };

    // Filter projects
    const filteredProjects = projects.filter((p) => {
        const matchesSearch = searchQuery === '' ||
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
        const matchesStatus = filterStatus === 'ALL' || p.status === filterStatus;
        const matchesDepartment = filterDepartment === 'ALL' || p.department === filterDepartment;
        return matchesSearch && matchesStatus && matchesDepartment;
    });

    const getStatusColor = (status) => {
        switch (status) {
            case 'ACTIVE': return 'bg-green-500/20 text-green-400';
            case 'PLANNING': return 'bg-blue-500/20 text-blue-400';
            case 'ON_HOLD': return 'bg-amber-500/20 text-amber-400';
            case 'WAITING_APPROVAL': return 'bg-yellow-500/20 text-yellow-400';
            case 'COMPLETED': return 'bg-purple-500/20 text-purple-400';
            default: return 'bg-gray-500/20 text-gray-400';
        }
    };

    const getTaskStats = (project) => {
        const total = project.taskCount || 0;
        const completed = project.completedTaskCount || 0;
        const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
        return { total, completed, progress };
    };

    const getTeamMembers = (project) => {
        if (!project.teamIds || project.teamIds.length === 0) return [];
        return users.filter((u) => project.teamIds.includes(u.id));
    };

    return (
        <SuperUserLayout currentPage="projects">
            <div className="p-6 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    {/* Breadcrumb */}
                    <nav aria-label="Breadcrumb" className="flex mb-6">
                        <ol className="inline-flex items-center space-x-2">
                            <li>
                                <button onClick={() => navigate('/super')} className="text-text-secondary hover:text-white text-sm font-medium transition-colors">Dashboard</button>
                            </li>
                            <li className="flex items-center">
                                <span className="material-symbols-outlined text-text-secondary text-base">chevron_right</span>
                                <span className="ml-2 text-white text-sm font-medium">Projects</span>
                            </li>
                        </ol>
                    </nav>

                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
                        <div>
                            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">Projects</h1>
                            <p className="text-text-secondary text-lg">Manage all projects and their teams.</p>
                        </div>
                        <button onClick={openCreateModal} className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-gradient-primary text-white font-bold shadow-lg shadow-blue-900/50 hover:shadow-blue-900/70 hover:scale-[1.02] transition-all">
                            <span className="material-symbols-outlined text-lg">add</span>
                            New Project
                        </button>
                    </div>

                    {/* Search and Filter */}
                    <div className="bg-surface-dark border border-border-dark rounded-xl p-4 mb-6 flex flex-col md:flex-row gap-4">
                        <div className="flex-1 relative">
                            <span className="absolute inset-y-0 left-3 flex items-center text-text-secondary">
                                <span className="material-symbols-outlined text-xl">search</span>
                            </span>
                            <input type="text" placeholder="Search projects..." className="w-full pl-10 pr-4 py-2.5 bg-background-dark border border-border-dark rounded-lg text-white placeholder-text-secondary/50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                        </div>
                        <select className="px-4 py-2.5 bg-background-dark border border-border-dark rounded-lg text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none cursor-pointer" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                            <option value="ALL">All Status</option>
                            <option value="PLANNING">Planning</option>
                            <option value="ACTIVE">Active</option>
                            <option value="ON_HOLD">On Hold</option>
                            <option value="WAITING_APPROVAL">⏳ Awaiting Approval</option>
                            <option value="COMPLETED">Completed</option>
                        </select>
                        <select className="px-4 py-2.5 bg-background-dark border border-border-dark rounded-lg text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none cursor-pointer" value={filterDepartment} onChange={(e) => setFilterDepartment(e.target.value)}>
                            <option value="ALL">All Departments</option>
                            <option value="SOFTWARE">Software</option>
                            <option value="HARDWARE">Hardware</option>
                        </select>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-6">
                            {error}
                            <button onClick={() => setError('')} className="float-right">×</button>
                        </div>
                    )}

                    {/* Projects Grid */}
                    {loading ? (
                        <div className="bg-surface-dark border border-border-dark rounded-xl p-8 text-center">
                            <p className="text-text-secondary">Loading projects...</p>
                        </div>
                    ) : filteredProjects.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {filteredProjects.map((project) => {
                                const stats = getTaskStats(project);
                                const team = getTeamMembers(project);
                                return (
                                    <div key={project.id} className="bg-surface-dark border border-border-dark rounded-xl overflow-hidden hover:border-primary/30 transition-all group">
                                        {/* Header */}
                                        <div className="p-5 border-b border-border-dark">
                                            <div className="flex items-start justify-between mb-1">
                                                <h3 className="text-white font-semibold text-lg line-clamp-1">{project.name}</h3>
                                                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(project.status)}`}>
                                                    {project.status.replace('_', ' ')}
                                                </span>
                                            </div>
                                            {project.projectCode && (
                                                <p className="text-primary text-xs font-mono mb-2">{project.projectCode}</p>
                                            )}
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${project.department === 'SOFTWARE' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-orange-500/20 text-orange-400'}`}>
                                                    {project.department || 'SOFTWARE'}
                                                </span>
                                            </div>
                                            <p className="text-text-secondary text-sm line-clamp-2 min-h-[40px]">{project.description || 'No description'}</p>
                                        </div>

                                        {/* Progress */}
                                        <div className="px-5 py-4 bg-background-dark/30">
                                            <div className="flex justify-between text-sm mb-2">
                                                <span className="text-text-secondary">Progress</span>
                                                <span className="text-white font-medium">{stats.completed}/{stats.total} tasks</span>
                                            </div>
                                            <div className="w-full h-2 bg-background-dark rounded-full overflow-hidden">
                                                <div className="h-full bg-gradient-primary rounded-full transition-all" style={{ width: `${stats.progress}%` }}></div>
                                            </div>
                                        </div>

                                        {/* Team */}
                                        <div className="px-5 py-3 border-t border-border-dark flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="text-text-secondary text-xs">Team:</span>
                                                {team.length > 0 ? (
                                                    <div className="flex -space-x-2">
                                                        {team.slice(0, 3).map((member) => (
                                                            <div key={member.id} className="size-7 rounded-full bg-gradient-primary flex items-center justify-center border-2 border-surface-dark" title={member.name}>
                                                                <span className="text-white text-xs font-medium">{member.name.charAt(0)}</span>
                                                            </div>
                                                        ))}
                                                        {team.length > 3 && (
                                                            <div className="size-7 rounded-full bg-surface-dark flex items-center justify-center border-2 border-border-dark">
                                                                <span className="text-text-secondary text-xs">+{team.length - 3}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-text-secondary text-xs">No team assigned</span>
                                                )}
                                            </div>
                                            <button onClick={() => openTeamModal(project)} className="text-primary hover:text-white text-xs font-medium transition-colors">Manage</button>
                                        </div>

                                        {/* Actions */}
                                        <div className="px-5 py-3 border-t border-border-dark flex gap-2">
                                            {project.status === 'WAITING_APPROVAL' && (
                                                <>
                                                    <button
                                                        onClick={() => handleProjectApproval(project.id, 'COMPLETED')}
                                                        className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-green-500 text-white text-sm font-bold hover:bg-green-400 transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-base">check</span>Approve
                                                    </button>
                                                    <button
                                                        onClick={() => handleProjectApproval(project.id, 'ACTIVE')}
                                                        className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-base">close</span>Reject
                                                    </button>
                                                </>
                                            )}
                                            <button onClick={() => openDetailsModal(project)} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors">
                                                <span className="material-symbols-outlined text-base">visibility</span>View
                                            </button>
                                            <button onClick={() => openEditModal(project)} className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-amber-500/10 text-amber-400 text-sm font-medium hover:bg-amber-500/20 transition-colors">
                                                <span className="material-symbols-outlined text-base">edit</span>
                                            </button>
                                            <button onClick={() => { setSelectedProject(project); setShowDeleteConfirm(true); }} className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors">
                                                <span className="material-symbols-outlined text-base">delete</span>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="bg-surface-dark border border-border-dark rounded-xl p-12 text-center">
                            <span className="material-symbols-outlined text-5xl text-text-secondary mb-4">folder_off</span>
                            <h3 className="text-white text-lg font-semibold mb-2">No Projects Found</h3>
                            <p className="text-text-secondary mb-4">Create your first project to get started.</p>
                            <button onClick={openCreateModal} className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-gradient-primary text-white font-bold">
                                <span className="material-symbols-outlined text-lg">add</span>Create Project
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Create Project Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowCreateModal(false); setTemplates([]); }}></div>
                    <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface shrink-0">
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">add_circle</span>Create New Project
                            </h2>
                        </div>
                        <form onSubmit={handleCreateProject} className="p-6 space-y-4 overflow-y-auto flex-1">
                            {/* Project ID Preview */}
                            {nextProjectCode && (
                                <div className="bg-primary/10 border border-primary/30 rounded-lg px-4 py-3 flex items-center gap-3">
                                    <span className="material-symbols-outlined text-primary">badge</span>
                                    <div>
                                        <p className="text-xs text-text-secondary uppercase tracking-wider">Project ID</p>
                                        <p className="text-primary font-bold font-mono text-lg">{nextProjectCode}</p>
                                    </div>
                                </div>
                            )}

                            {/* Project Name */}
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Project Name *</label>
                                <input type="text" required className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white placeholder-text-secondary/50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none" placeholder="Enter project name" value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Description</label>
                                <textarea className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white placeholder-text-secondary/50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none" rows={2} placeholder="Enter project description" value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}></textarea>
                            </div>

                            {/* Manager & Department */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Department *</label>
                                    <select className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none cursor-pointer" value={createForm.department} onChange={(e) => {
                                        setCreateForm({ ...createForm, department: e.target.value, templateName: '', managerId: '' });
                                        loadTemplates(e.target.value);
                                    }}>
                                        <option value="SOFTWARE">Software (IT)</option>
                                        <option value="HARDWARE">Hardware</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Assign Manager</label>
                                    <select className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none cursor-pointer" value={createForm.managerId} onChange={(e) => setCreateForm({ ...createForm, managerId: e.target.value })}>
                                        <option value="">Select Manager</option>
                                        {managers.filter(m => !createForm.department || m.department === createForm.department || m.department === 'ALL').map(m => (
                                            <option key={m.id} value={m.id}>{m.name} ({m.department})</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Task Template */}
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Task Template</label>
                                <select className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none cursor-pointer" value={createForm.templateName} onChange={(e) => setCreateForm({ ...createForm, templateName: e.target.value })}>
                                    <option value="">No Template (Create tasks manually)</option>
                                    {templates.map(t => (
                                        <option key={t.name} value={t.name}>{t.name} ({t.taskCount} tasks)</option>
                                    ))}
                                </select>
                            </div>

                            {/* Template Preview */}
                            {createForm.templateName && templates.find(t => t.name === createForm.templateName) && (
                                <div className="bg-background-dark/50 border border-border-dark rounded-lg p-4">
                                    <h4 className="text-xs font-medium uppercase tracking-wider text-text-secondary mb-3 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-sm">task_alt</span>Tasks to be Created
                                    </h4>
                                    <div className="grid grid-cols-1 gap-1 max-h-40 overflow-y-auto">
                                        {templates.find(t => t.name === createForm.templateName)?.tasks.map((task, idx) => (
                                            <div key={idx} className="flex items-center gap-2 text-sm">
                                                <span className="text-primary text-xs font-bold">{task.order}.</span>
                                                <span className="text-white">{task.title}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Timeline */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Start Date</label>
                                    <input
                                        type="date"
                                        min={new Date().toISOString().split('T')[0]}
                                        className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                        value={createForm.startDate}
                                        onChange={(e) => setCreateForm({ ...createForm, startDate: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">End Date</label>
                                    <input
                                        type="date"
                                        min={new Date().toISOString().split('T')[0]}
                                        className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                        value={createForm.endDate}
                                        onChange={(e) => setCreateForm({ ...createForm, endDate: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* Budget */}
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Budget (₹)</label>
                                <input
                                    type="text"
                                    className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white placeholder-text-secondary/50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                    placeholder="Enter budget amount"
                                    value={formatBudgetDisplay(createForm.budget)}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/,/g, '');
                                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                            setCreateForm({ ...createForm, budget: val });
                                        }
                                    }}
                                />
                            </div>

                            {/* Attachments */}
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Attachments (PRDs, Documents)</label>
                                <div className="border-2 border-dashed border-border-dark rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                                    <span className="material-symbols-outlined text-3xl text-text-secondary mb-2">cloud_upload</span>
                                    <p className="text-text-secondary text-sm mb-2">Drag & drop files here or click to browse</p>
                                    <input
                                        type="file"
                                        multiple
                                        className="hidden"
                                        id="project-attachments"
                                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.png,.jpg,.jpeg,.zip,.rar"
                                        onChange={(e) => {
                                            const files = Array.from(e.target.files);
                                            setSelectedFiles(prev => [...prev, ...files]);
                                            e.target.value = ''; // Reset input
                                        }}
                                    />
                                    <label htmlFor="project-attachments" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-background-dark border border-border-dark text-white text-sm font-medium hover:bg-surface-dark cursor-pointer transition-colors">
                                        <span className="material-symbols-outlined text-base">attach_file</span>
                                        Choose Files
                                    </label>
                                    <p className="text-text-secondary/50 text-xs mt-2">Supported: PDF, Word, Excel, PowerPoint, Images, Archives (Max 50MB)</p>
                                </div>

                                {/* Selected Files List */}
                                {selectedFiles.length > 0 && (
                                    <div className="mt-3 space-y-2">
                                        {selectedFiles.map((file, idx) => (
                                            <div key={idx} className="flex items-center justify-between bg-background-dark/50 px-3 py-2 rounded-lg">
                                                <div className="flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-primary text-base">description</span>
                                                    <span className="text-white text-sm truncate max-w-[200px]">{file.name}</span>
                                                    <span className="text-text-secondary text-xs">({(file.size / 1024).toFixed(1)} KB)</span>
                                                </div>
                                                <button type="button" onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-300">
                                                    <span className="material-symbols-outlined text-base">close</span>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>


                            {formError && <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm">{formError}</div>}

                            <div className="flex justify-end gap-3 pt-4">
                                <button type="button" onClick={() => { setShowCreateModal(false); setTemplates([]); }} className="px-4 py-2 rounded-lg border border-border-dark text-white font-medium hover:bg-background-dark transition-colors" disabled={isSubmitting}>Cancel</button>
                                <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-gradient-primary text-white font-bold shadow-lg shadow-blue-900/50 hover:shadow-blue-900/70 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                                    {isSubmitting ? <><span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>Creating...</> : <><span className="material-symbols-outlined text-lg">check</span>Create Project</>}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Project Modal */}
            {showEditModal && selectedProject && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowEditModal(false)}></div>
                    <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
                        <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface">
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-amber-400">edit</span>Edit Project
                            </h2>
                        </div>
                        <form onSubmit={handleEditProject} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Project Name *</label>
                                <input type="text" required className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white placeholder-text-secondary/50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Description</label>
                                <textarea className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white placeholder-text-secondary/50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none" rows={3} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}></textarea>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Department</label>
                                    <select className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none cursor-pointer" value={editForm.department} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}>
                                        <option value="SOFTWARE">Software</option>
                                        <option value="HARDWARE">Hardware</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Status</label>
                                    <select className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none cursor-pointer" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                                        <option value="PLANNING">Planning</option>
                                        <option value="ACTIVE">Active</option>
                                        <option value="ON_HOLD">On Hold</option>
                                        <option value="COMPLETED">Completed</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2 flex items-center gap-2">
                                    Deadline
                                    {selectedProject.deadline && (
                                        <span className="text-amber-400" title="Deadline is locked once set">
                                            <span className="material-symbols-outlined text-sm">lock</span>
                                        </span>
                                    )}
                                </label>
                                <input
                                    type="date"
                                    min={new Date().toISOString().split('T')[0]}
                                    disabled={!!selectedProject.deadline}
                                    className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                    value={editForm.deadline}
                                    onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })}
                                />
                                {selectedProject.deadline && (
                                    <p className="text-text-secondary text-xs mt-1">⚠️ Deadline cannot be changed once set</p>
                                )}
                            </div>

                            {/* Attachments */}
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Attachments</label>

                                {/* Existing Attachments */}
                                {existingAttachments.length > 0 && (
                                    <div className="mb-3">
                                        <p className="text-text-secondary text-xs mb-2">Existing Files:</p>
                                        <div className="space-y-2">
                                            {existingAttachments.map((att, idx) => (
                                                <div key={idx} className="flex items-center justify-between bg-green-500/10 border border-green-500/30 px-3 py-2 rounded-lg">
                                                    <div className="flex items-center gap-2">
                                                        <span className="material-symbols-outlined text-green-400 text-base">check_circle</span>
                                                        <a href={`http://localhost:5001${att.url}`} target="_blank" rel="noopener noreferrer" className="text-white text-sm hover:text-primary truncate max-w-[200px]">{att.name}</a>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Upload New Files */}
                                <div className="border-2 border-dashed border-border-dark rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
                                    <p className="text-text-secondary text-sm mb-2">Add more files</p>
                                    <input
                                        type="file"
                                        multiple
                                        className="hidden"
                                        id="edit-project-attachments"
                                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.png,.jpg,.jpeg,.zip,.rar"
                                        onChange={(e) => {
                                            const files = Array.from(e.target.files);
                                            setEditFiles(prev => [...prev, ...files]);
                                            e.target.value = '';
                                        }}
                                    />
                                    <label htmlFor="edit-project-attachments" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-background-dark border border-border-dark text-white text-sm font-medium hover:bg-surface-dark cursor-pointer transition-colors">
                                        <span className="material-symbols-outlined text-base">attach_file</span>
                                        Choose Files
                                    </label>
                                </div>

                                {/* New Files to Upload */}
                                {editFiles.length > 0 && (
                                    <div className="mt-3 space-y-2">
                                        <p className="text-text-secondary text-xs">New files to upload:</p>
                                        {editFiles.map((file, idx) => (
                                            <div key={idx} className="flex items-center justify-between bg-background-dark/50 px-3 py-2 rounded-lg">
                                                <div className="flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-primary text-base">description</span>
                                                    <span className="text-white text-sm truncate max-w-[200px]">{file.name}</span>
                                                    <span className="text-text-secondary text-xs">({(file.size / 1024).toFixed(1)} KB)</span>
                                                </div>
                                                <button type="button" onClick={() => setEditFiles(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-300">
                                                    <span className="material-symbols-outlined text-base">close</span>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {formError && <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm">{formError}</div>}
                            <div className="flex justify-end gap-3 pt-4">
                                <button type="button" onClick={() => setShowEditModal(false)} className="px-4 py-2 rounded-lg border border-border-dark text-white font-medium hover:bg-background-dark transition-colors" disabled={isSubmitting}>Cancel</button>
                                <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-amber-500 text-white font-bold hover:bg-amber-600 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                                    {isSubmitting ? <><span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>Saving...</> : <><span className="material-symbols-outlined text-lg">check</span>Save Changes</>}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Project Details Modal */}
            {showDetailsModal && selectedProject && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowDetailsModal(false); setProjectTasks([]); }}></div>
                    <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface shrink-0 flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">folder</span>{selectedProject.name}
                            </h2>
                            <div className="flex items-center gap-3">
                                {selectedProject.budget > 0 && (
                                    <div className="flex items-center gap-1 bg-green-500/10 border border-green-500/20 px-3 py-1 rounded-full">
                                        <span className="material-symbols-outlined text-green-400 text-sm">attach_money</span>
                                        <span className="text-green-400 text-xs font-bold">₹{selectedProject.budget.toLocaleString()}</span>
                                    </div>
                                )}
                                <span className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(selectedProject.status)}`}>{selectedProject.status.replace('_', ' ')}</span>
                            </div>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1">
                            {selectedProject.description && <p className="text-text-secondary mb-4">{selectedProject.description}</p>}

                            {/* Stats */}
                            <div className="grid grid-cols-3 gap-4 mb-6">
                                <div className="bg-background-dark/50 rounded-lg p-4 text-center">
                                    <p className="text-2xl font-bold text-white">{projectTasks.length}</p>
                                    <p className="text-text-secondary text-sm">Total Tasks</p>
                                </div>
                                <div className="bg-background-dark/50 rounded-lg p-4 text-center">
                                    <p className="text-2xl font-bold text-green-400">{projectTasks.filter(t => t.status === 'COMPLETED').length}</p>
                                    <p className="text-text-secondary text-sm">Completed</p>
                                </div>
                                <div className="bg-background-dark/50 rounded-lg p-4 text-center">
                                    <p className="text-2xl font-bold text-blue-400">{projectTasks.filter(t => t.status === 'IN_PROGRESS').length}</p>
                                    <p className="text-text-secondary text-sm">In Progress</p>
                                </div>
                            </div>

                            {/* Team Members */}
                            <div className="mb-6">
                                <h3 className="text-sm font-medium uppercase tracking-wider text-text-secondary mb-3 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-base">group</span>Team Members ({getTeamMembers(selectedProject).length})
                                </h3>
                                {getTeamMembers(selectedProject).length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {getTeamMembers(selectedProject).map((member) => (
                                            <div key={member.id} className="flex items-center gap-2 bg-background-dark/50 px-3 py-2 rounded-lg">
                                                <div className="size-8 rounded-full bg-gradient-primary flex items-center justify-center">
                                                    <span className="text-white text-xs font-medium">{member.name.charAt(0)}</span>
                                                </div>
                                                <div>
                                                    <p className="text-white text-sm font-medium">{member.name}</p>
                                                    <p className="text-text-secondary text-xs">{member.role}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : <p className="text-text-secondary text-sm">No team members assigned.</p>}
                            </div>

                            {/* Attachments */}
                            <div className="mb-6">
                                <h3 className="text-sm font-medium uppercase tracking-wider text-text-secondary mb-3 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-base">attach_file</span>Attachments ({selectedProject.attachments?.length || 0})
                                </h3>
                                {selectedProject.attachments && selectedProject.attachments.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {selectedProject.attachments.map((file, idx) => (
                                            <div key={idx} className="flex items-center gap-3 p-3 bg-black/20 border border-border-dark rounded-lg hover:bg-black/30 transition-colors group">
                                                <div className="size-8 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                                                    <span className="material-symbols-outlined text-lg">description</span>
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-white text-sm truncate">{file.name}</p>
                                                    <p className="text-text-secondary text-xs">{new Date(file.uploadedAt).toLocaleDateString()}</p>
                                                </div>
                                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <a
                                                        href={`http://localhost:5000${file.url}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="p-1.5 text-text-secondary hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                                        title="Preview"
                                                    >
                                                        <span className="material-symbols-outlined text-lg">visibility</span>
                                                    </a>
                                                    <a
                                                        href={`http://localhost:5000${file.url}`}
                                                        download
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="p-1.5 text-primary hover:text-white hover:bg-primary rounded-lg transition-colors"
                                                        title="Download"
                                                    >
                                                        <span className="material-symbols-outlined text-lg">download</span>
                                                    </a>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : <p className="text-text-secondary text-sm">No attachments.</p>}
                            </div>

                            {/* Tasks */}
                            <div>
                                <h3 className="text-sm font-medium uppercase tracking-wider text-text-secondary mb-3 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-base">task_alt</span>Tasks
                                </h3>
                                {loadingTasks ? (
                                    <p className="text-text-secondary text-center py-4">Loading tasks...</p>
                                ) : projectTasks.length > 0 ? (
                                    <div className="space-y-2">
                                        {projectTasks.map((task) => (
                                            <div key={task.id} className={`bg-background-dark/50 border rounded-lg px-4 py-3 flex items-center justify-between ${task.status === 'WAITING_APPROVAL' ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-border-dark'}`}>
                                                <div className="flex-1">
                                                    <p className="text-white font-medium">{task.title}</p>
                                                    <p className="text-text-secondary text-xs">Assigned to: {users.find(u => u.id === task.assigneeId)?.name || 'Unassigned'}</p>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${task.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' :
                                                        task.status === 'IN_PROGRESS' ? 'bg-blue-500/20 text-blue-400' :
                                                            task.status === 'WAITING_APPROVAL' ? 'bg-yellow-500/20 text-yellow-400' :
                                                                'bg-gray-500/20 text-gray-400'
                                                        }`}>
                                                        {task.status.replace('_', ' ')}
                                                    </span>

                                                    {task.status === 'WAITING_APPROVAL' && (
                                                        <div className="flex gap-1">
                                                            <button
                                                                onClick={() => handleTaskApproval(task.id, 'COMPLETED')}
                                                                className="bg-green-500 text-black p-1 rounded shadow-sm hover:bg-green-400 transition-colors"
                                                                title="Approve"
                                                            >
                                                                <span className="material-symbols-outlined text-[14px] block font-bold">check</span>
                                                            </button>
                                                            <button
                                                                onClick={() => handleTaskApproval(task.id, 'IN_PROGRESS')}
                                                                className="bg-red-500 text-white p-1 rounded shadow-sm hover:bg-red-600 transition-colors"
                                                                title="Reject"
                                                            >
                                                                <span className="material-symbols-outlined text-[14px] block font-bold">close</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : <p className="text-text-secondary text-sm">No tasks created yet.</p>}
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-border-dark flex justify-end shrink-0">
                            <button type="button" onClick={() => { setShowDetailsModal(false); setProjectTasks([]); }} className="px-4 py-2 rounded-lg border border-border-dark text-white font-medium hover:bg-background-dark transition-colors">Close</button>
                        </div>
                    </div>
                </div>
            )
            }

            {/* Team Assignment Modal */}
            {
                showTeamModal && selectedProject && (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowTeamModal(false)}></div>
                        <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] overflow-hidden flex flex-col">
                            <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface shrink-0">
                                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary">group_add</span>Manage Team
                                </h2>
                                <p className="text-text-secondary text-sm mt-1">{selectedProject.name}</p>
                            </div>
                            <div className="p-4 overflow-y-auto flex-1">
                                {users.length > 0 ? (
                                    <div className="space-y-2">
                                        {users.map((user) => {
                                            const isAssigned = (selectedProject.teamIds || []).includes(user.id);
                                            return (
                                                <button key={user.id} onClick={() => handleAssignTeam(user.id)} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${isAssigned ? 'bg-primary/20 border border-primary/50' : 'bg-background-dark/50 border border-border-dark hover:border-primary/30'}`}>
                                                    <div className="size-10 rounded-full bg-gradient-primary flex items-center justify-center">
                                                        <span className="text-white font-medium">{user.name.charAt(0)}</span>
                                                    </div>
                                                    <div className="flex-1 text-left">
                                                        <p className="text-white font-medium">{user.name}</p>
                                                        <p className="text-text-secondary text-xs">{user.role} • {user.department || 'No dept'}</p>
                                                    </div>
                                                    {isAssigned && <span className="material-symbols-outlined text-primary">check_circle</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : <p className="text-text-secondary text-center py-4">No team members available.</p>}
                            </div>
                            <div className="px-6 py-4 border-t border-border-dark flex justify-end shrink-0">
                                <button type="button" onClick={() => setShowTeamModal(false)} className="px-4 py-2 rounded-lg bg-gradient-primary text-white font-bold hover:scale-[1.02] transition-all">Done</button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Delete Confirmation Modal */}
            {
                showDeleteConfirm && selectedProject && (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)}></div>
                        <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                            <div className="px-6 py-4 border-b border-border-dark bg-red-500/10">
                                <h2 className="text-lg font-semibold text-red-400 flex items-center gap-2">
                                    <span className="material-symbols-outlined">warning</span>Delete Project
                                </h2>
                            </div>
                            <div className="p-6">
                                <p className="text-white mb-2">Are you sure you want to delete <strong>{selectedProject.name}</strong>?</p>
                                <p className="text-text-secondary text-sm">This will also delete all tasks associated with this project. This action cannot be undone.</p>
                            </div>
                            <div className="px-6 py-4 border-t border-border-dark flex justify-end gap-3">
                                <button type="button" onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 rounded-lg border border-border-dark text-white font-medium hover:bg-background-dark transition-colors">Cancel</button>
                                <button type="button" onClick={handleDeleteProject} className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-red-500 text-white font-bold hover:bg-red-600 transition-colors">
                                    <span className="material-symbols-outlined text-lg">delete</span>Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </SuperUserLayout >
    );
}
