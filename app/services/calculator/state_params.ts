import { errors as vineErrors } from '@vinejs/vine'
import { calculatorStateValidator } from '#validators/calculator'
import type { CalculatorState } from '#services/calculator/production_planner'

export interface ReadState {
  state: CalculatorState
  errors: string[]
  /** True when the request added or removed a target (the URL must change) */
  changed: boolean
}

/**
 * Choices and owned quantities are keyed "i<item id>": a bare number would make
 * the query string parser read small ids as array positions.
 */
function itemIdFromKey(key: string): number | null {
  const match = /^i(\d+)$/.exec(key)
  return match ? Number(match[1]) : null
}

/** Drops empty form fields ("" means "not set"), at any depth */
function compact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compact)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== '' && v !== null && v !== undefined)
        .map(([k, v]) => [k, compact(v)])
    )
  }
  return value
}

const MESSAGES: Record<string, string> = {
  quantity: 'A quantidade precisa ser um número inteiro entre 1 e 100.000.',
  owned: 'O "já tenho" precisa ser um número inteiro entre 0 e 1.000.000.',
  targets: 'Dá para calcular no máximo 30 itens de uma vez.',
}

/**
 * Reads the calculator state from request input. Invalid input never throws:
 * it comes back as messages to show, with an empty state.
 */
export async function readState(input: Record<string, unknown>): Promise<ReadState> {
  let data
  try {
    data = await calculatorStateValidator.validate(compact(input))
  } catch (error) {
    if (!(error instanceof vineErrors.E_VALIDATION_ERROR)) throw error
    const messages = (error.messages as { field: string }[]).map((m) => {
      const key = Object.keys(MESSAGES).find((k) => m.field.includes(k))
      return key ? MESSAGES[key] : 'Alguns dados do cálculo são inválidos.'
    })
    return {
      state: { targets: [], choices: {}, owned: {} },
      errors: [...new Set(messages)],
      changed: false,
    }
  }

  const targets = (data.targets ?? []).map((t) => ({
    itemId: t.item_id,
    quantity: t.quantity ?? 1,
  }))
  let changed = false
  if (data.remove !== undefined && data.remove < targets.length) {
    targets.splice(data.remove, 1)
    changed = true
  }
  if (data.add !== undefined) {
    if (!targets.some((t) => t.itemId === data.add)) targets.push({ itemId: data.add, quantity: 1 })
    changed = true
  }

  const choices: CalculatorState['choices'] = {}
  for (const [itemId, value] of Object.entries(data.choices ?? {})) {
    const id = itemIdFromKey(itemId)
    if (id) choices[id] = value === 'raw' ? 'raw' : Number(value)
  }
  const owned: CalculatorState['owned'] = {}
  for (const [itemId, quantity] of Object.entries(data.owned ?? {})) {
    const id = itemIdFromKey(itemId)
    if (id && quantity > 0) owned[id] = quantity
  }

  return { state: { targets, choices, owned }, errors: [], changed }
}

/** The state as form fields, in the same bracket format readState reads */
export function stateToFields(state: CalculatorState): [string, string][] {
  const fields: [string, string][] = []
  state.targets.forEach((t, i) => {
    fields.push(
      [`targets[${i}][item_id]`, String(t.itemId)],
      [`targets[${i}][quantity]`, String(t.quantity)]
    )
  })
  for (const [itemId, choice] of Object.entries(state.choices))
    fields.push([`choices[i${itemId}]`, String(choice)])
  for (const [itemId, quantity] of Object.entries(state.owned))
    fields.push([`owned[i${itemId}]`, String(quantity)])
  return fields
}

export function stateToQuery(state: CalculatorState): string {
  return new URLSearchParams(stateToFields(state)).toString()
}
