/* lucide-react v1 removed brand marks; minimal neutral stand-ins used for connection buttons. */
import { GitBranch } from "lucide-react";

export const GithubIcon = GitBranch;

export function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="2.5" width="19" height="19" rx="4" />
      <path d="M7.5 10.5v6M7.5 7.5v.01M11.5 16.5v-6M11.5 13c0-1.6 1-2.6 2.4-2.6 1.5 0 2.1 1 2.1 2.6v3.5" />
    </svg>
  );
}
