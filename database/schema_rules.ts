import { type SchemaRules } from '@adonisjs/lucid/types/schema_generator'

/**
 * Overrides for the generated database/schema.ts.
 */
const jsonColumn = (tsType: string) => ({
  tsType,
  decorator:
    "@column({ prepare: (value) => (value === null ? null : JSON.stringify(value)), consume: (value) => (typeof value === 'string' ? JSON.parse(value) : value) })",
})

export default {
  types: {
    // SQLite returns booleans as 0/1
    boolean: { tsType: 'boolean', decorator: '@column({ consume: (value) => Boolean(value) })' },
  },
  columns: {
    // Game ids fit in a JS number (largest today is ~2.1e9)
    game_id: { tsType: 'number', decorator: '@column()' },
    item_list_game_id: { tsType: 'number', decorator: '@column()' },
  },
  tables: {
    game_data_imports: {
      columns: {
        counts: jsonColumn('Record<string, number>'),
        renamed: jsonColumn('{ kind: string; gameId: number; from: string; to: string }[]'),
      },
    },
  },
} satisfies SchemaRules
