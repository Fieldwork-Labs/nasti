import { useState } from "react"
import { Button } from "@nasti/ui/button"
import { Checkbox } from "@nasti/ui/checkbox"
import { useCreateLinkRequest } from "@/hooks/useTestingOrgs"
import { useToast } from "@nasti/ui/hooks"
import type { Organisation } from "@nasti/common/types"

interface LinkRequestModalProps {
  testingOrg: Organisation
  onSuccess: () => void
  onCancel: () => void
}

export const LinkRequestModal = ({
  testingOrg,
  onSuccess,
  onCancel,
}: LinkRequestModalProps) => {
  const { toast } = useToast()
  const createRequest = useCreateLinkRequest()
  const [canTest, setCanTest] = useState(false)
  const [canProcess, setCanProcess] = useState(false)
  const [error, setError] = useState<string>()

  const handleSubmit = async () => {
    setError(undefined)

    if (!canTest && !canProcess) {
      setError("Please select at least one permission")
      return
    }

    try {
      await createRequest.mutateAsync({
        testing_org_id: testingOrg.id,
        can_test: canTest,
        can_process: canProcess,
      })
      onSuccess()
    } catch (err) {
      toast({
        variant: "destructive",
        description:
          err instanceof Error ? err.message : "Failed to send request",
      })
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-muted-foreground text-sm">
          Select the permissions you want to grant to {testingOrg.name}:
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-start space-x-3 rounded-lg border p-4">
          <Checkbox
            id="can_test"
            checked={canTest}
            onCheckedChange={(checked) => setCanTest(Boolean(checked))}
          />
          <div className="grid gap-1.5 leading-none">
            <label
              htmlFor="can_test"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Can Test Samples
            </label>
            <p className="text-muted-foreground text-sm">
              Allow this organisation to receive sample batches for testing. The
              main batch remains with you.
            </p>
          </div>
        </div>

        <div className="flex items-start space-x-3 rounded-lg border p-4">
          <Checkbox
            id="can_process"
            checked={canProcess}
            onCheckedChange={(checked) => setCanProcess(Boolean(checked))}
          />
          <div className="grid gap-1.5 leading-none">
            <label
              htmlFor="can_process"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Can Process Batches
            </label>
            <p className="text-muted-foreground text-sm">
              Allow this organisation to receive full batches for testing and
              processing. Custody transfers to them temporarily.
            </p>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={createRequest.isPending}
        >
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={createRequest.isPending}>
          {createRequest.isPending ? "Sending..." : "Send Request"}
        </Button>
      </div>
    </div>
  )
}
