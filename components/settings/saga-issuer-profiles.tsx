"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSagaReferenceRequest } from "./saga-references";
import type {
  IssuerConfiguration,
  IssuerUser,
  ReferenceEntry,
} from "@/lib/saga/references";
export function SagaIssuerProfiles() {
  const request = useSagaReferenceRequest(),
    { user } = useAuth();
  const [users, setUsers] = useState<IssuerUser[]>([]),
    [userCursor, setUserCursor] = useState<string | null>(null),
    [uid, setUid] = useState(""),
    [profile, setProfile] = useState<IssuerConfiguration | null>(null),
    [account, setAccount] = useState<IssuerUser | null>(null),
    [enabled, setEnabled] = useState(false),
    [prefix, setPrefix] = useState(""),
    [last, setLast] = useState(""),
    [agents, setAgents] = useState<ReferenceEntry[]>([]),
    [agent, setAgent] = useState<{
      id: string;
      code: string;
      name: string;
      revision: number;
    } | null>(null),
    [agentCursor, setAgentCursor] = useState<string | null>(null),
    [agentQuery, setAgentQuery] = useState(""),
    [agentSearch, setAgentSearch] = useState(""),
    [exclusive, setExclusive] = useState(false),
    [verified, setVerified] = useState(false),
    [current, setCurrent] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    void Promise.all([request("issuers/users"), request("references/agents")])
      .then(([u, a]) => {
        if (active) {
          setUsers(u.users);
          setUserCursor(u.nextCursor);
          setAgents(a.entries);
          setAgentCursor(a.nextCursor);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [user?.uid]);
  useEffect(() => {
    if (!uid) return;
    let active = true;
    setBusy(true);
    setError("");
    setNotice("");
    setExclusive(false);
    setVerified(false);
    void request(`issuers/${encodeURIComponent(uid)}`)
      .then((d) => {
        if (!active) return;
        const p = d.profile as IssuerConfiguration | null;
        setProfile(p);
        setAccount(d.user);
        setEnabled(d.writesEnabled);
        setPrefix(p?.prefix || "");
        setLast(p?.lastVerifiedNumber || "");
        setAgent(
          p
            ? {
                id: p.agentId,
                code: p.agentCode,
                name: p.agentName,
                revision: p.agentRevision,
              }
            : null,
        );
        setCurrent(!p || d.agentIsCurrent);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [uid, reload, user?.uid]);
  useEffect(() => {
    const changed = () => setReload((v) => v + 1);
    window.addEventListener("invoice-numbering-changed", changed);
    return () =>
      window.removeEventListener("invoice-numbering-changed", changed);
  }, []);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  async function loadAgents(cursor = "") {
    await run(async () => {
      const d = await request(
        `references/agents?${new URLSearchParams({ q: agentQuery, field: "name", cursor })}`,
      );
      setAgents((old) => (cursor ? [...old, ...d.entries] : d.entries));
      setAgentCursor(d.nextCursor);
      setAgentSearch(agentQuery);
    });
  }
  async function save() {
    await run(async () => {
      if (!agent) throw new Error("Alege un agent din referință.");
      const d = await request(`issuers/${encodeURIComponent(uid)}`, "PUT", {
        expectedRevision: profile?.revision || 0,
        prefix,
        lastVerifiedNumber: last,
        agentId: agent.id,
        agentRevision: agent.revision,
        exclusiveConfirmed: exclusive,
        lastNumberConfirmed: verified,
      });
      setProfile(d.profile);
      setCurrent(true);
      setNotice(
        d.profile.numbering
          ? "Profil activ actualizat. Niciun contor nu a fost modificat."
          : `Pregătit pentru etapa de numerotare. Exemplu următor: ${d.exampleNextNumber} — nerezervat. Niciun contor nu a fost modificat.`,
      );
      setExclusive(false);
      setVerified(false);
    });
  }
  return (
    <section
      className="min-w-0 space-y-3 rounded-lg border p-4"
      aria-label="Profiluri de emitere"
    >
      <h3 className="font-semibold">Profiluri de emitere</h3>
      <p className="text-sm">
        Utilizator FOM → serie → agent SAGA. Configurație pregătitoare: nu
        inițializează contoare, nu consumă numere și nu acordă permisiuni de
        facturare.
      </p>
      <label className="block text-sm">
        Cont FOM
        <select
          aria-label="Cont FOM pentru emitere"
          className="w-full min-w-0 rounded border bg-white p-2"
          disabled={busy}
          value={uid}
          onChange={(e) => {
            setUid(e.target.value);
            setAccount(null);
          }}
        >
          <option value="">Selectează un cont existent</option>
          {users.map((u) => (
            <option key={u.uid} value={u.uid} disabled={u.disabled}>
              {u.name} · {u.uid} · {u.role}
              {u.disabled ? " · dezactivat" : ""}
            </option>
          ))}
        </select>
      </label>
      {userCursor && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const d = await request(
                `issuers/users?cursor=${encodeURIComponent(userCursor)}`,
              );
              setUsers((v) => [...v, ...d.users]);
              setUserCursor(d.nextCursor);
            })
          }
        >
          Mai multe conturi
        </Button>
      )}
      {account && (
        <div className="space-y-3">
          <p className="break-all text-sm">
            UID: {account.uid} · Rol: {account.role}
          </p>
          {!["admin", "dispecer"].includes(account.role) && (
            <p className="text-sm">
              Acest cont nu primește drept de facturare prin salvarea
              profilului.
            </p>
          )}
          {profile && (
            <p className="text-sm">
              {profile.numbering
                ? "Numerotare activă"
                : "Pregătit pentru etapa de numerotare"}{" "}
              · Revizie {profile.revision} · {profile.updatedAt} · Autor{" "}
              {profile.updatedBy}
            </p>
          )}
          <label className="block text-sm">
            Serie / prefix
            <Input
              aria-label="Serie profil"
              value={prefix}
              disabled={busy || !enabled || !!profile?.numbering}
              onChange={(e) => {
                setPrefix(e.target.value);
                setExclusive(false);
              }}
              maxLength={32}
            />
          </label>
          <label className="block text-sm">
            Ultima valoare numerică verificată în SAGA
            <Input
              aria-label="Ultima valoare profil"
              value={last}
              disabled={busy || !enabled || !!profile?.numbering}
              inputMode="numeric"
              onChange={(e) => {
                setLast(e.target.value);
                setVerified(false);
              }}
              maxLength={18}
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input
              aria-label="Căutare agent"
              placeholder="Început denumire agent"
              value={agentQuery}
              disabled={busy}
              onChange={(e) => setAgentQuery(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => loadAgents()}
            >
              Caută agenți
            </Button>
          </div>
          <label className="block text-sm">
            Agent implicit
            <select
              aria-label="Agent implicit profil"
              className="w-full min-w-0 rounded border bg-white p-2"
              value={agent?.id || ""}
              disabled={busy || !enabled}
              onChange={(e) => {
                const a = agents.find((a) => a.id === e.target.value);
                setAgent(
                  a
                    ? {
                        id: a.id,
                        code: a.code,
                        name: a.name,
                        revision: a.revision,
                      }
                    : null,
                );
              }}
            >
              <option value="">Selectează agentul din referință</option>
              {agent && !agents.some((a) => a.id === agent.id) && (
                <option value={agent.id}>
                  {agent.code} — {agent.name} (salvat)
                </option>
              )}
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          </label>
          {agent &&
            agents.some(
              (a) => a.id === agent.id && a.revision !== agent.revision,
            ) && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const a = agents.find((a) => a.id === agent.id)!;
                  setAgent({
                    id: a.id,
                    code: a.code,
                    name: a.name,
                    revision: a.revision,
                  });
                }}
              >
                Confirmă versiunea actuală a agentului
              </Button>
            )}
          {agentCursor && (
            <Button
              variant="outline"
              disabled={busy || agentQuery !== agentSearch}
              onClick={() => loadAgents(agentCursor)}
            >
              Mai mulți agenți
            </Button>
          )}
          {!current && (
            <p className="text-sm">
              Referința agentului s-a modificat. Reîncarcă lista și confirmă
              agentul actual.
            </p>
          )}
          <label className="block text-sm">
            <input
              type="checkbox"
              disabled={busy || !enabled}
              checked={exclusive}
              onChange={(e) => setExclusive(e.target.checked)}
            />{" "}
            Confirm că seria va fi folosită exclusiv prin FOM
          </label>
          <label className="block text-sm">
            <input
              type="checkbox"
              disabled={busy || !enabled}
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
            />{" "}
            Confirm ultima valoare numerică verificată în SAGA
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy || !enabled || !exclusive || !verified || !agent}
              onClick={save}
            >
              Salvează profilul de emitere
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setReload((v) => v + 1)}
            >
              Reîncarcă profilul
            </Button>
          </div>
          {!enabled && (
            <p className="text-sm">Scrierile integrării sunt dezactivate.</p>
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
    </section>
  );
}
