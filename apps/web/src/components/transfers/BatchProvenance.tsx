import { TaxonName } from "@nasti/common"
import { Badge } from "@nasti/ui/badge"
import { Calendar } from "lucide-react"

import {
  useReceivedBatchProvenance,
  useReceivedBatchStorageHistory,
  type ProvenanceTest,
} from "@/hooks/useTransfers"

const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString() : "Unknown date"

const DAY_MS = 24 * 60 * 60 * 1000

const formatPeriodLength = (startedAt: string, endedAt: string) => {
  const days = Math.round(
    (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / DAY_MS,
  )
  if (!Number.isFinite(days)) return null
  if (days < 1) return "less than a day"
  return days === 1 ? "1 day" : `${days} days`
}

const QUALITY_TEST_LABELS: Record<string, string> = {
  "x-ray": "X-ray",
  "cut test": "Cut test",
  tz: "TZ",
  germination: "Germination",
}

const testLabel = (test: ProvenanceTest) => {
  const subtype = test.quality_test_type
  if (test.type === "quality") {
    return subtype ? (QUALITY_TEST_LABELS[subtype] ?? subtype) : "Quality test"
  }
  return subtype ? `${test.type} (${subtype})` : test.type
}

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

const repeatCount = (result: ProvenanceTest["result"]) =>
  Array.isArray(result?.repeats) ? result.repeats.length : undefined

const Stat = ({ label, value }: { label: string; value: string }) => (
  <span className="text-sm">
    {label} <span className="font-mono font-bold">{value}</span>
  </span>
)

// Same figures the owner sees for their own quality tests (TSW, PLS with its
// standard error, number of repeats). Only the fields the provenance function
// projects are read, and any of them can be missing.
const TestStatistics = ({ test }: { test: ProvenanceTest }) => {
  const statistics = test.statistics
  if (!statistics) return null

  if (test.type === "quality") {
    const reps = repeatCount(test.result)
    return (
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {isNumber(statistics.tpsu) && (
          <Stat label="TSW" value={`${statistics.tpsu.toFixed(3)}g`} />
        )}
        {isNumber(statistics.pls) && (
          <Stat
            label="PLS"
            value={`${(statistics.pls * 100).toFixed(2)}%${
              isNumber(statistics.standardError) && statistics.standardError
                ? ` ± ${statistics.standardError.toFixed(3)}%`
                : ""
            }`}
          />
        )}
        {reps !== undefined && <Stat label="Reps" value={String(reps)} />}
      </div>
    )
  }

  // Other test types have no dedicated layout: list whatever numbers came back.
  const entries = Object.entries(statistics).filter(
    (entry): entry is [string, number] => isNumber(entry[1]),
  )
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {entries.map(([key, value]) => (
        <Stat key={key} label={key} value={String(value)} />
      ))}
    </div>
  )
}

const Field = ({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) => (
  <div>
    <span className="font-medium">{label}:</span>
    <div className="text-muted-foreground mt-1">{children}</div>
  </div>
)

/**
 * What came with seed received from another organisation: who sent it and when,
 * where it was collected, the latest captured result of each test, and how long
 * it was stored before it arrived. Everything is read from the snapshot taken
 * at transfer, so later edits on the sender's side don't change it.
 *
 * Only valid for a batch with `received_transfer_item_id`; the provenance
 * function raises "Received batch not found" for any other batch.
 */
export const BatchProvenance = ({ batchId }: { batchId: string }) => {
  const {
    data: provenance,
    isLoading,
    error,
  } = useReceivedBatchProvenance(batchId)
  const { data: storage } = useReceivedBatchStorageHistory(batchId)

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-gray-400 p-2">
      <span className="text-sm font-semibold">Provenance</span>

      {isLoading && (
        <div className="animate-pulse space-y-2">
          <div className="h-4 w-1/4 rounded bg-gray-200"></div>
          <div className="h-4 w-1/3 rounded bg-gray-200"></div>
        </div>
      )}

      {error && (
        <div className="text-xs text-red-600">
          Could not load provenance: {error.message}
        </div>
      )}

      {provenance && (
        <>
          <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2 lg:grid-cols-4">
            <Field label="Species">
              {provenance.species_name ? (
                <TaxonName name={provenance.species_name} />
              ) : (
                "Unknown"
              )}
            </Field>
            <Field label="Collection code">
              <span className="font-mono">
                {provenance.source_collection_code ?? "Unknown"}
              </span>
            </Field>
            <Field label="IBRA region">
              {provenance.source_ibra_name || provenance.source_ibra_code ? (
                <>
                  {provenance.source_ibra_name}
                  {provenance.source_ibra_code && (
                    <span className="font-mono">
                      {provenance.source_ibra_name ? " " : ""}(
                      {provenance.source_ibra_code})
                    </span>
                  )}
                </>
              ) : (
                "Unknown"
              )}
            </Field>
            <Field label="Collection year">
              {provenance.source_collection_year ?? "Unknown"}
            </Field>
          </div>

          <div className="space-y-1">
            <span className="text-sm font-medium">Chain of custody</span>
            {provenance.chain.length === 0 ? (
              <div className="text-muted-foreground text-xs">
                No transfers recorded
              </div>
            ) : (
              <ol className="space-y-1">
                {provenance.chain.map((hop) => (
                  <li key={hop.hop} className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4" />
                    <span className="font-mono">
                      {formatDate(hop.transferred_at)}
                    </span>
                    <span>
                      {hop.hop === 0 ? "Sent by" : "Earlier sent by"}{" "}
                      <span className="font-semibold">
                        {hop.sender_org_name}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="space-y-1">
            <span className="text-sm font-medium">Test results</span>
            <div className="text-muted-foreground text-xs">
              Latest result of each test type, as captured when the seed was
              transferred.
            </div>
            {provenance.tests.length === 0 ? (
              <div className="text-muted-foreground text-xs">
                No test results were captured
              </div>
            ) : (
              <ul className="bg-muted/20 space-y-2 rounded-lg p-3">
                {provenance.tests.map((test) => (
                  <li
                    key={`${test.type}-${test.quality_test_type ?? ""}`}
                    className="flex flex-col gap-1"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="outline">{testLabel(test)}</Badge>
                      <span className="font-mono">
                        {formatDate(test.tested_at)}
                      </span>
                      {test.performed_by_org_name && (
                        <span className="text-muted-foreground">
                          by {test.performed_by_org_name}
                        </span>
                      )}
                    </div>
                    <TestStatistics test={test} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <div className="space-y-1">
        <span className="text-sm font-medium">Storage before transfer</span>
        {!storage || storage.length === 0 ? (
          <div className="text-muted-foreground text-xs">
            No storage periods were captured
          </div>
        ) : (
          <ul className="space-y-1">
            {storage.map((period) => {
              const length = formatPeriodLength(
                period.started_at,
                period.ended_at,
              )
              return (
                <li
                  key={`${period.hop}-${period.started_at}`}
                  className="flex items-center gap-2 text-sm"
                >
                  <Calendar className="h-4 w-4" />
                  <span className="font-mono">
                    {formatDate(period.started_at)} to{" "}
                    {formatDate(period.ended_at)}
                  </span>
                  {length && (
                    <span className="text-muted-foreground">({length})</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
