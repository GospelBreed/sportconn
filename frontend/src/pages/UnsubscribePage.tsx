import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { unsubscribeToken } from "@/lib/db";
import { Button } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";

/**
 * Public page (no login) behind the unsubscribe link in queue emails. The
 * link only opens this page; a person must confirm, so mail scanners that
 * open links can't unsubscribe anyone.
 */
export function UnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get("t") ?? "";
  const [state, setState] = useState<"ask" | "working" | "done" | "error">("ask");
  const [message, setMessage] = useState("");

  const confirm = async () => {
    setState("working");
    try {
      const r = await unsubscribeToken(token);
      setMessage(r.already ? `${r.email} was already unsubscribed.` : `${r.email} won't receive any more emails from SportConn.`);
      setState("done");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong.");
      setState("error");
    }
  };

  const valid = /^[0-9a-f-]{36}$/i.test(token);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="card-base w-full max-w-md space-y-4 p-6 text-center">
        <p className="text-sm font-semibold text-primary">SportConn</p>
        {!valid ? (
          <>
            <h1 className="text-lg font-semibold text-ink">This link isn't complete</h1>
            <p className="text-sm text-muted">Use the full unsubscribe link from the email, or reply to the email and ask us to stop.</p>
          </>
        ) : state === "done" ? (
          <>
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-success/10 text-success">
              <Icon name="check" size={20} />
            </div>
            <h1 className="text-lg font-semibold text-ink">You're unsubscribed</h1>
            <p className="text-sm text-muted">{message}</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-ink">Stop emails from SportConn?</h1>
            <p className="text-sm text-muted">We'll stop contacting this address about partnerships. You can always reach us again by email.</p>
            {state === "error" && <p className="text-sm text-danger">{message}</p>}
            <Button onClick={confirm} loading={state === "working"} className="w-full">
              Unsubscribe
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
