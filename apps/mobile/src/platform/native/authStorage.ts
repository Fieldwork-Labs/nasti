import { SecureStorage } from "@aparajita/capacitor-secure-storage"
import type { AuthStorageService } from "../types"

const KEY_PREFIX = "nasti-auth_"
const keyPrefixReady = SecureStorage.setKeyPrefix(KEY_PREFIX)

const withKeyPrefix = async <T>(operation: () => Promise<T>) => {
  await keyPrefixReady
  return operation()
}

export const authStorage: AuthStorageService = {
  isServer: false,
  getItem: (key) => withKeyPrefix(() => SecureStorage.getItem(key)),
  setItem: (key, value) =>
    withKeyPrefix(() => SecureStorage.setItem(key, value)),
  removeItem: (key) => withKeyPrefix(() => SecureStorage.removeItem(key)),
}
