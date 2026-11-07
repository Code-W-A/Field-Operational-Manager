"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  SagaCatalog,
  SagaProduct,
  SagaWarehouse,
} from "@/lib/saga/catalog";

type Form = {
  id?: string;
  code: string;
  name: string;
  active: boolean;
  expectedRevision: number;
  kind: "goods" | "service";
  warehouseIds: string[];
};
const isProduct = (row: SagaProduct | SagaWarehouse): row is SagaProduct =>
  "warehouseIds" in row;
const empty = (): Form => ({
  code: "",
  name: "",
  active: true,
  expectedRevision: 0,
  kind: "goods",
  warehouseIds: [],
});
export function SagaCatalogSettings() {
  const { user } = useAuth();
  const [catalog, setCatalog] = useState<SagaCatalog | null>(null);
  const [kind, setKind] = useState<"products" | "warehouses">("products");
  const [form, setForm] = useState<Form>(empty);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function request(path = "", method = "GET", body?: unknown) {
    const token = await user?.getIdToken();
    const r = await fetch(`/api/integrations/saga/catalog${path}`, {
      method,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token || ""}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Catalog indisponibil.");
    return data;
  }
  async function reload() {
    try {
      const data = await request();
      if (!Array.isArray(data.products) || !Array.isArray(data.warehouses))
        throw new Error("Catalog indisponibil.");
      setCatalog(data);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void reload();
  }, [user?.uid]);
  function edit(row: SagaProduct | SagaWarehouse) {
    setForm({
      id: row.id,
      code: row.code,
      name: row.name,
      active: row.active,
      expectedRevision: row.revision,
      kind: isProduct(row) ? row.kind : "goods",
      warehouseIds: isProduct(row) ? row.warehouseIds : [],
    });
    setError("");
    setNotice("");
  }
  async function save() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await request(
        `/${kind}${form.id ? `/${encodeURIComponent(form.id)}` : ""}`,
        form.id ? "PUT" : "POST",
        form,
      );
      setNotice(
        kind === "products"
          ? `Asociere salvată: ${saved.articleName} · ${saved.unit}`
          : "Gestiune salvată în FOM.",
      );
      setForm(empty());
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const rows = kind === "products" ? catalog?.products : catalog?.warehouses;
  return (
    <section
      className="space-y-3 rounded-lg border p-4"
      aria-label="Catalog asocieri SAGA"
    >
      <h3 className="font-semibold">Produse și gestiuni asociate</h3>
      <p className="text-sm text-muted-foreground">
        Catalog reutilizabil în FOM. La salvarea unui cod nou de articol,
        verificăm denumirea și UM în SAGA. Gestiunile sunt introduse manual.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={kind === "products" ? "default" : "outline"}
          disabled={busy}
          onClick={() => {
            setKind("products");
            setForm(empty());
            setError("");
          }}
        >
          Produse asociate
        </Button>
        <Button
          type="button"
          variant={kind === "warehouses" ? "default" : "outline"}
          disabled={busy}
          onClick={() => {
            setKind("warehouses");
            setForm(empty());
            setError("");
          }}
        >
          Gestiuni
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setError("");
            void reload();
          }}
        >
          Reîncarcă catalogul
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-800">
          {notice}
        </p>
      )}
      <div className="max-h-64 space-y-2 overflow-auto">
        {rows?.map((row) => (
          <div
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm"
          >
            <span className="min-w-0 break-words">
              {row.code} · {row.name}
              {isProduct(row)
                ? ` · ${row.unit} · ${row.kind === "goods" ? "Marfă" : "Serviciu"}`
                : ""}
              {!row.active ? " · Inactiv" : ""}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => edit(row)}
            >
              Editează {row.code}
            </Button>
          </div>
        ))}
        {rows?.length === 0 && (
          <p className="text-sm text-muted-foreground">Catalogul este gol.</p>
        )}
      </div>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={busy || !catalog} className="space-y-3">
          <legend className="font-medium">
            {form.id ? "Editează" : "Adaugă"}{" "}
            {kind === "products" ? "asociere produs" : "gestiune"}
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              {kind === "products"
                ? "Cod articol de asociat"
                : "Cod gestiune SAGA"}
              <Input
                required
                maxLength={100}
                value={form.code}
                onChange={(e) =>
                  setForm((f) => ({ ...f, code: e.target.value }))
                }
              />
            </label>
            <label className="text-sm">
              Denumire în FOM
              <Input
                required
                maxLength={300}
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </label>
          </div>
          {kind === "products" && (
            <>
              <label className="block text-sm">
                Tip produs
                <select
                  className="mt-1 block w-full rounded border bg-background p-2"
                  value={form.kind}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      kind: e.target.value as Form["kind"],
                      warehouseIds: [],
                    }))
                  }
                >
                  <option value="goods">Marfă</option>
                  <option value="service">Serviciu</option>
                </select>
              </label>
              {form.kind === "goods" && (
                <fieldset className="space-y-2">
                  <legend className="text-sm">Gestiuni permise</legend>
                  {catalog?.warehouses.map((w) => (
                    <label
                      key={w.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        disabled={
                          !w.active && !form.warehouseIds.includes(w.id)
                        }
                        checked={form.warehouseIds.includes(w.id)}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            warehouseIds: e.target.checked
                              ? [...f.warehouseIds, w.id]
                              : f.warehouseIds.filter((id) => id !== w.id),
                          }))
                        }
                      />
                      {w.code} · {w.name}
                      {!w.active ? " · Inactivă" : ""}
                    </label>
                  ))}
                  {!catalog?.warehouses.length && (
                    <p className="text-sm text-muted-foreground">
                      Configurează gestiunile pentru a putea consulta stocul.
                    </p>
                  )}
                </fieldset>
              )}
            </>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) =>
                setForm((f) => ({ ...f, active: e.target.checked }))
              }
            />
            Activ
          </label>
          <div className="flex gap-2">
            <Button type="submit">
              {busy ? "Se salvează…" : "Salvează în catalog"}
            </Button>
            {form.id && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setForm(empty())}
              >
                Anulează editarea
              </Button>
            )}
          </div>
        </fieldset>
      </form>
    </section>
  );
}
