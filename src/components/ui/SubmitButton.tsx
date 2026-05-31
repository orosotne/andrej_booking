"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "./Button";

/** Submit button that auto-shows a pending state from the enclosing <form> action. */
export function SubmitButton(props: ButtonProps) {
  const { pending } = useFormStatus();
  return <Button type="submit" loading={pending} {...props} />;
}
