"use client";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase/config";
import {
  equipmentCatalogChoices,
  type EquipmentCatalog,
  type EquipmentCatalogKind,
} from "@/packages/fom-domain/equipment-catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
const EMPTY: EquipmentCatalog = { manufacturers: [], models: [] };
export async function catalogRequest(body?: {
  kind: EquipmentCatalogKind;
  name: string;
}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Autentifică-te din nou.");
  const response = await fetch("/api/equipment-catalog", {
    method: body ? "POST" : "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => {
    throw new Error("Serverul nu a putut procesa cererea. Reîncearcă.");
  });
  if (!response.ok)
    throw new Error(data.error || "Listele nu au putut fi încărcate.");
  return data;
}
function CatalogSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: EquipmentCatalog["models"];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState("");
  const choices = equipmentCatalogChoices(options, value).filter((o) =>
    o.label.toLocaleLowerCase("ro").includes(search.toLocaleLowerCase("ro")),
  );
  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          className="w-full justify-between"
        >
          {value || "Nespecificat"}
          <span aria-hidden>⌄</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 max-w-[90vw] p-2" align="start">
        <Input
          aria-label={`Caută ${label.toLowerCase()}`}
          placeholder="Caută…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div
          role="listbox"
          aria-label={label}
          className="max-h-60 overflow-y-auto mt-2"
        >
          {choices.map((o) => (
            <Button
              type="button"
              variant="ghost"
              role="option"
              aria-selected={o.value === value}
              className="w-full justify-start"
              key={o.value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </Button>
          ))}
          {!choices.length && (
            <p className="text-sm p-2">Nicio valoare găsită.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
export function EquipmentCatalogFields({
  producator,
  model,
  canAdd,
  onChange,
}: {
  producator: string;
  model: string;
  canAdd: boolean;
  onChange: (patch: { producator?: string; model?: string }) => void;
}) {
  const [catalog, setCatalog] = useState<EquipmentCatalog>(EMPTY),
    [error, setError] = useState("");
  const [kind, setKind] = useState<EquipmentCatalogKind | null>(null),
    [name, setName] = useState(""),
    [saving, setSaving] = useState(false),
    [addError, setAddError] = useState("");
  const load = async () => {
    try {
      setCatalog(await catalogRequest());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    let live = true;
    catalogRequest()
      .then((data) => {
        if (live) setCatalog(data);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  const add = async () => {
    if (!kind || saving) return;
    setSaving(true);
    setAddError("");
    try {
      const result = await catalogRequest({ kind, name });
      setCatalog(result.catalog);
      onChange(
        kind === "manufacturers"
          ? { producator: result.option.name }
          : { model: result.option.name },
      );
      setKind(null);
    } catch (e) {
      setAddError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(["manufacturers", "models"] as const).map((key) => {
          const label = key === "manufacturers" ? "Producător" : "Model";
          return (
            <div className="space-y-1" key={key}>
              <label className="text-sm font-medium">{label}</label>
              <div className="flex gap-2">
                <CatalogSelect
                  label={label}
                  value={key === "manufacturers" ? producator : model}
                  options={catalog[key]}
                  onChange={(value) =>
                    onChange(
                      key === "manufacturers"
                        ? { producator: value }
                        : { model: value },
                    )
                  }
                />
                {canAdd && (
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={`Adaugă ${label.toLowerCase()}`}
                    onClick={() => {
                      setKind(key);
                      setName("");
                      setAddError("");
                    }}
                  >
                    +
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {error && (
        <div role="alert" className="text-sm text-red-600">
          {error}{" "}
          <Button type="button" variant="link" onClick={() => void load()}>
            Reîncearcă încărcarea listelor
          </Button>
        </div>
      )}
      <Dialog
        open={!!kind}
        onOpenChange={(open) => {
          if (!open && !saving) setKind(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {kind === "manufacturers" ? "Adaugă producător" : "Adaugă model"}
            </DialogTitle>
          </DialogHeader>
          <Input
            aria-label="Denumire"
            placeholder="Denumire"
            maxLength={120}
            disabled={saving}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {addError && (
            <p role="alert" className="text-red-600 text-sm">
              {addError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setKind(null)}
            >
              Anulează
            </Button>
            <Button
              type="button"
              disabled={saving || !name.trim()}
              onClick={() => void add()}
            >
              {saving ? "Se salvează…" : "Adaugă și selectează"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
