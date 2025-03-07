import { useState, useCallback } from "react"

export interface UseOpenClose {
  isOpen: boolean
  open: () => void
  setIsOpen: (isOpen: boolean) => void
  close: () => void
  toggle: () => void
}

const useOpenClose = (initialState: boolean = false): UseOpenClose => {
  const [isOpen, setIsOpen] = useState(initialState)

  const open = useCallback(() => {
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  return {
    isOpen,
    open,
    close,
    toggle,
    setIsOpen,
  }
}

export default useOpenClose
