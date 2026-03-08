"use client"

import { useMemo, useState, type ReactNode } from "react"
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  rectSortingStrategy,
} from "@dnd-kit/sortable"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  CRM_PIPELINE_STAGE_LABELS,
  CRM_OPPORTUNITY_TYPES,
  getPipelineStagesForOpportunityType,
  isLostPipelineStage,
} from "@/lib/crm/constants"
import type { CrmOpportunity } from "@/lib/crm/types"
import { priorityLabel } from "@/lib/crm/presenters"
import { crmUi } from "@/components/crm/ui"

interface OpportunitiesKanbanProps {
  opportunities: CrmOpportunity[]
  onMove: (input: {
    opportunityId: string
    toStage: CrmOpportunity["pipelineStage"]
    lostReason?: string
    createRecontactTask?: boolean
  }) => Promise<void>
  readOnly?: boolean
}

function StageColumn({
  stage,
  children,
  readOnly = false,
}: {
  stage: string
  children: ReactNode
  readOnly?: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })

  return (
    <div
      ref={setNodeRef}
      id={stage}
      className={`rounded-xl border bg-neutral-50/70 p-2.5 transition ${
        !readOnly && isOver ? "border-blue-300 ring-2 ring-blue-500/10" : "border-neutral-200"
      }`}
    >
      {children}
    </div>
  )
}

function CardItem({ opportunity, readOnly = false }: { opportunity: CrmOpportunity; readOnly?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: opportunity.id,
    disabled: readOnly,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(readOnly ? {} : attributes)}
      {...(readOnly ? {} : listeners)}
      className={`${crmUi.interactiveRow} p-3 text-sm ${readOnly ? "cursor-default" : "cursor-grab active:cursor-grabbing"}`}
    >
      <p className="truncate text-sm font-medium text-neutral-800" title={opportunity.displayTitle}>
        {opportunity.displayTitle}
      </p>
      <p className="mt-1 truncate text-xs text-neutral-500">{priorityLabel(opportunity.priority)}</p>
      <div className="mt-2">
        <Link href={`/crm/opportunities/${opportunity.id}/timeline`} className="inline-flex items-center text-xs font-medium text-blue-700 hover:underline">
          Deschide oportunitatea
        </Link>
      </div>
    </div>
  )
}

export function OpportunitiesKanban({ opportunities, onMove, readOnly = false }: OpportunitiesKanbanProps) {
  const isReadOnly = Boolean(readOnly)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const [pendingLost, setPendingLost] = useState<{ opportunityId: string; toStage: CrmOpportunity["pipelineStage"] } | null>(null)
  const [lostReason, setLostReason] = useState("")
  const [createRecontactTask, setCreateRecontactTask] = useState(false)

  const activeStages = useMemo(() => {
    const visibleTypes = Array.from(new Set(opportunities.map((opportunity) => opportunity.opportunityType)))
    if (!visibleTypes.length) return getPipelineStagesForOpportunityType("VANZARI")
    if (visibleTypes.length === 1) return getPipelineStagesForOpportunityType(visibleTypes[0])
    return Array.from(
      new Set(
        CRM_OPPORTUNITY_TYPES.flatMap((type) =>
          visibleTypes.includes(type as CrmOpportunity["opportunityType"]) ? getPipelineStagesForOpportunityType(type) : []
        )
      )
    )
  }, [opportunities])

  const stageMap = useMemo(() => {
    const map: Record<string, CrmOpportunity[]> = {}
    activeStages.forEach((stage) => {
      map[stage] = []
    })

    opportunities.forEach((opportunity) => {
      if (!map[opportunity.pipelineStage]) map[opportunity.pipelineStage] = []
      map[opportunity.pipelineStage].push(opportunity)
    })

    return map
  }, [activeStages, opportunities])

  const handleDragEnd = async (event: DragEndEvent) => {
    if (isReadOnly) return

    const activeId = String(event.active.id || "")
    if (!activeId) return

    const activeOpportunity = opportunities.find((opportunity) => opportunity.id === activeId)
    if (!activeOpportunity) return

    const overId = String(event.over?.id || "")
    if (!overId) return

    const overOpportunity = opportunities.find((opportunity) => opportunity.id === overId)
    const nextStage =
      overOpportunity?.pipelineStage ||
      (activeStages.find((stage) => stage === overId) as CrmOpportunity["pipelineStage"] | undefined)

    if (!nextStage || nextStage === activeOpportunity.pipelineStage) return

    if (isLostPipelineStage(nextStage)) {
      setPendingLost({ opportunityId: activeOpportunity.id, toStage: nextStage })
      return
    }

    await onMove({
      opportunityId: activeOpportunity.id,
      toStage: nextStage,
    })
  }

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {activeStages.map((stage) => (
            <StageColumn key={stage} stage={stage} readOnly={isReadOnly}>
              <div className="mb-1.5 flex items-center justify-between">
                <h4 className="text-[11px] font-medium uppercase tracking-wide text-neutral-600">{CRM_PIPELINE_STAGE_LABELS[stage] || stage}</h4>
                <span className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[11px] text-neutral-600">{stageMap[stage]?.length || 0}</span>
              </div>
              <SortableContext items={(stageMap[stage] || []).map((opportunity) => opportunity.id)} strategy={rectSortingStrategy}>
                <div className="space-y-2">
                  {(stageMap[stage] || []).map((opportunity) => (
                    <CardItem key={opportunity.id} opportunity={opportunity} readOnly={isReadOnly} />
                  ))}
                </div>
              </SortableContext>
            </StageColumn>
          ))}
        </div>
      </DndContext>

      <Dialog
        open={!!pendingLost}
        onOpenChange={(open) => {
          if (!open) {
            setPendingLost(null)
            setLostReason("")
            setCreateRecontactTask(false)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmă mutarea în etapă finală</DialogTitle>
            <DialogDescription>Motivul pierderii este obligatoriu.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="lostReason">Motiv pierdere</Label>
              <Input
                id="lostReason"
                value={lostReason}
                onChange={(event) => setLostReason(event.target.value)}
                placeholder="Ex: buget insuficient"
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox id="recontact" checked={createRecontactTask} onCheckedChange={(value) => setCreateRecontactTask(Boolean(value))} />
              <Label htmlFor="recontact">Creează sarcină de recontactare</Label>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setPendingLost(null)
                  setLostReason("")
                  setCreateRecontactTask(false)
                }}
              >
                Anulează
              </Button>
              <Button
                onClick={async () => {
                  if (!pendingLost || !lostReason.trim()) return
                  await onMove({
                    opportunityId: pendingLost.opportunityId,
                    toStage: pendingLost.toStage,
                    lostReason: lostReason.trim(),
                    createRecontactTask,
                  })
                  setPendingLost(null)
                  setLostReason("")
                  setCreateRecontactTask(false)
                }}
                disabled={!lostReason.trim()}
              >
                Confirmă
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
