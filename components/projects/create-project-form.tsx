"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { createProject } from "@/lib/projects/actions";
import { PROJECT_COLORS } from "@/lib/validation/project";

/**
 * Creates a project.
 *
 * The key is left blank by default and derived server-side from the name, so
 * the common path is one field. Someone who cares about the prefix can set it;
 * most people should not have to think about it.
 */
export function CreateProjectForm({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [color, setColor] = useState<string>("accent");
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(undefined);
    setFieldErrors(undefined);

    start(async () => {
      const result = await createProject({
        name,
        key: key.trim() ? key.trim() : undefined,
        color,
        isPrivate,
      });

      if (!result.ok) {
        setFieldErrors(result.fieldErrors);
        if (!result.fieldErrors) setError(result.error);
        return;
      }

      setName("");
      setKey("");
      onDone?.();
      router.refresh();
      router.push(`/projects/${result.data.id}`);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FormError message={error} />

      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <Field label="Project name" error={fieldErrors?.name?.[0]} required>
          {(props) => (
            <Input
              {...props}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={80}
              placeholder="Website Redesign"
            />
          )}
        </Field>

        <Field
          label="Key"
          hint="Used in task numbers. Auto if blank."
          error={fieldErrors?.key?.[0]}
        >
          {(props) => (
            <Input
              {...props}
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="WEB"
              className="uppercase"
            />
          )}
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Colour">
          {(props) => (
            <Select {...props} value={color} onChange={(e) => setColor(e.target.value)}>
              {PROJECT_COLORS.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <label className="flex items-end gap-2 pb-2">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="accent-accent size-4"
          />
          <span className="text-sm">
            Private
            <span className="text-muted block text-xs">
              Only people added to it can see it.
            </span>
          </span>
        </label>
      </div>

      <Button
        type="submit"
        variant="primary"
        disabled={pending || name.trim().length < 2}
        className="w-full sm:w-auto"
      >
        {pending ? "Creating…" : "Create project"}
      </Button>
    </form>
  );
}
