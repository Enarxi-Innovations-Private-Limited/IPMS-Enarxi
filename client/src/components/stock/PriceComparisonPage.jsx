import { useState } from 'react';
import StockAdminLayout from '../common/StockAdminLayout';
import api from '../../services/api';

export default function PriceComparisonPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [searched, setSearched] = useState(false);

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchTerm.trim()) return;

        setLoading(true);
        setError('');
        setResults([]);
        setSearched(true);

        try {
            const response = await api.post('/stock/price-comparison', { query: searchTerm });
            setResults(response.data.results);
        } catch (err) {
            console.error('Search error:', err);
            // Show specific message from backend if available (e.g. "Product not in Stock List")
            setError(err.response?.data?.error || err.response?.data?.message || 'Failed to fetch prices');
        } finally {
            setLoading(false);
        }
    };

    // Helper to get dealer badge color
    const getDealerColor = (dealer) => {
        const colors = {
            'Evelta': 'bg-blue-500/20 text-blue-400',
            'Ktron': 'bg-purple-500/20 text-purple-400',
            'Robu': 'bg-orange-500/20 text-orange-400',
            'Sharvi Electronics': 'bg-green-500/20 text-green-400'
        };
        return colors[dealer] || 'bg-gray-500/20 text-gray-400';
    };

    return (
        <StockAdminLayout currentPage="price-comparison">
            <div className="p-8">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">Price Comparison</h1>
                    <p className="text-text-secondary">Compare prices across multiple dealers (Evelta, Ktron, Robu, Sharvi)</p>
                </div>

                {/* Search Bar */}
                <div className="bg-surface-dark border border-border-dark rounded-xl p-6 mb-8">
                    <form onSubmit={handleSearch} className="flex gap-4">
                        <div className="flex-1">
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Enter product name (e.g. Arduino Uno, 100 Ohm Resistor)..."
                                className="w-full px-4 py-3 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary text-lg"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading || !searchTerm.trim()}
                            className="px-8 py-3 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
                        >
                            {loading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    Searching...
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined">search</span>
                                    Compare Prices
                                </>
                            )}
                        </button>
                    </form>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 flex items-center gap-3">
                        <span className="material-symbols-outlined">error</span>
                        {error}
                    </div>
                )}

                {/* Results */}
                {searched && (
                    <div className="bg-surface-dark border border-border-dark rounded-xl overflow-hidden">
                        <div className="p-6 border-b border-border-dark flex justify-between items-center">
                            <h2 className="text-xl font-bold text-white">
                                {loading ? 'Searching dealers...' : `Found ${results.length} results`}
                            </h2>
                            {!loading && results.length > 0 && (
                                <span className="text-sm text-text-secondary">
                                    Best Price: <span className="text-green-400 font-bold">{results.sort((a, b) => parseFloat(a.price.replace(/[^\d.]/g, '')) - parseFloat(b.price.replace(/[^\d.]/g, '')))[0]?.price}</span>
                                </span>
                            )}
                        </div>

                        {results.length === 0 && !loading ? (
                            <div className="p-12 text-center">
                                <span className="material-symbols-outlined text-4xl text-text-secondary mb-4">search_off</span>
                                <p className="text-text-secondary text-lg">No products found for "{searchTerm}"</p>
                                <p className="text-text-secondary text-sm mt-2">Try a different search term or check specific part numbers.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-border-dark bg-surface-light/50">
                                            <th className="text-left p-4 text-text-secondary font-medium">Dealer</th>
                                            <th className="text-left p-4 text-text-secondary font-medium">Product Name</th>
                                            <th className="text-left p-4 text-text-secondary font-medium">Price</th>
                                            <th className="text-left p-4 text-text-secondary font-medium">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {results.map((item, index) => (
                                            <tr key={index} className="border-b border-border-dark hover:bg-surface-light transition-colors group">
                                                <td className="p-4">
                                                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getDealerColor(item.dealer)}`}>
                                                        {item.dealer}
                                                    </span>
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex items-center gap-3">
                                                        {item.image && (
                                                            <div className="w-10 h-10 rounded bg-white p-1 flex-shrink-0">
                                                                <img src={item.image} alt="" className="w-full h-full object-contain" />
                                                            </div>
                                                        )}
                                                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-white hover:text-primary transition-colors font-medium">
                                                            {item.title}
                                                        </a>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-white font-bold text-lg">{item.price}</td>
                                                <td className="p-4">
                                                    <a
                                                        href={item.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="px-3 py-1.5 bg-primary/20 text-primary border border-primary/20 rounded hover:bg-primary/30 transition-colors text-sm font-medium inline-flex items-center gap-1"
                                                    >
                                                        Visit Site
                                                        <span className="material-symbols-outlined text-xs">open_in_new</span>
                                                    </a>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </StockAdminLayout>
    );
}
