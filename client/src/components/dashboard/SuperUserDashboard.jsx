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

  const loadData = async () => {
    try {
      setLoading(true);
      const [projRes, summaryRes, actRes] = await Promise.all([
        api.get('/projects'),
        api.get('/projects/summary'),
        api.get('/activities'),
      ]);
      setProjects(projRes.data);
      setSummary(summaryRes.data);
      setActivities(actRes.data.slice(0, 10)); // Show only recent 10
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);





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
                <span className="text-white text-sm font-medium">Dashboard</span>
              </li>
            </ol>
          </nav>

          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">Dashboard Overview</h1>
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider">Total Projects</h3>
                    <span className="material-symbols-outlined text-primary">folder</span>
                  </div>
                  <p className="text-3xl font-bold text-white">{summary.total}</p>
                </div>
                <div className="bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider">Active</h3>
                    <span className="material-symbols-outlined text-green-500">trending_up</span>
                  </div>
                  <p className="text-3xl font-bold text-white">{summary.active}</p>
                </div>
                <div className="bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider">Completed</h3>
                    <span className="material-symbols-outlined text-blue-500">check_circle</span>
                  </div>
                  <p className="text-3xl font-bold text-white">{summary.completed}</p>
                </div>
                <div className="bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider">Delayed</h3>
                    <span className="material-symbols-outlined text-red-500">warning</span>
                  </div>
                  <p className="text-3xl font-bold text-white">{summary.delayed}</p>
                </div>
              </div>

              {/* Projects Table */}
              <div className="bg-surface-dark border border-border-dark rounded-xl shadow-xl overflow-hidden mb-8">
                <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">folder</span>
                    Projects
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-background-dark/50">
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
                        const completion =
                          summary?.projectSummaries?.find((s) => s.projectId === p.id)?.completion ?? 0;
                        return (
                          <tr key={p.id} className="hover:bg-background-dark/30 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-white font-medium">{p.name}</div>
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
                              <button className="text-primary hover:text-blue-400 text-sm font-medium">
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
              <div className="bg-surface-dark border border-border-dark rounded-xl shadow-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">history</span>
                    Recent Activity
                  </h2>
                </div>
                <div className="p-6">
                  <ul className="space-y-3">
                    {activities.map((a) => (
                      <li key={a.id} className="flex items-center gap-3 text-sm">
                        <span className="material-symbols-outlined text-primary text-lg">circle</span>
                        <span className="text-white flex-1">
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
    </SuperUserLayout>
  );
}
