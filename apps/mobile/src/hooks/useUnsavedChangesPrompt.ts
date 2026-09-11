import { useBlocker } from "@tanstack/react-router"
import { useCallback, useRef } from "react"

type UseUnsavedChangesPromptArgs = {
  /* whether the form holds changes that would be lost by navigating away */
  hasUnsavedChanges: boolean
}

/*
 * Blocks navigation away from a form with unsaved changes - including the
 * cancel button, the hardware back button, and closing the browser tab - until
 * the user confirms they want to discard them.
 */
export const useUnsavedChangesPrompt = ({
  hasUnsavedChanges,
}: UseUnsavedChangesPromptArgs) => {
  // refs so that the blocker registration stays stable across renders
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges)
  hasUnsavedChangesRef.current = hasUnsavedChanges
  const allowNavigationRef = useRef(false)

  const shouldBlockFn = useCallback(
    () => hasUnsavedChangesRef.current && !allowNavigationRef.current,
    [],
  )

  const { status, proceed, reset } = useBlocker({
    shouldBlockFn,
    enableBeforeUnload: shouldBlockFn,
    withResolver: true,
  })

  // call before navigating away deliberately, eg. after a successful save
  const allowNavigation = useCallback(() => {
    allowNavigationRef.current = true
  }, [])

  return {
    isPromptOpen: status === "blocked",
    discardChanges: proceed,
    keepEditing: reset,
    allowNavigation,
  }
}
