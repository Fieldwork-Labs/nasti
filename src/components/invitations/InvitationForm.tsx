import { useToast } from "@/hooks/use-toast"
import { Invitation } from "@/types"
import { useCallback } from "react"
import { useForm } from "react-hook-form"
import { FormField } from "../ui/formField"
import { Button } from "../ui/button"
import useUserStore from "@/store/userStore"

type InvitationFormData = {
  name: Invitation["name"]
  email: Invitation["email"]
}

export const InvitationForm = () => {
  const {
    register,
    handleSubmit,
    formState: { isValid, isSubmitting, errors },
  } = useForm<InvitationFormData>({ mode: "all" })
  const { session } = useUserStore()

  const { toast } = useToast()
  const handleSend = useCallback(
    async ({ email, name }: InvitationFormData) => {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send_invitation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ email, name }),
        },
      )
      console.log({ response })
      if (!response.ok) {
        console.log(await response.text())
        toast({
          variant: "destructive",
          description: "Failed to send invitation",
        })
      }
    },
    [session?.access_token, toast],
  )

  return (
    <form onSubmit={handleSubmit(handleSend)} className="flex flex-col gap-2">
      <FormField
        label="Name"
        type="text"
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
      <Button type="submit" disabled={!isValid || isSubmitting}>
        {isSubmitting ? "Sending..." : "Send Invitation"}
      </Button>
    </form>
  )
}
