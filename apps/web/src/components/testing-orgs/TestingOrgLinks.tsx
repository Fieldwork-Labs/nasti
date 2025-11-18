import { Button } from "@nasti/ui/button"
import { Card } from "@nasti/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nasti/ui/tabs"
import { useToast } from "@nasti/ui/hooks"
import { Building2, Link as LinkIcon, Clock, Check, X } from "lucide-react"
import {
  useIncomingLinkRequests,
  useTestingOrgAcceptedLinks,
  useAcceptLinkRequest,
  useRejectLinkRequest,
} from "@/hooks/useTestingOrgs"

export const TestingOrgLinks = () => {
  const { toast } = useToast()
  const { data: incomingRequests, isLoading: requestsLoading } =
    useIncomingLinkRequests()
  const { data: acceptedLinks, isLoading: linksLoading } =
    useTestingOrgAcceptedLinks()

  const acceptRequest = useAcceptLinkRequest()
  const rejectRequest = useRejectLinkRequest()

  const handleAccept = async (requestId: string) => {
    try {
      await acceptRequest.mutateAsync(requestId)
      toast({
        description: "Link request accepted successfully",
      })
    } catch (error) {
      toast({
        variant: "destructive",
        description:
          error instanceof Error ? error.message : "Failed to accept request",
      })
    }
  }

  const handleReject = async (requestId: string) => {
    try {
      await rejectRequest.mutateAsync(requestId)
      toast({
        description: "Link request rejected",
      })
    } catch (error) {
      toast({
        variant: "destructive",
        description:
          error instanceof Error ? error.message : "Failed to reject request",
      })
    }
  }

  const isLoading = requestsLoading || linksLoading
  const pendingRequests =
    incomingRequests?.filter((req) => !req.accepted_at) || []

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Organisation Links</h2>
        <p className="text-muted-foreground">
          Manage link requests and connections with organisations
        </p>
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="accepted">
            Accepted Links ({acceptedLinks?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="pending">
            Pending Requests ({pendingRequests.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Accepted Links */}
        <TabsContent value="accepted" className="mt-6">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <Card key={i} className="p-4">
                  <div className="animate-pulse">
                    <div className="mb-2 h-4 w-1/2 rounded bg-gray-200"></div>
                    <div className="h-3 w-3/4 rounded bg-gray-200"></div>
                  </div>
                </Card>
              ))}
            </div>
          ) : !acceptedLinks?.length ? (
            <Card className="p-8 text-center">
              <LinkIcon className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
              <h3 className="mb-2 text-lg font-semibold">No Accepted Links</h3>
              <p className="text-muted-foreground">
                You haven't accepted any link requests yet.
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {acceptedLinks.map((link) => (
                <Card key={link.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-6 w-6 text-green-500" />
                      <div>
                        <h3 className="font-semibold">
                          {link.testing_org.name}
                        </h3>
                        <div className="mt-1 flex gap-2">
                          {link.can_test && (
                            <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                              Can Test
                            </span>
                          )}
                          {link.can_process && (
                            <span className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                              Can Process
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground mt-1 text-xs">
                          Linked{" "}
                          {new Date(link.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="rounded bg-green-100 px-3 py-1 text-sm text-green-700">
                      ✓ Active
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Pending Requests */}
        <TabsContent value="pending" className="mt-6">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <Card key={i} className="p-4">
                  <div className="animate-pulse">
                    <div className="mb-2 h-4 w-1/2 rounded bg-gray-200"></div>
                    <div className="h-3 w-3/4 rounded bg-gray-200"></div>
                  </div>
                </Card>
              ))}
            </div>
          ) : pendingRequests.length === 0 ? (
            <Card className="p-8 text-center">
              <Clock className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
              <h3 className="mb-2 text-lg font-semibold">
                No Pending Requests
              </h3>
              <p className="text-muted-foreground">
                You don't have any pending link requests at the moment.
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {pendingRequests.map((request) => (
                <Card key={request.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex flex-1 items-start gap-3">
                      <Building2 className="mt-1 h-6 w-6 text-blue-500" />
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold">
                          {request.testing_org.name}
                        </h3>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {request.can_test && (
                            <span className="rounded bg-blue-100 px-2 py-1 text-sm text-blue-700">
                              Can Test Samples
                            </span>
                          )}
                          {request.can_process && (
                            <span className="rounded bg-purple-100 px-2 py-1 text-sm text-purple-700">
                              Can Process Batches
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground mt-2 text-sm">
                          Requested{" "}
                          {new Date(request.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="ml-4 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleAccept(request.id)}
                        className="cursor-pointer"
                        disabled={
                          acceptRequest.isPending || rejectRequest.isPending
                        }
                      >
                        <Check className="mr-1 h-4 w-4" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="cursor-pointer"
                        onClick={() => handleReject(request.id)}
                        disabled={
                          acceptRequest.isPending || rejectRequest.isPending
                        }
                      >
                        <X className="mr-1 h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
