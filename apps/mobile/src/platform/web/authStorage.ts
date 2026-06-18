import { createIdbAuthStorage } from "@nasti/common/authStorage"
import type { AuthStorageService } from "../types"

export const authStorage: AuthStorageService = createIdbAuthStorage()
