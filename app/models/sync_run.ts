import { SyncRunSchema } from '#database/schema'
import { DateTime } from 'luxon'

export type SyncStatus = 'running' | 'ok' | 'partial' | 'failed'
export type SyncTrigger = 'manual' | 'schedule'

export const SYNC_STATUSES: Record<SyncStatus, string> = {
  running: 'em andamento',
  ok: 'concluída',
  partial: 'parcial',
  failed: 'falhou',
}

/** A run still "running" after this long died with its process */
const STALE_AFTER_MINUTES = 10

/** The format Lucid writes dateTime columns in on SQLite */
const sqlTime = (time: DateTime) => time.toFormat('yyyy-MM-dd HH:mm:ss')

/**
 * One inventory sync: when, how it was started and how it went.
 */
export default class SyncRun extends SyncRunSchema {
  declare status: SyncStatus
  declare trigger: SyncTrigger

  get statusLabel() {
    return SYNC_STATUSES[this.status] ?? this.status
  }

  static latest() {
    return this.query().orderBy('started_at', 'desc').orderBy('id', 'desc').first()
  }

  /** The last run that wrote data (ok or partial) */
  static lastSuccessful() {
    return this.query()
      .whereIn('status', ['ok', 'partial'])
      .orderBy('started_at', 'desc')
      .orderBy('id', 'desc')
      .first()
  }

  /** A run in progress, in this process or another one (the ace command) */
  static async inProgress() {
    await this.query()
      .where('status', 'running')
      .where('started_at', '<', sqlTime(DateTime.now().minus({ minutes: STALE_AFTER_MINUTES })))
      .update({
        status: 'failed',
        message: 'Interrompida antes de terminar.',
        finished_at: sqlTime(DateTime.now()),
      })
    return this.query().where('status', 'running').first()
  }
}
