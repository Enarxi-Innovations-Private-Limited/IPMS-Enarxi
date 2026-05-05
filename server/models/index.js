const User = require('./User');
const Project = require('./Project');
const Task = require('./Task');
const Activity = require('./Activity');
const Notification = require('./Notification');
const Inventory = require('./Inventory');

module.exports = {
    User,
    Project,
    Task,
    Activity,
    Notification,
    ...Inventory
};
