import { Button } from "@nasti/ui/button"
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

  const handleSubmit = async () => {
    try {
      await createRequest.mutateAsync({ testing_org_id: testingOrg.id })
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
      <div className="space-y-2">
        <p className="text-muted-foreground text-sm">
          Request a link with {testingOrg.name}.
        </p>
        <p className="text-muted-foreground text-sm">
          Once they accept, you can send them bags of seed for testing. Each bag
          stays in their custody until it is returned or used up.
        </p>
      </div>

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
