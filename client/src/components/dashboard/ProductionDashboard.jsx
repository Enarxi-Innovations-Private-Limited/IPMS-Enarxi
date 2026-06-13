import { Fragment, useEffect, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import api from '../../services/api.js';
import { getCurrentUser } from '../../services/authService.js';

const PHASE_ICONS = {
    Procurement: 'check_circle',
    'Component delivery': 'local_shipping',
    'Smd soldering': 'settings',
    'Smd rework': 'build',
    'Controller soldering': 'memory',
    'Dip soldering': 'conveyor_belt',
    'Board cleaning': 'cleaning_services',
    'Electrical testing': 'electric_bolt',
    'Peripheral testing': 'microwave',
    'Functionality testing': 'fact_check',
    'Conformal coating': 'water_drop',
    'Final qc': 'verified'
};

const formatDate = (value) => {
    if (!value) return 'Not set';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? 'Not set'
        : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const getProjectId = (project) => project?.id || project?._id;
const getTaskId = (task) => task?.id || task?._id;
const getUserId = (user) => user?.id || user?._id;
const getManagerId = (project) => project?.managerId?._id || project?.managerId || null;
const getInitial = (value, fallback = 'U') => (value || fallback).slice(0, 1).toUpperCase();

const getTaskState = (task) => {
    if (task.status === 'COMPLETED') return 'completed';
    if (Number(task.unitsCurrentlyHere || 0) > 0) return 'active';
    return 'pending';
};

const getAvailableCapacity = (task, index, sortedTasks, totalBatch) => {
    if (index === 0) return totalBatch;
    return Number(sortedTasks[index - 1]?.unitsCompleted || 0);
};

const getDaysLeftLabel = (deadline) => {
    if (!deadline) return 'No deadline';
    const today = new Date();
    const end = new Date(deadline);
    if (Number.isNaN(end.getTime())) return 'No deadline';

    today.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return `${Math.abs(diffDays)} Days Overdue`;
    if (diffDays === 0) return 'Due Today';
    if (diffDays === 1) return '1 Day Left';
    return `${diffDays} Days Left`;
};

const getStepLabel = (task) => {
    const phase = task.productionPhase || task.title || '';
    if (phase === 'Smd soldering') return 'SMT';
    if (phase === 'Controller soldering') return 'Controller';
    if (phase === 'Dip soldering') return 'DIP';
    if (phase === 'Electrical testing') return 'Testing';
    if (phase === 'Final qc') return 'QC';
    return phase;
};

export default function ProductionDashboard({ project, tasks, users, onRefresh, showManagerActions = true }) {
    const [editingTaskId, setEditingTaskId] = useState(null);
    const [draft, setDraft] = useState({ unitsCompleted: '', assigneeId: '' });
    const [rowLoading, setRowLoading] = useState({});
    const [rowErrors, setRowErrors] = useState({});
    const [feedback, setFeedback] = useState({ type: '', message: '' });
    const [assignments, setAssignments] = useState([]);
    const [assignmentLoading, setAssignmentLoading] = useState(false);
    const [assignmentSaving, setAssignmentSaving] = useState({});
    const [assignmentErrors, setAssignmentErrors] = useState({});
    const [expandedTasks, setExpandedTasks] = useState({});
    const [assignmentDrafts, setAssignmentDrafts] = useState({});
    const [newAssignmentDrafts, setNewAssignmentDrafts] = useState({});

    // ── Tab system ──
    const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'dispatches'

    // ── Dispatch state ──
    const [dispatches, setDispatches] = useState([]);
    const [dispatchLoading, setDispatchLoading] = useState(false);
    const [showCreateDispatch, setShowCreateDispatch] = useState(false);
    const [dispatchSaving, setDispatchSaving] = useState(false);
    const [dispatchError, setDispatchError] = useState('');
    const emptyDispatchForm = {
        customerName: '', customerAddress: '', customerGSTIN: '', placeOfSupply: '',
        boardFrom: '', boardTo: '',
        productDescription: 'PCB Assembly', hsnCode: '', ratePerBoard: '', igstPercent: '18',
        challanType: 'Job Work', notes: '',
    };
    const [dispatchForm, setDispatchForm] = useState(emptyDispatchForm);

    const sortedTasks = [...(tasks || [])]
        .filter((task) => task.isProductionTask)
        .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));

    const projectId = getProjectId(project);
    const currentUser = getCurrentUser();
    const currentUserId = getUserId(currentUser);
    const projectManagerId = getManagerId(project);
    const canEditProduction = Boolean(
        currentUserId &&
        projectManagerId &&
        String(currentUserId) === String(projectManagerId)
    );
    const showActionsColumn = showManagerActions && canEditProduction;
    const totalBatch = Number(project?.totalBatchSize || 0) || 100;
    const assignableUserIds = new Set(
        (project?.teamIds || [])
            .map((member) => (typeof member === 'object' && member ? member.id || member._id : member))
            .filter(Boolean)
            .map((id) => String(id))
    );

    if (projectManagerId) {
        assignableUserIds.add(String(projectManagerId));
    }

    const assignableUsers = (users || [])
        .filter((user) => assignableUserIds.size === 0 || assignableUserIds.has(String(getUserId(user))))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const finalTask = sortedTasks[sortedTasks.length - 1];
    const assignmentsByTaskId = assignments.reduce((acc, assignment) => {
        const key = String(assignment.taskId);
        if (!acc[key]) acc[key] = [];
        acc[key].push(assignment);
        return acc;
    }, {});
    const boardsPassed = Number(finalTask?.unitsCompleted || 0);
    const activeStations = sortedTasks.filter((task) => Number(task.unitsCurrentlyHere || 0) > 0).length;
    const activePct = sortedTasks.length > 0 ? Math.round((activeStations / sortedTasks.length) * 100) : 0;
    const overallCompletion = totalBatch > 0 ? Math.min(100, Math.round((boardsPassed / totalBatch) * 100)) : 0;
    const projectState = boardsPassed >= totalBatch && Number(finalTask?.unitsCurrentlyHere || 0) === 0
        ? 'COMPLETED'
        : sortedTasks.some((task, index) => Number(task.unitsCompleted || 0) > 0 || (index > 0 && Number(task.unitsCurrentlyHere || 0) > 0))
            ? 'ACTIVE'
            : 'PLANNING';

    useEffect(() => {
        if (!editingTaskId) return;
        const activeTask = sortedTasks.find((task) => getTaskId(task) === editingTaskId);
        if (!activeTask) {
            setEditingTaskId(null);
            setDraft({ unitsCompleted: '', assigneeId: '' });
        }
    }, [editingTaskId, sortedTasks]);

    useEffect(() => {
        if (!projectId || sortedTasks.length === 0) {
            setAssignments([]);
            return;
        }

        const loadAssignments = async () => {
            setAssignmentLoading(true);
            try {
                const response = await api.get(`/projects/${projectId}/production/assignments`);
                const list = response.data || [];
                setAssignments(list);
                setAssignmentDrafts(
                    list.reduce((acc, item) => {
                        acc[String(item.id || item._id)] = {
                            boardsAssigned: String(item.boardsAssigned ?? 0),
                            boardsCompletedApproved: String(item.boardsCompletedApproved ?? item.boardsCompleted ?? 0),
                            deadline: item.deadline ? new Date(item.deadline).toISOString().slice(0, 10) : ''
                        };
                        return acc;
                    }, {})
                );
                setAssignmentErrors({});
            } catch (err) {
                setAssignmentErrors((prev) => ({
                    ...prev,
                    global: err.response?.data?.message || 'Failed to load worker allocations.'
                }));
            } finally {
                setAssignmentLoading(false);
            }
        };

        loadAssignments();
    }, [projectId, sortedTasks.length]);

    const beginEdit = (task) => {
        const taskId = getTaskId(task);
        setEditingTaskId(taskId);
        setDraft({
            unitsCompleted: String(task.unitsCompleted ?? 0),
            assigneeId: task.assigneeId?._id || task.assigneeId || ''
        });
        setRowErrors((prev) => ({ ...prev, [taskId]: '' }));
        setFeedback({ type: '', message: '' });
    };

    const cancelEdit = () => {
        setEditingTaskId(null);
        setDraft({ unitsCompleted: '', assigneeId: '' });
    };

    const saveTask = async (task) => {
        const taskId = getTaskId(task);
        const unitsCompleted = Number(draft.unitsCompleted);
        const assigneeId = draft.assigneeId ? String(draft.assigneeId) : null;

        setRowErrors((prev) => ({ ...prev, [taskId]: '' }));
        setFeedback({ type: '', message: '' });

        if (!Number.isInteger(unitsCompleted) || unitsCompleted < 0) {
            setRowErrors((prev) => ({ ...prev, [taskId]: 'Completed boards must be a whole number 0 or greater.' }));
            return;
        }

        setRowLoading((prev) => ({ ...prev, [taskId]: true }));

        try {
            const response = await api.put(`/projects/${projectId}/production/tasks/${taskId}`, {
                unitsCompleted,
                assigneeId
            });

            setFeedback({
                type: 'success',
                message: response.data?.message || `${task.productionPhase || task.title} updated successfully.`
            });
            cancelEdit();
            if (onRefresh) await onRefresh();
        } catch (err) {
            setRowErrors((prev) => ({
                ...prev,
                [taskId]: err.response?.data?.message || 'Failed to update this production phase.'
            }));
            setFeedback({
                type: 'error',
                message: err.response?.data?.message || 'Failed to update this production phase.'
            });
        } finally {
            setRowLoading((prev) => ({ ...prev, [taskId]: false }));
        }
    };

    const refreshProductionData = async () => {
        if (onRefresh) {
            await onRefresh();
        }
        const response = await api.get(`/projects/${projectId}/production/assignments`);
        const list = response.data || [];
        setAssignments(list);
        setAssignmentDrafts(
            list.reduce((acc, item) => {
                acc[String(item.id || item._id)] = {
                    boardsAssigned: String(item.boardsAssigned ?? 0),
                    boardsCompletedApproved: String(item.boardsCompletedApproved ?? item.boardsCompleted ?? 0),
                    deadline: item.deadline ? new Date(item.deadline).toISOString().slice(0, 10) : ''
                };
                return acc;
            }, {})
        );
    };

    const toggleExpandedTask = (taskId) => {
        setExpandedTasks((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
        setAssignmentErrors((prev) => ({ ...prev, [taskId]: '' }));
    };

    const saveAssignment = async (taskId, assignmentId) => {
        const draftValues = assignmentDrafts[assignmentId] || {};
        const boardsAssigned = Number(draftValues.boardsAssigned);
        const deadline = draftValues.deadline;

        if (!Number.isInteger(boardsAssigned) || boardsAssigned < 0) {
            setAssignmentErrors((prev) => ({ ...prev, [assignmentId]: 'Assigned boards must be a whole number 0 or greater.' }));
            return;
        }
        if (!deadline) {
            setAssignmentErrors((prev) => ({ ...prev, [assignmentId]: 'Deadline is required for each worker allocation.' }));
            return;
        }

        setAssignmentSaving((prev) => ({ ...prev, [assignmentId]: true }));
        setAssignmentErrors((prev) => ({ ...prev, [assignmentId]: '' }));

        try {
            const response = await api.put(`/projects/${projectId}/production/tasks/${taskId}/assignments/${assignmentId}`, {
                boardsAssigned,
                deadline
            });
            setFeedback({
                type: 'success',
                message: response.data?.message || 'Worker allocation updated successfully.'
            });
            await refreshProductionData();
        } catch (err) {
            setAssignmentErrors((prev) => ({
                ...prev,
                [assignmentId]: err.response?.data?.message || 'Failed to update worker allocation.'
            }));
        } finally {
            setAssignmentSaving((prev) => ({ ...prev, [assignmentId]: false }));
        }
    };

    const createAssignment = async (taskId) => {
        const allocationDraft = newAssignmentDrafts[taskId] || {};
        const userId = allocationDraft.userId || '';
        const boardsAssigned = Number(allocationDraft.boardsAssigned);
        const deadline = allocationDraft.deadline || '';

        if (!userId) {
            setAssignmentErrors((prev) => ({ ...prev, [taskId]: 'Select a worker before creating the allocation.' }));
            return;
        }

        if (!Number.isInteger(boardsAssigned) || boardsAssigned < 0) {
            setAssignmentErrors((prev) => ({ ...prev, [taskId]: 'Assigned boards must be a whole number 0 or greater.' }));
            return;
        }
        if (!deadline) {
            setAssignmentErrors((prev) => ({ ...prev, [taskId]: 'Deadline is required before adding a worker allocation.' }));
            return;
        }

        setAssignmentSaving((prev) => ({ ...prev, [taskId]: true }));
        setAssignmentErrors((prev) => ({ ...prev, [taskId]: '' }));

        try {
            const response = await api.post(`/projects/${projectId}/production/tasks/${taskId}/assignments`, {
                userId,
                boardsAssigned,
                deadline
            });
            setFeedback({
                type: 'success',
                message: response.data?.message || 'Worker allocation created successfully.'
            });
            setNewAssignmentDrafts((prev) => ({
                ...prev,
                [taskId]: { userId: '', boardsAssigned: '', deadline: '' }
            }));
            await refreshProductionData();
            setExpandedTasks((prev) => ({ ...prev, [taskId]: true }));
        } catch (err) {
            setAssignmentErrors((prev) => ({
                ...prev,
                [taskId]: err.response?.data?.message || 'Failed to create worker allocation.'
            }));
        } finally {
            setAssignmentSaving((prev) => ({ ...prev, [taskId]: false }));
        }
    };

    const reviewAssignment = async (assignmentId, approved, rejectionReason = '') => {
        setAssignmentSaving((prev) => ({ ...prev, [assignmentId]: true }));
        setAssignmentErrors((prev) => ({ ...prev, [assignmentId]: '' }));
        try {
            const response = await api.put(`/production/assignments/${assignmentId}/review`, {
                approved,
                rejectionReason
            });
            setFeedback({
                type: 'success',
                message: response.data?.message || 'Production review completed.'
            });
            await refreshProductionData();
        } catch (err) {
            setAssignmentErrors((prev) => ({
                ...prev,
                [assignmentId]: err.response?.data?.message || 'Failed to review production submission.'
            }));
        } finally {
            setAssignmentSaving((prev) => ({ ...prev, [assignmentId]: false }));
        }
    };

    if (sortedTasks.length === 0) {
        return (
            <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[20px] border border-[#434656] bg-[#0b1326] px-6 py-16 text-center text-[#dae2fd]">
                <span className="material-symbols-outlined mb-4 text-6xl text-[#9cf0ff]">inventory_2</span>
                <h3 className="text-xl font-bold">Initializing production phases</h3>
                <p className="mt-2 text-sm text-[#c4c5d9]">The PCB production flow is syncing for this project.</p>
            </div>
        );
    }

    // ── Load dispatches when Dispatches tab is activated ──
    useEffect(() => {
        if (activeTab !== 'dispatches' || !projectId) return;
        const loadDispatches = async () => {
            setDispatchLoading(true);
            try {
                const res = await api.get(`/projects/${projectId}/production/dispatches`);
                setDispatches(res.data || []);
            } catch (err) {
                console.error('Failed to load dispatches:', err);
            } finally {
                setDispatchLoading(false);
            }
        };
        loadDispatches();
    }, [activeTab, projectId]);

    // ── Create dispatch ──
    const handleCreateDispatch = async (e) => {
        e.preventDefault();
        setDispatchError('');
        const from = Number(dispatchForm.boardFrom);
        const to = Number(dispatchForm.boardTo);
        if (!dispatchForm.customerName.trim()) { setDispatchError('Customer name is required.'); return; }
        if (!from || !to || from < 1 || to < from) { setDispatchError('Board From must be \u2265 1 and Board To must be \u2265 Board From.'); return; }
        setDispatchSaving(true);
        try {
            const res = await api.post(`/projects/${projectId}/production/dispatches`, {
                ...dispatchForm,
                boardFrom: from,
                boardTo: to,
                ratePerBoard: Number(dispatchForm.ratePerBoard) || 0,
                igstPercent: Number(dispatchForm.igstPercent) || 18,
            });
            const newDC = res.data;
            setDispatches(prev => [newDC, ...prev]);
            setShowCreateDispatch(false);
            setDispatchForm(emptyDispatchForm);
            generateDCPdf(newDC);
        } catch (err) {
            setDispatchError(err.response?.data?.message || 'Failed to create dispatch.');
        } finally {
            setDispatchSaving(false);
        }
    };

    // ── PDF Generator ──
    const generateDCPdf = (dc) => {
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        const W = 210; const marginL = 14; const marginR = 196;
        let y = 14;

        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, W, 28, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14); doc.setFont('helvetica', 'bold');
        doc.text('ENARXI INNOVATIONS PVT LTD', marginL, 10);
        doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.text('No. 12, Industrial Area, Patna, Bihar - 800001  |  GSTIN: 10AAGCE7875R1ZJ', marginL, 16);
        doc.text('Email: info@enarxi.com  |  Phone: +91 9876543210', marginL, 21);
        doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(99, 220, 255);
        doc.text('Delivery Challan', marginR, 12, { align: 'right' });
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 200, 255);
        doc.text('(Not a Tax Invoice)', marginR, 18, { align: 'right' });
        y = 34;

        doc.setFillColor(241, 245, 255);
        doc.roundedRect(marginL, y, 88, 38, 2, 2, 'F');
        doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(99, 102, 241);
        doc.text('DELIVER TO', marginL + 3, y + 5);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(15, 23, 42);
        doc.text(dc.customerName || '', marginL + 3, y + 11);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(71, 85, 105);
        const addrLines = doc.splitTextToSize(dc.customerAddress || '', 82);
        addrLines.slice(0, 3).forEach((line, i) => doc.text(line, marginL + 3, y + 17 + i * 4.5));
        if (dc.customerGSTIN) { doc.setFont('helvetica', 'bold'); doc.text('GSTIN: ' + dc.customerGSTIN, marginL + 3, y + 33); }

        doc.setFillColor(241, 245, 255);
        doc.roundedRect(106, y, 90, 38, 2, 2, 'F');
        doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(99, 102, 241);
        doc.text('CHALLAN DETAILS', 109, y + 5);
        const challanRows = [
            ['DC No', dc.dcNumber || ''],
            ['Date', dc.createdAt ? new Date(dc.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''],
            ['Type', dc.challanType || 'Job Work'],
            ['Place of Supply', dc.placeOfSupply || ''],
            ['Project Ref', dc.projectCode || ''],
        ];
        challanRows.forEach(([label, val], i) => {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(100, 116, 139);
            doc.text(label + ':', 109, y + 11 + i * 5.5);
            doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42);
            doc.text(String(val), 140, y + 11 + i * 5.5);
        });
        y += 44;

        doc.setFillColor(15, 23, 42);
        doc.rect(marginL, y, 182, 8, 'F');
        doc.setTextColor(255, 255, 255); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
        [{ x: marginL + 2, label: 'S.No' }, { x: marginL + 14, label: 'Description' }, { x: marginL + 96, label: 'HSN/SAC' }, { x: marginL + 120, label: 'Quantity' }, { x: marginL + 148, label: 'Unit' }, { x: marginL + 165, label: 'Unit Range' }]
            .forEach(col => doc.text(col.label, col.x, y + 5.5));
        y += 8;

        doc.setFillColor(248, 250, 255);
        doc.rect(marginL, y, 182, 14, 'F');
        doc.setDrawColor(203, 213, 225); doc.rect(marginL, y, 182, 14);
        doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
        doc.text('1', marginL + 2, y + 6);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
        doc.text(dc.productDescription || 'PCB Assembly', marginL + 14, y + 6);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
        doc.text('Batch Ref: ' + (dc.projectCode || ''), marginL + 14, y + 11);
        doc.setTextColor(30, 41, 59); doc.setFontSize(8);
        doc.text(dc.hsnCode || '\u2014', marginL + 96, y + 8);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
        const bCount = dc.boardCount || (dc.boardTo - dc.boardFrom + 1);
        doc.text(String(bCount), marginL + 120, y + 8);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
        doc.text('Nos', marginL + 148, y + 8);
        doc.setFontSize(8); doc.setTextColor(71, 85, 105);
        doc.text('#' + dc.boardFrom + ' \u2013 #' + dc.boardTo, marginL + 165, y + 8);
        y += 14;

        const hasPrice = dc.ratePerBoard > 0;
        if (hasPrice) {
            const subtotal = dc.ratePerBoard * bCount;
            const igstAmt = (subtotal * (dc.igstPercent || 18)) / 100;
            const total = subtotal + igstAmt;
            y += 4;
            [['Sub Total', '\u20B9 ' + subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 }), false],
             ['IGST @ ' + (dc.igstPercent || 18) + '%', '\u20B9 ' + igstAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 }), false],
             ['TOTAL', '\u20B9 ' + total.toLocaleString('en-IN', { minimumFractionDigits: 2 }), true]]
                .forEach(([label, val, bold]) => {
                    doc.setFillColor(bold ? 15 : 248, bold ? 23 : 250, bold ? 42 : 255);
                    doc.rect(marginL + 110, y, 72, 7, 'F');
                    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(8);
                    doc.setTextColor(bold ? 255 : 71, bold ? 255 : 85, bold ? 255 : 105);
                    doc.text(label, marginL + 113, y + 5);
                    doc.setTextColor(bold ? 99 : 30, bold ? 220 : 41, bold ? 255 : 59);
                    doc.text(val, marginR - 2, y + 5, { align: 'right' });
                    y += 7;
                });
            y += 4;
        } else { y += 6; }

        doc.setFillColor(254, 252, 232);
        doc.roundedRect(marginL, y, 182, 14, 2, 2, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(146, 64, 14);
        doc.text('Total Qty: ' + bCount + ' Nos  |  Unit Numbers: #' + dc.boardFrom + ' to #' + dc.boardTo, marginL + 3, y + 6);
        doc.setFont('helvetica', 'italic'); doc.setFontSize(6.5); doc.setTextColor(120, 53, 15);
        doc.text('This delivery challan is for traceability. Boards are covered under warranty as per agreement terms.', marginL + 3, y + 11);
        y += 18;
        if (dc.notes) { doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(71, 85, 105); doc.text('Notes: ' + dc.notes, marginL, y); y += 8; }

        y = Math.max(y + 10, 240);
        doc.setDrawColor(203, 213, 225);
        doc.line(marginL, y, marginL + 55, y); doc.line(marginR - 55, y, marginR, y);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
        doc.text("Receiver's Signature", marginL, y + 5);
        doc.text('Authorized Signatory', marginR - 55, y + 5);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(30, 41, 59);
        doc.text('For Enarxi Innovations Pvt Ltd', marginR - 55, y + 11);

        doc.setFillColor(15, 23, 42);
        doc.rect(0, 285, W, 12, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(148, 163, 184);
        doc.text((dc.dcNumber || 'DC') + ' | Generated ' + new Date().toLocaleDateString('en-IN') + ' | System-generated delivery challan — Enarxi Innovations Pvt Ltd', W / 2, 292, { align: 'center' });

        doc.save((dc.dcNumber || 'DC') + '_' + (dc.customerName || 'Customer').replace(/\s+/g, '_') + '.pdf');
    };

    return (
        <div className="space-y-6 text-[#dae2fd]">
            {feedback.message && (
                <div className={`flex items-center justify-between rounded-xl border px-4 py-3 text-xs ${
                    feedback.type === 'success'
                        ? 'border-[#007e46] bg-[#007e46]/15 text-[#c2ffd1]'
                        : 'border-[#93000a] bg-[#93000a]/20 text-[#ffdad6]'
                }`}>
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">
                            {feedback.type === 'success' ? 'check_circle' : 'error'}
                        </span>
                        <span>{feedback.message}</span>
                    </div>
                    <button type="button" onClick={() => setFeedback({ type: '', message: '' })} className="text-current/70 hover:text-current">
                        <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                </div>
            )}

            <div className="overflow-hidden rounded-[20px] border border-[#434656] bg-[#0b1326] shadow-[0_24px_80px_rgba(6,14,32,0.45)]">
                <div className="border-b border-[#222a3d] bg-[#171f33] px-6 py-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2e5bff]/20 text-[#b8c3ff]">
                                <span className="material-symbols-outlined">folder</span>
                            </div>
                            <div>
                                <div className="flex flex-wrap items-center gap-3">
                                    <h2 className="font-['Hanken_Grotesk'] text-[28px] font-bold tracking-[-0.02em] text-[#efefff]">
                                        {project?.name}
                                    </h2>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-4 text-[12px] text-[#c4c5d9]">
                                    <span className="flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                                        {formatDate(project?.startDate)}
                                    </span>
                                    <span className="flex items-center gap-1.5 text-[#b8c3ff]">
                                        <span className="material-symbols-outlined text-[16px]">timer</span>
                                        {getDaysLeftLabel(project?.deadline || project?.endDate)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto lg:justify-end">
                            {/* Tab Switcher */}
                            <div className="flex gap-1 rounded-lg border border-[#434656] bg-[#060d1e] p-1">
                                {['dashboard', 'dispatches'].map(tab => (
                                    <button
                                        key={tab}
                                        type="button"
                                        onClick={() => setActiveTab(tab)}
                                        className={`px-4 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-[0.12em] transition-all ${
                                            activeTab === tab
                                                ? 'bg-[#2e5bff] text-white shadow-[0_0_12px_rgba(46,91,255,0.4)]'
                                                : 'text-[#8e90a2] hover:text-[#dae2fd]'
                                        }`}
                                    >
                                        {tab === 'dashboard' ? 'Dashboard' : 'Dispatches'}
                                    </button>
                                ))}
                            </div>

                            <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
                                projectState === 'COMPLETED'
                                    ? 'bg-[#007e46] text-[#c2ffd1]'
                                    : projectState === 'ACTIVE'
                                        ? 'bg-[#2e5bff] text-[#efefff]'
                                        : 'bg-[#222a3d] text-[#c4c5d9]'
                            }`}>
                                {projectState === 'ACTIVE' ? 'ACTIVE' : projectState}
                            </span>
                            <div className="flex items-center gap-2 rounded border border-[#434656] bg-[#0b1326] px-3 py-1.5 text-[11px]">
                                <span className="font-semibold text-[#00daf3]">Batch: {project?.projectCode || 'N/A'}</span>
                                <span className="h-3 w-px bg-[#434656]" />
                                <span className="text-[#dae2fd]">{totalBatch} Boards</span>
                            </div>
                            {activeTab === 'dispatches' && (
                                <button
                                    type="button"
                                    onClick={() => setShowCreateDispatch(true)}
                                    className="flex items-center gap-2 rounded border border-[#434656] px-4 py-2 text-[11px] font-semibold text-[#dae2fd] transition-colors hover:bg-[#2d3449]"
                                >
                                    <span className="material-symbols-outlined text-[18px]">add</span>
                                    Create Dispatch
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {activeTab === 'dispatches' && (
                <div className="space-y-6">

                    {/* Summary pill */}
                    {dispatches.length > 0 && (
                        <div className="flex flex-wrap gap-4">
                            <div className="flex items-center gap-2 rounded-full border border-[#2e5bff]/30 bg-[#2e5bff]/10 px-4 py-1.5">
                                <span className="material-symbols-outlined text-[16px] text-[#b8c3ff]">receipt_long</span>
                                <span className="text-[12px] font-semibold text-[#b8c3ff]">{dispatches.length} Dispatch{dispatches.length !== 1 ? 'es' : ''}</span>
                            </div>
                            <div className="flex items-center gap-2 rounded-full border border-[#00e383]/30 bg-[#00e383]/10 px-4 py-1.5">
                                <span className="material-symbols-outlined text-[16px] text-[#00e383]">conveyor_belt</span>
                                <span className="text-[12px] font-semibold text-[#00e383]">{dispatches.reduce((s, d) => s + (d.boardCount || 0), 0)} Boards Dispatched</span>
                            </div>
                        </div>
                    )}

                    {/* Dispatch list */}
                    {dispatchLoading ? (
                        <div className="flex items-center justify-center py-16">
                            <span className="material-symbols-outlined animate-spin text-4xl text-[#2e5bff]">progress_activity</span>
                        </div>
                    ) : dispatches.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#434656] bg-[#0d1529] py-20 text-center">
                            <span className="material-symbols-outlined mb-4 text-5xl text-[#434656]">local_shipping</span>
                            <p className="text-[14px] font-semibold text-[#c4c5d9]">No dispatches yet</p>
                            <p className="mt-1 text-[12px] text-[#8e90a2]">Create a dispatch to track board deliveries to customers.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {dispatches.map(dc => {
                                const isDispatched = dc.status === 'DISPATCHED';
                                return (
                                    <div key={dc.id || dc._id} className={`rounded-2xl border ${isDispatched ? 'border-[#007e46]/40 bg-[#0a1e14]' : 'border-[#2e5bff]/30 bg-[#0d1529]'} p-5 transition-all`}>
                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                            {/* Left info */}
                                            <div className="flex items-start gap-4">
                                                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${isDispatched ? 'bg-[#007e46]/20 text-[#00e383]' : 'bg-[#2e5bff]/15 text-[#b8c3ff]'}`}>
                                                    <span className="material-symbols-outlined text-[22px]">package_2</span>
                                                </div>
                                                <div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="font-['Hanken_Grotesk'] text-[16px] font-bold text-[#efefff]">{dc.dcNumber}</span>
                                                        <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] ${isDispatched ? 'bg-[#007e46] text-[#c2ffd1]' : 'bg-[#1c2a42] text-[#00daf3]'}`}>
                                                            {dc.status}
                                                        </span>
                                                    </div>
                                                    <p className="mt-1 text-[13px] font-semibold text-[#dae2fd]">{dc.customerName}</p>
                                                    {dc.customerAddress && <p className="text-[11px] text-[#8e90a2]">{dc.customerAddress}</p>}
                                                    <div className="mt-2 flex flex-wrap items-center gap-3">
                                                        <span className="flex items-center gap-1 rounded-lg border border-[#00daf3]/25 bg-[#00daf3]/10 px-2.5 py-1 text-[11px] font-bold text-[#00daf3]">
                                                            <span className="material-symbols-outlined text-[13px]">pin</span>
                                                            Unit #{dc.boardFrom} &ndash; #{dc.boardTo}
                                                        </span>
                                                        <span className="flex items-center gap-1 rounded-lg border border-[#434656] bg-[#131b2e] px-2.5 py-1 text-[11px] font-bold text-[#c4c5d9]">
                                                            <span className="material-symbols-outlined text-[13px]">dashboard</span>
                                                            {dc.boardCount} boards
                                                        </span>
                                                        <span className="text-[10px] text-[#8e90a2]">{dc.createdAt ? new Date(dc.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            {/* Actions */}
                                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => generateDCPdf(dc)}
                                                    className="flex items-center gap-1.5 rounded-lg border border-[#00daf3]/30 bg-[#00daf3]/10 px-3 py-2 text-[11px] font-bold text-[#00daf3] transition-all hover:bg-[#00daf3]/20"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">download</span>
                                                    Download DC
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Create Dispatch Modal */}
                    {showCreateDispatch && (
                        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ backdropFilter: 'blur(6px)', background: 'rgba(6,14,32,0.82)' }}>
                            <div className="relative w-full max-w-2xl rounded-2xl border border-[#2e5bff]/40 bg-[#0b1326] shadow-[0_32px_80px_rgba(6,14,32,0.7)]">
                                {/* Modal header */}
                                <div className="flex items-center justify-between border-b border-[#222a3d] px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2e5bff]/15 text-[#b8c3ff]">
                                            <span className="material-symbols-outlined">local_shipping</span>
                                        </div>
                                        <div>
                                            <h3 className="font-['Hanken_Grotesk'] text-[18px] font-bold text-[#efefff]">Create Batch Dispatch</h3>
                                            <p className="text-[11px] text-[#8e90a2]">{project?.name} — {project?.projectCode}</p>
                                        </div>
                                    </div>
                                    <button type="button" onClick={() => setShowCreateDispatch(false)} className="text-[#8e90a2] hover:text-white">
                                        <span className="material-symbols-outlined">close</span>
                                    </button>
                                </div>

                                <form onSubmit={handleCreateDispatch} className="max-h-[78vh] overflow-y-auto custom-scrollbar p-6 space-y-5">
                                    {dispatchError && (
                                        <div className="rounded-xl border border-[#93000a] bg-[#93000a]/20 px-4 py-3 text-[12px] text-[#ffdad6]">{dispatchError}</div>
                                    )}

                                    {/* Customer Details */}
                                    <div>
                                        <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-[#8e90a2]">Customer Details</p>
                                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                            <div className="md:col-span-2">
                                                <label className="mb-1 block text-[11px] font-semibold text-[#c4c5d9]">Customer Name <span className="text-red-400">*</span></label>
                                                <input required value={dispatchForm.customerName} onChange={e => setDispatchForm(p => ({ ...p, customerName: e.target.value }))}
                                                    className="w-full rounded-xl border border-[#434656] bg-[#131b2e] px-4 py-2.5 text-[13px] text-[#dae2fd] outline-none focus:border-[#2e5bff] placeholder-[#434656]"
                                                    placeholder="e.g. Bihar State Electronics Pvt Ltd" />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="mb-1 block text-[11px] font-semibold text-[#c4c5d9]">Customer Address</label>
                                                <textarea value={dispatchForm.customerAddress} onChange={e => setDispatchForm(p => ({ ...p, customerAddress: e.target.value }))}
                                                    rows={2} className="w-full rounded-xl border border-[#434656] bg-[#131b2e] px-4 py-2.5 text-[13px] text-[#dae2fd] outline-none focus:border-[#2e5bff] placeholder-[#434656] resize-none"
                                                    placeholder="Full delivery address" />
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-[11px] font-semibold text-[#c4c5d9]">GSTIN (optional)</label>
                                                <input value={dispatchForm.customerGSTIN} onChange={e => setDispatchForm(p => ({ ...p, customerGSTIN: e.target.value }))}
                                                    className="w-full rounded-xl border border-[#434656] bg-[#131b2e] px-4 py-2.5 text-[13px] text-[#dae2fd] outline-none focus:border-[#2e5bff] placeholder-[#434656]"
                                                    placeholder="e.g. 10AAGCE7875R1ZJ" />
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-[11px] font-semibold text-[#c4c5d9]">Place of Supply</label>
                                                <input value={dispatchForm.placeOfSupply} onChange={e => setDispatchForm(p => ({ ...p, placeOfSupply: e.target.value }))}
                                                    className="w-full rounded-xl border border-[#434656] bg-[#131b2e] px-4 py-2.5 text-[13px] text-[#dae2fd] outline-none focus:border-[#2e5bff] placeholder-[#434656]"
                                                    placeholder="e.g. Bihar" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Board Range */}
                                    <div>
                                        <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-[#8e90a2]">Board Unit Range (Traceability)</p>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="mb-1 block text-[11px] font-semibold text-[#c4c5d9]">Unit Number From <span className="text-red-400">*</span></label>
                                                <input required type="number" min="1" value={dispatchForm.boardFrom} onChange={e => setDispatchForm(p => ({ ...p, boardFrom: e.target.value }))}
                                                    className="w-full rounded-xl border border-[#434656] bg-[#131b2e] px-4 py-2.5 text-[13px] font-mono text-[#00daf3] outline-none focus:border-[#2e5bff]"
                                                    placeholder="e.g. 1" />
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-[11px] font-semibold text-[#c4c5d9]">Unit Number To <span className="text-red-400">*</span></label>
                                                <input required type="number" min="1" value={dispatchForm.boardTo} onChange={e => setDispatchForm(p => ({ ...p, boardTo: e.target.value }))}
                                                    className="w-full rounded-xl border border-[#434656] bg-[#131b2e] px-4 py-2.5 text-[13px] font-mono text-[#00daf3] outline-none focus:border-[#2e5bff]"
                                                    placeholder="e.g. 50" />
                                            </div>
                                        </div>
                                        {dispatchForm.boardFrom && dispatchForm.boardTo && Number(dispatchForm.boardTo) >= Number(dispatchForm.boardFrom) && (
                                            <div className="mt-2 flex items-center gap-2 rounded-lg border border-[#00e383]/25 bg-[#00e383]/10 px-3 py-2">
                                                <span className="material-symbols-outlined text-[14px] text-[#00e383]">check_circle</span>
                                                <span className="text-[11px] font-bold text-[#00e383]">
                                                    {Number(dispatchForm.boardTo) - Number(dispatchForm.boardFrom) + 1} boards in this dispatch
                                                    &nbsp;(Unit #{dispatchForm.boardFrom} &ndash; #{dispatchForm.boardTo})
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Challan Details */}
                                    <div>
                                        <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-[#8e90a2]">Challan Details</p>
                                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                            <div className="md:col-span-2">
                                                <label className="mb-1 block text-[11px] font-semibold text-[#c4c5d9]">Product Description</label>
                                                <input value={dispatchForm.productDescription} onChange={e => setDispatchForm(p => ({ ...p, productDescription: e.target.value }))}
                                                    className="w-full rounded-xl border border-[#434656] bg-[#131b2e] px-4 py-2.5 text-[13px] text-[#dae2fd] outline-none focus:border-[#2e5bff]"
                                                    placeholder="e.g. PCB Assembly – Weighing System" />
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-[11px] font-semibold text-[#c4c5d9]">HSN / SAC Code</label>
                                                <input value={dispatchForm.hsnCode} onChange={e => setDispatchForm(p => ({ ...p, hsnCode: e.target.value }))}
                                                    className="w-full rounded-xl border border-[#434656] bg-[#131b2e] px-4 py-2.5 text-[13px] text-[#dae2fd] outline-none focus:border-[#2e5bff]"
                                                    placeholder="e.g. 85340000" />
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-[11px] font-semibold text-[#c4c5d9]">Challan Type</label>
                                                <select value={dispatchForm.challanType} onChange={e => setDispatchForm(p => ({ ...p, challanType: e.target.value }))}
                                                    className="w-full rounded-xl border border-[#434656] bg-[#131b2e] px-4 py-2.5 text-[13px] text-[#dae2fd] outline-none focus:border-[#2e5bff]">
                                                    {['Job Work', 'Supply', 'Returns', 'Others'].map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-[11px] font-semibold text-[#c4c5d9]">Rate per Board (&#8377;) <span className="text-[#8e90a2] font-normal">(optional)</span></label>
                                                <input type="number" min="0" step="0.01" value={dispatchForm.ratePerBoard} onChange={e => setDispatchForm(p => ({ ...p, ratePerBoard: e.target.value }))}
                                                    className="w-full rounded-xl border border-[#434656] bg-[#131b2e] px-4 py-2.5 text-[13px] text-[#dae2fd] outline-none focus:border-[#2e5bff]"
                                                    placeholder="Leave blank for logistics-only DC" />
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-[11px] font-semibold text-[#c4c5d9]">IGST %</label>
                                                <input type="number" min="0" max="100" value={dispatchForm.igstPercent} onChange={e => setDispatchForm(p => ({ ...p, igstPercent: e.target.value }))}
                                                    className="w-full rounded-xl border border-[#434656] bg-[#131b2e] px-4 py-2.5 text-[13px] text-[#dae2fd] outline-none focus:border-[#2e5bff]" />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="mb-1 block text-[11px] font-semibold text-[#c4c5d9]">Notes</label>
                                                <textarea value={dispatchForm.notes} onChange={e => setDispatchForm(p => ({ ...p, notes: e.target.value }))}
                                                    rows={2} className="w-full rounded-xl border border-[#434656] bg-[#131b2e] px-4 py-2.5 text-[13px] text-[#dae2fd] outline-none focus:border-[#2e5bff] resize-none"
                                                    placeholder="Any delivery notes or special instructions..." />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Footer */}
                                    <div className="flex items-center justify-end gap-3 border-t border-[#222a3d] pt-4">
                                        <button type="button" onClick={() => { setShowCreateDispatch(false); setDispatchError(''); }}
                                            className="rounded-xl border border-[#434656] px-5 py-2.5 text-[12px] font-bold text-[#c4c5d9] hover:bg-[#2d3449]">
                                            Cancel
                                        </button>
                                        <button type="submit" disabled={dispatchSaving}
                                            className="flex items-center gap-2 rounded-xl bg-[#2e5bff] px-6 py-2.5 text-[12px] font-bold text-white shadow-[0_0_20px_rgba(46,91,255,0.35)] transition-all hover:bg-[#4a6fff] disabled:opacity-60">
                                            {dispatchSaving ? (
                                                <><span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>Creating...</>
                                            ) : (
                                                <><span className="material-symbols-outlined text-[16px]">download</span>Create & Download DC</>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ══ DASHBOARD TAB ══ */}
            {activeTab === 'dashboard' && (
                <div className="space-y-8 p-6 pb-28">
                    <section className="overflow-x-auto pb-2">
                        <div className="relative flex min-w-[920px] items-center justify-between gap-2">
                            <div className="absolute left-0 right-0 top-5 h-[2px] bg-[#434656]" />
                            {sortedTasks.map((task, index) => {
                                const state = getTaskState(task);
                                const isCompleted = state === 'completed';
                                const isActive = state === 'active';
                                const icon = PHASE_ICONS[task.productionPhase || task.title] || 'radio_button_checked';

                                return (
                                    <div key={getTaskId(task)} className="relative z-10 flex w-[88px] flex-col items-center gap-2 text-center">
                                        <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm transition-all ${
                                            isCompleted
                                                ? 'border-[#00e383] bg-[#00e383] text-[#00210e]'
                                                : isActive
                                                    ? 'border-[#0b1326] bg-[#2e5bff] text-[#efefff] shadow-[0_0_15px_rgba(46,91,255,0.4)]'
                                                    : 'border-[#8e90a2] bg-[#222a3d] text-[#c4c5d9]'
                                        }`}>
                                            <span
                                                className={`material-symbols-outlined ${isActive ? 'animate-pulse' : ''}`}
                                                style={isCompleted || isActive ? { fontVariationSettings: "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24" } : undefined}
                                            >
                                                {isCompleted ? 'check_circle' : icon}
                                            </span>
                                        </div>
                                        <span className={`text-[11px] font-bold ${
                                            isCompleted ? 'text-[#00e383]' : isActive ? 'text-[#b8c3ff]' : 'text-[#c4c5d9]'
                                        }`}>
                                            {getStepLabel(task)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
                        <div className="min-w-0 space-y-4 lg:w-[calc(100%-360px)] lg:shrink">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[#b8c3ff]">format_list_bulleted</span>
                                <h3 className="font-['Hanken_Grotesk'] text-[24px] font-semibold text-[#efefff]">Task Management</h3>
                            </div>

                            <div className="overflow-hidden rounded-xl border border-[#434656] bg-[#131b2e]">
                                <div className="hidden lg:block">
                                    <table className="w-full border-collapse text-left">
                                        <thead>
                                            <tr className="border-b border-[#434656] bg-[#222a3d]">
                                                <th className="px-6 py-4 text-[12px] font-medium uppercase tracking-wider text-[#c4c5d9]">Production Phase</th>
                                                <th className="px-6 py-4 text-[12px] font-medium uppercase tracking-wider text-[#c4c5d9]">Unit Tracking</th>
                                                <th className="px-6 py-4 text-[12px] font-medium uppercase tracking-wider text-[#c4c5d9]">Status</th>
                                                <th className="px-6 py-4 text-[12px] font-medium uppercase tracking-wider text-[#c4c5d9]">Lead</th>
                                                {showActionsColumn && (
                                                    <th className="px-6 py-4 text-right text-[12px] font-medium uppercase tracking-wider text-[#c4c5d9]">Actions</th>
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#434656]/70">
                                            {sortedTasks.map((task, index) => {
                                                const taskId = getTaskId(task);
                                                const isEditing = editingTaskId === taskId;
                                                const state = getTaskState(task);
                                                const availableCapacity = getAvailableCapacity(task, index, sortedTasks, totalBatch);
                                                const assignee = users?.find((user) => getUserId(user) === (task.assigneeId || task.assigneeId?._id));
                                                const taskAssignments = assignmentsByTaskId[String(taskId)] || [];
                                                const assignedBoards = taskAssignments.reduce((sum, item) => sum + Number(item.boardsAssigned || 0), 0);
                                                const unassignedBoards = Math.max(0, availableCapacity - assignedBoards);
                                                const progressWidth = availableCapacity > 0 ? Math.min(100, (Number(task.unitsCompleted || 0) / availableCapacity) * 100) : 0;

                                                return (
                                                    <Fragment key={taskId}>
                                                        <tr
                                                            key={taskId}
                                                            className={`transition-colors ${
                                                                state === 'active' ? 'bg-[#2e5bff]/8' : 'hover:bg-[#2d3449]/25'
                                                            } ${state === 'pending' ? 'opacity-70' : ''}`}
                                                        >
                                                            <td className={`px-6 py-5 ${state === 'active' ? 'border-l-4 border-[#2e5bff]' : ''}`}>
                                                                <p className="font-bold text-[#dae2fd]">{task.productionPhase || task.title}</p>
                                                                <p className="mt-1 text-[11px] text-[#c4c5d9]">
                                                                    {taskAssignments.length > 0
                                                                        ? `${taskAssignments.length} worker allocation${taskAssignments.length > 1 ? 's' : ''} configured`
                                                                        : state === 'completed'
                                                                            ? `Phase complete for ${Number(task.unitsCompleted || 0)} boards`
                                                                            : state === 'active'
                                                                                ? `${Number(task.unitsCurrentlyHere || 0)} boards available at this stage`
                                                                                : `Waiting for previous stage completion`}
                                                                </p>
                                                                {rowErrors[taskId] && (
                                                                    <div className="mt-3 rounded-lg border border-[#93000a] bg-[#93000a]/20 px-3 py-2 text-[11px] text-[#ffdad6]">
                                                                        {rowErrors[taskId]}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-5">
                                                                <div className="flex flex-col gap-1">
                                                                    <span className={`font-mono text-[18px] font-semibold ${
                                                                        state === 'completed' ? 'text-[#00e383]' : state === 'active' ? 'text-[#00e3fd]' : 'text-[#c4c5d9]'
                                                                    }`}>
                                                                        {Number(task.unitsCompleted || 0)} / {availableCapacity}
                                                                    </span>
                                                                    <div className="h-1 w-24 overflow-hidden rounded-full bg-[#2d3449]">
                                                                        <div
                                                                            className={`h-full ${
                                                                                state === 'completed' ? 'bg-[#00e383]' : state === 'active' ? 'bg-[#00e3fd]' : 'bg-[#8e90a2]'
                                                                            }`}
                                                                            style={{ width: `${progressWidth}%` }}
                                                                        />
                                                                    </div>
                                                                    <span className="text-[10px] text-[#c4c5d9]">{Number(task.unitsCurrentlyHere || 0)} boards available here</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-5">
                                                                <span className={`inline-flex rounded-lg px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${
                                                                    task.status === 'COMPLETED'
                                                                        ? 'bg-[#007e46]/25 text-[#5bffa1]'
                                                                        : task.status === 'IN_PROGRESS'
                                                                            ? 'bg-[#00e3fd]/18 text-[#9cf0ff] shadow-[0_0_10px_rgba(0,227,253,0.18)]'
                                                                            : 'bg-[#2d3449] text-[#c4c5d9]'
                                                                }`}>
                                                                    {task.status === 'NOT_STARTED' ? 'Pending' : task.status.replace('_', ' ')}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-5">
                                                                {taskAssignments.length > 1 ? (
                                                                    <div>
                                                                        <p className="text-[12px] font-bold leading-none text-[#dae2fd]">{taskAssignments.length} workers assigned</p>
                                                                        <p className="mt-1 text-[10px] font-bold uppercase text-[#00e383]">{assignedBoards} boards allocated</p>
                                                                    </div>
                                                                ) : assignee ? (
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#b8c3ff] text-[10px] font-bold text-[#002388]">
                                                                            {assignee.name?.slice(0, 1) || 'U'}
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-[12px] font-bold leading-none text-[#dae2fd]">{assignee.name}</p>
                                                                            <p className="mt-1 text-[10px] font-bold uppercase text-[#00e383]">Assigned</p>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex items-center gap-2 text-[#c4c5d9]">
                                                                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2d3449] text-[14px]">
                                                                            <span className="material-symbols-outlined text-[16px]">person</span>
                                                                        </div>
                                                                        <span className="text-[12px]">Unassigned</span>
                                                                    </div>
                                                                )}
                                                            </td>
                                                            {showActionsColumn && (
                                                                <td className="px-6 py-5 text-right">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => toggleExpandedTask(taskId)}
                                                                        className="rounded-lg border border-[#2e5bff]/35 bg-[#2e5bff]/12 px-3 py-2 text-[11px] font-semibold text-[#b8c3ff] transition-colors hover:bg-[#2e5bff]/20 hover:text-[#dde1ff]"
                                                                    >
                                                                        {expandedTasks[taskId] ? 'Hide split' : 'Manage split'}
                                                                    </button>
                                                                </td>
                                                            )}
                                                        </tr>
                                                        {expandedTasks[taskId] && (
                                                            <tr className="bg-[#10192d]">
                                                                <td colSpan={showActionsColumn ? 5 : 4} className="px-6 py-5">
                                                                    <div className="rounded-2xl border border-[#3f485d] bg-[#0d1529] p-4">
                                                                        <div className="mb-4">
                                                                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#c4c5d9]">Split Allocation</p>
                                                                            <p className="mt-1 text-[12px] text-[#dae2fd]">
                                                                                Available: {availableCapacity} boards. Assigned: {assignedBoards}. Remaining unassigned: {unassignedBoards}.
                                                                            </p>
                                                                        </div>
                                                                        {assignmentErrors[taskId] && (
                                                                            <div className="mb-4 rounded-lg border border-[#93000a] bg-[#93000a]/20 px-3 py-2 text-[11px] text-[#ffdad6]">
                                                                                {assignmentErrors[taskId]}
                                                                            </div>
                                                                        )}
                                                                        <div className="space-y-3">
                                                                            {taskAssignments.map((assignment) => {
                                                                                const assignmentId = String(assignment.id || assignment._id);
                                                                                const assignmentDraft = assignmentDrafts[assignmentId] || {
                                                                                    boardsAssigned: String(assignment.boardsAssigned ?? 0),
                                                                                    boardsCompletedApproved: String(assignment.boardsCompletedApproved ?? assignment.boardsCompleted ?? 0),
                                                                                    deadline: assignment.deadline ? new Date(assignment.deadline).toISOString().slice(0, 10) : ''
                                                                                };

                                                                                return (
                                                                                    <div key={assignmentId} className="grid grid-cols-[minmax(0,1.2fr)_100px_100px_140px_180px] items-center gap-3 rounded-xl border border-[#313a50] bg-[#131b2e] p-3">
                                                                                        <div>
                                                                                            <p className="text-[13px] font-bold text-[#dae2fd]">{assignment.userName}</p>
                                                                                            <p className="text-[10px] uppercase tracking-[0.14em] text-[#00e383]">{assignment.userRole || 'Worker'}</p>
                                                                                            <p className="mt-1 text-[10px] text-[#c4c5d9]">
                                                                                                Draft: {assignment.boardsCompletedDraft ?? 0} | Approved: {assignment.boardsCompletedApproved ?? 0}
                                                                                            </p>
                                                                                            <p className="mt-1 text-[10px] text-[#c4c5d9]">
                                                                                                {assignment.status === 'WAITING_APPROVAL' ? 'Waiting for manager approval' : assignment.status.replace('_', ' ')}
                                                                                            </p>
                                                                                        </div>
                                                                                        <input
                                                                                            type="number"
                                                                                            min="0"
                                                                                            step="1"
                                                                                            value={assignmentDraft.boardsAssigned}
                                                                                            onChange={(e) => setAssignmentDrafts((prev) => ({ ...prev, [assignmentId]: { ...assignmentDraft, boardsAssigned: e.target.value } }))}
                                                                                            className="rounded-lg border border-[#434656] bg-[#0b1326] px-3 py-2 text-sm text-[#dae2fd] outline-none focus:border-[#2e5bff]"
                                                                                        />
                                                                                        <input
                                                                                            type="number"
                                                                                            readOnly
                                                                                            value={assignment.boardsCompletedApproved ?? assignment.boardsCompleted ?? 0}
                                                                                            className="rounded-lg border border-[#434656] bg-[#0b1326] px-3 py-2 text-sm text-[#dae2fd] outline-none focus:border-[#2e5bff]"
                                                                                        />
                                                                                        <input
                                                                                            type="date"
                                                                                            value={assignmentDraft.deadline}
                                                                                            onChange={(e) => setAssignmentDrafts((prev) => ({ ...prev, [assignmentId]: { ...assignmentDraft, deadline: e.target.value } }))}
                                                                                            className="rounded-lg border border-[#434656] bg-[#0b1326] px-3 py-2 text-sm text-[#dae2fd] outline-none focus:border-[#2e5bff]"
                                                                                        />
                                                                                        <div className="text-right">
                                                                                            <div className="flex flex-wrap justify-end gap-2">
                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={() => saveAssignment(taskId, assignmentId)}
                                                                                                    disabled={assignmentSaving[assignmentId]}
                                                                                                    className="rounded bg-[#2e5bff] px-3 py-2 text-[11px] font-bold text-[#efefff] disabled:opacity-60"
                                                                                                >
                                                                                                    {assignmentSaving[assignmentId] ? 'Saving...' : 'Save row'}
                                                                                                </button>
                                                                                                {assignment.status === 'WAITING_APPROVAL' && (
                                                                                                    <>
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            onClick={() => reviewAssignment(assignmentId, true)}
                                                                                                            disabled={assignmentSaving[assignmentId]}
                                                                                                            className="rounded bg-[#00e383] px-3 py-2 text-[11px] font-bold text-[#00210e] disabled:opacity-60"
                                                                                                        >
                                                                                                            Approve
                                                                                                        </button>
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            onClick={() => reviewAssignment(assignmentId, false, 'Rejected by manager')}
                                                                                                            disabled={assignmentSaving[assignmentId]}
                                                                                                            className="rounded border border-[#93000a] bg-[#93000a]/15 px-3 py-2 text-[11px] font-bold text-[#ffdad6] disabled:opacity-60"
                                                                                                        >
                                                                                                            Reject
                                                                                                        </button>
                                                                                                    </>
                                                                                                )}
                                                                                            </div>
                                                                                            {assignmentErrors[assignmentId] && (
                                                                                                <p className="mt-2 text-[10px] text-[#ffdad6]">{assignmentErrors[assignmentId]}</p>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                            <div className="grid grid-cols-[minmax(0,1.2fr)_100px_100px_140px_180px] items-center gap-3 rounded-xl border border-[#3f485d] bg-[#182236] p-3">
                                                                                <select
                                                                                    value={newAssignmentDrafts[taskId]?.userId || ''}
                                                                                    onChange={(e) => setNewAssignmentDrafts((prev) => ({ ...prev, [taskId]: { ...(prev[taskId] || {}), userId: e.target.value } }))}
                                                                                    className="rounded-lg border border-[#434656] bg-[#0b1326] px-3 py-2 text-sm text-[#dae2fd] outline-none focus:border-[#2e5bff]"
                                                                                >
                                                                                    <option value="">Select worker</option>
                                                                                    {assignableUsers.map((user) => (
                                                                                        <option key={getUserId(user)} value={getUserId(user)}>
                                                                                            {user.name} ({user.role})
                                                                                        </option>
                                                                                    ))}
                                                                                </select>
                                                                                <input
                                                                                    type="number"
                                                                                    min="0"
                                                                                    step="1"
                                                                                    value={newAssignmentDrafts[taskId]?.boardsAssigned || ''}
                                                                                    onChange={(e) => setNewAssignmentDrafts((prev) => ({ ...prev, [taskId]: { ...(prev[taskId] || {}), boardsAssigned: e.target.value } }))}
                                                                                    placeholder="Assigned"
                                                                                    className="rounded-lg border border-[#434656] bg-[#0b1326] px-3 py-2 text-sm text-[#dae2fd] outline-none focus:border-[#2e5bff]"
                                                                                />
                                                                                <input
                                                                                    type="text"
                                                                                    readOnly
                                                                                    value="0"
                                                                                    placeholder="Approved"
                                                                                    className="rounded-lg border border-[#434656] bg-[#0b1326] px-3 py-2 text-sm text-[#dae2fd] outline-none focus:border-[#2e5bff]"
                                                                                />
                                                                                <input
                                                                                    type="date"
                                                                                    value={newAssignmentDrafts[taskId]?.deadline || ''}
                                                                                    onChange={(e) => setNewAssignmentDrafts((prev) => ({ ...prev, [taskId]: { ...(prev[taskId] || {}), deadline: e.target.value } }))}
                                                                                    className="rounded-lg border border-[#434656] bg-[#0b1326] px-3 py-2 text-sm text-[#dae2fd] outline-none focus:border-[#2e5bff]"
                                                                                />
                                                                                <div className="text-right">
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => createAssignment(taskId)}
                                                                                        disabled={assignmentSaving[taskId]}
                                                                                        className="rounded bg-[#00e3fd] px-3 py-2 text-[11px] font-bold text-[#001f24] disabled:opacity-60"
                                                                                    >
                                                                                        {assignmentSaving[taskId] ? 'Saving...' : 'Add worker'}
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    <div className="flex items-center justify-between bg-[#131b2e] px-6 py-3 text-[11px] text-[#c4c5d9]">
                                        <p>Current Lead: {activeStations > 0 ? `${activeStations} active stations` : 'No active stations'}</p>
                                        <div className="flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-[#00e383]" />
                                            <p>Production dashboard synced</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4 p-4 lg:hidden">
                                    {sortedTasks.map((task, index) => {
                                        const taskId = getTaskId(task);
                                        const isEditing = editingTaskId === taskId;
                                        const state = getTaskState(task);
                                        const availableCapacity = getAvailableCapacity(task, index, sortedTasks, totalBatch);
                                        const assignee = users?.find((user) => getUserId(user) === (task.assigneeId || task.assigneeId?._id));

                                        return (
                                            <div key={taskId} className="rounded-xl border border-[#434656] bg-[#171f33] p-4">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <p className="font-bold text-[#dae2fd]">{task.productionPhase || task.title}</p>
                                                        <p className="mt-1 text-[11px] text-[#c4c5d9]">{Number(task.unitsCompleted || 0)} / {availableCapacity}</p>
                                                    </div>
                                                    <span className={`rounded-lg px-3 py-1 text-[10px] font-bold uppercase ${
                                                        task.status === 'COMPLETED'
                                                            ? 'bg-[#007e46]/25 text-[#5bffa1]'
                                                            : task.status === 'IN_PROGRESS'
                                                                ? 'bg-[#00e3fd]/18 text-[#9cf0ff]'
                                                                : 'bg-[#2d3449] text-[#c4c5d9]'
                                                    }`}>
                                                        {task.status === 'NOT_STARTED' ? 'Pending' : task.status.replace('_', ' ')}
                                                    </span>
                                                </div>
                                                <div className="mt-3 text-[12px] text-[#c4c5d9]">
                                                    Lead: <span className="font-semibold text-[#dae2fd]">{assignee?.name || 'Unassigned'}</span>
                                                </div>
                                                <div className="mt-3 text-[12px] text-[#c4c5d9]">
                                                    Available here: {Number(task.unitsCurrentlyHere || 0)}
                                                </div>
                                                {rowErrors[taskId] && (
                                                    <div className="mt-3 rounded-lg border border-[#93000a] bg-[#93000a]/20 px-3 py-2 text-[11px] text-[#ffdad6]">
                                                        {rowErrors[taskId]}
                                                    </div>
                                                )}
                                                {showActionsColumn && isEditing ? (
                                                    <div className="mt-4 space-y-3">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max={availableCapacity}
                                                            step="1"
                                                            value={draft.unitsCompleted}
                                                            onChange={(e) => setDraft({ unitsCompleted: e.target.value })}
                                                            className="w-full rounded-lg border border-[#434656] bg-[#0b1326] px-3 py-2 text-sm text-[#dae2fd] outline-none focus:border-[#2e5bff]"
                                                            placeholder="Enter board count"
                                                        />
                                                        <select
                                                            value={draft.assigneeId}
                                                            onChange={(e) => setDraft((prev) => ({ ...prev, assigneeId: e.target.value }))}
                                                            className="w-full rounded-lg border border-[#434656] bg-[#0b1326] px-3 py-2 text-sm text-[#dae2fd] outline-none focus:border-[#2e5bff]"
                                                        >
                                                            <option value="">Unassigned</option>
                                                            {assignableUsers.map((user) => (
                                                                <option key={getUserId(user)} value={getUserId(user)}>
                                                                    {user.name} ({user.role})
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <div className="flex gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={cancelEdit}
                                                                className="flex-1 rounded border border-[#434656] px-3 py-2 text-[11px] font-bold text-[#c4c5d9]"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => saveTask(task)}
                                                                disabled={rowLoading[taskId]}
                                                                className="flex-1 rounded bg-[#2e5bff] px-3 py-2 text-[11px] font-bold text-[#efefff] disabled:opacity-60"
                                                            >
                                                                {rowLoading[taskId] ? 'Saving...' : 'Save'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : showActionsColumn ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => beginEdit(task)}
                                                        className="mt-4 w-full rounded border border-[#2e5bff]/30 bg-[#2e5bff]/15 px-3 py-2 text-[11px] font-semibold text-[#b8c3ff]"
                                                    >
                                                        Enter boards
                                                    </button>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <aside className="min-w-0 lg:sticky lg:top-0 lg:w-[360px] lg:shrink-0 xl:w-[380px]">
                            <div className="flex h-full flex-col gap-4 rounded-[18px] border border-[#3f485d] bg-[#10192d] p-4 shadow-[0_18px_50px_rgba(6,14,32,0.34)]">
                                <div>
                                    <h3 className="font-['Hanken_Grotesk'] text-[18px] font-semibold text-[#efefff]">Project Stats</h3>
                                </div>

                                <div className="rounded-2xl border border-[#4b5468] bg-[#182236] px-4 py-4">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#cfd5e6]">Project Status</p>
                                        <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] ${
                                            projectState === 'COMPLETED'
                                                ? 'bg-[#007e46] text-[#c2ffd1]'
                                                : projectState === 'ACTIVE'
                                                    ? 'bg-[#2e5bff] text-[#efefff]'
                                                    : 'bg-[#222a3d] text-[#c4c5d9]'
                                        }`}>
                                            {projectState === 'ACTIVE' ? 'Active' : projectState}
                                        </span>
                                    </div>
                                    <div className="flex items-end justify-between gap-3">
                                        <div>
                                            <p className="text-[11px] text-[#9ea8bf]">Overall completion</p>
                                            <p className="mt-1 font-mono text-[26px] font-semibold leading-none text-[#e7ecff]">{overallCompletion}%</p>
                                        </div>
                                        <div className="min-w-[86px]">
                                            <div className="h-2 w-full overflow-hidden rounded-full bg-[#313a50]">
                                                <div className="h-full bg-[#11d7ff]" style={{ width: `${overallCompletion}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-2xl border border-[#4b5468] bg-[#2b3448] px-4 py-4">
                                        <p className="mb-2 text-[10px] font-bold uppercase text-[#cfd5e6]">Total Batch</p>
                                        <p className="font-mono text-[28px] font-semibold leading-none text-[#e7ecff]">{totalBatch}</p>
                                    </div>
                                    <div className="rounded-2xl border border-[#4b5468] bg-[#2b3448] px-4 py-4">
                                        <p className="mb-2 text-[10px] font-bold uppercase text-[#cfd5e6]">Completed</p>
                                        <p className="font-mono text-[28px] font-semibold leading-none text-[#00e383]">{boardsPassed}</p>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-[#4b5468] bg-[#2b3448] px-4 py-4">
                                    <div className="mb-3 flex items-center justify-between">
                                        <p className="text-[10px] font-bold uppercase text-[#cfd5e6]">In Progress</p>
                                        <span className="text-[10px] font-bold text-[#00e3fd]">{activePct}% Active</span>
                                    </div>
                                    <div className="mb-4 flex items-end gap-2">
                                        <span className="font-mono text-[30px] font-semibold leading-none text-[#e7ecff]">
                                            {String(activeStations).padStart(2, '0')}
                                        </span>
                                        <span className="pb-1 text-[13px] text-[#d4d9e8]">active stations</span>
                                    </div>
                                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#3a4359]">
                                        <div className="h-full bg-[#11d7ff]" style={{ width: `${activePct}%` }} />
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-[#4b5468] bg-[#1a2438] px-4 py-4">
                                    <p className="mb-3 text-[10px] font-bold uppercase text-[#cfd5e6]">Assigned Manager</p>
                                    <div className="flex items-center gap-3 rounded-xl border border-[#3f485e] bg-[#0d1529] p-3">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2e5bff] text-xl font-bold text-[#efefff] shadow-[0_10px_24px_rgba(46,91,255,0.28)]">
                                            {getInitial(project?.managerName)}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate text-[14px] font-bold text-[#e7ecff]">{project?.managerName || 'Not Assigned'}</p>
                                            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#6da8ff]">Project Manager</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-auto rounded-xl border border-[#3f485e] bg-[#232c40] px-4 py-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-[12px] text-[#cfd5e6]">Expected Dispatch</span>
                                        <span className="text-[13px] font-bold text-[#f1f4ff]">{formatDate(project?.deadline || project?.endDate)}</span>
                                    </div>
                                </div>

                                {showActionsColumn && (
                                    <div className="rounded-xl border border-[#2e5bff]/30 bg-[#12203d] px-4 py-3 text-[12px] text-[#cfd5e6]">
                                        Manager mode is enabled. Use each row&apos;s <span className="font-semibold text-[#b8c3ff]">Enter boards</span> action to record completed boards.
                                    </div>
                                )}
                            </div>
                        </aside>
                    </div>
                </div>
            </div>
            )}
        </div>
    );
}
