"use client";
import { useRef, useState } from "react";
import {
  catalogRequest,
  useEquipmentCatalog,
} from "@/lib/equipment-catalog/client";
import {
  equipmentCatalogChoices,
  equipmentCatalogManufacturer,
  equipmentCatalogModels,
  type EquipmentCatalogOption,
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
function CatalogSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: EquipmentCatalogOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
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
          disabled={disabled}
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
  const { catalog, setCatalog, error, loading, reload } = useEquipmentCatalog();
  const manufacturer = equipmentCatalogManufacturer(catalog, producator);
  const models = equipmentCatalogModels(catalog, producator);
  const saveLock = useRef(false);
  const [kind, setKind] = useState<EquipmentCatalogKind | null>(null),
    [name, setName] = useState(""),
    [saving, setSaving] = useState(false),
    [addError, setAddError] = useState("");
  const add = async () => {
    if (!kind || saveLock.current || (kind === "models" && !manufacturer))
      return;
    saveLock.current = true;
    setSaving(true);
    setAddError("");
    try {
      const result = await catalogRequest({
        kind,
        name,
        ...(kind === "models" ? { manufacturerId: manufacturer!.id } : {}),
      });
      setCatalog(result.catalog);
      onChange(
        kind === "manufacturers"
          ? {
              producator: result.option.name,
              ...(result.option.name !== producator ? { model: "" } : {}),
            }
          : { model: result.option.name },
      );
      setKind(null);
    } catch (e) {
      setAddError((e as Error).message);
    } finally {
      saveLock.current = false;
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
                  options={
                    key === "manufacturers" ? catalog.manufacturers : models
                  }
                  disabled={loading || (key === "models" && !manufacturer)}
                  onChange={(value) =>
                    onChange(
                      key === "manufacturers"
                        ? {
                            producator: value,
                            ...(value !== producator ? { model: "" } : {}),
                          }
                        : { model: value },
                    )
                  }
                />
                {canAdd && (
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={`Adaugă ${label.toLowerCase()}`}
                    disabled={loading || (key === "models" && !manufacturer)}
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
              {key === "models" && !manufacturer && (
                <p className="text-xs text-muted-foreground">
                  Selectați mai întâi producătorul.
                </p>
              )}
              {key === "models" && manufacturer && !models.length && (
                <p className="text-xs text-muted-foreground">
                  Niciun model pentru acest producător.
                </p>
              )}
            </div>
          );
        })}
      </div>
      {error && (
        <div role="alert" className="text-sm text-red-600">
          {error}{" "}
          <Button type="button" variant="link" onClick={() => void reload()}>
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
              {kind === "manufacturers"
                ? "Adaugă producător"
                : `Adaugă model pentru ${manufacturer?.name || "producător"}`}
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
              disabled={
                saving || !name.trim() || (kind === "models" && !manufacturer)
              }
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
