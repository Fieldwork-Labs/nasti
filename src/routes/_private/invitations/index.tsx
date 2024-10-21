import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import useUserStore from "@/store/userStore";
import { createFileRoute } from "@tanstack/react-router";
import { useToast } from "@/hooks/use-toast";

const InvitationsList = () => {
  const { orgId, role } = useUserStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch invitations
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["invitations", orgId],
    queryFn: async () => {
      if (!orgId) {
        throw new Error("Organisation not found");
      }
      const { data, error } = await supabase
        .from("invitation")
        .select("*")
        .eq("organisation_id", orgId)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);
      return data;
    },
    enabled: Boolean(orgId), // Only run if org
  });

  // Handle deletion of an invitation
  const handleDelete = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("invitation").delete().eq("id", id);
      if (error) {
        toast({
          variant: "destructive",
          description: `Failed to delete invitation: ${error.message}`,
        });
      } else {
        toast({ description: "Invitation deleted successfully." });
        queryClient.invalidateQueries({ queryKey: ["invitations", orgId] });
      }
    },
    [orgId, queryClient, toast],
  );

  // Handle resending an invitation
  const handleResend = useCallback(
    async (id: string) => {
      const response = await fetch("/api/resend_invitation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ invitation_id: id }),
      });

      if (response.ok) {
        toast({ description: "Invitation resent successfully." });

        queryClient.invalidateQueries({ queryKey: ["invitations", orgId] });
      } else {
        const errorText = await response.text();
        toast({
          description: `Failed to resend invitation: ${errorText}`,
          variant: "destructive",
        });
      }
    },
    [orgId, queryClient, toast],
  );

  // Ensure the user is an admin
  if (role !== "admin") {
    return (
      <div className="p-4 text-center">
        <p className="text-red-500">
          Access Denied: You do not have permission to view this page.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <p>Loading invitations...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-4 text-center">
        <p className="text-red-500">Error: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h2 className="text-2xl font-semibold mb-4">Invitations</h2>
      {!data || data.length === 0 ? (
        <p>No invitations found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white shadow-md rounded-lg overflow-hidden">
            <thead className="bg-gray-200">
              <tr>
                <th className="py-2 px-4 text-left">Email</th>
                <th className="py-2 px-4 text-left">Invited By</th>
                <th className="py-2 px-4 text-left">Created At</th>
                <th className="py-2 px-4 text-left">Expires At</th>
                <th className="py-2 px-4 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((invitation) => (
                <tr key={invitation.id} className="border-t">
                  <td className="py-2 px-4">{invitation.email}</td>
                  <td className="py-2 px-4">
                    {invitation.invited_by
                      ? invitation.invited_by // You might want to join with users table to get the inviter's name
                      : "N/A"}
                  </td>
                  <td className="py-2 px-4">
                    {new Date(invitation.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-2 px-4">
                    {invitation.expires_at
                      ? new Date(invitation.expires_at).toLocaleDateString()
                      : "Never"}
                  </td>
                  <td className="py-2 px-4">
                    <button
                      onClick={() => handleResend(invitation.id)}
                      className="text-blue-500 hover:underline mr-2"
                    >
                      Resend
                    </button>
                    <button
                      onClick={() => handleDelete(invitation.id)}
                      className="text-red-500 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export const Route = createFileRoute("/_private/invitations/")({
  component: InvitationsList,
});
