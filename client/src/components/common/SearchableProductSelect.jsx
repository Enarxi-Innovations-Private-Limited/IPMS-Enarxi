import React, { useState, useEffect, useRef } from 'react';

export default function SearchableProductSelect({ products, value, onChange, placeholder = "Select Product", required = false }) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredProducts, setFilteredProducts] = useState([]);
    const wrapperRef = useRef(null);

    // Initialize/Update search term based on selected value
    useEffect(() => {
        if (value) {
            const selected = products.find(p => (p._id || p.id) === value);
            if (selected) {
                setSearchTerm(selected.name);
            }
        } else {
            setSearchTerm('');
        }
    }, [value, products]);

    // Handle clicking outside to close
    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
                // If closed without selection and text doesn't match selected, reset text
                if (value) {
                    const selected = products.find(p => (p._id || p.id) === value);
                    if (selected && searchTerm !== selected.name) {
                        setSearchTerm(selected.name);
                    }
                } else {
                    setSearchTerm('');
                }
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [wrapperRef, value, products, searchTerm]);

    // Filter products
    useEffect(() => {
        if (!isOpen) {
            setFilteredProducts(products);
            return;
        }

        const term = searchTerm.toLowerCase();
        const filtered = products.filter(p => {
            const name = (p.name || '').toLowerCase();
            const part = (p.partNumber || '').toLowerCase();
            const brand = (p.brand || '').toLowerCase();
            const footprint = (p.footprint || '').toLowerCase();

            return name.includes(term) || part.includes(term) || brand.includes(term) || footprint.includes(term);
        });

        // Sort: Exact matches first, then partial
        filtered.sort((a, b) => {
            const aName = (a.name || '').toLowerCase();
            const bName = (b.name || '').toLowerCase();
            if (aName === term) return -1;
            if (bName === term) return 1;
            return 0;
        });

        setFilteredProducts(filtered.slice(0, 50)); // Limit to 50 results for performance
    }, [searchTerm, products, isOpen]);

    const handleSelect = (product) => {
        onChange(product._id || product.id);
        setSearchTerm(product.name);
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={wrapperRef}>
            <div className="relative">
                <input
                    type="text"
                    className="w-full px-4 py-2 bg-surface-light border border-border-dark rounded-lg text-white focus:outline-none focus:border-primary pl-10"
                    placeholder={placeholder}
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setIsOpen(true);
                        // Optional: clear selection if user modifies text? 
                        // For now we keep value until new selection, or maybe clear it?
                        // Better to clear it so validation knows no valid product is selected
                        if (value) onChange('');
                    }}
                    onFocus={() => setIsOpen(true)}
                    required={required && !value} // Only required if no value selected
                />
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-lg">
                    search
                </span>
                {value && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onChange('');
                            setSearchTerm('');
                            setIsOpen(true);
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-white"
                        title="Clear selection"
                    >
                        <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                )}
            </div>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-surface-dark border border-border-dark rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    {filteredProducts.length > 0 ? (
                        filteredProducts.map(product => {
                            const isOutOfStock = product.quantity <= 0;
                            return (
                                <button
                                    key={product._id || product.id}
                                    type="button"
                                    onClick={() => !isOutOfStock && handleSelect(product)}
                                    disabled={isOutOfStock}
                                    className={`w-full text-left p-3 hover:bg-surface-light border-b border-border-dark/50 last:border-0 transition-colors flex justify-between items-start group ${isOutOfStock ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <div>
                                        <div className="font-medium text-white group-hover:text-primary transition-colors">
                                            {product.name}
                                        </div>
                                        <div className="text-xs text-text-secondary mt-0.5 flex gap-2">
                                            {product.partNumber && <span className="bg-surface-light px-1.5 py-0.5 rounded border border-border-dark">{product.partNumber}</span>}
                                            {product.brand && <span>{product.brand}</span>}
                                            {product.footprint && <span>{product.footprint}</span>}
                                        </div>
                                    </div>
                                    <div className={`text-xs font-medium px-2 py-1 rounded ${isOutOfStock ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                                        {isOutOfStock ? 'Out of Stock' : `${product.quantity} left`}
                                    </div>
                                </button>
                            );
                        })
                    ) : (
                        <div className="p-4 text-center text-text-secondary text-sm">
                            No products found matching "{searchTerm}"
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
