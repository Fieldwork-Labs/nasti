import { FormField } from "@nasti/ui/formField"
import { Species } from "@/types"
import { useCallback, useEffect } from "react"

import useUserStore from "@/store/userStore"

import { useUpdateSpecies } from "@/hooks/useUpdateSpecies"
import { useForm } from "react-hook-form"
import { Button } from "@nasti/ui/button"
import { Spinner } from "@nasti/ui/spinner"

export type SpeciesIndigNameFormData = {
  indigenous_name: Species["indigenous_name"]
}

type SpeciesIndigNameFormOptions = {
  instance: Species
  onSuccess?: (trip?: Species) => void
  onError?: (message: string) => void
}

export const useSpeciesIndigNameForm = ({
  instance,
  onSuccess,
  onError,
}: SpeciesIndigNameFormOptions) => {
  const { orgId } = useUserStore()

  const {
    register,
    handleSubmit,
    formState: { isValid, isSubmitting, errors, isDirty },
  } = useForm<SpeciesIndigNameFormData>({
    mode: "all",
    defaultValues: instance
      ? {
          indigenous_name: instance.indigenous_name,
        }
      : undefined,
  })

  const { mutateAsync: updateSpecies, isPending } = useUpdateSpecies()

  const onSubmit = useCallback(
    async ({ indigenous_name }: SpeciesIndigNameFormData) => {
      if (!orgId) throw new Error("No organisation available")
      if (!instance) throw new Error("No species available")
      if (!isDirty) {
        onSuccess?.()
        return
      }
      try {
        const sbresponse = await updateSpecies({
          id: instance.id,
          indigenous_name,
        })
        onSuccess?.(sbresponse)
      } catch (error) {
        onError?.((error as Error).message)
      }
    },
    [orgId, instance, isDirty, onSuccess, updateSpecies, onError],
  )

  return {
    register,
    handleSubmit: handleSubmit(onSubmit),
    isPending,
    isValid,
    isSubmitting,
    errors,
  }
}

export const SpeciesIndigNameForm = ({
  instance,
  onSuccess,
  onCancel,
}: {
  instance: Species
  onSuccess: () => void
  onCancel: () => void
}) => {
  const { register, errors, isValid, handleSubmit, isPending } =
    useSpeciesIndigNameForm({
      instance,
    })

  const onSubmit = useCallback(async () => {
    await handleSubmit()
    onSuccess()
  }, [handleSubmit, onSuccess])

  useEffect(() => {
    // submit on enter
    // listen to keypresses
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        onSubmit()
      }
    }
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [onSubmit])

  return (
    <div className="flex flex-col gap-2">
      <FormField
        label="Indigenous Name"
        type="text"
        autoComplete="off"
        tabIndex={0}
        autoFocus
        {...register("indigenous_name", {
          minLength: { value: 2, message: "Minimum length of 2" },
        })}
        error={errors.indigenous_name}
      />
      <div className="flex w-full gap-2">
        <Button className={"bg-secondary-background w-full"} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          className="w-full"
          type="submit"
          disabled={!isValid || isPending}
          onClick={onSubmit}
        >
          {!isPending && "Submit"}
          {isPending && <Spinner />}
        </Button>
      </div>
    </div>
  )
}
