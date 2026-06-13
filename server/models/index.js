const User = require('./User');
const Project = require('./Project');
const Task = require('./Task');
const ProductionAssignment = require('./ProductionAssignment');
const ProductionDispatch = require('./ProductionDispatch');
const Activity = require('./Activity');
const Notification = require('./Notification');
const Inventory = require('./Inventory');

module.exports = {
    User,
    Project,
    Task,
    ProductionAssignment,
    ProductionDispatch,
    Activity,
    Notification,
    ...Inventory
};
