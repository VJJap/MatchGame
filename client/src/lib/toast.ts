import { useSyncExternalStore } from 'react';

// One toast stack for the whole site (both games share it).

export type ToastTone = 'info' | 'success' | 'warn' | 'error';
export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

let toasts: Toast[] = [];
let nextId = 0;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

export function toast(text: string, tone: ToastTone = 'info', ms = 3600): void {
  const id = ++nextId;
  toasts = [...toasts.slice(-2), { id, text, tone }];
  notify();
  setTimeout(() => dismissToast(id), ms);
}

export function dismissToast(id: number): void {
  if (!toasts.some((t) => t.id === id)) return;
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => toasts,
  );
}
