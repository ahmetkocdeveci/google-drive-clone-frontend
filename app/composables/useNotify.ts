export function useNotify() {
  const messages = useState<Array<{ id: number; message: string; type: 'success' | 'error' | 'info' }>>('drive-notifications', () => [])
  function notify(message: string, type: 'success' | 'error' | 'info' = 'success') {
    const id = Date.now() + Math.random()
    messages.value = [...messages.value.slice(-2), { id, message, type }]
    setTimeout(() => { messages.value = messages.value.filter(item => item.id !== id) }, 5000)
  }
  return { messages, notify }
}
