import { PowerSyncDatabase } from "@powersync/capacitor"
import { AppSchema } from "./schema"

export const powerSyncDb = new PowerSyncDatabase({
  schema: AppSchema,
  database: {
    dbFilename: "nasti-powersync.db",
  },
})
