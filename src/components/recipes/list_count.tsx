'use client'

import { Text } from '@chakra-ui/react'
import { formatNumber } from '@/lib/format'

interface ListCountProps {
  total: number
  page: number
  lastPage: number
  /** "receita" */
  one: string
  /** "receitas" */
  many: string
}

/** "1.234 receitas · página 2 de 25" */
export function ListCount({ total, page, lastPage, one, many }: ListCountProps) {
  return (
    <Text textStyle="sm" color="fg.muted" mb="2">
      {formatNumber(total)} {total === 1 ? one : many}
      {lastPage > 1 && ` · página ${page} de ${lastPage}`}
    </Text>
  )
}
