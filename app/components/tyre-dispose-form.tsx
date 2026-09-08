import { useState } from "react";
import { Form, useNavigation } from "react-router";

import { CsrfField } from "~/components/csrf-field";

export function TyreDisposeForm({
  tyreId,
  businessDate,
  intent = "dispose",
  className,
  buttonClassName = "text-button",
  label = "Dispose",
}: {
  tyreId: string;
  businessDate: string;
  intent?: string;
  className?: string;
  buttonClassName?: string;
  label?: string;
}) {
  const [key] = useState(() => crypto.randomUUID());
  const navigation = useNavigation();
  return (
    <Form method="post" className={className}>
      <CsrfField />
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="tyreId" value={tyreId} />
      <input type="hidden" name="businessDate" value={businessDate} />
      <input type="hidden" name="idempotencyKey" value={key} />
      <button
        className={buttonClassName}
        type="submit"
        disabled={navigation.state !== "idle"}
      >
        {label}
      </button>
    </Form>
  );
}
