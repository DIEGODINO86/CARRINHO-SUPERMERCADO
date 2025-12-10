import React, { useState, useRef, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { CartItem, AnalysisState, ShoppingListItem } from './types';
import { analyzeProductImage, extractShoppingList } from './services/geminiService';
import { CartItemRow } from './components/CartItemRow';
import { LoadingSpinner } from './components/LoadingSpinner';

// Declaration for jsPDF loaded via CDN
declare global {
  interface Window {
    jspdf: any;
  }
}

const App: React.FC = () => {
  // Main Cart State
  const [items, setItems] = useState<CartItem[]>([]);
  const [status, setStatus] = useState<AnalysisState>({ isAnalyzing: false, error: null });
  const [analyzingProgress, setAnalyzingProgress] = useState<{ current: number; total: number } | null>(null);
  
  // Budget State
  const [budget, setBudget] = useState<number | null>(null);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [tempBudget, setTempBudget] = useState('');

  // Shopping List State
  const [shoppingList, setShoppingList] = useState<ShoppingListItem[]>([]);
  const [isShoppingListModalOpen, setIsShoppingListModalOpen] = useState(false);
  const [newListItemName, setNewListItemName] = useState('');
  const [isListAnalyzing, setIsListAnalyzing] = useState(false);

  // Manual Entry State
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [manualSize, setManualSize] = useState('');

  // Comparison Modal State
  const [isComparisonModalOpen, setIsComparisonModalOpen] = useState(false);

  // Input Refs
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const listImportInputRef = useRef<HTMLInputElement>(null);

  // --- Calculations ---
  const totalCost = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const isOverBudget = budget !== null && totalCost > budget;
  const budgetPercentage = budget ? Math.min((totalCost / budget) * 100, 100) : 0;
  const remainingBudget = budget ? budget - totalCost : 0;

  // --- Helpers ---
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Check if a list item is fulfilled by a cart item
  const isItemInCart = useCallback((listName: string) => {
    const normalizedList = listName.toLowerCase().trim();
    return items.some(item => item.productName.toLowerCase().includes(normalizedList));
  }, [items]);

  // Check if a cart item corresponds to a wish list item
  const isItemInWishlist = useCallback((cartName: string) => {
    const normalizedCart = cartName.toLowerCase();
    return shoppingList.some(listItem => normalizedCart.includes(listItem.name.toLowerCase().trim()));
  }, [shoppingList]);

  // --- Comparison Logic ---
  const comparisonGroups = useMemo<Record<string, CartItem[]>>(() => {
    const grouped: Record<string, CartItem[]> = {};
    items.forEach(item => {
      const cat = item.category ? item.category.toLowerCase().replace(/_/g, ' ') : 'outros';
      if (item.measureValue && item.measureUnit) {
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(item);
      }
    });
    Object.keys(grouped).forEach(key => {
      grouped[key].sort((a, b) => {
        const getBasePrice = (i: CartItem) => {
          let val = i.measureValue || 1;
          if (i.measureUnit === 'kg') val *= 1000;
          if (i.measureUnit === 'l') val *= 1000;
          return i.price / val;
        };
        return getBasePrice(a) - getBasePrice(b);
      });
    });
    return grouped;
  }, [items]);

  const bestValueIds = useMemo(() => {
    const ids = new Set<string>();
    Object.values(comparisonGroups).forEach((group: CartItem[]) => {
      if (group.length >= 2) ids.add(group[0].id);
    });
    return ids;
  }, [comparisonGroups]);

  // --- Handlers: File Upload ---
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setStatus({ isAnalyzing: true, error: null });
    setAnalyzingProgress({ current: 0, total: files.length });

    const newItems: CartItem[] = [];
    let errorMsg = null;

    for (let i = 0; i < files.length; i++) {
      setAnalyzingProgress({ current: i + 1, total: files.length });
      try {
        const result = await analyzeProductImage(files[i]);
        const newItem: CartItem = {
          id: uuidv4(),
          productName: result.productName,
          price: result.price,
          category: result.category,
          measureValue: result.measureValue,
          measureUnit: result.measureUnit,
          quantity: 1
        };
        newItems.push(newItem);
      } catch (error: any) {
        console.error(error);
        errorMsg = "Alguns arquivos não puderam ser processados.";
      }
    }

    setItems(prev => [...newItems, ...prev]);
    setStatus({ isAnalyzing: false, error: errorMsg });
    setAnalyzingProgress(null);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  // --- Handlers: Manual Item ---
  const handleAddManualItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim() || !manualPrice.trim()) return;

    const normalizedPrice = manualPrice.replace(',', '.');
    const priceValue = parseFloat(normalizedPrice);
    if (isNaN(priceValue)) { alert("Preço inválido."); return; }

    let mValue: number | undefined = undefined;
    let mUnit: string | undefined = undefined;
    if (manualSize.trim()) {
      const match = manualSize.match(/(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/);
      if (match) { mValue = parseFloat(match[1]); mUnit = match[2].toLowerCase(); }
    }

    const newItem: CartItem = {
      id: uuidv4(),
      productName: manualName.trim(),
      price: priceValue,
      quantity: 1,
      category: manualName.split(' ')[0].toLowerCase(),
      measureValue: mValue,
      measureUnit: mUnit
    };

    setItems(prev => [newItem, ...prev]);
    setManualName(''); setManualPrice(''); setManualSize('');
    setIsManualModalOpen(false);
  };

  const handleUpdateItem = useCallback((id: string, updates: Partial<CartItem>) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  }, []);

  const handleRemoveItem = useCallback((id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  // --- Handlers: Budget ---
  const handleSetBudget = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempBudget) {
        setBudget(null);
    } else {
        const val = parseFloat(tempBudget.replace(',', '.'));
        if (!isNaN(val)) setBudget(val);
    }
    setIsBudgetModalOpen(false);
  };

  // --- Handlers: Shopping List ---
  const handleAddShoppingListItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListItemName.trim()) return;
    const newItem: ShoppingListItem = {
      id: uuidv4(),
      name: newListItemName.trim(),
      isChecked: false
    };
    setShoppingList(prev => [...prev, newItem]);
    setNewListItemName('');
  };

  const handleToggleListItem = (id: string) => {
    setShoppingList(prev => prev.map(i => i.id === id ? { ...i, isChecked: !i.isChecked } : i));
  };

  const handleDeleteListItem = (id: string) => {
    setShoppingList(prev => prev.filter(i => i.id !== id));
  };

  const handleImportList = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsListAnalyzing(true);
    try {
      const names = await extractShoppingList(file);
      const newItems = names.map(name => ({
        id: uuidv4(),
        name,
        isChecked: false
      }));
      setShoppingList(prev => [...prev, ...newItems]);
    } catch (err) {
      alert("Erro ao ler lista.");
    } finally {
      setIsListAnalyzing(false);
      if (listImportInputRef.current) listImportInputRef.current.value = '';
    }
  };

  // --- Handlers: Global & Share & PDF ---
  const handleClearAll = () => {
    if (window.confirm("Limpar toda a lista?")) setItems([]);
  };

  const handleShareList = async () => {
    if (items.length === 0) return;

    const listText = items.map(item => 
      `${item.quantity}x ${item.productName} - ${formatCurrency(item.price * item.quantity)}`
    ).join('\n');

    const shareText = `🛒 *Lista SmartCart*\n\n${listText}\n\n💰 *Total: ${formatCurrency(totalCost)}*`;

    try {
        if (navigator.share) {
            await navigator.share({
                title: 'Minha Lista de Compras',
                text: shareText
            });
        } else {
            await navigator.clipboard.writeText(shareText);
            alert("Lista copiada para a área de transferência!");
        }
    } catch (error) {
        console.log('Erro ao compartilhar', error);
    }
  };

  const handleFinalize = () => {
    if (items.length === 0) return;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Title
    doc.setFontSize(18);
    doc.text("Relatório de Compras - SmartCart AI", 14, 20);
    doc.setFontSize(10);
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, 14, 26);

    // Summary Box
    doc.setDrawColor(200);
    doc.setFillColor(245, 245, 245);
    doc.rect(14, 32, 180, 25, 'FD');
    
    doc.setFontSize(11);
    doc.text("Resumo Financeiro:", 20, 40);
    
    doc.text(`Total Gasto: ${formatCurrency(totalCost)}`, 20, 48);
    if (budget !== null) {
        doc.text(`Limite da Carteira: ${formatCurrency(budget)}`, 100, 48);
        const diff = budget - totalCost;
        if (diff >= 0) {
             doc.setTextColor(0, 128, 0);
             doc.text(`Saldo / Economia: ${formatCurrency(diff)}`, 20, 54);
        } else {
             doc.setTextColor(200, 0, 0);
             doc.text(`Ultrapassou: ${formatCurrency(Math.abs(diff))}`, 20, 54);
        }
    } else {
        doc.text("Limite: Não definido", 100, 48);
    }
    doc.setTextColor(0, 0, 0); // Reset color

    // Table 1: Purchased Items
    doc.setFontSize(14);
    doc.text("Itens Comprados", 14, 70);
    
    const tableBody = items.map(item => [
        item.quantity.toString(),
        item.productName + (bestValueIds.has(item.id) ? ' (Melhor Custo)' : ''),
        formatCurrency(item.price),
        formatCurrency(item.price * item.quantity)
    ]);

    (doc as any).autoTable({
        startY: 75,
        head: [['Qtd', 'Produto', 'Preço Un.', 'Total']],
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [22, 163, 74] } // brand-600 color approx
    });

    // Calculate Missing Items
    const missingItems = shoppingList.filter(listItem => !isItemInCart(listItem.name));

    if (missingItems.length > 0) {
        const finalY = (doc as any).lastAutoTable.finalY || 100;
        doc.setFontSize(14);
        doc.text("Itens Faltantes (Da sua lista)", 14, finalY + 15);

        const missingBody = missingItems.map(i => [i.name]);
        
        (doc as any).autoTable({
            startY: finalY + 20,
            head: [['Produto Faltante']],
            body: missingBody,
            theme: 'grid',
            headStyles: { fillColor: [220, 38, 38] } // Red color
        });
    }

    doc.save(`smartcart_resumo_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  const triggerCamera = () => cameraInputRef.current?.click();
  const triggerGallery = () => galleryInputRef.current?.click();
  const triggerListImport = () => listImportInputRef.current?.click();

  // Reusable Component for Action Buttons
  const ActionButtons = ({ layout = "grid" }: { layout?: "grid" | "stack" }) => (
    <div className={layout === "grid" ? "grid grid-cols-4 gap-2 items-stretch" : "flex flex-col gap-3"}>
       {/* Manual */}
       <button 
          onClick={() => setIsManualModalOpen(true)}
          className={`flex flex-col items-center justify-center gap-1 rounded-xl active:bg-gray-100 py-2 text-gray-500 hover:text-brand-600 transition-colors ${layout === 'grid' ? 'col-span-1' : 'flex-row w-full justify-start px-4 hover:bg-gray-50 border border-gray-100'}`}
       >
           <div className={`bg-gray-100 p-2 rounded-lg text-gray-600 ${layout === 'stack' ? 'bg-transparent' : ''}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
           </div>
           <span className={`${layout === 'grid' ? 'text-[10px] font-bold' : 'text-sm font-medium'}`}>Manual</span>
       </button>

       {/* Upload */}
       <button 
          onClick={triggerGallery}
          disabled={status.isAnalyzing}
          className={`flex flex-col items-center justify-center gap-1 rounded-xl active:bg-gray-100 py-2 text-gray-500 hover:text-brand-600 transition-colors ${layout === 'grid' ? 'col-span-1' : 'flex-row w-full justify-start px-4 hover:bg-gray-50 border border-gray-100'}`}
       >
           <div className={`bg-gray-100 p-2 rounded-lg text-gray-600 ${layout === 'stack' ? 'bg-transparent' : ''}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
           </div>
           <span className={`${layout === 'grid' ? 'text-[10px] font-bold' : 'text-sm font-medium'}`}>Arquivo / PDF</span>
       </button>

       {/* Camera (Big Button) */}
       <button 
          onClick={triggerCamera}
          disabled={status.isAnalyzing}
          className={`bg-brand-600 active:bg-brand-700 text-white rounded-2xl shadow-lg shadow-brand-200 flex flex-col items-center justify-center gap-1 transform transition-transform active:scale-95 ${layout === 'grid' ? 'col-span-2' : 'w-full py-4 order-first'}`}
       >
           {status.isAnalyzing ? (
               <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
           ) : (
               <div className="flex items-center gap-2">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  <span className="font-bold text-sm">Escanear Produto</span>
               </div>
           )}
       </button>
    </div>
  );

  // Reusable Budget Display
  const BudgetSummary = () => (
     <div 
        onClick={() => { setTempBudget(budget ? budget.toString() : ''); setIsBudgetModalOpen(true); }}
        className="cursor-pointer group"
    >
         <div className="flex justify-between items-end mb-2">
            <div>
               <span className="text-xs uppercase font-bold text-gray-400 tracking-wider block mb-1">Total Carrinho</span>
               <span className="text-3xl font-bold text-gray-900 leading-none">{formatCurrency(totalCost)}</span>
            </div>
            <div className="text-right">
                <div className="flex items-center justify-end gap-1.5 text-xs uppercase font-bold text-gray-400 tracking-wider mb-1">
                    <span>{budget ? 'Disponível' : 'Limite'}</span>
                    <svg className="text-gray-300 group-hover:text-brand-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </div>
                {budget ? (
                     <span className={`text-xl font-bold ${remainingBudget < 0 ? 'text-red-500' : 'text-brand-600'}`}>
                        {remainingBudget < 0 ? '-' : ''}{formatCurrency(Math.abs(remainingBudget))}
                     </span>
                ) : (
                    <span className="text-sm font-medium text-brand-600 bg-brand-50 px-2 py-1 rounded-md">Definir</span>
                )}
            </div>
         </div>

         {/* Progress Bar */}
         {budget && (
             <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                 <div 
                    className={`h-full transition-all duration-500 ${isOverBudget ? 'bg-red-500' : 'bg-brand-500'}`} 
                    style={{ width: `${budgetPercentage}%` }}
                 />
             </div>
         )}
         {!budget && <div className="h-2 bg-gray-100 rounded-full"></div>}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      
      {/* --- HEADER RESPONSIVO --- */}
      <header className="bg-brand-600 text-white sticky top-0 z-30 shadow-lg lg:static">
        <div className="max-w-6xl mx-auto px-4 lg:px-6 py-4 lg:py-6">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="bg-white/20 p-2.5 rounded-xl backdrop-blur-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                    </div>
                    <div>
                    <h1 className="text-xl lg:text-2xl font-bold tracking-tight leading-none">SmartCart</h1>
                    <span className="text-brand-200 text-xs lg:text-sm font-medium">Seu assistente de economia</span>
                    </div>
                </div>
                
                <div className="flex gap-2">
                    {Object.keys(comparisonGroups).length > 0 && (
                         <button onClick={() => setIsComparisonModalOpen(true)} className="hidden lg:flex bg-brand-700/50 hover:bg-brand-700/70 text-white text-sm px-4 py-2.5 rounded-full items-center gap-2 backdrop-blur-sm border border-brand-500/30 transition-all mr-2">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
                            Comparar Preços
                        </button>
                    )}

                    <button
                        onClick={() => setIsShoppingListModalOpen(true)}
                        className="bg-brand-500 hover:bg-brand-400 p-2.5 lg:px-4 lg:py-2.5 rounded-full lg:rounded-xl transition-colors shadow-sm text-white relative flex items-center gap-2"
                        title="Minha Lista"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                        <span className="hidden lg:inline font-medium">Minha Lista</span>
                        {shoppingList.length > 0 && <span className="absolute top-0 right-0 w-3 h-3 bg-red-400 rounded-full border-2 border-brand-600"></span>}
                    </button>
                    {items.length > 0 && (
                    <>
                        <button
                            onClick={handleShareList}
                            className="bg-brand-500 hover:bg-brand-400 p-2.5 rounded-full transition-colors shadow-sm text-white"
                            title="Compartilhar"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                        </button>
                        <button 
                            onClick={handleFinalize} 
                            className="bg-brand-500 hover:bg-brand-400 p-2.5 rounded-full transition-colors shadow-sm text-white"
                            title="Gerar PDF"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                        </button>
                        <button onClick={handleClearAll} className="bg-brand-700 hover:bg-brand-800 p-2.5 rounded-full shadow-sm text-brand-200 hover:text-white" title="Limpar">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </>
                    )}
                </div>
            </div>
             {/* Mobile Only: Compare Button below header */}
             {Object.keys(comparisonGroups).length > 0 && (
                <div className="mt-4 flex justify-center lg:hidden">
                    <button onClick={() => setIsComparisonModalOpen(true)} className="bg-brand-700/50 hover:bg-brand-700/70 text-white text-xs px-4 py-1.5 rounded-full flex items-center gap-1.5 backdrop-blur-sm border border-brand-500/30 transition-all">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
                        Ver Comparativo de Preços
                    </button>
                </div>
            )}
        </div>
      </header>

      {/* --- LAYOUT GRID (WEBSITE FORMAT) --- */}
      <div className="flex-1 max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 lg:p-8">
        
        {/* LEFT COLUMN: CONTENT (Scan Results) */}
        <main className="lg:col-span-8 space-y-4">
            {/* Error Feedback */}
            {status.error && (
            <div className="bg-white border-l-4 border-red-500 shadow-sm p-4 rounded-r-xl flex items-start gap-3 animate-fadeIn">
                <div className="text-red-500 mt-0.5"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
                <div>
                    <h4 className="font-bold text-gray-800 text-sm">Atenção</h4>
                    <p className="text-gray-600 text-xs mt-0.5">{status.error}</p>
                </div>
            </div>
            )}

            {/* Loading State */}
            {status.isAnalyzing && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center animate-fadeIn">
                <LoadingSpinner />
                {analyzingProgress && <p className="text-xs font-medium text-gray-500 mt-3 uppercase tracking-wide">Processando {analyzingProgress.current} de {analyzingProgress.total}</p>}
            </div>
            )}

            {/* Empty State */}
            {!status.isAnalyzing && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-6 bg-white rounded-3xl border border-dashed border-gray-200 lg:h-96">
                <div className="bg-gray-50 p-6 rounded-full">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                </div>
                <div>
                <h3 className="text-gray-900 font-bold text-xl mb-1">Seu carrinho está vazio</h3>
                <p className="text-gray-500 text-sm max-w-xs mx-auto leading-relaxed">Adicione produtos usando a câmera, enviando arquivos ou digitando manualmente.</p>
                </div>
            </div>
            )}

            {/* Items List */}
            <div className="space-y-3 pb-24 lg:pb-0">
            {items.map(item => (
                <div key={item.id} className="animate-scaleIn">
                <CartItemRow 
                    item={item} 
                    isBestValue={bestValueIds.has(item.id)}
                    isInWishlist={isItemInWishlist(item.productName)}
                    onUpdate={handleUpdateItem} 
                    onRemove={handleRemoveItem} 
                />
                </div>
            ))}
            </div>
        </main>

        {/* RIGHT COLUMN: SIDEBAR (Controls for Desktop) */}
        <aside className="hidden lg:block lg:col-span-4 space-y-6">
            <div className="sticky top-24 space-y-6">
                {/* Dashboard Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
                    <BudgetSummary />
                    <hr className="border-gray-100"/>
                    <ActionButtons layout="stack" />
                </div>

                {/* Info Card */}
                {items.length > 0 && (
                     <div className="bg-brand-50 rounded-2xl p-6 border border-brand-100 text-brand-800">
                         <h4 className="font-bold flex items-center gap-2 mb-2">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                            Dica
                         </h4>
                         <p className="text-sm opacity-90">Você pode comparar preços clicando no botão "Comparar Preços" no topo ou gerar um relatório PDF para seu controle.</p>
                     </div>
                )}
            </div>
        </aside>

      </div>

      {/* --- BOTTOM NAV (MOBILE ONLY) --- */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-40 pb-safe lg:hidden">
        <div className="px-6 py-3 border-b border-gray-100 bg-gray-50/50">
             <BudgetSummary />
        </div>
        <div className="p-3">
            <ActionButtons layout="grid" />
        </div>
      </div>

      {/* Hidden File Inputs */}
      <input type="file" ref={cameraInputRef} onChange={handleFileChange} accept="image/*" capture="environment" className="hidden" />
      <input type="file" ref={galleryInputRef} onChange={handleFileChange} accept="image/*,application/pdf" multiple className="hidden" />
      <input type="file" ref={listImportInputRef} onChange={handleImportList} accept="image/*,application/pdf" className="hidden" />

      {/* MODAL: Manual Item */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-scaleIn">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Adicionar Manualmente</h3>
            <form onSubmit={handleAddManualItem} className="space-y-3">
              <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Nome do Produto</label>
                  <input type="text" value={manualName} onChange={e => setManualName(e.target.value)} className="w-full border-b-2 border-gray-200 focus:border-brand-500 py-2 text-lg outline-none bg-transparent" placeholder="Ex: Arroz 5kg" autoFocus />
              </div>
              <div className="flex gap-4 pt-2">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Preço (R$)</label>
                    <input type="number" step="0.01" value={manualPrice} onChange={e => setManualPrice(e.target.value)} className="w-full border-b-2 border-gray-200 focus:border-brand-500 py-2 text-lg outline-none bg-transparent" placeholder="0,00" inputMode="decimal" />
                  </div>
                  <div className="flex-1">
                     <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Medida (Opcional)</label>
                     <input type="text" value={manualSize} onChange={e => setManualSize(e.target.value)} className="w-full border-b-2 border-gray-200 focus:border-brand-500 py-2 text-lg outline-none bg-transparent" placeholder="90g" />
                  </div>
              </div>
              <div className="flex gap-3 pt-6">
                <button type="button" onClick={() => setIsManualModalOpen(false)} className="flex-1 py-3 text-gray-500 font-semibold hover:bg-gray-50 rounded-xl">Cancelar</button>
                <button type="submit" className="flex-1 py-3 bg-brand-500 text-white rounded-xl font-semibold shadow-lg hover:bg-brand-600">Adicionar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Budget */}
      {isBudgetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl w-full max-w-xs p-6 shadow-2xl animate-scaleIn">
            <h3 className="text-lg font-bold text-gray-800 mb-1">Definir Limite</h3>
            <p className="text-gray-500 text-xs mb-6">Quanto você pretende gastar hoje?</p>
            <form onSubmit={handleSetBudget}>
                <div className="relative mb-8">
                    <span className="absolute left-0 top-1 text-gray-400 font-bold text-sm">R$</span>
                    <input 
                      type="number" 
                      step="0.01" 
                      value={tempBudget} 
                      onChange={e => setTempBudget(e.target.value)} 
                      placeholder="0,00"
                      className="w-full pl-6 pr-0 py-0 text-4xl font-bold text-brand-600 border-b-2 border-gray-200 focus:border-brand-500 focus:outline-none bg-transparent"
                      autoFocus
                    />
                </div>
                <div className="flex flex-col gap-2">
                  <button type="submit" className="w-full py-3 bg-brand-500 text-white rounded-xl font-bold shadow-md">Salvar Limite</button>
                  <button type="button" onClick={() => { setBudget(null); setIsBudgetModalOpen(false); }} className="w-full py-3 text-red-500 text-sm font-semibold">Remover Limite</button>
                </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Shopping List */}
      {isShoppingListModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-3xl shadow-2xl flex flex-col h-[85vh] sm:h-[600px] animate-slideUp">
            
            {/* Modal Header */}
            <div className="p-5 border-b flex justify-between items-center">
                <div>
                    <h3 className="text-xl font-bold text-gray-800">Minha Lista</h3>
                    <p className="text-xs text-gray-500">O que não posso esquecer</p>
                </div>
                <button onClick={() => setIsShoppingListModalOpen(false)} className="bg-gray-100 p-2 rounded-full text-gray-500 hover:bg-gray-200"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            
            {/* List Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50/50">
                {isListAnalyzing && <div className="text-center py-8"><LoadingSpinner /><p className="text-xs text-gray-500 mt-2">Lendo sua lista...</p></div>}
                
                {!isListAnalyzing && shoppingList.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 space-y-2">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                        <p className="text-sm">Sua lista está vazia.</p>
                    </div>
                )}

                {shoppingList.map(item => {
                    const inCart = isItemInCart(item.name);
                    return (
                        <div key={item.id} className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${inCart ? 'bg-blue-50/50 border-blue-200 shadow-sm' : 'bg-white border-gray-100 shadow-sm'}`}>
                            <div className="flex items-center gap-3 overflow-hidden flex-1">
                                <button onClick={() => handleToggleListItem(item.id)} className={`w-5 h-5 flex-shrink-0 rounded border flex items-center justify-center transition-colors ${item.isChecked ? 'bg-gray-400 border-gray-400 text-white' : 'border-gray-300 bg-white'}`}>
                                    {item.isChecked && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                                </button>
                                <span className={`truncate font-medium text-sm ${item.isChecked ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{item.name}</span>
                            </div>
                            <div className="flex items-center gap-3 pl-2">
                                {inCart && <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-md">COMPRADO</span>}
                                <button onClick={() => handleDeleteListItem(item.id)} className="text-gray-300 hover:text-red-400 p-1"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* List Footer Actions */}
            <div className="p-4 bg-white border-t space-y-3">
                <form onSubmit={handleAddShoppingListItem} className="flex gap-2">
                    <input 
                        type="text" 
                        value={newListItemName}
                        onChange={e => setNewListItemName(e.target.value)}
                        placeholder="Digitar item (ex: Leite)" 
                        className="flex-1 bg-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
                    />
                    <button type="submit" className="bg-brand-500 text-white p-3 rounded-xl hover:bg-brand-600 shadow-md"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
                </form>
                <button onClick={triggerListImport} className="w-full py-3 bg-white border border-brand-100 text-brand-600 font-bold text-sm rounded-xl flex items-center justify-center gap-2 hover:bg-brand-50 transition-colors">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    Escanear Lista de Papel
                </button>
            </div>
          </div>
        </div>
      )}

      {/* Comparison Modal */}
      {isComparisonModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
             <div className="flex justify-between items-center mb-6">
                 <h3 className="text-xl font-bold text-gray-800">Melhores Preços</h3>
                 <button onClick={() => setIsComparisonModalOpen(false)} className="bg-gray-100 p-1.5 rounded-full text-gray-500"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
             </div>
             {Object.keys(comparisonGroups).length === 0 ? <p className="text-gray-500">Adicione produtos com pesos/medidas para comparar.</p> : (
                 Object.entries(comparisonGroups).map(([cat, grpItems]: [string, CartItem[]]) => {
                     if (grpItems.length === 0) return null;
                     return (
                         <div key={cat} className="mb-6 last:mb-0">
                             <h4 className="font-bold capitalize text-sm text-gray-500 mb-2 border-b pb-1">{cat}</h4>
                             {grpItems.map((item, idx) => {
                                 const unitPrice = item.measureValue ? item.price / item.measureValue : 0;
                                 const isBest = idx === 0 && grpItems.length > 1;
                                 return (
                                     <div key={item.id} className={`flex justify-between items-center p-3 text-sm rounded-xl mb-2 ${isBest ? 'bg-green-50 border border-green-200' : 'bg-gray-50'}`}>
                                         <div className="flex items-center gap-2">
                                            {isBest && <span className="text-lg">🏆</span>}
                                            <span className={`font-medium ${isBest ? 'text-green-800' : 'text-gray-700'}`}>{item.productName}</span>
                                         </div>
                                         <div className="text-right">
                                             <div className="font-bold">{formatCurrency(item.price)}</div>
                                             {unitPrice > 0 && <div className="text-[10px] text-gray-500">{formatCurrency(unitPrice)}/{item.measureUnit}</div>}
                                         </div>
                                     </div>
                                 )
                             })}
                         </div>
                     )
                 })
             )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;