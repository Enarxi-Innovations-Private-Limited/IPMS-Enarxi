/**
 * Migration script to add project codes to existing projects
 * Run this once: node migrate-project-codes.js
 */

const mongoose = require('mongoose');
const connectDB = require('./db');

// Simple Project schema for migration
const projectSchema = new mongoose.Schema({
    projectCode: String,
    name: String,
    createdAt: Date,
});

async function migrateProjectCodes() {
    try {
        await connectDB();
        console.log('Connected to MongoDB');

        const Project = mongoose.model('Project', projectSchema);

        // Find all projects without projectCode
        const projects = await Project.find({
            $or: [
                { projectCode: null },
                { projectCode: '' },
                { projectCode: { $exists: false } }
            ]
        }).sort({ createdAt: 1 });

        console.log(`Found ${projects.length} projects without project codes`);

        const currentYear = new Date().getFullYear();
        let counter = 1;

        // Check if there are already projects with codes this year
        const lastProject = await Project.findOne({
            projectCode: { $regex: `^PRJ-${currentYear}-` }
        }).sort({ projectCode: -1 });

        if (lastProject && lastProject.projectCode) {
            const lastNumber = parseInt(lastProject.projectCode.split('-')[2], 10);
            counter = lastNumber + 1;
        }

        for (const project of projects) {
            const projectCode = `PRJ-${currentYear}-${String(counter).padStart(3, '0')}`;
            await Project.updateOne(
                { _id: project._id },
                { $set: { projectCode } }
            );
            console.log(`Updated: ${project.name} -> ${projectCode}`);
            counter++;
        }

        console.log('\n✅ Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrateProjectCodes();
