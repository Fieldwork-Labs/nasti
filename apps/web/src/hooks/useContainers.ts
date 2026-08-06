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

export type ContainerUsage = {
  collectionCount: number
  storageSubBatchCount: number
  totalCount: number
}

export type ContainerUsageById = Record<string, ContainerUsage>

const fetchContainerUsage = async (): Promise<ContainerUsageById> => {
  const { data, error } = await supabase.rpc("fn_get_container_usage")

  if (error) throw new Error(error.message)

  return data.reduce<ContainerUsageById>((usage, row) => {
    const collectionCount = Number(row.collection_count)
    const storageSubBatchCount = Number(row.storage_sub_batch_count)

    usage[row.container_id] = {
      collectionCount,
      storageSubBatchCount,
      totalCount: collectionCount + storageSubBatchCount,
    }
    return usage
  }, {})
}

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
      const containerUsage = (await fetchContainerUsage())[containerId]

      if (containerUsage?.totalCount) {
        const usageParts = [
          containerUsage.collectionCount > 0 &&
            `${containerUsage.collectionCount} collection${containerUsage.collectionCount === 1 ? "" : "s"}`,
          containerUsage.storageSubBatchCount > 0 &&
            `${containerUsage.storageSubBatchCount} storage bag${containerUsage.storageSubBatchCount === 1 ? "" : "s"}`,
        ].filter(Boolean)

        throw new Error(
          `This container is used by ${usageParts.join(" and ")}. Deactivate it instead to preserve those records.`,
        )
      }

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
      queryClient.invalidateQueries({ queryKey: ["containers", "usage"] })
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

// Query: complete collection and storage usage for every organisation container
export const useContainerUsage = () =>
  useQuery({
    queryKey: ["containers", "usage"],
    queryFn: fetchContainerUsage,
  })
