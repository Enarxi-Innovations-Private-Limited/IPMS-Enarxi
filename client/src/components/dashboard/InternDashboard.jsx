import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../../services/api.js';
import InternLayout from '../common/InternLayout.jsx';
import { getCurrentUser } from '../../services/authService.js';

import TaskDetailModal from '../tasks/TaskDetailModal.jsx';

export default function InternDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getCurrentUser();
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Project Details State
  const [selectedProject, setSelectedProject] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [isAttachmentsExpanded, setIsAttachmentsExpanded] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [attachmentName, setAttachmentName] = useState('');

  // Task Details State
  const [viewTask, setViewTask] = useState(null);

  // Query state
  const [statusUpdate, setStatusUpdate] = useState({});
  const [commentText, setCommentText] = useState({});
  const [showQueryModal, setShowQueryModal] = useState(false);
  const [selectedTaskForQuery, setSelectedTaskForQuery] = useState(null);
  const [queryText, setQueryText] = useState('');
  const [submittingQuery, setSubmittingQuery] = useState(false);

  // Notification state
  const [notification, setNotification] = useState(null);

  // Determine current page from route
  const getCurrentPage = () => {
    if (location.pathname === '/intern' || location.pathname === '/intern/') return 'dashboard';
    if (location.pathname === '/intern/projects') return 'projects';
    if (location.pathname === '/intern/tasks') return 'tasks';
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

  const myTasks = tasks.filter((t) => t.assigneeId === user.id);

  const goToProjects = () => {
    navigate('/intern/projects');
  };

  const goToTasks = () => {
    navigate('/intern/tasks');
  };

  return (
    <InternLayout currentPage={currentPage}>
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
              <h1 className="text-3xl md:text-4xl font-bold text-[#556070] tracking-tight mb-2">Intern Dashboard</h1>
              <p className="text-text-secondary text-lg">View your assigned projects and update task progress.</p>
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
                <div
                  className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 shadow-xl cursor-pointer hover:border-primary/50 transition-all group"
                  onClick={goToProjects}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider">My Projects</h3>
                    <span className="material-symbols-outlined text-primary">folder</span>
                  </div>
                  <p className="text-3xl font-bold text-[#556070]">{projects.length}</p>
                </div>
                <div
                  className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 shadow-xl cursor-pointer hover:border-green-500/50 transition-all group"
                  onClick={goToTasks}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider">My Tasks</h3>
                    <span className="material-symbols-outlined text-green-500">task_alt</span>
                  </div>
                  <p className="text-3xl font-bold text-[#556070]">{myTasks.length}</p>
                </div>
                <div
                  className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 shadow-xl cursor-pointer hover:border-blue-500/50 transition-all group"
                  onClick={goToTasks}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider">Completed</h3>
                    <span className="material-symbols-outlined text-blue-500">check_circle</span>
                  </div>
                  <p className="text-3xl font-bold text-[#556070]">
                    {myTasks.filter((t) => t.status === 'COMPLETED').length}
                  </p>
                </div>
              </div>

              {/* Projects Section */}
              <div className="bg-white border border-slate-200 shadow-sm rounded-xl shadow-xl overflow-hidden mb-8">
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
                          onClick={() => navigate(`/intern/projects?projectId=${p.id}`)}
                          className="bg-slate-50 border border-border-dark rounded-lg p-4 hover:bg-background-dark transition-colors cursor-pointer group"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-primary font-bold font-mono group-hover:text-blue-400 transition-colors">{p.projectCode || 'No ID'}</h3>
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
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/intern/projects?projectId=${p.id}`);
                              }}
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
              <div className="bg-white border border-slate-200 shadow-sm rounded-xl shadow-xl overflow-hidden flex-1 flex flex-col min-h-0">
                <div className="px-4 py-3 md:px-6 md:py-4 border-b border-border-dark bg-gradient-surface">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">task_alt</span>
                    My Tasks
                  </h2>
                </div>
                {loading ? (
                  <div className="flex-1 flex items-center justify-center p-8">
                    <p className="text-text-secondary">Loading your tasks...</p>
                  </div>
                ) : myTasks.length > 0 ? (
                  <div className="overflow-x-auto custom-scrollbar flex-1">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b border-border-dark text-left">
                        <tr>
                          <th className="px-4 py-3 md:px-6 md:py-4 text-xs font-bold text-text-secondary uppercase tracking-wider">Title</th>
                          <th className="px-4 py-3 md:px-6 md:py-4 text-xs font-bold text-text-secondary uppercase tracking-wider">Project</th>
                          <th className="px-4 py-3 md:px-6 md:py-4 text-xs font-bold text-text-secondary uppercase tracking-wider">Status</th>
                          <th className="px-4 py-3 md:px-6 md:py-4 text-xs font-bold text-text-secondary uppercase tracking-wider">Update Status</th>
                          <th className="px-4 py-3 md:px-6 md:py-4 text-xs font-bold text-text-secondary uppercase tracking-wider">Work Updates</th>
                          <th className="px-4 py-3 md:px-6 md:py-4 text-xs font-bold text-text-secondary uppercase tracking-wider">Queries</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-dark">
                        {myTasks.map((t) => (
                          <tr key={t.id} className="hover:bg-background-dark/30 transition-colors">
                            <td className="px-4 py-3 md:px-6 md:py-4 max-w-[200px] md:max-w-xs overflow-hidden relative group cursor-pointer" onClick={() => setViewTask(t)}>
                              <div className="text-[#556070] font-medium hover:text-primary transition-colors text-sm md:text-base">{t.title}</div>
                              <div className="text-text-secondary text-xs md:text-sm mt-1 truncate">{t.description || 'No description'}</div>
                            </td>
                            <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                              <span className="text-[#556070] font-mono text-xs md:text-sm">
                                {projects.find((p) => p.id === t.projectId)?.projectCode || '-'}
                              </span>
                            </td>
                            <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                              <span
                                className={`px-2 py-1 text-[10px] md:text-xs font-medium rounded-full ${t.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400'
                                  : t.status === 'IN_PROGRESS' ? 'bg-blue-500/20 text-blue-400'
                                    : t.status === 'WAITING_APPROVAL' ? 'bg-yellow-500/20 text-yellow-400'
                                      : 'bg-gray-500/20 text-gray-400'
                                  }`}
                              >
                                {t.status.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                              {/* Rejection Warning */}
                              {t.rejectionReason && t.status === 'IN_PROGRESS' && (
                                <div className="mb-2 p-2 bg-red-500/10 border border-red-500/30 rounded flex items-start gap-2 max-w-[200px] whitespace-normal">
                                  <span className="material-symbols-outlined text-red-400 text-sm mt-0.5">error</span>
                                  <div>
                                    <p className="text-[10px] font-bold text-red-400 uppercase">Rejected</p>
                                    <p className="text-xs text-red-300 leading-tight">{t.rejectionReason}</p>
                                  </div>
                                </div>
                              )}

                              {t.status === 'WAITING_APPROVAL' ? (
                                <span className="text-yellow-400 text-sm italic">⏳ Pending Manager Approval</span>
                              ) : t.status === 'COMPLETED' ? (
                                <span className="text-green-400 text-sm">✓ Approved & Completed</span>
                              ) : (
                                <select
                                  className="bg-[#ECF1FF] border border-slate-300 rounded-lg px-3 py-1.5 text-[#002045] text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none cursor-pointer"
                                  style={{ color: '#002045' }}
                                  value={statusUpdate[t.id] || t.status}
                                  onChange={(e) => handleStatusChange(t.id, e.target.value)}
                                >
                                  <option value="NOT_STARTED">Not Started</option>
                                  <option value="IN_PROGRESS">In Progress</option>
                                  <option value="WAITING_APPROVAL">📤 Ask for Approval</option>
                                </select>
                              )}
                            </td>
                            <td className="px-4 py-3 md:px-6 md:py-4">
                              <div className="flex flex-col gap-2 min-w-[200px]">
                                <div className="flex gap-2">
                                  <input
                                    className="flex-1 bg-[#ECF1FF] border border-slate-300 rounded-lg px-3 py-1.5 text-[#002045] placeholder:text-[#002045]/45 text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                    style={{ color: '#002045', caretColor: '#002045', WebkitTextFillColor: '#002045' }}
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
                            <td className="px-4 py-3 md:px-6 md:py-4">
                              <div className="flex flex-col gap-2 min-w-[150px]">
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => openQueryModal(t)}
                                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 rounded-lg text-sm font-semibold transition-colors"
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
                                    <span className={`${t.queries.some(q => q.status === 'PENDING') ? 'text-amber-700' : 'text-green-700'}`}>
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
                            <td colSpan="6" className="px-6 py-8 text-center text-text-secondary">
                              No tasks assigned yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-text-secondary text-center py-8">No assigned tasks yet.</p>
                )}
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
              <div className="bg-slate-50 border border-border-dark rounded-lg p-4">
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
          users={[]} // Intern view might not have all users
          onClose={() => setViewTask(null)}
          onUpdate={(updatedTask) => {
            // Update local state if needed
            setTasks(tasks.map(t => t.id === updatedTask.id || t.id === updatedTask._id ? updatedTask : t));
          }}
          canRespond={false}
        />
      )}

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
    </InternLayout>
  );
}
