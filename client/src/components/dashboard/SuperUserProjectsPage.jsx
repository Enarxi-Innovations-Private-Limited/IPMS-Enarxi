import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../../services/api.js';
import SuperUserLayout from '../common/SuperUserLayout.jsx';

export default function SuperUserProjectsPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const [projects, setProjects] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('ALL');
    const [filterDepartment, setFilterDepartment] = useState('ALL');

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const filterParam = params.get('filter');
        if (filterParam) {
            setFilterStatus(filterParam);
        }
    }, [location.search]);

    // Handle deep-linking from search or dashboard
    useEffect(() => {
        if (projects.length > 0) {
            const params = new URLSearchParams(location.search);
            const projectIdParam = params.get('projectId');
            if (projectIdParam) {
                const project = projects.find(p => p.id === projectIdParam);
                if (project) {
                    openDetailsModal(project);
                }
            }
        }
    }, [projects, location.search]);

    // Modal states
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [showTeamModal, setShowTeamModal] = useState(false);
    const [showAttachmentsModal, setShowAttachmentsModal] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
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
        budget: '',
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
            // Use general /tasks endpoint to ensure all fields (deadline) are populated, consistent with Manager view
            const res = await api.get('/tasks');
            const allTasks = Array.isArray(res.data) ? res.data : [];
            // Filter tasks for the specific project
            setProjectTasks(allTasks.filter(t => t.projectId === projectId || (t.project && t.project._id === projectId)));
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
            setShowDetailsModal(false);
            setSelectedProject(null);
            setProjectTasks([]);
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

    const handleUploadAttachment = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0 || !selectedProject) return;

        try {
            setIsUploading(true);
            const formData = new FormData();
            files.forEach(file => {
                formData.append('attachments', file);
            });

            const res = await api.post(`/projects/${selectedProject.id}/attachments`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            const updatedAttachments = res.data.attachments;
            setSelectedProject({ ...selectedProject, attachments: updatedAttachments });
            // Update in main list too
            setProjects(projects.map(p => p.id === selectedProject.id ? { ...p, attachments: updatedAttachments } : p));
        } catch (err) {
            console.error('Failed to upload attachments:', err);
            setError('Failed to upload attachments');
        } finally {
            setIsUploading(false);
        }
    };

    const handleRemoveAttachment = async (fileUrl) => {
        if (!selectedProject || !window.confirm('Are you sure you want to remove this attachment?')) return;

        try {
            const filename = fileUrl.split('/').pop();
            const res = await api.delete(`/projects/${selectedProject.id}/attachments/${filename}`);
            const updatedAttachments = res.data.attachments;
            setSelectedProject({ ...selectedProject, attachments: updatedAttachments });
            // Update in main list too
            setProjects(projects.map(p => p.id === selectedProject.id ? { ...p, attachments: updatedAttachments } : p));
        } catch (err) {
            console.error('Failed to remove attachment:', err);
            setError('Failed to remove attachment');
        }
    };

    const openEditModal = async (project) => {
        setSelectedProject(project);
        setEditForm({
            name: project.name,
            description: project.description || '',
            department: project.department || 'SOFTWARE',
            status: project.status,
            startDate: project.startDate?.split('T')[0] || '',
            endDate: project.deadline?.split('T')[0] || '',
            budget: project.budget || '',
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
        try {
            const res = await api.get(`/projects/${project.id}`);
            setSelectedProject(res.data);
            // Update list state so Grid reflects the fetched details (e.g. team members)
            setProjects(prev => prev.map(p => p.id === project.id ? { ...p, ...res.data } : p));
        } catch (err) {
            console.error('Failed to load project details:', err);
        }
        await loadProjectTasks(project.id);
    };

    const openTeamModal = async (project) => {
        setSelectedProject(project);
        setShowTeamModal(true);
        try {
            const res = await api.get(`/projects/${project.id}`);
            setSelectedProject(res.data);
            // Update list state
            setProjects(prev => prev.map(p => p.id === project.id ? { ...p, ...res.data } : p));
        } catch (err) {
            console.error('Failed to load project details:', err);
        }
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
        // Fallback checks for different data structures
        const teamIds = project.teamIds || (Array.isArray(project.team) ? project.team : []);
        if (!teamIds || teamIds.length === 0) return [];
        // If team contains objects, return them directly
        if (teamIds.length > 0 && typeof teamIds[0] === 'object') return teamIds;
        // Otherwise filter from users list using IDs
        return users.filter((u) => teamIds.includes(u.id));
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
                                            <button onClick={() => openTeamModal(project)} className="text-primary hover:text-white text-xs font-medium transition-colors">View</button>
                                        </div>

                                        {/* Actions */}
                                        <div className="px-5 py-3 border-t border-border-dark flex gap-2">
                                            <button onClick={() => openDetailsModal(project)} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors">
                                                <span className="material-symbols-outlined text-base">visibility</span>View Details
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); setSelectedProject(project); setShowDeleteConfirm(true); }} className="px-3 py-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-colors" title="Delete Project">
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
                                        min={createForm.startDate || new Date().toISOString().split('T')[0]}
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
                                        // Max 10 Million (1,00,00,000)
                                        if (val === '' || (/^\d*\.?\d*$/.test(val) && parseFloat(val) <= 10000000)) {
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



            {/* Project Details Modal - Variant 2 Command Center */}
            {showDetailsModal && selectedProject && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => { setShowDetailsModal(false); setProjectTasks([]); }}></div>

                    {/* Background effects */}
                    <div className="fixed inset-0 blur-[120px] opacity-20 pointer-events-none select-none overflow-hidden">
                        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/20 rounded-full"></div>
                        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/10 rounded-full"></div>
                    </div>

                    {/* Modal Container */}
                    <div className="relative bg-[#11141D] border border-white/10 w-full max-w-7xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] z-10">
                        {/* Hero Header */}
                        <div className="relative pt-8 pb-10 px-10 border-b border-white/5" style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(10, 12, 18, 0) 100%)' }}>
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center text-blue-500">
                                            <span className="material-symbols-outlined text-2xl">folder</span>
                                        </div>
                                        <h1 className="text-3xl font-bold text-white tracking-tight">{selectedProject.name}</h1>
                                        <span className={`ml-4 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${selectedProject.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                            selectedProject.status === 'COMPLETED' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                                                'bg-slate-500/10 text-slate-500 border-slate-500/20'
                                            }`}>
                                            {selectedProject.status.replace('_', ' ')}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-6 mt-4">
                                        {selectedProject.budget > 0 && (
                                            <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-xl border border-white/5">
                                                <span className="material-symbols-outlined text-emerald-400 text-lg">payments</span>
                                                <span className="text-white font-mono font-semibold">₹{selectedProject.budget.toLocaleString('en-IN')}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
                                            <span className="material-symbols-outlined text-sm">event</span>
                                            <span>
                                                {selectedProject.startDate ? new Date(selectedProject.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                                            </span>
                                            {selectedProject.endDate && (
                                                <>
                                                    <span className="w-1 h-1 rounded-full bg-slate-600"></span>
                                                    <span className="text-blue-400 font-bold">
                                                        {Math.max(0, Math.ceil((new Date(selectedProject.endDate) - new Date()) / (1000 * 60 * 60 * 24)))} Days Left
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => { setShowDetailsModal(false); setProjectTasks([]); }} className="p-2 text-slate-500 hover:text-white transition-colors">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>

                            {/* Progress Bar */}
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5">
                                <div
                                    className="h-full bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.5)] transition-all duration-500"
                                    style={{ width: `${projectTasks.length > 0 ? (projectTasks.filter(t => t.status === 'COMPLETED').length / projectTasks.length * 100) : 0}%` }}
                                ></div>
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-auto custom-scrollbar p-8">
                            <div className="flex flex-col-reverse lg:flex-row gap-8">
                                {/* Left Column: Task Management */}
                                <div className="flex-1 space-y-6 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                            <span className="material-symbols-outlined text-blue-400">format_list_bulleted</span>
                                            Task Management
                                        </h3>
                                    </div>

                                    {loadingTasks ? (
                                        <div className="text-center py-12 text-slate-500">Loading tasks...</div>
                                    ) : projectTasks.length > 0 ? (
                                        <>
                                            <div className="md:hidden space-y-4">
                                                {projectTasks.map((task) => {
                                                    const assignee = users.find(u => u.id === task.assigneeId);
                                                    return (
                                                        <div key={task.id} className="bg-white/5 border border-white/5 p-4 rounded-xl space-y-3" style={{ border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div>
                                                                    <div className="font-semibold text-white text-sm leading-tight">{task.title}</div>
                                                                    {task.description && <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">{task.description}</div>}
                                                                </div>
                                                                <span className={`shrink-0 px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider ${task.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                                                    task.status === 'IN_PROGRESS' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                                                                        task.status === 'WAITING_APPROVAL' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                                                                            'bg-slate-800 text-slate-400 border border-white/10'
                                                                    }`}>
                                                                    {task.status === 'NOT_STARTED' ? 'N/S' : task.status.replace('_', ' ')}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                                                <div className="flex items-center gap-2">
                                                                    {assignee ? (
                                                                        <>
                                                                            <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-[8px] font-bold text-white ring-1 ring-white/5">{assignee.name.charAt(0)}</div>
                                                                            <span className="text-xs text-slate-300">{assignee.name}</span>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <div className="w-5 h-5 rounded-full border border-dashed border-white/20 flex items-center justify-center text-[8px] text-slate-500">?</div>
                                                                            <span className="text-xs text-slate-500 italic">Unassigned</span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                                <div className="text-[10px] text-slate-400 font-mono">
                                                                    {(task.deadline || task.dueDate) ? new Date((task.deadline || task.dueDate)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'No Date'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className="hidden md:block bg-white/5 border border-white/5 rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                                <table className="w-full text-left border-collapse">
                                                    <thead>
                                                        <tr className="bg-white/5 border-b border-white/5">
                                                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Task</th>
                                                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Assignee</th>
                                                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Status</th>
                                                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Deadline</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-white/5">
                                                        {projectTasks.map((task) => {
                                                            const assignee = users.find(u => u.id === task.assigneeId);
                                                            return (
                                                                <tr key={task.id} className="group hover:bg-white/[0.02] transition-colors">
                                                                    <td className="px-6 py-5">
                                                                        <div className="font-semibold text-white text-sm">{task.title}</div>
                                                                        {task.description && <div className="text-[11px] text-slate-500 mt-1">{task.description.substring(0, 50)}</div>}
                                                                    </td>
                                                                    <td className="px-6 py-5">
                                                                        {assignee ? (
                                                                            <div className="flex items-center space-x-2">
                                                                                <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white ring-2 ring-white/5">
                                                                                    {assignee.name.charAt(0)}
                                                                                </div>
                                                                                <div className="flex flex-col">
                                                                                    <span className="text-xs text-slate-300 font-medium">{assignee.name}</span>
                                                                                    <span className="text-[9px] text-emerald-500 font-bold uppercase">Assigned</span>
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="flex items-center space-x-2">
                                                                                <div className="w-7 h-7 rounded-full border border-dashed border-white/20 flex items-center justify-center text-[10px] font-bold text-slate-500">?</div>
                                                                                <div className="flex flex-col">
                                                                                    <span className="text-xs text-slate-500 italic">No Assignee</span>
                                                                                    <span className="text-[9px] text-slate-500 font-bold uppercase">Unassigned</span>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-6 py-5">
                                                                        <div className="flex justify-center items-center gap-2">
                                                                            <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full uppercase tracking-wider ${task.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                                                                task.status === 'IN_PROGRESS' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                                                                                    task.status === 'WAITING_APPROVAL' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                                                                                        'bg-slate-800 text-slate-400 border border-white/10'
                                                                                }`}>
                                                                                {task.status === 'NOT_STARTED' ? 'Not Started' : task.status.replace('_', ' ')}
                                                                            </span>


                                                                        </div>
                                                                    </td>
                                                                    <td className="px-6 py-5 font-mono text-[11px] text-slate-400">
                                                                        {(task.deadline || task.dueDate) ? new Date((task.deadline || task.dueDate)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No deadline'}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-center py-12 text-slate-500">
                                            <span className="material-symbols-outlined text-5xl opacity-50">task_alt</span>
                                            <p className="mt-2">No tasks created yet.</p>
                                        </div>
                                    )}
                                </div>

                                {/* Right Column: Sidebar */}
                                <div className="w-full lg:w-96 space-y-6 shrink-0 mt-1">
                                    {/* Stats */}
                                    <div className="space-y-4">
                                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Project Stats</h4>
                                        <div className="flex gap-4">
                                            <div className="flex-1 bg-white/5 border border-white/5 p-4 rounded-2xl" style={{ border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Total Tasks</p>
                                                <p className="text-2xl font-bold text-white">{projectTasks.length}</p>
                                            </div>
                                            <div className="flex-1 bg-white/5 border border-white/5 p-4 rounded-2xl" style={{ border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Completed</p>
                                                <p className="text-2xl font-bold text-emerald-500">{projectTasks.filter(t => t.status === 'COMPLETED').length.toString().padStart(2, '0')}</p>
                                            </div>
                                        </div>
                                        <div className="bg-blue-600/10 border border-blue-500/20 p-4 rounded-2xl w-full" style={{ border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                            <p className="text-[10px] font-bold text-blue-400 uppercase mb-1">In Progress</p>
                                            <div className="flex items-end justify-between">
                                                <p className="text-2xl font-bold text-white">{projectTasks.filter(t => t.status === 'IN_PROGRESS').length.toString().padStart(2, '0')}</p>
                                                {projectTasks.length > 0 && (
                                                    <span className="text-xs text-blue-400 font-bold">
                                                        {Math.round((projectTasks.filter(t => t.status === 'IN_PROGRESS').length / projectTasks.length) * 100)}% Active
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Assigned Manager */}
                                    <div className="space-y-4">
                                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Assigned Manager</h4>
                                        {selectedProject.managerName ? (
                                            <div className="bg-blue-600/10 border border-blue-500/20 p-4 rounded-2xl flex items-center gap-4" style={{ border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                                <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-xl font-bold text-white shadow-lg shadow-blue-900/40">
                                                    {selectedProject.managerName.charAt(0)}
                                                </div>
                                                <div>
                                                    <h5 className="text-white font-bold leading-tight">{selectedProject.managerName}</h5>
                                                    <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">Project Manager</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="bg-slate-800/30 border border-slate-700/50 border-dashed p-4 rounded-2xl text-center text-slate-500 italic text-sm">
                                                No manager assigned
                                            </div>
                                        )}
                                    </div>

                                    {/* Team Members */}
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Team Members ({getTeamMembers(selectedProject).length})</h4>
                                            <button
                                                onClick={() => { setShowDetailsModal(false); setShowTeamModal(true); }}
                                                className="text-[10px] font-bold text-blue-400 hover:underline uppercase"
                                            >
                                                View All
                                            </button>
                                        </div>
                                        <div className="space-y-3">
                                            {getTeamMembers(selectedProject).length > 0 ? getTeamMembers(selectedProject).slice(0, 3).map((member) => (
                                                <div key={member.id} className="flex items-center justify-between group">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/5 overflow-hidden flex items-center justify-center">
                                                            <div className="text-[10px] text-slate-400">{member.name.substring(0, 2).toUpperCase()}</div>
                                                        </div>
                                                        <span className="text-sm text-slate-300">{member.name}</span>
                                                    </div>
                                                    <span className="text-[9px] font-bold text-slate-600 group-hover:text-blue-400 uppercase transition-colors">{member.role}</span>
                                                </div>
                                            )) : (
                                                <p className="text-slate-500 text-sm">No team members</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-10 py-6 border-t border-white/5 bg-[#11141D]/60 flex items-center justify-between">
                            <div className="flex items-center space-x-8">
                                <div
                                    onClick={() => setShowAttachmentsModal(true)}
                                    className="flex items-center space-x-2 text-slate-500 hover:text-blue-400 transition-colors cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-xl">attach_file</span>
                                    <span className="text-[10px] font-bold uppercase tracking-widest">{selectedProject.attachments?.length || 0} Attachments</span>
                                </div>
                            </div>
                            <div className="flex items-center space-x-4">
                                <button
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="px-4 py-2.5 rounded-xl bg-red-600/10 border border-red-500/20 text-red-500 text-xs font-bold hover:bg-red-600 hover:text-white transition-all flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-sm">delete</span>
                                    Delete Project
                                </button>
                                <button
                                    onClick={() => { setShowDetailsModal(false); setProjectTasks([]); }}
                                    className="px-6 py-2.5 rounded-xl border border-slate-600 text-white text-xs font-bold hover:bg-slate-800 transition-all"
                                >
                                    Close
                                </button>
                            </div>
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
                                    <span className="material-symbols-outlined text-primary">group</span>Team Members
                                </h2>
                                <p className="text-text-secondary text-sm mt-1">{selectedProject.name}</p>
                            </div>
                            <div className="p-4 overflow-y-auto flex-1">
                                {users.length > 0 ? (
                                    <div className="space-y-2">
                                        {users.map((user) => {
                                            const isAssigned = (selectedProject.teamIds || []).includes(user.id);
                                            return (
                                                <div key={user.id} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${isAssigned ? 'bg-primary/20 border border-primary/50' : 'bg-background-dark/50 border border-border-dark opacity-40'}`}>
                                                    <div className="size-10 rounded-full bg-gradient-primary flex items-center justify-center">
                                                        <span className="text-white font-medium">{user.name.charAt(0)}</span>
                                                    </div>
                                                    <div className="flex-1 text-left">
                                                        <p className="text-white font-medium">{user.name}</p>
                                                        <p className="text-text-secondary text-xs">{user.role} • {user.department || 'No dept'}</p>
                                                    </div>
                                                    {isAssigned && <span className="material-symbols-outlined text-primary">check_circle</span>}
                                                </div>
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

            {/* Attachments Center Modal */}
            {
                showAttachmentsModal && selectedProject && (
                    <div className="fixed inset-0 z-[10000] flex items-center justify-center">
                        <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowAttachmentsModal(false)}></div>
                        <div className="relative bg-[#11141D] border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-200">

                            {/* Header */}
                            <div className="relative px-6 py-4 border-b border-white/5 bg-gradient-to-r from-blue-600/10 to-transparent flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center text-blue-500">
                                        <span className="material-symbols-outlined">folder_open</span>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white tracking-tight">Attachment Center</h3>
                                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Manage files for {selectedProject.name}</p>
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
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">

                                {/* Upload Section */}
                                <div className="relative bg-white/5 border-2 border-dashed border-white/10 hover:border-blue-500/50 rounded-2xl p-8 transition-all group overflow-hidden">
                                    <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <div className="relative flex flex-col items-center justify-center text-center gap-3">
                                        <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-blue-600/20 group-hover:text-blue-400 transition-all duration-300">
                                            <span className="material-symbols-outlined text-3xl">cloud_upload</span>
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-white">Click or drag to upload files</p>
                                            <p className="text-[10px] text-slate-500 mt-1 uppercase font-bold tracking-widest">Max file size: 50MB</p>
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
                                        <div className="mt-4 flex items-center justify-center gap-2 text-blue-400 text-xs font-bold uppercase tracking-widest animate-pulse">
                                            <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                                            Uploading files...
                                        </div>
                                    )}
                                </div>

                                {/* Attachments List */}
                                <div>
                                    <h4 className="text-[10px] font-bold uppercase text-slate-500 tracking-widest mb-4 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-sm">attach_file</span>
                                        Attached Files ({selectedProject.attachments?.length || 0})
                                    </h4>

                                    <div className="space-y-2">
                                        {selectedProject.attachments && selectedProject.attachments.length > 0 ? (
                                            selectedProject.attachments.map((file, idx) => (
                                                <div key={idx} className="flex items-center gap-4 p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/[0.08] hover:border-white/10 transition-all group">
                                                    <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 shrink-0 shadow-inner">
                                                        <span className="material-symbols-outlined">description</span>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-bold text-white truncate">{file.name}</p>
                                                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                                                            {new Date(file.uploadedAt).toLocaleDateString()} • {file.size ? (file.size / 1024).toFixed(1) + ' KB' : 'Size unknown'}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <a
                                                            href={`/api${file.url}`}
                                                            download
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="p-2 rounded-xl hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-400 transition-all"
                                                            title="Download"
                                                        >
                                                            <span className="material-symbols-outlined text-xl">download</span>
                                                        </a>
                                                        <button
                                                            onClick={() => handleRemoveAttachment(file.url)}
                                                            className="p-2 rounded-xl hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-all"
                                                            title="Delete"
                                                        >
                                                            <span className="material-symbols-outlined text-xl">delete</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-2xl">
                                                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                                                    <span className="material-symbols-outlined text-3xl text-slate-600">folder_off</span>
                                                </div>
                                                <p className="text-slate-500 text-sm font-medium">No files attached to this project yet.</p>
                                                <p className="text-[10px] text-slate-600 uppercase font-bold tracking-widest mt-1">Upload files to get started</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                            </div>
                            {/* Footer */}
                            <div className="px-6 py-4 border-t border-white/5 bg-white/[0.02] flex justify-end">
                                <button
                                    onClick={() => setShowAttachmentsModal(false)}
                                    className="px-6 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold hover:bg-white/10 transition-all"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }


            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowDeleteConfirm(false)}></div>
                    <div className="relative bg-[#11141D] border border-white/10 rounded-2xl shadow-2xl p-8 w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="size-14 rounded-2xl bg-red-500/20 text-red-500 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-4xl">warning</span>
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white tracking-tight">Delete Project?</h3>
                                <p className="text-slate-400 mt-2 text-sm leading-relaxed">
                                    Are you sure you want to delete <span className="text-white font-bold">"{selectedProject?.name}"</span>?
                                    This will permanently remove all tasks and back up all attachments. This action cannot be undone.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3 justify-end pt-2">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="px-6 py-2.5 rounded-xl border border-white/10 text-slate-300 font-bold hover:bg-white/5 transition-all text-xs uppercase tracking-widest"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteProject}
                                className="px-6 py-2.5 rounded-xl bg-red-600 text-white font-bold shadow-lg shadow-red-900/40 hover:bg-red-700 hover:scale-[1.02] transition-all text-xs uppercase tracking-widest"
                            >
                                Confirm Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </SuperUserLayout >
    );
}
