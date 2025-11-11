import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
  onSnapshot,
  Timestamp,
} from "firebase/firestore"
import { db } from "./config"
import type {
  Setting,
  SettingHistory,
  CreateSettingData,
  UpdateSettingData,
  BulkCreateData,
  HistoryAction,
} from "@/types/settings"

// Helper to generate path from parent chain
async function generatePath(parentId: string | null, name: string): Promise<string> {
  if (!parentId) {
    return name.toLowerCase().replace(/\s+/g, "-")
  }

  const parentDoc = await getDoc(doc(db, "settings", parentId))
  if (!parentDoc.exists()) {
    return name.toLowerCase().replace(/\s+/g, "-")
  }

  const parentData = parentDoc.data()
  const parentPath = parentData.path || ""
  const slug = name.toLowerCase().replace(/\s+/g, "-")
  return parentPath ? `${parentPath}.${slug}` : slug
}

// Helper to get next order number for a parent
async function getNextOrder(parentId: string | null): Promise<number> {
  const q = query(
    collection(db, "settings"),
    where("parentId", "==", parentId)
  )
  const snapshot = await getDocs(q)
  if (snapshot.empty) return 0
  
  // Find max order on client side
  let maxOrder = 0
  snapshot.docs.forEach(doc => {
    const order = doc.data().order || 0
    if (order > maxOrder) maxOrder = order
  })
  
  return maxOrder + 1
}

// Add history entry
async function addHistory(
  settingId: string,
  settingPath: string,
  action: HistoryAction,
  before: any,
  after: any,
  modifiedBy: string,
  modifiedByName: string
): Promise<void> {
  try {
    await addDoc(collection(db, "settingsHistory"), {
      settingId,
      settingPath,
      action,
      before,
      after,
      modifiedBy,
      modifiedByName,
      timestamp: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error adding settings history:", error)
  }
}

// Create a new setting
export async function createSetting(
  data: CreateSettingData,
  userId: string,
  userName: string
): Promise<Setting> {
  const path = await generatePath(data.parentId, data.name)
  const order = await getNextOrder(data.parentId)

  const settingData: any = {
    path,
    name: data.name,
    description: data.description || "",
    type: data.type || "variable",
    parentId: data.parentId,
    order,
    hidden: false,
    favorite: false,
    assignedTargets: Array.isArray(data.assignedTargets) ? data.assignedTargets : [],
    createdAt: serverTimestamp(),
    createdBy: userId,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  }

  // Only add optional fields if they have values (Firestore doesn't accept undefined)
  // Enforce name as value (string) for variables
  if ((settingData.type === "variable")) {
    settingData.valueType = "string"
    settingData.value = data.value !== undefined ? data.value : data.name
  }
  if (data.inheritedFrom !== undefined) {
    settingData.inheritedFrom = data.inheritedFrom
  }

  const docRef = await addDoc(collection(db, "settings"), settingData)

  // Add history
  await addHistory(docRef.id, path, "create", null, settingData, userId, userName)

  return {
    id: docRef.id,
    ...settingData,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  } as Setting
}

// Get settings by parent ID
export async function getSettingsByParent(parentId: string | null): Promise<Setting[]> {
  const q = query(
    collection(db, "settings"),
    where("parentId", "==", parentId)
  )

  const snapshot = await getDocs(q)
  const settings = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Setting[]
  
  // Sort by order on client side to avoid composite index requirement
  return settings.sort((a, b) => (a.order || 0) - (b.order || 0))
}

// Get single setting by ID
export async function getSetting(id: string): Promise<Setting | null> {
  const docRef = doc(db, "settings", id)
  const docSnap = await getDoc(docRef)

  if (!docSnap.exists()) return null

  return {
    id: docSnap.id,
    ...docSnap.data(),
  } as Setting
}

// Update setting
export async function updateSetting(
  id: string,
  data: UpdateSettingData,
  userId: string,
  userName: string
): Promise<void> {
  const docRef = doc(db, "settings", id)

  // Get old data for history
  const oldDoc = await getDoc(docRef)
  const oldData = oldDoc.exists() ? oldDoc.data() : null

  // Filter out undefined values (Firestore doesn't accept undefined)
  const updateData: any = {
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  }

  // Only add fields that are defined
  Object.keys(data).forEach((key) => {
    if ((data as any)[key] !== undefined) {
      updateData[key] = (data as any)[key]
    }
  })

  // If name changes, keep value synced to name for variables
  const willBeVariable =
    (updateData.type ? updateData.type === "variable" : oldData?.type === "variable")
  if (data.name !== undefined && willBeVariable) {
    updateData.valueType = "string"
    updateData.value = data.name
  }

  await updateDoc(docRef, updateData)

  // Add history
  if (oldData) {
    await addHistory(id, oldData.path, "update", oldData, { ...oldData, ...data }, userId, userName)
  }
}

// Delete setting and all children recursively
export async function deleteSetting(id: string, userId: string, userName: string): Promise<void> {
  const docRef = doc(db, "settings", id)
  const docSnap = await getDoc(docRef)

  if (!docSnap.exists()) return

  const settingData = docSnap.data()

  // Find all children
  const childrenQuery = query(collection(db, "settings"), where("parentId", "==", id))
  const childrenSnapshot = await getDocs(childrenQuery)

  // Delete children recursively
  for (const childDoc of childrenSnapshot.docs) {
    await deleteSetting(childDoc.id, userId, userName)
  }

  // Add history before deleting
  await addHistory(id, settingData.path, "delete", settingData, null, userId, userName)

  // Delete the setting
  await deleteDoc(docRef)
}

// Duplicate setting
export async function duplicateSetting(
  id: string,
  userId: string,
  userName: string,
  deepClone: boolean = false
): Promise<Setting> {
  const original = await getSetting(id)
  if (!original) throw new Error("Setting not found")

  const newData: CreateSettingData = {
    name: `${original.name} (copie)`,
    description: original.description,
    type: original.type,
    valueType: original.valueType,
    value: original.value,
    parentId: original.parentId,
    inheritedFrom: original.inheritedFrom,
  }

  const newSetting = await createSetting(newData, userId, userName)

  // If deep clone, duplicate children (for both categories and variables)
  if (deepClone) {
    const children = await getSettingsByParent(id)
    for (const child of children) {
      await duplicateChildRecursive(child, newSetting.id, userId, userName)
    }
  }

  return newSetting
}

// Helper for recursive duplication
async function duplicateChildRecursive(
  original: Setting,
  newParentId: string,
  userId: string,
  userName: string
): Promise<void> {
  const newData: CreateSettingData = {
    name: original.name,
    description: original.description,
    type: original.type,
    valueType: original.valueType,
    value: original.value,
    parentId: newParentId,
    inheritedFrom: original.inheritedFrom,
  }

  const newSetting = await createSetting(newData, userId, userName)

  // Recursively duplicate children for any type (category or variable)
  const children = await getSettingsByParent(original.id)
  for (const child of children) {
    await duplicateChildRecursive(child, newSetting.id, userId, userName)
  }
}

// Bulk create settings
export async function bulkCreateSettings(
  data: BulkCreateData,
  userId: string,
  userName: string
): Promise<Setting[]> {
  const batch = writeBatch(db)
  const created: Setting[] = []
  let order = await getNextOrder(data.parentId)

  for (const name of data.names) {
    const path = await generatePath(data.parentId, name)
    const settingData: any = {
      path,
      name,
      description: data.description || "",
      type: "variable",
      parentId: data.parentId,
      order: order++,
      hidden: false,
      favorite: false,
      createdAt: serverTimestamp(),
      createdBy: userId,
      updatedAt: serverTimestamp(),
      updatedBy: userId,
    }

    // Name is the value, string
    settingData.valueType = "string"
    settingData.value = name

    const docRef = doc(collection(db, "settings"))
    batch.set(docRef, settingData)

    created.push({
      id: docRef.id,
      ...settingData,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    } as Setting)

    // Add history (not in batch for simplicity)
    await addHistory(docRef.id, path, "create", null, settingData, userId, userName)
  }

  await batch.commit()
  return created
}

// Bulk create hierarchy using indentation levels in lines
export async function bulkCreateHierarchy(
  data: { lines: string[]; parentId: string | null; description?: string },
  userId: string,
  userName: string
): Promise<Setting[]> {
  const created: Setting[] = []
  // stack of {level, id}
  const stack: Array<{ level: number; id: string }> = []

  function getIndentLevel(line: string): number {
    // Count leading tabs or groups of two spaces as one level
    let level = 0
    let i = 0
    while (i < line.length) {
      if (line[i] === "\t") {
        level++
        i++
      } else if (line[i] === " " && line[i + 1] === " ") {
        level++
        i += 2
      } else if (line[i] === " ") {
        // single space, treat as half, but ignore to avoid oddities
        i++
      } else {
        break
      }
    }
    return level
  }

  for (const raw of data.lines) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    const level = getIndentLevel(raw)

    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop()
    }

    const parentId =
      stack.length === 0 ? data.parentId : stack[stack.length - 1].id

    const newSetting = await createSetting(
      {
        name: trimmed,
        description: data.description || "",
        type: "variable",
        parentId,
        valueType: "string",
        value: trimmed,
      },
      userId,
      userName
    )

    created.push(newSetting)
    stack.push({ level, id: newSetting.id })
  }

  return created
}

// Update order (for drag-and-drop)
export async function updateSettingsOrder(
  updates: Array<{ id: string; order: number }>,
  userId: string,
  userName: string
): Promise<void> {
  const batch = writeBatch(db)

  for (const update of updates) {
    const docRef = doc(db, "settings", update.id)
    batch.update(docRef, {
      order: update.order,
      updatedAt: serverTimestamp(),
      updatedBy: userId,
    })

    // Add history
    const oldDoc = await getDoc(docRef)
    if (oldDoc.exists()) {
      const oldData = oldDoc.data()
      await addHistory(
        update.id,
        oldData.path,
        "move",
        { order: oldData.order },
        { order: update.order },
        userId,
        userName
      )
    }
  }

  await batch.commit()
}

// Get history for a setting
export async function getSettingHistory(settingId: string): Promise<SettingHistory[]> {
  const q = query(
    collection(db, "settingsHistory"),
    where("settingId", "==", settingId)
  )

  const snapshot = await getDocs(q)
  const history = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as SettingHistory[]
  
  // Sort by timestamp on client side (newest first)
  return history.sort((a, b) => {
    const timeA = a.timestamp?.toMillis?.() || 0
    const timeB = b.timestamp?.toMillis?.() || 0
    return timeB - timeA
  })
}

// Revert to a previous version
export async function revertSetting(
  settingId: string,
  historyId: string,
  userId: string,
  userName: string
): Promise<void> {
  const historyDocRef = doc(db, "settingsHistory", historyId)
  const historySnap = await getDoc(historyDocRef)

  if (!historySnap.exists()) throw new Error("History entry not found")

  const historyData = historySnap.data() as SettingHistory
  const revertToData = historyData.before

  if (!revertToData) throw new Error("No previous version to revert to")

  const settingRef = doc(db, "settings", settingId)
  const currentSnap = await getDoc(settingRef)
  const currentData = currentSnap.data()

  // Update with old data
  await updateDoc(settingRef, {
    ...revertToData,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  })

  // Add revert history
  await addHistory(settingId, revertToData.path, "revert", currentData, revertToData, userId, userName)
}

// Subscribe to settings changes
export function subscribeToSettings(
  parentId: string | null,
  callback: (settings: Setting[]) => void
): () => void {
  const q = query(
    collection(db, "settings"),
    where("parentId", "==", parentId)
  )

  return onSnapshot(q, (snapshot) => {
    const settings = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Setting[]
    
    // Sort by order on client side
    settings.sort((a, b) => (a.order || 0) - (b.order || 0))
    callback(settings)
  })
}

// Subscribe to settings that are bound to a target (top-level usually)
export function subscribeToSettingsByTarget(
  targetId: string,
  callback: (settings: Setting[]) => void
): () => void {
  const q = query(
    collection(db, "settings"),
    where("assignedTargets", "array-contains", targetId)
  )

  return onSnapshot(q, (snapshot) => {
    const settings = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Setting[]
    callback(settings)
  })
}

// Search settings
export async function searchSettings(searchTerm: string): Promise<Setting[]> {
  // Note: Firestore doesn't support full-text search natively
  // This is a simple implementation - for production use Algolia or similar
  const allSettings = await getDocs(collection(db, "settings"))
  const term = searchTerm.toLowerCase()

  return allSettings.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as Setting))
    .filter(
      (setting) =>
        setting.name.toLowerCase().includes(term) ||
        setting.description?.toLowerCase().includes(term) ||
        setting.path.toLowerCase().includes(term)
    )
}

// Get inherited value
export async function getInheritedValue(setting: Setting): Promise<any> {
  if (setting.value !== undefined) return setting.value
  if (!setting.inheritedFrom) return undefined

  const parent = await getSetting(setting.inheritedFrom)
  if (!parent) return undefined

  return getInheritedValue(parent)
}

