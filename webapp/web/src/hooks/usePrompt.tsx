import { useCallback, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface State {
  open: boolean;
  title: string;
  description?: string;
  defaultValue: string;
  placeholder?: string;
  resolve?: (v: string | null) => void;
}

/**
 * Promise-based replacement for window.prompt(). Resolves to a string or null
 * if the user cancels.
 *
 * Usage:
 *   const { prompt, PromptDialog } = usePrompt();
 *   const name = await prompt("Name?", "default-value");
 *   if (name) { ... }
 *   return <>{PromptDialog}</>;
 */
export function usePrompt() {
  const [state, setState] = useState<State | null>(null);

  const prompt = useCallback(
    (title: string, defaultValue = "", description?: string, placeholder?: string) =>
      new Promise<string | null>((resolve) => {
        setState({ open: true, title, description, defaultValue, placeholder, resolve });
      }),
    []
  );

  const PromptDialog = state ? (
    <AlertDialog
      open={state.open}
      onOpenChange={(o) => {
        if (!o) {
          state.resolve?.(null);
          setState(null);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state.title}</AlertDialogTitle>
          {state.description ? (
            <AlertDialogDescription>{state.description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const input = (e.currentTarget.elements.namedItem("prompt") as HTMLInputElement);
            state.resolve?.(input?.value ?? "");
            setState(null);
          }}
        >
          <Input
            name="prompt"
            defaultValue={state.defaultValue}
            placeholder={state.placeholder}
            autoFocus
          />
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel
              onClick={() => {
                state.resolve?.(null);
                setState(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction type="submit">OK</AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  ) : null;

  return { prompt, PromptDialog };
}