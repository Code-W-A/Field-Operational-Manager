import { DEFAULT_POLICY, parsePolicy } from "./policy"

type Dependencies = {
  requireAdmin: (request: Request) => Promise<{ uid: string | null }>
  read: () => Promise<unknown>
  save: (policy: NonNullable<ReturnType<typeof parsePolicy>>, uid: string) => Promise<void>
}

export function policyHandlers(deps: Dependencies) {
  const json = (body: unknown, status = 200) => Response.json(body, {
    status, headers: { "Cache-Control": "no-store, max-age=0" },
  })
  const failure = (error: unknown) => {
    const status = (error as { status?: number })?.status
    return json({ error: status === 401 ? "Autentificare necesară." : status === 403 ? "Acces interzis." : "Politica de actualizare nu este disponibilă." },
      status === 401 || status === 403 ? status : 503)
  }
  return {
    async publicGet() {
      try { return json(parsePolicy(await deps.read()) ?? DEFAULT_POLICY) }
      catch (error) { return failure(error) }
    },
    async adminGet(request: Request) {
      try {
        await deps.requireAdmin(request)
        return json(parsePolicy(await deps.read()) ?? DEFAULT_POLICY)
      } catch (error) { return failure(error) }
    },
    async adminPut(request: Request) {
      try {
        const actor = await deps.requireAdmin(request)
        if (!actor.uid) return json({ error: "Autentificare necesară." }, 401)
        let body: unknown
        try { body = await request.json() } catch { return json({ error: "Date invalide." }, 400) }
        const policy = parsePolicy(body)
        if (!policy) return json({ error: "Introdu un build întreg între 1 și 2100000000 și un mesaj de maximum 500 de caractere." }, 400)
        await deps.save(policy, actor.uid)
        return json(policy)
      } catch (error) { return failure(error) }
    },
  }
}
