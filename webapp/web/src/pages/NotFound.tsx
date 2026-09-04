import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="min-h-[60vh] flex flex-col items-center justify-center gap-4 p-8 text-center max-w-lg mx-auto"
    >
      <div className="text-6xl font-black tracking-tight">404</div>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">
        The page you are looking for does not exist or was moved. Try one of these instead.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link to="/">Go home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/jobs">Browse jobs</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link to="/fetch">Try Fetch</Link>
        </Button>
      </div>
    </motion.div>
  );
}
