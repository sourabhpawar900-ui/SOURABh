
import React, { useRef } from 'react';

interface EditorAreaProps {
  currentImage: string | null;
  isProcessing: boolean;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error: string | null;
}

const EditorArea: React.FC<EditorAreaProps> = ({ currentImage, isProcessing, onImageUpload, error }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex-1 relative flex flex-col p-8 overflow-hidden">
      {/* Background patterns */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
      
      <div className="flex-1 flex items-center justify-center relative">
        {!currentImage ? (
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="max-w-md w-full aspect-video border-2 border-dashed border-slate-700 rounded-3xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-blue-500 hover:bg-slate-800/30 transition-all group"
          >
            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center group-hover:scale-110 transition-transform">
              <i className="fas fa-cloud-upload-alt text-2xl text-slate-400 group-hover:text-blue-400"></i>
            </div>
            <div className="text-center">
              <p className="text-lg font-medium text-slate-300">Upload your image</p>
              <p className="text-sm text-slate-500">Drag and drop or click to browse</p>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={onImageUpload} 
              accept="image/*" 
              className="hidden" 
            />
          </div>
        ) : (
          <div className="relative max-w-full max-h-full flex items-center justify-center p-4">
            <div className={`relative rounded-2xl overflow-hidden shadow-2xl shadow-black/50 transition-all ${isProcessing ? 'opacity-50 blur-sm active-process border-2' : ''}`}>
              <img 
                src={currentImage} 
                alt="Workspace" 
                className="max-w-full max-h-[70vh] object-contain rounded-xl"
              />
              
              {isProcessing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                    <span className="text-white font-medium bg-black/40 px-4 py-1 rounded-full backdrop-blur-md">Applying Edits...</span>
                  </div>
                </div>
              )}
            </div>
            
            {error && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-500/90 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 shadow-lg z-50">
                <i className="fas fa-exclamation-circle"></i>
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      {currentImage && (
        <div className="mt-4 flex justify-center">
           <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            Real-time Monitoring Active
          </p>
        </div>
      )}
    </div>
  );
};

export default EditorArea;
