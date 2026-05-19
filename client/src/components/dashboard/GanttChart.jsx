import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';
import { getCurrentUser } from '../../services/authService';
import * as XLSX from 'xlsx';

export default function GanttChart({ projectId: propProjectId, onClose }) {
    const { projectId: paramProjectId } = useParams();
    const projectId = propProjectId || paramProjectId;
    const navigate = useNavigate();

    // Core data states
    const [treeData, setTreeData] = useState([]);
    const [dependencies, setDependencies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [users, setUsers] = useState([]);
    const user = getCurrentUser();
    const isManagerOrAdmin = ['MANAGER', 'SUPER_USER'].includes(user?.role);

    const timelineRef = useRef(null);
    const leftPaneRef = useRef(null);

    // Scale and range settings
    const [scale, setScale] = useState('days'); // 'days' | 'weeks' | 'months'
    const [viewStartDate, setViewStartDate] = useState(new Date());
    const [viewEndDate, setViewEndDate] = useState(new Date());

    // Interactive feature states
    const [inlineAddingEpicId, setInlineAddingEpicId] = useState(null);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [editingTask, setEditingTask] = useState(null);
    const [updatingTask, setUpdatingTask] = useState(false);
    const [showCriticalPath, setShowCriticalPath] = useState(false);
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [showLegend, setShowLegend] = useState(false);

    // Custom date picker refs & triggers
    const startDateInputRef = useRef(null);
    const endDateInputRef = useRef(null);
    const triggerDatePicker = (inputRef) => {
        if (inputRef.current) {
            try {
                if (typeof inputRef.current.showPicker === 'function') {
                    inputRef.current.showPicker();
                } else {
                    inputRef.current.click();
                }
            } catch (err) {
                console.warn('showPicker not supported:', err);
                inputRef.current.click();
            }
        }
    };

    // Custom dropdown states inside Reschedule Modal
    const [isAssigneeDropdownOpen, setIsAssigneeDropdownOpen] = useState(false);
    const [isPredecessorDropdownOpen, setIsPredecessorDropdownOpen] = useState(false);

    // Grid zoom control
    const [zoomLevel, setZoomLevel] = useState(1.0);
    const [zoomOpen, setZoomOpen] = useState(false);
    const ZOOM_STEP = 0.25;
    const ZOOM_MIN = 0.25;
    const ZOOM_MAX = 3.0;
    const zoomIn = () => setZoomLevel(z => Math.min(ZOOM_MAX, parseFloat((z + ZOOM_STEP).toFixed(2))));
    const zoomOut = () => setZoomLevel(z => Math.max(ZOOM_MIN, parseFloat((z - ZOOM_STEP).toFixed(2))));
    const zoomReset = () => setZoomLevel(1.0);

    // Sidebar Resizing
    const [leftPaneWidth, setLeftPaneWidth] = useState(Math.round(window.innerWidth * 0.25));
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const sidebarWidthBeforeCollapse = useRef(Math.round(window.innerWidth * 0.25));
    const isSidebarResizing = useRef(false);

    const handleSidebarMouseDown = (e) => {
        e.preventDefault();
        if (isSidebarCollapsed) return; // don't drag when fully collapsed
        isSidebarResizing.current = true;
        document.addEventListener('mousemove', handleSidebarMouseMove);
        document.addEventListener('mouseup', handleSidebarMouseUp);
    };

    const handleSidebarMouseMove = (e) => {
        if (!isSidebarResizing.current) return;
        const minW = Math.round(window.innerWidth * 0.20);
        const maxW = Math.round(window.innerWidth * 0.65);
        const newWidth = Math.max(minW, Math.min(maxW, e.clientX));
        setLeftPaneWidth(newWidth);
        sidebarWidthBeforeCollapse.current = newWidth;
    };

    const handleSidebarMouseUp = () => {
        isSidebarResizing.current = false;
        document.removeEventListener('mousemove', handleSidebarMouseMove);
        document.removeEventListener('mouseup', handleSidebarMouseUp);
    };

    const toggleSidebarCollapse = () => {
        if (isSidebarCollapsed) {
            // Restore to saved width
            setLeftPaneWidth(sidebarWidthBeforeCollapse.current);
            setIsSidebarCollapsed(false);
        } else {
            // Save width and fully collapse
            sidebarWidthBeforeCollapse.current = leftPaneWidth;
            setLeftPaneWidth(0);
            setIsSidebarCollapsed(true);
        }
    };

    useEffect(() => {
        return () => {
            document.removeEventListener('mousemove', handleSidebarMouseMove);
            document.removeEventListener('mouseup', handleSidebarMouseUp);
        };
    }, []);

    // Width multiplier: base value per scale × user zoom level
    const getPixelsPerDay = () => {
        switch (scale) {
            case 'weeks': return 10;
            case 'months': return 2.5;
            case 'days':
            default: return 30;
        }
    };
    const pixelsPerDay = getPixelsPerDay() * zoomLevel;

    const colorThemes = [
        { phaseBar: 'bg-indigo-500 text-white border-indigo-600', taskBar: 'bg-indigo-400/80 text-white border-indigo-500/80', phaseText: 'text-indigo-700', taskText: 'text-indigo-600', badge: 'bg-indigo-50 text-indigo-600 border-indigo-200', dot: 'bg-indigo-500' },
        { phaseBar: 'bg-rose-500 text-white border-rose-600', taskBar: 'bg-rose-400/80 text-white border-rose-500/80', phaseText: 'text-rose-700', taskText: 'text-rose-600', badge: 'bg-rose-50 text-rose-600 border-rose-200', dot: 'bg-rose-500' },
        { phaseBar: 'bg-emerald-500 text-white border-emerald-600', taskBar: 'bg-emerald-400/80 text-white border-emerald-500/80', phaseText: 'text-emerald-700', taskText: 'text-emerald-600', badge: 'bg-emerald-50 text-emerald-600 border-emerald-200', dot: 'bg-emerald-500' },
        { phaseBar: 'bg-amber-500 text-white border-amber-600', taskBar: 'bg-amber-400/80 text-white border-amber-500/80', phaseText: 'text-amber-700', taskText: 'text-amber-600', badge: 'bg-amber-50 text-amber-600 border-amber-200', dot: 'bg-amber-500' },
        { phaseBar: 'bg-purple-500 text-white border-purple-600', taskBar: 'bg-purple-400/80 text-white border-purple-500/80', phaseText: 'text-purple-700', taskText: 'text-purple-600', badge: 'bg-purple-50 text-purple-600 border-purple-200', dot: 'bg-purple-500' },
        { phaseBar: 'bg-cyan-500 text-white border-cyan-600', taskBar: 'bg-cyan-400/80 text-white border-cyan-500/80', phaseText: 'text-cyan-700', taskText: 'text-cyan-600', badge: 'bg-cyan-50 text-cyan-600 border-cyan-200', dot: 'bg-cyan-500' },
        { phaseBar: 'bg-pink-500 text-white border-pink-600', taskBar: 'bg-pink-400/80 text-white border-pink-500/80', phaseText: 'text-pink-700', taskText: 'text-pink-600', badge: 'bg-pink-50 text-pink-600 border-pink-200', dot: 'bg-pink-500' },
        { phaseBar: 'bg-teal-500 text-white border-teal-600', taskBar: 'bg-teal-400/80 text-white border-teal-500/80', phaseText: 'text-teal-700', taskText: 'text-teal-600', badge: 'bg-teal-50 text-teal-600 border-teal-200', dot: 'bg-teal-500' }
    ];

    const getTaskStyle = (node) => {
        if (node.hierarchy_level === 'PORTFOLIO') {
            return 'bg-slate-600 text-white border-slate-700 shadow-md font-semibold';
        }

        const theme = node.themeIndex !== undefined && node.themeIndex !== -1 ? colorThemes[node.themeIndex] : colorThemes[0];

        if (node.hierarchy_level === 'EPIC') {
            return theme.phaseBar + ' shadow-sm font-semibold opacity-90';
        }

        return theme.taskBar + ' shadow-sm';
    };

    const fetchGantt = async () => {
        try {
            setLoading(true);
            const res = await api.get(`/gantt/${projectId}`);
            setTreeData(res.data.tree || []);
            const mappedDeps = (res.data.dependencies || []).map(dep => ({
                id: dep.id,
                source: dep.source_task_id || dep.source,
                target: dep.target_task_id || dep.target,
                link_type: dep.link_type,
                lag_days: dep.lag_days
            }));
            setDependencies(mappedDeps);

            const userRes = await api.get('/users');
            setUsers(userRes.data || []);

            let minD = new Date();
            let maxD = new Date();
            const findRange = (nodes) => {
                nodes.forEach(n => {
                    if (n.start_date) {
                        const sd = new Date(n.start_date);
                        if (sd < minD) minD = sd;
                    }
                    if (n.end_date) {
                        const ed = new Date(n.end_date);
                        if (ed > maxD) maxD = ed;
                    }
                    if (n.children) findRange(n.children);
                });
            };
            findRange(res.data.tree || []);

            const padDays = scale === 'months' ? 60 : (scale === 'weeks' ? 30 : 14);
            minD.setDate(minD.getDate() - padDays);
            maxD.setDate(maxD.getDate() + padDays);
            setViewStartDate(minD);
            setViewEndDate(maxD);

        } catch (err) {
            console.error("Failed to fetch Gantt:", err);
            setError(err.response?.data?.message || 'Failed to load Gantt chart');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!projectId) return;
        fetchGantt();
    }, [projectId, scale]);

    const [expandedNodes, setExpandedNodes] = useState(new Set());

    useEffect(() => {
        if (treeData.length > 0) {
            const initialExpanded = new Set();
            const collectIds = (nodes) => {
                nodes.forEach(n => {
                    if (n.hierarchy_level === 'PORTFOLIO' || n.hierarchy_level === 'EPIC') {
                        initialExpanded.add(n.id);
                    }
                    if (n.children) collectIds(n.children);
                });
            };
            collectIds(treeData);
            setExpandedNodes(initialExpanded);
        }
    }, [treeData]);

    const toggleNode = (id) => {
        setExpandedNodes(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const flattenTree = (nodes, level = 0, isLastChildArray = [], inheritedThemeIndex = -1) => {
        let result = [];
        nodes.forEach((node, index) => {
            const isLast = index === nodes.length - 1;
            const currentIsLastChildArray = [...isLastChildArray, isLast];

            let themeIndex = inheritedThemeIndex;
            if (node.hierarchy_level === 'EPIC') {
                let hash = 0;
                for (let i = 0; i < node.title.length; i++) {
                    hash = node.title.charCodeAt(i) + ((hash << 5) - hash);
                }
                themeIndex = Math.abs(hash) % colorThemes.length;
            }

            result.push({ ...node, level, isLastChildArray: currentIsLastChildArray, themeIndex });
            if (expandedNodes.has(node.id) && node.children && node.children.length > 0) {
                result = result.concat(flattenTree(node.children, level + 1, currentIsLastChildArray, themeIndex));
            }
        });
        return result;
    };

    const flatNodes = flattenTree(treeData);

    const getContextButtonLabel = () => {
        const node = flatNodes.find(n => n.id === selectedNodeId);
        if (!node) return '';
        if (node.hierarchy_level === 'PORTFOLIO') return 'Add Phase Task';
        if (node.hierarchy_level === 'EPIC') return 'Add Sub-Task';
        return 'Add Sibling Task';
    };

    const handleCreateFromContext = (nodeId) => {
        if (!isManagerOrAdmin) return;
        const node = flatNodes.find(n => n.id === nodeId);
        if (!node) return;

        if (node.hierarchy_level === 'EPIC') {
            setInlineAddingEpicId(node.id);
        } else if (node.hierarchy_level === 'TASK') {
            const parentEpic = flatNodes.find(n => n.hierarchy_level === 'EPIC' && n.children?.some(c => c.id === node.id));
            if (parentEpic) {
                setInlineAddingEpicId(parentEpic.id);
            }
        } else {
            const firstEpic = flatNodes.find(n => n.hierarchy_level === 'EPIC');
            if (firstEpic) {
                setInlineAddingEpicId(firstEpic.id);
            }
        }
    };

    const getDaysBetween = (start, end) => {
        const diffTime = Math.abs(end - start);
        return diffTime / (1000 * 60 * 60 * 24);
    };

    const totalDays = Math.ceil(getDaysBetween(viewStartDate, viewEndDate));
    // Pixel span of the full date range — used as the grid's minimum width so no blank space appears
    const contentPixelWidth = Math.max(totalDays * pixelsPerDay, 800);

    // ==========================================
    // DYNAMIC AT-RISK & DELAY DETECTION ALGORITHM
    // ==========================================
    const getTaskWarning = (node) => {
        if (node.hierarchy_level !== 'TASK' || node.status === 'COMPLETED') return null;
        if (!node.start_date || !node.end_date) return null;

        const today = new Date();
        const start = new Date(node.start_date);
        const deadline = new Date(node.end_date);

        // 1. Check if past deadline
        if (today > deadline) {
            return { type: 'DELAYED', label: '🚨 DELAYED', color: 'bg-red-50 text-red-600 border-red-200' };
        }

        // 2. Check if progress is lagging expected timeline
        const totalDuration = deadline - start;
        const elapsed = today - start;
        if (elapsed > 0 && totalDuration > 0) {
            const expectedProgress = (elapsed / totalDuration) * 100;
            if (node.progress < expectedProgress - 20) {
                return { type: 'AT_RISK', label: '⚠️ AT RISK', color: 'bg-amber-50 text-amber-600 border-amber-200' };
            }
        }
        return null;
    };

    // ==========================================
    // GLOWING CRITICAL PATH CALCULATION
    // ==========================================
    const getCriticalPathNodes = () => {
        const leafTasks = flatNodes.filter(n => n.hierarchy_level === 'TASK');
        if (leafTasks.length === 0) return new Set();

        const criticalSet = new Set();

        // 1. If a node is selected, trace from the selected item
        if (selectedNodeId) {
            const selectedNode = flatNodes.find(n => n.id === selectedNodeId);
            if (selectedNode) {
                if (selectedNode.hierarchy_level === 'TASK') {
                    criticalSet.add(selectedNodeId);
                } else {
                    // For parent epic/folders, add all descendant tasks
                    const addDescendants = (nodeId) => {
                        const children = flatNodes.filter(n => n.parent_id === nodeId || n.parentId === nodeId);
                        children.forEach(c => {
                            if (c.hierarchy_level === 'TASK') {
                                criticalSet.add(c.id);
                            } else {
                                addDescendants(c.id);
                            }
                        });
                    };
                    addDescendants(selectedNodeId);
                }
            }
        }

        // 2. Default fallback: Seed with the tasks matching the absolute latest project deadline
        if (criticalSet.size === 0) {
            let maxTime = 0;
            leafTasks.forEach(t => {
                if (t.end_date) {
                    const time = new Date(t.end_date).getTime();
                    if (time > maxTime) maxTime = time;
                }
            });

            leafTasks.forEach(t => {
                if (t.end_date && new Date(t.end_date).getTime() === maxTime) {
                    criticalSet.add(t.id);
                }
            });
        }

        // 3. Trace predecessors iteratively
        for (let iter = 0; iter < 10; iter++) {
            dependencies.forEach(dep => {
                if (criticalSet.has(dep.target)) {
                    criticalSet.add(dep.source);
                }
            });
        }
        return criticalSet;
    };
    const criticalPathNodes = getCriticalPathNodes();

    // ==========================================
    // EXPORT TO EXCEL FEATURE (SHEETJS)
    // ==========================================
    const exportToExcel = () => {
        const dataRows = flatNodes.map(node => ({
            'Item Title': '  '.repeat(node.level) + node.title,
            'Type': node.hierarchy_level,
            'Status': node.status === 'NOT_STARTED' ? 'TODO' : node.status,
            'Progress': `${node.progress}%`,
            'Start Date': node.start_date ? new Date(node.start_date).toISOString().split('T')[0] : 'N/A',
            'Deadline': node.end_date ? new Date(node.end_date).toISOString().split('T')[0] : 'N/A',
            'Assignee': node.assigneeName || 'Unassigned',
            'Timeline Warning': getTaskWarning(node)?.type || 'ON TRACK'
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataRows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Gantt Roadmap');

        // Set column widths
        const max_width = dataRows.reduce((w, r) => Math.max(w, r['Item Title'].length), 10);
        worksheet['!cols'] = [
            { wch: max_width + 4 },
            { wch: 15 },
            { wch: 15 },
            { wch: 10 },
            { wch: 15 },
            { wch: 15 },
            { wch: 20 },
            { wch: 18 }
        ];

        XLSX.writeFile(workbook, `Project_Gantt_Export_${projectId}.xlsx`);
    };

    // ==========================================
    // INTERACTIVE DRAG-AND-DROP TIMELINE ENGINE
    // ==========================================
    const dragRef = useRef(null);
    const [previewUpdate, setPreviewUpdate] = useState(0);

    const handleTaskDragStart = (e, node, type) => {
        if (!isManagerOrAdmin || node.hierarchy_level !== 'TASK') return;
        e.stopPropagation();

        dragRef.current = {
            active: true,
            nodeId: node.id,
            type: type, // 'move', 'left', 'right'
            startX: e.clientX,
            initialStart: new Date(node.start_date),
            initialEnd: new Date(node.end_date),
            deltaDays: 0
        };

        document.addEventListener('mousemove', handleTaskDragMove);
        document.addEventListener('mouseup', handleTaskDragEnd);
    };

    const handleTaskDragMove = (e) => {
        if (!dragRef.current?.active) return;
        const state = dragRef.current;
        const deltaX = e.clientX - state.startX;
        const deltaDays = deltaX / pixelsPerDay;

        state.deltaDays = deltaDays;
        setPreviewUpdate(prev => prev + 1);
    };

    const handleTaskDragEnd = async () => {
        if (!dragRef.current?.active) return;
        const state = dragRef.current;

        document.removeEventListener('mousemove', handleTaskDragMove);
        document.removeEventListener('mouseup', handleTaskDragEnd);

        const shiftDays = Math.round(state.deltaDays);
        if (shiftDays !== 0) {
            try {
                let newStart = new Date(state.initialStart);
                let newEnd = new Date(state.initialEnd);

                if (state.type === 'move') {
                    newStart.setDate(newStart.getDate() + shiftDays);
                    newEnd.setDate(newEnd.getDate() + shiftDays);
                } else if (state.type === 'left') {
                    newStart.setDate(newStart.getDate() + shiftDays);
                    if (newStart > newEnd) newStart = new Date(newEnd);
                } else if (state.type === 'right') {
                    newEnd.setDate(newEnd.getDate() + shiftDays);
                    if (newEnd < newStart) newEnd = new Date(newStart);
                }

                // Optimistically update the hierarchical treeData state immediately!
                const updateTreeDatesRecursive = (nodes) => {
                    return nodes.map(n => {
                        if (n.id === state.nodeId) {
                            return {
                                ...n,
                                start_date: newStart.toISOString(),
                                end_date: newEnd.toISOString()
                            };
                        }
                        if (n.children && n.children.length > 0) {
                            return {
                                ...n,
                                children: updateTreeDatesRecursive(n.children)
                            };
                        }
                        return n;
                    });
                };
                setTreeData(prev => updateTreeDatesRecursive(prev));

                // Instantly clear drag reference so standard render path uses the optimistic state
                dragRef.current = null;
                setPreviewUpdate(prev => prev + 1);

                // Perform the backend save and background fetch safely
                await api.put(`/gantt/${projectId}/task/${state.nodeId}`, {
                    start_date: newStart.toISOString(),
                    end_date: newEnd.toISOString()
                });

                await fetchGantt();
            } catch (err) {
                console.error('Drag update failed:', err);
                alert("Failed to reschedule task");
                // Safely revert to correct DB state
                await fetchGantt();
            }
        } else {
            dragRef.current = null;
            setPreviewUpdate(prev => prev + 1);
        }
    };

    const getRenderPosition = (node) => {
        let sd = new Date(node.start_date);
        let ed = new Date(node.end_date);

        if (dragRef.current?.active && dragRef.current.nodeId === node.id) {
            const shiftDays = dragRef.current.deltaDays;
            const state = dragRef.current;

            if (state.type === 'move') {
                sd = new Date(state.initialStart.getTime() + shiftDays * 24 * 60 * 60 * 1000);
                ed = new Date(state.initialEnd.getTime() + shiftDays * 24 * 60 * 60 * 1000);
            } else if (state.type === 'left') {
                sd = new Date(state.initialStart.getTime() + shiftDays * 24 * 60 * 60 * 1000);
                if (sd > ed) sd = new Date(ed);
            } else if (state.type === 'right') {
                ed = new Date(state.initialEnd.getTime() + shiftDays * 24 * 60 * 60 * 1000);
                if (ed < sd) ed = new Date(sd);
            }
        }

        const left = getDaysBetween(viewStartDate, sd) * pixelsPerDay;
        const width = Math.max(pixelsPerDay, getDaysBetween(sd, ed) * pixelsPerDay);
        return { left, width };
    };

    // Automatically scroll to the selected task bar in the timeline
    const scrollToNode = (nodeId) => {
        if (!timelineRef.current) return;
        const node = flatNodes.find(n => n.id === nodeId);
        if (!node) return;

        const index = flatNodes.findIndex(n => n.id === nodeId);
        const containerWidth = timelineRef.current.clientWidth;
        const containerHeight = timelineRef.current.clientHeight;

        let targetScrollLeft = timelineRef.current.scrollLeft;
        if (node.start_date && node.end_date) {
            const { left, width } = getRenderPosition(node);
            targetScrollLeft = left - (containerWidth / 2) + (width / 2);
        }

        // Each row is exactly 40px in height. Sticky header takes 40px.
        const targetScrollTop = index !== -1 ? (index * 40) - (containerHeight / 2) + 20 : timelineRef.current.scrollTop;

        // Smoothly scroll the container horizontally and vertically
        timelineRef.current.scrollTo({
            left: Math.max(0, targetScrollLeft),
            top: Math.max(0, targetScrollTop),
            behavior: 'smooth'
        });

        // Also scroll the left pane in vertical sync
        if (leftPaneRef.current) {
            leftPaneRef.current.scrollTo({
                top: Math.max(0, targetScrollTop),
                behavior: 'smooth'
            });
        }
    };

    useEffect(() => {
        if (selectedNodeId) {
            scrollToNode(selectedNodeId);
        }
    }, [selectedNodeId]);

    const renderTimelineHeader = () => {
        const headers = [];
        let current = new Date(viewStartDate);

        if (scale === 'days') {
            for (let i = 0; i <= totalDays; i++) {
                headers.push(
                    <div key={i} className="flex-shrink-0 flex flex-col items-center justify-end pb-1.5 border-r border-slate-200 text-slate-600 text-xs font-semibold" style={{ width: `${pixelsPerDay}px`, height: '40px' }}>
                        <span>{current.getDate()}</span>
                        <span className="text-[8px] uppercase tracking-wider text-slate-400 font-bold">{current.toLocaleString('default', { month: 'short' })}</span>
                    </div>
                );
                current.setDate(current.getDate() + 1);
            }
        } else if (scale === 'weeks') {
            for (let i = 0; i <= totalDays; i += 7) {
                headers.push(
                    <div key={i} className="flex-shrink-0 flex flex-col items-center justify-end pb-1.5 border-r border-slate-200 text-slate-600 text-[10px] font-bold" style={{ width: `${pixelsPerDay * 7}px`, height: '40px' }}>
                        <span>{current.getDate()} {current.toLocaleString('default', { month: 'short' })}</span>
                        <span className="text-[8px] uppercase tracking-wider text-indigo-500 font-bold">Week</span>
                    </div>
                );
                current.setDate(current.getDate() + 7);
            }
        } else {
            for (let i = 0; i <= totalDays; i += 30) {
                headers.push(
                    <div key={i} className="flex-shrink-0 flex flex-col items-center justify-center border-r border-slate-200 text-indigo-600 text-xs font-bold uppercase tracking-wider" style={{ width: `${pixelsPerDay * 30}px`, height: '40px' }}>
                        {current.toLocaleString('default', { month: 'short', year: '2-digit' })}
                    </div>
                );
                current.setDate(current.getDate() + 30);
            }
        }
        return (
            <div style={{ minWidth: `${contentPixelWidth}px`, width: '100%' }}
                className="flex bg-slate-50 border-b border-slate-200 sticky top-0 z-10 shadow-sm"
            >
                {headers}
            </div>
        );
    };

    const handleAddInlineTask = async (epicId) => {
        if (!newTaskTitle.trim()) return;
        try {
            const deadline = new Date();
            deadline.setDate(deadline.getDate() + 7);

            // If epicId is a MongoDB ObjectId (i.e. not the hardcoded strings epic-design, epic-dev, epic-qa), set it as parentId
            const isCustomEpic = !epicId.startsWith('epic-');
            const parentId = isCustomEpic ? epicId : null;

            await api.post('/tasks', {
                title: newTaskTitle.trim(),
                description: `Created directly in phase`,
                projectId: projectId,
                deadline: deadline.toISOString(),
                parentId: parentId
            });

            setNewTaskTitle('');
            setInlineAddingEpicId(null);
            fetchGantt();
        } catch (err) {
            console.error(err);
            alert(err.response?.data?.message || "Failed to create task.");
        }
    };

    const [isAddingEpic, setIsAddingEpic] = useState(false);
    const [newEpicTitle, setNewEpicTitle] = useState('');

    const handleCreateEpic = async () => {
        if (!newEpicTitle.trim() || !projectId) return;
        try {
            await api.post('/tasks', {
                title: newEpicTitle.trim(),
                projectId,
                hierarchyLevel: 'EPIC'
            });
            setIsAddingEpic(false);
            setNewEpicTitle('');
            fetchGantt();
        } catch (err) {
            console.error(err);
            alert(err.response?.data?.message || "Failed to create phase folder.");
        }
    };

    const handleUpdateTaskTimeline = async () => {
        if (!editingTask) return;
        try {
            setUpdatingTask(true);

            await api.put(`/gantt/${projectId}/task/${editingTask.id}`, {
                start_date: editingTask.start_date,
                end_date: editingTask.end_date,
                progress: editingTask.progress,
                predecessorId: editingTask.predecessor_id || null
            });

            if (editingTask.assignee_id) {
                await api.put(`/tasks/${editingTask.id}`, {
                    assigneeId: editingTask.assignee_id
                });
            }

            setEditingTask(null);
            fetchGantt();
        } catch (err) {
            console.error(err);
            alert(err.response?.data?.message || "Failed to save edits.");
        } finally {
            setUpdatingTask(false);
        }
    };

    const handleFinishRequest = async (taskId) => {
        try {
            await api.post(`/gantt/${projectId}/task/${taskId}/finish-request`);
            alert("Completion request sent to manager.");
            fetchGantt();
        } catch (err) {
            console.error(err);
            alert("Failed to send request.");
        }
    };

    if (loading && treeData.length === 0) {
        return (
            <div className="fixed inset-0 z-[100] bg-slate-50 flex flex-col items-center justify-center text-indigo-600 p-10">
                <span className="animate-spin material-symbols-outlined text-5xl mb-4">autorenew</span>
                <p className="text-slate-500 text-sm font-semibold tracking-wide">Loading Gantt Timeline...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="fixed inset-0 z-[100] bg-slate-50 flex flex-col items-center justify-center p-10">
                <div className="bg-red-500/5 border border-red-200 rounded-2xl p-8 max-w-md w-full text-center relative shadow-lg">
                    <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                    <span className="material-symbols-outlined text-red-500 text-5xl mb-4">error</span>
                    <h3 className="text-slate-800 font-bold text-lg mb-2">Failed to Load Gantt</h3>
                    <p className="text-slate-500 text-sm mb-6">{error}</p>
                    <button onClick={onClose} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-colors">
                        Close
                    </button>
                </div>
            </div>
        );
    }

    const gridBackgroundStyle = {
        minWidth: `${contentPixelWidth}px`,
        width: '100%',
        backgroundImage: `linear-gradient(to right, rgba(226, 232, 240, 0.6) 1px, transparent 1px)`,
        backgroundSize: `${scale === 'weeks' ? pixelsPerDay * 7 : (scale === 'months' ? pixelsPerDay * 30 : pixelsPerDay)}px 100%`,
        backgroundColor: '#ffffff'
    };

    return (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col font-sans overflow-hidden text-slate-800 animate-fade-in">
            {/* Header */}
            <div className="h-16 flex-shrink-0 bg-white flex items-center justify-between px-6 border-b border-slate-200/80 shadow-sm z-30">
                <div className="flex items-center gap-4">
                    <button onClick={onClose || (() => navigate(-1))} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all">
                        <span className="material-symbols-outlined text-sm font-bold">arrow_back</span>
                    </button>
                    <div>
                        <h1 className="text-slate-800 font-bold text-lg tracking-tight">Project Timeline</h1>
                        <p className="text-slate-500 text-xs font-medium">Interactive Roadmaps & Rollup Hierarchy</p>
                    </div>
                </div>

                {/* Toolbar */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={exportToExcel}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-all shadow-sm"
                        title="Download Gantt tree details as Excel report"
                    >
                        <span className="material-symbols-outlined text-sm font-bold">file_download</span>
                        Export Excel
                    </button>

                    <button
                        onClick={() => setShowCriticalPath(!showCriticalPath)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-xs font-extrabold transition-all shadow-sm ${showCriticalPath ? 'bg-red-50 text-red-600 border-red-200 animate-pulse' : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'}`}
                    >
                        <span className={`w-2.5 h-2.5 rounded-full ${showCriticalPath ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' : 'bg-slate-400'}`}></span>
                        Critical Path
                    </button>

                    <button
                        onClick={() => setShowLegend(!showLegend)}
                        className={`w-7 h-7 flex items-center justify-center rounded-full border text-xs font-extrabold shadow-sm transition-all cursor-pointer ${showLegend ? 'bg-indigo-600 text-white border-indigo-650 scale-105 shadow-[0_0_8px_rgba(79,70,229,0.35)]' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200 hover:text-slate-800'}`}
                        title="Show Gantt Legend & Help Guide"
                    >
                        ?
                    </button>

                    <div className="w-px h-6 bg-slate-200/80 mx-1" />

                    <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/60 shadow-inner">
                        <button onClick={() => setScale('days')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${scale === 'days' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>Days</button>
                        <button onClick={() => setScale('weeks')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${scale === 'weeks' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>Weeks</button>
                        <button onClick={() => setScale('months')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${scale === 'months' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>Months</button>
                    </div>
                </div>
            </div>

            {/* Toolbar Legend / Help Dropdown Card */}
            {showLegend && (
                <div className="absolute top-[68px] left-6 right-6 p-5 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] animate-fade-in flex flex-col gap-4 z-[100] transition-all duration-300 transform scale-100">
                    <div className="flex items-center justify-between border-b border-slate-150 pb-2.5">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-indigo-600 text-lg font-bold">help_outline</span>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">Gantt Chart Interactive Legend & Help Guide</h4>
                        </div>
                        <button
                            onClick={() => setShowLegend(false)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-650 transition-colors cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-sm font-bold">close</span>
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                        {/* 1. Hierarchy types */}
                        <div className="flex flex-col gap-2.5 p-3 bg-slate-50/70 rounded-xl border border-slate-100">
                            <span className="font-extrabold text-[10.5px] uppercase tracking-wider text-slate-400">📁 Timeline Nodes</span>
                            <div className="flex flex-col gap-2.5 mt-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-base">📁</span>
                                    <div>
                                        <p className="font-bold text-[11.5px] text-slate-800">Portfolio Root</p>
                                        <p className="text-[10.5px] text-slate-500 leading-tight">Project boundary containing all child phases.</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-base">📂</span>
                                    <div>
                                        <p className="font-bold text-[11.5px] text-slate-800">Phase Folders</p>
                                        <p className="text-[10.5px] text-slate-500 leading-tight">Stages (e.g. Design, Dev) holding tasks.</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-base">🔹</span>
                                    <div>
                                        <p className="font-bold text-[11.5px] text-slate-800">Leaf Tasks</p>
                                        <p className="text-[10.5px] text-slate-500 leading-tight">Assignable action items with deadlines.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 2. Drag / Timeline controls */}
                        <div className="flex flex-col gap-2.5 p-3 bg-indigo-50/20 rounded-xl border border-indigo-100/30">
                            <span className="font-extrabold text-[10.5px] uppercase tracking-wider text-indigo-500">↔️ Resizing & Editing</span>
                            <div className="flex flex-col gap-2.5 mt-1">
                                <div className="flex items-start gap-2">
                                    <span className="material-symbols-outlined text-sm text-indigo-500 font-bold mt-0.5">drag_indicator</span>
                                    <div>
                                        <p className="font-bold text-[11.5px] text-slate-800">Shift Timelines</p>
                                        <p className="text-[10.5px] text-slate-500 leading-tight">Drag a task's center to reschedule its start and end dates.</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="material-symbols-outlined text-sm text-indigo-500 font-bold mt-0.5">open_in_full</span>
                                    <div>
                                        <p className="font-bold text-[11.5px] text-slate-800">Extend & Shrink</p>
                                        <p className="text-[10.5px] text-slate-500 leading-tight">Drag left/right task borders to extend or reduce deadlines.</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="material-symbols-outlined text-sm text-indigo-500 font-bold mt-0.5">touch_app</span>
                                    <div>
                                        <p className="font-bold text-[11.5px] text-slate-800">Double-Click Edit</p>
                                        <p className="text-[10.5px] text-slate-500 leading-tight">Double-click any timeline task bar to edit details and predecessors.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 3. Dependencies and Connections */}
                        <div className="flex flex-col gap-2.5 p-3 bg-emerald-50/20 rounded-xl border border-emerald-100/30">
                            <span className="font-extrabold text-[10.5px] uppercase tracking-wider text-emerald-600">🔗 Task Dependencies</span>
                            <div className="flex flex-col gap-2.5 mt-1">
                                <div className="flex items-start gap-2">
                                    <span className="text-base">🔗</span>
                                    <div>
                                        <p className="font-bold text-[11.5px] text-slate-800">Predecessor Links</p>
                                        <p className="text-[10.5px] text-slate-500 leading-tight">SVG curved arrows showing manual chronological blocking.</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="material-symbols-outlined text-sm text-emerald-650 font-bold mt-0.5">link_off</span>
                                    <div>
                                        <p className="font-bold text-[11.5px] text-slate-800">Manual Connections</p>
                                        <p className="text-[10.5px] text-slate-500 leading-tight">No auto-linking. Choose predecessor in edit task dialog.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 4. Critical Path */}
                        <div className="flex flex-col gap-2.5 p-3 bg-red-50/20 rounded-xl border border-red-100/30">
                            <span className="font-extrabold text-[10.5px] uppercase tracking-wider text-red-500">⚡ Critical Path & Risks</span>
                            <div className="flex flex-col gap-2.5 mt-1">
                                <div className="flex items-start gap-2">
                                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping mt-1.5 shadow-[0_0_8px_rgba(239,68,68,0.7)]"></span>
                                    <div>
                                        <p className="font-bold text-[11.5px] text-slate-800">Flashing Red Tasks</p>
                                        <p className="text-[10.5px] text-slate-500 leading-tight">On Critical Path. Delaying these instantly delays project delivery.</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="px-1.5 py-0.5 rounded text-[8px] bg-red-100 text-red-700 font-extrabold mt-0.5 border border-red-200">AT RISK</span>
                                    <div>
                                        <p className="font-bold text-[11.5px] text-slate-800">At-Risk Alert</p>
                                        <p className="text-[10.5px] text-slate-500 leading-tight">Indicates progress is falling behind compared to target schedule.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden relative bg-slate-50">

                {/* Left Pane */}
                <div
                    ref={leftPaneRef}
                    onScroll={(e) => {
                        if (!timelineRef.current || !leftPaneRef.current) return;
                        if (timelineRef.current.scrollTop !== leftPaneRef.current.scrollTop) {
                            timelineRef.current.scrollTop = leftPaneRef.current.scrollTop;
                        }
                    }}
                    className="flex-shrink-0 bg-white overflow-y-auto overflow-x-hidden custom-scrollbar flex flex-col z-20 shadow-xl"
                    style={{
                        width: `${leftPaneWidth}px`,
                        minWidth: isSidebarCollapsed ? '0px' : undefined,
                        overflow: isSidebarCollapsed ? 'hidden' : undefined,
                        transition: isSidebarResizing.current ? 'none' : 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                >
                    <div className="h-[40px] sticky top-0 bg-slate-100 flex items-center px-4 text-[10px] font-semibold tracking-wider text-slate-500 uppercase border-b border-slate-200 z-10 select-none">
                        <div className="flex-1 flex items-center gap-2">
                            <span>Task Hierarchy</span>
                            {isManagerOrAdmin && (
                                <div className="flex items-center gap-1.5 normal-case tracking-normal">
                                    <button
                                        onClick={() => setIsAddingEpic(!isAddingEpic)}
                                        className="flex items-center gap-1 px-2 py-0.5 bg-indigo-700 text-white rounded text-[8.5px] font-semibold shadow-sm hover:scale-[1.03] transition-all cursor-pointer ml-2"
                                        title="Create a new Project Phase folder"
                                    >
                                        <span className="material-symbols-outlined text-[10px] font-semibold">create_new_folder</span>
                                        + Phase
                                    </button>

                                    {selectedNodeId && (
                                        <button
                                            onClick={() => handleCreateFromContext(selectedNodeId)}
                                            className="flex items-center gap-1 px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[8.5px] font-semibold shadow-sm hover:scale-[1.03] transition-all cursor-pointer animate-pulse"
                                            title="Add sub-task or sibling task to selected item"
                                        >
                                            <span className="material-symbols-outlined text-[10px] font-semibold">add</span>
                                            {getContextButtonLabel()}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="w-16 text-right">Owner</div>
                    </div>

                    <div className="flex-1 py-1 divide-y divide-slate-100 relative">
                        {isAddingEpic && (
                            <div className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-50/70 border-b border-indigo-100 relative animate-fade-in" style={{ paddingLeft: '24px', height: '40px' }}>
                                <span className="material-symbols-outlined text-sm text-indigo-500">folder_open</span>
                                <input
                                    type="text"
                                    placeholder="Phase name (e.g. Integration Phase)..."
                                    value={newEpicTitle}
                                    onChange={(e) => setNewEpicTitle(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateEpic(); }}
                                    className="flex-1 bg-white text-slate-800 border border-indigo-200 rounded px-2 py-1 text-xs font-semibold shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                    autoFocus
                                />
                                <button
                                    onClick={handleCreateEpic}
                                    className="px-3 py-1 bg-indigo-650 text-white rounded text-[10px] font-bold hover:bg-indigo-700 shadow-sm transition-all cursor-pointer"
                                >
                                    Create
                                </button>
                                <button
                                    onClick={() => { setIsAddingEpic(false); setNewEpicTitle(''); }}
                                    className="p-1 text-slate-400 hover:text-slate-650 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-sm font-bold">close</span>
                                </button>
                            </div>
                        )}
                        {flatNodes.map((node, index) => {
                            // Connecting tree lines
                            const treeGuides = [];
                            for (let i = 0; i < node.level; i++) {
                                const isLastParentInTree = node.isLastChildArray[i];
                                if (!isLastParentInTree) {
                                    treeGuides.push(
                                        <div key={i} className="absolute w-px bg-slate-200 top-0 bottom-0" style={{ left: `${(i * 24) + 26}px` }} />
                                    );
                                }
                            }

                            const warning = getTaskWarning(node);

                            return (
                                <React.Fragment key={node.id}>
                                    <div
                                        onClick={() => setSelectedNodeId(node.id)}
                                        className={`flex items-center px-4 transition-all text-xs group relative animate-fade-in cursor-pointer ${selectedNodeId === node.id ? 'bg-indigo-50/55 border-l-4 border-l-indigo-650 shadow-inner' : 'hover:bg-slate-50'}`}
                                        style={{ height: '40px' }}
                                    >
                                        {treeGuides}
                                        {node.level > 0 && (
                                            <div className="absolute h-px bg-slate-200 w-3" style={{ left: `${((node.level - 1) * 24) + 26}px`, top: '20px' }} />
                                        )}

                                        <div className="flex-1 flex items-center gap-2 overflow-hidden" style={{ paddingLeft: `${node.level * 24}px` }}>

                                            {node.children && node.children.length > 0 ? (
                                                <button onClick={() => toggleNode(node.id)} className="w-5 h-5 flex items-center justify-center rounded bg-slate-100 text-slate-500 hover:text-indigo-600 hover:bg-slate-200 transition-colors z-10 relative">
                                                    <span className="material-symbols-outlined text-[14px] font-bold">
                                                        {expandedNodes.has(node.id) ? 'expand_more' : 'chevron_right'}
                                                    </span>
                                                </button>
                                            ) : (
                                                <div className="w-5 h-5 flex items-center justify-center z-10 relative">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                                </div>
                                            )}

                                            <span className={`material-symbols-outlined text-sm ${node.hierarchy_level === 'PORTFOLIO' ? 'text-indigo-500' : (node.hierarchy_level === 'EPIC' ? 'text-slate-455' : 'text-emerald-500')}`}>
                                                {node.hierarchy_level === 'PORTFOLIO' ? 'cases' : (node.hierarchy_level === 'EPIC' ? 'folder_open' : 'check_circle')}
                                            </span>

                                            <span className={`truncate ${node.hierarchy_level === 'TASK' ? 'text-slate-650 font-normal' : 'text-slate-800 font-semibold'} group-hover:text-indigo-600 transition-colors`}>
                                                {node.title}
                                            </span>

                                            {warning && (
                                                <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold border shadow-sm ${warning.color}`} title={warning.type === 'DELAYED' ? 'This task is past its target deadline date!' : 'Progress is falling significantly behind elapsed timeframe schedule.'}>
                                                    {warning.label}
                                                </span>
                                            )}

                                            {node.hierarchy_level !== 'TASK' && (() => {
                                                const theme = node.themeIndex !== undefined && node.themeIndex !== -1 ? colorThemes[node.themeIndex] : { dot: 'bg-slate-400' };
                                                return (
                                                    <span
                                                        className={`inline-block w-2 h-2 rounded-full ${theme.dot} shrink-0 ml-1.5`}
                                                        title="Auto-calculated Phase"
                                                    />
                                                );
                                            })()}

                                            {isManagerOrAdmin && node.hierarchy_level === 'EPIC' && (
                                                <button
                                                    onClick={() => setInlineAddingEpicId(inlineAddingEpicId === node.id ? null : node.id)}
                                                    className="ml-1.5 w-5 h-5 flex items-center justify-center rounded bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 border border-slate-200 shadow-sm transition-all hover:scale-110 cursor-pointer"
                                                    title="Add Sub-Task"
                                                >
                                                    <span className="material-symbols-outlined text-[12px] font-semibold">add</span>
                                                </button>
                                            )}
                                        </div>
                                        <div
                                            className="w-16 text-right text-[10px] text-slate-500 font-semibold truncate px-2 cursor-help"
                                            title={node.hierarchy_level !== 'TASK' ? `Created by Phase Manager: ${node.assigneeName}` : `Task Owner: ${node.assigneeName}`}
                                        >
                                            {node.assigneeName && node.assigneeName !== 'Unassigned' ? node.assigneeName.split(' ')[0] : '-'}
                                        </div>
                                    </div>

                                    {inlineAddingEpicId === node.id && (
                                        <div className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-50/50 border-y border-indigo-100 relative" style={{ paddingLeft: `${(node.level + 1) * 24}px`, height: '40px' }}>
                                            <input
                                                type="text"
                                                placeholder="Type task title and hit enter..."
                                                value={newTaskTitle}
                                                onChange={(e) => setNewTaskTitle(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') handleAddInlineTask(node.id); }}
                                                className="flex-1 bg-white text-slate-800 border border-indigo-200 rounded px-2 py-1 text-xs font-medium shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                                autoFocus
                                            />
                                            <button
                                                onClick={() => handleAddInlineTask(node.id)}
                                                className="px-3 py-1 bg-indigo-600 text-white rounded text-[10px] font-bold hover:bg-indigo-700 shadow-sm transition-all"
                                            >
                                                Save
                                            </button>
                                            <button
                                                onClick={() => { setInlineAddingEpicId(null); setNewTaskTitle(''); }}
                                                className="px-2 py-1 bg-white border border-slate-200 text-slate-500 rounded text-[10px] font-bold hover:bg-slate-50"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>

                {/* Vertical Splitter — drag handle + collapse button */}
                <div
                    className="relative flex-shrink-0 w-5 flex flex-col items-center justify-center group z-30 select-none"
                    style={{ cursor: isSidebarCollapsed ? 'default' : 'col-resize' }}
                    onMouseDown={handleSidebarMouseDown}
                >
                    {/* Gutter line */}
                    <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[3px] bg-slate-200 group-hover:bg-indigo-400 transition-colors duration-150 rounded-full" />

                    {/* Centre pill — drag dots */}
                    <div className="relative z-10 flex flex-col items-center gap-[3px] py-1 px-0.5 rounded-full bg-white border border-slate-200 group-hover:border-indigo-400 shadow-sm transition-all duration-150 pointer-events-none">
                        <span className="w-1 h-1 rounded-full bg-slate-400 group-hover:bg-indigo-400 transition-colors" />
                        <span className="w-1 h-1 rounded-full bg-slate-400 group-hover:bg-indigo-400 transition-colors" />
                        <span className="w-1 h-1 rounded-full bg-slate-400 group-hover:bg-indigo-400 transition-colors" />
                        <span className="w-1 h-1 rounded-full bg-slate-400 group-hover:bg-indigo-400 transition-colors" />
                    </div>

                    {/* Collapse / expand arrow button */}
                    <button
                        onClick={(e) => { e.stopPropagation(); toggleSidebarCollapse(); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="absolute top-1/2 -translate-y-1/2 z-20 w-5 h-8 flex items-center justify-center rounded-full bg-white border border-slate-200 shadow-md text-slate-500 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 transition-all duration-150 opacity-0 group-hover:opacity-100 cursor-pointer"
                        style={{ marginTop: '28px' }}
                        title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        <span className="material-symbols-outlined text-[13px] font-bold">
                            {isSidebarCollapsed ? 'chevron_right' : 'chevron_left'}
                        </span>
                    </button>
                </div>

                {/* Right Pane: Timeline Canvas */}
                <div
                    ref={timelineRef}
                    onScroll={(e) => {
                        if (!timelineRef.current || !leftPaneRef.current) return;
                        if (leftPaneRef.current.scrollTop !== timelineRef.current.scrollTop) {
                            leftPaneRef.current.scrollTop = timelineRef.current.scrollTop;
                        }
                    }}
                    className="flex-1 bg-white overflow-auto relative custom-scrollbar flex flex-col"
                >
                    {renderTimelineHeader()}

                    <div
                        className="relative divide-y divide-slate-100 flex-1 min-h-full"
                        style={gridBackgroundStyle}
                    >
                        {/* ==========================================
                            DYNAMIC SVG DEPENDENCY CONNECTION LINES
                           ========================================== */}
                        <svg className="absolute inset-0 pointer-events-none z-10" style={{ minWidth: `${contentPixelWidth}px`, width: '100%', height: '100%' }}>
                            <defs>
                                <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#818cf8" />
                                </marker>
                                <marker id="arrow-red" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
                                </marker>
                            </defs>
                            {dependencies.map((dep, idx) => {
                                const sourceNode = flatNodes.find(n => n.id === dep.source);
                                const targetNode = flatNodes.find(n => n.id === dep.target);
                                if (!sourceNode || !targetNode) return null;
                                if (!sourceNode.start_date || !sourceNode.end_date || !targetNode.start_date || !targetNode.end_date) return null;

                                const sourceIdx = flatNodes.findIndex(n => n.id === dep.source);
                                const targetIdx = flatNodes.findIndex(n => n.id === dep.target);
                                if (sourceIdx === -1 || targetIdx === -1) return null;

                                const sourcePos = getRenderPosition(sourceNode);
                                const targetPos = getRenderPosition(targetNode);

                                const startX = sourcePos.left + sourcePos.width;
                                const startY = (sourceIdx * 40) + 20;

                                const endX = targetPos.left;
                                const endY = (targetIdx * 40) + 20;

                                const isCriticalLink = showCriticalPath && criticalPathNodes.has(dep.source) && criticalPathNodes.has(dep.target);

                                // Gorgeous curving cubic Bezier connectors
                                const controlX1 = startX + Math.max(20, (endX - startX) / 2);
                                const controlX2 = endX - Math.max(20, (endX - startX) / 2);

                                return (
                                    <path
                                        key={`link-${idx}`}
                                        d={`M ${startX} ${startY} C ${controlX1} ${startY}, ${controlX2} ${endY}, ${endX} ${endY}`}
                                        fill="none"
                                        stroke={isCriticalLink ? '#ef4444' : '#818cf8'}
                                        strokeWidth={isCriticalLink ? 2.2 : 1.5}
                                        strokeDasharray={isCriticalLink ? 'none' : '4 3'}
                                        opacity={isCriticalLink ? 0.9 : 0.6}
                                        markerEnd={`url(${isCriticalLink ? '#arrow-red' : '#arrow'})`}
                                    />
                                );
                            })}
                        </svg>

                        {flatNodes.map((node) => {
                            const hasDates = node.start_date && node.end_date;
                            const { left, width } = hasDates ? getRenderPosition(node) : { left: 0, width: 0 };
                            const isEditable = isManagerOrAdmin && node.hierarchy_level === 'TASK';
                            const isCritical = showCriticalPath && criticalPathNodes.has(node.id);

                            return (
                                <div key={`timeline-${node.id}`} className="relative group" style={{ height: '40px' }}>
                                    {hasDates && (
                                        <div
                                            className={`absolute top-1.5 bottom-1.5 rounded-md flex items-center justify-between px-2.5 overflow-hidden font-bold transition-all shadow-sm select-none ${getTaskStyle(node)} ${isEditable ? 'cursor-grab active:cursor-grabbing hover:brightness-115' : 'cursor-default opacity-90'} ${isCritical ? 'border-red-500 ring-2 ring-red-400 ring-offset-1 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)] z-20 scale-[1.01]' : ''}`}
                                            style={{ left: `${left}px`, width: `${width}px` }}
                                            onMouseDown={(e) => isEditable && handleTaskDragStart(e, node, 'move')}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedNodeId(node.id);
                                                if (isEditable && e.detail === 2) {
                                                    setEditingTask(node);
                                                }
                                            }}
                                            title={isCritical ? "⚠️ CRITICAL PATH TASK! Double click to view details." : (isEditable ? "Drag center to move. Drag corners to resize. Double click to edit details." : "")}
                                        >
                                            <div className="absolute left-0 bottom-0 top-0 bg-white/25" style={{ width: `${node.progress}%` }}></div>

                                            <span className="text-[10px] truncate z-10 pr-1 pointer-events-none flex items-center gap-1">
                                                <span>{node.hierarchy_level === 'PORTFOLIO' ? '📁' : (node.hierarchy_level === 'EPIC' ? '📂' : '🔹')}</span>
                                                <span className="truncate">{node.title}</span>
                                            </span>

                                            {/* Left Drag Handle */}
                                            {isEditable && (
                                                <div
                                                    className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex items-center justify-center"
                                                    onMouseDown={(e) => handleTaskDragStart(e, node, 'left')}
                                                >
                                                    <div className="w-0.5 h-3 bg-white/70 rounded-full" />
                                                </div>
                                            )}

                                            {/* Right Drag Handle */}
                                            {isEditable && (
                                                <div
                                                    className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex items-center justify-center"
                                                    onMouseDown={(e) => handleTaskDragStart(e, node, 'right')}
                                                >
                                                    <div className="w-0.5 h-3 bg-white/70 rounded-full" />
                                                </div>
                                            )}

                                            {/* Non-editable indicator */}
                                            {!isEditable && (
                                                <div className="absolute right-1.5 top-0 bottom-0 flex items-center justify-center opacity-70 pointer-events-none" title="Auto-calculated (non-editable)">
                                                    <span className="material-symbols-outlined text-[13px] font-bold text-white">lock</span>
                                                </div>
                                            )}

                                            {/* Employee action button */}
                                            {['EMPLOYEE', 'INTERN'].includes(user?.role) && node.hierarchy_level === 'TASK' && node.status !== 'COMPLETED' && node.status !== 'WAITING_APPROVAL' && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleFinishRequest(node.id); }}
                                                    className="bg-white hover:bg-slate-50 text-indigo-600 rounded text-[9px] px-2 py-0.5 font-bold z-30 shadow border border-indigo-200 transition-all cursor-pointer"
                                                >
                                                    Finish
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

            </div>
            {/* ==========================================
                ZOOM CONTROL — fixed bottom-right, OUTSIDE the scrollable pane
                so it never moves when the timeline is scrolled horizontally.
               ========================================== */}
            <div className="fixed bottom-6 right-6 z-[105] flex items-center gap-2" style={{ pointerEvents: 'auto' }}>
                {/* Expandable +/- panel — slides in from the right */}
                <div
                    className="flex items-center gap-1 bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.14)] px-2 py-1.5 select-none overflow-hidden"
                    style={{
                        maxWidth: zoomOpen ? '260px' : '0px',
                        opacity: zoomOpen ? 1 : 0,
                        paddingLeft: zoomOpen ? undefined : '0px',
                        paddingRight: zoomOpen ? undefined : '0px',
                        transition: 'max-width 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease, padding 0.3s ease'
                    }}
                >
                    {/* Zoom Out */}
                    <button
                        onClick={zoomOut}
                        disabled={zoomLevel <= ZOOM_MIN}
                        className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-xl text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                        title="Zoom out"
                    >
                        <span className="material-symbols-outlined text-[18px] font-bold">remove</span>
                    </button>

                    {/* Percentage readout — click to reset */}
                    <button
                        onClick={zoomReset}
                        className="flex-shrink-0 text-[10px] font-bold text-slate-600 hover:text-indigo-600 transition-colors w-9 text-center cursor-pointer"
                        title="Reset zoom to 100%"
                    >
                        {Math.round(zoomLevel * 100)}%
                    </button>

                    {/* Zoom In */}
                    <button
                        onClick={zoomIn}
                        disabled={zoomLevel >= ZOOM_MAX}
                        className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-xl text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                        title="Zoom in"
                    >
                        <span className="material-symbols-outlined text-[18px] font-bold">add</span>
                    </button>
                </div>

                {/* Magnifier trigger button */}
                <button
                    onClick={() => setZoomOpen(o => !o)}
                    className={`w-10 h-10 flex items-center justify-center rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.15)] border transition-all duration-200 cursor-pointer ${zoomOpen
                            ? 'bg-indigo-600 border-indigo-700 text-white scale-110 shadow-[0_4px_20px_rgba(79,70,229,0.4)]'
                            : 'bg-white border-slate-200/80 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 hover:scale-105'
                        }`}
                    title={zoomOpen ? 'Close zoom controls' : 'Zoom timeline'}
                >
                    <span className="material-symbols-outlined text-[20px] font-bold">
                        {zoomOpen ? 'close' : 'search'}
                    </span>
                </button>
            </div>

            {/* Reschedule Dialog with Modernized Time Pickers */}
            {editingTask && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[110] p-4" onClick={() => {
                    setIsAssigneeDropdownOpen(false);
                    setIsPredecessorDropdownOpen(false);
                }}>
                    <div className="bg-white border border-slate-200 rounded-3xl p-7 max-w-2xl w-full h-[80vh] flex flex-col shadow-2xl animate-fade-in text-slate-800" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6 flex-shrink-0">
                            <div>
                                <h3 className="text-slate-900 font-extrabold text-xl">Reschedule Task</h3>
                                <p className="text-slate-500 text-xs font-semibold mt-1">Update timeline and assignments</p>
                            </div>
                            <button onClick={() => setEditingTask(null)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-all">
                                <span className="material-symbols-outlined text-sm font-bold">close</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-1 space-y-6 custom-scrollbar pb-4">
                            {/* Task Title */}
                            <div>
                                <label className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1.5 ml-1">Task</label>
                                <div className="text-slate-800 font-bold bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 truncate flex items-center gap-2">
                                    <span className="material-symbols-outlined text-indigo-500 text-lg">task</span>
                                    {editingTask.title}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {/* Modern Start Date */}
                                <div
                                    className="relative group cursor-pointer"
                                    onClick={() => triggerDatePicker(startDateInputRef)}
                                >
                                    <label className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1.5 ml-1 pointer-events-none">Start Date</label>
                                    <div className="relative">
                                        <input
                                            ref={startDateInputRef}
                                            type="date"
                                            value={editingTask.start_date ? editingTask.start_date.split('T')[0] : ''}
                                            onChange={(e) => {
                                                const newD = new Date(e.target.value);
                                                setEditingTask(prev => ({ ...prev, start_date: newD.toISOString() }));
                                            }}
                                            className="w-full bg-white text-slate-800 font-semibold border border-slate-300 rounded-xl pl-10 pr-3 py-3 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all cursor-pointer"
                                            style={{ colorScheme: 'light', backgroundColor: '#ffffff', color: '#1e293b' }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                triggerDatePicker(startDateInputRef);
                                            }}
                                        />
                                        <span className="material-symbols-outlined absolute left-3 top-3 text-slate-400 group-hover:text-indigo-500 transition-colors pointer-events-none">calendar_today</span>
                                    </div>
                                </div>

                                {/* Modern End Date */}
                                <div
                                    className="relative group cursor-pointer"
                                    onClick={() => triggerDatePicker(endDateInputRef)}
                                >
                                    <label className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1.5 ml-1 pointer-events-none">Deadline</label>
                                    <div className="relative">
                                        <input
                                            ref={endDateInputRef}
                                            type="date"
                                            value={editingTask.end_date ? editingTask.end_date.split('T')[0] : ''}
                                            onChange={(e) => {
                                                const newD = new Date(e.target.value);
                                                setEditingTask(prev => ({ ...prev, end_date: newD.toISOString() }));
                                            }}
                                            className="w-full bg-white text-slate-800 font-semibold border border-slate-300 rounded-xl pl-10 pr-3 py-3 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all cursor-pointer"
                                            style={{ colorScheme: 'light', backgroundColor: '#ffffff', color: '#1e293b' }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                triggerDatePicker(endDateInputRef);
                                            }}
                                        />
                                        <span className="material-symbols-outlined absolute left-3 top-3 text-slate-400 group-hover:text-indigo-500 transition-colors pointer-events-none">event</span>
                                    </div>
                                </div>
                            </div>

                            {/* Assignee Selection (Custom Dropdown) */}
                            <div className="relative group">
                                <label className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1.5 ml-1">Assign To</label>
                                <div className="relative">
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setIsAssigneeDropdownOpen(!isAssigneeDropdownOpen);
                                            setIsPredecessorDropdownOpen(false);
                                        }}
                                        className={`w-full bg-white text-slate-800 font-semibold border rounded-xl pl-10 pr-8 py-3 transition-all cursor-pointer flex items-center justify-between min-h-[46px] select-none ${isAssigneeDropdownOpen ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-300 hover:border-indigo-300'
                                            }`}
                                    >
                                        <span className="truncate">
                                            {editingTask.assignee_id ? (users.find(u => u._id === editingTask.assignee_id)?.name || editingTask.assigneeName || 'Assigned') : 'Unassigned'}
                                        </span>
                                    </div>
                                    <span className="material-symbols-outlined absolute left-3 top-3 text-slate-400 group-hover:text-indigo-500 transition-colors pointer-events-none">person_outline</span>
                                    <span
                                        className="material-symbols-outlined absolute right-3 top-3 text-slate-400 pointer-events-none transition-transform duration-200"
                                        style={{ transform: isAssigneeDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                                    >
                                        expand_more
                                    </span>

                                    {isAssigneeDropdownOpen && (
                                        <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto z-[120] py-1 custom-scrollbar animate-fade-in">
                                            <div
                                                onClick={() => {
                                                    setEditingTask(prev => ({
                                                        ...prev,
                                                        assignee_id: null,
                                                        assigneeName: 'Unassigned'
                                                    }));
                                                    setIsAssigneeDropdownOpen(false);
                                                }}
                                                className={`px-4 py-2 text-xs font-semibold cursor-pointer hover:bg-slate-50 transition-colors flex items-center justify-between ${!editingTask.assignee_id ? 'bg-indigo-50 text-indigo-650 font-bold' : 'text-slate-600'}`}
                                            >
                                                <span>Unassigned</span>
                                                {!editingTask.assignee_id && <span className="material-symbols-outlined text-xs">check</span>}
                                            </div>
                                            {users.map(u => (
                                                <div
                                                    key={u._id}
                                                    onClick={() => {
                                                        setEditingTask(prev => ({
                                                            ...prev,
                                                            assignee_id: u._id,
                                                            assigneeName: u.name
                                                        }));
                                                        setIsAssigneeDropdownOpen(false);
                                                    }}
                                                    className={`px-4 py-2 text-xs font-semibold cursor-pointer hover:bg-slate-50 transition-colors flex items-center justify-between ${editingTask.assignee_id === u._id ? 'bg-indigo-50 text-indigo-650 font-bold' : 'text-slate-600'}`}
                                                >
                                                    <span>{u.name} <span className="text-[10px] opacity-70 font-normal text-slate-400">({u.role})</span></span>
                                                    {editingTask.assignee_id === u._id && <span className="material-symbols-outlined text-xs">check</span>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Predecessor Link Selection (Custom Dropdown) */}
                            <div className="relative group">
                                <label className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1.5 ml-1">Predecessor (Link Preceding Task)</label>
                                <div className="relative">
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setIsPredecessorDropdownOpen(!isPredecessorDropdownOpen);
                                            setIsAssigneeDropdownOpen(false);
                                        }}
                                        className={`w-full bg-white text-slate-800 font-semibold border rounded-xl pl-10 pr-8 py-3 transition-all cursor-pointer flex items-center justify-between min-h-[46px] select-none ${isPredecessorDropdownOpen ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-300 hover:border-indigo-300'
                                            }`}
                                    >
                                        <span className="truncate">
                                            {(() => {
                                                const pred = flatNodes.find(n => n.id === editingTask.predecessor_id);
                                                return pred ? pred.title : 'None (No Connection Link)';
                                            })()}
                                        </span>
                                    </div>
                                    <span className="material-symbols-outlined absolute left-3 top-3 text-slate-400 group-hover:text-indigo-500 transition-colors pointer-events-none">link</span>
                                    <span
                                        className="material-symbols-outlined absolute right-3 top-3 text-slate-400 pointer-events-none transition-transform duration-200"
                                        style={{ transform: isPredecessorDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                                    >
                                        expand_more
                                    </span>

                                    {isPredecessorDropdownOpen && (
                                        <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto z-[120] py-1 custom-scrollbar animate-fade-in">
                                            <div
                                                onClick={() => {
                                                    setEditingTask(prev => ({
                                                        ...prev,
                                                        predecessor_id: null
                                                    }));
                                                    setIsPredecessorDropdownOpen(false);
                                                }}
                                                className={`px-4 py-2 text-xs font-semibold cursor-pointer hover:bg-slate-50 transition-colors flex items-center justify-between ${!editingTask.predecessor_id ? 'bg-indigo-50 text-indigo-650 font-bold' : 'text-slate-650'}`}
                                            >
                                                <span>None (No Connection Link)</span>
                                                {!editingTask.predecessor_id && <span className="material-symbols-outlined text-xs">check</span>}
                                            </div>
                                            {flatNodes
                                                .filter(n => n.hierarchy_level === 'TASK' && n.id !== editingTask.id)
                                                .map(t => (
                                                    <div
                                                        key={t.id}
                                                        onClick={() => {
                                                            setEditingTask(prev => ({
                                                                ...prev,
                                                                predecessor_id: t.id
                                                            }));
                                                            setIsPredecessorDropdownOpen(false);
                                                        }}
                                                        className={`px-4 py-2 text-xs font-semibold cursor-pointer hover:bg-slate-50 transition-colors flex items-center justify-between ${editingTask.predecessor_id === t.id ? 'bg-indigo-50 text-indigo-650 font-bold' : 'text-slate-600'}`}
                                                    >
                                                        <span>{t.title}</span>
                                                        {editingTask.predecessor_id === t.id && <span className="material-symbols-outlined text-xs">check</span>}
                                                    </div>
                                                ))
                                            }
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Progress Percentage */}
                            <div className="pt-2">
                                <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider mb-2 ml-1">
                                    <label className="text-slate-400">Completion Progress</label>
                                    <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">{editingTask.progress}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    step="5"
                                    value={editingTask.progress}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value, 10);
                                        setEditingTask(prev => ({ ...prev, progress: val }));
                                    }}
                                    className="w-full accent-indigo-600 bg-slate-200 h-2.5 rounded-lg cursor-pointer"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-4 border-t border-slate-100 flex-shrink-0">
                            <button
                                onClick={handleUpdateTaskTimeline}
                                disabled={updatingTask}
                                className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 transition-all shadow-md flex justify-center items-center gap-2"
                            >
                                {updatingTask ? 'Saving...' : 'Save Changes'}
                                {!updatingTask && <span className="material-symbols-outlined text-sm">check</span>}
                            </button>
                            <button
                                onClick={() => setEditingTask(null)}
                                className="px-6 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}