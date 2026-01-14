import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api.js';
import ManagerLayout from '../common/ManagerLayout.jsx';
import { getCurrentUser } from '../../services/authService.js';

export default function ManagerTeamPage() {
    const navigate = useNavigate();
    const currentUser = getCurrentUser();
    const [teamMembers, setTeamMembers] = useState([]);
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterRole, setFilterRole] = useState('ALL');

    // Modal states
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [userTasks, setUserTasks] = useState([]);
    const [loadingTasks, setLoadingTasks] = useState(false);

    const [managerDepartment, setManagerDepartment] = useState(currentUser?.department || null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);

            // Fetch current user info to get department (in case it wasn't in the stored token)
            let department = currentUser?.department;
            if (!department) {
                try {
                    const meRes = await api.get('/auth/me');
                    department = meRes.data.department;
                    setManagerDepartment(department);
                } catch (e) {
                    console.error('Failed to get current user info');
                }
            }

            const [usersRes, projectsRes] = await Promise.all([
                api.get('/users'),
                api.get('/projects')
            ]);

            // Filter to only show users from the same department as the manager
            // Only show EMPLOYEE and INTERN roles (not other managers, super users, etc.)
            const teamUsers = usersRes.data.filter(u =>
                u.department === department &&
                ['EMPLOYEE', 'INTERN'].includes(u.role)
            );

            setTeamMembers(teamUsers);
            setProjects(projectsRes.data);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load team data');
        } finally {
            setLoading(false);
        }
    };

    const [userPerformance, setUserPerformance] = useState(null);

    const loadUserPerformance = async (userId) => {
        try {
            setLoadingTasks(true);
            const res = await api.get(`/users/${userId}/performance`);
            setUserPerformance(res.data);
            setUserTasks(res.data.tasks || []);
        } catch (err) {
            console.error('Failed to load user performance:', err);
            // Fallback to basic tasks if performance endpoint fails
            try {
                const tasksRes = await api.get('/tasks');
                const filtered = tasksRes.data.filter(t => t.assigneeId === userId);
                setUserTasks(filtered);
            } catch (e) {
                console.error('Failed to load tasks:', e);
            }
        } finally {
            setLoadingTasks(false);
        }
    };

    const handleViewDetails = async (user) => {
        setSelectedUser(user);
        setUserPerformance(null);
        setUserTasks([]);
        setShowDetailsModal(true);
        await loadUserPerformance(user.id);
    };

    // Get projects a user is assigned to
    const getUserProjects = (userId) => {
        return projects.filter(p => p.assignedUsers?.includes(userId));
    };

    // Filter team members
    const filteredMembers = teamMembers.filter((m) => {
        const matchesSearch = searchQuery === '' ||
            m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.employeeId?.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesRole = filterRole === 'ALL' || m.role === filterRole;

        return matchesSearch && matchesRole;
    });

    // Stats
    const totalEmployees = teamMembers.filter(m => m.role === 'EMPLOYEE').length;
    const totalInterns = teamMembers.filter(m => m.role === 'INTERN').length;

    const getRoleBadgeColor = (role) => {
        switch (role) {
            case 'EMPLOYEE': return 'bg-blue-500/20 text-blue-400';
            case 'INTERN': return 'bg-purple-500/20 text-purple-400';
            default: return 'bg-gray-500/20 text-gray-400';
        }
    };

    return (
        <ManagerLayout currentPage="team">
            <div className="p-6 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    {/* Breadcrumb */}
                    <nav aria-label="Breadcrumb" className="flex mb-6">
                        <ol className="inline-flex items-center space-x-2">
                            <li>
                                <button
                                    onClick={() => navigate('/manager')}
                                    className="text-text-secondary hover:text-white text-sm font-medium transition-colors"
                                >
                                    Dashboard
                                </button>
                            </li>
                            <li className="flex items-center">
                                <span className="material-symbols-outlined text-text-secondary text-base">chevron_right</span>
                                <span className="ml-2 text-white text-sm font-medium">Team</span>
                            </li>
                        </ol>
                    </nav>

                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
                        <div>
                            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">
                                {managerDepartment === 'SOFTWARE' ? 'Software' : managerDepartment === 'HARDWARE' ? 'Hardware' : 'My'} Team
                            </h1>
                            <p className="text-text-secondary text-lg">View all team members in your department and their assigned tasks.</p>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div className="bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider">Total Team</h3>
                                <span className="material-symbols-outlined text-emerald-500">group</span>
                            </div>
                            <p className="text-3xl font-bold text-white">{teamMembers.length}</p>
                        </div>
                        <div className="bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider">Employees</h3>
                                <span className="material-symbols-outlined text-blue-500">person</span>
                            </div>
                            <p className="text-3xl font-bold text-white">{totalEmployees}</p>
                        </div>
                        <div className="bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider">Interns</h3>
                                <span className="material-symbols-outlined text-purple-500">school</span>
                            </div>
                            <p className="text-3xl font-bold text-white">{totalInterns}</p>
                        </div>
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
                                className="w-full pl-10 pr-4 py-2.5 bg-background-dark border border-border-dark rounded-lg text-white placeholder-text-secondary/50 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-3">
                            <select
                                className="px-4 py-2.5 bg-background-dark border border-border-dark rounded-lg text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none cursor-pointer"
                                value={filterRole}
                                onChange={(e) => setFilterRole(e.target.value)}
                            >
                                <option value="ALL">All Roles</option>
                                <option value="EMPLOYEE">Employees</option>
                                <option value="INTERN">Interns</option>
                            </select>
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-6">
                            {error}
                            <button onClick={() => setError('')} className="float-right">×</button>
                        </div>
                    )}

                    {/* Team Members Grid */}
                    <div className="bg-surface-dark border border-border-dark rounded-xl shadow-xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface">
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-emerald-500">group</span>
                                Team Members
                                <span className="ml-2 px-2 py-0.5 bg-background-dark rounded-full text-xs text-text-secondary">
                                    {filteredMembers.length}
                                </span>
                            </h2>
                        </div>
                        <div className="p-6">
                            {loading ? (
                                <div className="text-center py-8">
                                    <p className="text-text-secondary">Loading team members...</p>
                                </div>
                            ) : filteredMembers.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {filteredMembers.map((member) => (
                                        <div
                                            key={member.id}
                                            className="bg-background-dark/50 border border-border-dark rounded-lg p-4 hover:bg-background-dark hover:border-emerald-500/30 transition-all group"
                                        >
                                            <div className="flex items-start gap-4">
                                                <div className="size-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
                                                    <span className="text-white font-bold text-lg">
                                                        {member.name.charAt(0).toUpperCase()}
                                                    </span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="text-white font-semibold truncate">{member.name}</h3>
                                                    <p className="text-text-secondary text-sm">{member.employeeId}</p>
                                                    <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full ${getRoleBadgeColor(member.role)}`}>
                                                        {member.role}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Projects assigned */}
                                            <div className="mt-3 pt-3 border-t border-border-dark">
                                                <p className="text-text-secondary text-xs mb-2">Assigned Projects:</p>
                                                <div className="flex flex-wrap gap-1">
                                                    {getUserProjects(member.id).slice(0, 3).map(p => (
                                                        <span key={p.id} className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded text-xs font-mono">
                                                            {p.projectCode}
                                                        </span>
                                                    ))}
                                                    {getUserProjects(member.id).length > 3 && (
                                                        <span className="px-2 py-0.5 bg-surface-dark text-text-secondary rounded text-xs">
                                                            +{getUserProjects(member.id).length - 3} more
                                                        </span>
                                                    )}
                                                    {getUserProjects(member.id).length === 0 && (
                                                        <span className="text-text-secondary text-xs">None</span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex gap-2 mt-4">
                                                <button
                                                    onClick={() => handleViewDetails(member)}
                                                    className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-base">visibility</span>
                                                    View Details
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-text-secondary text-center py-8">No team members found.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* User Details Modal */}
            {showDetailsModal && selectedUser && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowDetailsModal(false); setSelectedUser(null); setUserTasks([]); setUserPerformance(null); }}></div>
                    <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface shrink-0">
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-emerald-500">person</span>
                                Team Member Details & Performance
                            </h2>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1">
                            <div className="space-y-6">
                                {/* User Info */}
                                <div className="flex items-center gap-4">
                                    <div className="size-16 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                                        <span className="text-white font-bold text-2xl">{selectedUser.name.charAt(0).toUpperCase()}</span>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white">{selectedUser.name}</h3>
                                        <p className="text-text-secondary">{selectedUser.email}</p>
                                        <div className="flex gap-2 mt-1">
                                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getRoleBadgeColor(selectedUser.role)}`}>
                                                {selectedUser.role}
                                            </span>
                                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-surface-dark text-text-secondary">
                                                {selectedUser.employeeId}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Performance Summary */}
                                {userPerformance?.stats && (
                                    <div className="bg-background-dark/50 border border-border-dark rounded-xl p-4">
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

                                {/* Projects */}
                                <div>
                                    <h4 className="text-sm font-medium uppercase tracking-wider text-text-secondary mb-3 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-base">folder</span>
                                        Assigned Projects ({getUserProjects(selectedUser.id).length})
                                    </h4>
                                    {getUserProjects(selectedUser.id).length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {getUserProjects(selectedUser.id).map((project) => (
                                                <span key={project.id} className="px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg text-sm font-mono">
                                                    {project.projectCode}
                                                </span>
                                            ))}
                                        </div>
                                    ) : <p className="text-text-secondary text-sm">No projects assigned.</p>}
                                </div>

                                {/* Task History */}
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
                        </div>
                        <div className="px-6 py-4 border-t border-border-dark flex justify-end shrink-0">
                            <button
                                type="button"
                                onClick={() => { setShowDetailsModal(false); setSelectedUser(null); setUserTasks([]); setUserPerformance(null); }}
                                className="px-4 py-2 rounded-lg border border-border-dark text-white font-medium hover:bg-background-dark transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ManagerLayout>
    );
}
