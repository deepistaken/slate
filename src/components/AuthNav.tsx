/**
 * Small header control: shows "Sign in" when logged out, or the user's email
 * with a "Sign out" button when logged in. Renders nothing until auth state has
 * loaded (avoids a flash), and nothing at all when Supabase isn't configured.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export function AuthNav() {
  const { configured, loading, user, signOut } = useAuth();
  const navigate = useNavigate();

  if (!configured || loading) return null;

  if (!user) {
    return (
      <Button asChild size="sm" variant="ghost">
        <Link to="/login">Sign in</Link>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-[12rem] truncate text-xs text-muted-foreground sm:inline">
        {user.email}
      </span>
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => {
          await signOut();
          navigate({ to: "/" });
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
