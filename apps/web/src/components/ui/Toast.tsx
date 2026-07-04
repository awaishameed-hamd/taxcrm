'use client'

import { useEffect } from 'react'
import { cn } from '@/lib/utils'

interface ToastProps {
  message:  string
  type?:    'success' | 'error' | 'info'
  onClose:  () => void
  duration?: number
}

export default function Toast({ message, type = 'info', onClose, duration = 3500 }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, duration)
    return () => clearTimeout(t)
  }, [onClose, duration])

  const styles = {
    success: 'bg-emerald-600 border-emerald-500',
    error:   'bg-red-600 border-red-500',
    info:    'bg-[#1B2A4A] border-[#0E7C86]',
  }

  const icons = {
    success: '✓',
    error:   '✕',
    info:    'i',
  }

  return (
    <div className={cn(
      'fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl text-white text-sm font-medium',
      'animate-in slide-in-from-bottom-4 duration-200',
      styles[type],
    )}>
      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white/20 text-xs font-bold">
        {icons[type]}
      </span>
      {message}
      <button onClick={onClose} className="ml-2 text-white/60 hover:text-white text-xs">✕</button>
    </div>
  )
}
