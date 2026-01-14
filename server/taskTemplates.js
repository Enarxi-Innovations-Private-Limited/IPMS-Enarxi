// Task Templates for Project Creation

const taskTemplates = {
    HARDWARE: {
        'Hardware Design': [
            { title: 'Team Lead – Timeline execution plan', order: 1 },
            { title: 'Schematic Development', order: 2 },
            { title: 'Schematic Internal Approval and Client Approval', order: 3 },
            { title: 'PCB Layout Internal Approval and Client Approval', order: 4 },
            { title: 'Project Budget Sheet and Approval', order: 5 },
            { title: 'Procurement', order: 6 },
            { title: 'Boards Assembly and Fabrication', order: 7 },
            { title: 'Electrical Testing', order: 8 },
            { title: 'Peripheral Testing', order: 9 },
            { title: 'Firmware Development', order: 10 },
            { title: 'Operational Testing', order: 11 },
            { title: 'Client Demo', order: 12 },
            { title: 'Client Payment', order: 13 },
            { title: 'Client Project Handover', order: 14 },
            { title: 'Client Project Completion Certificate', order: 15 },
            { title: 'Client Documentation Handover (if Any)', order: 16 },
            { title: 'Client Feedback on Email', order: 17 },
        ],
    },
    SOFTWARE: {
        'Product Development': [
            { title: 'Requirement & PRD', order: 1 },
            { title: 'Wireframes', order: 2 },
            { title: 'UI Design', order: 3 },
            { title: 'Development', order: 4 },
            { title: 'Client Validation', order: 5 },
            { title: 'Final Review', order: 6 },
            { title: 'Closure', order: 7 },
        ],
    },
};

// Get templates for a department
const getTemplatesForDepartment = (department) => {
    return taskTemplates[department] || {};
};

// Get template names for a department
const getTemplateNames = (department) => {
    const templates = taskTemplates[department] || {};
    return Object.keys(templates);
};

// Get tasks for a specific template
const getTemplateTasks = (department, templateName) => {
    const templates = taskTemplates[department] || {};
    return templates[templateName] || [];
};

module.exports = {
    taskTemplates,
    getTemplatesForDepartment,
    getTemplateNames,
    getTemplateTasks,
};
