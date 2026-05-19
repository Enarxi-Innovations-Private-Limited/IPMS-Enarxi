import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api.js';
import { getCurrentUser } from '../../services/authService.js';

export default function GlobalSearch({ placeholder = "Search projects, tasks, or team members..." }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState({ projects: [], tasks: [], users: [] });
    const [isSearching, setIsSearching] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const searchRef = useRef(null);
    const navigate = useNavigate();
    const user = getCurrentUser();

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setShowResults(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const delaySearch = setTimeout(() => {
            if (searchQuery.trim().length >= 2) {
                performSearch(searchQuery);
            } else {
                setSearchResults({ projects: [], tasks: [], users: [] });
                setShowResults(false);
            }
        }, 300);

        return () => clearTimeout(delaySearch);
    }, [searchQuery]);

    const performSearch = async (query) => {
        try {
            setIsSearching(true);
            const [projectsRes, tasksRes, usersRes] = await Promise.all([
                api.get('/projects'),
                api.get('/tasks'),
                api.get('/users'),
            ]);

            const searchLower = query.toLowerCase();

            const filteredProjects = projectsRes.data.filter((p) =>
                p.name?.toLowerCase().includes(searchLower) ||
                p.projectCode?.toLowerCase().includes(searchLower) ||
                p.description?.toLowerCase().includes(searchLower)
            ).slice(0, 5);

            const filteredTasks = tasksRes.data.filter((t) =>
                t.title?.toLowerCase().includes(searchLower) ||
                t.description?.toLowerCase().includes(searchLower)
            ).slice(0, 5);

            const filteredUsers = ['SUPER_USER', 'MANAGER'].includes(user?.role)
                ? usersRes.data.filter((u) =>
                    u.name?.toLowerCase().includes(searchLower) ||
                    u.email?.toLowerCase().includes(searchLower) ||
                    u.employeeId?.toLowerCase().includes(searchLower)
                ).slice(0, 5)
                : [];

            setSearchResults({
                projects: filteredProjects,
                tasks: filteredTasks,
                users: filteredUsers,
            });
            setShowResults(true);
        } catch (error) {
            console.error('Search error:', error);
        } finally {
            setIsSearching(false);
        }
    };

    const handleResultClick = (type, item) => {
        setShowResults(false);
        setSearchQuery('');

        switch (type) {
            case 'project':
                if (user?.role === 'SUPER_USER') {
                    navigate('/super/projects', { state: { openProjectId: item.id } });
                } else if (user?.role === 'MANAGER') {
                    navigate('/manager/projects', { state: { openProjectId: item.id } });
                } else if (user?.role === 'EMPLOYEE') {
                    navigate('/employee/projects', { state: { openProjectId: item.id } });
                } else if (user?.role === 'INTERN') {
                    navigate('/intern/projects', { state: { openProjectId: item.id } });
                }
                break;
            case 'task':
                if (user?.role === 'SUPER_USER') {
                    navigate('/super/projects', { state: { highlightTaskId: item.id } });
                } else if (user?.role === 'MANAGER') {
                    navigate('/manager/tasks', { state: { openTaskId: item.id } });
                } else if (user?.role === 'EMPLOYEE') {
                    navigate('/employee/tasks', { state: { openTaskId: item.id } });
                } else if (user?.role === 'INTERN') {
                    navigate('/intern/tasks', { state: { openTaskId: item.id } });
                }
                break;
            case 'user':
                if (user?.role === 'SUPER_USER') {
                    navigate('/super/teams');
                } else if (user?.role === 'MANAGER') {
                    navigate('/manager/team');
                }
                break;
            default:
                break;
        }
    };

    const totalResults = searchResults.projects.length + searchResults.tasks.length + searchResults.users.length;

    return (
        <div ref={searchRef} className="relative w-full group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-secondary group-focus-within:text-primary transition-colors">
                <span className="material-symbols-outlined">{isSearching ? 'progress_activity' : 'search'}</span>
            </div>
            <input
                className="block w-full pl-10 pr-3 py-2.5 rounded-xl leading-5 bg-white border border-slate-200 text-[#556070] placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/30 transition-all sm:text-sm shadow-sm"
                placeholder={placeholder}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchQuery.trim().length >= 2 && setShowResults(true)}
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                <span className="text-xs text-text-secondary border border-slate-200 px-1.5 py-0.5 rounded bg-slate-50">⌘K</span>
            </div>

            {showResults && totalResults > 0 && (
                <div className="absolute top-full mt-2 w-full max-w-2xl bg-white border border-slate-200 rounded-xl shadow-2xl z-[9999] max-h-[500px] overflow-y-auto custom-scrollbar">
                    {searchResults.projects.length > 0 && (
                        <div className="p-2">
                            <h3 className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm">folder</span>
                                Projects ({searchResults.projects.length})
                            </h3>
                            <div className="space-y-1">
                                {searchResults.projects.map((project) => (
                                    <button
                                        key={project.id}
                                        onClick={() => handleResultClick('project', project)}
                                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors group"
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                                <span className="material-symbols-outlined text-primary text-sm">folder</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[#556070] font-medium text-sm truncate group-hover:text-primary transition-colors">
                                                    {project.name}
                                                </p>
                                                <p className="text-text-secondary text-xs truncate">
                                                    {project.projectCode} • {project.status}
                                                </p>
                                            </div>
                                            <span className="material-symbols-outlined text-text-secondary text-sm opacity-0 group-hover:opacity-100">
                                                arrow_forward
                                            </span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {searchResults.tasks.length > 0 && (
                        <div className="p-2 border-t border-slate-200">
                            <h3 className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm">task_alt</span>
                                Tasks ({searchResults.tasks.length})
                            </h3>
                            <div className="space-y-1">
                                {searchResults.tasks.map((task) => (
                                    <button
                                        key={task.id}
                                        onClick={() => handleResultClick('task', task)}
                                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors group"
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${task.status === 'COMPLETED' ? 'bg-green-500/10' :
                                                task.status === 'IN_PROGRESS' ? 'bg-blue-500/10' :
                                                    'bg-gray-500/10'
                                                }`}>
                                                <span className={`material-symbols-outlined text-sm ${task.status === 'COMPLETED' ? 'text-green-500' :
                                                    task.status === 'IN_PROGRESS' ? 'text-blue-500' :
                                                        'text-gray-500'
                                                    }`}>check_circle</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[#556070] font-medium text-sm truncate group-hover:text-primary transition-colors">
                                                    {task.title}
                                                </p>
                                                <p className="text-text-secondary text-xs truncate">
                                                    {task.status?.replace('_', ' ')}
                                                </p>
                                            </div>
                                            <span className="material-symbols-outlined text-text-secondary text-sm opacity-0 group-hover:opacity-100">
                                                arrow_forward
                                            </span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {searchResults.users.length > 0 && (
                        <div className="p-2 border-t border-slate-200">
                            <h3 className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm">group</span>
                                Team Members ({searchResults.users.length})
                            </h3>
                            <div className="space-y-1">
                                {searchResults.users.map((member) => (
                                    <button
                                        key={member.id}
                                        onClick={() => handleResultClick('user', member)}
                                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors group"
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="size-8 rounded-full bg-gradient-primary flex items-center justify-center shrink-0">
                                                <span className="text-white text-xs font-semibold">
                                                    {member.name?.charAt(0)?.toUpperCase() || '?'}
                                                </span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[#556070] font-medium text-sm truncate group-hover:text-primary transition-colors">
                                                    {member.name}
                                                </p>
                                                <p className="text-text-secondary text-xs truncate">
                                                    {member.role} • {member.employeeId}
                                                </p>
                                            </div>
                                            <span className="material-symbols-outlined text-text-secondary text-sm opacity-0 group-hover:opacity-100">
                                                arrow_forward
                                            </span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {showResults && totalResults === 0 && searchQuery.trim().length >= 2 && !isSearching && (
                <div className="absolute top-full mt-2 w-full bg-white border border-slate-200 rounded-xl shadow-2xl z-[9999] p-6 text-center">
                    <span className="material-symbols-outlined text-4xl text-text-secondary mb-2">search_off</span>
                    <p className="text-text-secondary">No results found for "{searchQuery}"</p>
                </div>
            )}
        </div>
    );
}
