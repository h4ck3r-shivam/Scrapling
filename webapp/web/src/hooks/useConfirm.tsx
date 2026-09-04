import { useCallback, useState } from "react";
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
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  resolve?: (v: boolean) => void;
}

/**
 * Promise-based replacement for window.confirm().
 *
 * Usage:
 *   const { confirm, ConfirmDialog } = useConfirm();
 *   if (await confirm("Delete this job?", "This cannot be undone.")) { ... }
 *   return <>{ConfirmDialog}</>;
 */
export function useConfirm() {
  const [state, setState] = useState<State | null>(null);

  const confirm = useCallback(
    (
      title: string,
      description?: string,
      opts?: { confirmLabel?: string; cancelLabel?: string; destructive?: boolean }
    ) =>
      new Promise<boolean>((resolve) => {
        setState({
          open: true,
          title,
          description,
          confirmLabel: opts?.confirmLabel,
          cancelLabel: opts?.cancelLabel,
          destructive: opts?.destructive,
          resolve,
        });
      }),
    []
  );

  const ConfirmDialog = state ? (
    <AlertDialog
      open={state.open}
      onOpenChange={(o) => {
        if (!o) {
          state.resolve?.(false);
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
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => {
              state.resolve?.(false);
              setState(null);
            }}
          >
            {state.cancelLabel ?? "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            className={state.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            onClick={() => {
              state.resolve?.(true);
              setState(null);
            }}
          >
            {state.confirmLabel ?? "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : null;

  return { confirm, ConfirmDialog };
}