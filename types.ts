
export interface EditHistoryItem {
  id: string;
  imageUrl: string;
  prompt: string;
  timestamp: number;
}

export interface AppState {
  originalImage: string | null;
  currentImage: string | null;
  history: EditHistoryItem[];
  isProcessing: boolean;
  prompt: string;
  error: string | null;
}
