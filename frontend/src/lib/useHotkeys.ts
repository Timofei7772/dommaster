import { useEffect } from 'react'

export function useGlobalHotkeys() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in a textarea or is focused on an input/select
      const activeEl = document.activeElement as HTMLElement
      const isInput = activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA' || activeEl?.tagName === 'SELECT'
      // exception: we might want Ctrl+F to always jump to a search input if one exists on the page
      
      // Ctrl + N (New)
      if (e.ctrlKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        // Broadcast custom event for "NewItem"
        window.dispatchEvent(new CustomEvent('cmd-new'))
      }
      
      // Ctrl + F (Search)
      if (e.ctrlKey && e.key.toLowerCase() === 'f') {
        // Find input with type search or placeholder containing 'поиск' (Search)
        const searchInput = document.querySelector('input[type="search"], input[placeholder*="оиск"], input[name="search"]') as HTMLElement
        if (searchInput) {
          e.preventDefault() // prevent browser search
          searchInput.focus()
        }
      }
      
      // Esc to blur or to broadcast close modal
      if (e.key === 'Escape') {
        if (isInput) activeEl.blur()
        window.dispatchEvent(new CustomEvent('cmd-esc'))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
