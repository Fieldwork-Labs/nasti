import { useState } from "react"
import { Button } from "@nasti/ui/button"
import { Card } from "@nasti/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nasti/ui/tabs"
import { useToast } from "@nasti/ui/hooks"
import { Building2, Link as LinkIcon, Clock, Trash2, X } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@nasti/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@nasti/ui/dialog"
import {
  useTestingOrganisations,
  useOrganisationLinks,
  useOrganisationLinkRequests,
  useDeleteOrganisationLink,
  useCancelLinkRequest,
} from "@/hooks/useTestingOrgs"
import { LinkRequestModal } from "./LinkRequestModal"
import type { Organisation } from "@nasti/common/types"

export const TestingOrgsManagement = () => {
  const { toast } = useToast()
  const { data: testingOrgs, isLoading: orgsLoading } =
    useTestingOrganisations()
  const { data: myLinks, isLoading: linksLoading } = useOrganisationLinks()
  const { data: myRequests, isLoading: requestsLoading } =
    useOrganisationLinkRequests()

  const deleteLink = useDeleteOrganisationLink()
  const cancelRequest = useCancelLinkRequest()

  const [showRequestModal, setShowRequestModal] = useState(false)
  const [selectedTestingOrg, setSelectedTestingOrg] =
    useState<Organisation | null>(null)

  const handleRequestLink = (org: Organisation) => {
    setSelectedTestingOrg(org)
    setShowRequestModal(true)
  }

  const handleDeleteLink = async (linkId: string) => {
    try {
      await deleteLink.mutateAsync(linkId)
      toast({
        description: "Link removed successfully",
      })
    } catch (error) {
      toast({
        variant: "destructive",
        description:
          error instanceof Error ? error.message : "Failed to remove link",
      })
    }
  }

  const handleCancelRequest = async (requestId: string) => {
    try {
      await cancelRequest.mutateAsync(requestId)
      toast({
        description: "Request cancelled successfully",
      })
    } catch (error) {
      toast({
        variant: "destructive",
        description:
          error instanceof Error ? error.message : "Failed to cancel request",
      })
    }
  }

  const isLoading = orgsLoading || linksLoading || requestsLoading

  // Check if org is already linked or has pending request
  const getOrgStatus = (orgId: string) => {
    const isLinked = myLinks?.some((link) => link.testing_org_id === orgId)
    const hasPendingRequest = myRequests?.some(
      (req) => req.testing_org_id === orgId && !req.accepted_at,
    )
    return { isLinked, hasPendingRequest }
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Testing Organisations</h2>
        <p className="text-muted-foreground">
          Manage connections with testing organisations for quality testing and
          processing
        </p>
      </div>

      <Tabs defaultValue="available" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="available">Available Testing Orgs</TabsTrigger>
          <TabsTrigger value="my-links">
            My Links ({myLinks?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="pending">
            Pending Requests (
            {myRequests?.filter((r) => !r.accepted_at).length || 0})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Available Testing Orgs */}
        <TabsContent value="available" className="mt-6">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="p-4">
                  <div className="animate-pulse">
                    <div className="mb-2 h-4 w-1/2 rounded bg-gray-200"></div>
                    <div className="h-3 w-3/4 rounded bg-gray-200"></div>
                  </div>
                </Card>
              ))}
            </div>
          ) : !testingOrgs?.length ? (
            <Card className="p-8 text-center">
              <Building2 className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
              <h3 className="mb-2 text-lg font-semibold">
                No Testing Organisations Available
              </h3>
              <p className="text-muted-foreground">
                There are currently no testing organisations in the system.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {testingOrgs.map((org) => {
                const { isLinked, hasPendingRequest } = getOrgStatus(org.id)
                return (
                  <Card
                    key={org.id}
                    className="p-4 transition-shadow hover:shadow-md"
                  >
                    <div className="flex h-full flex-col">
                      <div className="mb-3 flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-5 w-5 text-blue-500" />
                          <h3 className="text-lg font-semibold">{org.name}</h3>
                        </div>
                      </div>

                      {org.contact_email && (
                        <p className="text-muted-foreground mb-2 text-sm">
                          {org.contact_email}
                        </p>
                      )}

                      {org.contact_address && (
                        <p className="text-muted-foreground mb-3 flex-1 text-sm">
                          {org.contact_address}
                        </p>
                      )}

                      <div className="mt-auto">
                        {isLinked && (
                          <div className="rounded bg-green-100 px-3 py-1 text-center text-sm text-green-700">
                            ✓ Linked
                          </div>
                        )}
                        {hasPendingRequest && !isLinked && (
                          <div className="rounded bg-yellow-100 px-3 py-1 text-center text-sm text-yellow-700">
                            Request Pending
                          </div>
                        )}
                        {!isLinked && !hasPendingRequest && (
                          <Button
                            onClick={() => handleRequestLink(org)}
                            className="w-full"
                            variant="outline"
                          >
                            Request Link
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: My Links */}
        <TabsContent value="my-links" className="mt-6">
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
          ) : !myLinks?.length ? (
            <Card className="p-8 text-center">
              <LinkIcon className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
              <h3 className="mb-2 text-lg font-semibold">No Active Links</h3>
              <p className="text-muted-foreground">
                You haven't connected with any testing organisations yet.
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {myLinks.map((link) => (
                <Card key={link.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-6 w-6 text-blue-500" />
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
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove Link</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to remove the link with{" "}
                            {link.testing_org.name}? You will no longer be able
                            to assign batches to them for testing.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteLink(link.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Remove Link
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab 3: Pending Requests */}
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
          ) : !myRequests?.filter((r) => !r.accepted_at).length ? (
            <Card className="p-8 text-center">
              <Clock className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
              <h3 className="mb-2 text-lg font-semibold">
                No Pending Requests
              </h3>
              <p className="text-muted-foreground">
                You don't have any pending link requests.
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {myRequests
                .filter((req) => !req.accepted_at)
                .map((request) => (
                  <Card key={request.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Clock className="h-6 w-6 text-yellow-500" />
                        <div>
                          <h3 className="font-semibold">
                            {request.testing_org.name}
                          </h3>
                          <div className="mt-1 flex gap-2">
                            {request.can_test && (
                              <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                                Can Test
                              </span>
                            )}
                            {request.can_process && (
                              <span className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                                Can Process
                              </span>
                            )}
                          </div>
                          <p className="text-muted-foreground mt-1 text-xs">
                            Requested{" "}
                            {new Date(request.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelRequest(request.id)}
                        disabled={cancelRequest.isPending}
                      >
                        <X className="mr-1 h-4 w-4" />
                        Cancel
                      </Button>
                    </div>
                  </Card>
                ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Link Request Modal */}
      {selectedTestingOrg && (
        <Dialog open={showRequestModal} onOpenChange={setShowRequestModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Request Link with {selectedTestingOrg.name}
              </DialogTitle>
            </DialogHeader>
            <LinkRequestModal
              testingOrg={selectedTestingOrg}
              onSuccess={() => {
                setShowRequestModal(false)
                setSelectedTestingOrg(null)
                toast({
                  description: "Link request sent successfully",
                })
              }}
              onCancel={() => {
                setShowRequestModal(false)
                setSelectedTestingOrg(null)
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
