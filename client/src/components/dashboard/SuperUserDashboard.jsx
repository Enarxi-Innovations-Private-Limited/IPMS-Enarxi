import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../../services/api.js';
import SuperUserLayout from '../common/SuperUserLayout.jsx';

export default function SuperUserDashboard() {
  const navigate = useNavigate();
  const location = useLocation();

  // Determine current page from route
  const getCurrentPage = () => {
    if (location.pathname === '/super' || location.pathname === '/super/') return 'dashboard';
    if (location.pathname === '/super/projects') return 'projects';
    if (location.pathname === '/super/teams') return 'teams';
    if (location.pathname === '/super/reports') return 'reports';
    if (location.pathname === '/super/settings') return 'settings';
    return 'dashboard';
  };

  const currentPage = getCurrentPage();
  const [projects, setProjects] = useState([]);
  const [summary, setSummary] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [availableUsers, setAvailableUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [pendingDelayTasks, setPendingDelayTasks] = useState([]);
  const [notification, setNotification] = useState(null);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [rejectionTaskId, setRejectionTaskId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [projRes, summaryRes, actRes, taskRes] = await Promise.all([
        api.get('/projects'),
        api.get('/projects/summary'),
        api.get('/activities'),
        api.get('/tasks')
      ]);
      setProjects(Array.isArray(projRes.data) ? projRes.data : []);
      setSummary(summaryRes.data);
      setActivities(actRes.data.slice(0, 10)); // Show only recent 10

      // Filter tasks for pending admin delay approval
      const tasks = Array.isArray(taskRes.data) ? taskRes.data : [];
      setPendingDelayTasks(tasks.filter(t => t.delayStatus === 'PENDING_ADMIN'));

    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminDelayReview = async (taskId, approved, rejectionReason = '') => {
    try {
      const payload = { approved };
      if (!approved) payload.rejectionReason = rejectionReason;

      await api.put(`/tasks/${taskId}/delay/admin-review`, payload);

      // Remove from local list
      setPendingDelayTasks(prev => prev.filter(t => t.id !== taskId && t._id !== taskId));
      // Refresh data to keep stats in sync
      loadData();
      setNotification({ message: 'Delay review submitted', type: 'success' });
    } catch (err) {
      console.error('Failed to review delay:', err);
      setNotification({ message: 'Failed to submit review', type: 'error' });
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);





  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      const res = await api.get('/users');
      console.log('Loaded users:', res.data); // Debug log
      setAvailableUsers(res.data);
      return res.data;
    } catch (err) {
      console.error('Error loading users:', err); // Debug log
      setError(err.response?.data?.message || 'Failed to load users');
      return [];
    } finally {
      setLoadingUsers(false);
    }
  };



  return (
    <SuperUserLayout currentPage={currentPage}>
      <div className="p-6 lg:px-12 pb-24">
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
              <h1 className="text-3xl md:text-4xl font-bold text-[#556070] tracking-tight mb-2">Dashboard Overview</h1>
              <p className="text-text-secondary text-lg">Monitor your projects, teams, and overall performance.</p>
            </div>
            <div className="flex gap-3">
            </div>
          </div>

          {loading && (
            <div className="bg-surface-dark border border-border-dark rounded-xl p-8 text-center">
              <p className="text-text-secondary">Loading dashboard...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          {!loading && summary && (
            <>
              {/* Stats Grid */}
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div
                  onClick={() => navigate('/super/projects')}
                  className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm cursor-pointer hover:border-primary/50 hover:bg-slate-50 transition-all group"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider group-hover:text-[#556070] transition-colors">Total Projects</h3>
                    <span className="material-symbols-outlined text-primary">folder</span>
                  </div>
                  <p className="text-3xl font-bold text-[#556070]">{summary.total}</p>
                </div>
                <div
                  onClick={() => navigate('/super/projects?filter=ACTIVE')}
                  className="bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl cursor-pointer hover:border-green-500/50 hover:bg-surface-dark/80 transition-all group"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider group-hover:text-[#556070] transition-colors">Active</h3>
                    <span className="material-symbols-outlined text-green-500">trending_up</span>
                  </div>
                  <p className="text-3xl font-bold text-[#556070]">{summary.active}</p>
                </div>
                <div
                  onClick={() => navigate('/super/projects?filter=COMPLETED')}
                  className="bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl cursor-pointer hover:border-blue-500/50 hover:bg-surface-dark/80 transition-all group"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider group-hover:text-[#556070] transition-colors">Completed</h3>
                    <span className="material-symbols-outlined text-blue-500">check_circle</span>
                  </div>
                  <p className="text-3xl font-bold text-[#556070]">{summary.completed}</p>
                </div>
                <div
                  onClick={() => navigate('/super/projects?filter=DELAYED')}
                  className="bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl cursor-pointer hover:border-red-500/50 hover:bg-surface-dark/80 transition-all group"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider group-hover:text-[#556070] transition-colors">Delayed</h3>
                    <span className="material-symbols-outlined text-red-500">warning</span>
                  </div>
                  <p className="text-3xl font-bold text-[#556070]">{summary.delayed}</p>
                </div>
              </div>

              {/* Pending Project Closure Approvals Widget */}
              {projects.some(p => p.status === 'WAITING_APPROVAL') && (
                <div className="bg-yellow-50 border border-yellow-300 rounded-xl shadow-sm overflow-hidden mb-8">
                  <div className="px-6 py-4 border-b border-yellow-200 bg-yellow-100/50 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                      <span className="material-symbols-outlined text-yellow-600">pending_actions</span>
                      Pending Project Closure Approvals ({projects.filter(p => p.status === 'WAITING_APPROVAL').length})
                    </h2>
                    <button
                      onClick={() => navigate('/super/projects?filter=WAITING_APPROVAL')}
                      className="text-xs font-bold text-yellow-800 hover:underline cursor-pointer"
                    >
                      View Projects
                    </button>
                  </div>
                  <div className="p-4 grid gap-4 md:grid-cols-2">
                    {projects.filter(p => p.status === 'WAITING_APPROVAL').map(p => (
                      <div key={p.id || p._id} className="bg-white border border-yellow-200 rounded-lg p-4 flex items-center justify-between">
                        <div>
                          <h4 className="font-bold text-slate-900">{p.name}</h4>
                          <p className="text-xs text-slate-500 font-mono">{p.projectCode || p.id}</p>
                          <p className="text-xs text-slate-600 mt-1">Manager: {p.managerName || 'Assigned Manager'}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              try {
                                await api.put(`/projects/${p.id || p._id}/status`, { status: 'COMPLETED' });
                                loadData();
                              } catch (err) {
                                setError('Failed to approve project closure');
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-sm">check_circle</span>
                            Approve
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                await api.put(`/projects/${p.id || p._id}/status`, { status: 'ACTIVE' });
                                loadData();
                              } catch (err) {
                                setError('Failed to reject project closure');
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-sm">cancel</span>
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pending Delay Approvals Widget */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-8">
                <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface">
                  <h2 className="text-lg font-semibold text-[#556070] flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-500">warning</span>
                    Pending Delay Approvals ({pendingDelayTasks.length})
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  {pendingDelayTasks.length > 0 ? (
                    <table className="w-full">
                      <thead className="bg-[#ECF1FF]/50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Task</th>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Project</th>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Assignee</th>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Reason</th>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-dark">
                        {pendingDelayTasks.map(task => (
                          <tr key={task.id || task._id} className="hover:bg-slate-50">
                            <td className="px-6 py-4 text-[#556070] font-medium">{task.title}</td>
                            <td className="px-6 py-4 text-text-secondary text-sm">{task.projectName || task.projectCode}</td>
                            <td className="px-6 py-4 text-text-secondary text-sm">
                              {availableUsers.find(u => u.id === task.assigneeId)?.name || 'Unknown'}
                            </td>
                            <td className="px-6 py-4 text-text-secondary text-sm italic">"{task.delayReason}"</td>
                            <td className="px-6 py-4">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleAdminDelayReview(task.id || task._id, true)}
                                  className="px-3 py-1 bg-green-600/20 text-green-400 border border-green-600/30 rounded text-xs font-bold hover:bg-green-600/30"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => {
                                    setRejectionTaskId(task.id || task._id);
                                    setRejectionReason('');
                                    setShowRejectionModal(true);
                                  }}
                                  className="px-3 py-1 bg-red-600/20 text-red-400 border border-red-600/30 rounded text-xs font-bold hover:bg-red-600/30"
                                >
                                  Reject
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-8 text-center text-text-secondary">
                      <span className="material-symbols-outlined text-4xl mb-2 opacity-50">check_circle</span>
                      <p>No pending delay approvals.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Projects Table */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-8">
                <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface">
                  <h2 className="text-lg font-semibold text-[#556070] flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">folder</span>
                    Projects
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-[#ECF1FF]/50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                          Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                          Completion
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-dark">
                      {projects.map((p) => {
                        const totalTasks = p.taskCount || 0;
                        const completedTasks = p.completedTaskCount || 0;
                        const completion = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
                        return (
                          <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-[#556070] font-medium">{p.name}</div>
                              <div className="text-text-secondary text-sm mt-1">{p.description || 'No description'}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`px-2 py-1 text-xs font-medium rounded-full ${p.status === 'ACTIVE'
                                  ? 'bg-green-500/20 text-green-400'
                                  : 'bg-blue-500/20 text-blue-400'
                                  }`}
                              >
                                {p.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-background-dark rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-gradient-primary transition-all"
                                    style={{ width: `${completion}%` }}
                                  ></div>
                                </div>
                                <span className="text-text-secondary text-sm w-12">{completion}%</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <button
                                onClick={() => navigate(`/super/projects?projectId=${p.id}`)}
                                className="text-primary hover:text-blue-400 text-sm font-medium"
                              >
                                View Details
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {projects.length === 0 && (
                        <tr>
                          <td colSpan="4" className="px-6 py-8 text-center text-text-secondary">
                            No projects yet. Create your first project to get started.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface">
                  <h2 className="text-lg font-semibold text-[#556070] flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">history</span>
                    Recent Activity
                  </h2>
                </div>
                <div className="p-6">
                  <ul className="space-y-3">
                    {activities.map((a) => (
                      <li key={a.id} className="flex items-center gap-3 text-sm">
                        <span className="material-symbols-outlined text-primary text-lg">circle</span>
                        <span className="text-[#556070] flex-1">
                          <span className="font-medium">{a.action}</span>
                          {a.details && (
                            <span className="text-text-secondary ml-2">
                              {typeof a.details === 'object' ? JSON.stringify(a.details) : a.details}
                            </span>
                          )}
                        </span>
                        <span className="text-text-secondary text-xs">
                          {new Date(a.createdAt).toLocaleString()}
                        </span>
                      </li>
                    ))}
                    {activities.length === 0 && (
                      <li className="text-text-secondary text-center py-4">No activity yet.</li>
                    )}
                  </ul>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {/* Notification Toast */}
      {notification && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[10000] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className={`${notification.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'} text-[#556070] px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 font-bold`}>
            <span className="material-symbols-outlined">{notification.type === 'error' ? 'error' : 'check_circle'}</span>
            {notification.message}
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {showRejectionModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-border-dark bg-red-500/10">
              <h2 className="text-lg font-semibold text-red-400 flex items-center gap-2">
                <span className="material-symbols-outlined">feedback</span>
                Reject Delay Request
              </h2>
            </div>
            <div className="p-6">
              <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Rejection Reason</label>
              <textarea
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-[#556070] placeholder-text-secondary/30 focus:ring-2 focus:ring-red-500/50 outline-none resize-none h-32"
                placeholder="Enter reason for rejection..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              />
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  onClick={() => setShowRejectionModal(false)}
                  className="px-4 py-2 text-[#556070] hover:bg-slate-50 rounded-lg transition-colors"
                >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (rejectionReason.trim()) {
                    handleAdminDelayReview(rejectionTaskId, false, rejectionReason);
                    setShowRejectionModal(false);
                  }
                }}
                disabled={!rejectionReason.trim()}
                className="px-6 py-2 bg-red-500 hover:bg-red-600 text-[#556070] rounded-lg font-bold shadow-lg shadow-red-900/40 transition-all disabled:opacity-50"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </SuperUserLayout>
  );
}
