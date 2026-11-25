'use client'

import { Button, type ButtonProps } from '@chakra-ui/react'
import { useState } from 'react'
import { LuCheck, LuLink } from 'react-icons/lu'

/** The full address of an invite's link, in the browser */
export const inviteUrl = (token: string) =>
  new URL(`/invites/${token}`, window.location.origin).href

/** "Copiar link" of an invite; where the clipboard is blocked, the link shows to copy by hand */
export function CopyInviteLink({ token, ...props }: { token: string } & ButtonProps) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    const url = inviteUrl(token)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copie o link do convite:', url)
    }
  }
  return (
    <Button size="xs" variant="ghost" onClick={copy} {...props}>
      {copied ? <LuCheck aria-hidden /> : <LuLink aria-hidden />}
      {copied ? 'Copiado' : 'Copiar link'}
    </Button>
  )
}
