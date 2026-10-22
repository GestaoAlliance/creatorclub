"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { doneAction } from "./actions";

/** "Feito": tira a tarefa da fila (a mesma ocorrência não volta). */
export function DoneButton({ taskKey }: { taskKey: string }) {
  const [state, action, pending] = useActionState(doneAction, undefined);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="key" value={taskKey} />
      <button className={ui.ghostSm} disabled={pending}>
        <Check className="size-3.5" /> {pending ? "Salvando…" : "Feito"}
      </button>
      {state?.error && <Msg state={state} />}
    </form>
  );
}
