import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../../services/api.js';
import EmployeeLayout from '../common/EmployeeLayout.jsx';
import { getCurrentUser } from '../../services/authService.js';
import TaskDetailModal from '../tasks/TaskDetailModal.jsx';

export default function EmployeeDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getCurrentUser();
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreateTask, setShowCreateTask] = useState(false);

  const [taskForm, setTaskForm] = useState({
    projectId: '',
    title: '',
    description: '',
  });

  const [statusUpdate, setStatusUpdate] = useState({});
  const [commentText, setCommentText] = useState({});
  const [viewTask, setViewTask] = useState(null);

  // Query state
  const [showQueryModal, setShowQueryModal] = useState(false);
  const [selectedTaskForQuery, setSelectedTaskForQuery] = useState(null);
  const [queryText, setQueryText] = useState('');
  const [submittingQuery, setSubmittingQuery] = useState(false);

  // Project Details State
  const [selectedProject, setSelectedProject] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [isAttachmentsExpanded, setIsAttachmentsExpanded] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [attachmentName, setAttachmentName] = useState('');

  const openDetailsModal = (project) => {
    setSelectedProject(project);
    setShowDetailsModal(true);
    setAttachmentName('');
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



  // Determine current page from route
  const getCurrentPage = () => {
    if (location.pathname === '/employee' || location.pathname === '/employee/') return 'dashboard';
    if (location.pathname === '/employee/projects') return 'projects';
    if (location.pathname === '/employee/tasks') return 'tasks';
    return 'dashboard';
  };

  const currentPage = getCurrentPage();

  const loadData = async () => {
    try {
      setLoading(true);
      const [projRes, taskRes] = await Promise.all([api.get('/projects'), api.get('/tasks')]);
      setProjects(projRes.data);
      setTasks(taskRes.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateTask = async (e) => {
    e.preventDefault();
    try {
      setError('');
      await api.post('/tasks', {
        projectId: taskForm.projectId,
        title: taskForm.title,
        description: taskForm.description,
      });
      setTaskForm({ projectId: '', title: '', description: '' });
      setShowCreateTask(false);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create task');
    }
  };

  const handleStatusChange = async (taskId, status) => {
    try {
      await api.put(`/tasks/${taskId}/status`, { status });
      setStatusUpdate({ ...statusUpdate, [taskId]: status });
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update status');
    }
  };

  const handleAddComment = async (taskId) => {
    const text = commentText[taskId];
    if (!text) return;
    try {
      await api.post(`/tasks/${taskId}/comments`, { text });
      setCommentText({ ...commentText, [taskId]: '' });
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add comment');
    }
  };

  // Open query modal
  const openQueryModal = (task) => {
    setSelectedTaskForQuery(task);
    setQueryText('');
    setShowQueryModal(true);
  };

  // Raise a query for manager
  const handleRaiseQuery = async () => {
    if (!queryText.trim() || !selectedTaskForQuery) return;
    try {
      setSubmittingQuery(true);
      await api.post(`/tasks/${selectedTaskForQuery.id}/queries`, { question: queryText });
      setShowQueryModal(false);
      setQueryText('');
      setSelectedTaskForQuery(null);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to raise query');
    } finally {
      setSubmittingQuery(false);
    }
  };



  const myTasks = tasks.filter((t) => t.assigneeId === user.id);

  if (showCreateTask) {
    return (
      <EmployeeLayout currentPage={currentPage}>
        <div className="p-6 lg:px-12 pb-24">
          <div className="max-w-5xl mx-auto w-full">
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
                  <span className="ml-2 text-white text-sm font-medium">Create Task</span>
                </li>
              </ol>
            </nav>

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">Create New Task</h1>
                <p className="text-text-secondary text-lg">Add a new task to one of your assigned projects.</p>
              </div>
              <button
                onClick={() => setShowCreateTask(false)}
                className="px-4 py-2 rounded-lg border border-border-dark text-white font-medium hover:bg-surface-dark transition-colors"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="flex flex-col gap-6">
              {error && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              <div className="bg-surface-dark border border-border-dark rounded-xl shadow-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">task_alt</span>
                    Task Details
                  </h2>
                </div>
                <div className="p-6 grid grid-cols-1 gap-6">
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">
                      Project
                    </label>
                    <select
                      className="w-full appearance-none bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none cursor-pointer"
                      value={taskForm.projectId}
                      onChange={(e) => setTaskForm({ ...taskForm, projectId: e.target.value })}
                      required
                    >
                      <option value="">Select project</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.projectCode || 'No ID'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">
                      Task Title
                    </label>
                    <input
                      className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white placeholder-text-secondary/50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                      placeholder="e.g. Implement user authentication"
                      type="text"
                      value={taskForm.title}
                      onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">
                      Description
                    </label>
                    <textarea
                      className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white placeholder-text-secondary/50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none"
                      placeholder="Describe the task requirements..."
                      rows="4"
                      value={taskForm.description}
                      onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="fixed bottom-0 left-0 w-full bg-surface-dark/95 backdrop-blur-md border-t border-border-dark px-6 py-4 z-20 lg:left-72">
                <div className="max-w-5xl mx-auto flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowCreateTask(false)}
                    className="text-text-secondary hover:text-white font-medium px-4 py-2 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 px-8 py-2.5 rounded-lg bg-gradient-primary text-white font-bold shadow-lg shadow-blue-900/50 hover:shadow-blue-900/70 hover:scale-[1.02] transition-all"
                  >
                    <span className="material-symbols-outlined text-lg">check</span>
                    Create Task
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </EmployeeLayout>
    );
  }

  return (
    <EmployeeLayout currentPage={currentPage}>
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
              <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">Employee Dashboard</h1>
              <p className="text-text-secondary text-lg">Manage your assigned projects and tasks.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCreateTask(true)}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-gradient-primary text-white font-bold shadow-lg shadow-blue-900/50 hover:shadow-blue-900/70 hover:scale-[1.02] transition-all"
              >
                <span className="material-symbols-outlined text-lg">add</span>
                Create Task
              </button>
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

          {!loading && (
            <>
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider">My Projects</h3>
                    <span className="material-symbols-outlined text-primary">folder</span>
                  </div>
                  <p className="text-3xl font-bold text-white">{projects.length}</p>
                </div>
                <div className="bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider">My Tasks</h3>
                    <span className="material-symbols-outlined text-green-500">task_alt</span>
                  </div>
                  <p className="text-3xl font-bold text-white">{myTasks.length}</p>
                </div>
                <div className="bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider">In Progress</h3>
                    <span className="material-symbols-outlined text-blue-500">trending_up</span>
                  </div>
                  <p className="text-3xl font-bold text-white">
                    {myTasks.filter((t) => t.status === 'IN_PROGRESS').length}
                  </p>
                </div>
              </div>

              {/* Projects Section */}
              <div className="bg-surface-dark border border-border-dark rounded-xl shadow-xl overflow-hidden mb-8">
                <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">folder</span>
                    My Projects
                  </h2>
                </div>
                <div className="p-6">
                  {projects.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {projects.map((p) => (
                        <div
                          key={p.id}
                          className="bg-background-dark/50 border border-border-dark rounded-lg p-4 hover:bg-background-dark transition-colors"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-primary font-bold font-mono">{p.projectCode || 'No ID'}</h3>
                            <span
                              className={`px-2 py-1 text-xs font-medium rounded-full ${p.status === 'ACTIVE'
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-blue-500/20 text-blue-400'
                                }`}
                            >
                              {p.status}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <p className="text-text-secondary text-sm line-clamp-2 flex-1 mr-2">{p.description || 'No description'}</p>
                            <button
                              onClick={() => openDetailsModal(p)}
                              className="p-1.5 rounded-lg bg-surface-dark border border-border-dark text-text-secondary hover:text-white hover:bg-background-dark transition-colors"
                              title="View Details"
                            >
                              <span className="material-symbols-outlined text-sm">visibility</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-text-secondary text-center py-8">No assigned projects yet.</p>
                  )}
                </div>
              </div>

              {/* Tasks Table */}
              <div className="bg-surface-dark border border-border-dark rounded-xl shadow-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">task_alt</span>
                    My Tasks
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-background-dark/50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                          Title
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                          Project
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                          Update Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                          Work Updates
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                          Queries
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-dark">
                      {myTasks.map((t) => (
                        <tr key={t.id} className="hover:bg-background-dark/30 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-white font-medium">{t.title}</div>
                            <div className="text-text-secondary text-sm mt-1">{t.description || 'No description'}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-white font-mono">
                              {projects.find((p) => p.id === t.projectId)?.projectCode || '-'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-1 text-xs font-medium rounded-full ${t.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400'
                                : t.status === 'IN_PROGRESS' ? 'bg-blue-500/20 text-blue-400'
                                  : t.status === 'WAITING_APPROVAL' ? 'bg-yellow-500/20 text-yellow-400'
                                    : 'bg-gray-500/20 text-gray-400'
                                }`}
                            >
                              {t.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {t.status === 'WAITING_APPROVAL' ? (
                              <span className="text-yellow-400 text-sm italic">⏳ Pending Manager Approval</span>
                            ) : t.status === 'COMPLETED' ? (
                              <span className="text-green-400 text-sm">✓ Approved & Completed</span>
                            ) : (
                              <select
                                className="bg-background-dark border border-border-dark rounded-lg px-3 py-1.5 text-white text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none cursor-pointer"
                                value={statusUpdate[t.id] || t.status}
                                onChange={(e) => handleStatusChange(t.id, e.target.value)}
                              >
                                <option value="NOT_STARTED">Not Started</option>
                                <option value="IN_PROGRESS">In Progress</option>
                                <option value="WAITING_APPROVAL">📤 Ask for Approval</option>
                              </select>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-2 min-w-[200px]">
                              <div className="flex gap-2">
                                <input
                                  className="flex-1 bg-background-dark border border-border-dark rounded-lg px-3 py-1.5 text-white placeholder-text-secondary/50 text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                  placeholder="Add work update..."
                                  value={commentText[t.id] || ''}
                                  onChange={(e) =>
                                    setCommentText({ ...commentText, [t.id]: e.target.value })
                                  }
                                />
                                <button
                                  onClick={() => handleAddComment(t.id)}
                                  className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition-colors"
                                  disabled={!commentText[t.id]}
                                  title="Post Update"
                                >
                                  <span className="material-symbols-outlined text-lg">send</span>
                                </button>
                              </div>
                              {t.comments && t.comments.length > 0 && (
                                <button
                                  onClick={() => setViewTask(t)}
                                  className="text-xs text-text-secondary mt-1 hover:text-white flex items-center gap-1 w-fit"
                                >
                                  <span className="material-symbols-outlined text-[14px]">visibility</span>
                                  {t.comments.length} update{t.comments.length !== 1 ? 's' : ''}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-2 min-w-[150px]">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => openQueryModal(t)}
                                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 rounded-lg text-sm font-medium transition-colors"
                                >
                                  <span className="material-symbols-outlined text-base">help</span>
                                  Raise
                                </button>
                                {t.queries?.length > 0 && (
                                  <button
                                    onClick={() => setViewTask(t)}
                                    className="px-3 py-1.5 bg-surface-dark border border-border-dark text-white rounded-lg hover:bg-background-dark transition-colors"
                                    title="View Queries"
                                  >
                                    <span className="material-symbols-outlined text-base">visibility</span>
                                  </button>
                                )}
                              </div>

                              {t.queries && t.queries.length > 0 && (
                                <div className="text-xs">
                                  <span className={`${t.queries.some(q => q.status === 'PENDING') ? 'text-amber-400' : 'text-green-400'}`}>
                                    {t.queries.filter(q => q.status === 'PENDING').length} pending
                                  </span>
                                  {' / '}
                                  <span className="text-text-secondary">{t.queries.length} total</span>
                                </div>
                              )}
                            </div>
                          </td>

                        </tr>
                      ))}
                      {myTasks.length === 0 && (
                        <tr>
                          <td colSpan="4" className="px-6 py-8 text-center text-text-secondary">
                            No tasks assigned. Create your first task to get started.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>


      {/* Project Details Modal */}
      {showDetailsModal && selectedProject && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowDetailsModal(false)}
          ></div>
          <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-4xl mx-4 h-[80vh] flex flex-col overflow-hidden">

            {/* Header */}
            <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface shrink-0 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">folder</span>
                  {selectedProject.projectCode || 'No ID'}
                </h2>
                <p className="text-text-secondary text-xs mt-1 font-mono">ID: {selectedProject.id}</p>
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="text-text-secondary hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto">
              <div className="mb-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-text-secondary mb-2">Description</h3>
                <p className="text-white text-sm leading-relaxed">{selectedProject.description || 'No description provided.'}</p>
              </div>

              {/* Attachments Section */}
              <div className="border border-border-dark rounded-xl bg-background-dark/20 overflow-hidden">
                <div
                  className="px-4 py-3 bg-surface-dark/50 border-b border-border-dark flex items-center justify-between cursor-pointer"
                  onClick={() => setIsAttachmentsExpanded(!isAttachmentsExpanded)}
                >
                  <h3 className="text-sm font-bold uppercase tracking-wider text-text-secondary flex items-center gap-2">
                    <span className="material-symbols-outlined text-base">attach_file</span>
                    Attachments ({selectedProject.attachments?.length || 0})
                  </h3>
                  <span className={`material-symbols-outlined text-text-secondary transition-transform ${isAttachmentsExpanded ? 'rotate-180' : ''}`}>expand_more</span>
                </div>

                {isAttachmentsExpanded && (
                  <div className="p-4">
                    {/* List */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                      {selectedProject.attachments?.map((file, idx) => (
                        <div key={idx} className="flex items-center gap-3 p-3 bg-black/20 border border-border-dark rounded-lg hover:bg-black/30 transition-colors group">
                          <div className="size-10 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-xl">description</span>
                          </div>
                          <a href={`/api${file.url}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 hover:text-primary transition-colors">
                            <p className="text-white text-sm font-medium truncate">{file.name}</p>
                            <p className="text-text-secondary text-xs">{new Date(file.uploadedAt).toLocaleDateString()}</p>
                          </a>
                          <div className="flex items-center gap-1">
                            <a href={`/api${file.url}`} target="_blank" rel="noreferrer" className="text-text-secondary hover:text-white p-2" title="Preview">
                              <span className="material-symbols-outlined">visibility</span>
                            </a>
                            <a href={`/api${file.url}`} download target="_blank" rel="noreferrer" className="text-primary hover:text-white p-2" title="Download">
                              <span className="material-symbols-outlined">download</span>
                            </a>
                          </div>
                        </div>
                      ))}
                      {(!selectedProject.attachments || selectedProject.attachments.length === 0) && (
                        <div className="col-span-full py-4 text-center text-text-secondary text-sm">
                          No attachments yet.
                        </div>
                      )}
                    </div>

                    {/* Upload Form */}
                    <div className="border-t border-border-dark pt-4">
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
        </div>
      )}

      {/* Query Modal */}
      {showQueryModal && selectedTaskForQuery && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowQueryModal(false)}
          ></div>
          <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-500">help</span>
                Raise Query to Manager
              </h2>
            </div>

            <div className="p-6 space-y-5">
              <div className="bg-background-dark/50 border border-border-dark rounded-lg p-4">
                <p className="text-text-secondary text-xs uppercase tracking-wider mb-1">Task</p>
                <p className="text-white font-medium">{selectedTaskForQuery.title}</p>
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">
                  Your Query
                </label>
                <textarea
                  className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none"
                  placeholder="Describe your question or issue..."
                  rows={4}
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                ></textarea>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border-dark flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowQueryModal(false)}
                className="px-4 py-2 rounded-lg border border-border-dark text-white font-medium hover:bg-background-dark transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRaiseQuery}
                disabled={!queryText.trim() || submittingQuery}
                className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold shadow-lg shadow-amber-900/50 hover:shadow-amber-900/70 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                <span className="material-symbols-outlined text-lg">send</span>
                {submittingQuery ? 'Sending...' : 'Send Query'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Task Details Modal (Read-Only/Query View) */}
      {viewTask && (
        <TaskDetailModal
          task={viewTask}
          users={[]} // Employee view might not have all users
          onClose={() => setViewTask(null)}
          onUpdate={(updatedTask) => {
            // Update local state if needed
            setTasks(tasks.map(t => t.id === updatedTask.id || t.id === updatedTask._id ? updatedTask : t));
          }}
          canRespond={false}
        />
      )}
    </EmployeeLayout>
  );
}
