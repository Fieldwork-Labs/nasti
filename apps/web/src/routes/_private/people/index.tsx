import { createFileRoute } from "@tanstack/react-router"

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import useUserStore from "@/store/userStore"
import { useToast } from "@nasti/ui/hooks"
import { Button } from "@nasti/ui/button"
import {
  KeyRoundIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  TrashIcon,
} from "lucide-react"
import { ButtonLink } from "@nasti/ui/button-link"
import { usePeople } from "@/hooks/usePeople"
import { Modal } from "@nasti/ui/modal"
import { Spinner } from "@nasti/ui/spinner"
import { cn } from "@nasti/ui/utils"
import {
  GetOrgUsers,
  ORG_PERMISSION_DESCRIPTIONS,
  ORG_PERMISSION_LABELS,
  ORG_PERMISSIONS,
  OrganisationUser,
  ROLE,
  type OrgPermission,
} from "@nasti/common/types"
import { PermissionBadges } from "@/components/common/PermissionBadges"
import { useUpdateUserPermissions } from "@/hooks/useUpdateUserPermissions"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nasti/ui/tabs"
import { FormField } from "@nasti/ui/formField"
import { Checkbox } from "@nasti/ui/checkbox"
import { Label } from "@nasti/ui/label"
import {
  usePersonnel,
  useSetPersonnelActive,
  useUpsertPersonnel,
} from "@/hooks/usePersonnel"
import type { Personnel } from "@nasti/common/types"
import { Badge } from "@nasti/ui/badge"

type PersonnelFormModalProps = {
  personnel?: Personnel
  open: boolean
  onClose: () => void
}

const PersonnelFormModal = ({
  personnel,
  open,
  onClose,
}: PersonnelFormModalProps) => {
  const {
    mutateAsync: upsertPersonnel,
    isPending,
    error,
  } = useUpsertPersonnel()
  const [name, setName] = useState(personnel?.name ?? "")
  const [email, setEmail] = useState(personnel?.email ?? "")
  const [jobRole, setJobRole] = useState(personnel?.job_role ?? "")
  const [isActive, setIsActive] = useState(personnel?.is_active ?? true)

  useEffect(() => {
    if (!open) return
    setName(personnel?.name ?? "")
    setEmail(personnel?.email ?? "")
    setJobRole(personnel?.job_role ?? "")
    setIsActive(personnel?.is_active ?? true)
  }, [open, personnel])

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault()
    await upsertPersonnel({
      id: personnel?.id,
      name,
      email,
      job_role: jobRole,
      is_active: isActive,
    })
    onClose()
  }

  return (
    <Modal
      open={open}
      onOpenChange={onClose}
      title={personnel ? `Edit ${personnel.name}` : "Add personnel"}
      onCancel={onClose}
      onSubmit={() => handleSubmit()}
      allowSubmit={name.trim().length > 0 && !isPending}
      isPending={isPending}
    >
      <form className="space-y-2" onSubmit={handleSubmit}>
        <FormField
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
        />
        <FormField
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="off"
        />
        <FormField
          label="Job role"
          value={jobRole}
          onChange={(event) => setJobRole(event.target.value)}
          autoComplete="off"
        />
        {personnel && (
          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="personnel-is-active"
              checked={isActive}
              onCheckedChange={(checked) => setIsActive(Boolean(checked))}
            />
            <Label htmlFor="personnel-is-active">Active</Label>
          </div>
        )}
        {error && <p className="text-sm text-red-500">{error.message}</p>}
      </form>
    </Modal>
  )
}

const PersonnelList = () => {
  const { isAdmin } = useUserStore()
  const { data: personnel, isLoading, isError, error } = usePersonnel()
  const { mutateAsync: setPersonnelActive, isPending } = useSetPersonnelActive()
  const [editingPersonnel, setEditingPersonnel] = useState<Personnel>()
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <p>Loading personnel...</p>
      </div>
    )
  }

  if (isError && error) {
    return (
      <div className="p-4 text-center">
        <p className="text-red-500">Error: {error.message}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <h2 className="text-2xl font-semibold">Personnel</h2>
        {isAdmin && (
          <Button className="flex gap-1" onClick={() => setIsCreateOpen(true)}>
            <PlusIcon aria-label="Add personnel" size={16} />
            <span>Add personnel</span>
          </Button>
        )}
      </div>
      {!personnel || personnel.length === 0 ? (
        <p>No personnel found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full overflow-hidden rounded-lg">
            <thead>
              <tr>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-left">Job role</th>
                <th className="px-4 py-2 text-left">Status</th>
                {isAdmin && <th className="px-4 py-2">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {personnel.map((person) => (
                <tr key={person.id} className="h-14 border-t">
                  <td className="px-4 py-2">{person.name}</td>
                  <td className="px-4 py-2">{person.email ?? ""}</td>
                  <td className="px-4 py-2">{person.job_role ?? ""}</td>
                  <td className="px-4 py-2">
                    <Badge variant={person.is_active ? "default" : "secondary"}>
                      {person.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  {isAdmin && (
                    <td className="flex justify-center gap-2 px-4 py-2">
                      <Button
                        size="icon"
                        title="Edit"
                        onClick={() => setEditingPersonnel(person)}
                      >
                        <PencilIcon aria-label="Edit" size={16} />
                      </Button>
                      <Button
                        size="icon"
                        title={person.is_active ? "Deactivate" : "Reactivate"}
                        disabled={isPending}
                        onClick={() =>
                          setPersonnelActive({
                            id: person.id,
                            is_active: !person.is_active,
                          })
                        }
                      >
                        {person.is_active ? (
                          <TrashIcon aria-label="Deactivate" size={16} />
                        ) : (
                          <RotateCcwIcon aria-label="Reactivate" size={16} />
                        )}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PersonnelFormModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
      {editingPersonnel && (
        <PersonnelFormModal
          personnel={editingPersonnel}
          open={Boolean(editingPersonnel)}
          onClose={() => setEditingPersonnel(undefined)}
        />
      )}
    </div>
  )
}

type PermissionsModalProps = {
  user: OrganisationUser
  onClose: () => void
}

// Rendered only while a user is selected, so the checkbox state starts from
// that user's permissions without an effect to resynchronise it.
const PermissionsModal = ({ user, onClose }: PermissionsModalProps) => {
  const [permissions, setPermissions] = useState<OrgPermission[]>(
    user.permissions ?? [],
  )
  const {
    mutateAsync: updatePermissions,
    isPending,
    error,
  } = useUpdateUserPermissions()
  const { toast } = useToast()

  const togglePermission = (permission: OrgPermission, checked: boolean) =>
    setPermissions((current) =>
      checked
        ? [...current, permission]
        : current.filter((value) => value !== permission),
    )

  const handleSubmit = async () => {
    await updatePermissions({ userId: user.id, permissions })
    toast({ description: `Updated access for ${user.name ?? user.email}` })
    onClose()
  }

  return (
    <Modal
      open
      onOpenChange={onClose}
      title={`Access for ${user.name ?? user.email}`}
      onCancel={onClose}
      onSubmit={handleSubmit}
      allowSubmit={!isPending}
      isPending={isPending}
    >
      <div className="flex flex-col gap-3">
        {ORG_PERMISSIONS.map((permission) => (
          <div key={permission} className="flex items-start gap-2">
            <Checkbox
              id={`user-permission-${permission}`}
              className="mt-1"
              checked={permissions.includes(permission)}
              onCheckedChange={(checked) =>
                togglePermission(permission, Boolean(checked))
              }
            />
            <div className="flex flex-col">
              <Label htmlFor={`user-permission-${permission}`}>
                {ORG_PERMISSION_LABELS[permission]}
              </Label>
              <span className="text-muted-foreground text-sm">
                {ORG_PERMISSION_DESCRIPTIONS[permission]}
              </span>
            </div>
          </div>
        ))}
        <p className="text-muted-foreground text-sm">
          Changes apply the next time they sign in or their session refreshes.
        </p>
        {error && <p className="text-sm text-red-500">{error.message}</p>}
      </div>
    </Modal>
  )
}

const PeopleList = () => {
  // TODO pagination
  // TODO search function

  const { organisation, isAdmin, session, user: currentUser } = useUserStore()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data, isLoading, isError, error } = usePeople()
  const [personToDelete, setPersonToDelete] = useState<string>()
  const [isDeleting, setIsDeleting] = useState<string>()
  const [userToEditPermissions, setUserToEditPermissions] =
    useState<OrganisationUser>()

  const activeUsers = useMemo(() => {
    return data?.filter((user) => user.is_active)
  }, [data])

  // Handle disabling a user
  const handleDisable = useCallback(
    async (id: string) => {
      setIsDeleting(id)
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/disable_user`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ userId: id }),
        },
      )
      setIsDeleting(undefined)
      setPersonToDelete(undefined)

      if (!response.ok) {
        const message = await response.text()
        toast({
          variant: "destructive",
          description: `Failed to disable user: ${message}`,
        })
      } else {
        toast({ description: "User disabled successfully." })
        queryClient.setQueryData<GetOrgUsers["Returns"]>(
          ["users", organisation?.id],
          (oldData) => {
            if (!oldData || oldData.length === 0) return []
            return oldData.map((item) =>
              item.id === id ? { ...item, is_active: false } : item,
            )
          },
        )
      }
    },
    [organisation, queryClient, session?.access_token, toast],
  )

  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <p>Loading people...</p>
      </div>
    )
  }

  if (isError && error) {
    return (
      <div className="p-4 text-center">
        <p className="text-red-500">Error: {error.message}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between">
        <h2 className="mb-4 text-2xl font-semibold">People</h2>
        {isAdmin && (
          <span className="flex gap-2">
            <ButtonLink to="/invitations">See invitations</ButtonLink>
            <ButtonLink to="/invitations/new" className="flex gap-1">
              <PlusIcon aria-label="New Trip" size={16} />{" "}
              <span>Invite new</span>
            </ButtonLink>
          </span>
        )}
      </div>
      {!activeUsers || activeUsers.length === 0 ? (
        <p>No active users found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full overflow-hidden rounded-lg">
            <thead className="">
              <tr>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-left">Role</th>
                <th className="px-4 py-2 text-left">Access</th>
                <th className="px-4 py-2 text-left">Member Since</th>
                {isAdmin && <th className="px-4 py-2">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {activeUsers.map((user) => (
                <tr key={user.id} className={cn("h-14 border-t")}>
                  <td className="px-4 py-2">{user.name}</td>
                  <td className="px-4 py-2">{user.email}</td>
                  <td className="px-4 py-2">{user.role}</td>
                  <td className="px-4 py-2">
                    <PermissionBadges
                      role={user.role}
                      permissions={user.permissions}
                    />
                  </td>
                  <td className="px-4 py-2">
                    {new Date(user.joined_at).toLocaleString()}
                  </td>
                  {isAdmin && user.is_active && (
                    <td className="flex justify-center gap-2 px-4 py-2">
                      <Button
                        size="icon"
                        title="Edit access"
                        onClick={() => setUserToEditPermissions(user)}
                        disabled={user.role === ROLE.ADMIN}
                      >
                        <KeyRoundIcon aria-label="Edit access" size={16} />
                      </Button>
                      <Button
                        size="icon"
                        onClick={() => setPersonToDelete(user.id)}
                        title="Delete"
                        disabled={
                          isDeleting === user.id || user.id === currentUser?.id
                        }
                      >
                        {isDeleting !== user.id && (
                          <TrashIcon aria-label="Delete" size={16} />
                        )}
                        {isDeleting === user.id && <Spinner />}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {userToEditPermissions && (
        <PermissionsModal
          user={userToEditPermissions}
          onClose={() => setUserToEditPermissions(undefined)}
        />
      )}
      {personToDelete && (
        <Modal
          open={Boolean(personToDelete)}
          onOpenChange={() => setPersonToDelete(undefined)}
          title={`Remove ${data?.find((person) => person.id === personToDelete)?.name}`}
          onCancel={() => setPersonToDelete(undefined)}
          onSubmit={() => personToDelete && handleDisable(personToDelete)}
          allowSubmit={!isDeleting}
          isPending={Boolean(isDeleting)}
        >
          This action cannot be undone. This will permanently disable the user.
        </Modal>
      )}
    </div>
  )
}

export const Route = createFileRoute("/_private/people/")({
  component: () => (
    <Tabs defaultValue="users">
      <TabsList className="mb-4">
        <TabsTrigger value="users">Users</TabsTrigger>
        <TabsTrigger value="personnel">Personnel</TabsTrigger>
      </TabsList>
      <TabsContent value="users">
        <PeopleList />
      </TabsContent>
      <TabsContent value="personnel">
        <PersonnelList />
      </TabsContent>
    </Tabs>
  ),
})
