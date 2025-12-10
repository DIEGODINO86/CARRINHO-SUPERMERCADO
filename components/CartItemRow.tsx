import React, { useState, useEffect } from 'react';
import { CartItem } from '../types';

interface CartItemRowProps {
  item: CartItem;
  isBestValue?: boolean;
  isInWishlist?: boolean;
  onUpdate: (id: string, updates: Partial<CartItem>) => void;
  onRemove: (id: string) => void;
}

export const CartItemRow: React.FC<CartItemRowProps> = ({ item, isBestValue, isInWishlist, onUpdate, onRemove }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempName, setTempName] = useState(item.productName);

  // Sync temp name if prop changes externally
  useEffect(() => {
    setTempName(item.productName);
  }, [item.productName]);

  const handleIncrement = () => {
    onUpdate(item.id, { quantity: item.quantity + 1 });
  };

  const handleDecrement = () => {
    if (item.quantity > 1) {
      onUpdate(item.id, { quantity: item.quantity - 1 });
    } else {
      onRemove(item.id);
    }
  };

  const handleNameBlur = () => {
    setIsEditing(false);
    if (tempName.trim() !== item.productName) {
      onUpdate(item.id, { productName: tempName });
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Helper to display unit info (e.g. "90g")
  const unitDisplay = item.measureValue && item.measureUnit 
    ? `${item.measureValue}${item.measureUnit}` 
    : null;

  // Calculate unit price for display if available
  const pricePerUnitDisplay = item.measureValue && item.measureUnit && item.measureValue > 0
    ? `${formatCurrency(item.price / item.measureValue)}/${item.measureUnit}`
    : null;

  return (
    <div className={`relative bg-white p-4 rounded-2xl shadow-sm border transition-all hover:shadow-md flex flex-col gap-3 ${isBestValue ? 'border-l-4 border-l-green-500 border-y-gray-100 border-r-gray-100' : 'border-gray-100'}`}>
      
      {/* Header do Card: Badges e Nome */}
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1">
          {/* Badges Area */}
          <div className="flex gap-2 mb-1.5 flex-wrap">
            {isBestValue && (
              <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                Melhor Custo
              </span>
            )}
            {isInWishlist && (
              <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                Na Lista
              </span>
            )}
            {unitDisplay && (
               <span className="bg-gray-100 text-gray-500 text-[10px] font-medium px-2 py-0.5 rounded-full">
                 {unitDisplay}
               </span>
            )}
          </div>

          {/* Product Name */}
          {isEditing ? (
            <input
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={(e) => e.key === 'Enter' && handleNameBlur()}
              autoFocus
              className="w-full text-base font-semibold text-gray-800 border-b-2 border-brand-500 focus:outline-none bg-transparent"
            />
          ) : (
            <h3 
              onClick={() => setIsEditing(true)}
              className="text-base font-semibold text-gray-800 leading-tight cursor-text active:text-brand-600"
            >
              {item.productName}
            </h3>
          )}
           
           {/* Unit Price Subtext */}
           <div className="flex items-center gap-2 mt-1">
             <span className="text-xs text-gray-400">
               {formatCurrency(item.price)} un.
               {pricePerUnitDisplay && ` • (${pricePerUnitDisplay})`}
             </span>
           </div>
        </div>
      </div>

      {/* Footer do Card: Controles e Total */}
      <div className="flex items-center justify-between border-t border-gray-50 pt-3 mt-1">
        
        {/* Quantity Controls */}
        <div className="flex items-center bg-gray-50 rounded-lg p-0.5 border border-gray-100">
          <button 
            onClick={handleDecrement}
            className="w-8 h-8 flex items-center justify-center text-brand-600 hover:bg-white hover:shadow-sm rounded-md transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14"/></svg>
          </button>
          <span className="w-8 text-center font-semibold text-gray-700 text-sm">{item.quantity}</span>
          <button 
            onClick={handleIncrement}
            className="w-8 h-8 flex items-center justify-center text-brand-600 hover:bg-white hover:shadow-sm rounded-md transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>

        {/* Item Total */}
        <div className="text-right">
          <span className="block text-xs text-gray-400 font-medium uppercase tracking-wide">Total Item</span>
          <span className="text-lg font-bold text-gray-900">{formatCurrency(item.price * item.quantity)}</span>
        </div>
      </div>
    </div>
  );
};