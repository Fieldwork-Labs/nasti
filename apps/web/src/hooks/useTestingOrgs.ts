import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import useUserStore from "@/store/userStore"
import type {
  Organisation,
  OrganisationLinkWithName,
  OrganisationLinkWithGeneralName,
  OrganisationLinkRequestWithName,
  OrganisationLinkRequestWithGeneralName,
} from "@nasti/common/types"

// Fetch all testing organisations
export const useTestingOrganisations = () => {
  return useQuery<Organisation[]>({
    queryKey: ["testing-organisations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organisation")
        .select("*")
        .eq("is_testing_provider", true)
        .order("name")

      if (error) throw new Error(error.message)
      return data
    },
  })
}

// Fetch user's organisation links
export const useOrganisationLinks = () => {
  const { organisation } = useUserStore()

  return useQuery<OrganisationLinkWithName[]>({
    queryKey: ["organisation-links", organisation?.id],
    queryFn: async () => {
      if (!organisation?.id) throw new Error("No organisation found")

      const { data, error } = await supabase
        .from("organisation_link")
        .select(
          `
          *,
          testing_org:organisation!provider_org_id(name)
        `,
        )
        .eq("requesting_org_id", organisation.id)
        .order("created_at", { ascending: false })

      if (error) throw new Error(error.message)

      // Flatten the nested testing_org data
      return data.map((link) => ({
        ...link,
        testing_org_name: link.testing_org?.name || "",
      }))
    },
    enabled: Boolean(organisation?.id),
  })
}

// Fetch user's organisation link requests
export const useOrganisationLinkRequests = () => {
  const { organisation } = useUserStore()

  return useQuery<OrganisationLinkRequestWithName[]>({
    queryKey: ["organisation-link-requests", organisation?.id],
    queryFn: async () => {
      if (!organisation?.id) throw new Error("No organisation found")

      const { data, error } = await supabase
        .from("organisation_link_request")
        .select(
          `
          *,
          testing_org:organisation!provider_org_id(name)
        `,
        )
        .eq("requesting_org_id", organisation.id)
        .order("created_at", { ascending: false })

      if (error) throw new Error(error.message)

      // Flatten the nested testing_org data
      return data.map((request) => ({
        ...request,
        testing_org_name: request.testing_org?.name || "",
      }))
    },
    enabled: Boolean(organisation?.id),
  })
}

// Create a link request (via edge function)
export const useCreateLinkRequest = () => {
  const { organisation, session } = useUserStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ provider_org_id }: { provider_org_id: string }) => {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create_link_request`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ provider_org_id }),
        },
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to create link request")
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["organisation-link-requests", organisation?.id],
      })
    },
  })
}

// Delete an organisation link
export const useDeleteOrganisationLink = () => {
  const { organisation } = useUserStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase
        .from("organisation_link")
        .delete()
        .eq("id", linkId)

      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["organisation-links", organisation?.id],
      })
    },
  })
}

// Cancel a link request
export const useCancelLinkRequest = () => {
  const { organisation } = useUserStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from("organisation_link_request")
        .delete()
        .eq("id", requestId)

      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["organisation-link-requests", organisation?.id],
      })
    },
  })
}

// =====================================================
// Testing Organisation Hooks (for Testing org members)
// =====================================================

// Fetch incoming link requests for a testing organisation
export const useIncomingLinkRequests = () => {
  const { organisation } = useUserStore()

  return useQuery<OrganisationLinkRequestWithGeneralName[]>({
    queryKey: ["incoming-link-requests", organisation?.id],
    queryFn: async () => {
      if (!organisation?.id) throw new Error("No organisation found")

      const { data, error } = await supabase
        .from("organisation_link_request")
        .select(
          `
          *,
          general_org:organisation!requesting_org_id(name)
        `,
        )
        .eq("provider_org_id", organisation.id)
        .order("created_at", { ascending: false })

      if (error) throw new Error(error.message)

      // The counterparty here is the General organisation making the request.
      return data.map((request) => ({
        ...request,
        general_org_name: request.general_org?.name || "",
      })) as OrganisationLinkRequestWithGeneralName[]
    },
    enabled: Boolean(organisation?.id),
  })
}

// Fetch accepted links for a testing organisation
export const useTestingOrgAcceptedLinks = () => {
  const { organisation } = useUserStore()

  return useQuery<OrganisationLinkWithGeneralName[]>({
    queryKey: ["testing-org-accepted-links", organisation?.id],
    queryFn: async () => {
      if (!organisation?.id) throw new Error("No organisation found")

      const { data, error } = await supabase
        .from("organisation_link")
        .select(
          `
          *,
          general_org:organisation!requesting_org_id(name)
        `,
        )
        .eq("provider_org_id", organisation.id)
        .order("created_at", { ascending: false })

      if (error) throw new Error(error.message)

      // The counterparty here is the General organisation sending the work.
      return data.map((link) => ({
        ...link,
        general_org_name: link.general_org?.name || "",
      })) as OrganisationLinkWithGeneralName[]
    },
    enabled: Boolean(organisation?.id),
  })
}

// Accept a link request (Testing org only)
export const useAcceptLinkRequest = () => {
  const { organisation, session } = useUserStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (requestId: string) => {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/accept_link_request`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ request_id: requestId }),
        },
      )

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || "Failed to accept link request")
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["incoming-link-requests", organisation?.id],
      })
      queryClient.invalidateQueries({
        queryKey: ["testing-org-accepted-links", organisation?.id],
      })
    },
  })
}

// Reject a link request (Testing org only)
export const useRejectLinkRequest = () => {
  const { organisation } = useUserStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from("organisation_link_request")
        .delete()
        .eq("id", requestId)

      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["incoming-link-requests", organisation?.id],
      })
    },
  })
}
