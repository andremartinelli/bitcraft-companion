'use client'

import { Badge, HStack, Link, Table } from '@chakra-ui/react'
import NextLink from 'next/link'

export interface PlanRow {
  id: number
  name: string
  /** Items and buildings */
  count: number
  /** "24/11/2026 por Vitor" */
  updated: string
  /** "de Vitor" (shared with this account), "compartilhado com 1 conta", or nothing */
  sharing: string | null
}

/** The saved plans, the latest change first */
export function PlanTable({ plans }: { plans: PlanRow[] }) {
  return (
    <Table.ScrollArea borderWidth="1px" rounded="l2" bg="bg">
      <Table.Root size="sm" interactive>
        <Table.Header>
          <Table.Row bg="bg.muted">
            <Table.ColumnHeader>Plano</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">Itens</Table.ColumnHeader>
            <Table.ColumnHeader>Atualizado</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {plans.map((plan) => (
            <Table.Row key={plan.id}>
              <Table.Cell>
                <HStack gap="2" wrap="wrap">
                  <Link asChild fontWeight="medium" colorPalette="teal" color="colorPalette.fg">
                    <NextLink href={`/plans/${plan.id}`}>{plan.name}</NextLink>
                  </Link>
                  {plan.sharing && <Badge size="sm">{plan.sharing}</Badge>}
                </HStack>
              </Table.Cell>
              <Table.Cell textAlign="end">{plan.count}</Table.Cell>
              <Table.Cell color="fg.muted">{plan.updated}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Table.ScrollArea>
  )
}
