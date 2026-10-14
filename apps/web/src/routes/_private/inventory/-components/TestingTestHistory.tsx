import { Button } from "@nasti/ui/button"
import { Card } from "@nasti/ui/card"
import { Pencil } from "lucide-react"
import { useState } from "react"

import { QualityTestModal } from "@/components/tests/QualityTestModal"
import {
  useTestingTestHistory,
  type TestingTestHistoryRow,
} from "@/hooks/useTestingTestHistory"
import { QualityTestStats } from "./BatchTableRow/Common"

/**
 * The quality tests this organisation has performed, including those on bags it
 * has since used up or returned, which no longer appear among its bags.
 */
export const TestingTestHistory = () => {
  const { data: history, isLoading, error } = useTestingTestHistory()
  const [editing, setEditing] = useState<TestingTestHistoryRow | null>(null)

  return (
    <>
      <Card className="overflow-hidden">
        {isLoading && <div className="h-20 w-full animate-pulse space-y-4" />}
        {!isLoading && error && (
          <div className="p-8 text-center">
            <h3 className="mb-2 text-lg font-semibold">
              Could not load test results
            </h3>
            <p className="text-muted-foreground">{error.message}</p>
          </div>
        )}
        {!isLoading && !error && history?.length === 0 && (
          <div className="text-muted-foreground p-8 text-center">
            <h3 className="mb-2 text-lg font-semibold">No test results</h3>
            <p>Tests you record will appear here.</p>
          </div>
        )}
        {!isLoading && !error && history && history.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">
                    Batch Code
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">Species</th>
                  <th className="px-4 py-3 text-left font-semibold">Owner</th>
                  <th className="px-4 py-3 text-left font-semibold">Tested</th>
                  <th className="px-4 py-3 text-left font-semibold">Type</th>
                  <th className="px-4 py-3 text-left font-semibold">Result</th>
                  <th className="px-4 py-3 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.test.id} className="hover:bg-muted/50 border-b">
                    <td className="px-4 py-3 font-mono text-sm">
                      {row.batchCode ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-col">
                        <span>{row.speciesName ?? "Unknown species"}</span>
                        <span className="text-muted-foreground text-xs">
                          {row.collectionCode ?? ""}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {row.ownerName ?? "Unknown organisation"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {row.test.tested_at
                        ? new Date(row.test.tested_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {row.test.result.test_type}
                    </td>
                    <td className="px-4 py-3">
                      {row.test.statistics ? (
                        <QualityTestStats
                          statistics={row.test.statistics}
                          repeatsCount={row.test.result.repeats.length}
                        />
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          No statistics
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(row)}
                        title="Edit test"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <QualityTestModal
          isOpen
          onClose={() => setEditing(null)}
          batchId={editing.test.batch_id}
          subBatchId={editing.test.sub_batch_id}
          existingTest={editing.test}
        />
      )}
    </>
  )
}
