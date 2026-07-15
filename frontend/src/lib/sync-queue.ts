import { openDB, type IDBPDatabase } from "idb"

interface QueuedAction {
  id?: number
  method: string
  url: string
  body: object
  timestamp: number
  retryCount: number
}

interface SyncDB {
  "pending-actions": {
    key: number
    value: QueuedAction
    indexes: { timestamp: number }
  }
}

let dbPromise: Promise<IDBPDatabase<SyncDB>> | null = null

function getDB(): Promise<IDBPDatabase<SyncDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SyncDB>("flowsense-sync", 1, {
      upgrade(db) {
        const store = db.createObjectStore("pending-actions", {
          keyPath: "id",
          autoIncrement: true,
        })
        store.createIndex("timestamp", "timestamp")
      },
    })
  }
  return dbPromise
}

export async function enqueue(action: Omit<QueuedAction, "id">): Promise<void> {
  const db = await getDB()
  await db.add("pending-actions", action)
  window.dispatchEvent(new CustomEvent("flowsense:queue-changed"))
}

export async function dequeue(id: number): Promise<void> {
  const db = await getDB()
  await db.delete("pending-actions", id)
  window.dispatchEvent(new CustomEvent("flowsense:queue-changed"))
}

export async function getAll(): Promise<QueuedAction[]> {
  const db = await getDB()
  return db.getAllFromIndex("pending-actions", "timestamp")
}

export async function getCount(): Promise<number> {
  const db = await getDB()
  return db.count("pending-actions")
}

export async function updateRetryCount(id: number, retryCount: number): Promise<void> {
  const db = await getDB()
  const action = await db.get("pending-actions", id)
  if (action) await db.put("pending-actions", { ...action, retryCount })
}
