import { readFile } from "node:fs/promises"
import { join } from "node:path"
import SQLiteESMFactory from "@journeyapps/wa-sqlite/dist/wa-sqlite-async.mjs"
import * as SQLite from "@journeyapps/wa-sqlite"

type SqliteBinding = number | string | Uint8Array | number[] | bigint | null

/**
 * In-memory, real SQLite harness for localOnly view semantics.
 *
 * This uses wa-sqlite's SQLite WASM build. The installed PowerSync Core
 * extension is distributed as browser/worker WASM and cannot be loaded through
 * wa-sqlite's Node API, so the view and CRUD queue are represented with normal
 * SQLite views/triggers/tables. It verifies SQLite behavior, not PowerSync's
 * native localOnly implementation.
 */
let sqlitePromise: Promise<{ sqlite: ReturnType<typeof SQLite.Factory>; module: Awaited<ReturnType<typeof SQLiteESMFactory>> }> | undefined

export async function createRealSqliteHarness(options: {
  filename?: string
  initialize?: boolean
} = {}) {
  // Vitest's jsdom environment does not provide fetch for file URLs. Resolve
  // the package's adjacent WASM binary directly and hand it to Emscripten.
  sqlitePromise ??= (async () => {
    const wasmBinary = await readFile(
      join(process.cwd(), "node_modules/@journeyapps/wa-sqlite/dist/wa-sqlite-async.wasm"),
    )
    const module = await SQLiteESMFactory({ wasmBinary })
    return { module, sqlite: SQLite.Factory(module) }
  })()
  const { sqlite } = await sqlitePromise
  const db = await sqlite.open_v2(options.filename ?? ":memory:")

  const execute = async (sql: string, parameters: SqliteBinding[] = []) => {
    if (parameters.length === 0) return sqlite.exec(db, sql)
    for await (const statement of sqlite.statements(db, sql)) {
      sqlite.bind_collection(statement, parameters)
      while ((await sqlite.step(statement)) === SQLite.SQLITE_ROW) { /* drain rows */ }
    }
  }
  const query = async (sql: string, parameters: SqliteBinding[] = []): Promise<Record<string, unknown>[]> => {
    const rows: Record<string, unknown>[] = []
    for await (const statement of sqlite.statements(db, sql)) {
      sqlite.bind_collection(statement, parameters)
      while ((await sqlite.step(statement)) === SQLite.SQLITE_ROW) {
        const columns = sqlite.column_names(statement)
        const values = sqlite.row(statement)
        rows.push(Object.fromEntries(columns.map((column, index) => [column, values[index]])))
      }
    }
    return rows
  }

  if (options.initialize !== false) await execute(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE collection (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE powersync_crud (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      op TEXT NOT NULL,
      row_id TEXT NOT NULL,
      data TEXT NOT NULL
    );
    INSERT INTO collection (id, name) VALUES ('collection-1', 'Before');
    CREATE VIEW local_collection AS
      SELECT id, name FROM collection;
    CREATE TRIGGER local_collection_update
      INSTEAD OF UPDATE ON local_collection
      BEGIN
        UPDATE collection SET name = NEW.name WHERE id = OLD.id;
        INSERT INTO powersync_crud (table_name, op, row_id, data)
        VALUES ('collection', 'UPDATE', OLD.id,
          json_object('id', NEW.id, 'name', NEW.name));
      END;
  `)

  return {
    execute,
    query,
    getAll: query,
    async writeTransaction(callback: (transaction: { execute: typeof execute; getAll: typeof query }) => Promise<void>) {
      await execute("BEGIN")
      try {
        await callback({ execute, getAll: query })
        await execute("COMMIT")
      } catch (error) {
        await execute("ROLLBACK")
        throw error
      }
    },
    async close() {
      await sqlite.close(db)
    },
  }
}
