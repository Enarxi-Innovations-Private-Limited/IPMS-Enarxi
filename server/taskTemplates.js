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
        'Hardware Production': [
            { title: 'BOM Creation or UPDATE', order: 1 },
            { title: 'PCB Procurement', order: 2 },
            { title: 'Stocklist update', order: 3 },
            { title: 'Stencil Procurement', order: 4 },
            { title: 'Component Procurement', order: 5 },
            { title: 'Procurement validation of all components', order: 6 },
            { title: 'Assembly', order: 7 },
            { title: 'Electrical Peripheral Testing', order: 8 },
            { title: 'Quality Check and Inspection', order: 9 },
            { title: 'Stickering and labeling', order: 10 },
            { title: 'Conformal Coating', order: 11 },
            { title: 'Shipment', order: 12 },
        ],
    },
    SOFTWARE: {
        'IT Software Development': [
            { title: 'User Flow Diagrams', order: 1 },
            { title: 'Wireframes', order: 2 },
            { title: 'UI/UX Visual Design', order: 3 },
            { title: 'Design Approval', order: 4 },
            { title: 'Backend Development', order: 5 },
            { title: 'Web Frontend Development', order: 6 },
            { title: 'Mobile App Development', order: 7 },
            { title: 'API Integration', order: 8 },
            { title: 'Internal QA', order: 9 },
            { title: 'Bug Fixes', order: 10 },
            { title: 'Staging Deployment', order: 11 },
            { title: 'Client Demo', order: 12 },
            { title: 'Final Changes', order: 13 },
            { title: 'Production Deployment', order: 14 },
            { title: 'Client Payment', order: 15 },
            { title: 'Project Handover', order: 16 },
            { title: 'Documentation Handover', order: 17 },
            { title: 'Completion Certificate', order: 18 },
            { title: 'Client Feedback', order: 19 },
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
