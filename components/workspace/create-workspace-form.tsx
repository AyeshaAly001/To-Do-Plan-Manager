"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createWorkspace } from "@/lib/workspace/actions";
import { slugify } from "@/lib/workspace/slug";

/**
 * Creates the first (or an additional) workspace.
 *
 * Shows the slug live as the name is typed. The preview is advisory — the
 * server appends `-2` on collision — so it is labelled as what the address
 * "will look like" rather than promised exactly.
 */
export function CreateWorkspaceForm({ redirectTo = "/home" }: { redirectTo?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [fieldError, setFieldError] = useState<string>();

  const preview = slugify(name);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(undefined);
    setFieldError(undefined);

    startTransition(async () => {
      const result = await createWorkspace({ name });
      if (!result.ok) {
        setError(result.fieldErrors?.name ? undefined : result.error);
        setFieldError(result.fieldErrors?.name?.[0]);
        return;
      }
      // The action sets the active-workspace cookie; refresh so the shell
      // picks it up before we navigate.
      router.refresh();
      router.push(redirectTo);
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={error} />

      <Field
        label="Workspace name"
        hint={
          preview
            ? `Its address will look like ash.app/${preview}`
            : "Your team or company name works well."
        }
        error={fieldError}
        required
      >
        {(props) => (
          <Input
            {...props}
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={60}
            placeholder="Acme Design"
          />
        )}
      </Field>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full"
        disabled={pending || name.trim().length < 2}
      >
        {pending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
