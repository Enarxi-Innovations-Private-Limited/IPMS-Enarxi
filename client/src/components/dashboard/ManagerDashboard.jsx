import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import api from '../../services/api.js';
import ManagerLayout from '../common/ManagerLayout.jsx';
import { getCurrentUser } from '../../services/authService.js';
import TaskDetailModal from '../tasks/TaskDetailModal.jsx';

export default function ManagerDashboard() {
    const navigate = useNavigate();
    const location = useLocation();
    const user = getCurrentUser();
    const [projects, setProjects] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [users, setUsers] = useState([]);

    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    // Task Modal State
    const [selectedTask, setSelectedTask] = useState(null);
    const [showTaskModal, setShowTaskModal] = useState(false);

    const getCurrentPage = () => {
        if (location.pathname === '/engineer' || location.pathname === '/engineer/') return 'dashboard';
        if (location.pathname === '/engineer/projects') return 'projects';
        if (location.pathname === '/engineer/tasks') return 'tasks';
        if (location.pathname === '/engineer/team') return 'team';
        return 'dashboard';
    };

    const currentPage = getCurrentPage();

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

    const handleTaskClick = (task) => {
        setSelectedTask(task);
        setShowTaskModal(true);
    };

    const handleTaskUpdate = async () => {
        await loadData();
        // Also update the selected task object if it's still open
        // (loadData updates the 'tasks' array, we might need to sync selectedTask if we want live updates,
        // but typically closing and reopening or relying on the modal's internal state is enough for simple interactions.
        // TaskDetailModal usually handles its own internal state for comments/queries, but let's re-fetch to be safe)
    };

    // Calculate stats
    const activeProjects = projects.filter((p) => p.status === 'ACTIVE').length;
    const completedProjects = projects.filter((p) => p.status === 'COMPLETED').length;
    const inProgressTasks = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
    const completedTasks = tasks.filter((t) => t.status === 'COMPLETED').length;
    const teamMembers = users.length;

    return (
        <ManagerLayout currentPage={currentPage}>
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    {/* Breadcrumb */}
                    <nav aria-label="Breadcrumb" className="flex mb-6">
                        <ol className="inline-flex items-center space-x-2">
                            <li>
                                <span className="text-[#556070] text-sm font-medium">Dashboard</span>
                            </li>
                        </ol>
                    </nav>

                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                        <div>
                            <h1 className="text-3xl md:text-4xl font-bold text-[#556070] tracking-tight mb-2">
                                Welcome back, {user?.name?.split(' ')[0] || 'Manager'}!
                            </h1>
                            <p className="text-text-secondary text-lg">
                                Manage your team's projects and track progress.
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => navigate('/engineer/projects')}
                                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold shadow-lg shadow-emerald-900/50 hover:shadow-emerald-900/70 hover:scale-[1.02] transition-all"
                            >
                                <span className="material-symbols-outlined text-lg">folder</span>
                                View Projects
                            </button>
                        </div>
                    </div>

                    {loading && (
                        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-8 text-center">
                            <p className="text-text-secondary">Loading dashboard...</p>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-6">
                            {error}
                        </div>
                    )}

                    {!loading && (
                        <>
                            {/* Stats Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                                <div
                                    onClick={() => navigate('/engineer/projects')}
                                    className="bg-white border border-slate-200 shadow-sm cursor-pointer hover:border-emerald-500/50 transition-all group"
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider group-hover:text-[#1e293b] transition-colors">Total Projects</h3>
                                        <span className="material-symbols-outlined text-emerald-500">folder</span>
                                    </div>
                                    <p className="text-3xl font-bold text-[#556070]">{projects.length}</p>
                                    <p className="text-text-secondary text-sm mt-1">{activeProjects} active</p>
                                </div>
                                <div
                                    onClick={() => navigate('/engineer/tasks')}
                                    className="bg-white border border-slate-200 shadow-sm cursor-pointer hover:border-blue-500/50 transition-all group"
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider group-hover:text-[#1e293b] transition-colors">Active Tasks</h3>
                                        <span className="material-symbols-outlined text-blue-500">task_alt</span>
                                    </div>
                                    <p className="text-3xl font-bold text-[#556070]">{inProgressTasks}</p>
                                    <p className="text-text-secondary text-sm mt-1">{completedTasks} completed</p>
                                </div>
                                <div
                                    onClick={() => navigate('/engineer/team')}
                                    className="bg-white border border-slate-200 shadow-sm cursor-pointer hover:border-purple-500/50 transition-all group"
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider group-hover:text-[#1e293b] transition-colors">Team Members</h3>
                                        <span className="material-symbols-outlined text-purple-500">group</span>
                                    </div>
                                    <p className="text-3xl font-bold text-[#556070]">{teamMembers}</p>
                                    <p className="text-text-secondary text-sm mt-1">Employees & Interns</p>
                                </div>
                                <div className="bg-white border border-slate-200 shadow-sm">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider">Completion Rate</h3>
                                        <span className="material-symbols-outlined text-green-500">trending_up</span>
                                    </div>
                                    <p className="text-3xl font-bold text-[#556070]">
                                        {tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0}%
                                    </p>
                                    <p className="text-text-secondary text-sm mt-1">Overall progress</p>
                                </div>
                            </div>

                            {/* Pending Delay Reviews Alert */}
                            {tasks.some(t => t.delayStatus === 'PENDING_MANAGER') && (
                                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-8 flex items-center justify-between shadow-lg shadow-amber-900/10">
                                    <div className="flex items-center gap-4">
                                        <div className="size-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                                            <span className="material-symbols-outlined text-amber-500 text-xl">warning</span>
                                        </div>
                                        <div>
                                            <h3 className="text-[#556070] font-bold text-base">Pending Delay Reviews</h3>
                                            <p className="text-amber-200/80 text-sm">
                                                You have {tasks.filter(t => t.delayStatus === 'PENDING_MANAGER').length} task(s) requesting delay approval.
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => navigate('/engineer/tasks', { state: { filter: 'DELAYED' } })}
                                        className="px-4 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition-colors text-sm"
                                    >
                                        Review Now
                                    </button>
                                </div>
                            )}

                            {/* Projects Overview */}
                            <div className="bg-white border border-slate-200 shadow-sm rounded-xl shadow-xl overflow-hidden mb-8">
                                <div className="px-4 py-3 md:px-6 md:py-4 border-b border-slate-200 shadow-sm bg-slate-50 flex items-center justify-between">
                                    <h2 className="text-lg font-semibold text-[#556070] flex items-center gap-2">
                                        <span className="material-symbols-outlined text-emerald-500">folder</span>
                                        Recent Projects
                                    </h2>
                                    <button
                                        onClick={() => navigate('/engineer/projects')}
                                        className="text-emerald-400 hover:text-emerald-300 text-sm font-medium"
                                    >
                                        View All →
                                    </button>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                                                    Project
                                                </th>
                                                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                                                    Status
                                                </th>
                                                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                                                    Tasks
                                                </th>
                                                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                                                    Progress
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border-dark">
                                            {projects.slice(0, 5).map((p) => {
                                                const projectTasks = tasks.filter((t) => t.projectId === p.id);
                                                const completed = projectTasks.filter((t) => t.status === 'COMPLETED').length;
                                                const progress = projectTasks.length > 0 ? Math.round((completed / projectTasks.length) * 100) : 0;
                                                return (
                                                    <tr key={p.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => navigate(`/engineer/projects?projectId=${p.id}`)}>
                                                        <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                                                            <div className="text-[#556070] font-medium">{p.name}</div>
                                                            <div className="text-text-secondary text-sm mt-1">{p.description || 'No description'}</div>
                                                        </td>
                                                        <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                                                            <span
                                                                className={`px-2 py-1 text-xs font-medium rounded-full ${p.status === 'ACTIVE'
                                                                    ? 'bg-green-500/20 text-green-400'
                                                                    : p.status === 'COMPLETED'
                                                                        ? 'bg-blue-500/20 text-blue-400'
                                                                        : 'bg-gray-500/20 text-gray-400'
                                                                    }`}
                                                            >
                                                                {p.status}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                                                            <span className="text-[#556070]">{projectTasks.length}</span>
                                                            <span className="text-text-secondary"> tasks</span>
                                                        </td>
                                                        <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                                                            <div className="flex items-center gap-2">
                                                                <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden w-24">
                                                                    <div
                                                                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-all"
                                                                        style={{ width: `${progress}%` }}
                                                                    ></div>
                                                                </div>
                                                                <span className="text-text-secondary text-sm w-12">{progress}%</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {projects.length === 0 && (
                                                <tr>
                                                    <td colSpan="4" className="px-6 py-8 text-center text-text-secondary">
                                                        No projects found. Projects assigned to your team will appear here.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Team Tasks Overview */}
                            <div className="bg-white border border-slate-200 shadow-sm rounded-xl shadow-xl overflow-hidden">
                                <div className="px-4 py-3 md:px-6 md:py-4 border-b border-slate-200 shadow-sm bg-slate-50 flex items-center justify-between">
                                    <h2 className="text-lg font-semibold text-[#556070] flex items-center gap-2">
                                        <span className="material-symbols-outlined text-emerald-500">task_alt</span>
                                        Recent Tasks
                                    </h2>

                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                                                    Task
                                                </th>
                                                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                                                    Project
                                                </th>
                                                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                                                    Assignee
                                                </th>
                                                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                                                    Status
                                                </th>
                                                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                                                    Queries
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border-dark">
                                            {tasks.slice(0, 5).map((t) => {
                                                const assignee = users.find((u) => u.id === t.assigneeId);
                                                const pendingQueries = t.queries?.filter(q => q.status === 'PENDING').length || 0;
                                                return (
                                                    <tr key={t.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => handleTaskClick(t)}>
                                                        <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                                                            <div className="text-[#556070] font-medium">{t.title}</div>
                                                            <div className="text-text-secondary text-sm mt-1">{t.description || 'No description'}</div>
                                                        </td>
                                                        <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                                                            <span className="text-[#556070]">{t.projectName || 'Unknown'}</span>
                                                        </td>
                                                        <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                                                            <div className="flex items-center gap-2">
                                                                <div className="size-6 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-center">
                                                                    <span className="text-white text-xs font-medium">
                                                                        {assignee?.name?.charAt(0)?.toUpperCase() || '?'}
                                                                    </span>
                                                                </div>
                                                                <span className="text-[#556070] text-sm">{assignee?.name || 'Unassigned'}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                                                            <span
                                                                className={`px-2 py-1 text-xs font-medium rounded-full ${t.status === 'COMPLETED'
                                                                    ? 'bg-green-500/20 text-green-400'
                                                                    : t.status === 'IN_PROGRESS'
                                                                        ? 'bg-blue-500/20 text-blue-400'
                                                                        : 'bg-gray-500/20 text-gray-400'
                                                                    }`}
                                                            >
                                                                {t.status.replace('_', ' ')}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                                                            {pendingQueries > 0 ? (
                                                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold border border-amber-500/30">
                                                                    <span className="material-symbols-outlined text-sm">help</span>
                                                                    {pendingQueries} Pending
                                                                </span>
                                                            ) : (
                                                                <span className="text-text-secondary text-xs">-</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {tasks.length === 0 && (
                                                <tr>
                                                    <td colSpan="5" className="px-6 py-8 text-center text-text-secondary">
                                                        No tasks found. Tasks from your team's projects will appear here.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                {/* View More Footer */}
                                <div className="p-3 border-t border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors flex justify-center cursor-pointer" onClick={() => navigate('/engineer/tasks')}>
                                    <button className="text-emerald-400 text-sm font-medium flex items-center gap-1">
                                        View More Tasks
                                        <span className="material-symbols-outlined text-base">expand_more</span>
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Task Details Modal */}
            {showTaskModal && selectedTask && (
                <TaskDetailModal
                    task={selectedTask}
                    users={users}
                    onClose={() => setShowTaskModal(false)}
                    onUpdate={handleTaskUpdate}
                />
            )}
        </ManagerLayout>
    );
}
