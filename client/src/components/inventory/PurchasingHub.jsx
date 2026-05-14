import { useState, useEffect } from 'react';
import { usePortalLayout } from '../../services/usePortalLayout';
import api from '../../services/api';

export default function PurchasingHub() {
    const Layout = usePortalLayout();
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [columns, setColumns] = useState([]);
    const [mapping, setMapping] = useState({ component: '', quantity: '', vendors: [] });
    const [results, setResults] = useState(null);
    const [progress, setProgress] = useState(0);
    const [progressStatus, setProgressStatus] = useState('');

    useEffect(() => {
        fetchSession();
    }, []);

    const fetchSession = async () => {
        try {
            const response = await fetch('http://localhost:8000/session');
            const data = await response.json();
            if (data.has_data) {
                setColumns(data.columns || []);
                setMapping(prev => ({
                    component: data.detected?.component || prev.component,
                    quantity: data.detected?.quantity || prev.quantity,
                    vendors: data.detected?.vendors || ["ROBU", "EVELTA", "KTRON", "SHARVI"]
                }));
                setResults(data.results);
                setProcessing(data.processing);
                if (data.processing) {
                    setProgress(50);
                    setProgressStatus("Resume processing...");
                }
            }
        } catch (err) {
            console.error("Error fetching session:", err);
        }
    };

    const handleFileChange = (e) => {
        setFile(e.target.files[0]);
    };

    const uploadFile = async () => {
        if (!file) return alert("Please select a file first!");
        
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            setUploading(true);
            // We use direct hit to BOM server for now, or proxy via PM server
            const response = await fetch('http://localhost:8000/upload', { 
                method: 'POST', 
                body: formData 
            });
            const data = await response.json();
            
            if (response.ok) {
                setColumns(data.columns);
                const firstCol = data.columns[0] || '';
                const secondCol = data.columns[1] || firstCol;
                
                setMapping({
                    component: data.detected.component || firstCol,
                    quantity: data.detected.quantity || (data.columns.includes('QUANTITY') ? 'QUANTITY' : secondCol),
                    vendors: data.detected.vendors || ["ROBU", "EVELTA", "KTRON", "SHARVI"]
                });
            } else {
                alert(data.detail || "Upload failed");
            }
        } catch (err) {
            console.error(err);
            alert("Error connecting to BOM server. Ensure it is running.");
        } finally {
            setUploading(false);
        }
    };

    const processBOM = async () => {
        const formData = new FormData();
        formData.append('mapping', JSON.stringify(mapping));
        
        try {
            setProcessing(true);
            setResults(null);
            setProgress(0);
            setProgressStatus("Waking up vendor scouts...");
            console.log("Starting Async Process with Mapping:", mapping);

            const response = await fetch('http://localhost:8000/process', { 
                method: 'POST', 
                body: formData 
            });
            
            if (!response.ok) throw new Error("Could not start process");

            // Start polling for results
            const pollInterval = setInterval(async () => {
                try {
                    const sessionRes = await fetch('http://localhost:8000/session');
                    const sessionData = await sessionRes.json();
                    
                    if (!sessionData.processing && sessionData.results) {
                        setResults(sessionData.results);
                        setProcessing(false);
                        setProgress(100);
                        setProgressStatus("Optimization Complete!");
                        clearInterval(pollInterval);
                    } else if (sessionData.processing) {
                        // Slowly move progress bar while waiting
                        setProgress(prev => (prev < 95 ? prev + 0.5 : prev));
                        setProgressStatus("Scouting vendors & adding to carts...");
                    }
                } catch (err) {
                    console.error("Polling error:", err);
                }
            }, 3000);

        } catch (err) {
            console.error(err);
            alert("Could not start processing. Ensure BOM server is connected.");
            setProcessing(false);
        }
    };

    const handleVendorToggle = (vendor) => {
        setMapping(prev => {
            const currentVendors = prev.vendors || [];
            const vendors = currentVendors.includes(vendor)
                ? currentVendors.filter(v => v !== vendor)
                : [...currentVendors, vendor];
            return { ...prev, vendors };
        });
    };

    return (
        <Layout currentPage="purchase-bom">
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    {/* Header */}
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-white tracking-tight mb-1 flex items-center gap-3">
                            <span className="material-symbols-outlined text-violet-400 text-4xl">bolt</span>
                            Purchasing Hub
                        </h1>
                        <div className="flex items-center gap-4">
                            <p className="text-text-secondary">AI-Powered BOM Price Evaluation & Optimization Engine.</p>
                            {columns.length > 0 && (
                                <button 
                                    onClick={async () => {
                                        await fetch('http://localhost:8000/clear', { method: 'POST' });
                                        window.location.reload();
                                    }}
                                    className="text-[10px] font-black text-rose-400 uppercase tracking-widest hover:text-rose-300 transition-colors flex items-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-sm">delete_sweep</span>
                                    Clear Session
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Left Column: Input */}
                        <div className="lg:col-span-1 space-y-6">
                            {/* Step 1: Upload */}
                            <div className="bg-surface-dark border border-border-dark rounded-2xl p-6 shadow-xl">
                                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                    <span className="text-violet-400 font-black">01</span>
                                    Upload BOM
                                </h2>
                                <div className="space-y-4">
                                    <div className="border-2 border-dashed border-border-dark rounded-xl p-6 text-center hover:border-violet-500/50 transition-colors group">
                                        <input type="file" id="bom-upload" className="hidden" onChange={handleFileChange} accept=".xlsx,.xls" />
                                        <label htmlFor="bom-upload" className="cursor-pointer">
                                            <span className="material-symbols-outlined text-4xl text-text-secondary group-hover:text-violet-400 transition-colors mb-2">cloud_upload</span>
                                            <p className="text-sm text-text-secondary font-medium">{file ? file.name : "Select Excel BOM"}</p>
                                        </label>
                                    </div>
                                    <button 
                                        onClick={uploadFile}
                                        disabled={uploading || !file}
                                        className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {uploading ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : <span className="material-symbols-outlined">analytics</span>}
                                        {uploading ? "Analyzing..." : "Analyze Columns"}
                                    </button>
                                </div>
                            </div>

                            {/* Step 2: Mapping */}
                            {columns.length > 0 && (
                                <div className="bg-surface-dark border border-border-dark rounded-2xl p-6 shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                        <span className="text-violet-400 font-black">02</span>
                                        Configure
                                    </h2>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary mb-1 block">Component Column</label>
                                            <select 
                                                value={mapping.component}
                                                onChange={(e) => setMapping({...mapping, component: e.target.value})}
                                                className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-violet-500"
                                            >
                                                {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary mb-1 block">Quantity Column</label>
                                            <select 
                                                value={mapping.quantity}
                                                onChange={(e) => setMapping({...mapping, quantity: e.target.value})}
                                                className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-violet-500"
                                            >
                                                {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary mb-2 block">Target Vendors</label>
                                            <div className="grid grid-cols-2 gap-2">
                                                {["ROBU", "EVELTA", "KTRON", "SHARVI"].map(v => (
                                                    <button 
                                                        key={v}
                                                        onClick={() => handleVendorToggle(v)}
                                                        className={`px-3 py-2 rounded-lg border text-xs font-bold transition-all ${mapping.vendors.includes(v) ? 'bg-violet-500/20 border-violet-500 text-violet-400' : 'bg-background-dark border-border-dark text-text-secondary hover:border-violet-500/30'}`}
                                                    >
                                                        {v}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="pt-4">
                                            {processing && (
                                                <div className="mb-4">
                                                    <div className="flex justify-between text-[10px] font-bold text-violet-400 mb-1 uppercase tracking-tighter">
                                                        <span>{progressStatus}</span>
                                                        <span>{Math.round(progress)}%</span>
                                                    </div>
                                                    <div className="w-full bg-background-dark h-1.5 rounded-full overflow-hidden">
                                                        <div className="bg-violet-500 h-full transition-all duration-300" style={{width: `${progress}%`}}></div>
                                                    </div>
                                                </div>
                                            )}
                                            <button 
                                                onClick={processBOM}
                                                disabled={processing}
                                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-xl transition-all shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2 group disabled:opacity-50"
                                            >
                                                <span className={`material-symbols-outlined ${processing ? 'animate-spin' : 'group-hover:scale-125 transition-transform'}`}>rocket_launch</span>
                                                {processing ? "PROCESSING..." : "OPTIMIZE PRICES"}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Right Column: Results */}
                        <div className="lg:col-span-2">
                            {results ? (
                                <div className="bg-surface-dark border border-border-dark rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-500">
                                    <div className="p-6 border-b border-border-dark flex items-center justify-between bg-background-dark/30">
                                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                            <span className="material-symbols-outlined text-emerald-400">task_alt</span>
                                            Evaluation Results
                                        </h2>
                                        <a 
                                            href="http://localhost:8000/export"
                                            className="bg-background-dark border border-border-dark hover:border-violet-500/50 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
                                        >
                                            <span className="material-symbols-outlined text-sm">download</span>
                                            Export Excel
                                        </a>
                                    </div>

                                    {/* Stats Summary */}
                                    <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4 bg-background-dark/10">
                                        <div className="bg-violet-500/5 border border-violet-500/20 p-4 rounded-xl">
                                            <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest mb-1">Total Savings</p>
                                            <p className="text-xl font-black text-white">{results.optimized_total}</p>
                                        </div>
                                        {Object.entries(results.vendor_totals).map(([v, t]) => (
                                            <div key={v} className="bg-surface-dark border border-border-dark p-4 rounded-xl">
                                                <p className="text-[10px] font-black text-text-secondary uppercase tracking-widest mb-1">{v} Hub</p>
                                                <p className="text-lg font-bold text-white">{t}</p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Table */}
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-background-dark/50 text-[10px] font-black text-text-secondary uppercase tracking-widest">
                                                    <th className="px-6 py-4 border-b border-border-dark">Component</th>
                                                    <th className="px-6 py-4 border-b border-border-dark text-center">Qty</th>
                                                    <th className="px-6 py-4 border-b border-border-dark">Best Vendor</th>
                                                    <th className="px-6 py-4 border-b border-border-dark text-right">Price</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border-dark">
                                                {results.items.map((item, idx) => (
                                                    <tr key={idx} className="hover:bg-white/5 transition-colors group">
                                                        <td className="px-6 py-4">
                                                            <div className="text-sm font-bold text-white">{item.component}</div>
                                                            <div className="text-[10px] text-text-secondary">AI Predicted Match</div>
                                                        </td>
                                                        <td className="px-6 py-4 text-center">
                                                            <span className="bg-background-dark px-2 py-1 rounded-md text-xs font-mono text-white">{item.qty}</span>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-2">
                                                                <span className="size-2 rounded-full bg-emerald-500"></span>
                                                                <span className="text-sm font-medium text-emerald-400">{item.best_vendor || "None Found"}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <div className="text-sm font-black text-white">{item.best_price}</div>
                                                            <div className="text-[10px] text-text-secondary">Total: {item.total_amt}</div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-border-dark rounded-2xl">
                                    <span className="material-symbols-outlined text-6xl text-border-dark mb-4">search_insights</span>
                                    <h3 className="text-xl font-bold text-white mb-2">No Analysis Active</h3>
                                    <p className="text-text-secondary max-w-sm">Upload a Bill of Materials (BOM) to begin the multi-vendor pricing optimization process.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
