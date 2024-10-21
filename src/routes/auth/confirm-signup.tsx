import { useMemo } from "react";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button";

const ConfirmSignupPage = () => {
  const params = useSearch({ from: "/auth/confirm-signup" }) as {
    confirmation_url: string;
  };
  const confirmationUrl = params.confirmation_url;

  const redirectUrl = useMemo(() => {
    if (!confirmationUrl) return null;
    const url = new URL(confirmationUrl);
    const params = new URLSearchParams(url.search);
    params.set("redirect_to", `${params.get("redirect_to")}/auth/set-password`);
    url.search = params.toString();
    return url.toString();
  }, [confirmationUrl]);

  if (!redirectUrl) return null;

  return (
    <div className="mt-6 flex flex-col pb-6 sm:w-full md:w-1/2 lg:w-1/3 gap-4">
      <div>
        <h4 className="mb-2 text-xl font-bold">Confirm Signup</h4>
        <p>Click the button to confirm signing up to NASTI.</p>
      </div>

      <a href={redirectUrl} className={buttonVariants()}>
        Confirm
      </a>
    </div>
  );
};

export const Route = createFileRoute("/auth/confirm-signup")({
  component: ConfirmSignupPage,
});
