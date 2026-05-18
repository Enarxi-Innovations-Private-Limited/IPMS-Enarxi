import { useState, useEffect, useRef } from 'react';
import { usePortalLayout } from '../../services/usePortalLayout';
import api from '../../services/api';
import { useNotifier } from '../common/AppNotificationProvider.jsx';

export default function PurchasingHub() {
    const Layout = usePortalLayout();
    const { error: notifyError, success: notifySuccess, info: notifyInfo } = useNotifier();
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [columns, setColumns] = useState([]);
    const [mapping, setMapping] = useState({ component: '', quantity: '', vendors: ["ROBU", "EVELTA", "KTRON", "SHARVI"] });
    const [results, setResults] = useState(null);
    const [progress, setProgress] = useState(0);
    const [progressStatus, setProgressStatus] = useState('');
    const pollIntervalRef = useRef(null);

    useEffect(() => {
        fetchSession();
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, []);

    const fetchSession = async () => {
        try {
            // Proxied via main server
            const response = await api.get('/bom/progress');
            const data = response.data;
            
            if (data.is_running) {
                setProcessing(true);
                setProgress(data.percent);
                setProgressStatus(data.status);
                startPolling();
            }
        } catch (err) {
            console.error("Error fetching BOM session:", err);
        }
    };

    const startPolling = () => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        
        pollIntervalRef.current = setInterval(async () => {
            try {
                const response = await api.get('/bom/progress');
                const data = response.data;
                
                setProgress(data.percent);
                setProgressStatus(data.status);

                if (!data.is_running && data.percent === 100) {
                    clearInterval(pollIntervalRef.current);
                    setProcessing(false);
                    // Fetch results if complete
                    const res = await api.post('/bom/process', { mapping: JSON.stringify(mapping) });
                    setResults(res.data);
                } else if (!data.is_running && data.percent === 0 && progress > 0) {
                     // Error case or reset
                     clearInterval(pollIntervalRef.current);
                     setProcessing(false);
                }
            } catch (err) {
                console.error("Polling error:", err);
                clearInterval(pollIntervalRef.current);
                setProcessing(false);
            }
        }, 2000);
    };

    const handleFileChange = (e) => {
        setFile(e.target.files[0]);
    };

    const uploadFile = async () => {
        if (!file) {
            notifyError('Please select a file first.');
            return;
        }
        
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            setUploading(true);
            const response = await api.post('/bom/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            const data = response.data;
            
            setColumns(data.columns || []);
            setMapping(prev => ({
                ...prev,
                component: data.detected.component || data.columns[0] || '',
                quantity: data.detected.quantity || data.columns[1] || ''
            }));
            setResults(null);
            setProgress(0);
        } catch (err) {
            console.error(err);
            notifyError(err.response?.data?.message || "Error connecting to BOM server via proxy. Ensure the service is running.");
        } finally {
            setUploading(false);
        }
    };

    const pullShortages = async () => {
        try {
            setUploading(true);
            const response = await api.post('/inventory/shortages/send-to-bom');
            const payload = response.data;
            const data = payload.bomPreview;

            if (!data) {
                setColumns([]);
                setResults(null);
                setProgress(0);
                notifyInfo(payload.message || 'No active purchase demand found in the queue.');
                return;
            }
            
            setColumns(data.columns || []);
            setMapping(prev => ({
                ...prev,
                component: data.detected.component || 'component',
                quantity: data.detected.quantity || 'qty'
            }));
            setResults(null);
            setProgress(0);
            notifySuccess(`Successfully pulled ${data.preview?.length || 0} items from purchase demand.`);
        } catch (err) {
            console.error(err);
            notifyError(err.response?.data?.message || "Failed to pull purchase demand.");
        } finally {
            setUploading(false);
        }
    };

    const processBOM = async () => {
        try {
            setProcessing(true);
            setResults(null);
            setProgress(0);
            setProgressStatus("Initializing optimization...");

            await api.post('/bom/process', { mapping });
            startPolling();

        } catch (err) {
            console.error(err);
            notifyError(err.response?.data?.message || "Could not start processing. Ensure BOM server is connected.");
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

    const handleExport = () => {
        // Direct download via proxied endpoint
        const token = localStorage.getItem('token');
        const url = `${api.defaults.baseURL}/bom/export?token=${token}`;
        window.open(url, '_blank');
    };

    return (
        <Layout currentPage="purchase-bom">
            <div className="p-4 lg:px-12 pb-24 bg-[#ECF1FF] min-h-screen">
                <div className="max-w-7xl mx-auto w-full">
                    {/* Header */}
                    <div className="mb-8">
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-3xl font-bold text-[#556070] tracking-tight mb-1 flex items-center gap-3">
                                    <span className="material-symbols-outlined text-violet-500 text-4xl">bolt</span>
                                    Purchasing Hub
                                </h1>
                                <p className="text-[#556070]/70 font-medium">Production-Grade BOM Evaluation & Multi-Vendor Optimization Engine.</p>
                            </div>
                            
                            {columns.length > 0 && (
                                <button 
                                    onClick={() => window.location.reload()}
                                    className="px-4 py-2 bg-white border border-slate-200 text-[#556070] rounded-xl text-xs font-bold shadow-sm hover:shadow-md transition-all flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-sm text-rose-500">restart_alt</span>
                                    Reset Hub
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Left Column: Input */}
                        <div className="lg:col-span-1 space-y-6">
                            {/* Step 1: Input Source */}
                            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                                <h2 className="text-lg font-bold text-[#556070] mb-4 flex items-center gap-2">
                                    <span className="size-6 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-xs">1</span>
                                    Input Source
                                </h2>
                                
                                <div className="space-y-4">
                                    <button 
                                        onClick={pullShortages}
                                        disabled={uploading || processing}
                                        className="w-full bg-[#ECF1FF] hover:bg-[#D9E4FF] text-violet-700 font-bold py-4 rounded-2xl transition-all flex flex-col items-center justify-center gap-1 border border-violet-200 group"
                                    >
                                        <span className="material-symbols-outlined text-3xl group-hover:scale-110 transition-transform">inventory_2</span>
                                        <span className="text-sm">Pull from Purchase Queue</span>
                                    </button>

                                    <div className="relative py-2 flex items-center">
                                        <div className="flex-grow border-t border-slate-100"></div>
                                        <span className="flex-shrink mx-4 text-[10px] font-black text-slate-300 uppercase tracking-widest">OR</span>
                                        <div className="flex-grow border-t border-slate-100"></div>
                                    </div>

                                    <div className="border-2 border-dashed border-slate-100 rounded-2xl p-4 text-center hover:border-violet-500/30 transition-colors group relative">
                                        <input type="file" id="bom-upload" className="hidden" onChange={handleFileChange} accept=".xlsx,.xls" />
                                        <label htmlFor="bom-upload" className="cursor-pointer flex flex-col items-center">
                                            <span className="material-symbols-outlined text-3xl text-slate-300 group-hover:text-violet-400 transition-colors mb-1">upload_file</span>
                                            <p className="text-xs text-[#556070] font-bold">{file ? file.name : "Upload Excel BOM"}</p>
                                        </label>
                                    </div>

                                    <button 
                                        onClick={uploadFile}
                                        disabled={uploading || !file || processing}
                                        className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {uploading ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> : <span className="material-symbols-outlined text-sm">analytics</span>}
                                        {uploading ? "Analyzing..." : "Analyze File"}
                                    </button>
                                </div>
                            </div>

                            {/* Step 2: Configuration */}
                            {columns.length > 0 && (
                                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <h2 className="text-lg font-bold text-[#556070] mb-4 flex items-center gap-2">
                                        <span className="size-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs">2</span>
                                        Configure Engine
                                    </h2>
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest text-[#556070]/60 mb-1 block ml-1">Component</label>
                                                <select 
                                                    value={mapping.component}
                                                    onChange={(e) => setMapping({...mapping, component: e.target.value})}
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-[#556070] outline-none focus:ring-2 focus:ring-violet-500 font-medium"
                                                >
                                                    {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest text-[#556070]/60 mb-1 block ml-1">Quantity</label>
                                                <select 
                                                    value={mapping.quantity}
                                                    onChange={(e) => setMapping({...mapping, quantity: e.target.value})}
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-[#556070] outline-none focus:ring-2 focus:ring-violet-500 font-medium"
                                                >
                                                    {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-[#556070]/60 mb-2 block ml-1">Active Scrapers</label>
                                            <div className="grid grid-cols-2 gap-2">
                                                {["ROBU", "EVELTA", "KTRON", "SHARVI"].map(v => (
                                                    <button 
                                                        key={v}
                                                        onClick={() => handleVendorToggle(v)}
                                                        className={`px-3 py-2 rounded-xl border text-[11px] font-black transition-all flex items-center justify-between ${mapping.vendors.includes(v) ? 'bg-violet-600 border-violet-600 text-white shadow-lg shadow-violet-200' : 'bg-white border-slate-200 text-[#556070] hover:border-violet-400'}`}
                                                    >
                                                        {v}
                                                        {mapping.vendors.includes(v) && <span className="material-symbols-outlined text-xs">check_circle</span>}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="pt-4 border-t border-slate-50">
                                            {processing && (
                                                <div className="mb-4">
                                                    <div className="flex justify-between text-[10px] font-black text-violet-500 mb-1.5 uppercase tracking-widest">
                                                        <span>{progressStatus}</span>
                                                        <span>{Math.round(progress)}%</span>
                                                    </div>
                                                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                                                        <div className="bg-gradient-to-r from-violet-500 to-fuchsia-500 h-full transition-all duration-500 ease-out" style={{width: `${progress}%`}}></div>
                                                    </div>
                                                </div>
                                            )}
                                            <button 
                                                onClick={processBOM}
                                                disabled={processing}
                                                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-4 rounded-2xl transition-all shadow-xl shadow-emerald-200 flex items-center justify-center gap-3 group disabled:opacity-50"
                                            >
                                                <span className={`material-symbols-outlined ${processing ? 'animate-spin' : 'group-hover:rotate-12 transition-transform'}`}>
                                                    {processing ? 'sync' : 'auto_awesome'}
                                                </span>
                                                {processing ? "RUNNING OPTIMIZATION..." : "START PRICE EVALUATION"}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Right Column: Results */}
                        <div className="lg:col-span-2">
                            {results ? (
                                <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden animate-in fade-in zoom-in-95 duration-500">
                                    <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-white">
                                        <div>
                                            <h2 className="text-xl font-bold text-[#556070] flex items-center gap-2">
                                                Optimization Report
                                            </h2>
                                            <p className="text-xs text-[#556070]/60 font-medium">Analysis complete for {results.items?.length || 0} line items.</p>
                                        </div>
                                        <button 
                                            onClick={handleExport}
                                            className="bg-[#ECF1FF] hover:bg-[#D9E4FF] text-violet-700 px-5 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center gap-2 border border-violet-100"
                                        >
                                            <span className="material-symbols-outlined text-sm">download</span>
                                            Export to Excel
                                        </button>
                                    </div>

                                    {/* Financial Dashboard */}
                                    <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50/50 border-b border-slate-100">
                                        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
                                            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Optimized Total</p>
                                            <p className="text-xl font-black text-[#556070]">₹{results.optimized_total}</p>
                                        </div>
                                        {Object.entries(results.vendor_totals).map(([v, t]) => (
                                            <div key={v} className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
                                                <p className="text-[10px] font-black text-[#556070]/50 uppercase tracking-widest mb-1">{v} Total</p>
                                                <p className="text-lg font-bold text-[#556070]">₹{t}</p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Detailed Line Items */}
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-white text-[10px] font-black text-[#556070]/40 uppercase tracking-widest">
                                                    <th className="px-6 py-5 border-b border-slate-50">Line Item / Description</th>
                                                    <th className="px-6 py-5 border-b border-slate-50 text-center">Qty</th>
                                                    <th className="px-6 py-5 border-b border-slate-50">Allocated Vendor</th>
                                                    <th className="px-6 py-5 border-b border-slate-50 text-right">Unit Price</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {results.items.map((item, idx) => (
                                                    <tr key={idx} className="hover:bg-[#ECF1FF]/30 transition-colors group">
                                                        <td className="px-6 py-5">
                                                            <div className="text-sm font-bold text-[#556070] mb-0.5">{item.component}</div>
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-[10px] text-violet-500 font-black uppercase tracking-tighter bg-violet-50 px-1.5 rounded">Verified</span>
                                                                <span className="text-[10px] text-[#556070]/40 font-medium">Matched via Slug Optimization</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-5 text-center">
                                                            <span className="bg-slate-100 px-2.5 py-1 rounded-lg text-xs font-black text-[#556070]">{item.qty}</span>
                                                        </td>
                                                        <td className="px-6 py-5">
                                                            <div className="flex items-center gap-2">
                                                                <div className={`size-2 rounded-full ${item.best_vendor ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
                                                                <span className={`text-sm font-black ${item.best_vendor ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                                    {item.best_vendor || "OUT OF STOCK"}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-5 text-right">
                                                            <div className="text-sm font-black text-[#556070]">₹{item.best_price}</div>
                                                            <div className="text-[10px] font-bold text-emerald-500">Total: ₹{item.total_amt}</div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full min-h-[400px] flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-slate-200 rounded-[2rem] bg-white/50 backdrop-blur-sm">
                                    <div className="size-20 bg-[#ECF1FF] rounded-3xl flex items-center justify-center mb-6 shadow-sm">
                                        <span className="material-symbols-outlined text-4xl text-violet-400">query_stats</span>
                                    </div>
                                    <h3 className="text-xl font-bold text-[#556070] mb-2">Engine Idle</h3>
                                    <p className="text-[#556070]/60 max-w-sm font-medium leading-relaxed">
                                        Import data from the purchase demand queue or upload a manual BOM to trigger the AI price evaluator.
                                    </p>
                                    
                                    <div className="mt-8 grid grid-cols-3 gap-4 w-full max-w-lg">
                                        <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
                                            <span className="material-symbols-outlined text-violet-400 text-xl mb-2">radar</span>
                                            <p className="text-[10px] font-black text-[#556070] uppercase">Real-time Scrape</p>
                                        </div>
                                        <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
                                            <span className="material-symbols-outlined text-emerald-400 text-xl mb-2">calculate</span>
                                            <p className="text-[10px] font-black text-[#556070] uppercase">Price Matching</p>
                                        </div>
                                        <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
                                            <span className="material-symbols-outlined text-blue-400 text-xl mb-2">shopping_cart_checkout</span>
                                            <p className="text-[10px] font-black text-[#556070] uppercase">Cart Dispatch</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
