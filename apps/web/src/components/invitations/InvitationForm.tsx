import { useToast } from "@nasti/ui/hooks"
import { Invitation } from "@nasti/common/types"
import { useCallback } from "react"
import { useForm } from "react-hook-form"
import { FormField } from "@nasti/ui/formField"
import { Button } from "@nasti/ui/button"
import useUserStore from "@/store/userStore"
import { useNavigate } from "@tanstack/react-router"

type InvitationFormData = {
  name: Invitation["name"]
  email: Invitation["email"]
  role: Invitation["role"]
}

export const InvitationForm = () => {
  const {
    register,
    handleSubmit,
    formState: { isValid, isSubmitting, errors },
  } = useForm<InvitationFormData>({
    mode: "all",
    defaultValues: { role: "Member" },
  })
  const { session } = useUserStore()
  const navigate = useNavigate()

  const { toast } = useToast()
  const handleSend = useCallback(
    async ({ email, name, role }: InvitationFormData) => {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send_invitation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ email, name, role }),
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
          <option value="Member">Member</option>
          <option value="Admin">Admin</option>
        </select>
        {errors.role && (
          <span className="text-destructive text-sm">
            {errors.role.message}
          </span>
        )}
      </div>
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
