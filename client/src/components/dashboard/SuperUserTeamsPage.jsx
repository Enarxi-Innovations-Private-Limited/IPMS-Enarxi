import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api.js';
import SuperUserLayout from '../common/SuperUserLayout.jsx';

export default function SuperUserTeamsPage() {
    const navigate = useNavigate();
    const [teamMembers, setTeamMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterDepartment, setFilterDepartment] = useState('ALL');
    const [filterRole, setFilterRole] = useState('ALL');
    const [activityLogs, setActivityLogs] = useState([]);
    const [loadingLogs, setLoadingLogs] = useState(false);

    // Modal states
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [userDetails, setUserDetails] = useState(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [createError, setCreateError] = useState('');
    const [editError, setEditError] = useState('');
    const [nextEmployeeId, setNextEmployeeId] = useState('');

    // Performance Analysis State
    const [userPerformance, setUserPerformance] = useState(null);
    const [userTasks, setUserTasks] = useState([]);
    const [loadingTasks, setLoadingTasks] = useState(false);

    const getRoleBadgeColor = (role) => {
        switch (role) {
            case 'EMPLOYEE': return 'bg-blue-500/20 text-blue-400';
            case 'INTERN': return 'bg-purple-500/20 text-purple-400';
            default: return 'bg-gray-500/20 text-gray-400';
        }
    };

    const loadUserPerformance = async (userId) => {
        try {
            setLoadingTasks(true);
            const res = await api.get(`/users/${userId}/performance`);
            setUserPerformance(res.data);
            setUserTasks(res.data.tasks || []);
        } catch (err) {
            console.error('Failed to load user performance:', err);
        } finally {
            setLoadingTasks(false);
        }
    };

    // Create form state
    const [createForm, setCreateForm] = useState({
        name: '',
        email: '',
        role: 'EMPLOYEE',
        department: 'SOFTWARE',
        password: '',
        employeeId: '',
    });

    // Edit form state
    const [editForm, setEditForm] = useState({
        name: '',
        email: '',
        role: 'EMPLOYEE',
        department: 'SOFTWARE',
        password: '',
    });

    useEffect(() => {
        loadTeamMembers();
        loadActivityLogs();
    }, []);

    useEffect(() => {
        if (teamMembers.length > 0) {
            const maxId = teamMembers
                .map(m => m.employeeId)
                .filter(id => id && typeof id === 'string' && id.startsWith('EMP-'))
                .map(id => parseInt(id.split('-')[1]))
                .reduce((max, current) => (current > max ? current : max), 0);

            setNextEmployeeId(`EMP-${String(maxId + 1).padStart(3, '0')}`);
        }
    }, [teamMembers]);

    const loadTeamMembers = async () => {
        try {
            setLoading(true);
            const res = await api.get('/users');
            setTeamMembers(res.data);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load team members');
        } finally {
            setLoading(false);
        }
    };



    const loadActivityLogs = async () => {
        try {
            setLoadingLogs(true);
            const res = await api.get('/activity-logs');
            setActivityLogs(res.data);
        } catch (err) {
            console.error('Failed to load activity logs:', err);
        } finally {
            setLoadingLogs(false);
        }
    };

    const loadUserDetails = async (userId) => {
        try {
            setLoadingDetails(true);
            const res = await api.get(`/users/${userId}/details`);
            setUserDetails(res.data);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load user details');
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleViewDetails = async (user) => {
        setSelectedUser(user);
        setShowDetailsModal(true);
        setUserPerformance(null);
        setUserTasks([]);
        await Promise.all([
            loadUserDetails(user.id),
            loadUserPerformance(user.id)
        ]);
    };

    const handleOpenEditModal = (user) => {
        setSelectedUser(user);
        setEditForm({
            name: user.name,
            email: user.email,
            role: user.role,
            department: user.department || 'SOFTWARE',
            password: '',
        });
        setEditError('');
        setShowEditModal(true);
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        try {
            setIsCreating(true);
            setCreateError('');
            await api.post('/users', createForm);
            setShowCreateModal(false);
            setCreateForm({
                name: '',
                email: '',
                role: 'EMPLOYEE',
                department: 'SOFTWARE',
                password: '',
            });
            setCreateError('');
            await loadTeamMembers();
            await loadActivityLogs();
        } catch (err) {
            setCreateError(err.response?.data?.message || 'Failed to create user');
        } finally {
            setIsCreating(false);
        }
    };

    const handleEditUser = async (e) => {
        e.preventDefault();
        if (!selectedUser) return;
        try {
            setIsEditing(true);
            setEditError('');
            const updateData = { ...editForm };
            if (!updateData.password) delete updateData.password;
            await api.put(`/users/${selectedUser.id}`, updateData);
            setShowEditModal(false);
            setSelectedUser(null);
            await loadTeamMembers();
            await loadActivityLogs();
        } catch (err) {
            setEditError(err.response?.data?.message || 'Failed to update user');
        } finally {
            setIsEditing(false);
        }
    };

    const handleDeleteUser = async () => {
        if (!selectedUser) return;
        try {
            setError('');
            await api.delete(`/users/${selectedUser.id}`);
            setShowDeleteConfirm(false);
            setSelectedUser(null);
            await loadTeamMembers();
            await loadActivityLogs();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to delete user');
        }
    };

    const confirmDelete = (user) => {
        setSelectedUser(user);
        setShowDeleteConfirm(true);
    };

    // Filter team members
    const filteredMembers = teamMembers.filter((m) => {
        const matchesSearch = searchQuery === '' ||
            m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.employeeId.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesDept = filterDepartment === 'ALL' || m.department === filterDepartment;
        const matchesRole = filterRole === 'ALL' || m.role === filterRole;
        return matchesSearch && matchesDept && matchesRole;
    });

    // Separate team members by department (managers included in their respective teams)
    const softwareTeam = filteredMembers.filter((m) => m.department === 'SOFTWARE');
    const hardwareTeam = filteredMembers.filter((m) => m.department === 'HARDWARE');
    const unassignedTeam = filteredMembers.filter((m) => !m.department);

    const formatTimeAgo = (timestamp) => {
        if (!timestamp) return 'Unknown';

        const now = new Date();
        const date = new Date(timestamp);

        // Check if date is invalid
        if (isNaN(date.getTime())) return 'Unknown';

        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    };

    const getActivityIcon = (type) => {
        switch (type) {
            case 'USER_CREATED': return 'person_add';
            case 'USER_UPDATED': return 'edit';
            case 'USER_DELETED': return 'person_remove';
            default: return 'info';
        }
    };

    const getActivityColor = (type) => {
        switch (type) {
            case 'USER_CREATED': return 'text-green-400';
            case 'USER_UPDATED': return 'text-blue-400';
            case 'USER_DELETED': return 'text-red-400';
            default: return 'text-gray-400';
        }
    };

    const renderTeamSection = (title, members, icon, color) => (
        <div className="bg-surface-dark border border-border-dark rounded-xl shadow-xl overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <span className={`material-symbols-outlined ${color}`}>{icon}</span>
                    {title}
                    <span className="ml-2 px-2 py-0.5 bg-background-dark rounded-full text-xs text-text-secondary">
                        {members.length}
                    </span>
                </h2>
            </div>
            <div className="p-6">
                {members.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {members.map((member) => (
                            <div
                                key={member.id}
                                className="bg-background-dark/50 border border-border-dark rounded-lg p-4 hover:bg-background-dark hover:border-primary/30 transition-all group"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="size-12 rounded-full bg-gradient-primary flex items-center justify-center shrink-0">
                                        <span className="text-white font-bold text-lg">
                                            {member.name.charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-white font-semibold truncate">{member.name}</h3>
                                        <p className="text-text-secondary text-sm">{member.employeeId}</p>
                                        <span
                                            className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full ${member.role === 'MANAGER'
                                                ? 'bg-emerald-500/20 text-emerald-400'
                                                : member.role === 'EMPLOYEE'
                                                    ? 'bg-blue-500/20 text-blue-400'
                                                    : 'bg-purple-500/20 text-purple-400'
                                                }`}
                                        >
                                            {member.role}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex gap-2 mt-4">
                                    <button
                                        onClick={() => handleViewDetails(member)}
                                        className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-base">visibility</span>
                                        View
                                    </button>
                                    <button
                                        onClick={() => handleOpenEditModal(member)}
                                        className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-amber-500/10 text-amber-400 text-sm font-medium hover:bg-amber-500/20 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-base">edit</span>
                                    </button>
                                    <button
                                        onClick={() => confirmDelete(member)}
                                        className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-base">delete</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-text-secondary text-center py-4">No team members found.</p>
                )}
            </div>
        </div>
    );

    return (
        <SuperUserLayout currentPage="teams">
            <div className="p-6 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    {/* Breadcrumb */}
                    <nav aria-label="Breadcrumb" className="flex mb-6">
                        <ol className="inline-flex items-center space-x-2">
                            <li>
                                <button
                                    onClick={() => navigate('/super')}
                                    className="text-text-secondary hover:text-white text-sm font-medium transition-colors"
                                >
                                    Dashboard
                                </button>
                            </li>
                            <li className="flex items-center">
                                <span className="material-symbols-outlined text-text-secondary text-base">chevron_right</span>
                                <span className="ml-2 text-white text-sm font-medium">Team Members</span>
                            </li>
                        </ol>
                    </nav>

                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
                        <div>
                            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">Team Members</h1>
                            <p className="text-text-secondary text-lg">Manage your team members by department.</p>
                        </div>
                        <button
                            onClick={async () => {
                                try {
                                    const res = await api.get('/users/next-id');
                                    setNextEmployeeId(res.data.nextEmployeeId);
                                } catch (err) {
                                    console.error('Failed to get next ID');
                                }
                                setShowCreateModal(true);
                            }}
                            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-gradient-primary text-white font-bold shadow-lg shadow-blue-900/50 hover:shadow-blue-900/70 hover:scale-[1.02] transition-all"
                        >
                            <span className="material-symbols-outlined text-lg">person_add</span>
                            Add Team Member
                        </button>
                    </div>

                    {/* Search and Filter Bar */}
                    <div className="bg-surface-dark border border-border-dark rounded-xl p-4 mb-6 flex flex-col md:flex-row gap-4">
                        <div className="flex-1 relative">
                            <span className="absolute inset-y-0 left-3 flex items-center text-text-secondary">
                                <span className="material-symbols-outlined text-xl">search</span>
                            </span>
                            <input
                                type="text"
                                placeholder="Search by name, email, or employee ID..."
                                className="w-full pl-10 pr-4 py-2.5 bg-background-dark border border-border-dark rounded-lg text-white placeholder-text-secondary/50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-3">
                            <select
                                className="px-4 py-2.5 bg-background-dark border border-border-dark rounded-lg text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none cursor-pointer"
                                value={filterDepartment}
                                onChange={(e) => setFilterDepartment(e.target.value)}
                            >
                                <option value="ALL">All Departments</option>
                                <option value="SOFTWARE">Software</option>
                                <option value="HARDWARE">Hardware</option>
                            </select>
                            <select
                                className="px-4 py-2.5 bg-background-dark border border-border-dark rounded-lg text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none cursor-pointer"
                                value={filterRole}
                                onChange={(e) => setFilterRole(e.target.value)}
                            >
                                <option value="ALL">All Roles</option>
                                <option value="MANAGER">Manager</option>
                                <option value="EMPLOYEE">Employee</option>
                                <option value="INTERN">Intern</option>
                                <option value="STOCK_ADMIN">Stock Admin</option>
                            </select>
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-6">
                            {error}
                            <button onClick={() => setError('')} className="float-right">×</button>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Team Members (2 cols) */}
                        <div className="lg:col-span-2">
                            {loading ? (
                                <div className="bg-surface-dark border border-border-dark rounded-xl p-8 text-center">
                                    <p className="text-text-secondary">Loading team members...</p>
                                </div>
                            ) : (
                                <>
                                    {renderTeamSection('Software Team', softwareTeam, 'code', 'text-blue-400')}
                                    {renderTeamSection('Hardware Team', hardwareTeam, 'memory', 'text-amber-400')}
                                    {unassignedTeam.length > 0 && renderTeamSection('Unassigned', unassignedTeam, 'help', 'text-gray-400')}
                                </>
                            )}
                        </div>

                        {/* Activity Logs (1 col) */}
                        <div className="lg:col-span-1">
                            <div className="bg-surface-dark border border-border-dark rounded-xl shadow-xl overflow-hidden sticky top-6">
                                <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface">
                                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary">history</span>
                                        Activity Logs
                                    </h2>
                                </div>
                                <div className="p-4 max-h-[500px] overflow-y-auto custom-scrollbar">
                                    {loadingLogs ? (
                                        <p className="text-text-secondary text-center py-4">Loading...</p>
                                    ) : activityLogs.length > 0 ? (
                                        <div className="space-y-3">
                                            {activityLogs.slice(0, 15).map((log) => (
                                                <div key={log.id} className="flex items-start gap-3 p-3 bg-background-dark/50 rounded-lg">
                                                    <div className={`size-8 rounded-full bg-surface-dark flex items-center justify-center shrink-0 ${getActivityColor(log.type)}`}>
                                                        <span className="material-symbols-outlined text-base">{getActivityIcon(log.type)}</span>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-white text-sm">{log.message}</p>
                                                        <p className="text-text-secondary text-xs mt-1">
                                                            by {log.userName} • {formatTimeAgo(log.timestamp)}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-text-secondary text-center py-4 text-sm">No activity logs yet.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Create User Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateModal(false)}></div>
                    <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                        <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary">person_add</span>
                                    Add Team Member
                                </h2>
                            </div>
                        </div>
                        <form onSubmit={handleCreateUser} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Employee ID</label>
                                <input
                                    type="text"
                                    disabled
                                    className="w-full bg-background-dark/50 border border-border-dark rounded-lg px-4 py-3 text-white/50 cursor-not-allowed font-medium"
                                    value={nextEmployeeId || 'Loading...'}
                                />
                                <p className="text-xs text-text-secondary mt-1">Next available ID (Auto-assigned)</p>
                            </div>
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Full Name *</label>
                                <input type="text" required className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white placeholder-text-secondary/50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none" placeholder="John Doe" value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Email *</label>
                                <input type="email" required className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white placeholder-text-secondary/50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none" placeholder="john@company.com" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Password *</label>
                                <input type="password" required className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white placeholder-text-secondary/50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none" placeholder="••••••••" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Role *</label>
                                    <select className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none cursor-pointer" value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}>
                                        <option value="MANAGER">Manager</option>
                                        <option value="EMPLOYEE">Employee</option>
                                        <option value="INTERN">Intern</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Department *</label>
                                    <select className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none cursor-pointer" value={createForm.department} onChange={(e) => setCreateForm({ ...createForm, department: e.target.value })}>
                                        <option value="SOFTWARE">Software</option>
                                        <option value="HARDWARE">Hardware</option>
                                    </select>
                                </div>
                            </div>
                            {createError && <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm">{createError}</div>}
                            <div className="flex justify-end gap-3 pt-4">
                                <button type="button" onClick={() => { setShowCreateModal(false); setCreateError(''); }} className="px-4 py-2 rounded-lg border border-border-dark text-white font-medium hover:bg-background-dark transition-colors" disabled={isCreating}>Cancel</button>
                                <button type="submit" disabled={isCreating} className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-gradient-primary text-white font-bold shadow-lg shadow-blue-900/50 hover:shadow-blue-900/70 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
                                    {isCreating ? <><span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>Creating...</> : <><span className="material-symbols-outlined text-lg">check</span>Create</>}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit User Modal */}
            {showEditModal && selectedUser && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowEditModal(false)}></div>
                    <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                        <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface">
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-amber-400">edit</span>
                                Edit Team Member
                            </h2>
                        </div>
                        <form onSubmit={handleEditUser} className="p-6 space-y-4">
                            <div className="flex items-center gap-3 p-3 bg-background-dark/50 rounded-lg mb-2">
                                <div className="size-10 rounded-full bg-gradient-primary flex items-center justify-center">
                                    <span className="text-white font-bold">{selectedUser.name.charAt(0).toUpperCase()}</span>
                                </div>
                                <div>
                                    <p className="text-white font-medium">{selectedUser.name}</p>
                                    <p className="text-text-secondary text-xs">{selectedUser.employeeId}</p>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Full Name</label>
                                <input type="text" className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white placeholder-text-secondary/50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Email</label>
                                <input type="email" className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white placeholder-text-secondary/50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Role</label>
                                    <select className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none cursor-pointer" value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                                        <option value="MANAGER">Manager</option>
                                        <option value="EMPLOYEE">Employee</option>
                                        <option value="INTERN">Intern</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Department</label>
                                    <select className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none cursor-pointer" value={editForm.department} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}>
                                        <option value="SOFTWARE">Software</option>
                                        <option value="HARDWARE">Hardware</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">New Password (leave blank to keep current)</label>
                                <input type="password" className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white placeholder-text-secondary/50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none" placeholder="••••••••" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} />
                            </div>
                            {editError && <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm">{editError}</div>}
                            <div className="flex justify-end gap-3 pt-4">
                                <button type="button" onClick={() => { setShowEditModal(false); setEditError(''); }} className="px-4 py-2 rounded-lg border border-border-dark text-white font-medium hover:bg-background-dark transition-colors" disabled={isEditing}>Cancel</button>
                                <button type="submit" disabled={isEditing} className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-amber-500 text-white font-bold shadow-lg hover:bg-amber-600 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
                                    {isEditing ? <><span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>Saving...</> : <><span className="material-symbols-outlined text-lg">check</span>Save Changes</>}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* User Details Modal */}
            {showDetailsModal && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowDetailsModal(false); setUserDetails(null); }}></div>
                    <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface shrink-0">
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">person</span>
                                Team Member Details
                            </h2>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1">
                            {loadingDetails ? (
                                <p className="text-text-secondary text-center py-8">Loading details...</p>
                            ) : userDetails ? (
                                <div className="space-y-6">
                                    <div className="flex items-center gap-4">
                                        <div className="size-16 rounded-full bg-gradient-primary flex items-center justify-center">
                                            <span className="text-white font-bold text-2xl">{userDetails.name.charAt(0).toUpperCase()}</span>
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold text-white">{userDetails.name}</h3>
                                            <p className="text-text-secondary">{userDetails.email}</p>
                                            <div className="flex gap-2 mt-1">
                                                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${userDetails.role === 'EMPLOYEE' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>{userDetails.role}</span>
                                                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${userDetails.department === 'SOFTWARE' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-amber-500/20 text-amber-400'}`}>{userDetails.department || 'Unassigned'}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        {/* Performance Summary */}
                                        {userPerformance?.stats && (
                                            <div className="bg-background-dark/50 border border-border-dark rounded-xl p-4 mb-6">
                                                <h4 className="text-sm font-medium uppercase tracking-wider text-text-secondary mb-4 flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-base">insights</span>
                                                    Performance Summary
                                                </h4>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                    <div className="text-center">
                                                        <p className="text-2xl font-bold text-white">
                                                            {userPerformance.stats.averagePerformance ? `${userPerformance.stats.averagePerformance}%` : '-'}
                                                        </p>
                                                        <p className="text-xs text-text-secondary">Avg Performance</p>
                                                    </div>
                                                    <div className="text-center">
                                                        <p className="text-2xl font-bold text-green-400">{userPerformance.stats.excellentCount}</p>
                                                        <p className="text-xs text-text-secondary">🚀 Excellent (≥150%)</p>
                                                    </div>
                                                    <div className="text-center">
                                                        <p className="text-2xl font-bold text-blue-400">{userPerformance.stats.onTimeCount}</p>
                                                        <p className="text-xs text-text-secondary">✅ On Time (90-149%)</p>
                                                    </div>
                                                    <div className="text-center">
                                                        <p className="text-2xl font-bold text-yellow-400">{userPerformance.stats.lateCount}</p>
                                                        <p className="text-xs text-text-secondary">⚠️ Late (&lt;90%)</p>
                                                    </div>
                                                </div>
                                                <div className="mt-4 pt-4 border-t border-border-dark/50 flex justify-between text-sm">
                                                    <span className="text-text-secondary">Total Tasks: <span className="text-white">{userPerformance.stats.totalTasks}</span></span>
                                                    <span className="text-text-secondary">Completed: <span className="text-green-400">{userPerformance.stats.completedTasks}</span></span>
                                                    <span className="text-text-secondary">Pending: <span className="text-yellow-400">{userPerformance.stats.pendingTasks}</span></span>
                                                </div>
                                            </div>
                                        )}

                                        <h4 className="text-sm font-medium uppercase tracking-wider text-text-secondary mb-3 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-base">folder</span>
                                            Assigned Projects ({userDetails.projects?.length || 0})
                                        </h4>
                                        {userDetails.projects?.length > 0 ? (
                                            <div className="space-y-2">
                                                {userDetails.projects.map((project) => (
                                                    <div key={project.id} className="bg-background-dark/50 border border-border-dark rounded-lg px-4 py-3 flex items-center justify-between">
                                                        <span className="text-white font-medium">{project.name}</span>
                                                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${project.status === 'ACTIVE' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>{project.status}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : <p className="text-text-secondary text-sm">No projects assigned.</p>}
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-medium uppercase tracking-wider text-text-secondary mb-3 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-base">task_alt</span>
                                            Task History ({userTasks.length})
                                        </h4>
                                        {loadingTasks ? (
                                            <p className="text-text-secondary text-sm">Loading tasks...</p>
                                        ) : userTasks.length > 0 ? (
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="text-text-secondary text-left border-b border-border-dark">
                                                            <th className="pb-2 font-medium">Task</th>
                                                            <th className="pb-2 font-medium">Allocated</th>
                                                            <th className="pb-2 font-medium">Actual</th>
                                                            <th className="pb-2 font-medium text-right">Performance</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-border-dark/50">
                                                        {userTasks.map((task) => {
                                                            const getPerformanceBadge = (score) => {
                                                                if (!score && score !== 0) return { emoji: '⏳', color: 'text-gray-400', label: 'Pending' };
                                                                if (score >= 150) return { emoji: '🚀', color: 'text-green-400', label: `${score}%` };
                                                                if (score >= 90) return { emoji: '✅', color: 'text-blue-400', label: `${score}%` };
                                                                if (score >= 50) return { emoji: '⚠️', color: 'text-yellow-400', label: `${score}%` };
                                                                return { emoji: '❌', color: 'text-red-400', label: `${score}%` };
                                                            };
                                                            const badge = getPerformanceBadge(task.performanceScore);

                                                            return (
                                                                <tr key={task.id} className="hover:bg-background-dark/30">
                                                                    <td className="py-2">
                                                                        <div className="text-white font-medium">{task.title}</div>
                                                                        <div className="text-xs text-text-secondary">{task.projectCode}</div>
                                                                    </td>
                                                                    <td className="py-2 text-text-secondary">
                                                                        {task.allocatedFormatted || '-'}
                                                                    </td>
                                                                    <td className="py-2 text-text-secondary">
                                                                        {task.actualFormatted || (task.status === 'COMPLETED' ? '-' : '⏳')}
                                                                    </td>
                                                                    <td className="py-2 text-right">
                                                                        <span className={`font-semibold ${badge.color}`}>
                                                                            {badge.emoji} {badge.label}
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : <p className="text-text-secondary text-sm">No tasks assigned.</p>}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                        <div className="px-6 py-4 border-t border-border-dark flex justify-end shrink-0">
                            <button type="button" onClick={() => { setShowDetailsModal(false); setUserDetails(null); }} className="px-4 py-2 rounded-lg border border-border-dark text-white font-medium hover:bg-background-dark transition-colors">Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && selectedUser && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowDeleteConfirm(false); setSelectedUser(null); }}></div>
                    <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                        <div className="px-6 py-4 border-b border-border-dark bg-red-500/10">
                            <h2 className="text-lg font-semibold text-red-400 flex items-center gap-2">
                                <span className="material-symbols-outlined">warning</span>
                                Confirm Deletion
                            </h2>
                        </div>
                        <div className="p-6">
                            <p className="text-white mb-2">Are you sure you want to delete <strong>{selectedUser.name}</strong>?</p>
                            <p className="text-text-secondary text-sm">This will remove them from all projects and delete all their assigned tasks. This action cannot be undone.</p>
                        </div>
                        <div className="px-6 py-4 border-t border-border-dark flex justify-end gap-3">
                            <button type="button" onClick={() => { setShowDeleteConfirm(false); setSelectedUser(null); }} className="px-4 py-2 rounded-lg border border-border-dark text-white font-medium hover:bg-background-dark transition-colors">Cancel</button>
                            <button type="button" onClick={handleDeleteUser} className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-red-500 text-white font-bold hover:bg-red-600 transition-colors">
                                <span className="material-symbols-outlined text-lg">delete</span>Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </SuperUserLayout>
    );
}
