import * as React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: unknown) {
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", err);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 p-8 text-center">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground max-w-md">
            {this.state.message || "An unexpected error occurred."}
          </p>
          <div className="flex gap-2">
            <Button onClick={() => this.setState({ hasError: false, message: "" })}>Try again</Button>
            <Button asChild variant="outline">
              <Link to="/">Go home</Link>
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
