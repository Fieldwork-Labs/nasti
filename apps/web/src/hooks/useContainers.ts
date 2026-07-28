import { supabase } from "@nasti/common/supabase"
import type {
  CollectionContainerWithContainer,
  Container,
  ContainerPurpose,
} from "@nasti/common/types"
import { queryClient } from "@nasti/common/utils"
import { useMutation, useQuery } from "@tanstack/react-query"

import useUserStore from "@/store/userStore"

const sortContainers = (containers: Container[]) =>
  [...containers].sort((a, b) => a.name.localeCompare(b.name))

const setListData = (updater: (containers: Container[]) => Container[]) =>
  queryClient.setQueryData<Container[]>(["containers"], (oldData) =>
    sortContainers(updater(oldData ?? [])),
  )

// Query: every container belonging to the user's organisation
export const useContainers = () =>
  useQuery({
    queryKey: ["containers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("containers")
        .select("*")
        .order("name")

      if (error) throw new Error(error.message)
      return data
    },
  })

// Query: only the containers usable for new records of a given purpose
export const useActiveContainers = (purpose: ContainerPurpose) => {
  const { data, ...rest } = useContainers()

  return {
    ...rest,
    data: data?.filter(
      (container) => container.active && container.purpose === purpose,
    ),
  }
}

type CreateContainerParams = {
  name: string
  purpose: ContainerPurpose
  active: boolean
}

export const useCreateContainer = () => {
  const { organisation } = useUserStore()

  return useMutation<Container, Error, CreateContainerParams>({
    mutationFn: async ({ name, purpose, active }) => {
      if (!organisation?.id) throw new Error("No organisation found")

      const { data, error } = await supabase
        .from("containers")
        .insert({ name, purpose, active, organisation_id: organisation.id })
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (newContainer) => {
      setListData((containers) => [...containers, newContainer])
    },
  })
}

type UpdateContainerParams = {
  id: string
  name?: string
  purpose?: ContainerPurpose
  active?: boolean
}

export const useUpdateContainer = () =>
  useMutation<Container, Error, UpdateContainerParams>({
    mutationFn: async ({ id, ...updates }) => {
      const { data, error } = await supabase
        .from("containers")
        .update(updates)
        .eq("id", id)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (updatedContainer) => {
      setListData((containers) =>
        containers.map((container) =>
          container.id === updatedContainer.id ? updatedContainer : container,
        ),
      )
    },
  })

export const useDeleteContainer = () =>
  useMutation<string, Error, string>({
    mutationFn: async (containerId) => {
      // collection_containers has ON DELETE RESTRICT, so check first to give a
      // useful message instead of a foreign key violation.
      const { count, error: countError } = await supabase
        .from("collection_containers")
        .select("id", { count: "exact", head: true })
        .eq("container_id", containerId)

      if (countError) throw new Error(countError.message)
      if (count && count > 0)
        throw new Error(
          `This container is used by ${count} collection${count === 1 ? "" : "s"}. Deactivate it instead to keep it out of new collections.`,
        )

      const { count: subBatchCount, error: subBatchCountError } = await supabase
        .from("sub_batches")
        .select("id", { count: "exact", head: true })
        .eq("container_id", containerId)

      if (subBatchCountError) throw new Error(subBatchCountError.message)
      if (subBatchCount && subBatchCount > 0)
        throw new Error(
          `This container is used by ${subBatchCount} stored sub-batch${subBatchCount === 1 ? "" : "es"}. Deactivate it instead to keep it out of new cleaning records.`,
        )

      const { error } = await supabase
        .from("containers")
        .delete()
        .eq("id", containerId)

      if (error) throw new Error(error.message)
      return containerId
    },
    onSuccess: (deletedId) => {
      setListData((containers) =>
        containers.filter((container) => container.id !== deletedId),
      )
    },
  })

// Query: the containers a collection was collected into
export const useCollectionContainers = (collectionId?: string) =>
  useQuery({
    queryKey: ["collections", "containers", collectionId],
    enabled: Boolean(collectionId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collection_containers")
        .select("*, container:containers(*)")
        .eq("collection_id", collectionId!)
        .overrideTypes<CollectionContainerWithContainer[]>()

      if (error) throw new Error(error.message)
      return data
    },
  })

// Query: how many collections reference each container, for the settings list
export const useContainerUsage = () =>
  useQuery({
    queryKey: ["containers", "usage"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collection_containers")
        .select("container_id")

      if (error) throw new Error(error.message)

      return data.reduce<Record<string, number>>((counts, row) => {
        counts[row.container_id] = (counts[row.container_id] ?? 0) + 1
        return counts
      }, {})
    },
  })
