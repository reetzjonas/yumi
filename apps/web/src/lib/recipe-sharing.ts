import { formatDate } from "@/lib/i18n";

export function formatShareDate(value: string) {
  return formatDate(new Date(value), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function shareUrl(token: string) {
  return new URL(`/share/${token}`, window.location.origin).href;
}
