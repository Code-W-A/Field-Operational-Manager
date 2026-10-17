"use client";
import { useRef, useState } from "react";
import {
  catalogRequest,
  useEquipmentCatalog,
} from "@/lib/equipment-catalog/client";
import type {
  EquipmentCatalogKind,
  EquipmentCatalogOption,
} from "@/packages/fom-domain/equipment-catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Editor = { kind: EquipmentCatalogKind; option?: EquipmentCatalogOption };
export function EquipmentCatalogManager() {
  const { catalog, error, loading, reload } = useEquipmentCatalog(true);
  const [selectedId, setSelectedId] = useState("");
  const selected = catalog.manufacturers.find(
    (option) => option.id === selectedId,
  );
  const models = catalog.models.filter(
    (option) => option.manufacturerId === selectedId,
  );
  const [editor, setEditor] = useState<Editor | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const lock = useRef(false);
  const openEditor = (value: Editor) => {
    setEditor(value);
    setName(value.option?.name || "");
    setMutationError("");
  };
  async function save() {
    if (!editor || lock.current || (editor.kind === "models" && !selected))
      return;
    lock.current = true;
    setBusy(true);
    setMutationError("");
    try {
      const result = await catalogRequest(
        {
          kind: editor.kind,
          name,
          ...(editor.option ? { id: editor.option.id } : {}),
          ...(editor.kind === "models" ? { manufacturerId: selectedId } : {}),
        },
        { method: editor.option ? "PATCH" : "POST" },
      );
      if (editor.kind === "manufacturers") setSelectedId(result.option.id);
      await reload();
      setEditor(null);
    } catch (error) {
      setMutationError((error as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function toggle(
    kind: EquipmentCatalogKind,
    option: EquipmentCatalogOption,
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMutationError("");
    try {
      await catalogRequest(
        { kind, id: option.id, hidden: !option.hidden },
        { method: "PATCH" },
      );
      await reload();
    } catch (error) {
      setMutationError((error as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Producători și modele</CardTitle>
        <CardDescription>
          Același catalog este folosit la echipamente, pe web și în aplicația
          mobilă. Selectați un producător pentru a gestiona modelele lui.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div role="alert">
            {error}{" "}
            <Button variant="link" onClick={() => void reload()}>
              Reîncearcă încărcarea catalogului
            </Button>
          </div>
        )}
        {mutationError && !editor && (
          <p role="alert" className="text-sm text-red-600">
            {mutationError}
          </p>
        )}
        <Button
          type="button"
          disabled={busy || loading}
          onClick={() => openEditor({ kind: "manufacturers" })}
        >
          Adaugă producător
        </Button>
        <div className="space-y-2">
          <label htmlFor="catalog-manufacturer" className="text-sm font-medium">
            Producător administrat
          </label>
          <select
            id="catalog-manufacturer"
            className="w-full rounded-md border bg-background p-2"
            disabled={busy || loading}
            value={selectedId}
            onChange={(event) => {
              setSelectedId(event.target.value);
              setMutationError("");
            }}
          >
            <option value="">
              {loading ? "Se încarcă…" : "Selectați producătorul"}
            </option>
            {catalog.manufacturers.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
                {option.hidden ? " (ascuns)" : ""}
              </option>
            ))}
          </select>
        </div>
        {selected && (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  openEditor({ kind: "manufacturers", option: selected })
                }
              >
                Redenumește producătorul
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void toggle("manufacturers", selected)}
              >
                {selected.hidden
                  ? "Reactivează producătorul"
                  : "Ascunde producătorul"}
              </Button>
              <Button
                type="button"
                disabled={busy || selected.hidden}
                onClick={() => openEditor({ kind: "models" })}
              >
                Adaugă model pentru {selected.name}
              </Button>
            </div>
            {selected.hidden && (
              <p className="text-sm text-muted-foreground">
                Producătorul și modelele sale sunt ascunse la selecția
                echipamentelor. Valorile deja salvate rămân păstrate.
              </p>
            )}
            <div
              className="space-y-2"
              aria-label={`Modele pentru ${selected.name}`}
            >
              {!models.length && (
                <p className="text-sm text-muted-foreground">
                  Niciun model pentru acest producător.
                </p>
              )}
              {models.map((option) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                  key={option.id}
                >
                  <span>
                    {option.name}
                    {option.hidden ? " (ascuns)" : ""}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      aria-label={`Redenumește modelul ${option.name}`}
                      onClick={() => openEditor({ kind: "models", option })}
                    >
                      Redenumește
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      aria-label={`${option.hidden ? "Reactivează" : "Ascunde"} modelul ${option.name}`}
                      onClick={() => void toggle("models", option)}
                    >
                      {option.hidden ? "Reactivează" : "Ascunde"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        <Dialog
          open={!!editor}
          onOpenChange={(open) => {
            if (!open && !lock.current) setEditor(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editor?.option ? "Redenumește" : "Adaugă"}{" "}
                {editor?.kind === "manufacturers" ? "producător" : "model"}
              </DialogTitle>
              <DialogDescription>
                {editor?.kind === "models"
                  ? `Producător: ${selected?.name || ""}`
                  : "Denumirea va fi disponibilă la selecția echipamentelor."}
              </DialogDescription>
            </DialogHeader>
            <Input
              aria-label="Denumire"
              value={name}
              maxLength={120}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
            {mutationError && (
              <p role="alert" className="text-sm text-red-600">
                {mutationError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setEditor(null)}
              >
                Anulează
              </Button>
              <Button
                type="button"
                disabled={busy || !name.trim()}
                onClick={() => void save()}
              >
                {busy ? "Se salvează…" : "Salvează denumirea"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
