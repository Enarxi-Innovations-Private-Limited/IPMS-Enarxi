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

    // Close search results when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setShowResults(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Debounced search
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

            // Filter projects
            const filteredProjects = projectsRes.data.filter(p =>
                p.name?.toLowerCase().includes(searchLower) ||
                p.projectCode?.toLowerCase().includes(searchLower) ||
                p.description?.toLowerCase().includes(searchLower)
            ).slice(0, 5);

            // Filter tasks
            const filteredTasks = tasksRes.data.filter(t =>
                t.title?.toLowerCase().includes(searchLower) ||
                t.description?.toLowerCase().includes(searchLower)
            ).slice(0, 5);

            // Filter users (only if Super User or Manager)
            const filteredUsers = ['SUPER_USER', 'MANAGER'].includes(user?.role)
                ? usersRes.data.filter(u =>
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
                // Navigate based on role
                if (user?.role === 'SUPER_USER') {
                    navigate('/super/projects');
                } else if (user?.role === 'MANAGER') {
                    navigate('/manager/projects');
                } else if (user?.role === 'EMPLOYEE') {
                    navigate('/employee/projects');
                } else if (user?.role === 'INTERN') {
                    navigate('/intern/projects');
                }
                break;
            case 'task':
                // Navigate to tasks page
                if (user?.role === 'SUPER_USER') {
                    navigate('/super/projects'); // Super user doesn't have tasks page
                } else if (user?.role === 'MANAGER') {
                    navigate('/manager/tasks');
                } else if (user?.role === 'EMPLOYEE') {
                    navigate('/employee/tasks');
                } else if (user?.role === 'INTERN') {
                    navigate('/intern/tasks');
                }
                break;
            case 'user':
                // Navigate to team page
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
                className="block w-full pl-10 pr-3 py-2.5 border-none rounded-xl leading-5 bg-surface-dark text-white placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all sm:text-sm"
                placeholder={placeholder}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchQuery.trim().length >= 2 && setShowResults(true)}
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                <span className="text-xs text-text-secondary border border-border-dark px-1.5 py-0.5 rounded">⌘K</span>
            </div>

            {/* Search Results Dropdown */}
            {showResults && totalResults > 0 && (
                <div className="absolute top-full mt-2 w-full max-w-2xl bg-surface-dark border border-border-dark rounded-xl shadow-2xl z-[9999] max-h-[500px] overflow-y-auto custom-scrollbar">
                    {/* Projects */}
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
                                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-background-dark transition-colors group"
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                                <span className="material-symbols-outlined text-primary text-sm">folder</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white font-medium text-sm truncate group-hover:text-primary transition-colors">
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

                    {/* Tasks */}
                    {searchResults.tasks.length > 0 && (
                        <div className="p-2 border-t border-border-dark">
                            <h3 className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm">task_alt</span>
                                Tasks ({searchResults.tasks.length})
                            </h3>
                            <div className="space-y-1">
                                {searchResults.tasks.map((task) => (
                                    <button
                                        key={task.id}
                                        onClick={() => handleResultClick('task', task)}
                                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-background-dark transition-colors group"
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
                                                <p className="text-white font-medium text-sm truncate group-hover:text-primary transition-colors">
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

                    {/* Users (Only for Super User / Manager) */}
                    {searchResults.users.length > 0 && (
                        <div className="p-2 border-t border-border-dark">
                            <h3 className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm">group</span>
                                Team Members ({searchResults.users.length})
                            </h3>
                            <div className="space-y-1">
                                {searchResults.users.map((member) => (
                                    <button
                                        key={member.id}
                                        onClick={() => handleResultClick('user', member)}
                                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-background-dark transition-colors group"
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="size-8 rounded-full bg-gradient-primary flex items-center justify-center shrink-0">
                                                <span className="text-white text-xs font-semibold">
                                                    {member.name?.charAt(0)?.toUpperCase() || '?'}
                                                </span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white font-medium text-sm truncate group-hover:text-primary transition-colors">
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

            {/* No Results */}
            {showResults && totalResults === 0 && searchQuery.trim().length >= 2 && !isSearching && (
                <div className="absolute top-full mt-2 w-full bg-surface-dark border border-border-dark rounded-xl shadow-2xl z-[9999] p-6 text-center">
                    <span className="material-symbols-outlined text-4xl text-text-secondary mb-2">search_off</span>
                    <p className="text-text-secondary">No results found for "{searchQuery}"</p>
                </div>
            )}
        </div>
    );
}
