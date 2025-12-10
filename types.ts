export interface ScannedItem {
  productName: string;
  price: number;
  category?: string; // Ex: "refrigerante", "pasta_dente"
  measureValue?: number; // Ex: 90
  measureUnit?: string; // Ex: "g", "ml", "kg", "un"
}

export interface CartItem extends ScannedItem {
  id: string;
  quantity: number;
}

export interface ShoppingListItem {
  id: string;
  name: string;
  isChecked: boolean; // Manual check
}

export interface AnalysisState {
  isAnalyzing: boolean;
  error: string | null;
}