import React from 'react';

const PHASE_ICONS = {
    Procurement: 'inventory',
    'Component delivery': 'local_shipping',
    'Smd soldering': 'settings',
    'Smd rework': 'build',
    'Controller soldering': 'memory',
    'Dip soldering': 'conveyor_belt',
    'Board cleaning': 'cleaning_services',
    'Electrical testing': 'electric_bolt',
    'Peripheral testing': 'devices',
    'Functionality testing': 'fact_check',
    'Conformal coating': 'water_drop',
    'Final qc': 'verified'
};

const getTaskId = (task) => task?.id || task?._id;

const formatDate = (value) => {
    if (!value) return 'Not set';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not set' : date.toLocaleDateString();
};

const getDaysLeftLabel = (deadline) => {
    if (!deadline) return 'No deadline';
    const today = new Date();
    const end = new Date(deadline);

    if (Number.isNaN(end.getTime())) return 'No deadline';

    today.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`;
    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return '1 day left';
    return `${diffDays} days left`;
};

const getProjectBadgeClass = (status) => {
    if (status === 'COMPLETED') return 'bg-[#007e46]/20 text-[#5bffa1] border-[#007e46]/30';
    if (status === 'ACTIVE') return 'bg-[#2e5bff]/20 text-[#b8c3ff] border-[#2e5bff]/30';
    if (status === 'ON_HOLD') return 'bg-[#8a5a00]/20 text-[#ffd58a] border-[#8a5a00]/30';
    return 'bg-[#2d3449] text-[#c4c5d9] border-[#434656]';
};

const getPhaseState = (task) => {
    if ((task?.status || '') === 'COMPLETED') return 'completed';
    if (Number(task?.unitsCompleted || 0) > 0 || Number(task?.unitsCurrentlyHere || 0) > 0) return 'active';
    return 'pending';
};

const getAssignmentBadgeClass = (status) => {
    if (status === 'COMPLETED') return 'bg-[#007e46]/20 text-[#5bffa1]';
    if (status === 'WAITING_APPROVAL') return 'bg-[#00e3fd]/18 text-[#9cf0ff]';
    if (status === 'REJECTED') return 'bg-[#93000a]/20 text-[#ffdad6]';
    if (status === 'IN_PROGRESS') return 'bg-[#2e5bff]/20 text-[#b8c3ff]';
    return 'bg-[#2d3449] text-[#c4c5d9]';
};

export default function ProductionWorkerProjectView({
    project,
    tasks,
    assignments,
    productionDrafts,
    productionSaving,
    setProductionDrafts,
    submitProductionProgress,
    onBack
}) {
    const productionTasks = (tasks || [])
        .filter((task) => String(task.projectId) === String(project.id) && (task.isProductionTask || task.isFullProductStage))
        .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));

    const assignmentsByTaskId = (assignments || []).reduce((acc, assignment) => {
        const key = String(assignment.taskId);
        if (!acc[key]) acc[key] = [];
        acc[key].push(assignment);
        return acc;
    }, {});

    const totalBatch = Number(project.totalBatchSize || 0);
    const totalAssignedBoards = assignments.reduce((sum, item) => sum + Number(item.boardsAssigned || 0), 0);
    const approvedBoards = assignments.reduce((sum, item) => sum + Number(item.boardsCompletedApproved || 0), 0);
    const pendingReviews = assignments.filter((item) => item.status === 'WAITING_APPROVAL').length;
    const overdueAssignments = assignments.filter((item) => item.deadline && new Date(item.deadline) < new Date() && Number(item.boardsCompletedApproved || 0) < Number(item.boardsAssigned || 0)).length;
    const myCompletion = totalAssignedBoards > 0 ? Math.round((approvedBoards / totalAssignedBoards) * 100) : 0;
    const activeAssignments = assignments.filter((item) => ['IN_PROGRESS', 'WAITING_APPROVAL'].includes(item.status)).length;
    const projectCompletion = totalBatch > 0 && productionTasks.length > 0
        ? Math.round(
            (productionTasks.reduce((sum, task) => sum + Math.min(Number(task.unitsCompleted || 0), totalBatch), 0) / (productionTasks.length * totalBatch)) * 100
        )
        : 0;
    const finalTask = productionTasks[productionTasks.length - 1] ?? null;

    return (
        <div className="space-y-8">
            <div className="overflow-hidden rounded-[28px] border border-[#3d4560] bg-[#0b1326] shadow-[0_30px_100px_rgba(4,9,24,0.55)]">
                <div className="border-b border-[#202943] bg-[linear-gradient(135deg,#151e34_0%,#10182b_100%)] px-6 py-6 lg:px-8">
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0c2f35] text-[#9cf0ff]">
                                    <span className="material-symbols-outlined">precision_manufacturing</span>
                                </div>
                                <div>
                                    <div className="flex flex-wrap items-center gap-3">
                                        <h1 className="font-['Hanken_Grotesk'] text-3xl font-bold tracking-[-0.03em] text-[#eef3ff]">
                                            {project.name || project.projectCode}
                                        </h1>
                                        <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${getProjectBadgeClass(project.status)}`}>
                                            {project.status}
                                        </span>
                                    </div>
                                    <p className="mt-2 text-sm text-[#9fa8c4]">{project.description || 'Production tracking for your allocated boards.'}</p>
                                </div>
                            </div>

                            <div className="mt-5 flex flex-wrap items-center gap-5 text-[12px] text-[#c7cee2]">
                                <span className="flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                                    {formatDate(project.startDate)}
                                </span>
                                <span className="flex items-center gap-1.5 text-[#8bc6ff]">
                                    <span className="material-symbols-outlined text-[16px]">timer</span>
                                    {getDaysLeftLabel(project.deadline || project.endDate)}
                                </span>
                                <span className="rounded-lg border border-[#434656] bg-[#0f172b] px-3 py-1 text-[11px] font-semibold text-[#00e3fd]">
                                    Batch {totalBatch || 0} boards
                                </span>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={onBack}
                            className="inline-flex items-center gap-2 rounded-xl border border-[#434656] bg-[#0f172b] px-4 py-2 text-sm font-medium text-[#e7ecff] transition-colors hover:bg-[#18233c]"
                        >
                            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                            Back to Projects
                        </button>
                    </div>
                </div>

                <div className="px-6 py-6 lg:px-8">
                    <div className="overflow-x-auto pb-2">
                        <div className="flex min-w-[960px] items-start gap-3">
                            {productionTasks.map((task, index) => {
                                const phaseState = getPhaseState(task);
                                const taskLabel = task.productionPhase || task.title;
                                const icon = PHASE_ICONS[task.productionPhase] || 'inventory_2';
                                const connectorClass = phaseState === 'completed'
                                    ? 'bg-[#00e383]'
                                    : phaseState === 'active'
                                        ? 'bg-[#00daf3]'
                                        : 'bg-[#353e56]';

                                return (
                                    <React.Fragment key={getTaskId(task)}>
                                        <div className="flex w-[100px] shrink-0 flex-col items-center gap-2 text-center">
                                            <div className={`flex h-12 w-12 items-center justify-center rounded-full border text-sm ${
                                                phaseState === 'completed'
                                                    ? 'border-[#00e383] bg-[#00e383] text-[#032013]'
                                                    : phaseState === 'active'
                                                        ? 'border-[#2e5bff] bg-[#2e5bff] text-white shadow-[0_0_18px_rgba(46,91,255,0.45)]'
                                                        : 'border-[#7a8298] bg-[#1d2537] text-[#aab2ca]'
                                            }`}>
                                                <span className="material-symbols-outlined text-[22px]">{icon}</span>
                                            </div>
                                            <span className={`text-xs font-semibold ${
                                                phaseState === 'pending' ? 'text-[#98a2bb]' : 'text-[#eef3ff]'
                                            }`}>
                                                {taskLabel}
                                            </span>
                                        </div>
                                        {index < productionTasks.length - 1 && (
                                            <div className={`mt-6 h-[2px] min-w-[56px] flex-1 rounded-full ${connectorClass}`} />
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.65fr)_360px]">
                <div className="space-y-4">
                    <div className="rounded-[24px] border border-[#3d4560] bg-[#0b1326] shadow-[0_24px_80px_rgba(4,9,24,0.45)]">
                        <div className="border-b border-[#202943] px-6 py-5">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-[#8ea4ff]">assignment</span>
                                <div>
                                    <h2 className="font-['Hanken_Grotesk'] text-2xl font-semibold text-[#eef3ff]">My Board Allocations</h2>
                                    <p className="mt-1 text-sm text-[#97a3bf]">Production work is tracked by assigned boards, approved boards, and manager review.</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4 p-4 md:p-6">
                            {productionTasks.map((task, index) => {
                                const taskId = String(getTaskId(task));
                                const taskAssignments = assignmentsByTaskId[taskId] || [];
                                const allowedBoards = totalBatch;
                                const availableHere = Number(task.unitsCurrentlyHere || 0);
                                const phaseCompleted = Number(task.unitsCompleted || 0);
                                const taskLabel = task.productionPhase || task.title;

                                return (
                                    <div key={taskId} className={`rounded-2xl border ${taskAssignments.length > 0 ? 'border-[#3458ff] bg-[#121b31]' : 'border-[#31394d] bg-[#11192d]'}`}>
                                        <div className="grid gap-4 border-b border-[#27324b] px-4 py-4 lg:grid-cols-[minmax(0,1.1fr)_180px_160px] lg:items-center">
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="text-lg font-bold text-[#eef3ff]">{taskLabel}</h3>
                                                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em] ${
                                                        getPhaseState(task) === 'completed'
                                                            ? 'bg-[#007e46]/20 text-[#5bffa1]'
                                                            : getPhaseState(task) === 'active'
                                                                ? 'bg-[#00e3fd]/18 text-[#9cf0ff]'
                                                                : 'bg-[#2d3449] text-[#c4c5d9]'
                                                    }`}>
                                                        {task.status === 'NOT_STARTED' ? 'Pending' : task.status.replace('_', ' ')}
                                                    </span>
                                                </div>
                                                <p className="mt-2 text-sm text-[#99a4bf]">
                                                    {taskAssignments.length > 0
                                                        ? `You have ${taskAssignments.length} active allocation${taskAssignments.length > 1 ? 's' : ''} in this phase.`
                                                        : `${availableHere} boards remain in this phase, but none are assigned to you yet.`}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8f9ab4]">Phase Output</p>
                                                <p className="mt-2 font-mono text-[28px] font-semibold leading-none text-[#11d7ff]">
                                                    {phaseCompleted} / {allowedBoards}
                                                </p>
                                                <p className="mt-2 text-xs text-[#97a3bf]">{availableHere} boards remaining in this phase</p>
                                            </div>
                                            <div className="rounded-xl border border-[#39425a] bg-[#0e1629] px-4 py-3">
                                                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8f9ab4]">My Share</p>
                                                <p className="mt-2 text-2xl font-bold text-[#eef3ff]">
                                                    {taskAssignments.reduce((sum, item) => sum + Number(item.boardsAssigned || 0), 0)}
                                                </p>
                                                <p className="mt-1 text-xs text-[#97a3bf]">
                                                    {taskAssignments.reduce((sum, item) => sum + Number(item.boardsCompletedApproved || 0), 0)} approved
                                                </p>
                                            </div>
                                        </div>

                                        <div className="space-y-3 p-4">
                                            {taskAssignments.length === 0 && (
                                                <div className="rounded-xl border border-dashed border-[#39425a] bg-[#0d1426] px-4 py-4 text-sm text-[#97a3bf]">
                                                    No boards assigned to you in this phase yet.
                                                </div>
                                            )}

                                            {taskAssignments.map((assignment) => {
                                                const draft = productionDrafts[assignment.id] || {
                                                    boardsCompletedDraft: String(assignment.boardsCompletedDraft ?? assignment.boardsCompletedApproved ?? 0),
                                                    delayReason: assignment.delayReason || ''
                                                };
                                                const isOverdue = assignment.deadline && new Date() > new Date(assignment.deadline);

                                                return (
                                                    <div key={assignment.id} className="rounded-2xl border border-[#39425a] bg-[#0d1528] p-4">
                                                        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                                                            <div>
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${getAssignmentBadgeClass(assignment.status)}`}>
                                                                        {assignment.status.replace('_', ' ')}
                                                                    </span>
                                                                    {assignment.delayStatus === 'PENDING_MANAGER' && (
                                                                        <span className="rounded-full bg-[#8a5a00]/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#ffd58a]">
                                                                            Delay Approval Pending
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                                                    <div className="rounded-xl border border-[#31394d] bg-[#10192d] px-4 py-3">
                                                                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#8f9ab4]">Assigned</p>
                                                                        <p className="mt-2 font-mono text-2xl font-semibold text-[#eef3ff]">{assignment.boardsAssigned}</p>
                                                                    </div>
                                                                    <div className="rounded-xl border border-[#31394d] bg-[#10192d] px-4 py-3">
                                                                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#8f9ab4]">Approved</p>
                                                                        <p className="mt-2 font-mono text-2xl font-semibold text-[#5bffa1]">{assignment.boardsCompletedApproved}</p>
                                                                    </div>
                                                                    <div className="rounded-xl border border-[#31394d] bg-[#10192d] px-4 py-3">
                                                                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#8f9ab4]">Deadline</p>
                                                                        <p className={`mt-2 text-sm font-semibold ${isOverdue ? 'text-[#ffb4ab]' : 'text-[#eef3ff]'}`}>{formatDate(assignment.deadline)}</p>
                                                                    </div>
                                                                </div>

                                                                {assignment.rejectionReason && (
                                                                    <div className="mt-3 rounded-xl border border-[#93000a]/50 bg-[#93000a]/15 px-4 py-3 text-sm text-[#ffdad6]">
                                                                        Last rejection: {assignment.rejectionReason}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div className="rounded-2xl border border-[#31394d] bg-[#10192d] p-4">
                                                                <div className="grid gap-3">
                                                                    <div>
                                                                        <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-[#8f9ab4]">
                                                                            Boards Completed
                                                                        </label>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            step="1"
                                                                            value={draft.boardsCompletedDraft}
                                                                            onChange={(e) => setProductionDrafts((prev) => ({
                                                                                ...prev,
                                                                                [assignment.id]: { ...draft, boardsCompletedDraft: e.target.value }
                                                                            }))}
                                                                            className="w-full rounded-xl border border-[#434656] bg-[#0b1326] px-4 py-3 text-sm text-[#eef3ff] outline-none focus:border-[#2e5bff]"
                                                                            placeholder="Enter completed boards"
                                                                        />
                                                                    </div>

                                                                    <div>
                                                                        <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-[#8f9ab4]">
                                                                            Delay Reason
                                                                        </label>
                                                                        <textarea
                                                                            value={draft.delayReason}
                                                                            onChange={(e) => setProductionDrafts((prev) => ({
                                                                                ...prev,
                                                                                [assignment.id]: { ...draft, delayReason: e.target.value }
                                                                            }))}
                                                                            rows={3}
                                                                            className="w-full rounded-xl border border-[#434656] bg-[#0b1326] px-4 py-3 text-sm text-[#eef3ff] outline-none focus:border-[#2e5bff]"
                                                                            placeholder={isOverdue ? 'Required if you are submitting after deadline' : 'Optional note for manager'}
                                                                        />
                                                                    </div>

                                                                    <button
                                                                        type="button"
                                                                        onClick={() => submitProductionProgress(assignment)}
                                                                        disabled={productionSaving[assignment.id]}
                                                                        className="inline-flex items-center justify-center rounded-xl bg-[#2e5bff] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#3a67ff] disabled:opacity-60"
                                                                    >
                                                                        {productionSaving[assignment.id] ? 'Submitting...' : 'Submit for Approval'}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <aside className="space-y-4">
                    <div className="rounded-[24px] border border-[#3d4560] bg-[#0b1326] p-5 shadow-[0_24px_80px_rgba(4,9,24,0.45)]">
                        <h3 className="font-['Hanken_Grotesk'] text-[22px] font-semibold text-[#eef3ff]">My Production Status</h3>
                        <div className="mt-4 space-y-3">
                            <div className="rounded-2xl border border-[#4a5368] bg-[#1b2439] p-4">
                                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#cfd5e6]">My Completion</p>
                                <div className="mt-3 flex items-end justify-between gap-3">
                                    <p className="font-mono text-[34px] font-semibold leading-none text-[#eef3ff]">{myCompletion}%</p>
                                    <span className="text-[11px] font-semibold text-[#11d7ff]">{approvedBoards} approved</span>
                                </div>
                                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#313a50]">
                                    <div className="h-full bg-[#11d7ff]" style={{ width: `${myCompletion}%` }} />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-2xl border border-[#4a5368] bg-[#2b3448] p-4">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#cfd5e6]">Assigned</p>
                                    <p className="mt-2 font-mono text-[28px] font-semibold leading-none text-[#eef3ff]">{totalAssignedBoards}</p>
                                </div>
                                <div className="rounded-2xl border border-[#4a5368] bg-[#2b3448] p-4">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#cfd5e6]">Pending Review</p>
                                    <p className="mt-2 font-mono text-[28px] font-semibold leading-none text-[#9cf0ff]">{pendingReviews}</p>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-[#4a5368] bg-[#1b2439] p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#cfd5e6]">Active Allocations</p>
                                    <span className="text-[10px] font-bold text-[#11d7ff]">{activeAssignments} open</span>
                                </div>
                                <div className="mt-3 flex items-end gap-2">
                                    <span className="font-mono text-[32px] font-semibold leading-none text-[#eef3ff]">{String(activeAssignments).padStart(2, '0')}</span>
                                    <span className="pb-1 text-sm text-[#d0d6e5]">work items</span>
                                </div>
                                <p className="mt-3 text-xs text-[#97a3bf]">{overdueAssignments} overdue allocation{overdueAssignments === 1 ? '' : 's'}</p>
                            </div>

                            <div className="rounded-2xl border border-[#4a5368] bg-[#1b2439] p-4">
                                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#cfd5e6]">Project Progress</p>
                                <div className="mt-3 flex items-end justify-between gap-3">
                                    <p className="font-mono text-[32px] font-semibold leading-none text-[#eef3ff]">{projectCompletion}%</p>
                                    <span className="text-[11px] font-semibold text-[#5bffa1]">
                                        {finalTask?.unitsCompleted || 0} / {totalBatch || 0}
                                    </span>
                                </div>
                                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#313a50]">
                                    <div className="h-full bg-[#00e383]" style={{ width: `${projectCompletion}%` }} />
                                </div>
                            </div>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}
