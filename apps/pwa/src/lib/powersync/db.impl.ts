import {
  PowerSyncDatabase,
  WASQLiteOpenFactory,
  WASQLiteVFS,
} from "@powersync/web"
import { AppSchema } from "./schema"

const openFactory = new WASQLiteOpenFactory({
  dbFilename: "nasti-powersync.db",
  vfs: WASQLiteVFS.OPFSCoopSyncVFS,
  flags: {
    enableMultiTabs: typeof SharedWorker !== "undefined",
  },
})

export const powerSyncDb = new PowerSyncDatabase({
  schema: AppSchema,
  database: openFactory,
})
