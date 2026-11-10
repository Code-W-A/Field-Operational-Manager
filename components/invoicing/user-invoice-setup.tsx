"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  IssuerConfiguration,
  ReferenceEntry,
} from "@/lib/saga/references";
import type { IssuerSetupInput } from "@/lib/invoicing/issuer-setup.server";
import {
  formatInvoiceNumber,
  type NumberingCounter,
} from "@/lib/invoicing/numbering";

type State = {
  profile: IssuerConfiguration | null;
  counter: NumberingCounter | null;
  writesEnabled: boolean;
  user: { name: string };
};
type Preview = {
  confirmationHash: string;
  nextNumber: string;
  firstActivation: boolean;
  agent: { source: string };
};
export function UserInvoiceSetup({
  uid,
  onDirty,
  onBusy,
}: {
  uid: string;
  onDirty?: (v: boolean) => void;
  onBusy?: (v: boolean) => void;
}) {
  const { user } = useAuth();
  const [state, setState] = useState<State | null>(null),
    [prefix, setPrefix] = useState(""),
    [last, setLast] = useState("");
  const [agents, setAgents] = useState<ReferenceEntry[]>([]),
    [agentId, setAgentId] = useState(""),
    [manual, setManual] = useState(false),
    [code, setCode] = useState(""),
    [name, setName] = useState(""),
    [agentConfirmed, setAgentConfirmed] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const [query, setQuery] = useState(""),
    [cursor, setCursor] = useState<string | null>(null),
    [preview, setPreview] = useState<{ data: Preview; key: string } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [changed, setChanged] = useState(false);
  const callbacks = useRef({ onDirty, onBusy });
  callbacks.current = { onDirty, onBusy };
  const lock = useRef(false);
  const [reloadConfirm, setReloadConfirm] = useState(false);
  const [previewRetry, setPreviewRetry] = useState(0);
  async function reloadSaved() {
    setBusy(true);
    callbacks.current.onBusy?.(true);
    try {
      const [s, a] = await Promise.all([
        request(`issuers/${encodeURIComponent(uid)}/setup`),
        request("references/agents"),
      ]);
      setState(s);
      setPrefix(s.profile?.prefix || "");
      setLast(s.profile?.lastVerifiedNumber || "");
      setAgents(
        s.profile &&
          !a.entries.some((v: ReferenceEntry) => v.id === s.profile.agentId)
          ? [
              ...a.entries,
              {
                id: s.profile.agentId,
                code: s.profile.agentCode,
                name: s.profile.agentName,
                revision: s.profile.agentRevision,
                source: "Referință salvată",
              },
            ]
          : a.entries,
      );
      setAgentId(s.profile?.agentId || "");
      setCursor(a.nextCursor);
      setManual(false);
      setConfirmed(false);
      setAgentConfirmed(false);
      setChanged(false);
      setError("");
      setReloadConfirm(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      callbacks.current.onBusy?.(false);
    }
  }
  const agent = agents.find((a) => a.id === agentId);
  const input: IssuerSetupInput = {
    expectedRevision: state?.profile?.revision || 0,
    prefix,
    lastVerifiedNumber: last,
    agent: manual
      ? { code, name, confirmed: agentConfirmed }
      : {
          id: agentId,
          revision: agent?.revision || state?.profile?.agentRevision || 0,
        },
    exclusiveConfirmed: confirmed,
    lastNumberConfirmed: confirmed,
  };
  const inputKey = JSON.stringify(input);
  async function request(path: string, body?: unknown) {
    const token = await user?.getIdToken();
    const r = await fetch(`/api/integrations/saga/${path}`, {
      method: body ? "POST" : "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token || ""}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json();
    if (!r.ok)
      throw Object.assign(
        new Error(data.error || "Configurarea nu poate fi citită."),
        { status: r.status },
      );
    return data;
  }
  useEffect(() => {
    let active = true;
    void Promise.all([
      request(`issuers/${encodeURIComponent(uid)}/setup`),
      request("references/agents"),
    ])
      .then(([s, a]) => {
        if (!active) return;
        setState(s);
        setPrefix(s.profile?.prefix || "");
        setLast(s.profile?.lastVerifiedNumber || "");
        setAgentId(s.profile?.agentId || "");
        setAgents(
          s.profile &&
            !a.entries.some((v: ReferenceEntry) => v.id === s.profile.agentId)
            ? [
                ...a.entries,
                {
                  id: s.profile.agentId,
                  code: s.profile.agentCode,
                  name: s.profile.agentName,
                  revision: s.profile.agentRevision,
                  source: "Referință salvată",
                },
              ]
            : a.entries,
        );
        setCursor(a.nextCursor);
        setManual(!s.profile && a.entries.length === 0);
        setChanged(false);
        setError("");
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      callbacks.current.onDirty?.(false);
    };
  }, [uid, user?.uid]);
  useEffect(() => {
    callbacks.current.onDirty?.(changed);
  }, [changed]);
  useEffect(() => {
    setPreview(null);
    if (
      !state ||
      !prefix.trim() ||
      !/^\d{1,18}$/.test(last) ||
      (manual ? !code.trim() || !name.trim() : !agentId)
    )
      return;
    let active = true;
    const timer = setTimeout(() => {
      void request(
        `issuers/${encodeURIComponent(uid)}/setup/preview`,
        JSON.parse(inputKey),
      )
        .then((data) => {
          if (active) {
            setPreview({ data, key: inputKey });
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    inputKey,
    uid,
    !!state,
    state?.counter?.revision,
    previewRetry,
    user?.uid,
  ]);
  function edit(fn: () => void) {
    fn();
    setChanged(true);
    setNotice("");
  }
  async function search(next = "") {
    try {
      const a = await request(
        `references/agents?${new URLSearchParams({ q: query, field: /^\d/.test(query) ? "code" : "name", cursor: next })}`,
      );
      setAgents((old) => (next ? [...old, ...a.entries] : a.entries));
      setCursor(a.nextCursor);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function save() {
    if (lock.current || !preview || preview.key !== inputKey) return;
    lock.current = true;
    setBusy(true);
    callbacks.current.onBusy?.(true);
    setError("");
    try {
      const d = await request(`issuers/${encodeURIComponent(uid)}/setup`, {
        ...input,
        confirmationHash: preview.data.confirmationHash,
      });
      const s = await request(`issuers/${encodeURIComponent(uid)}/setup`);
      setState(s);
      setAgents((old) =>
        old.some((a) => a.id === d.profile.agentId)
          ? old
          : [
              ...old,
              {
                id: d.profile.agentId,
                code: d.profile.agentCode,
                name: d.profile.agentName,
                revision: d.profile.agentRevision,
                source: manual ? "Confirmat de admin" : "Referință salvată",
              } as ReferenceEntry,
            ],
      );
      setAgentId(d.profile.agentId);
      setManual(false);
      setConfirmed(false);
      setChanged(false);
      setNotice(
        `Facturare configurată. Următorul număr: ${d.nextNumber} — nerezervat.`,
      );
      window.dispatchEvent(new Event("invoice-numbering-changed"));
    } catch (e) {
      setError((e as Error).message);
      if ((e as { status?: number }).status === 409)
        setPreviewRetry((v) => v + 1);
    } finally {
      lock.current = false;
      setBusy(false);
      callbacks.current.onBusy?.(false);
    }
  }
  const active = !!state?.profile?.numbering;
  return (
    <section
      aria-label="Facturare SAGA"
      data-invoice-setup
      className="min-w-0 space-y-3 rounded-lg border p-4 text-sm"
    >
      <h3 className="font-semibold">Facturare SAGA</h3>
      <p>
        Configurare separată de datele contului. Nu emite facturi și nu consumă
        numere.
      </p>
      {!state && !error && <p>Se citește configurarea…</p>}
      {error && (
        <p role="alert" className="text-red-700">
          {error} Editările sunt păstrate.
        </p>
      )}
      {error && state && (
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => setReloadConfirm(true)}
        >
          Reîncarcă datele salvate
        </Button>
      )}
      {reloadConfirm && (
        <div
          role="group"
          aria-label="Reîncărcare configurare facturare"
          className="space-y-2 rounded border p-2"
        >
          <p>
            Înlocuiești configurarea nesalvată cu datele salvate? Datele
            generale ale contului rămân în formular.
          </p>
          <Button
            type="button"
            disabled={busy}
            onClick={() => void reloadSaved()}
          >
            Confirmă reîncărcarea
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setReloadConfirm(false)}
          >
            Păstrează editările
          </Button>
        </div>
      )}
      {notice && (
        <p role="status" className="text-green-800">
          {notice}
        </p>
      )}
      {state && (
        <fieldset disabled={busy || !state.writesEnabled} className="space-y-3">
          <p>
            {active ? "Numerotare activă" : "Neconfigurat"} · {state.user.name}
          </p>
          <label className="block">
            Seria/prefixul
            <Input
              aria-label="Serie utilizator"
              value={prefix}
              maxLength={32}
              disabled={active}
              onChange={(e) =>
                edit(() => {
                  setPrefix(e.target.value);
                  setConfirmed(false);
                })
              }
            />
          </label>
          <label className="block">
            Ultimul număr verificat în SAGA
            <Input
              aria-label="Ultimul număr utilizator"
              inputMode="numeric"
              maxLength={18}
              value={last}
              disabled={active}
              onChange={(e) =>
                edit(() => {
                  setLast(e.target.value);
                  setConfirmed(false);
                })
              }
            />
          </label>
          {active && (
            <p>
              Ultima valoare a contorului:{" "}
              {state.counter
                ? formatInvoiceNumber(
                    state.counter.prefix,
                    state.counter.lastNumber,
                    state.counter.width,
                  )
                : "indisponibilă"}
              . Seria și valoarea inițială sunt blocate. Corecțiile sunt numai
              înainte, prin administrare avansată.
            </p>
          )}
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={manual}
              onChange={(e) =>
                edit(() => {
                  setManual(e.target.checked);
                  setAgentConfirmed(false);
                })
              }
            />
            Introduc agentul după codul din SAGA
          </label>
          {manual ? (
            <>
              <label className="block">
                Cod agent SAGA
                <Input
                  aria-label="Cod agent SAGA"
                  value={code}
                  maxLength={100}
                  onChange={(e) =>
                    edit(() => {
                      setCode(e.target.value);
                      setAgentConfirmed(false);
                    })
                  }
                />
              </label>
              <label className="block">
                Denumire agent SAGA
                <Input
                  aria-label="Denumire agent SAGA"
                  value={name}
                  maxLength={300}
                  onChange={(e) =>
                    edit(() => {
                      setName(e.target.value);
                      setAgentConfirmed(false);
                    })
                  }
                />
              </label>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={agentConfirmed}
                  onChange={(e) =>
                    edit(() => setAgentConfirmed(e.target.checked))
                  }
                />
                Confirm că am verificat codul și denumirea agentului în SAGA.
              </label>
              <p>Confirmare administrativă, fără verificare online.</p>
            </>
          ) : (
            <>
              <label className="block">
                Caută agent existent
                <Input
                  aria-label="Caută agent existent"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <Button
                type="button"
                variant="outline"
                onClick={() => void search()}
              >
                Caută agent
              </Button>
              <label className="block">
                Agent SAGA
                <select
                  aria-label="Agent SAGA existent"
                  className="w-full rounded border p-2"
                  value={agentId}
                  onChange={(e) => edit(() => setAgentId(e.target.value))}
                >
                  <option value="">Selectează agentul</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </select>
              </label>
              {cursor && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void search(cursor)}
                >
                  Mai mulți agenți
                </Button>
              )}
              {agent && <p>Sursă agent: {agent.source}</p>}
            </>
          )}
          {preview?.key === inputKey && (
            <>
              <p className="break-words font-semibold">
                Următorul număr: {preview.data.nextNumber} — nerezervat
              </p>
              {preview.data.firstActivation && (
                <p className="text-amber-800">
                  Prima activare: după salvare, doar utilizatorii cu numerotare
                  configurată vor putea emite. Ceilalți pot salva ciorne.
                </p>
              )}
            </>
          )}
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => edit(() => setConfirmed(e.target.checked))}
            />
            Confirm ultimul număr verificat și folosirea exclusivă a seriei prin
            FOM.
          </label>
          <Button
            type="button"
            className="h-auto max-w-full whitespace-normal"
            disabled={
              !changed ||
              !confirmed ||
              (manual && !agentConfirmed) ||
              preview?.key !== inputKey
            }
            onClick={() => void save()}
          >
            {busy ? "Se salvează…" : "Salvează configurarea facturării"}
          </Button>
        </fieldset>
      )}
    </section>
  );
}
