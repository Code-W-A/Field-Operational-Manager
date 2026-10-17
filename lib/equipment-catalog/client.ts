"use client";
import { useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/firebase/config";
import type {
  EquipmentCatalog,
  EquipmentCatalogKind,
} from "@/packages/fom-domain/equipment-catalog";
const changed = "fom-equipment-catalog-changed";
export type CatalogMutation = {
  kind: EquipmentCatalogKind;
  name?: string;
  manufacturerId?: string;
  id?: string;
  hidden?: boolean;
};
export async function catalogRequest(
  body?: CatalogMutation,
  options: { method?: "POST" | "PATCH"; manage?: boolean } = {},
) {
  const user = auth.currentUser;
  if (!user) throw new Error("Autentifică-te din nou.");
  const response = await fetch(
    `/api/equipment-catalog${options.manage ? "?manage=1" : ""}`,
    {
      method: body ? options.method || "POST" : "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Authorization: `Bearer ${await user.getIdToken()}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  const data = await response.json().catch(() => {
    throw new Error("Serverul nu a putut procesa cererea. Reîncearcă.");
  });
  if (!response.ok)
    throw new Error(data.error || "Listele nu au putut fi încărcate.");
  if (body) window.dispatchEvent(new Event(changed));
  return data;
}
export function useEquipmentCatalog(manage = false) {
  const [catalog, setCatalog] = useState<EquipmentCatalog>({
    manufacturers: [],
    models: [],
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    try {
      const data = await catalogRequest(undefined, { manage });
      setCatalog(data);
      setError("");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [manage]);
  useEffect(() => {
    let live = true;
    const load = () => {
      if (live)
        void catalogRequest(undefined, { manage })
          .then((data) => {
            if (live) {
              setCatalog(data);
              setError("");
            }
          })
          .catch((error) => {
            if (live) setError(error.message);
          })
          .finally(() => {
            if (live) setLoading(false);
          });
    };
    load();
    window.addEventListener(changed, load);
    window.addEventListener("focus", load);
    return () => {
      live = false;
      window.removeEventListener(changed, load);
      window.removeEventListener("focus", load);
    };
  }, [manage]);
  return { catalog, setCatalog, error, loading, reload };
}
