import { useToast } from "@nasti/ui/hooks"
import {
  Invitation,
  ORG_PERMISSION_DESCRIPTIONS,
  ORG_PERMISSION_LABELS,
  ORG_PERMISSIONS,
  ROLE,
  type OrgPermission,
} from "@nasti/common/types"
import { useCallback } from "react"
import { useForm } from "react-hook-form"
import { FormField } from "@nasti/ui/formField"
import { Button } from "@nasti/ui/button"
import { Checkbox } from "@nasti/ui/checkbox"
import { Label } from "@nasti/ui/label"
import useUserStore from "@/store/userStore"
import { useNavigate } from "@tanstack/react-router"

type InvitationFormData = {
  name: Invitation["name"]
  email: Invitation["email"]
  role: Invitation["role"]
  permissions: OrgPermission[]
}

export const InvitationForm = () => {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { isValid, isSubmitting, errors },
  } = useForm<InvitationFormData>({
    mode: "all",
    defaultValues: { role: ROLE.MEMBER, permissions: ["collections"] },
  })
  const { session } = useUserStore()
  const navigate = useNavigate()

  const role = watch("role")
  const permissions = watch("permissions")
  const isMember = role === ROLE.MEMBER

  const togglePermission = useCallback(
    (permission: OrgPermission, checked: boolean) => {
      setValue(
        "permissions",
        checked
          ? [...permissions, permission]
          : permissions.filter((value) => value !== permission),
      )
    },
    [permissions, setValue],
  )

  const { toast } = useToast()
  const handleSend = useCallback(
    async ({ email, name, role, permissions }: InvitationFormData) => {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send_invitation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            email,
            name,
            role,
            // Admins reach every area through their role, so the server
            // stores an empty set for them either way. Providers use the same
            // additive member permissions as every other organisation.
            permissions: role !== ROLE.MEMBER ? [] : permissions,
          }),
        },
      )
      if (!response.ok) {
        const text = await response.text()
        toast({
          variant: "destructive",
          description: `Failed to send invitation: ${text}`,
        })
      } else {
        toast({
          description: "Successfully sent invitation",
        })
        navigate({ to: "/invitations" })
      }
    },
    [session?.access_token, toast, navigate],
  )

  return (
    <form onSubmit={handleSubmit(handleSend)} className="flex flex-col gap-2">
      <FormField
        label="Name"
        type="text"
        autoComplete="off"
        autoCorrect="off"
        {...register("name", {
          required: "Required",
          minLength: { value: 2, message: "Minimum length of 2" },
        })}
        error={errors.name}
      />
      <FormField
        label="Email"
        type="email"
        autoComplete="off"
        {...register("email", {
          required: "Required",
        })}
        error={errors.email}
      />
      <div className="flex flex-col gap-1">
        <label htmlFor="role" className="text-sm font-medium">
          Role
        </label>
        <select
          id="role"
          {...register("role", { required: "Required" })}
          className="border-input bg-background ring-offset-background focus-visible:ring-ring rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          <option value={ROLE.MEMBER}>Member</option>
          <option value={ROLE.ADMIN}>Admin</option>
        </select>
        {errors.role && (
          <span className="text-destructive text-sm">
            {errors.role.message}
          </span>
        )}
      </div>
      {isMember && (
        <div className="flex flex-col gap-2 pt-1">
          <span className="text-sm font-medium">Access</span>
          {ORG_PERMISSIONS.map((permission) => (
            <div key={permission} className="flex items-start gap-2">
              <Checkbox
                id={`permission-${permission}`}
                className="mt-1"
                checked={permissions.includes(permission)}
                onCheckedChange={(checked) =>
                  togglePermission(permission, Boolean(checked))
                }
              />
              <div className="flex flex-col">
                <Label htmlFor={`permission-${permission}`}>
                  {ORG_PERMISSION_LABELS[permission]}
                </Label>
                <span className="text-muted-foreground text-sm">
                  {ORG_PERMISSION_DESCRIPTIONS[permission]}
                </span>
              </div>
            </div>
          ))}
          {permissions.length === 0 && (
            <span className="text-sm text-amber-600">
              With no areas selected they will be able to sign in but not open
              anything. You can grant access later from the People page.
            </span>
          )}
        </div>
      )}
      {!isMember && (
        <p className="text-muted-foreground pt-1 text-sm">
          Admins have access to every area.
        </p>
      )}
      <div className="flex gap-2">
        <Button
          variant={"secondary"}
          className="w-full"
          onClick={() => navigate({ to: "/invitations" })}
        >
          Cancel
        </Button>
        <Button
          className="w-full"
          type="submit"
          disabled={!isValid || isSubmitting}
        >
          {isSubmitting ? "Sending..." : "Send Invitation"}
        </Button>
      </div>
    </form>
  )
}
