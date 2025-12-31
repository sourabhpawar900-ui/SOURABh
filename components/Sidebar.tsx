
import React from 'react';
import { EditHistoryItem } from '../types';

interface SidebarProps {
  history: EditHistoryItem[];
  onSelectHistory: (item: EditHistoryItem) => void;
  onClearHistory: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ history, onSelectHistory, onClearHistory }) => {
  return (
    <div className="w-80 h-full flex flex-col glass-panel border-r border-slate-700/50">
      <div className="p-6 border-b border-slate-700/50 flex justify-between items-center">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <i className="fas fa-history text-blue-400"></i>
          History
        </h2>
        {history.length > 0 && (
          <button 
            onClick={onClearHistory}
            className="text-xs text-slate-400 hover:text-red-400 transition-colors"
          >
            Clear All
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {history.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center px-4">
            <i className="fas fa-layer-group text-4xl mb-4 opacity-20"></i>
            <p className="text-sm">Your edit history will appear here.</p>
          </div>
        ) : (
          history.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelectHistory(item)}
              className="w-full text-left group bg-slate-800/40 hover:bg-slate-700/50 border border-slate-700/50 rounded-xl p-3 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <div className="relative aspect-square w-full mb-2 rounded-lg overflow-hidden bg-slate-900">
                <img 
                  src={item.imageUrl} 
                  alt={item.prompt} 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-xs text-white bg-blue-600 px-2 py-1 rounded">View</span>
                </div>
              </div>
              <p className="text-xs text-slate-300 font-medium truncate mb-1">
                {item.prompt}
              </p>
              <p className="text-[10px] text-slate-500">
                {new Date(item.timestamp).toLocaleTimeString()}
              </p>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default Sidebar;
