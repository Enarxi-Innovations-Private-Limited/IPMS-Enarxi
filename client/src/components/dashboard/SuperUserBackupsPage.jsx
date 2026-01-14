import { useState, useEffect } from 'react';
import api from '../../services/api.js';
import SuperUserLayout from '../common/SuperUserLayout';

export default function SuperUserBackupsPage() {
    const [backups, setBackups] = useState([]);
    const [selectedBackup, setSelectedBackup] = useState(null);
    const [backupDetails, setBackupDetails] = useState(null);
    const [loading, setLoading] = useState(true);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [error, setError] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState({ show: false, type: '', folderName: '', filename: '' });
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadBackups();
    }, []);

    const loadBackups = async () => {
        try {
            setLoading(true);
            const res = await api.get('/backups');
            setBackups(res.data);
        } catch (err) {
            setError('Failed to load backups');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const loadBackupDetails = async (folderName) => {
        try {
            setDetailsLoading(true);
            const res = await api.get(`/backups/${folderName}`);
            setBackupDetails(res.data);
            setSelectedBackup(folderName);
        } catch (err) {
            setError('Failed to load backup details');
            console.error(err);
        } finally {
            setDetailsLoading(false);
        }
    };

    const handleDownload = async (folderName, filename) => {
        try {
            const response = await api.get(`/backups/${folderName}/download/${filename}`, {
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            setError('Failed to download file');
            console.error(err);
        }
    };

    const handleDeleteFile = async () => {
        try {
            await api.delete(`/backups/${deleteConfirm.folderName}/files/${deleteConfirm.filename}`);
            setDeleteConfirm({ show: false, type: '', folderName: '', filename: '' });
            loadBackupDetails(deleteConfirm.folderName);
            loadBackups();
        } catch (err) {
            setError('Failed to delete file');
            console.error(err);
        }
    };

    const handleDeleteFolder = async () => {
        try {
            await api.delete(`/backups/${deleteConfirm.folderName}`);
            setDeleteConfirm({ show: false, type: '', folderName: '', filename: '' });
            setSelectedBackup(null);
            setBackupDetails(null);
            loadBackups();
        } catch (err) {
            setError('Failed to delete backup folder');
            console.error(err);
        }
    };

    const formatBytes = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return 'Unknown';
        return new Date(dateStr).toLocaleString();
    };

    const getFileIcon = (filename) => {
        const ext = filename.split('.').pop()?.toLowerCase();
        const iconMap = {
            pdf: 'picture_as_pdf',
            doc: 'description',
            docx: 'description',
            xls: 'table_chart',
            xlsx: 'table_chart',
            ppt: 'slideshow',
            pptx: 'slideshow',
            txt: 'article',
            png: 'image',
            jpg: 'image',
            jpeg: 'image',
            gif: 'image',
            zip: 'folder_zip',
            rar: 'folder_zip'
        };
        return iconMap[ext] || 'insert_drive_file';
    };

    const filteredBackups = backups.filter(backup =>
        backup.projectCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        backup.projectName?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <SuperUserLayout currentPage="backups">
            <div className="p-6 space-y-6">
                {/* Page Header */}
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                            <span className="material-symbols-outlined text-amber-500" style={{ fontSize: '32px' }}>backup</span>
                            Backup Management
                        </h1>
                        <p className="text-text-secondary mt-1">View and manage deleted project attachments</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">search</span>
                            <input
                                type="text"
                                placeholder="Search backups..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 pr-4 py-2 bg-surface-dark border border-border-dark rounded-lg text-white placeholder-text-secondary focus:ring-2 focus:ring-primary focus:border-transparent outline-none w-64"
                            />
                        </div>
                        <button
                            onClick={loadBackups}
                            className="px-4 py-2 bg-surface-dark border border-border-dark rounded-lg text-white hover:bg-background-dark transition-colors flex items-center gap-2"
                        >
                            <span className="material-symbols-outlined">refresh</span>
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg flex items-center gap-2">
                        <span className="material-symbols-outlined">error</span>
                        {error}
                        <button onClick={() => setError('')} className="ml-auto">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                )}

                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Backup Folders List */}
                    <div className="lg:col-span-1 bg-surface-dark rounded-xl border border-border-dark overflow-hidden">
                        <div className="p-4 border-b border-border-dark bg-gradient-surface">
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-amber-500">folder_special</span>
                                Backup Folders
                                <span className="ml-auto text-sm text-text-secondary bg-background-dark px-2 py-0.5 rounded-full">
                                    {filteredBackups.length}
                                </span>
                            </h2>
                        </div>
                        <div className="max-h-[calc(100vh-300px)] overflow-y-auto custom-scrollbar">
                            {loading ? (
                                <div className="p-8 text-center">
                                    <span className="material-symbols-outlined text-4xl text-text-secondary animate-spin">progress_activity</span>
                                    <p className="text-text-secondary mt-2">Loading backups...</p>
                                </div>
                            ) : filteredBackups.length === 0 ? (
                                <div className="p-8 text-center">
                                    <span className="material-symbols-outlined text-5xl text-text-secondary">folder_off</span>
                                    <p className="text-text-secondary mt-2">No backups found</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-border-dark">
                                    {filteredBackups.map((backup) => (
                                        <button
                                            key={backup.folderName}
                                            onClick={() => loadBackupDetails(backup.folderName)}
                                            className={`w-full p-4 text-left hover:bg-background-dark transition-colors ${selectedBackup === backup.folderName ? 'bg-primary/10 border-l-4 border-primary' : ''
                                                }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="p-2 bg-amber-500/10 rounded-lg">
                                                    <span className="material-symbols-outlined text-amber-500">folder</span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-semibold text-white truncate">{backup.projectCode}</p>
                                                        {backup.department && backup.department !== 'Unknown' && (
                                                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${backup.department === 'SOFTWARE'
                                                                    ? 'bg-blue-500/20 text-blue-400'
                                                                    : 'bg-orange-500/20 text-orange-400'
                                                                }`}>
                                                                {backup.department}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-text-secondary truncate">{backup.projectName}</p>
                                                    <div className="flex items-center gap-2 mt-1.5 text-xs text-text-secondary flex-wrap">
                                                        <span className="flex items-center gap-1">
                                                            <span className="material-symbols-outlined text-sm">description</span>
                                                            {backup.fileCount} files
                                                        </span>
                                                        <span>•</span>
                                                        <span className="flex items-center gap-1">
                                                            <span className="material-symbols-outlined text-sm">storage</span>
                                                            {formatBytes(backup.totalSize)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1 text-xs text-text-secondary">
                                                        <span className="flex items-center gap-1 text-amber-400/80">
                                                            <span className="material-symbols-outlined text-sm">delete</span>
                                                            {backup.deletedBy !== 'Unknown' ? backup.deletedBy : 'Unknown'} • {formatDate(backup.deletedAt)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Backup Details */}
                    <div className="lg:col-span-2 bg-surface-dark rounded-xl border border-border-dark overflow-hidden">
                        <div className="p-4 border-b border-border-dark bg-gradient-surface flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">info</span>
                                {selectedBackup ? `Backup Details: ${selectedBackup}` : 'Select a backup to view details'}
                            </h2>
                            {selectedBackup && (
                                <button
                                    onClick={() => setDeleteConfirm({ show: true, type: 'folder', folderName: selectedBackup, filename: '' })}
                                    className="px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors flex items-center gap-1.5 text-sm"
                                >
                                    <span className="material-symbols-outlined text-lg">delete_forever</span>
                                    Delete All
                                </button>
                            )}
                        </div>

                        {detailsLoading ? (
                            <div className="p-8 text-center">
                                <span className="material-symbols-outlined text-4xl text-text-secondary animate-spin">progress_activity</span>
                                <p className="text-text-secondary mt-2">Loading details...</p>
                            </div>
                        ) : !backupDetails ? (
                            <div className="p-12 text-center">
                                <span className="material-symbols-outlined text-6xl text-text-secondary">folder_open</span>
                                <p className="text-text-secondary mt-3">Select a backup folder to view its contents</p>
                            </div>
                        ) : (
                            <div className="p-4 space-y-4">
                                {/* Project Info */}
                                <div className="bg-background-dark rounded-lg p-4 space-y-2">
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <span className="text-text-secondary">Project Name:</span>
                                            <p className="text-white font-medium">{backupDetails.projectInfo?.projectName || 'N/A'}</p>
                                        </div>
                                        <div>
                                            <span className="text-text-secondary">Project Code:</span>
                                            <p className="text-white font-medium">{backupDetails.projectInfo?.projectCode || 'N/A'}</p>
                                        </div>
                                        <div>
                                            <span className="text-text-secondary">Department:</span>
                                            <p className="text-white font-medium">{backupDetails.projectInfo?.department || 'N/A'}</p>
                                        </div>
                                        <div>
                                            <span className="text-text-secondary">Deleted At:</span>
                                            <p className="text-white font-medium">{formatDate(backupDetails.deletedAt)}</p>
                                        </div>
                                        <div>
                                            <span className="text-text-secondary">Deleted By:</span>
                                            <p className="text-white font-medium">{backupDetails.deletedBy || 'Unknown'}</p>
                                        </div>
                                        <div>
                                            <span className="text-text-secondary">Total Files:</span>
                                            <p className="text-white font-medium">{backupDetails.files?.length || 0}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Files List */}
                                <div className="space-y-2">
                                    <h3 className="text-white font-semibold flex items-center gap-2">
                                        <span className="material-symbols-outlined text-text-secondary">attach_file</span>
                                        Backed Up Files
                                    </h3>

                                    {backupDetails.files?.length === 0 ? (
                                        <div className="bg-background-dark rounded-lg p-6 text-center">
                                            <span className="material-symbols-outlined text-4xl text-text-secondary">inbox</span>
                                            <p className="text-text-secondary mt-2">No files in this backup</p>
                                        </div>
                                    ) : (
                                        <div className="max-h-[400px] overflow-y-auto custom-scrollbar space-y-2">
                                            {backupDetails.files?.map((file) => (
                                                <div
                                                    key={file.filename}
                                                    className="bg-background-dark rounded-lg p-3 flex items-center gap-3 group hover:bg-background-dark/80 transition-colors"
                                                >
                                                    <div className="p-2 bg-surface-dark rounded-lg">
                                                        <span className="material-symbols-outlined text-primary">{getFileIcon(file.filename)}</span>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-white font-medium truncate">{file.originalName}</p>
                                                        <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary mt-1">
                                                            <span className="flex items-center gap-1">
                                                                <span className="material-symbols-outlined text-sm">storage</span>
                                                                {formatBytes(file.size)}
                                                            </span>
                                                            <span>•</span>
                                                            <span className="flex items-center gap-1">
                                                                <span className="material-symbols-outlined text-sm">schedule</span>
                                                                {formatDate(file.backedUpAt)}
                                                            </span>
                                                            {file.deletedBy && (
                                                                <>
                                                                    <span>•</span>
                                                                    <span className="flex items-center gap-1 text-amber-400">
                                                                        <span className="material-symbols-outlined text-sm">person</span>
                                                                        Deleted by: {file.deletedBy}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => handleDownload(selectedBackup, file.filename)}
                                                            className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                                            title="Download"
                                                        >
                                                            <span className="material-symbols-outlined">download</span>
                                                        </button>
                                                        <button
                                                            onClick={() => setDeleteConfirm({ show: true, type: 'file', folderName: selectedBackup, filename: file.filename })}
                                                            className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                            title="Delete Permanently"
                                                        >
                                                            <span className="material-symbols-outlined">delete_forever</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {deleteConfirm.show && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteConfirm({ show: false, type: '', folderName: '', filename: '' })}></div>
                    <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                        <div className="px-6 py-4 border-b border-border-dark bg-red-500/10">
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-red-400">warning</span>
                                Confirm Permanent Deletion
                            </h2>
                        </div>
                        <div className="p-6">
                            <p className="text-text-secondary mb-4">
                                {deleteConfirm.type === 'folder' ? (
                                    <>
                                        Are you sure you want to <span className="text-red-400 font-semibold">permanently delete</span> the entire backup folder
                                        <span className="text-white font-semibold"> "{deleteConfirm.folderName}"</span> and all its files?
                                    </>
                                ) : (
                                    <>
                                        Are you sure you want to <span className="text-red-400 font-semibold">permanently delete</span> the file
                                        <span className="text-white font-semibold"> "{deleteConfirm.filename}"</span>?
                                    </>
                                )}
                            </p>
                            <p className="text-red-400 text-sm bg-red-500/10 p-3 rounded-lg flex items-center gap-2">
                                <span className="material-symbols-outlined text-lg">warning</span>
                                This action cannot be undone. The file(s) will be permanently removed.
                            </p>
                        </div>
                        <div className="px-6 py-4 border-t border-border-dark flex justify-end gap-3">
                            <button
                                onClick={() => setDeleteConfirm({ show: false, type: '', folderName: '', filename: '' })}
                                className="px-4 py-2 rounded-lg border border-border-dark text-white font-medium hover:bg-background-dark transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={deleteConfirm.type === 'folder' ? handleDeleteFolder : handleDeleteFile}
                                className="px-4 py-2 rounded-lg bg-red-500 text-white font-bold hover:bg-red-600 transition-colors flex items-center gap-2"
                            >
                                <span className="material-symbols-outlined text-lg">delete_forever</span>
                                Delete Permanently
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </SuperUserLayout>
    );
}
