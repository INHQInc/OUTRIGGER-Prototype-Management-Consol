/** Git integration types. Provider-agnostic surface; GitHub is the first impl. */

export interface RepoRef {
  owner: string;
  repo: string;
}

export interface RepoInfo extends RepoRef {
  defaultBranch: string;
  private: boolean;
  htmlUrl: string;
  permissions?: { push?: boolean; pull?: boolean; admin?: boolean };
}

/** A single repository pointer. */
export interface RepoConfig {
  provider: "github";
  owner: string;
  repo: string;
  /** Branch prototype branches are cut from / PR'd into. */
  baseBranch: string;
}

/**
 * Where a winner integrates, relative to the feature repo:
 *   same     — the feature repo IS the source (native flow: PR to base = ships)
 *   repo     — a different GitHub repo (winner PR'd there)
 *   external — read-only / non-GitHub source (e.g. Outrigger Azure) → handoff, no push
 */
export type SourceMode = "same" | "repo" | "external";

/** Per-site binding: where prototypes deploy from, and where winners integrate. */
export interface SiteRepoBinding {
  /**
   * Where prototypes live as branches. Each prototype branch builds a
   * self-contained variation at `artifactPath` (default dist/variation.js) that
   * the console pulls as the version's injectable code.
   */
  feature: RepoConfig & { branchPrefix: string; artifactPath?: string };
  sourceMode: SourceMode;
  /** Present only when sourceMode === "repo". */
  source?: RepoConfig;
}

/**
 * A repo registered at the BRAND (org) level. The brand registers as many as it
 * wants; each prototype picks one (+ branch). One repo is the default offered
 * at prototype creation.
 */
export interface OrgRepo {
  id: string;          // `${orgId}:${fullName}`
  orgId: string;
  fullName: string;    // owner/repo
  baseBranch: string;
  artifactPath: string; // built variation path on prototype branches
  isDefault: boolean;
}

export interface PullRequestResult {
  number: number;
  url: string;
  branch: string;
}
