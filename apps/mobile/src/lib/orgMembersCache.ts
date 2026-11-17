import { type QueryClient } from "@tanstack/react-query"
import {
  ORG_MEMBERS_QUERY_KEY,
  orgMembersQueryKey,
  orgMembersSchema,
} from "./orgMembers"
import {
  readRosterGate,
  reopenRosterCache,
  restoreRoster,
  revokeRosterCache,
  saveRoster,
  type RosterGate,
} from "./orgMembersStorage"
import { TIMED_OUT, withTimeout } from "./withTimeout"

type AccountCache = { userId: string; revision?: string; ready: boolean }

class OrgMembersCache {
  private gate?: Promise<RosterGate | null | undefined>
  private account?: AccountCache
  private revoked = false
  private channel?: BroadcastChannel
  private readonly listeners = new Set<() => void>()

  constructor(private readonly client: QueryClient) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  isReady(userId?: string) {
    return this.account?.userId === userId && this.account?.ready === true
  }

  start() {
    // Read before auth bootstrap so a tab verifying an older session cannot
    // pick up the new revision after a concurrent logout and sign-in.
    this.gate ??= this.readGate()
    const unsubscribe = this.client.getQueryCache().subscribe((event) => {
      const account = this.account
      if (
        !account?.revision ||
        !account.ready ||
        event.type !== "updated" ||
        event.action.type !== "success" ||
        event.action.manual ||
        event.query.queryHash !==
          JSON.stringify(orgMembersQueryKey(account.userId))
      )
        return

      const data = orgMembersSchema.safeParse(event.query.state.data)
      if (!data.success) return
      void saveRoster(account.userId, account.revision, {
        data: data.data,
        dataUpdatedAt: event.query.state.dataUpdatedAt,
        cachedAt: Date.now(),
      })
        .then((saved) => {
          if (!saved && this.account === account) this.block()
        })
        .catch(() => {
          // The in-memory query remains usable when the cache cannot be saved.
        })
    })
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel("nasti-roster-cache")
      this.channel.onmessage = ({ data }) => {
        if (typeof data !== "string") return
        const pendingGate = this.gate
        void pendingGate?.then((gate) => {
          if (this.gate !== pendingGate) return
          if (!gate || gate.revision === data) this.block()
          else this.recheck()
        })
      }
    }

    const onVisibilityChange = () => {
      if (!document.hidden) this.recheck()
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    window.addEventListener("focus", this.recheck)
    window.addEventListener("pageshow", this.recheck)
    return () => {
      unsubscribe()
      this.channel?.close()
      this.channel = undefined
      document.removeEventListener("visibilitychange", onVisibilityChange)
      window.removeEventListener("focus", this.recheck)
      window.removeEventListener("pageshow", this.recheck)
    }
  }

  setAccount(userId?: string) {
    if (this.account?.userId === userId) return
    this.clearAccount()
    if (!userId || this.revoked) return

    const account = { userId, ready: false }
    this.account = account
    void this.restore(account)
  }

  // Sample again at the start of an explicit sign-in. A login that overlaps a
  // later logout cannot reopen the revision that the logout just revoked.
  readGate() {
    return readRosterGate().catch(() => undefined)
  }

  authorize(expected: RosterGate | undefined) {
    const userId = this.account?.userId
    this.clearAccount()
    this.revoked = false
    this.gate = expected
      ? reopenRosterCache(expected).catch(() => undefined)
      : Promise.resolve(undefined)
    this.setAccount(userId)
  }

  async purge() {
    const notify = (revision: string) => this.channel?.postMessage(revision)
    // Tell tabs holding this revision to drop it even if disk cleanup fails.
    void this.gate?.then((gate) => {
      if (gate) notify(gate.revision)
    })
    this.block()
    this.client.removeQueries({ queryKey: ORG_MEMBERS_QUERY_KEY })
    try {
      await revokeRosterCache(notify)
    } catch (error) {
      throw Object.assign(
        new Error(
          "Unable to remove the saved collector roster. Please try logging out again.",
        ),
        { cause: error },
      )
    }
  }

  private notify() {
    this.listeners.forEach((listener) => listener())
  }

  private clearAccount() {
    const previous = this.account
    this.account = undefined
    if (previous) {
      this.client.removeQueries({
        queryKey: orgMembersQueryKey(previous.userId),
        exact: true,
      })
      this.notify()
    }
  }

  private block() {
    this.revoked = true
    this.clearAccount()
  }

  private async restore(account: AccountCache) {
    this.gate ??= this.readGate()
    let revision: string | undefined
    const result = await withTimeout(
      this.gate
        .then((gate) => {
          if (gate === null || gate?.revoked) return null
          if (!gate || this.account !== account) return undefined
          revision = gate.revision
          return restoreRoster(account.userId, revision)
        })
        .catch(() => undefined),
      1_000,
    )

    if (this.account !== account) return
    if (result === null) {
      this.block()
      return
    }

    if (result !== TIMED_OUT && result) {
      const key = orgMembersQueryKey(account.userId)
      const record = result.record
      if (
        record &&
        (this.client.getQueryState(key)?.dataUpdatedAt ?? 0) <
          record.dataUpdatedAt
      )
        this.client.setQueryData(key, record.data, {
          updatedAt: record.dataUpdatedAt,
        })
    }

    account.revision = revision
    account.ready = true
    this.notify()
  }

  private recheck = () => {
    const gate = this.gate
    if (!gate || this.revoked) return
    void gate.then(async (previous) => {
      const current = await this.readGate()
      if (
        this.gate === gate &&
        current &&
        (current.revoked ||
          (previous && current.revision !== previous.revision))
      ) {
        this.block()
      }
    })
  }
}

const caches = new WeakMap<QueryClient, OrgMembersCache>()
export const getOrgMembersCache = (client: QueryClient) => {
  let cache = caches.get(client)
  if (!cache) {
    cache = new OrgMembersCache(client)
    caches.set(client, cache)
  }
  return cache
}
