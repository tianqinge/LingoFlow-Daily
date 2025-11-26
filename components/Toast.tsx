import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastData {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastProps {
  toasts: ToastData[];
  removeToast: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[100] flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center gap-3 p-4 rounded-xl shadow-float border backdrop-blur-md animate-slide-in-top transition-all ${
            toast.type === 'success' ? 'bg-emerald-50/90 border-emerald-100 text-emerald-800' :
            toast.type === 'error' ? 'bg-red-50/90 border-red-100 text-red-800' :
            'bg-white/90 border-stone-100 text-stone-800'
          }`}
        >
          <div className={`flex-shrink-0 ${
             toast.type === 'success' ? 'text-emerald-500' :
             toast.type === 'error' ? 'text-red-500' :
             'text-primary'
          }`}>
            {toast.type === 'success' && <CheckCircle size={20} />}
            {toast.type === 'error' && <AlertCircle size={20} />}
            {toast.type === 'info' && <Info size={20} />}
          </div>
          
          <p className="flex-1 text-sm font-medium leading-tight">{toast.message}</p>
          
          <button 
            onClick={() => removeToast(toast.id)}
            className="p-1 hover:bg-black/5 rounded-full transition-colors opacity-50 hover:opacity-100"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};

// Hook-like helper for auto-dismissal logic
export const useToastAutoDismiss = (toasts: ToastData[], removeToast: (id: string) => void) => {
  useEffect(() => {
    if (toasts.length > 0) {
      const timer = setTimeout(() => {
        removeToast(toasts[0].id);
      }, 3000); // Auto dismiss after 3 seconds
      return () => clearTimeout(timer);
    }
  }, [toasts, removeToast]);
};