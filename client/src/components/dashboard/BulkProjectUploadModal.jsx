import { useState } from 'react';
import api from '../../services/api.js';

export default function BulkProjectUploadModal({ isOpen, onClose, onUploadSuccess }) {
    const [file, setFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadResults, setUploadResults] = useState(null);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleDownloadTemplate = async () => {
        try {
            const response = await api.get('/projects/template', {
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'Project_Bulk_Upload_Template.xlsx');
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            console.error('Failed to download template:', err);
            setError('Failed to download template. Please try again.');
        }
    };

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile && (selectedFile.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || selectedFile.name.endsWith('.xlsx'))) {
            setFile(selectedFile);
            setError('');
        } else {
            setError('Please select a valid Excel file (.xlsx)');
            setFile(null);
        }
    };

    const handleUpload = async () => {
        if (!file) return;

        try {
            setIsUploading(true);
            setError('');
            const formData = new FormData();
            formData.append('file', file);

            const res = await api.post('/api/projects/bulk', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            setUploadResults(res.data.summary);
            if (res.data.summary.success.length > 0) {
                onUploadSuccess();
            }
        } catch (err) {
            console.error('Upload failed:', err);
            setError(err.response?.data?.message || 'Failed to upload projects. Please check your file format.');
        } finally {
            setIsUploading(false);
        }
    };

    const resetModal = () => {
        setFile(null);
        setUploadResults(null);
        setError('');
        setIsUploading(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={resetModal}></div>
            
            <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">upload_file</span>
                        Bulk Project Upload
                    </h2>
                    <button onClick={resetModal} className="text-text-secondary hover:text-white transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto max-h-[75vh]">
                    {!uploadResults ? (
                        <div className="space-y-6">
                            {/* Step 1: Download */}
                            <div className="bg-background-dark/50 p-4 rounded-xl border border-border-dark border-dashed">
                                <h3 className="text-white font-medium mb-2 flex items-center gap-2">
                                    <span className="text-primary font-bold">1.</span> Download Template
                                </h3>
                                <p className="text-text-secondary text-sm mb-4">
                                    Use our standardized Excel template to ensure all project details are formatted correctly.
                                </p>
                                <button 
                                    onClick={handleDownloadTemplate}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-dark border border-border-dark text-white text-sm font-medium hover:bg-background-dark transition-all"
                                >
                                    <span className="material-symbols-outlined text-base">download</span>
                                    Download Excel Template
                                </button>
                            </div>

                            {/* Step 2: Upload */}
                            <div className="bg-background-dark/50 p-4 rounded-xl border border-border-dark">
                                <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                                    <span className="text-primary font-bold">2.</span> Upload Completed File
                                </h3>
                                
                                <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${file ? 'border-primary/50 bg-primary/5' : 'border-border-dark hover:border-primary/30'}`}>
                                    <input 
                                        type="file" 
                                        id="bulk-upload-input"
                                        className="hidden" 
                                        accept=".xlsx"
                                        onChange={handleFileChange}
                                    />
                                    <label htmlFor="bulk-upload-input" className="cursor-pointer">
                                        <span className={`material-symbols-outlined text-4xl mb-2 ${file ? 'text-primary' : 'text-text-secondary'}`}>
                                            {file ? 'task' : 'cloud_upload'}
                                        </span>
                                        {file ? (
                                            <div className="space-y-1">
                                                <p className="text-white font-medium">{file.name}</p>
                                                <p className="text-text-secondary text-xs">{(file.size / 1024).toFixed(1)} KB</p>
                                                <button onClick={(e) => { e.preventDefault(); setFile(null); }} className="text-red-400 text-xs hover:underline mt-2">Remove file</button>
                                            </div>
                                        ) : (
                                            <div>
                                                <p className="text-white font-medium">Click to select or drag & drop</p>
                                                <p className="text-text-secondary text-xs mt-1">Only .xlsx files are supported</p>
                                            </div>
                                        )}
                                    </label>
                                </div>
                            </div>

                            {error && (
                                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
                                    <span className="material-symbols-outlined text-base">error</span>
                                    {error}
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-2">
                                <button 
                                    onClick={resetModal}
                                    className="px-4 py-2 rounded-lg text-white font-medium hover:bg-surface-dark transition-colors"
                                >
                                    Cancel
                                </button>
                                <button 
                                    disabled={!file || isUploading}
                                    onClick={handleUpload}
                                    className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-gradient-primary text-white font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] transition-all"
                                >
                                    {isUploading ? (
                                        <><span className="material-symbols-outlined animate-spin">sync</span>Processing...</>
                                    ) : (
                                        <><span className="material-symbols-outlined">rocket_launch</span>Import Projects</>
                                    )}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="text-center py-4">
                                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-500 mb-4">
                                    <span className="material-symbols-outlined text-4xl">check_circle</span>
                                </div>
                                <h3 className="text-xl font-bold text-white">Import Complete</h3>
                                <p className="text-text-secondary">
                                    Successfully imported {uploadResults.success.length} projects.
                                </p>
                            </div>

                            {/* Success List */}
                            {uploadResults.success.length > 0 && (
                                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                                    <h4 className="text-emerald-400 text-xs font-bold uppercase tracking-wider mb-3">Successfully Created</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                        {uploadResults.success.map((p, idx) => (
                                            <div key={idx} className="flex items-center gap-2 text-sm bg-background-dark/50 p-2 rounded-lg border border-emerald-500/10">
                                                <span className="text-emerald-500 material-symbols-outlined text-base">done</span>
                                                <span className="text-white truncate">{p.name}</span>
                                                <span className="text-text-secondary text-[10px] font-mono ml-auto">{p.projectCode}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Error List */}
                            {uploadResults.errors.length > 0 && (
                                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                                    <h4 className="text-red-400 text-xs font-bold uppercase tracking-wider mb-3">Failed Rows ({uploadResults.errors.length})</h4>
                                    <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                        {uploadResults.errors.map((err, idx) => (
                                            <div key={idx} className="flex items-start gap-3 text-sm bg-background-dark/50 p-3 rounded-lg border border-red-500/10">
                                                <div className="bg-red-500/20 text-red-400 px-2 rounded font-bold text-xs mt-0.5">Row {err.row}</div>
                                                <div className="flex-1">
                                                    <p className="text-white font-medium mb-0.5">{err.name}</p>
                                                    <p className="text-red-400/80 text-xs">{err.error}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <button 
                                onClick={resetModal}
                                className="w-full py-3 rounded-xl bg-surface-dark border border-border-dark text-white font-bold hover:bg-background-dark transition-all"
                            >
                                Done
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
