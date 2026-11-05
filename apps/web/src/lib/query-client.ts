import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api-error";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) =>
        failureCount < 3 &&
        !(
          error instanceof ApiError &&
          error.status !== undefined &&
          error.status >= 400 &&
          error.status < 500
        ),
    },
  },
});
