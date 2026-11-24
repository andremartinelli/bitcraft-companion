'use client'

import { Input, type InputProps } from '@chakra-ui/react'

interface CommitInputProps extends Omit<InputProps, 'value' | 'defaultValue' | 'onBlur'> {
  /** The saved value; "" for none */
  value: string
  /** Called with the new text when it changed: on leaving the field, or Enter */
  onCommit: (value: string) => void
}

/**
 * A number field that recalculates only when the user is done with it (on
 * leaving it, or Enter), like the old form's "change" event. Give it a `key`
 * with the saved value, so a new value from the server resets it.
 */
export function CommitInput({ value, onCommit, onKeyDown, ...props }: CommitInputProps) {
  return (
    <Input
      type="number"
      inputMode="numeric"
      defaultValue={value}
      onBlur={(event) => {
        if (event.currentTarget.value !== value) onCommit(event.currentTarget.value)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        onKeyDown?.(event)
      }}
      {...props}
    />
  )
}
