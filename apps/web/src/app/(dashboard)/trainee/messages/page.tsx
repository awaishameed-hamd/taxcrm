'use client'
import { Suspense } from 'react'
import ChatPage from '@/components/chat/ChatPage'
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ChatPage />
    </Suspense>
  )
}
